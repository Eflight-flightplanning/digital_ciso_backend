"""Cloud keys in Key Vault (phase 3) and offboarding a provisioned tenant (phase 4).

Run:  .venv\\Scripts\\python.exe -m unittest api.test_cloud_keys_vault

Key Vault is an in-memory stand-in and database writes are stubbed, so no Azure and no PostgreSQL.
"""
import json
import os
import sys
import unittest
import uuid
from unittest.mock import MagicMock, patch

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.django.devel")

import django  # noqa: E402

django.setup()

from django.db import models  # noqa: E402
from django.test import SimpleTestCase, override_settings  # noqa: E402
from rest_framework.test import APIRequestFactory  # noqa: E402

from api import cloud_keys_vault as vault  # noqa: E402
from api import provisioning as p  # noqa: E402
from api.crypto import fernet  # noqa: E402
from api.models import ProviderSecret  # noqa: E402
from api.signals import delete_cloud_keys_from_vault  # noqa: E402

KEYS = {"user": "ocid1.user.oc1..aaaa", "fingerprint": "12:34", "key_content": "-----BEGIN PRIVATE KEY-----\nTOPSECRET\n-----END PRIVATE KEY-----"}
VAULT_ON = dict(CLOUD_KEYS_BACKEND="azure_keyvault", CLOUD_KEYS_VAULT_URL="https://ciso-cloud-keys.vault.azure.net/")


class FakeSecretClient:
    def __init__(self):
        self.secrets, self.deleted, self.reads = {}, [], 0

    def set_secret(self, name, value, **kwargs):
        self.secrets[name] = value

    def get_secret(self, name):
        self.reads += 1
        return MagicMock(value=self.secrets[name])

    def begin_delete_secret(self, name):
        self.deleted.append(name)
        self.secrets.pop(name, None)


class VaultTestCase(SimpleTestCase):
    def setUp(self):
        self.kv = FakeSecretClient()
        vault.reset_for_tests(self.kv)
        self.addCleanup(vault.reset_for_tests, None)
        self.saved = []
        stub = patch.object(models.Model, "save_base", lambda obj, *a, **k: self.saved.append(obj))
        stub.start()
        self.addCleanup(stub.stop)


@override_settings(**VAULT_ON)
class KeyVaultModeTests(VaultTestCase):
    def test_keys_go_to_the_vault_and_the_row_keeps_only_a_reference(self):
        row = ProviderSecret(secret_type="static")
        row.secret = KEYS
        self.assertEqual(self.kv.secrets, {})  # nothing is written until the row is saved
        row.save()
        name = f"cloud-{row.id}"
        self.assertEqual(json.loads(self.kv.secrets[name]), KEYS)
        self.assertEqual(row._raw_secret(), b"kv:" + name.encode())
        self.assertNotIn(b"TOPSECRET", row._raw_secret())
        vault.reset_for_tests(self.kv)  # empty the cache: the value must come from the vault
        self.assertEqual(row.secret, KEYS)
        self.assertEqual(self.kv.reads, 1)

    def test_changing_the_keys_writes_a_new_value_under_the_same_name(self):
        row = ProviderSecret(secret_type="static")
        row.secret = KEYS
        row.save()
        row.secret = {**KEYS, "fingerprint": "ab:cd"}
        row.save()
        self.assertEqual(list(self.kv.secrets), [f"cloud-{row.id}"])
        self.assertEqual(row.secret["fingerprint"], "ab:cd")

    def test_a_row_that_fails_to_save_leaves_no_secret_behind(self):
        with patch.object(models.Model, "save_base", side_effect=RuntimeError("db down")):
            row = ProviderSecret(secret_type="static")
            row.secret = KEYS
            with self.assertRaises(RuntimeError):
                row.save()
        self.assertEqual(self.kv.secrets, {})
        self.assertEqual(self.kv.deleted, [f"cloud-{row.id}"])

    def test_keys_still_in_the_database_are_read_as_before(self):
        row = ProviderSecret(secret_type="static", _secret=fernet.encrypt(json.dumps(KEYS).encode()))
        self.assertEqual(row.secret, KEYS)

    def test_deleting_the_cloud_account_deletes_its_secret(self):
        row = ProviderSecret(secret_type="static")
        row.secret = KEYS
        row.save()
        delete_cloud_keys_from_vault(ProviderSecret, row)
        self.assertEqual(self.kv.secrets, {})

    def test_a_vault_problem_on_delete_does_not_stop_the_deletion(self):
        row = ProviderSecret(secret_type="static", _secret=vault.reference(uuid.uuid4()))
        self.kv.begin_delete_secret = MagicMock(side_effect=RuntimeError("vault down"))
        with self.assertLogs("api.signals", level="ERROR"):
            delete_cloud_keys_from_vault(ProviderSecret, row)

    def test_nothing_secret_is_logged(self):
        with self.assertLogs("api.cloud_keys_vault", level="INFO") as logs:
            row = ProviderSecret(secret_type="static")
            row.secret = KEYS
            row.save()
        self.assertNotIn("TOPSECRET", "\n".join(logs.output))


