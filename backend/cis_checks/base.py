"""Base classes and helpers shared by every CIS check.

Each check lives in checks/<check_id>/ with two files, the Prowler layout:
  <check_id>.metadata.json   what the control is (CIS id, level, audit and remediation text)
  <check_id>.py              a Check subclass that evaluates it

execute(api, ctx) returns a dict {id, title, status, reason, checked_at, evidence}. The raw
status vocabulary is PASS, FAIL, "FAIL (provisional)", PARTIAL or MANUAL; the runner adds
ERROR when a check raises. The web app maps these onto PASS / FAIL / MANUAL / N/A.
"""
import os
from datetime import datetime, timezone

EXT_USER = "urn:ietf:params:scim:schemas:oracle:idcs:extension:user:User"
EXT_USER_STATE = "urn:ietf:params:scim:schemas:oracle:idcs:extension:userState:User"
EXT_MFA = "urn:ietf:params:scim:schemas:oracle:idcs:extension:mfa:User"
EXT_CAPABILITIES = "urn:ietf:params:scim:schemas:oracle:idcs:extension:capabilities:User"

FEDERATED_NOTE = (
    "Note: sign-in for some or all users is federated to an external identity provider ({names}). "
    "Restrictions configured in that provider are the control point and are not visible from this identity domain."
)


def utc_now():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_time(value):
    """Parse an IDCS timestamp ("2025-01-31T10:00:00.123Z"); None when absent or invalid."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def env_int(name, default):
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def env_list(name, default=""):
    return [v.strip() for v in os.environ.get(name, default).split(",") if v.strip()]


def excluded_actors():
    """Monitoring / service accounts left out of user-activity findings (EXCLUDE_ACTORS)."""
    return {a.lower() for a in env_list("EXCLUDE_ACTORS")}


class Check:
    metadata: dict = {}

    @property
    def cis_id(self):
        return self.metadata["CisId"]

    def execute(self, api, ctx):
        raise NotImplementedError

    def result(self, status, reason, evidence=None):
        return {
            "id": self.cis_id,
            "title": self.metadata["CheckTitle"],
            "status": status,
            "reason": reason,
            "checked_at": iso(utc_now()),
            "evidence": evidence or {},
        }


class ManualCheck(Check):
    """A manual control: checked by the assessor, not by this tool. Stored and shown as MANUAL."""

    def execute(self, api, ctx):
        access = "; ".join(self.metadata.get("RequiredAccess", [])) or "access to the system concerned"
        return self.result(
            "MANUAL",
            f"Manual control: check it with the audit procedure. Needs: {access}.",
            {"audit_procedure": self.metadata.get("AuditProcedure", [])},
        )
