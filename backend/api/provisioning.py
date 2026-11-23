"""Creating a customer's tenant for the Digital CISO admin panel (onboarding, phase 1).

  POST   /api/v1/provisioning/tenants                                 {"name": "Acme", "external_id": "<panel customer id>"}
  DELETE /api/v1/provisioning/tenants/<tenant id>?external_id=<panel customer id>   offboarding (phase 4)

One call does what a person used to do by hand in this app:
  1. create the tenant (its client storage follows from the Tenant post_save signal),
  2. create a service account for the admin panel in it, with a role that can manage cloud
     accounts, scans and integrations but not users, billing or the account itself,
  3. issue that account an API key, returned once in the response and never stored in plain text.

Calling again with the same external_id finds the same tenant and issues a fresh key (the old
panel keys are revoked), so a retry after a lost answer never makes a second tenant.

Who may call it: only the admin panel. It signs in with its Azure managed identity and sends a
Microsoft Entra access token for this app. The token must be for this app (audience), from our
Entra directory (issuer), carry the app role PROVISIONING_REQUIRED_ROLE, and come from one of the
identities in PROVISIONING_ALLOWED_CALLERS. User sign-ins and tenant API keys are not accepted.
For local development only (DEBUG on), PROVISIONING_DEV_TOKEN may stand in for the Entra token.

Offboarding deletes only a tenant this endpoint made for that same panel customer: its panel keys
stop working at once, its members and memberships go, and the existing background job deletes the
rest (cloud accounts and their Key Vault keys, scans, findings, the graph database, the client storage).

The API key is never logged. Only what identifies the tenant is.
"""
import hmac
import logging
import uuid
from datetime import timedelta
from functools import lru_cache

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

logger = logging.getLogger("api.provisioning")

PANEL_ROLE_NAME = "Digital CISO admin panel"  # must not contain a read-only marker (api/rbac/read_only.py)
PANEL_KEY_PREFIX = "digital-ciso-panel"
SERVICE_EMAIL_DOMAIN = "provisioning.digitalciso.invalid"  # .invalid never receives mail or a sign-in
PANEL_PERMISSIONS = {
    "manage_users": False, "manage_account": False, "manage_billing": False,
    "manage_providers": True, "manage_integrations": True, "manage_scans": True,
    "unlimited_visibility": True,
}


# ---------- who is calling ----------

class ProvisioningCaller:
    """The admin panel, signed in with its managed identity. Not a user of this app."""

    is_authenticated = True
    is_anonymous = False
    is_active = True

    def __init__(self, caller_id: str, how: str):
        self.id = caller_id
        self.how = how

    def __str__(self):
        return f"provisioning:{self.id}"


@lru_cache(maxsize=4)
def _jwks_client(directory_id: str):
    from jwt import PyJWKClient

    return PyJWKClient(f"https://login.microsoftonline.com/{directory_id}/discovery/v2.0/keys", cache_keys=True)


def _setting(name, default=None):
    return getattr(settings, name, default)


