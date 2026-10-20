import uuid

from django.db import models


class NcaAssessment(models.Model):
    class Status(models.TextChoices):
        RUNNING = "running"
        COMPLETED = "completed"
        FAILED = "failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.UUIDField(null=True, db_index=True)
    frameworks = models.JSONField(default=list)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.RUNNING)
    mode = models.CharField(max_length=16, default="read-only")
    progress = models.FloatField(default=0)
    triggered_by = models.CharField(max_length=255, blank=True, default="")
    oci_profile = models.CharField(max_length=128, blank=True, default="")
    tenancy_ocid = models.CharField(max_length=255, blank=True, default="")
    tenancy_name = models.CharField(max_length=255, blank=True, default="")
    regions = models.JSONField(default=list)
    discovery = models.JSONField(default=dict)
    summary = models.JSONField(default=dict)
    error = models.TextField(blank=True, default="")
    engine_version = models.CharField(max_length=64, blank=True, default="")
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True)

    class Meta:
        db_table = "nca_assessment"
        ordering = ["-started_at"]


class NcaCheckRun(models.Model):
    """Aggregated outcome of one check across all regions/compartments."""

    assessment = models.ForeignKey(NcaAssessment, on_delete=models.CASCADE, related_name="check_runs")
    check_id = models.CharField(max_length=255)
    source = models.CharField(max_length=16, default="prowler")  # prowler | native
    service = models.CharField(max_length=64, blank=True, default="")
    title = models.TextField(blank=True, default="")
    severity = models.CharField(max_length=16, default="medium")
    status = models.CharField(max_length=16)
    reason = models.CharField(max_length=64, blank=True, default="")
    message = models.TextField(blank=True, default="")
    counts = models.JSONField(default=dict)
    errors = models.JSONField(default=list)
    remediation_text = models.TextField(blank=True, default="")
    remediation_cli = models.TextField(blank=True, default="")
    remediation_manual = models.TextField(blank=True, default="")
    duration_ms = models.IntegerField(default=0)

    class Meta:
        db_table = "nca_check_run"
        unique_together = [("assessment", "check_id")]
        indexes = [models.Index(fields=["assessment", "status"])]


class NcaFinding(models.Model):
    """Resource-level result of a check (Prowler-style finding)."""

    assessment = models.ForeignKey(NcaAssessment, on_delete=models.CASCADE, related_name="findings")
    check_run = models.ForeignKey(NcaCheckRun, on_delete=models.CASCADE, related_name="findings")
    check_id = models.CharField(max_length=255)
    status = models.CharField(max_length=16)
    severity = models.CharField(max_length=16, default="medium")
    resource_id = models.TextField(blank=True, default="")
    resource_name = models.TextField(blank=True, default="")
    resource_type = models.CharField(max_length=128, blank=True, default="")
    region = models.CharField(max_length=64, blank=True, default="")
    compartment_id = models.TextField(blank=True, default="")
    status_extended = models.TextField(blank=True, default="")
    evidence = models.JSONField(default=dict)

    class Meta:
        db_table = "nca_finding"
        indexes = [models.Index(fields=["assessment", "check_id", "status"])]


class NcaControlResult(models.Model):
    assessment = models.ForeignKey(NcaAssessment, on_delete=models.CASCADE, related_name="control_results")
    framework = models.CharField(max_length=64)
    control_id = models.CharField(max_length=32)
    name = models.TextField(blank=True, default="")
    section = models.CharField(max_length=255, blank=True, default="")
    subsection = models.CharField(max_length=255, blank=True, default="")
    assessment_type = models.CharField(max_length=16, default="Manual")
    scope = models.CharField(max_length=16, default="partial")
    status = models.CharField(max_length=16)
    reason = models.CharField(max_length=64, blank=True, default="")
    automated_result = models.CharField(max_length=16, null=True)
    manual_state = models.CharField(max_length=24, blank=True, default="")
    check_ids = models.JSONField(default=list)
    check_statuses = models.JSONField(default=dict)
    severity = models.CharField(max_length=16, blank=True, default="")

    class Meta:
        db_table = "nca_control_result"
        unique_together = [("assessment", "framework", "control_id")]
        indexes = [models.Index(fields=["assessment", "framework", "status"])]


