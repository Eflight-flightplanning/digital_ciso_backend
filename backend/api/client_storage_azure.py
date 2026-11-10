"""Azure Blob Storage for client files: one private container per client.

The app signs in with its managed identity. Account keys, connection strings and SAS tokens are
refused, so there is no storage secret to keep or leak. A container is named from the client's
permanent id, never from anything a request sends.

With a Key Vault configured, each client also gets its own encryption scope backed by its own key,
and the container is locked to that scope.
"""
import io
import os
import re
import uuid

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

_CATEGORY = re.compile(r"[a-z0-9_-]{1,40}")
_KEY = re.compile(r"[a-z0-9_-]{1,40}(/[A-Za-z0-9._-]{1,150}){1,3}")
_ACCOUNT_URL = re.compile(r"https://[a-z0-9]{3,24}\.blob\.core\.(windows\.net|usgovcloudapi\.net|chinacloudapi\.cn)/?")
# Any of these would let the app reach storage without its managed identity.
FORBIDDEN_SETTINGS = ("AZURE_STORAGE_CONNECTION_STRING", "AZURE_STORAGE_KEY", "AZURE_STORAGE_ACCOUNT_KEY",
                      "AZURE_STORAGE_ACCESS_KEY", "AZURE_STORAGE_SAS_TOKEN")
KEY_SIZE = 3072


def container_name(tenant_id) -> str:
    """Also the name of the client's encryption scope and key."""
    return f"client-{uuid.UUID(str(tenant_id))}"


def _checked_key(key: str) -> str:
    if not _KEY.fullmatch(key) or any(set(part) <= {"."} for part in key.split("/")):
        raise PermissionError("That file is outside this client's storage.")
    return key


class EncryptionScopes:
    """One customer-managed key and one encryption scope per client."""

    def __init__(self, scopes, keys, resource_group, account):
        self.scopes, self.keys, self.resource_group, self.account = scopes, keys, resource_group, account

    def ensure(self, tenant_id) -> str:
        from azure.core.exceptions import ResourceNotFoundError
        from azure.mgmt.storage.models import EncryptionScope, EncryptionScopeKeyVaultProperties

        name = container_name(tenant_id)
        try:
            key = self.keys.get_key(name)
        except ResourceNotFoundError:
            key = self.keys.create_rsa_key(name, size=KEY_SIZE)
        unversioned = key.id.rsplit("/", 1)[0]  # storage then follows key rotation by itself
        self.scopes.put(self.resource_group, self.account, name, EncryptionScope(
            source="Microsoft.KeyVault", state="Enabled",
            key_vault_properties=EncryptionScopeKeyVaultProperties(key_uri=unversioned)))
        return name

    def retire(self, tenant_id) -> None:
        """For offboarding. Deleting the key makes any leftover copy of the client's data unreadable."""
        from azure.core.exceptions import ResourceNotFoundError
        from azure.mgmt.storage.models import EncryptionScope

        name = container_name(tenant_id)
        try:
            self.scopes.patch(self.resource_group, self.account, name, EncryptionScope(state="Disabled"))
            self.keys.begin_delete_key(name)
        except ResourceNotFoundError:
            pass


