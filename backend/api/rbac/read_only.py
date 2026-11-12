"""
Read-only (auditor / viewer) role support.

A user is *read-only* in a tenant when none of their roles there can write.
A role is read-only when either:
  * its name marks it as read-only (auditor / viewer / read-only), in which case
    any write flags stored on it are ignored, or
  * it grants none of the write permissions (manage_*).

Read-only users are blocked from every non-safe HTTP method by
``api.middleware.ReadOnlyRoleMiddleware`` (except a small allowlist such as
login, logout and changing their own password), so the guarantee does not
depend on each view remembering to declare ``required_permissions``.
"""

from api.db_router import MainRouter

READ_ONLY_NAME_MARKERS = ("read-only", "read only", "readonly", "auditor", "viewer")

WRITE_PERMISSION_FIELDS = (
    "manage_users",
    "manage_account",
    "manage_billing",
    "manage_providers",
    "manage_integrations",
    "manage_scans",
)


def role_name_is_read_only(name) -> bool:
    n = (name or "").lower()
    return any(marker in n for marker in READ_ONLY_NAME_MARKERS)


def role_is_read_only(role) -> bool:
    if role is None:
        return True
    if role_name_is_read_only(getattr(role, "name", "")):
        return True
    return not any(getattr(role, f, False) for f in WRITE_PERMISSION_FIELDS)


def role_grants(role, permission_field: str) -> bool:
    """Whether ``role`` grants ``permission_field``; read-only-named roles grant no write permission."""
    if permission_field in WRITE_PERMISSION_FIELDS and role_name_is_read_only(
        getattr(role, "name", "")
    ):
        return False
    return bool(getattr(role, permission_field, False))


def _is_owner(user, tenant_id) -> bool:
    from api.models import Membership

    return (
        Membership.objects.using(MainRouter.admin_db)
        .filter(user=user, tenant_id=tenant_id, role=Membership.RoleChoices.OWNER)
        .exists()
    )


def user_is_read_only(user, tenant_id) -> bool:
    """True when ``user`` may only read in ``tenant_id``."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
        return False
    if not tenant_id:
        return False
    if _is_owner(user, tenant_id):
        return False
    roles = list(user.roles.using(MainRouter.admin_db).filter(tenant_id=tenant_id))
    if not roles:
        # A non-owner member with no role has no write permissions.
        return True
    return all(role_is_read_only(r) for r in roles)


def effective_permissions(user, tenant_id) -> dict:
    """Effective permission flags for ``user`` in ``tenant_id`` (for the UI)."""
    fields = WRITE_PERMISSION_FIELDS + ("unlimited_visibility",)
    if not user or not tenant_id:
        return {f: False for f in fields}
    if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False) or _is_owner(
        user, tenant_id
    ):
        return {f: True for f in fields}
    roles = list(user.roles.using(MainRouter.admin_db).filter(tenant_id=tenant_id))
    return {f: any(role_grants(r, f) for r in roles) for f in fields}
