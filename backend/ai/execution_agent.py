"""
Remediation Execution Agent (Jira-Based Task Orchestration).

Transforms AI-generated remediation recommendations into structured Jira Cloud tickets
with complete security context, assigned owners, and end-to-end lifecycle tracking.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from django.utils import timezone as django_tz

from api.jira_service import JiraService, JiraServiceError
from api.models import (
    DecisionLog,
    Finding,
    Integration,
    RemediationExecution,
    RemediationPlaybook,
    SecurityDecision,
    User,
)
from api.remediation_adapters.jira_adapter import JiraRemediationAdapter

logger = logging.getLogger(__name__)


class ExecutionPermissionError(Exception):
    """Raised when execution is attempted on an unapproved playbook."""
    pass


class RemediationExecutionAgent:
    """
    Autonomous Execution Agent for orchestrating remediation via Jira Cloud.
    """

    def validate_approval(self, playbook: RemediationPlaybook) -> None:
        """
        Verify that a playbook has been explicitly approved by a human administrator.
        """
        if playbook.approval_status != RemediationPlaybook.ApprovalStatus.APPROVED:
            raise ExecutionPermissionError(
                f"Playbook {playbook.id} cannot be executed. Current status is "
                f"'{playbook.approval_status}'. Human approval is strictly required before ticket creation."
            )

    def execute(
        self,
        playbook: RemediationPlaybook,
        executed_by: User | None = None,
        project_key: str | None = None,
        assignee_id: str | None = None,
        priority: str = "Medium",
    ) -> dict[str, Any]:
        """
        Executes remediation by creating a structured Jira ticket and assigning it to the owner.
        """
        self.validate_approval(playbook)

        tenant = playbook.tenant
        integration = Integration.objects.filter(
            tenant=tenant,
            integration_type=Integration.IntegrationChoices.JIRA,
            enabled=True,
        ).first()

        if not integration:
            raise JiraServiceError("Jira integration is not configured or enabled for this organization.")

        jira_service = JiraService.from_integration(integration)
        adapter = JiraRemediationAdapter(jira_service)

        finding = Finding.objects.filter(id=playbook.finding_id).first()
        check_metadata = finding.check_metadata if finding else {}
        resource = finding.resources.first() if finding and finding.resources.exists() else None

        # Build payload for structured Jira ticket
        description_data = {
            "finding_title": check_metadata.get("checktitle") or finding.title if finding else playbook.title,
            "check_id": finding.check_id if finding else "security_check",
            "provider": finding.scan.provider.provider if (finding and finding.scan and finding.scan.provider) else "cloud",
            "region": resource.region if resource else "",
            "resource_uid": resource.uid if resource else "",
            "resource_name": resource.name if resource else "",
            "severity": finding.severity if finding else "medium",
            "risk_score": 85 if (finding and finding.severity == "critical") else 70,
            "risk_summary": check_metadata.get("risk", ""),
            "compliance_rules": finding.compliance if finding else [],
            "recommended_fix": playbook.title,
            "code_snippet": playbook.code_snippet,
            "ai_reasoning": "Remediation synthesized based on CIS Benchmark & NCA compliance standards.",
            "evidence": finding.status_extended if finding else "Identified via Prowler assessment scan.",
            "validation_steps": [
                "Apply recommended configuration change.",
                "Verify resource state in cloud provider console.",
                "Run an on-demand Digital CISO scan to confirm finding passes.",
            ],
        }

        # Project key selection
        p_key = project_key or integration.configuration.get("default_project") or "SEC"
        issue_type = integration.configuration.get("default_issue_type", "Task")
        prio = priority or integration.configuration.get("default_priority", "Medium")

        now_iso = django_tz.now().isoformat()
        timeline = [
            {
                "stage": "recommendation_generated",
                "timestamp": now_iso,
                "title": "AI Remediation Generated",
                "description": f"Generated remediation playbook for {description_data['check_id']}.",
                "actor": "Digital CISO AI",
                "status": "COMPLETED",
            },
            {
                "stage": "user_approved",
                "timestamp": now_iso,
                "title": "Remediation Approved",
                "description": f"Approved by {executed_by.email if executed_by else 'Admin'}.",
                "actor": executed_by.email if executed_by else "Admin",
                "status": "COMPLETED",
            },
        ]

        ticket_res = adapter.create_remediation_ticket(
            project_key=p_key,
            summary=f"Remediation: {playbook.title}",
            description_data=description_data,
            issue_type=issue_type,
            priority=prio,
            assignee_id=assignee_id,
            labels=["digital-ciso", "prowler", description_data["provider"].lower(), description_data["severity"].lower()],
        )

        timeline.append({
            "stage": "ticket_created",
            "timestamp": django_tz.now().isoformat(),
            "title": f"Jira Issue Created: {ticket_res['key']}",
            "description": f"Published to Jira project {p_key}.",
            "actor": "Digital CISO Jira Adapter",
            "status": "COMPLETED",
        })

        # Create RemediationExecution record
        execution = RemediationExecution.objects.create(
            tenant=tenant,
            finding_id=playbook.finding_id,
            playbook=playbook,
            issue_key=ticket_res["key"],
            issue_url=ticket_res["url"],
            issue_id=ticket_res.get("id"),
            project_key=p_key,
            summary=playbook.title,
            description=playbook.code_snippet,
            status=RemediationExecution.ExecutionStatus.IN_PROGRESS,
            jira_status="To Do",
            jira_status_category="new",
            priority=prio,
            labels=["digital-ciso", "prowler", description_data["provider"].lower()],
            ai_payload=description_data,
            timeline=timeline,
            last_synced_at=django_tz.now(),
        )

        # Update playbook
        playbook.approval_status = RemediationPlaybook.ApprovalStatus.EXECUTED_SUCCESS
        playbook.executed_at = django_tz.now()
        playbook.executed_by = executed_by
        playbook.execution_output = f"Jira ticket created successfully: {ticket_res['key']} ({ticket_res['url']})"
        playbook.save()

        # Audit log in DecisionLog
        DecisionLog.objects.create(
            tenant_id=tenant.id,
            review_id=playbook.id,
            finding_check_id=description_data["check_id"],
            analyst_id=executed_by.id if executed_by else None,
            analyst_email=executed_by.email if executed_by else "system@securityplatform.ai",
            decision="JIRA_DISPATCH",
            previous_status="PENDING",
            new_status="TICKET_CREATED",
            rationale_summary=f"Created Jira remediation ticket {ticket_res['key']}",
            provider_type=description_data["provider"],
            severity=description_data["severity"].upper(),
        )

        return {
            "status": "SUCCESS",
            "issue_key": ticket_res["key"],
            "issue_url": ticket_res["url"],
            "execution_id": str(execution.id),
        }


execution_agent = RemediationExecutionAgent()