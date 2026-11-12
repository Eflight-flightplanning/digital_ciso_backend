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


class ReadOnlyRoleMiddleware:
    """
    Block every write (POST/PUT/PATCH/DELETE) to the API for read-only users.

    Read-only is decided per tenant by ``api.rbac.read_only.user_is_read_only``
    (auditor / viewer / read-only roles, or roles without any manage_* permission).
    Enforced here, once, instead of in each view, so a view that forgets
    ``required_permissions`` cannot become a write path for auditors.
    """

    SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "TRACE"})

    # (method or "*", regex) pairs read-only users may still call.
    ALLOWED = (
        ("POST", r"^/api/v1/tokens(/(refresh|logout|switch|first-login-password-change))?/?$"),
        ("POST", r"^/api/v1/users/change-password/?$"),
        ("POST", r"^/api/v1/invitations/accept/?$"),
        # Read-only question answering; persists nothing.
        ("POST", r"^/api/v1/ai/advisor/query/?$"),
    )

    def __init__(self, get_response):
        import re

        self.get_response = get_response
        self._allowed = [(m, re.compile(p)) for m, p in self.ALLOWED]
        self._self_patch = re.compile(r"^/api/v1/users/(?P<pk>[0-9a-fA-F-]{36})/?$")

    def _is_allowed(self, request, user) -> bool:
        path = request.path
        for method, pattern in self._allowed:
            if (method == "*" or method == request.method) and pattern.match(path):
                return True
        # Users may edit their own profile (name / password).
        m = self._self_patch.match(path)
        if m and request.method == "PATCH" and m.group("pk").lower() == str(user.id).lower():
            return True
        return False

    def _authenticate(self, request):
        from api.authentication import CombinedJWTOrAPIKeyAuthentication
        from rest_framework.request import Request

        header = request.META.get("HTTP_AUTHORIZATION", "")
        if not header:
            return None, None
        try:
            result = CombinedJWTOrAPIKeyAuthentication().authenticate(Request(request))
        except Exception:
            # Invalid / expired credentials: let the view answer with 401.
            return None, None
        if not result:
            return None, None
        user, auth = result
        tenant_id = auth.get("tenant_id") if hasattr(auth, "get") else None
        return user, tenant_id

    def __call__(self, request):
        if request.method in self.SAFE_METHODS or not request.path.startswith("/api/"):
            return self.get_response(request)

        user, tenant_id = self._authenticate(request)
        if user is None or not tenant_id or self._is_allowed(request, user):
            return self.get_response(request)

        from api.rbac.read_only import user_is_read_only

        try:
            read_only = user_is_read_only(user, tenant_id)
        except Exception:
            logging.getLogger(BackendLogger.API).exception("Read-only role check failed")
            # Fail closed: an error deciding permissions must not allow a write.
            read_only = True

        if read_only:
            from django.http import JsonResponse

            return JsonResponse(
                {
                    "errors": [
                        {
                            "status": "403",
                            "code": "read_only_account",
                            "detail": "Your account is read-only. You can view data but cannot create, change or delete anything.",
                        }
                    ]
                },
                status=403,
            )
        return self.get_response(request)
