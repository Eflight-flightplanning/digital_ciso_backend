"""The only way application code touches a client's files.

ClientFiles checks, every time it is built, that there is a client and that the user belongs to it.
The client always comes from the sign-in, so a request cannot name another client's container.
"""
import hashlib
import logging
import uuid
from pathlib import PurePosixPath

from django.db import connections
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from api.client_storage import get_storage

from . import perms
from .models import ClientContainer, ClientFile

logger = logging.getLogger("client_store")

UPLOAD_CATEGORIES = ("documents", "evidence")  # reports are written by the system only
ALLOWED_EXT = {".pdf", ".png", ".jpg", ".jpeg", ".txt", ".csv", ".md", ".docx", ".xlsx", ".pptx"}
MAX_BYTES = 10 * 1024 * 1024


class TooLarge(Exception):
    pass


def _admin_alias() -> str:
    # Provisioning runs before any client is selected, so it uses the admin login where one exists.
    return "admin" if "admin" in connections.databases else "default"


def provision(tenant_id) -> ClientContainer:
    """Create the client's container and remember it. Safe to call again."""
    tenant_id = uuid.UUID(str(tenant_id))
    storage = get_storage()
    made = storage.create_client(tenant_id)
    row, _ = ClientContainer.objects.using(_admin_alias()).update_or_create(
        tenant_id=tenant_id, defaults={"backend": storage.backend, "name": made["name"],
                                       "encryption_scope": made["encryption_scope"]})
    return row


def deprovision(tenant_id) -> None:
    """The approved client deletion: every file, the container, its key and its records."""
    tenant_id = uuid.UUID(str(tenant_id))
    get_storage().delete_client(tenant_id)
    alias = _admin_alias()
    ClientFile.objects.using(alias).filter(tenant_id=tenant_id).delete()
    ClientContainer.objects.using(alias).filter(tenant_id=tenant_id).delete()


def record_system_file(tenant_id, key, *, name, size, sha256="", content_type="", category, by="system") -> None:
    """Remember a file the app itself stored (a report, or evidence saved by its own screen)."""
    ClientFile.objects.update_or_create(tenant_id=tenant_id, key=key, defaults={
        "category": category, "name": name[:255], "size": size, "sha256": sha256,
        "content_type": content_type[:100], "uploaded_by": by[:255]})


class ClientFiles:
    def __init__(self, tenant_id, user):
        if not tenant_id:
            raise PermissionDenied("No client is selected.")
        self.tenant_id = uuid.UUID(str(tenant_id))
        if not perms.is_member(user, self.tenant_id):
            raise PermissionDenied("You are not a member of this client.")
        self.actor = getattr(user, "email", None) or str(user)
        self.storage = get_storage()

    def _row(self, file_id) -> ClientFile:
        row = ClientFile.objects.filter(pk=file_id, tenant_id=self.tenant_id).first()
        if not row:
            raise NotFound()
        return row

    def list(self, category=None):
        rows = ClientFile.objects.filter(tenant_id=self.tenant_id)
        return rows.filter(category=category) if category else rows

    def upload(self, category, upload) -> ClientFile:
        if category not in UPLOAD_CATEGORIES:
            raise ValidationError({"category": f"Must be one of: {', '.join(UPLOAD_CATEGORIES)}."})
        if upload is None:
            raise ValidationError({"file": "Choose a file."})
        extension = PurePosixPath(upload.name).suffix.lower()
        if extension not in ALLOWED_EXT:
            raise ValidationError({"file": "That file type isn't allowed."})
        if upload.size > MAX_BYTES:
            raise ValidationError({"file": "The file is larger than 10 MB."})
        if not ClientContainer.objects.filter(tenant_id=self.tenant_id).exists():
            provision(self.tenant_id)

        digest, counted = hashlib.sha256(), [0]

        def chunks():
            for chunk in upload.chunks():
                counted[0] += len(chunk)
                if counted[0] > MAX_BYTES:  # the declared size is the sender's claim, so count as well
                    raise TooLarge()
                digest.update(chunk)
                yield chunk

        try:
            key = self.storage.save(self.tenant_id, category, upload.name, chunks())
        except TooLarge:
            raise ValidationError({"file": "The file is larger than 10 MB."}) from None
        try:
            row = ClientFile.objects.create(
                tenant_id=self.tenant_id, category=category, key=key, name=PurePosixPath(key).name.split("_", 1)[1],
                size=counted[0], sha256=digest.hexdigest(), content_type=(upload.content_type or "")[:100],
                uploaded_by=self.actor)
        except Exception:
            self.storage.delete(self.tenant_id, key)  # never leave a file the database doesn't know about
            raise
        logger.info("client file uploaded", extra={"tenant_id": str(self.tenant_id), "file_id": str(row.id)})
        return row

    def open(self, file_id):
        row = self._row(file_id)
        try:
            return row, self.storage.open(self.tenant_id, row.key)
        except FileNotFoundError:
            raise NotFound() from None

    def delete(self, file_id) -> None:
        row = self._row(file_id)
        self.storage.delete(self.tenant_id, row.key)
        row.delete()
        logger.info("client file deleted", extra={"tenant_id": str(self.tenant_id), "file_id": str(file_id)})
