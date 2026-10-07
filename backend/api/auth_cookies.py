"""
HttpOnly cookie transport for the JWT refresh token.

The browser app never sees the refresh token: it is set as an HttpOnly,
SameSite=Strict cookie scoped to the token endpoints only, so XSS cannot read
it and it is never attached to ordinary API calls. The short-lived access
token is returned in the JSON body and held in memory by the SPA.

Programmatic clients (scripts, API keys) keep the classic body-based flow;
the cookie flow is opt-in via the ``X-Auth-Mode: cookie`` request header.
Because that header is non-simple, a cross-site page cannot send it without a
CORS preflight, which the origin allowlist rejects (CSRF defence in depth on
top of SameSite=Strict).
"""

from django.conf import settings

AUTH_MODE_HEADER = "X-Auth-Mode"
AUTH_MODE_COOKIE = "cookie"


def wants_cookie_auth(request) -> bool:
    return request.headers.get(AUTH_MODE_HEADER, "").lower() == AUTH_MODE_COOKIE


def get_refresh_cookie(request) -> str | None:
    return request.COOKIES.get(settings.AUTH_REFRESH_COOKIE_NAME)


def set_refresh_cookie(response, request, refresh: str) -> None:
    response.set_cookie(
        settings.AUTH_REFRESH_COOKIE_NAME,
        refresh,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        path=settings.AUTH_REFRESH_COOKIE_PATH,
        secure=settings.AUTH_COOKIE_SECURE or request.is_secure(),
        httponly=True,
        samesite="Strict",
    )


def clear_refresh_cookie(response) -> None:
    response.delete_cookie(
        settings.AUTH_REFRESH_COOKIE_NAME,
        path=settings.AUTH_REFRESH_COOKIE_PATH,
        samesite="Strict",
    )


def move_refresh_to_cookie(response, request) -> None:
    """If the response carries a refresh token, move it from the JSON body into the cookie."""
    data = getattr(response, "data", None)
    if not isinstance(data, dict):
        return
    attributes = data.get("attributes")
    if not isinstance(attributes, dict):
        return
    refresh = attributes.pop("refresh", None)
    if refresh:
        set_refresh_cookie(response, request, refresh)
