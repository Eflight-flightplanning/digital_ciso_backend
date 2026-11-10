"""Cross-client tests of the file layer and its API, run against both the local and the Azure backend."""
import types
import uuid
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.test import APIRequestFactory, force_authenticate

from api.client_storage_azure import AzureClientStorage
from client_store import perms, service, views
from client_store.models import ClientContainer, ClientFile
from client_store.service import ClientFiles, deprovision, provision, record_system_file

from .fakes import FakeBlobService

A, B = uuid.uuid4(), uuid.uuid4()


def user(email, *tenants):
    return types.SimpleNamespace(email=email, is_authenticated=True, tenants=set(tenants), can_delete=True)


def pdf(name="plan.pdf", data=b"secret plan"):
    return SimpleUploadedFile(name, data, content_type="application/pdf")


class Membership:
    """Stands in for the platform's membership table and sign-in."""

    def setUp(self):
        super().setUp()
        for patcher in (
            mock.patch.object(perms, "is_member", lambda u, tenant_id: bool(u) and tenant_id in getattr(u, "tenants", ())),
            mock.patch.object(perms, "resolve_tenant_id", lambda request: getattr(request, "chosen", None)),
            mock.patch.object(perms, "can_delete", lambda request: request.user.can_delete),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.ann, self.bob = user("ann@a.test", A), user("bob@b.test", B)


class LocalBackend(Membership):
    pass


class AzureBackend(Membership):
    def setUp(self):
        super().setUp()
        self.blob_service = FakeBlobService()
        patcher = mock.patch.object(service, "get_storage", lambda: AzureClientStorage(self.blob_service))
        patcher.start()
        self.addCleanup(patcher.stop)


class ServiceCases:
    def setUp(self):
        super().setUp()
        self.row = ClientFiles(A, self.ann).upload("documents", pdf())

    def test_upload_records_the_client_and_details(self):
        self.assertEqual((self.row.tenant_id, self.row.name, self.row.size, self.row.uploaded_by), (A, "plan.pdf", 11, "ann@a.test"))
        self.assertEqual(len(self.row.sha256), 64)
        self.assertTrue(ClientContainer.objects.filter(tenant_id=A).exists())

    def test_client_b_cannot_list_client_a(self):
        self.assertEqual(list(ClientFiles(B, self.bob).list()), [])
        self.assertEqual(len(ClientFiles(A, self.ann).list()), 1)

    def test_client_b_cannot_download_client_a(self):
        with self.assertRaises(NotFound):
            ClientFiles(B, self.bob).open(self.row.id)
        _, content = ClientFiles(A, self.ann).open(self.row.id)
        with content:
            self.assertEqual(content.read(), b"secret plan")

    def test_client_b_cannot_delete_client_a(self):
        with self.assertRaises(NotFound):
            ClientFiles(B, self.bob).delete(self.row.id)
        self.assertTrue(ClientFile.objects.filter(pk=self.row.id).exists())

    def test_a_user_cannot_act_for_a_client_they_do_not_belong_to(self):
        with self.assertRaises(PermissionDenied):
            ClientFiles(A, self.bob)

    def test_missing_client_or_user_is_refused(self):
        for tenant, who in ((None, self.ann), ("", self.ann), (A, None), (A, types.SimpleNamespace(is_authenticated=False))):
            with self.assertRaises(PermissionDenied):
                ClientFiles(tenant, who)

    def test_a_stolen_key_in_the_other_clients_records_still_reads_nothing(self):
        # Even if a row for client B pointed at client A's file, B's own container has no such file.
        record_system_file(B, self.row.key, name="x.pdf", size=1, category="documents")
        forged = ClientFile.objects.get(tenant_id=B)
        with self.assertRaises(NotFound):
            ClientFiles(B, self.bob).open(forged.id)

    def test_unsafe_uploads_are_rejected(self):
        files = ClientFiles(A, self.ann)
        for category, upload in (("reports", pdf()), ("other", pdf()), (None, pdf()), ("documents", None),
                                 ("documents", pdf("run.exe")), ("documents", pdf("page.html")), ("documents", pdf("noext"))):
            with self.assertRaises(ValidationError):
                files.upload(category, upload)
        self.assertEqual(ClientFile.objects.count(), 1)

    def test_a_file_larger_than_it_claims_is_rejected_and_not_kept(self):
        big = pdf(data=b"x" * 64)
        with mock.patch.object(service, "MAX_BYTES", 32):
            big.size = 1  # a false claim
            with self.assertRaises(ValidationError):
                ClientFiles(A, self.ann).upload("documents", big)
        self.assertEqual(ClientFile.objects.count(), 1)

    def test_delete_removes_the_file_and_its_record(self):
        files = ClientFiles(A, self.ann)
        files.delete(self.row.id)
        self.assertEqual(list(files.list()), [])
        with self.assertRaises(NotFound):
            files.open(self.row.id)

    def test_offboarding_removes_only_that_client(self):
        other = ClientFiles(B, self.bob).upload("documents", pdf("b.pdf", b"b"))
        deprovision(A)
        self.assertFalse(ClientFile.objects.filter(tenant_id=A).exists())
        self.assertFalse(ClientContainer.objects.filter(tenant_id=A).exists())
        _, content = ClientFiles(B, self.bob).open(other.id)
        with content:
            self.assertEqual(content.read(), b"b")

    def test_provisioning_twice_keeps_one_container(self):
        provision(A)
        self.assertEqual(ClientContainer.objects.filter(tenant_id=A).count(), 1)


class LocalServiceTests(ServiceCases, LocalBackend, TestCase):
    def test_container_is_the_clients_folder(self):
        self.assertEqual(ClientContainer.objects.get(tenant_id=A).name, str(A))


class AzureServiceTests(ServiceCases, AzureBackend, TestCase):
    def test_container_is_named_from_the_client_id(self):
        row = ClientContainer.objects.get(tenant_id=A)
        self.assertEqual((row.name, row.backend), (f"client-{A}", "azure"))
        self.assertEqual(len(self.blob_service.containers[f"client-{A}"]["blobs"]), 1)
        self.assertNotIn(f"client-{B}", self.blob_service.containers)


class ApiCases:
    def setUp(self):
        super().setUp()
        self.factory = APIRequestFactory()
        self.file_id = self.call("post", self.ann, A, data={"category": "documents", "file": pdf()}).data["id"]

    def call(self, method, who, tenant, file_id=None, data=None, query=""):
        request = getattr(self.factory, method)(f"/api/v1/client-files{query}", data, format="multipart" if data else None)
        request.chosen = tenant
        if who:
            force_authenticate(request, user=who)
        view = views.FileView if file_id else views.FilesView
        return view.as_view()(request, **({"file_id": file_id} if file_id else {}))

    def test_owner_can_list_and_download(self):
        listed = self.call("get", self.ann, A)
        self.assertEqual([row["name"] for row in listed.data["results"]], ["plan.pdf"])
        self.assertNotIn("key", listed.data["results"][0])
        response = self.call("get", self.ann, A, self.file_id)
        self.assertEqual(b"".join(response.streaming_content), b"secret plan")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertIn("attachment", response["Content-Disposition"])
        response.close()

    def test_other_client_gets_nothing(self):
        self.assertEqual(self.call("get", self.bob, B).data["results"], [])
        self.assertEqual(self.call("get", self.bob, B, self.file_id).status_code, 404)
        self.assertEqual(self.call("delete", self.bob, B, self.file_id).status_code, 404)
        own = self.call("get", self.ann, A, self.file_id)
        self.assertEqual(own.status_code, 200)
        own.close()

    def test_choosing_another_client_is_refused(self):
        for method, file_id in (("get", None), ("get", self.file_id), ("delete", self.file_id)):
            self.assertEqual(self.call(method, self.bob, A, file_id).status_code, 403)
        self.assertEqual(self.call("post", self.bob, A, data={"category": "documents", "file": pdf()}).status_code, 403)
        self.assertEqual(ClientFile.objects.count(), 1)

    def test_no_client_or_no_sign_in_is_refused(self):
        self.assertEqual(self.call("get", self.ann, None).status_code, 403)
        self.assertEqual(self.call("post", self.ann, None, data={"category": "documents", "file": pdf()}).status_code, 403)
        self.assertIn(self.call("get", None, A).status_code, (401, 403))
        self.assertIn(self.call("post", None, A, data={"category": "documents", "file": pdf()}).status_code, (401, 403))

    def test_a_client_named_in_the_request_is_ignored(self):
        response = self.call("post", self.bob, B, data={"category": "documents", "file": pdf("b.pdf"), "tenant_id": str(A),
                                                        "client_id": str(A), "container": f"client-{A}"})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(ClientFile.objects.get(pk=response.data["id"]).tenant_id, B)
        self.assertEqual(self.call("get", self.bob, B, query=f"?tenant_id={A}&container=client-{A}").data["results"][0]["name"], "b.pdf")

    def test_bad_upload_is_a_400(self):
        self.assertEqual(self.call("post", self.ann, A, data={"category": "documents", "file": pdf("x.exe")}).status_code, 400)
        self.assertEqual(self.call("post", self.ann, A, data={"category": "reports", "file": pdf()}).status_code, 400)

    def test_delete_needs_the_permission(self):
        self.ann.can_delete = False
        self.assertEqual(self.call("delete", self.ann, A, self.file_id).status_code, 403)
        self.ann.can_delete = True
        self.assertEqual(self.call("delete", self.ann, A, self.file_id).status_code, 204)
        self.assertEqual(self.call("get", self.ann, A, self.file_id).status_code, 404)


class LocalApiTests(ApiCases, LocalBackend, TestCase):
    pass


class AzureApiTests(ApiCases, AzureBackend, TestCase):
    pass


@override_settings(CLIENT_STORAGE_BACKEND="local")
class RecordTests(Membership, TestCase):
    def test_a_report_saved_twice_keeps_one_record(self):
        for size in (1, 2):
            record_system_file(A, "reports/nca/1/report-html.html", name="report-html.html", size=size, category="reports")
        self.assertEqual(ClientFile.objects.get(tenant_id=A).size, 2)
