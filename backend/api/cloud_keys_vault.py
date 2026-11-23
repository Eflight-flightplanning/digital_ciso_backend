"""Customers' cloud keys in Azure Key Vault (onboarding, phase 3).

With CLOUD_KEYS_BACKEND=azure_keyvault, a cloud account's keys (OCI private key, Azure client
secret, Oracle SaaS password, ...) are written to the cloud-keys Key Vault as one secret named
cloud-<provider secret id>. The database row keeps only a reference, b"kv:cloud-<id>", so a copy
of the database holds no keys. The scanner reads them from Key Vault when it needs them.

With CLOUD_KEYS_BACKEND=database (the default, and for local development) keys stay encrypted in
the database as before. Rows written either way are read correctly in both modes, so customers
can be moved over with `python manage.py move_cloud_keys_to_keyvault`.

The app signs in to Key Vault with its managed identity; there is no vault password. Values are
never logged. Deleting a cloud account deletes its secret (Key Vault keeps it recoverable for the
vault's soft-delete period).
"""
import json
import logging
import threading
import time
import uuid

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger("api.cloud_keys_vault")

REF_PREFIX = b"kv:"
CACHE_SECONDS = 60
_cache: dict[str, tuple[float, dict]] = {}
_lock = threading.Lock()
_client_singleton = None


def enabled() -> bool:
    return (getattr(settings, "CLOUD_KEYS_BACKEND", "database") or "database").lower() == "azure_keyvault"


def secret_name(secret_id) -> str:
    return f"cloud-{uuid.UUID(str(secret_id))}"


def reference(secret_id) -> bytes:
    return REF_PREFIX + secret_name(secret_id).encode()


def name_from_reference(raw: bytes) -> str | None:
    if raw and bytes(raw).startswith(REF_PREFIX):
        return bytes(raw)[len(REF_PREFIX):].decode()
    return None


def _client():
    global _client_singleton
    if _client_singleton is None:
        url = getattr(settings, "CLOUD_KEYS_VAULT_URL", "")
        if not url.startswith("https://") or ".vault." not in url:
            raise ImproperlyConfigured("CLOUD_KEYS_VAULT_URL must be the cloud-keys Key Vault's https address")
        from azure.identity import DefaultAzureCredential, ManagedIdentityCredential
        from azure.keyvault.secrets import SecretClient

        mi = getattr(settings, "CLOUD_KEYS_MANAGED_IDENTITY_CLIENT_ID", "")
        credential = ManagedIdentityCredential(client_id=mi) if mi else DefaultAzureCredential(
            exclude_interactive_browser_credential=True)
        _client_singleton = SecretClient(vault_url=url, credential=credential)
    return _client_singleton


def put(name: str, value: dict) -> None:
    _client().set_secret(name, json.dumps(value), content_type="application/json", tags={"kind": "cloud-keys"})
    with _lock:
        _cache.pop(name, None)
    logger.info("cloud keys saved in Key Vault as %s", name)


def get(name: str) -> dict:
    now = time.monotonic()
    with _lock:
        hit = _cache.get(name)
        if hit and hit[0] > now:
            return dict(hit[1])
    value = json.loads(_client().get_secret(name).value)
    with _lock:
        _cache[name] = (now + CACHE_SECONDS, value)
    return dict(value)


def delete(name: str) -> None:
    from azure.core.exceptions import ResourceNotFoundError

    with _lock:
        _cache.pop(name, None)
    try:
        _client().begin_delete_secret(name)
        logger.info("cloud keys %s deleted from Key Vault", name)
    except ResourceNotFoundError:
        pass


def reset_for_tests(client=None) -> None:
    global _client_singleton
    _client_singleton = client
    with _lock:
        _cache.clear()
