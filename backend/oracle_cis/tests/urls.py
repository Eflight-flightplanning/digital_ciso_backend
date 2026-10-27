from django.urls import include, path

urlpatterns = [path("api/v1/oracle-cis/", include("oracle_cis.urls"))]
