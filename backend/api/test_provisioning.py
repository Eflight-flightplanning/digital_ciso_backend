"""Tenant provisioning for the Digital CISO admin panel (api/provisioning.py).

Run:  .venv\\Scripts\\python.exe -m unittest api.test_provisioning

The sign-in checks use real RS256 tokens signed with a throwaway key; only the download of
Microsoft's public keys is replaced. The database steps use small in-memory stand-ins, since
these tests run without PostgreSQL.
"""
import contextlib
import json
import os
import sys
import time
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.django.devel")

import django  # noqa: E402

django.setup()

import jwt  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from django.test import SimpleTestCase, override_settings  # noqa: E402
from rest_framework.test import APIRequestFactory  # noqa: E402

from api import provisioning as p  # noqa: E402

DIRECTORY = str(uuid.uuid4())
AUDIENCE = "api://digital-ciso-platform"
PANEL = str(uuid.uuid4())
DEV_TOKEN = "d" * 40
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
SETTINGS = dict(PROVISIONING_ENTRA_TENANT_ID=DIRECTORY, PROVISIONING_AUDIENCE=AUDIENCE,
                PROVISIONING_ALLOWED_CALLERS=[PANEL], PROVISIONING_REQUIRED_ROLE="Tenants.Provision",
                PROVISIONING_DEV_TOKEN="", DEBUG=False)


def token(key=KEY, **over):
    now = int(time.time())
    claims = {"aud": AUDIENCE, "iss": f"https://login.microsoftonline.com/{DIRECTORY}/v2.0", "tid": DIRECTORY,
              "oid": PANEL, "roles": ["Tenants.Provision"], "iat": now, "nbf": now, "exp": now + 600, **over}
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm="RS256")


class FakeJwks:
    def get_signing_key_from_jwt(self, _token):
        return SimpleNamespace(key=KEY.public_key())


def request(tok=None, body=None, scheme="Bearer"):
    headers = {"HTTP_AUTHORIZATION": f"{scheme} {tok}"} if tok else {}
    body = body or {"name": "Acme Bank", "external_id": str(uuid.uuid4())}
    req = APIRequestFactory().post("/api/v1/provisioning/tenants", json.dumps(body), content_type="application/json", **headers)
    return p.ProvisionTenantView.as_view()(req)


@override_settings(**SETTINGS)
@patch("api.provisioning._jwks_client", lambda _directory: FakeJwks())
@patch("api.provisioning.ProvisioningThrottle.allow_request", lambda *a: True)
class SignInTests(SimpleTestCase):
    def setUp(self):
        self.made = patch("api.provisioning.provision_tenant",
                          return_value={"tenant_id": "t", "name": "Acme Bank", "created": True, "api_key": "pk.secret",
                                        "api_key_expires_at": "2027-01-01T00:00:00+00:00"}).start()
        self.addCleanup(patch.stopall)

    def test_the_panels_token_is_accepted(self):
        r = request(token())
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r["Cache-Control"], "no-store")
        self.assertEqual(r.data["api_key"], "pk.secret")
        self.made.assert_called_once()

    def test_the_v1_issuer_is_accepted_too(self):
        self.assertEqual(request(token(iss=f"https://sts.windows.net/{DIRECTORY}/")).status_code, 201)

    def test_a_found_tenant_answers_200(self):
        self.made.return_value = {**self.made.return_value, "created": False}
        self.assertEqual(request(token()).status_code, 200)

    def test_tokens_that_must_be_refused(self):
        refused = {
            "no token": None,
            "wrong audience": token(aud="api://something-else"),
            "wrong issuer": token(iss="https://login.microsoftonline.com/other/v2.0"),
            "other directory": token(tid=str(uuid.uuid4())),
            "expired": token(iat=int(time.time()) - 7200, nbf=int(time.time()) - 7200, exp=int(time.time()) - 3600),
            "signed by another key": token(key=OTHER_KEY),
            "missing the app role": token(roles=["Something.Else"]),
            "not the panel's identity": token(oid=str(uuid.uuid4())),
            "a user's delegated token": token(scp="user_impersonation"),
            "no object id": token(oid=None),
            "garbage": "not-a-token",
        }
        for why, tok in refused.items():
            with self.subTest(why):
                r = request(tok)
                self.assertIn(r.status_code, (401, 403), why)
                self.assertNotIn("api_key", getattr(r, "data", {}) or {})
        self.made.assert_not_called()

    def test_a_tenant_api_key_or_user_sign_in_is_not_enough(self):
        self.assertIn(request("pk.whatever", scheme="Api-Key").status_code, (401, 403))
        self.made.assert_not_called()

    def test_nothing_is_accepted_until_it_is_set_up(self):
        with override_settings(PROVISIONING_ALLOWED_CALLERS=[]):
            self.assertEqual(request(token()).status_code, 401)
        self.made.assert_not_called()

    def test_the_dev_token_works_only_with_debug_on_and_long_enough(self):
        with override_settings(PROVISIONING_DEV_TOKEN=DEV_TOKEN, DEBUG=False):
            self.assertIn(request(DEV_TOKEN).status_code, (401, 403))
        with override_settings(PROVISIONING_DEV_TOKEN="short", DEBUG=True):
            self.assertIn(request("short").status_code, (401, 403))
        with override_settings(PROVISIONING_DEV_TOKEN=DEV_TOKEN, DEBUG=True):
            self.assertIn(request("x" * 40).status_code, (401, 403))
            self.assertEqual(request(DEV_TOKEN).status_code, 201)

    def test_the_body_is_checked(self):
        for body in ({"name": "Ab", "external_id": str(uuid.uuid4())}, {"name": "Acme"}, {"name": "Acme", "external_id": "nope"},
                     {"name": "x" * 101, "external_id": str(uuid.uuid4())}):
            with self.subTest(body=body):
                self.assertEqual(request(token(), body).status_code, 400)
        self.made.assert_not_called()


