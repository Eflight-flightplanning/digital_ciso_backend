"""The Azure backend keeps clients apart and signs in with a managed identity only."""
import os
import uuid
from unittest import mock

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, override_settings

from api import client_storage
from api.client_storage_azure import (
    FORBIDDEN_SETTINGS, AzureClientStorage, EncryptionScopes, build_azure_storage, checked_account_url, container_name,
)

from .fakes import FakeBlobService, FakeKeys, FakeScopes

A, B = uuid.uuid4(), uuid.uuid4()
URL = "https://digitalcisofiles.blob.core.windows.net"


class ContainerTests(SimpleTestCase):
    def setUp(self):
        self.service = FakeBlobService()
        self.storage = AzureClientStorage(self.service)
        self.storage.create_client(A)
        self.storage.create_client(B)
        self.key = self.storage.save(A, "documents", "plan.pdf", [b"secret ", b"plan"])

    def test_each_client_has_its_own_container_named_from_its_id(self):
        self.assertEqual(set(self.service.containers), {f"client-{A}", f"client-{B}"})
        self.assertIn(self.key, self.service.containers[f"client-{A}"]["blobs"])
        self.assertEqual(self.service.containers[f"client-{B}"]["blobs"], {})

    def test_containers_are_never_public(self):
        for container in self.service.containers.values():
            self.assertNotIn("public_access", container["options"])

    def test_creating_a_container_twice_is_harmless(self):
        self.storage.create_client(A)
        self.assertTrue(self.storage.exists(A, self.key))

    def test_client_b_cannot_list_client_a(self):
        self.assertEqual(self.storage.list_files(A, "documents"), [(self.key, 11)])
        self.assertEqual(self.storage.list_files(B, "documents"), [])

    def test_client_b_cannot_download_client_a(self):
        self.assertEqual(self.storage.open(A, self.key).read(), b"secret plan")
        self.assertFalse(self.storage.exists(B, self.key))
        with self.assertRaises(FileNotFoundError):
            self.storage.open(B, self.key)

    def test_client_b_cannot_delete_client_a(self):
        self.storage.delete(B, self.key)
        self.assertTrue(self.storage.exists(A, self.key))

    def test_a_key_cannot_reach_another_container(self):
        for key in (f"../client-{A}/{self.key}", f"/{self.key}", f"client-{A}/x", "documents/../x", "documents/..",
                    f"documents/x?comp=list", "documents/a\\b", "", "documents"):
            for call in (self.storage.exists, self.storage.open, self.storage.delete):
                with self.assertRaises(PermissionError, msg=key):
                    call(B, key)
            with self.assertRaises(PermissionError, msg=key):
                self.storage.put(B, key, b"x")

    def test_a_listing_cannot_leave_its_folder(self):
        for prefix in ("", "..", "documents/..", f"../client-{A}"):
            with self.assertRaises(PermissionError, msg=prefix):
                self.storage.list_files(B, prefix)

    def test_a_client_id_that_is_not_an_id_is_refused(self):
        for bad in (None, "", f"{A}/../{B}", "client-x", "*"):
            with self.assertRaises((ValueError, TypeError, AttributeError), msg=str(bad)):
                self.storage.list_files(bad, "documents")
        self.assertEqual(container_name(str(A).upper()), f"client-{A}")

    def test_an_upload_name_cannot_choose_its_place(self):
        key = self.storage.save(B, "documents", f"../../client-{A}/evil.pdf", [b"x"])
        self.assertRegex(key, r"^documents/[0-9a-f-]{36}_evil\.pdf$")
        self.assertEqual(len(self.service.containers[f"client-{A}"]["blobs"]), 1)

    def test_saving_a_report_again_replaces_it(self):
        self.storage.put(A, "reports/nca/1/report-html.html", b"old")
        self.storage.put(A, "reports/nca/1/report-html.html", b"new")
        self.assertEqual(self.storage.open(A, "reports/nca/1/report-html.html").read(), b"new")

    def test_offboarding_removes_only_that_client(self):
        self.storage.delete_client(A)
        self.storage.delete_client(A)  # safe to repeat
        self.assertEqual(set(self.service.containers), {f"client-{B}"})
        self.assertEqual(self.storage.list_files(A, "documents"), [])


