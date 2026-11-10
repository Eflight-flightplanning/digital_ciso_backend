"""Tells PostgreSQL which client the current work belongs to.

Row-level security rules read these settings. With neither set, the rules return no rows, so
code that forgets to choose a client sees nothing rather than everyone's data.

Three places choose a client:
  - CombinedJWTOrAPIKeyAuthentication, from the signed token of each request
  - TenantScopeMiddleware, which clears the choice when the request ends
  - tenant_scope(), for background threads and management commands
"""
import uuid
from contextlib import contextmanager

from django.db import connection

TENANT_VAR = "api.tenant_id"
USER_VAR = "api.user_id"
SET_QUERY = "SELECT set_config(%s, %s, FALSE)"
# Matches no client. An empty value would make the older rules raise an error instead.
NO_CLIENT = "00000000-0000-0000-0000-000000000000"


def _applies() -> bool:
    return connection.vendor == "postgresql"


def bind_tenant(tenant_id, user_id=None) -> None:
    """Scope this connection until clear_tenant(). The ids must come from a trusted source."""
    if not _applies():
        return
    with connection.cursor() as cursor:
        cursor.execute(SET_QUERY, [TENANT_VAR, str(uuid.UUID(str(tenant_id)))])
        if user_id:
            cursor.execute(SET_QUERY, [USER_VAR, str(uuid.UUID(str(user_id)))])


def clear_tenant() -> None:
    if not _applies() or connection.connection is None:
        return
    if connection.in_atomic_block and connection.needs_rollback:
        return  # Django closes out this transaction, and the setting goes with it
    with connection.cursor() as cursor:
        cursor.execute(SET_QUERY, [TENANT_VAR, NO_CLIENT])
        cursor.execute(SET_QUERY, [USER_VAR, ""])


@contextmanager
def tenant_scope(tenant_id):
    bind_tenant(tenant_id)
    try:
        yield
    finally:
        clear_tenant()


class TenantScopeMiddleware:
    """A reused connection must never carry one request's client into the next request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            return self.get_response(request)
        finally:
            clear_tenant()
