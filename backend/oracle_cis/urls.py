from django.urls import path

from . import views as v

urlpatterns = [
    path("runs", v.RunsView.as_view(), name="oracle-cis-runs"),
    path("runs/latest", v.RunLatestView.as_view(), name="oracle-cis-run-latest"),
    path("runs/compare", v.RunsCompareView.as_view(), name="oracle-cis-runs-compare"),
    path("runs/<int:pk>", v.RunDetailView.as_view(), name="oracle-cis-run"),
    path("runs/<int:pk>/export.csv", v.RunExportCsvView.as_view(), name="oracle-cis-run-csv"),
    path("runs/<int:pk>/export.json", v.RunExportJsonView.as_view(), name="oracle-cis-run-json"),
    path("controls", v.ControlsView.as_view(), name="oracle-cis-controls"),
    path("health", v.HealthView.as_view(), name="oracle-cis-health"),
    path("connection", v.ConnectionView.as_view(), name="oracle-cis-connection"),
    path("connection/test", v.ConnectionTestView.as_view(), name="oracle-cis-connection-test"),
    path("identities", v.IdentitiesView.as_view(), name="oracle-cis-identities"),
    path("identities/<int:pk>/remediate", v.RemediateView.as_view(), name="oracle-cis-remediate"),
    path("identities/<int:pk>/jira", v.CreateTicketView.as_view(), name="oracle-cis-create-ticket"),
    path("jira/<int:pk>/refresh", v.RefreshTicketView.as_view(), name="oracle-cis-refresh-ticket"),
]
