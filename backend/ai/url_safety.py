"""
SSRF guard for tenant-supplied LLM endpoint URLs.

Tenant admins (including self-registered users, who administer their own tenant) can point the
backend at an arbitrary base_url. Without validation that lets them make the server call cloud
metadata (169.254.169.254), loopback services, or the VM's private network (Postgres, Neo4j).

Rules: http/https only, no credentials in the URL, and the host must resolve ONLY to public
addresses, unless it is the operator-configured endpoint (VLLM_AZURE_ENDPOINT) or listed in
LLM_ALLOWED_HOSTS (comma-separated). Redirects are not followed by the providers.
"""

import ipaddress
import os
import socket
from urllib.parse import urlparse

from django.conf import settings


class UnsafeURLError(ValueError):
    pass


def _allowed_hosts() -> set[str]:
    hosts = {h.strip().lower() for h in os.getenv("LLM_ALLOWED_HOSTS", "").split(",") if h.strip()}
    configured = getattr(settings, "VLLM_AZURE_ENDPOINT", "") or ""
    if configured:
        configured_host = urlparse(configured).hostname
        if configured_host:
            hosts.add(configured_host.lower())
    return hosts


def validate_outbound_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        raise UnsafeURLError("URL must start with http:// or https://")
    if parsed.username or parsed.password:
        raise UnsafeURLError("Credentials in the URL are not allowed.")
    host = (parsed.hostname or "").lower()
    if not host:
        raise UnsafeURLError("URL has no host.")
    if host in _allowed_hosts():
        return url

    try:
        infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror:
        raise UnsafeURLError("Host could not be resolved.") from None
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise UnsafeURLError(
                "Host resolves to a private, loopback or link-local address. "
                "Ask an administrator to add it to LLM_ALLOWED_HOSTS."
            )
    return url
