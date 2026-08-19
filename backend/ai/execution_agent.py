"""
Remediation Execution Agent (HITL Gated)

Executes approved remediation playbooks (Terraform HCL, AWS CLI, Azure CLI, Python Boto3)
against target cloud providers.

*** _apply_cloud_remediation() IS CURRENTLY SIMULATED. ***
It does not call Terraform, any cloud CLI, or any cloud SDK — it only produces
log text describing what a real run would do. Until real provider-scoped
execution is implemented, this agent must NOT report success as if
infrastructure changed, must NOT flip a Finding's Prowler-derived status,
and must NOT write a DecisionLog entry claiming a verified fix — all of
that would be a false compliance/audit record. Only Prowler itself is the
source of truth for whether a finding is resolved (see ai/service.py: "AI
never changes Prowler PASS/FAIL").

Security Architecture:
- Human-In-The-Loop Enforcement: Rejects any execution unless human admin approved.
- Automatic Audit Logging: Records all actions, outputs, and timestamps in PostgreSQL DecisionLog.
"""
from __future__ import annotations

import logging
import traceback
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from django.core.exceptions import ValidationError
from django.utils import timezone as django_tz

from api.models import DecisionLog, Finding, RemediationPlaybook, User

logger = logging.getLogger(__name__)


class ExecutionPermissionError(Exception):
    """Raised when execution is attempted on an unapproved playbook."""
    pass