# ---------- the database steps, with in-memory stand-ins ----------

class Rows(list):
    """Just enough of a queryset: using / select_for_update / select_related / filter / first / update / create."""

    def __init__(self, model, items=None):
        super().__init__(items or [])
        self.model = model

    def using(self, _alias):
        return self

    def select_for_update(self):
        return self

    def select_related(self, *_a):
        return self

    def filter(self, **kw):
        return Rows(self.model, [r for r in self if all(getattr(r, k.replace("__", "_"), None) == v for k, v in kw.items())])

    def first(self):
        return self[0] if self else None

    def exists(self):
        return bool(self)

    def update(self, **kw):
        for r in self:
            r.__dict__.update(kw)
        return len(self)

    def create(self, **kw):
        row = self.model(**kw)
        self.model.store.append(row)
        return row


def fake_model(name, **defaults):
    class Model:
        store = []

        def __init__(self, **kw):
            self.id = uuid.uuid4()
            self.__dict__.update({**defaults, **kw})

        def save(self, using=None):
            if self not in type(self).store:
                type(self).store.append(self)

    Model.__name__ = name
    return Model


class FakeDb:
    def __init__(self):
        self.Tenant = fake_model("Tenant")
        self.User = fake_model("User")
        self.Membership = fake_model("Membership", role="member")
        self.Role = fake_model("Role")
        self.UserRoleRelationship = fake_model("UserRoleRelationship")
        self.TenantAPIKey = fake_model("TenantAPIKey", revoked=False)
        self.Membership.RoleChoices = SimpleNamespace(MEMBER="member", OWNER="owner")
        self.User.set_unusable_password = lambda self: setattr(self, "password", "!")
        for m in (self.Tenant, self.User, self.Membership, self.Role, self.UserRoleRelationship, self.TenantAPIKey):
            m.objects = _Manager(m)
        self.TenantAPIKey.objects.assign_api_key = lambda key: f"{key.id}.raw-key"

    def patches(self):
        return patch.multiple("api.models", Tenant=self.Tenant, User=self.User, Membership=self.Membership, Role=self.Role,
                              UserRoleRelationship=self.UserRoleRelationship, TenantAPIKey=self.TenantAPIKey)


class _Manager:
    def __init__(self, model):
        self.model = model

    def __getattr__(self, name):
        return getattr(Rows(self.model, self.model.store), name)


class ProvisionTests(unittest.TestCase):
    def setUp(self):
        self.db = FakeDb()
        stack = contextlib.ExitStack()
        stack.enter_context(self.db.patches())
        stack.enter_context(patch("api.provisioning.transaction.atomic", lambda using=None: contextlib.nullcontext()))
        self.addCleanup(stack.close)

    def test_a_new_customer_gets_a_tenant_a_limited_service_account_and_a_key(self):
        ext = uuid.uuid4()
        out = p.provision_tenant("Acme Bank", ext)
        self.assertTrue(out["created"])
        self.assertEqual(out["name"], "Acme Bank")
        self.assertTrue(out["api_key"].endswith(".raw-key"))
        [tenant] = self.db.Tenant.store
        [user] = self.db.User.store
        [role] = self.db.Role.store
        [key] = self.db.TenantAPIKey.store
        self.assertEqual(out["tenant_id"], str(tenant.id))
        self.assertEqual(user.email, p.service_email(ext))
        self.assertTrue(user.email.endswith(".invalid") and user.password == "!" and not user.must_change_password)
        self.assertEqual(self.db.Membership.store[0].role, "member")
        self.assertFalse(role.manage_users or role.manage_account or role.manage_billing)
        self.assertTrue(role.manage_providers and role.manage_scans and role.manage_integrations)
        from api.rbac.read_only import role_name_is_read_only
        self.assertFalse(role_name_is_read_only(role.name))  # the panel must be able to write
        self.assertEqual((key.tenant_id, key.entity), (tenant.id, user))

    def test_calling_again_finds_the_same_tenant_and_replaces_the_key(self):
        ext = uuid.uuid4()
        first = p.provision_tenant("Acme Bank", ext)
        second = p.provision_tenant("Acme Bank renamed", ext)
        self.assertFalse(second["created"])
        self.assertEqual(second["tenant_id"], first["tenant_id"])
        self.assertNotEqual(second["api_key"], first["api_key"])
        self.assertEqual(len(self.db.Tenant.store), 1)
        old, new = self.db.TenantAPIKey.store
        self.assertTrue(old.revoked)
        self.assertFalse(new.revoked)

    def test_different_customers_get_different_tenants(self):
        a = p.provision_tenant("Acme", uuid.uuid4())
        b = p.provision_tenant("Beta", uuid.uuid4())
        self.assertNotEqual(a["tenant_id"], b["tenant_id"])

    def test_the_key_is_not_logged(self):
        with self.assertLogs("api.provisioning", level="INFO") as logs:
            out = p.provision_tenant("Acme", uuid.uuid4())
        self.assertNotIn(out["api_key"], "\n".join(logs.output))
        self.assertNotIn("raw-key", "\n".join(logs.output))


if __name__ == "__main__":
    unittest.main()