@override_settings(CLOUD_KEYS_BACKEND="database")
class DatabaseModeTests(VaultTestCase):
    def test_keys_stay_encrypted_in_the_database(self):
        row = ProviderSecret(secret_type="static")
        row.secret = KEYS
        row.save()
        self.assertEqual(self.kv.secrets, {})
        self.assertFalse(row._raw_secret().startswith(b"kv:"))
        self.assertNotIn(b"TOPSECRET", row._raw_secret())
        self.assertEqual(row.secret, KEYS)

    def test_rows_already_in_the_vault_are_still_read(self):
        row = ProviderSecret(secret_type="static")
        self.kv.secrets[f"cloud-{row.id}"] = json.dumps(KEYS)
        row._secret = vault.reference(row.id)
        self.assertEqual(row.secret, KEYS)

    def test_deleting_a_database_row_does_not_touch_the_vault(self):
        row = ProviderSecret(secret_type="static", _secret=fernet.encrypt(b"{}"))
        delete_cloud_keys_from_vault(ProviderSecret, row)
        self.assertEqual(self.kv.deleted, [])


class VaultSettingsTests(SimpleTestCase):
    def test_an_address_that_is_not_a_key_vault_is_refused(self):
        from django.core.exceptions import ImproperlyConfigured

        vault.reset_for_tests(None)
        for url in ("", "http://ciso.vault.azure.net/", "https://example.com/"):
            with self.subTest(url=url), override_settings(CLOUD_KEYS_VAULT_URL=url):
                with self.assertRaises(ImproperlyConfigured):
                    vault._client()


# ---------- phase 4: offboarding ----------

def delete_request(tenant_id, external_id, tok="d" * 40):
    url = f"/api/v1/provisioning/tenants/{tenant_id}" + (f"?external_id={external_id}" if external_id else "")
    req = APIRequestFactory().delete(url, HTTP_AUTHORIZATION=f"Bearer {tok}")
    return p.ProvisionedTenantView.as_view()(req, tenant_id=tenant_id)


@override_settings(PROVISIONING_DEV_TOKEN="d" * 40, DEBUG=True)
@patch("api.provisioning.ProvisioningThrottle.allow_request", lambda *a: True)
class OffboardViewTests(SimpleTestCase):
    def test_the_panel_can_offboard_its_own_tenant(self):
        tid, ext = uuid.uuid4(), uuid.uuid4()
        with patch("api.provisioning.offboard_tenant", return_value=True) as off:
            r = delete_request(tid, ext)
        self.assertEqual(r.status_code, 202)
        off.assert_called_once_with(tid, ext)

    def test_another_tenant_or_a_missing_id_is_refused(self):
        with patch("api.provisioning.offboard_tenant", return_value=False):
            self.assertEqual(delete_request(uuid.uuid4(), uuid.uuid4()).status_code, 404)
        with patch("api.provisioning.offboard_tenant") as off:
            self.assertEqual(delete_request(uuid.uuid4(), None).status_code, 400)
            self.assertIn(delete_request(uuid.uuid4(), uuid.uuid4(), tok="wrong" * 10).status_code, (401, 403))
            off.assert_not_called()


class OffboardLogicTests(SimpleTestCase):
    def _models(self, member: bool):
        user = MagicMock(name="service user")
        User, Membership, TenantAPIKey = MagicMock(), MagicMock(), MagicMock()
        User.objects.using.return_value.filter.return_value.first.return_value = user
        Membership.objects.using.return_value.filter.return_value.exists.return_value = member
        Membership.objects.using.return_value.filter.return_value.values_list.return_value = [user.id]
        return User, Membership, TenantAPIKey

    def _run(self, member):
        User, Membership, TenantAPIKey = self._models(member)
        task = MagicMock()
        with patch.multiple("api.models", User=User, Membership=Membership, TenantAPIKey=TenantAPIKey), \
                patch("tasks.tasks.delete_tenant_task", task), \
                patch("api.provisioning.transaction.atomic", lambda using=None: __import__("contextlib").nullcontext()), \
                patch("api.provisioning.transaction.on_commit", lambda fn, using=None: fn()):
            done = p.offboard_tenant(uuid.uuid4(), uuid.uuid4())
        return done, TenantAPIKey, Membership, task

    def test_a_tenant_not_made_for_this_customer_is_left_alone(self):
        done, keys, memberships, task = self._run(member=False)
        self.assertFalse(done)
        keys.objects.using.return_value.filter.return_value.update.assert_not_called()
        task.apply_async.assert_not_called()

    def test_offboarding_revokes_keys_at_once_and_starts_the_deletion(self):
        done, keys, memberships, task = self._run(member=True)
        self.assertTrue(done)
        keys.objects.using.return_value.filter.return_value.update.assert_called_once_with(revoked=True)
        memberships.objects.using.return_value.filter.return_value.delete.assert_called_once()
        task.apply_async.assert_called_once()


if __name__ == "__main__":
    unittest.main()
