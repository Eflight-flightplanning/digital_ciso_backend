from django.urls import path

from . import views as v

urlpatterns = [
    path("client-files", v.FilesView.as_view(), name="client-files"),
    path("client-files/<uuid:file_id>", v.FileView.as_view(), name="client-file"),
]
