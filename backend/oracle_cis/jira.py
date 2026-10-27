"""Jira through the platform's Jira integration (Integrations page): api.jira_service.JiraService.

The project is the integration's default project. Each ticket is also recorded as an api.RemediationExecution
so it appears in the platform's remediation tracker.
"""
import logging
from datetime import datetime, timezone

log = logging.getLogger(__name__)


def _integration(tenant_id):
    """The Jira integration the platform's own Jira views use (api.v1.jira_views.get_active_jira_service):
    the tenant's, otherwise the first one configured on the platform."""
    from api.models import Integration

    qs = Integration.objects.filter(integration_type=Integration.IntegrationChoices.JIRA)
    return (qs.filter(tenant_id=tenant_id).first() if tenant_id else None) or qs.first()


def settings(tenant_id):
    """{"service": JiraService | None, "project": str, "issue_type": str}; service is None when not configured."""
    from api.jira_service import JiraService

    integration = _integration(tenant_id)
    if integration is None:
        return {"service": None, "project": "", "issue_type": "Task"}
    cfg = integration.configuration or {}
    service = JiraService.from_integration(integration)
    if not (service.base_url and service.email and service.api_token):
        service = None
    return {"service": service, "project": cfg.get("default_project", ""), "issue_type": cfg.get("default_issue_type") or "Task"}


def configured(tenant_id):
    s = settings(tenant_id)
    return bool(s["service"] and s["project"])


def error_text(exc):
    """JiraServiceError carries .message; anything else is shown by type and text."""
    return getattr(exc, "message", None) or f"{type(exc).__name__}: {exc}"[:300]


def adf(paragraphs, code=None):
    """Atlassian Document Format: one paragraph per item, plus an optional code block."""
    content = [{"type": "paragraph", "content": [{"type": "text", "text": p}]} for p in paragraphs if p]
    if code:
        content.append({"type": "codeBlock", "attrs": {"language": "json"}, "content": [{"type": "text", "text": code}]})
    return {"type": "doc", "version": 1, "content": content}


def add_comment(service, key, paragraphs, code=None):
    return service._request("POST", f"/rest/api/3/issue/{key}/comment", data={"body": adf(paragraphs, code)})


def record_execution(tenant_id, created, info, summary, description, priority, labels, payload, actor):
    """Mirror the ticket into the platform's remediation tracker. Returns the RemediationExecution id or None."""
    from api.db_utils import rls_transaction
    from api.models import RemediationExecution

    now = datetime.now(timezone.utc)
    category = info.get("status_category_key", "new")
    status = (
        RemediationExecution.ExecutionStatus.COMPLETED if category == "done"
        else RemediationExecution.ExecutionStatus.IN_PROGRESS if category == "indeterminate"
        else RemediationExecution.ExecutionStatus.PENDING
    )
    try:
        with rls_transaction(str(tenant_id)):
            execution = RemediationExecution.objects.create(
                tenant_id=tenant_id,
                issue_key=created["key"],
                issue_url=created["url"],
                issue_id=created.get("id"),
                project_key=created["project_key"],
                summary=summary[:255],
                description=description,
                status=status,
                jira_status=info.get("status", "To Do"),
                jira_status_category=category,
                priority=info.get("priority") or priority,
                assignee_name=info.get("assignee_name"),
                assignee_email=info.get("assignee_email"),
                assignee_account_id=info.get("assignee_account_id"),
                labels=labels,
                ai_payload=payload,
                timeline=[{
                    "stage": "ticket_created",
                    "timestamp": now.isoformat(),
                    "title": f"Jira Issue Created: {created['key']}",
                    "description": "Raised from the CIS Oracle SaaS assessment (Identity risks).",
                    "actor": actor,
                    "status": "COMPLETED",
                }],
                last_synced_at=now,
            )
        return execution.id
    except Exception as exc:  # the ticket exists in Jira either way; the tracker entry is a convenience
        log.warning("Could not record the Jira ticket as a remediation execution: %s", type(exc).__name__)
        return None