class ProvisioningAuthentication(BaseAuthentication):
    """A Microsoft Entra app token from an allowed identity (or the local dev token)."""

    def authenticate_header(self, request):
        return 'Bearer realm="provisioning"'

    def authenticate(self, request):
        auth = get_authorization_header(request).split()
        if not auth or auth[0].lower() != b"bearer":
            return None
        if len(auth) != 2:
            raise AuthenticationFailed("Send one bearer token.")
        token = auth[1].decode("ascii", errors="ignore")

        dev = _setting("PROVISIONING_DEV_TOKEN") or ""
        if dev and settings.DEBUG and len(dev) >= 32 and hmac.compare_digest(token.encode(), dev.encode()):
            return ProvisioningCaller("local-dev", "dev-token"), {"caller": "local-dev"}

        return self._entra(token)

    def _entra(self, token: str):
        import jwt

        directory = _setting("PROVISIONING_ENTRA_TENANT_ID") or ""
        audience = _setting("PROVISIONING_AUDIENCE") or ""
        allowed = {str(x).lower() for x in (_setting("PROVISIONING_ALLOWED_CALLERS") or []) if str(x).strip()}
        role = _setting("PROVISIONING_REQUIRED_ROLE") or "Tenants.Provision"
        if not (directory and audience and allowed):
            raise AuthenticationFailed("Provisioning is not set up on this server.")
        try:
            signing_key = _jwks_client(directory).get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token, signing_key.key, algorithms=["RS256"], audience=audience,
                issuer=[f"https://login.microsoftonline.com/{directory}/v2.0", f"https://sts.windows.net/{directory}/"],
                options={"require": ["exp", "iat", "aud", "iss", "oid"]}, leeway=60,
            )
        except Exception:  # noqa: BLE001 - any token problem is the same answer to the caller
            raise AuthenticationFailed("The token was not accepted.") from None
        caller = str(claims.get("oid", "")).lower()
        if claims.get("tid", directory).lower() != directory.lower():
            raise AuthenticationFailed("The token was not accepted.")
        if "scp" in claims:  # a user's delegated token: only the panel's own identity may provision
            raise AuthenticationFailed("Only the admin panel's identity may do this.")
        if caller not in allowed or role not in (claims.get("roles") or []):
            raise AuthenticationFailed("This identity may not create tenants.")
        return ProvisioningCaller(caller, "entra"), {"caller": caller}


class IsProvisioningCaller(BasePermission):
    def has_permission(self, request, view):
        return isinstance(request.user, ProvisioningCaller)


class ProvisioningThrottle(SimpleRateThrottle):
    scope = "provisioning"
    rate = "30/hour"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": getattr(request.user, "id", "anon")}


# ---------- creating the tenant ----------

def service_email(external_id) -> str:
    return f"panel+{uuid.UUID(str(external_id))}@{SERVICE_EMAIL_DOMAIN}"


def _issue_key(tenant_id, user, alias: str):
    from api.models import TenantAPIKey

    days = int(_setting("PROVISIONING_API_KEY_DAYS", 365) or 365)
    stamp = timezone.now().strftime("%Y%m%d%H%M%S%f")
    key = TenantAPIKey(name=f"{PANEL_KEY_PREFIX} {stamp}", tenant_id=tenant_id, entity=user,
                       expiry_date=timezone.now() + timedelta(days=days))
    key.save(using=alias)
    return key, TenantAPIKey.objects.assign_api_key(key)


def provision_tenant(name: str, external_id) -> dict:
    """Create (or find again) the tenant for one admin-panel customer and give the panel a new key."""
    from django.db import IntegrityError

    try:
        return _provision_once(name, external_id)
    except IntegrityError:
        # Two calls for the same customer at once: the other one made the service account and its
        # tenant first, and this one's work was rolled back. Find theirs and issue a key for it.
        return _provision_once(name, external_id)


def _provision_once(name: str, external_id) -> dict:
    from api.db_router import MainRouter
    from api.models import Membership, Role, Tenant, TenantAPIKey, User, UserRoleRelationship

    alias = MainRouter.admin_db
    email = service_email(external_id)
    with transaction.atomic(using=alias):
        user = User.objects.using(alias).select_for_update().filter(email=email).first()
        membership = user and Membership.objects.using(alias).filter(user=user).select_related("tenant").first()
        if membership:
            tenant, created = membership.tenant, False
            revoked = TenantAPIKey.objects.using(alias).filter(
                tenant_id=tenant.id, entity=user, revoked=False).update(revoked=True)
        else:
            tenant, created, revoked = Tenant.objects.using(alias).create(name=name), True, 0
            if user is None:
                user = User(email=email, name="Digital CISO admin panel", company_name="Digital CISO",
                            is_active=True, must_change_password=False)
                user.set_unusable_password()  # it signs in only with its API key
                user.save(using=alias)
            Membership.objects.using(alias).create(user=user, tenant=tenant, role=Membership.RoleChoices.MEMBER)
            role = Role.objects.using(alias).create(name=PANEL_ROLE_NAME, tenant_id=tenant.id, **PANEL_PERMISSIONS)
            UserRoleRelationship.objects.using(alias).create(user=user, role=role, tenant_id=tenant.id)
        key, raw = _issue_key(tenant.id, user, alias)
    logger.info("provisioning: %s tenant %s for panel customer %s (keys revoked: %s)",
                "created" if created else "found", tenant.id, external_id, revoked)
    return {"tenant_id": str(tenant.id), "name": tenant.name, "created": created,
            "api_key": raw, "api_key_expires_at": key.expiry_date.isoformat()}


