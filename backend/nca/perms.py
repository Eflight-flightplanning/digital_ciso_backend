"""Thin lazy adapters over the platform's RBAC / tenant helpers.

Importing ``api`` lazily keeps the nca app importable (and testable) without the whole
platform's models and PostgreSQL-specific migrations.
"""
from enum import Enum

from rest_framework.permissions import BasePermission


class Permissions(Enum):
    MANAGE_PROVIDERS = "manage_providers"
    MANAGE_SCANS = "manage_scans"


def resolve_tenant(request):
    from api.v1.jira_views import resolve_tenant as _resolve

    return _resolve(request)


class HasPermissions(BasePermission):
    """Delegates to api.rbac.permissions.HasPermissions using the view's required_permissions."""

    def has_permission(self, request, view):
        required = getattr(view, "required_permissions", [])
        if not required:
            return True
        from api.rbac.permissions import HasPermissions as Platform, Permissions as P

        class _View:
            required_permissions = [P(p.value) for p in required]

        return Platform().has_permission(request, _View())
