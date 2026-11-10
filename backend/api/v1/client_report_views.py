"""Saved report copies. The client always comes from the caller's sign-in, never from the request."""
from pathlib import PurePosixPath

from django.http import HttpResponse
from rest_framework.response import Response

from api.client_reports import list_reports, report_key, valid_location
from api.client_storage import get_storage
from nca.perms import Permissions
from nca.views import NcaBase

CONTENT_TYPES = {".html": "text/html", ".csv": "text/csv", ".md": "text/markdown", ".json": "application/json"}


class ClientReportsView(NcaBase):
    required_permissions = [Permissions.MANAGE_SCANS]

    def get(self, request):
        tenant_id = self.tenant_id(request)
        return Response({"results": list_reports(tenant_id) if tenant_id else []})


class ClientReportFileView(NcaBase):
    required_permissions = [Permissions.MANAGE_SCANS]

    def get(self, request, kind, run_id, name):
        tenant_id = self.tenant_id(request)
        if not tenant_id or not valid_location(kind, run_id, name):
            return Response({"detail": "Not found."}, status=404)
        storage, key = get_storage(), report_key(kind, run_id, name)
        if not storage.exists(tenant_id, key):
            return Response({"detail": "Not found."}, status=404)
        with storage.open(tenant_id, key) as saved:
            body = saved.read()
        kind_of_file = CONTENT_TYPES.get(PurePosixPath(name).suffix, "application/octet-stream")
        response = HttpResponse(body, content_type=f"{kind_of_file}; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{name}"'
        response["X-Content-Type-Options"] = "nosniff"
        return response