class AzureClientStorage:
    backend = "azure"

    def __init__(self, service, scopes=None):
        self.service, self.scopes = service, scopes

    def _blob(self, tenant_id, key: str):
        return self.service.get_blob_client(container_name(tenant_id), _checked_key(key))

    def create_client(self, tenant_id) -> dict:
        """Make the client's private container. Safe to call again."""
        from azure.core.exceptions import ResourceExistsError
        from azure.storage.blob import ContainerEncryptionScope

        name = container_name(tenant_id)
        scope = self.scopes.ensure(tenant_id) if self.scopes else ""
        options = {}
        if scope:
            options["container_encryption_scope"] = ContainerEncryptionScope(
                default_encryption_scope=scope, prevent_encryption_scope_override=True)
        try:
            self.service.get_container_client(name).create_container(**options)  # no public_access: private
        except ResourceExistsError:
            pass
        return {"name": name, "encryption_scope": scope}

    def save(self, tenant_id, category: str, name: str, chunks) -> str:
        if not _CATEGORY.fullmatch(category):
            raise ValueError("Unknown storage category.")
        safe = re.sub(r"[^A-Za-z0-9._-]", "_", os.path.basename(name))[:100].lstrip(".") or "file"
        key = f"{category}/{uuid.uuid4()}_{safe}"
        self._blob(tenant_id, key).upload_blob(chunks, overwrite=False)
        return key

    def put(self, tenant_id, key: str, data: bytes) -> None:
        self._blob(tenant_id, key).upload_blob(data, overwrite=True)

    def list_files(self, tenant_id, prefix: str) -> list[tuple[str, int]]:
        from azure.core.exceptions import ResourceNotFoundError

        if not _CATEGORY.fullmatch(prefix):
            raise PermissionError("That folder is outside this client's storage.")
        container = self.service.get_container_client(container_name(tenant_id))
        try:
            return sorted((blob.name, blob.size) for blob in container.list_blobs(name_starts_with=f"{prefix}/"))
        except ResourceNotFoundError:
            return []

    def exists(self, tenant_id, key: str) -> bool:
        return self._blob(tenant_id, key).exists()

    def open(self, tenant_id, key: str):
        from azure.core.exceptions import ResourceNotFoundError

        try:
            return io.BytesIO(self._blob(tenant_id, key).download_blob().readall())
        except ResourceNotFoundError as error:
            raise FileNotFoundError(key) from error

    def delete(self, tenant_id, key: str) -> None:
        from azure.core.exceptions import ResourceNotFoundError

        try:
            self._blob(tenant_id, key).delete_blob()
        except ResourceNotFoundError:
            pass

    def delete_client(self, tenant_id) -> None:
        """Remove every file for one client, for offboarding."""
        from azure.core.exceptions import ResourceNotFoundError

        try:
            self.service.get_container_client(container_name(tenant_id)).delete_container()
        except ResourceNotFoundError:
            pass
        if self.scopes:
            self.scopes.retire(tenant_id)


def checked_account_url() -> str:
    for name in FORBIDDEN_SETTINGS:
        if os.environ.get(name) or getattr(settings, name, ""):
            raise ImproperlyConfigured(f"{name} must not be set: client storage signs in with a managed identity only.")
    url = getattr(settings, "AZURE_STORAGE_ACCOUNT_URL", "")
    if not _ACCOUNT_URL.fullmatch(url):
        raise ImproperlyConfigured("AZURE_STORAGE_ACCOUNT_URL must be the storage account's https blob address, with no token.")
    return url


def build_azure_storage() -> AzureClientStorage:
    from azure.identity import ManagedIdentityCredential
    from azure.storage.blob import BlobServiceClient

    url = checked_account_url()
    credential = ManagedIdentityCredential(client_id=getattr(settings, "AZURE_STORAGE_MANAGED_IDENTITY_CLIENT_ID", "") or None)
    scopes = None
    vault = getattr(settings, "AZURE_STORAGE_KEY_VAULT_URL", "")
    if vault:
        from azure.keyvault.keys import KeyClient
        from azure.mgmt.storage import StorageManagementClient

        needed = ("AZURE_STORAGE_SUBSCRIPTION_ID", "AZURE_STORAGE_RESOURCE_GROUP")
        missing = [name for name in needed if not getattr(settings, name, "")]
        if missing:
            raise ImproperlyConfigured(f"Per-client encryption needs {', '.join(missing)}.")
        management = StorageManagementClient(credential, settings.AZURE_STORAGE_SUBSCRIPTION_ID)
        account = url.split("//", 1)[1].split(".", 1)[0]
        scopes = EncryptionScopes(management.encryption_scopes, KeyClient(vault, credential),
                                  settings.AZURE_STORAGE_RESOURCE_GROUP, account)
    return AzureClientStorage(BlobServiceClient(url, credential=credential), scopes)
