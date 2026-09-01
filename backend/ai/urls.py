from django.urls import path

from .views import (
    AIAdvisorQueryView,
    AIDecisionCreateJiraTicketView,
    AIDecisionDetailView,
    AIDecisionLogView,
    AIFindingAnalysisView,
    AIFindingAssessmentView,
    AIFindingDecisionView,
    AIReasoningProxyView,
    AIRemediationGeneratorView,
    AIRemediationTemplateCatalogView,
)
from .mcp_views import MCPGatewayView

# /api/v1/ai/...
ai_urlpatterns = [
    # Finding-level AI (Spectra)
    path(
        "findings/<uuid:finding_id>/analyze",
        AIFindingAnalysisView.as_view(),
        name="ai-finding-analyze",
    ),
    path(
        "findings/<uuid:finding_id>/assessment",
        AIFindingAssessmentView.as_view(),
        name="ai-finding-assessment",
    ),
    path(
        "findings/<uuid:finding_id>/decision",
        AIFindingDecisionView.as_view(),
        name="ai-finding-decision",
    ),
    path(
        "findings/<uuid:finding_id>/playbook",
        AIRemediationGeneratorView.as_view(),
        name="ai-finding-playbook",
    ),
    path(
        "remediation-templates",
        AIRemediationTemplateCatalogView.as_view(),
        name="ai-remediation-templates",
    ),
    # Aegis Decision Intelligence
    path(
        "decisions",
        AIDecisionLogView.as_view(),
        name="ai-decisions-list",
    ),
    path(
        "decisions/<uuid:decision_id>",
        AIDecisionDetailView.as_view(),
        name="ai-decisions-detail",
    ),
    path(
        "decisions/<uuid:decision_id>/jira-ticket",
        AIDecisionCreateJiraTicketView.as_view(),
        name="ai-decisions-jira-ticket",
    ),
    # Spectra: AI Advisor & Developer Reasoning Proxy
    path(
        "advisor/query",
        AIAdvisorQueryView.as_view(),
        name="ai-advisor-query",
    ),
    path(
        "reasoning",
        AIReasoningProxyView.as_view(),
        name="ai-reasoning-proxy",
    ),
    # Model Context Protocol (MCP) Gateway
    path(
        "mcp",
        MCPGatewayView.as_view(),
        name="mcp-gateway",
    ),
]
