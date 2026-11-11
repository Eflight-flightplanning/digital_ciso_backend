"""Test Suite for RBAC Restrictions on Jira Remediation Ticket Dispatching.

Verifies:
1. Read-Only / Auditor accounts are blocked from dispatching Jira tickets via:
   - RemediationExecutionViewSet.create_ticket (HTTP 403 Forbidden)
   - AIDecisionCreateJiraTicketView (HTTP 403 Forbidden)
   - MCPToolExecutor (ciso_trigger_integration_sync)
   - RemediationExecutionAgent.execute (ExecutionPermissionError)
2. Admin and Security Analyst accounts are allowed to dispatch Jira tickets.
"""
import json
import os
import sys
import unittest
from contextlib import contextmanager
from unittest.mock import MagicMock, patch
from uuid import uuid4

# Ensure backend directory is in path and Django is configured
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.django.devel")

import django
django.setup()

from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework.request import Request
from rest_framework import status


@contextmanager
def mock_atomic(using=None, savepoint=True, durable=False):
    yield


class TestJiraRBACDispatchRestrictions(unittest.TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.tenant_id = str(uuid4())

        # Admin user
        self.admin_user = MagicMock()
        self.admin_user.id = 1
        self.admin_user.email = "admin@company.com"
        self.admin_user.is_authenticated = True
        self.admin_user.is_superuser = True
        self.admin_user.is_staff = True

        # Read-Only / Auditor user
        self.auditor_user = MagicMock()
        self.auditor_user.id = 2
        self.auditor_user.email = "auditor@company.com"
        self.auditor_user.is_authenticated = True
        self.auditor_user.is_superuser = False
        self.auditor_user.is_staff = False

        # Auditor role
        self.auditor_role = MagicMock()
        self.auditor_role.name = "Auditor"
        self.auditor_role.manage_integrations = False

        # Analyst role
        self.analyst_user = MagicMock()
        self.analyst_user.id = 3
        self.analyst_user.email = "analyst@company.com"
        self.analyst_user.is_authenticated = True
        self.analyst_user.is_superuser = False
        self.analyst_user.is_staff = False

        self.analyst_role = MagicMock()
        self.analyst_role.name = "Security Analyst"
        self.analyst_role.manage_integrations = True

    @patch("api.v1.jira_views.resolve_tenant")
    @patch("api.rbac.permissions.is_admin_or_owner")
    @patch("api.rbac.permissions.get_role")
    def test_remediation_execution_create_ticket_forbidden_for_auditor(
        self, mock_get_role, mock_is_admin, mock_resolve_tenant
    ):
        from api.v1.jira_views import RemediationExecutionViewSet

        mock_tenant = MagicMock()
        mock_tenant.id = self.tenant_id
        mock_resolve_tenant.return_value = mock_tenant
        mock_is_admin.return_value = False
        mock_get_role.return_value = self.auditor_role

        viewset = RemediationExecutionViewSet()
        wsgi_request = self.factory.post(
            "/api/v1/remediations/executions/create-ticket",
            json.dumps({"project_key": "SEC", "summary": "Remediate open S3 bucket"}),
            content_type="application/json",
        )
        request = Request(wsgi_request)
        request.user = self.auditor_user
        request.tenant_id = self.tenant_id
        viewset.request = request

        response = viewset.create_ticket(request)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Permission Denied", response.data.get("detail", ""))

    @patch("api.v1.jira_views.resolve_tenant")
    @patch("api.rbac.permissions.is_admin_or_owner")
    @patch("api.rbac.permissions.get_role")
    @patch("api.v1.jira_views.CreateJiraTicketRequestSerializer")
    def test_remediation_execution_create_ticket_allowed_for_analyst(
        self, mock_serializer_cls, mock_get_role, mock_is_admin, mock_resolve_tenant
    ):
        from api.v1.jira_views import RemediationExecutionViewSet

        mock_tenant = MagicMock()
        mock_tenant.id = self.tenant_id
        mock_resolve_tenant.return_value = mock_tenant
        mock_is_admin.return_value = False
        mock_get_role.return_value = self.analyst_role

        mock_serializer = MagicMock()
        mock_serializer.is_valid.return_value = True
        mock_serializer.validated_data = {
            "project_key": "SEC",
            "summary": "Fix IAM policy",
            "issue_type": "Task",
            "priority": "Medium",
        }
        mock_serializer_cls.return_value = mock_serializer

        viewset = RemediationExecutionViewSet()
        wsgi_request = self.factory.post(
            "/api/v1/remediations/executions/create-ticket",
            json.dumps({"project_key": "SEC", "summary": "Fix IAM policy"}),
            content_type="application/json",
        )
        request = Request(wsgi_request)
        request._full_data = {"project_key": "SEC", "summary": "Fix IAM policy"}
        request.user = self.analyst_user
        request.tenant_id = self.tenant_id
        viewset.request = request

        with patch("api.v1.jira_views.get_active_jira_service", return_value=None), \
             patch("api.v1.jira_views.RemediationExecution.objects") as mock_exec_objects, \
             patch("api.v1.jira_views.RemediationExecutionSerializer") as mock_exec_serializer:
            mock_exec_objects.filter.return_value.count.return_value = 5
            mock_created_exec = MagicMock()
            mock_created_exec.id = str(uuid4())
            mock_created_exec.issue_key = "SEC-106"
            mock_created_exec.issue_url = "https://pravahya1.atlassian.net/browse/SEC-106"
            mock_created_exec.status = "TODO"
            mock_created_exec.priority = "Medium"
            mock_created_exec.inserted_at = django.utils.timezone.now()
            mock_created_exec.timeline = []
            mock_exec_objects.create.return_value = mock_created_exec

            mock_serializer_inst = MagicMock()
            mock_serializer_inst.data = {"issue_key": "SEC-106", "issue_url": mock_created_exec.issue_url}
            mock_exec_serializer.return_value = mock_serializer_inst

            response = viewset.create_ticket(request)
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
            self.assertEqual(response.data["issue_key"], "SEC-106")

    @patch("django.db.transaction.atomic", side_effect=mock_atomic)
    @patch("ai.views._request_tenant_id")
    @patch("api.rbac.permissions.is_admin_or_owner")
    @patch("api.rbac.permissions.get_role")
    def test_ai_decision_create_jira_ticket_forbidden_for_auditor(
        self, mock_get_role, mock_is_admin, mock_request_tenant_id, mock_tx
    ):
        from ai.views import AIDecisionCreateJiraTicketView

        mock_request_tenant_id.return_value = self.tenant_id
        mock_is_admin.return_value = False
        mock_get_role.return_value = self.auditor_role

        view = AIDecisionCreateJiraTicketView()
        view.tenant_id = self.tenant_id
        decision_id = str(uuid4())
        request = self.factory.post(
            f"/api/v1/ai/decisions/{decision_id}/jira-ticket",
            json.dumps({}),
            content_type="application/json",
        )
        request.user = self.auditor_user
        request.tenant_id = self.tenant_id
        view.request = request

        response = view.post(request, decision_id=decision_id)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["errors"][0]["title"], "Permission Denied")

    @patch("api.rbac.permissions.is_admin_or_owner")
    @patch("api.rbac.permissions.get_role")
    def test_mcp_trigger_sync_forbidden_for_auditor(
        self, mock_get_role, mock_is_admin
    ):
        from ai.mcp_tools import MCPToolExecutor

        mock_is_admin.return_value = False
        mock_get_role.return_value = self.auditor_role

        mock_tenant = MagicMock()
        mock_tenant.id = self.tenant_id

        result = MCPToolExecutor.execute_tool(
            "ciso_trigger_integration_sync",
            {"integration_type": "jira"},
            user=self.auditor_user,
            tenant=mock_tenant,
        )

        self.assertEqual(result.get("status"), "error")
        self.assertIn("Permission Denied", result.get("error", ""))

    @patch("api.rbac.permissions.is_admin_or_owner")
    @patch("api.rbac.permissions.get_role")
    def test_execution_agent_execute_forbidden_for_auditor(
        self, mock_get_role, mock_is_admin
    ):
        from ai.execution_agent import execution_agent, ExecutionPermissionError
        from api.models import RemediationPlaybook

        mock_is_admin.return_value = False
        mock_get_role.return_value = self.auditor_role

        mock_playbook = MagicMock()
        mock_playbook.id = str(uuid4())
        mock_playbook.approval_status = RemediationPlaybook.ApprovalStatus.APPROVED
        mock_playbook.tenant = MagicMock()
        mock_playbook.tenant.id = self.tenant_id

        with self.assertRaises(ExecutionPermissionError) as ctx:
            execution_agent.execute(
                playbook=mock_playbook,
                executed_by=self.auditor_user,
            )
        self.assertIn("Permission Denied", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
