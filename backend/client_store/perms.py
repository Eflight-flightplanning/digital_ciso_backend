"""Thin lazy links to the platform's sign-in and membership, so this app stays testable by itself."""


def resolve_tenant_id(request):
    from api.v1.jira_views import resolve_tenant

    tenant = resolve_tenant(request)
    return tenant.id if tenant else None


def is_member(user, tenant_id) -> bool:
    from api.models import Membership

    if not user or not getattr(user, "is_authenticated", False):
        return False
    return Membership.objects.filter(user_id=user.id, tenant_id=tenant_id).exists()


def can_delete(request) -> bool:
    from api.rbac.permissions import HasPermissions, Permissions

    class _View:
        required_permissions = [Permissions.MANAGE_SCANS]

    return HasPermissions().has_permission(request, _View())
