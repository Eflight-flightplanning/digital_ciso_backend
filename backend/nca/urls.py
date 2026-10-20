from django.urls import path

from . import views as v

urlpatterns = [
    path("frameworks", v.FrameworksView.as_view(), name="nca-frameworks"),
    path("frameworks/<str:key>", v.FrameworkDetailView.as_view(), name="nca-framework"),
    path("assessments", v.AssessmentsView.as_view(), name="nca-assessments"),
    path("assessments/latest", v.AssessmentLatestView.as_view(), name="nca-assessment-latest"),
    path("assessments/<uuid:pk>", v.AssessmentDetailView.as_view(), name="nca-assessment"),
    path("assessments/<uuid:pk>/controls", v.AssessmentControlsView.as_view(), name="nca-assessment-controls"),
    path("assessments/<uuid:pk>/subcontrols", v.AssessmentSubcontrolsView.as_view(), name="nca-assessment-subcontrols"),
    path("assessments/<uuid:pk>/checks", v.AssessmentChecksView.as_view(), name="nca-assessment-checks"),
    path("assessments/<uuid:pk>/findings", v.AssessmentFindingsView.as_view(), name="nca-assessment-findings"),
    path("assessments/<uuid:pk>/report", v.AssessmentReportView.as_view(), name="nca-assessment-report"),
    path("controls/<str:framework>/<str:control_id>", v.ControlDetailView.as_view(), name="nca-control"),
    path("controls/<str:framework>/<str:control_id>/evidence", v.EvidenceView.as_view(), name="nca-evidence"),
    path("controls/<str:framework>/<str:control_id>/review", v.ReviewView.as_view(), name="nca-review"),
    path("controls/<str:framework>/<str:control_id>/comments", v.CommentView.as_view(), name="nca-comment"),
    path("evidence/<uuid:evidence_id>/download", v.EvidenceDownloadView.as_view(), name="nca-evidence-download"),
    path("remediations", v.RemediationsView.as_view(), name="nca-remediations"),
    path("remediations/dry-run", v.RemediationDryRunView.as_view(), name="nca-remediation-dry-run"),
    path("remediations/execute", v.RemediationExecuteView.as_view(), name="nca-remediation-execute"),
    path("audit-log", v.AuditLogView.as_view(), name="nca-audit-log"),
]