class NcaSubcontrolResult(models.Model):
    """Result for one row of the ECC-2:2024 Cloud API Automation Mapping workbook (sub-control level)."""

    assessment = models.ForeignKey(NcaAssessment, on_delete=models.CASCADE, related_name="subcontrol_results")
    framework = models.CharField(max_length=64, default="nca_ecc_2.2024")
    row_id = models.CharField(max_length=64)
    sub_control = models.CharField(max_length=32)
    control_id = models.CharField(max_length=32)
    category = models.CharField(max_length=128, blank=True, default="")
    api_check = models.TextField()
    description = models.TextField(blank=True, default="")
    workbook_automation = models.CharField(max_length=16, blank=True, default="")
    mapping_coverage = models.CharField(max_length=16, blank=True, default="")
    pass_condition = models.TextField(blank=True, default="")
    fail_condition = models.TextField(blank=True, default="")
    oci_api = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")
    status = models.CharField(max_length=16)
    reason = models.CharField(max_length=64, blank=True, default="")
    automated_result = models.CharField(max_length=16, null=True)
    check_ids = models.JSONField(default=list)
    check_statuses = models.JSONField(default=dict)

    class Meta:
        db_table = "nca_subcontrol_result"
        unique_together = [("assessment", "row_id")]
        indexes = [models.Index(fields=["assessment", "status"])]


class NcaManualEvidence(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.UUIDField(null=True, db_index=True)
    framework = models.CharField(max_length=64)
    control_id = models.CharField(max_length=32)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    url = models.URLField(blank=True, default="", max_length=1000)
    file_name = models.CharField(max_length=255, blank=True, default="")
    file_path = models.CharField(max_length=500, blank=True, default="")
    file_sha256 = models.CharField(max_length=64, blank=True, default="")
    submitted_by = models.CharField(max_length=255)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "nca_manual_evidence"
        ordering = ["-submitted_at"]
        indexes = [models.Index(fields=["framework", "control_id"])]


class NcaControlReview(models.Model):
    class Decision(models.TextChoices):
        APPROVED = "approved"
        REJECTED = "rejected"
        NOT_APPLICABLE = "not_applicable"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.UUIDField(null=True, db_index=True)
    framework = models.CharField(max_length=64)
    control_id = models.CharField(max_length=32)
    evidence = models.ForeignKey(NcaManualEvidence, null=True, on_delete=models.SET_NULL, related_name="reviews")
    decision = models.CharField(max_length=20, choices=Decision.choices)
    reviewer = models.CharField(max_length=255)
    comment = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "nca_control_review"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["framework", "control_id"])]


class NcaControlComment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.UUIDField(null=True, db_index=True)
    framework = models.CharField(max_length=64)
    control_id = models.CharField(max_length=32)
    author = models.CharField(max_length=255)
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "nca_control_comment"
        ordering = ["created_at"]
        indexes = [models.Index(fields=["framework", "control_id"])]


class NcaRemediation(models.Model):
    class Status(models.TextChoices):
        PLANNED = "planned"          # dry-run completed
        SUCCEEDED = "succeeded"      # applied and verified
        UNVERIFIED = "unverified"    # applied, post-verification did not confirm
        FAILED = "failed"
        BLOCKED = "blocked"          # refused (authorization / safety gate)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.UUIDField(null=True, db_index=True)
    assessment = models.ForeignKey(NcaAssessment, null=True, on_delete=models.SET_NULL, related_name="remediations")
    check_id = models.CharField(max_length=255)
    resource_id = models.TextField()
    resource_name = models.TextField(blank=True, default="")
    region = models.CharField(max_length=64, blank=True, default="")
    action = models.CharField(max_length=255, blank=True, default="")
    mode = models.CharField(max_length=16)  # dry_run | execute
    status = models.CharField(max_length=16, choices=Status.choices)
    requested_by = models.CharField(max_length=255)
    authorization_reason = models.TextField(blank=True, default="")
    plan = models.JSONField(default=dict)
    before = models.JSONField(default=dict)
    after = models.JSONField(default=dict)
    verification = models.JSONField(default=dict)
    error = models.TextField(blank=True, default="")
    dry_run = models.ForeignKey("self", null=True, on_delete=models.SET_NULL, related_name="executions")
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True)

    class Meta:
        db_table = "nca_remediation"
        ordering = ["-created_at"]


class NcaAuditLog(models.Model):
    """Append-only audit trail for manual workflow and remediation actions."""

    id = models.BigAutoField(primary_key=True)
    tenant_id = models.UUIDField(null=True, db_index=True)
    actor = models.CharField(max_length=255)
    action = models.CharField(max_length=64)
    target = models.CharField(max_length=500, blank=True, default="")
    details = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "nca_audit_log"
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise PermissionError("NcaAuditLog is append-only")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("NcaAuditLog is append-only")
