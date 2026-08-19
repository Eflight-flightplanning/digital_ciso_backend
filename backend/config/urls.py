from api.health import LivenessView, ReadinessView
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularRedocView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("api.v1.urls")),
    path("swagger/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-root"),
    path("docs/", SpectacularRedocView.as_view(url_name="schema"), name="docs-root"),
    path("health/live", LivenessView.as_view(), name="health-live"),
    path("health/ready", ReadinessView.as_view(), name="health-ready"),
]
# Auto-reloaded for AI Advisor update
