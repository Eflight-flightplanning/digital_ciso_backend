"""Client files API (plain JSON; mounted at /api/v1/client-files).

There is no client id in any address or body: the client is the caller's own, from their sign-in.
"""
from django.http import FileResponse
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from . import perms
from .service import ClientFiles


def file_data(row) -> dict:
    return {"id": str(row.id), "category": row.category, "name": row.name, "size": row.size, "sha256": row.sha256,
            "content_type": row.content_type, "uploaded_by": row.uploaded_by, "created_at": row.created_at}


class Base(APIView):
    renderer_classes = [JSONRenderer]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    permission_classes = [IsAuthenticated]

    def files(self, request) -> ClientFiles:
        return ClientFiles(perms.resolve_tenant_id(request), request.user)


class FilesView(Base):
    def get(self, request):
        rows = self.files(request).list(request.query_params.get("category") or None)
        return Response({"results": [file_data(row) for row in rows[:500]]})

    def post(self, request):
        row = self.files(request).upload(request.data.get("category"), request.FILES.get("file"))
        return Response(file_data(row), status=201)


class FileView(Base):
    def get(self, request, file_id):
        row, content = self.files(request).open(file_id)
        response = FileResponse(content, as_attachment=True, filename=row.name)
        response["X-Content-Type-Options"] = "nosniff"
        return response

    def delete(self, request, file_id):
        files = self.files(request)
        if not perms.can_delete(request):
            raise PermissionDenied()
        files.delete(file_id)
        return Response(status=204)