# ---------- the endpoint ----------

class ProvisionTenantSerializer(serializers.Serializer):
    name = serializers.CharField(min_length=3, max_length=100)
    external_id = serializers.UUIDField()

    def validate_name(self, value):
        value = " ".join(value.split())
        if len(value) < 3:
            raise serializers.ValidationError("Use at least 3 characters.")
        return value


class ProvisionTenantView(APIView):
    authentication_classes = [ProvisioningAuthentication]
    permission_classes = [IsProvisioningCaller]
    throttle_classes = [ProvisioningThrottle]
    # Plain JSON in and out: the admin panel is the only caller.
    from rest_framework.parsers import JSONParser
    from rest_framework.renderers import JSONRenderer
    parser_classes = [JSONParser]
    renderer_classes = [JSONRenderer]

    def post(self, request):
        ser = ProvisionTenantSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = provision_tenant(ser.validated_data["name"], ser.validated_data["external_id"])
        response = Response(result, status=status.HTTP_201_CREATED if result["created"] else status.HTTP_200_OK)
        response["Cache-Control"] = "no-store"  # the answer holds an API key
        return response


def offboard_tenant(tenant_id, external_id) -> bool:
    """Delete a tenant made for this panel customer. False when there is no such tenant."""
    from api.db_router import MainRouter
    from api.models import Membership, TenantAPIKey, User

    alias = MainRouter.admin_db
    tenant_id = uuid.UUID(str(tenant_id))
    with transaction.atomic(using=alias):
        user = User.objects.using(alias).filter(email=service_email(external_id)).first()
        if user is None or not Membership.objects.using(alias).filter(user=user, tenant_id=tenant_id).exists():
            return False
        TenantAPIKey.objects.using(alias).filter(tenant_id=tenant_id).update(revoked=True)
        member_ids = set(Membership.objects.using(alias).filter(tenant_id=tenant_id).values_list("user_id", flat=True))
        Membership.objects.using(alias).filter(tenant_id=tenant_id).delete()
        if member_ids:  # people who belonged only to this customer, and the panel's service account
            User.objects.using(alias).filter(id__in=member_ids, membership__isnull=True).delete()
    from tasks.tasks import delete_tenant_task

    transaction.on_commit(lambda: delete_tenant_task.apply_async(kwargs={"tenant_id": str(tenant_id)}), using=alias)
    logger.info("provisioning: offboarding tenant %s for panel customer %s", tenant_id, external_id)
    return True


class ProvisionedTenantView(APIView):
    authentication_classes = [ProvisioningAuthentication]
    permission_classes = [IsProvisioningCaller]
    throttle_classes = [ProvisioningThrottle]
    from rest_framework.renderers import JSONRenderer
    renderer_classes = [JSONRenderer]

    def delete(self, request, tenant_id):
        try:
            external_id = uuid.UUID(request.query_params.get("external_id", ""))
        except ValueError:
            return Response({"external_id": "Send the panel's customer id."}, status=status.HTTP_400_BAD_REQUEST)
        if not offboard_tenant(tenant_id, external_id):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response({"tenant_id": str(tenant_id), "deleting": True}, status=status.HTTP_202_ACCEPTED)