class EncryptionScopeTests(SimpleTestCase):
    def setUp(self):
        self.service, self.keys, self.scopes = FakeBlobService(), FakeKeys(), FakeScopes()
        self.storage = AzureClientStorage(self.service, EncryptionScopes(self.scopes, self.keys, "rg", "account"))

    def test_each_client_gets_its_own_key_and_scope(self):
        made_a, made_b = self.storage.create_client(A), self.storage.create_client(B)
        self.assertEqual(made_a["encryption_scope"], f"client-{A}")
        self.assertNotEqual(made_a["encryption_scope"], made_b["encryption_scope"])
        self.assertEqual(set(self.keys.keys), {f"client-{A}", f"client-{B}"})
        scope = self.scopes.scopes[f"client-{A}"]
        self.assertEqual(scope.source, "Microsoft.KeyVault")
        self.assertEqual(scope.key_vault_properties.key_uri, f"https://vault.test/keys/client-{A}")

    def test_the_container_is_locked_to_its_scope(self):
        self.storage.create_client(A)
        locked = self.service.containers[f"client-{A}"]["options"]["container_encryption_scope"]
        self.assertEqual(locked.default_encryption_scope, f"client-{A}")
        self.assertTrue(locked.prevent_encryption_scope_override)

    def test_an_existing_key_is_reused(self):
        self.storage.create_client(A)
        first = self.keys.keys[f"client-{A}"].id
        self.storage.create_client(A)
        self.assertEqual(self.keys.keys[f"client-{A}"].id, first)

    def test_offboarding_retires_the_scope_and_key(self):
        self.storage.create_client(A)
        self.storage.create_client(B)
        self.storage.delete_client(A)
        self.assertEqual(self.scopes.scopes[f"client-{A}"].state, "Disabled")
        self.assertEqual(self.keys.deleted, [f"client-{A}"])
        self.assertEqual(self.scopes.scopes[f"client-{B}"].state, "Enabled")


@override_settings(AZURE_STORAGE_ACCOUNT_URL=URL)
class ManagedIdentityOnlyTests(SimpleTestCase):
    def test_any_storage_secret_stops_the_app(self):
        for name in FORBIDDEN_SETTINGS:
            with mock.patch.dict(os.environ, {name: "x"}), self.assertRaises(ImproperlyConfigured, msg=name):
                checked_account_url()
            with override_settings(**{name: "x"}), self.assertRaises(ImproperlyConfigured, msg=name):
                checked_account_url()

    def test_an_address_carrying_a_token_or_another_host_is_refused(self):
        for url in ("", "http://digitalcisofiles.blob.core.windows.net", f"{URL}?sv=2024&sig=abc", f"{URL}/client-x",
                    "https://evil.example/digitalcisofiles.blob.core.windows.net", "https://digitalcisofiles.blob.core.windows.net.evil.io"):
            with override_settings(AZURE_STORAGE_ACCOUNT_URL=url), self.assertRaises(ImproperlyConfigured, msg=url):
                checked_account_url()

    def test_the_client_is_built_with_a_managed_identity(self):
        with mock.patch("azure.identity.ManagedIdentityCredential") as identity, \
                mock.patch("azure.storage.blob.BlobServiceClient") as blob_service:
            storage = build_azure_storage()
        blob_service.assert_called_once_with(URL, credential=identity.return_value)
        self.assertIsNone(storage.scopes)

    def test_backend_setting_chooses_the_storage(self):
        self.assertEqual(client_storage.get_storage().backend, "local")
        with override_settings(CLIENT_STORAGE_BACKEND="other"), self.assertRaises(ValueError):
            client_storage.get_storage()
