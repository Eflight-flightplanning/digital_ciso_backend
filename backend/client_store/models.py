"""What the database knows about client files. Row-level security is added in the first migration."""
import uuid

from django.db import models


class ClientContainer(models.Model):
    """Where one client's files live: a folder locally, a private container in Azure."""
    tenant_id = models.UUIDField(primary_key=True)
    backend = models.CharField(max_length=16)
    name = models.CharField(max_length=63, unique=True)
    encryption_scope = models.CharField(max_length=63, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "client_store_container"


class ClientFile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.UUIDField(db_index=True)
    category = models.CharField(max_length=40)
    key = models.CharField(max_length=300)
    name = models.CharField(max_length=255)
    size = models.BigIntegerField(default=0)
    sha256 = models.CharField(max_length=64, blank=True, default="")
    content_type = models.CharField(max_length=100, blank=True, default="")
    uploaded_by = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "client_store_file"
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=("tenant_id", "key"), name="client_store_file_once")]
        indexes = [models.Index(fields=["tenant_id", "category"], name="client_store_file_category")]
