import ipaddress
import logging
import time

from config.custom_logging import BackendLogger
from django.core.handlers.asgi import ASGIRequest
from django.conf import settings
from django.db import connections
from django.http import HttpResponseForbidden


class CloseDBConnectionsMiddleware:
    """
    Close request-scoped DB connections at the end of each ASGI request.

    Under the ASGI worker, connections opened by sync views are not released
    by Django's normal request-boundary cleanup, so they accumulate idle until
    Postgres runs out of slots. Only ASGI requests are handled; the sync WSGI
    test client manages its own connections and must be left alone.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            return self.get_response(request)
        finally:
            if isinstance(request, ASGIRequest):
                for conn in connections.all(initialized_only=True):
                    if not conn.in_atomic_block:
                        conn.close_if_unusable_or_obsolete()


def extract_auth_info(request) -> dict:
    if getattr(request, "auth", None) is not None:
        tenant_id = request.auth.get("tenant_id", "N/A")
        user_id = request.auth.get("sub", "N/A")
        api_key_prefix = request.auth.get("api_key_prefix", "N/A")
    else:
        tenant_id, user_id, api_key_prefix = "N/A", "N/A", "N/A"
    return {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "api_key_prefix": api_key_prefix,
    }


class APILoggingMiddleware:
    """
    Middleware for logging API requests.

    This middleware logs details of API requests, including the typical request metadata among other useful information.

    Args:
        get_response (Callable): A callable to get the response, typically the next middleware or view.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.logger = logging.getLogger(BackendLogger.API)

    def __call__(self, request):
        request_start_time = time.time()

        response = self.get_response(request)
        duration = time.time() - request_start_time
        auth_info = extract_auth_info(request)
        self.logger.info(
            "",
            extra={
                "user_id": auth_info["user_id"],
                "tenant_id": auth_info["tenant_id"],
                "api_key_prefix": auth_info["api_key_prefix"],
                "method": request.method,
                "path": request.path,
                "query_params": request.GET.dict(),
                "status_code": response.status_code,
                "duration": duration,
            },
        )

        return response


class AdminIPAllowlistMiddleware:
    """Restrict the Django admin to ``settings.ADMIN_ALLOWED_IPS`` (IPs/CIDRs).

    No-op when the list is empty. Uses REMOTE_ADDR only, so make sure the
    reverse proxy rewrites it (never trust a client-supplied X-Forwarded-For).
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.networks = []
        for entry in getattr(settings, "ADMIN_ALLOWED_IPS", []):
            try:
                self.networks.append(ipaddress.ip_network(entry.strip(), strict=False))
            except ValueError:
                logging.getLogger(BackendLogger.API).error("Invalid ADMIN_ALLOWED_IPS entry: %r", entry)

    def __call__(self, request):
        if self.networks and request.path.startswith("/" + settings.ADMIN_URL_PATH):
            try:
                ip = ipaddress.ip_address(request.META.get("REMOTE_ADDR", ""))
            except ValueError:
                return HttpResponseForbidden()
            if not any(ip in net for net in self.networks):
                return HttpResponseForbidden()
        return self.get_response(request)


class ApiSecurityHeadersMiddleware:
    """Locked-down CSP / caching headers for JSON API responses."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        ctype = response.get("Content-Type", "")
        if "json" in ctype:
            response.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
            response.setdefault("Cache-Control", "no-store")
        elif ctype.startswith("text/html") and request.path.startswith("/api/"):
            # e.g. the executive report: no scripts, no remote loads except images.
            response.setdefault(
                "Content-Security-Policy",
                "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; "
                "script-src 'unsafe-hashes' 'sha256-MguIPR6qNR8D3B+eAlK+bIRTZe8t3wkOY4B/56Me9FU='; frame-ancestors 'none'",
            )
        return response
