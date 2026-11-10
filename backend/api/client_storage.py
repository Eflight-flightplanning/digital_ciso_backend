"""One place for files that belong to a client: evidence and test reports.

Each client gets its own area. A file is stored and read by (client, key), so one client's key
cannot reach another client's file. Locally an area is a folder under CLIENT_FILES_DIR. With
CLIENT_STORAGE_BACKEND=azure it is a private Blob Storage container (see client_storage_azure).
Both have the same methods, so nothing that calls this module depends on which one is used.
"""
import functools
import os
import re
import shutil
import uuid
from pathlib import Path

from django.conf import settings

_CATEGORY = re.compile(r"^[a-z0-9_-]{1,40}$")


class LocalClientStorage:
    backend = "local"

    def __init__(self, root):
        self.root = Path(root).resolve()

    def _client_root(self, tenant_id) -> Path:
        return self.root / str(uuid.UUID(str(tenant_id)))

    def _path(self, tenant_id, key: str) -> Path:
        base = self._client_root(tenant_id).resolve()
        path = (base / key).resolve()
        if not path.is_relative_to(base) or path == base:
            raise PermissionError("That file is outside this client's storage.")
        return path

    def save(self, tenant_id, category: str, name: str, chunks) -> str:
        """Store the chunks and return the key to keep on the database row."""
        if not _CATEGORY.match(category):
            raise ValueError("Unknown storage category.")
        safe = re.sub(r"[^A-Za-z0-9._-]", "_", Path(name).name)[:100].lstrip(".") or "file"
        key = f"{category}/{uuid.uuid4()}_{safe}"
        path = self._path(tenant_id, key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "xb") as out:
            for chunk in chunks:
                out.write(chunk)
        return key

    def create_client(self, tenant_id) -> dict:
        """Make the client's own area. Called when a client is created."""
        folder = self._client_root(tenant_id)
        folder.mkdir(parents=True, exist_ok=True)
        return {"name": folder.name, "encryption_scope": ""}

    def put(self, tenant_id, key: str, data: bytes) -> None:
        """Store under a fixed key, replacing any earlier copy in one step."""
        path = self._path(tenant_id, key)
        path.parent.mkdir(parents=True, exist_ok=True)
        partial = path.with_name(f"{path.name}.{uuid.uuid4().hex}.partial")
        try:
            partial.write_bytes(data)
            os.replace(partial, path)
        finally:
            partial.unlink(missing_ok=True)

    def list_files(self, tenant_id, prefix: str) -> list[tuple[str, int]]:
        """(key, size) of this client's files under a folder."""
        folder = self._path(tenant_id, prefix)
        if not folder.is_dir():
            return []
        base = self._client_root(tenant_id).resolve()
        return [(f.relative_to(base).as_posix(), f.stat().st_size) for f in sorted(folder.rglob("*"))
                if f.is_file() and not f.name.endswith(".partial")]

    def exists(self, tenant_id, key: str) -> bool:
        return self._path(tenant_id, key).is_file()

    def open(self, tenant_id, key: str):
        return open(self._path(tenant_id, key), "rb")

    def delete(self, tenant_id, key: str) -> None:
        self._path(tenant_id, key).unlink(missing_ok=True)

    def delete_client(self, tenant_id) -> None:
        """Remove every file for one client, for offboarding."""
        folder = self._client_root(tenant_id)
        if folder.exists():
            shutil.rmtree(folder)


@functools.lru_cache(maxsize=1)
def _azure_storage():
    from api.client_storage_azure import build_azure_storage

    return build_azure_storage()


def get_storage():
    backend = getattr(settings, "CLIENT_STORAGE_BACKEND", "local")
    if backend == "azure":
        return _azure_storage()
    if backend != "local":
        raise ValueError("CLIENT_STORAGE_BACKEND must be local or azure.")
    root = getattr(settings, "CLIENT_FILES_DIR", None) or Path(settings.BASE_DIR) / "client_files"
    return LocalClientStorage(root)
