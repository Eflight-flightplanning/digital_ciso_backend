"""CIS Oracle SaaS (identity domain + Fusion) assessment results, per tenant.

Like the nca app, rows carry a plain tenant_id and every query filters on it.
"""
from django.db import models
from django.db.models import Q
from django.utils import timezone


class Status(models.TextChoices):
    PASS = "PASS", "PASS"
    FAIL = "FAIL", "FAIL"
    MANUAL = "MANUAL", "MANUAL"


class OcisRun(models.Model):
    RUNNING = "running"
    FINISHED = "finished"
    FAILED = "failed"
    STATE_CHOICES = [(RUNNING, "running"), (FINISHED, "finished"), (FAILED, "failed")]

    tenant_id = models.UUIDField(db_index=True)
    started_at = models.DateTimeField(default=timezone.now)
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATE_CHOICES, default=RUNNING)
    started_by = models.CharField(max_length=255, blank=True, default="")
    trigger = models.CharField(max_length=10, default="web")  # web | command
    tenant_name = models.CharField(max_length=255, blank=True, default="")  # identity domain host label
    counts = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True, default="")

    class Meta:
        db_table = "oracle_cis_run"
        ordering = ["-started_at"]
        constraints = [
            # One running assessment per tenant.
            models.UniqueConstraint(fields=["tenant_id"], condition=Q(status="running"), name="oracle_cis_one_running_run"),
        ]

    def __str__(self):
        return f"Oracle CIS run {self.pk} ({self.status})"


class OcisResult(models.Model):
    run = models.ForeignKey(OcisRun, related_name="results", on_delete=models.CASCADE)
    control_id = models.CharField(max_length=16)  # CIS id, e.g. "2.2"
    check_id = models.CharField(max_length=100)
    title = models.CharField(max_length=300)
    level = models.CharField(max_length=2)  # L1 | L2
    section = models.CharField(max_length=2)
    section_name = models.CharField(max_length=100)
    severity = models.CharField(max_length=16)  # assessor-assigned, from severity.json
    automation = models.CharField(max_length=10)  # automated | partial | none
    raw_status = models.CharField(max_length=64)  # exactly what the check returned
    status = models.CharField(max_length=8, choices=Status.choices)
    flags = models.JSONField(default=list, blank=True)
    reason = models.TextField(blank=True, default="")
    checked_at = models.DateTimeField(null=True, blank=True)
    evidence = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "oracle_cis_result"
        indexes = [models.Index(fields=["run", "control_id"])]
        constraints = [models.UniqueConstraint(fields=["run", "control_id"], name="oracle_cis_one_result_per_control")]


class OcisIdentity(models.Model):
    """One account on a run's dormant (1.14), active or ghost-employee (5.3.7) list: the full list, not the evidence sample."""

    DORMANT = "dormant"
    ACTIVE = "active"  # signed in within the dormancy threshold (the rest of the accounts 1.14 evaluated)
    GHOST = "ghost"
    KINDS = [(DORMANT, "Dormant account"), (ACTIVE, "Active account"), (GHOST, "Potential ghost employee")]

    run = models.ForeignKey(OcisRun, related_name="identities", on_delete=models.CASCADE)
    tenant_id = models.UUIDField(db_index=True)
    kind = models.CharField(max_length=10, choices=KINDS)
    control_id = models.CharField(max_length=16)
    username = models.CharField(max_length=255)
    guid = models.CharField(max_length=64, blank=True, default="")  # Fusion userAccounts GUID, needed for remediation
    details = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "oracle_cis_identity"
        indexes = [models.Index(fields=["run", "kind"]), models.Index(fields=["tenant_id", "kind", "username"])]
        ordering = ["id"]


class OcisRemediation(models.Model):
    """A remediation request against the Fusion pod: staged (recorded only) or executed."""

    SUSPEND_USER = "suspend_user"
    REVOKE_ROLE = "revoke_role"
    ACTIONS = [(SUSPEND_USER, "Suspend account"), (REVOKE_ROLE, "Revoke role")]
    STAGED, EXECUTED, FAILED = "staged", "executed", "failed"

    identity = models.ForeignKey(OcisIdentity, related_name="remediations", on_delete=models.CASCADE)
    tenant_id = models.UUIDField(db_index=True)
    action = models.CharField(max_length=20, choices=ACTIONS)
    role_code = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=10, default=STAGED)
    request = models.JSONField(default=dict)  # method, endpoint, payload (no credentials)
    error = models.TextField(blank=True, default="")
    user = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now)
    executed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "oracle_cis_remediation"
        ordering = ["-created_at"]


class OcisJiraTicket(models.Model):
    """A Jira issue raised for an identity finding through the platform's Jira integration.

    The same issue is also recorded as an api.RemediationExecution (remediation_execution_id), so it shows
    in the platform's remediation tracker.
    """

    identity = models.ForeignKey(OcisIdentity, related_name="tickets", on_delete=models.CASCADE)
    tenant_id = models.UUIDField(db_index=True)
    key = models.CharField(max_length=40)
    url = models.URLField(max_length=500)
    summary = models.CharField(max_length=255)
    status = models.CharField(max_length=60, blank=True, default="")
    status_category = models.CharField(max_length=20, blank=True, default="")  # new | indeterminate | done
    assignee = models.CharField(max_length=255, blank=True, default="")
    priority = models.CharField(max_length=40, blank=True, default="")
    remediation_execution_id = models.UUIDField(null=True, blank=True)
    user = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now)
    synced_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "oracle_cis_jira_ticket"
        ordering = ["-created_at"]
