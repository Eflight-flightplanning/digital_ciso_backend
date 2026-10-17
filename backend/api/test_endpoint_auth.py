"""Every routed endpoint must reject anonymous callers unless explicitly public.

Guards against a new view silently shipping without authentication.
"""
import re

import pytest
from django.urls import URLPattern, URLResolver, get_resolver
from rest_framework.test import APIClient

PUBLIC = (
    r"^health/",
    r"^admin",  # Django admin: redirects to its own login page
    r"^api/v1/tokens$",
    r"^api/v1/tokens/refresh$",
    r"^api/v1/users$",  # POST = self-registration (throttled / domain-restricted)
    r"^api/v1/saml",
    r"^api/v1/social",
    r"^api/v1/mfa",
)


def _walk(patterns, prefix=""):
    for p in patterns:
        route = prefix + str(p.pattern)
        if isinstance(p, URLResolver):
            yield from _walk(p.url_patterns, route)
        elif isinstance(p, URLPattern):
            yield route


def _concrete(route: str) -> str | None:
    route = re.sub(r"\(\?P<\w+>[^)]*\)", "00000000-0000-0000-0000-000000000000", route)
    route = route.replace("^", "").replace("$", "").replace("\Z", "")
    return None if "<" in route or "(" in route else "/" + route.lstrip("/")


def _routes():
    seen = set()
    for r in _walk(get_resolver().url_patterns):
        url = _concrete(r)
        if url and url not in seen:
            seen.add(url)
            yield url


@pytest.mark.django_db
@pytest.mark.parametrize("url", sorted(_routes()))
def test_anonymous_requests_are_rejected(url):
    if any(re.match(p, url.lstrip("/")) for p in PUBLIC):
        pytest.skip("explicitly public")
    client = APIClient()
    for method in ("get", "post", "patch", "delete"):
        resp = getattr(client, method)(url, format="json", HTTP_HOST="localhost")
        assert resp.status_code in (401, 403, 404, 405), (
            f"{method.upper()} {url} returned {resp.status_code} to an anonymous caller"
        )
