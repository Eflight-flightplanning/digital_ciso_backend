"""A fake identity domain API for tests: serves canned SCIM resources, never touches the network."""
from datetime import timedelta

from cis_checks.base import EXT_CAPABILITIES, EXT_MFA, EXT_USER, EXT_USER_STATE, iso, utc_now
from cis_checks.idcs_client import IdcsError


class FakeFusion:
    """Stands in for FusionClient. configured=False means "no Fusion pod", so the IDCS fallback is used."""

    def __init__(self, records=None, configured=True, error=None, roles=None, catalogue=None):
        self.records = records or []
        self.configured = configured
        self.error = error
        self.assignments = roles or []
        self.catalogue = catalogue  # None: the pod has no role catalogue (HTTP 404)

    def user_roles(self):
        return self.assignments

    def roles(self):
        if self.catalogue is None:
            from cis_checks.fusion_client import FusionError

            raise FusionError("No role catalogue on this pod (HTTP 404 on /hcmRestApi/scim/Roles)", 404)
        return self.catalogue, "/hcmRestApi/scim/Roles"

    def inactive_users(self, days):
        if self.error:
            raise self.error
        return self.records, {"data_load": 101, "report": 102}


NO_FUSION = FakeFusion(configured=False)


class FakeIdcs:
    configured = True

    def __init__(self, data=None, fail=()):
        self.data = data if data is not None else compliant_tenant()
        self.fail = set(fail)
        self.calls = []

    def list(self, resource, filter=None, attributes=None, sort_by=None, sort_order=None, limit=None):
        self.calls.append((resource, filter))
        if resource in self.fail:
            raise IdcsError(f"GET /admin/v1/{resource} returned HTTP 403 Forbidden")
        items = self.data.get(resource, [])
        if callable(items):
            items = items(filter)
        items = list(items)
        return items[:limit] if limit else items

    def get(self, path, params=None):
        name = path.rstrip("/").rsplit("/", 1)[-1]
        if name in self.fail:
            raise IdcsError(f"GET {path} returned HTTP 403 Forbidden")
        items = self.data.get(name, [])
        flt = (params or {}).get("filter") or ""
        if name == "AuditEvents" and 'eventId eq "' in flt:
            event_id = flt.split('eventId eq "', 1)[1].split('"', 1)[0]
            matching = [e for e in items if e.get("eventId") == event_id]
            return {"totalResults": len(matching), "Resources": matching[:1]}
        return {"Resources": items, "totalResults": len(items)}


def user(uid, name, *, days_since_login=5, admin_group=False, mfa="ENROLLED", factor="FIDO_AUTHENTICATOR", console=False, federated=False):
    return {
        "id": uid,
        "userName": name,
        "active": True,
        "groups": [{"value": "g-admins"}] if admin_group else [{"value": "g-users"}],
        "meta": {"created": iso(utc_now() - timedelta(days=400))},
        EXT_USER: {"isFederatedUser": federated, "serviceUser": False},
        EXT_USER_STATE: {"lastSuccessfulLoginDate": iso(utc_now() - timedelta(days=days_since_login))},
        EXT_MFA: {"mfaStatus": mfa, "preferredAuthenticationFactor": factor},
        EXT_CAPABILITIES: {"canUseConsolePassword": console},
    }


def compliant_tenant():
    events = []
    now = utc_now()
    for i, event_id in enumerate(["sso.session.create.success", "sso.session.create.failure", "sso.session.delete.success", "sso.session.modify.success", "sso.app.access.success"] * 3):
        events.append({"eventId": event_id, "timestamp": iso(now - timedelta(hours=i)), "actorName": f"user{i}@example.com", "clientIp": f"203.0.113.{i + 1}"})
    return {
        "IdentityProviders": [],
        "PasswordPolicies": [
            {"name": "defaultPasswordPolicy", "priority": 1, "minLength": 14, "numPasswordsInHistory": 5, "passwordExpiresAfter": 365, "maxIncorrectAttempts": 5}
        ],
        "AuthenticationFactorSettings": [{"fidoAuthenticatorEnabled": True, "totpEnabled": True, "smsEnabled": False}],
        "Users": [
            user("u-admin", "admin@example.com", admin_group=True, console=True),
            user("u-1", "alice@example.com"),
            user("u-2", "bob@example.com"),
        ],
        "Groups": [{"id": "g-admins", "displayName": "Administrators"}, {"id": "g-users", "displayName": "Staff"}],
        "AppRoles": [{"id": "r-ida", "displayName": "Identity Domain Administrator"}],
        "Grants": [],
        "NetworkPerimeters": [{"id": "np-1", "name": "CorpVPN", "ipAddresses": [{"type": "CIDR", "value": "198.51.100.0/24"}]}],
        "Policies": [
            {"id": "p-console", "name": "Security Policy for OCI Console", "active": True, "rules": [{"value": "r-1", "sequence": 1}, {"value": "r-2", "sequence": 2}]},
        ],
        "Rules": [
            {"id": "r-1", "name": "Admins from VPN", "active": True, "condition": '{"groups": ["g-admins"], "networkPerimeters": ["np-1"]}',
             "return": [{"name": "effect", "value": "ALLOW"}, {"name": "mfaRequired", "value": "true"}]},
            {"id": "r-2", "name": "Deny everyone else", "active": True, "condition": "{}", "return": [{"name": "effect", "value": "DENY"}]},
        ],
        "Conditions": [],
        "Apps": [
            {"displayName": "ERP integration", "active": True, "isOAuthClient": True, "clientType": "confidential", "allowedGrants": ["client_credentials"],
             "meta": {"created": iso(now - timedelta(days=300)), "lastModified": iso(now - timedelta(days=20))}}
        ],
        "AuditEvents": events,
    }
