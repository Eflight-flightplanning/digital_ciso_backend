from django.urls import include, path

urlpatterns = [path("api/v1/nca/", include("nca.urls"))]
