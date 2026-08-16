from django.urls import path

from .views import (
    AIAdvisorQueryView,
    AIDecisionDetailView,
    AIDecisionLogView,
    AIFindingAnalysisView,
    AIFindingAssessmentView,
    AIFindingDecisionView,
    AIReasoningProxyView,
    AIRemediationGeneratorView,
)

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
]