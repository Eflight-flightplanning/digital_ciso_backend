import re
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
            # A role-less member must not inherit every permission; only the
            # tenant OWNER is trusted without an explicit role.
            return bool(mem and mem.role == Membership.RoleChoices.OWNER)

        from api.rbac.read_only import role_grants

        return all(
            any(role_grants(role, permission.value) for role in user_roles)
            for permission in required_permissions
        )


def is_admin_or_owner(user: User, tenant_id: str) -> bool:
    """
    Check if a user is an administrator or owner in the given tenant.
    Superusers, staff, tenant owners, and users with unlimited_visibility
    or admin/owner roles return True.
    """
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
        return True
    try:
        from api.models import Membership
        mem = (
            Membership.objects.using(MainRouter.admin_db)
            .filter(user=user, tenant_id=tenant_id)
            .first()
        )
        if mem and mem.role == Membership.RoleChoices.OWNER:
            return True
    except Exception:
        pass
    try:
        from api.rbac.read_only import role_is_read_only

        roles = list(user.roles.using(MainRouter.admin_db).filter(tenant_id=tenant_id))
        for r in roles:
            # Read-only roles (e.g. "All Clouds Read-Only Auditor") may see everything
            # but are never admins, whatever their name or flags say.
            if role_is_read_only(r):
                continue
            if getattr(r, "unlimited_visibility", False):
                return True
            r_name = (getattr(r, "name", "") or "").lower()
            if "admin" in r_name or "owner" in r_name:
                return True
    except Exception:
        pass
    return False


def get_role(user: User, tenant_id: str) -> Role:
    """
    Retrieve the role assigned to the given user in the specified tenant.

    Raises:
        PermissionDenied: If the user has no role in the given tenant.
    """
    role = user.roles.using(MainRouter.admin_db).filter(tenant_id=tenant_id).first()
    if role is None:
        from api.models import Membership
        mem = (
            Membership.objects.using(MainRouter.admin_db)
            .filter(user=user, tenant_id=tenant_id)
            .first()
        )
        if mem and mem.role == Membership.RoleChoices.OWNER:
            admin_role = (
                Role.objects.using(MainRouter.admin_db)
                .filter(tenant_id=tenant_id, name__iexact="admin")
                .first()
            )
            if admin_role:
                return admin_role
            return Role(
                name="Admin",
                tenant_id=tenant_id,
                unlimited_visibility=True,
                manage_users=True,
                manage_scans=True,
                manage_providers=True,
            )
        raise PermissionDenied("User has no role in this tenant.")
    return _without_read_only_visibility(role)


def _without_read_only_visibility(role: Role) -> Role:
    """Read-only roles never have unlimited visibility.

    Roles created by older code were saved with unlimited_visibility=True whatever
    their name ("Azure CIS Read-Only Auditor" included), so a read-only account saw
    every cloud. Their visibility comes from provider groups or the clouds named in
    the role (get_providers); "All Clouds" read-only roles still see everything.
    """
    from api.rbac.read_only import role_name_is_read_only

    if getattr(role, "unlimited_visibility", False) and role_name_is_read_only(getattr(role, "name", "")):
        role.unlimited_visibility = False
    return role


def get_providers(role: Role) -> QuerySet[Provider]:
    """
    Return a distinct queryset of Providers accessible by the given role.

    Resolution order:
    1. If the role has associated provider groups, return providers within those groups.
    2. If the role has unlimited_visibility or is an admin/owner role, return all providers.
    3. Dynamically detect cloud provider tokens in role name (azure, oraclecloud/oci, oracle_saas, aws, gcp, kubernetes, etc.).
    4. If 'all' is explicitly in the role name, return all providers in the tenant.
    5. If no matches or provider groups, return empty queryset.
    """
    from api.rbac.read_only import role_name_is_read_only

    tenant_id = role.tenant_id
    role_name = (getattr(role, "name", "") or "").lower()
    read_only = role_name_is_read_only(role_name)

    # 1. Provider groups association
    provider_groups = role.provider_groups.all()
    if provider_groups.exists():
        return Provider.objects.filter(
            tenant_id=tenant_id, provider_groups__in=provider_groups
        ).distinct()

    # 2. Unlimited visibility / admin / all clouds
    if (
        (not read_only and (
            getattr(role, "unlimited_visibility", False)
            or "admin" in role_name
            or "owner" in role_name
        ))
        or "all clouds" in role_name
        or "all providers" in role_name
        or "fleet" in role_name
    ):
        return Provider.objects.filter(tenant_id=tenant_id)

    # 3. Dynamic cloud provider detection from role name
    detected_providers = []
    if "azure" in role_name:
        detected_providers.append("azure")
    if "oci" in role_name or "oraclecloud" in role_name:
        detected_providers.append("oraclecloud")
    if "oracle_saas" in role_name or "saas" in role_name or "fusion" in role_name:
        detected_providers.append("oracle_saas")
    if "aws" in role_name:
        detected_providers.append("aws")
    if "gcp" in role_name or "google" in role_name:
        detected_providers.append("gcp")
    if "kubernetes" in role_name or "k8s" in role_name:
        detected_providers.append("kubernetes")
    if "github" in role_name:
        detected_providers.append("github")
    if "m365" in role_name:
        detected_providers.append("m365")
    if "mongodbatlas" in role_name:
        detected_providers.append("mongodbatlas")
    if "iac" in role_name:
        detected_providers.append("iac")
    if "alibabacloud" in role_name or "alibaba" in role_name:
        detected_providers.append("alibabacloud")
    if "cloudflare" in role_name:
        detected_providers.append("cloudflare")

    if detected_providers:
        return Provider.objects.filter(
            tenant_id=tenant_id,
            provider__in=detected_providers,
        ).distinct()

    # 4. Explicit 'all' as a word in the role name (e.g. 'All Clouds Read-Only Auditor')
    if re.search(r"\ball\b", role_name):
        return Provider.objects.filter(tenant_id=tenant_id)

    return Provider.objects.none()


def visible_provider_types(user: User, tenant_id) -> set | None:
    """Provider types (azure, oraclecloud, oracle_saas, ...) the user's role may see.

    None means unrestricted (superusers, owners, admin roles). Same rule as the API
    viewsets: get_role() + get_providers().
    """
    if is_admin_or_owner(user, str(tenant_id)):
        return None
    role = get_role(user, str(tenant_id))
    if getattr(role, "unlimited_visibility", False):
        return None
    types = {
        str(p).lower()
        for p in get_providers(role).using(MainRouter.admin_db).values_list("provider", flat=True)
    }
    # Clouds named in the role count even before that provider is connected
    # (e.g. the Oracle SaaS dashboard works off its own connection settings).
    name = (getattr(role, "name", "") or "").lower()
    if "all clouds" in name or "all providers" in name or re.search(r"\ball\b", name):
        types.add("*")
    if "saas" in name or "fusion" in name:
        types.add("oracle_saas")
    return types


def can_view_provider_type(user: User, tenant_id, provider_type: str) -> bool:
    try:
        types = visible_provider_types(user, tenant_id)
    except PermissionDenied:
        return False
    return types is None or "*" in types or provider_type in types