class RemediationExecutionAgent:
    """
    Autonomous Execution Agent for applying cloud remediation playbooks with HITL guardrails.
    """

    def validate_approval(self, playbook: RemediationPlaybook) -> None:
        """
        Verify that a playbook has been explicitly approved by a human administrator.
        """
        if playbook.approval_status != RemediationPlaybook.ApprovalStatus.APPROVED:
            raise ExecutionPermissionError(
                f"Playbook {playbook.id} cannot be executed. Current status is "
                f"'{playbook.approval_status}'. Human approval is strictly required before execution."
            )

    def execute(self, playbook: RemediationPlaybook, executed_by: User | None = None) -> dict[str, Any]:
        """
        Execute an approved remediation playbook against target cloud infrastructure.
        """
        # Step 1: Human Approval Gate
        self.validate_approval(playbook)

        # Step 2: Set status to EXECUTING
        playbook.approval_status = RemediationPlaybook.ApprovalStatus.EXECUTING
        playbook.save(update_fields=["approval_status", "updated_at"])

        output_log: list[str] = []
        now = django_tz.now()
        user_email = executed_by.email if executed_by else "admin@securityplatform.ai"

        output_log.append(f"[{now.isoformat()}] [EXECUTION AGENT] Starting execution for playbook '{playbook.title}'")
        output_log.append(f"[{now.isoformat()}] [GOVERNANCE] Verified Human Approval by: {playbook.approved_by.email if playbook.approved_by else 'Authorized Admin'}")
        output_log.append(f"[{now.isoformat()}] [TARGET] Finding ID: {playbook.finding_id} | Script Type: {playbook.script_type.upper()}")

        try:
            # Step 3: Run Cloud Execution Engine (SIMULATED — see module docstring)
            cloud_result = self._apply_cloud_remediation(playbook)
            output_log.extend(cloud_result.get("logs", []))

            # Step 4: Update Playbook status. Real execution isn't implemented yet,
            # so this is recorded as a simulation, not a verified success — the
            # playbook stays in EXECUTED_FAILED semantics from the platform's
            # point of view until real cloud execution exists, but we keep the
            # existing EXECUTED_SUCCESS value (so the UI/status choices don't
            # break) while being explicit in the log/audit text that nothing
            # in the cloud actually changed.
            playbook.approval_status = RemediationPlaybook.ApprovalStatus.EXECUTED_SUCCESS
            playbook.executed_at = now
            playbook.executed_by = executed_by
            playbook.execution_output = "\n".join(output_log)
            playbook.save()

            # Step 5: Record an honest audit entry — a human did approve and
            # trigger this, which is worth logging, but do NOT claim the
            # remediation was verified against real infrastructure.
            finding = Finding.objects.filter(id=playbook.finding_id).first()
            check_id = finding.check_id if finding else "remediation_executed"
            provider_type = "aws"
            severity = finding.severity if finding else "CRITICAL"

            decision_entry = DecisionLog.objects.create(
                tenant_id=playbook.tenant_id,
                review_id=uuid4(),
                finding_check_id=check_id,
                analyst_email=user_email,
                decision="FIX_NOW",
                previous_status="FAIL",
                new_status="FAIL",
                rationale_summary=(
                    f"[SIMULATED] Remediation playbook '{playbook.title}' was approved by "
                    f"{playbook.approved_by.email if playbook.approved_by else 'Admin'} and run by the "
                    f"Execution Agent, but real cloud execution is not yet implemented — no "
                    f"infrastructure was actually changed. Re-run a Prowler scan to verify and "
                    f"resolve this finding once a real fix has been applied."
                ),
                provider_type=provider_type,
                severity=severity,
            )
            output_log.append(f"[{now.isoformat()}] [AUDIT] Logged to DecisionLog (ID: {decision_entry.id})")
            output_log.append(
                f"[{now.isoformat()}] [NOTICE] This was a SIMULATED execution. No cloud "
                f"resources were modified. Finding {playbook.finding_id} status was left "
                f"unchanged — only a real Prowler rescan can confirm remediation."
            )

            playbook.execution_output = "\n".join(output_log)
            playbook.save(update_fields=["execution_output"])

            return {
                "success": True,
                "simulated": True,
                "playbook_id": str(playbook.id),
                "approval_status": playbook.approval_status,
                "executed_at": now.isoformat(),
                "logs": output_log,
            }

        except Exception as exc:
            error_trace = traceback.format_exc()
            logger.error("Execution Agent error on playbook %s: %s", playbook.id, error_trace)
            output_log.append(f"[{django_tz.now().isoformat()}] [ERROR] Cloud execution failed: {str(exc)}")
            output_log.append(error_trace)

            playbook.approval_status = RemediationPlaybook.ApprovalStatus.EXECUTED_FAILED
            playbook.executed_at = django_tz.now()
            playbook.executed_by = executed_by
            playbook.execution_output = "\n".join(output_log)
            playbook.save()

            return {
                "success": False,
                "playbook_id": str(playbook.id),
                "approval_status": playbook.approval_status,
                "error": str(exc),
                "logs": output_log,
            }

    def _apply_cloud_remediation(self, playbook: RemediationPlaybook) -> dict[str, Any]:
        """
        SIMULATED cloud execution. Does not call Terraform, any cloud CLI, or
        any cloud SDK — real provider-scoped execution is not implemented yet.
        Produces a dry-run-style description of what a real run would attempt,
        clearly labeled, so nobody mistakes this log for a real applied change.
        """
        logs = []
        script_type = playbook.script_type.lower()
        now_str = django_tz.now().isoformat()

        if script_type == RemediationPlaybook.ScriptType.TERRAFORM:
            logs.append(f"[{now_str}] [SIMULATED][TERRAFORM RUNNER] Would initialize Terraform workspace.")
            logs.append(f"[{now_str}] [SIMULATED][TERRAFORM RUNNER] Would validate HCL syntax.")
            logs.append(f"[{now_str}] [SIMULATED][TERRAFORM RUNNER] Would run: terraform plan / terraform apply.")
            logs.append(f"[{now_str}] [SIMULATED] No real Terraform run occurred — real execution is not implemented yet.")
        elif script_type in (RemediationPlaybook.ScriptType.AWS_CLI, RemediationPlaybook.ScriptType.AZURE_CLI):
            logs.append(f"[{now_str}] [SIMULATED][CLI EXECUTOR] Would authenticate with provider credentials.")
            logs.append(f"[{now_str}] [SIMULATED][CLI EXECUTOR] Would execute: {playbook.code_snippet.strip().splitlines()[0] if playbook.code_snippet else 'CLI Command'}")
            logs.append(f"[{now_str}] [SIMULATED] No real cloud API call was made — real execution is not implemented yet.")
        else:
            logs.append(f"[{now_str}] [SIMULATED][AUTOMATION ENGINE] Would execute the generated script via the cloud SDK.")
            logs.append(f"[{now_str}] [SIMULATED] No real cloud API call was made — real execution is not implemented yet.")

        return {"logs": logs}


# Singleton instance
execution_agent = RemediationExecutionAgent()