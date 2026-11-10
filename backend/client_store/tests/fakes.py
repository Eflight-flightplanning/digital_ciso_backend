"""In-memory stand-ins for the Azure clients, with the same calls and errors the real ones give."""
import types
import uuid

from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError


class FakeBlobService:
    def __init__(self):
        self.containers = {}  # name -> {"options": {...}, "blobs": {key: bytes}}

    def get_container_client(self, name):
        return _Container(self, name)

    def get_blob_client(self, container, blob):
        return _Blob(self, container, blob)


class _Container:
    def __init__(self, service, name):
        self.service, self.name = service, name

    def create_container(self, **options):
        if self.name in self.service.containers:
            raise ResourceExistsError("exists")
        self.service.containers[self.name] = {"options": options, "blobs": {}}

    def delete_container(self):
        if self.service.containers.pop(self.name, None) is None:
            raise ResourceNotFoundError("missing")

    def list_blobs(self, name_starts_with=""):
        if self.name not in self.service.containers:
            raise ResourceNotFoundError("missing")
        blobs = self.service.containers[self.name]["blobs"]
        return [types.SimpleNamespace(name=key, size=len(data)) for key, data in blobs.items() if key.startswith(name_starts_with)]


class _Blob:
    def __init__(self, service, container, key):
        self.service, self.container, self.key = service, container, key

    def _blobs(self):
        if self.container not in self.service.containers:
            raise ResourceNotFoundError("no container")
        return self.service.containers[self.container]["blobs"]

    def upload_blob(self, data, overwrite=False):
        blobs = self._blobs()
        if self.key in blobs and not overwrite:
            raise ResourceExistsError("exists")
        blobs[self.key] = data if isinstance(data, bytes) else b"".join(data)

    def exists(self):
        return self.key in self.service.containers.get(self.container, {"blobs": {}})["blobs"]

    def download_blob(self):
        blobs = self._blobs()
        if self.key not in blobs:
            raise ResourceNotFoundError("missing")
        return types.SimpleNamespace(readall=lambda: blobs[self.key])

    def delete_blob(self):
        if self._blobs().pop(self.key, None) is None:
            raise ResourceNotFoundError("missing")


class FakeKeys:
    def __init__(self):
        self.keys, self.deleted = {}, []

    def get_key(self, name):
        if name not in self.keys:
            raise ResourceNotFoundError("missing")
        return self.keys[name]

    def create_rsa_key(self, name, size):
        self.keys[name] = types.SimpleNamespace(id=f"https://vault.test/keys/{name}/{uuid.uuid4().hex}", size=size)
        return self.keys[name]

    def begin_delete_key(self, name):
        self.deleted.append(name)


class FakeScopes:
    def __init__(self):
        self.scopes = {}

    def put(self, resource_group, account, name, scope):
        self.scopes[name] = scope

    def patch(self, resource_group, account, name, scope):
        if name not in self.scopes:
            raise ResourceNotFoundError("missing")
        self.scopes[name].state = scope.state
