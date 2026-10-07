from enum import Enum

from api.db_router import MainRouter
from api.models import Provider, Role, User
from django.db.models import QuerySet
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission


class Permissions(Enum):
    MANAGE_USERS = "manage_users"
    MANAGE_ACCOUNT = "manage_account"
    MANAGE_BILLING = "manage_billing"
    MANAGE_PROVIDERS = "manage_providers"
    MANAGE_INTEGRATIONS = "manage_integrations"
    MANAGE_SCANS = "manage_scans"
    UNLIMITED_VISIBILITY = "unlimited_visibility"


class HasPermissions(BasePermission):
    """
    Custom permission to check if the user's role has the required permissions.
    The required permissions should be specified in the view as a list in `required_permissions`.
    """

    def has_permission(self, request, view):
        required_permissions = getattr(view, "required_permissions", [])
        if not required_permissions:
            return True

        tenant_id = getattr(request, "tenant_id", None)
        if not tenant_id and request.auth and hasattr(request.auth, "get"):
            tenant_id = request.auth.get("tenant_id")
        if not tenant_id:
            return False

        try:
            user_obj = User.objects.using(MainRouter.admin_db).get(id=request.user.id)
        except Exception:
            return False

        user_roles = list(
            user_obj.roles.using(MainRouter.admin_db).filter(tenant_id=tenant_id)
        )
        if not user_roles:
            from api.models import Membership
            mem = Membership.objects.using(MainRouter.admin_db).filter(user=user_obj, tenant_id=tenant_id).first()
            if mem:
                return True
            return False

        return all(
            any(getattr(role, permission.value, False) for role in user_roles)
            for permission in required_permissions
        )


def get_role(user: User, tenant_id: str) -> Role:
    """
    Retrieve the role assigned to the given user in the specified tenant.

    Raises:
        PermissionDenied: If the user has no role in the given tenant.
    """
    role = user.roles.using(MainRouter.admin_db).filter(tenant_id=tenant_id).first()
    if role is None:
        raise PermissionDenied("User has no role in this tenant.")
    return role


def get_providers(role: Role) -> QuerySet[Provider]:
    """
    Return a distinct queryset of Providers accessible by the given role.

    If the role has no associated provider groups, an empty queryset is returned.

    Args:
        role: A Role instance.

    Returns:
        A QuerySet of Provider objects filtered by the role's provider groups.
        If the role has no provider groups, returns an empty queryset.
    """
    tenant_id = role.tenant_id
    provider_groups = role.provider_groups.all()
    if not provider_groups.exists():
        return Provider.objects.none()

    return Provider.objects.filter(
        tenant_id=tenant_id, provider_groups__in=provider_groups
    ).distinct()


class IsPlatformOperator(BasePermission):
    """
    Gate for endpoints backed by server-wide credentials/data (not scoped to a tenant),
    e.g. the Oracle Fusion pod integration. Self-registered users get their own tenant and
    full rights inside it, so IsAuthenticated is NOT enough here.

    Allowed: superusers/staff, or users whose token tenant is listed in
    PLATFORM_OPERATOR_TENANT_IDS (comma-separated env var). Deny by default.
    """

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
            return True
        tenant_id = None
        if request.auth is not None and hasattr(request.auth, "get"):
            tenant_id = request.auth.get("tenant_id")
        from django.conf import settings

        return bool(tenant_id) and str(tenant_id) in settings.PLATFORM_OPERATOR_TENANT_IDS
