from api.health import LivenessView, ReadinessView
from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularRedocView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("api.v1.urls")),
    path("health/live", LivenessView.as_view(), name="health-live"),
    path("health/ready", ReadinessView.as_view(), name="health-ready"),
]
# Auto-reloaded for AI Advisor update

# API docs map every endpoint for an attacker: only expose them in debug builds.
if settings.DEBUG:
    urlpatterns += [
        path("swagger/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-root"),
        path("docs/", SpectacularRedocView.as_view(url_name="schema"), name="docs-root"),
    ]
