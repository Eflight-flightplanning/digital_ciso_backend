"""
Jira Remediation Adapter.
Implements BaseRemediationAdapter for Jira Cloud task orchestration.
"""
from typing import Any, Dict, List, Optional
from api.jira_service import JiraService
from api.jira_template import build_jira_ticket_adf
from api.remediation_adapters.base import BaseRemediationAdapter


class JiraRemediationAdapter(BaseRemediationAdapter):
    """
    Adapter bridging platform remediation requests to Jira Cloud API.
    """

    def __init__(self, jira_service: JiraService):
        self.service = jira_service

    def test_connection(self) -> Dict[str, Any]:
        return self.service.test_connection()

    def get_projects(self) -> List[Dict[str, Any]]:
        return self.service.get_projects()

    def get_issue_types(self, project_key: Optional[str] = None) -> List[Dict[str, Any]]:
        return self.service.get_issue_types(project_key)

    def get_assignable_users(self, project_key: str, query: str = "") -> List[Dict[str, Any]]:
        return self.service.get_assignable_users(project_key, query)

    def get_priorities(self) -> List[Dict[str, Any]]:
        return self.service.get_priorities()

    def create_remediation_ticket(
        self,
        project_key: str,
        summary: str,
        description_data: Dict[str, Any],
        issue_type: str = "Task",
        priority: str = "Medium",
        assignee_id: Optional[str] = None,
        labels: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        # Build structured ADF
        adf_description = build_jira_ticket_adf(
            finding_title=description_data.get("finding_title", summary),
            check_id=description_data.get("check_id", ""),
            provider=description_data.get("provider", "cloud"),
            region=description_data.get("region", ""),
            resource_uid=description_data.get("resource_uid", ""),
            resource_name=description_data.get("resource_name", ""),
            severity=description_data.get("severity", "medium"),
            risk_score=int(description_data.get("risk_score", 75)),
            risk_summary=description_data.get("risk_summary", ""),
            compliance_rules=description_data.get("compliance_rules", []),
            recommended_fix=description_data.get("recommended_fix", ""),
            code_snippet=description_data.get("code_snippet"),
            ai_reasoning=description_data.get("ai_reasoning"),
            evidence=description_data.get("evidence"),
            validation_steps=description_data.get("validation_steps"),
        )

        return self.service.create_issue(
            project_key=project_key,
            summary=summary,
            description_adf=adf_description,
            issue_type=issue_type,
            priority=priority,
            assignee_account_id=assignee_id,
            labels=labels or ["digital-ciso", "prowler", "remediation"],
        )

    def get_ticket_status(self, ticket_key: str) -> Dict[str, Any]:
        return self.service.get_issue(ticket_key)
