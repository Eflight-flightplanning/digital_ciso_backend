"""
MCP (Model Context Protocol) Tools Registry for Digital CISO Platform

Exposes standard security tools to AI clients (Claude Desktop, Cursor, VS Code,
LangChain, OpenAI Agents, and internal AI assistants).
"""
from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

from django.utils import timezone as django_tz

from api.models import (
    ComplianceOverview,
    DecisionLog,
    Finding,
    RemediationPlaybook,
    Resource,
    Tenant,
    User,
)
from ai.claude_provider import get_ai_provider
from ai.execution_agent import execution_agent, ExecutionPermissionError

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# MCP Tools Metadata / JSON Schemas
# ----------------------------------------------------------------------
MCP_TOOLS_SPEC = [
    {
        "name": "ciso_get_findings",
        "description": "Query cloud security findings discovered by security scans. Filter by severity, provider, status, or check ID.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "severity": {
                    "type": "string",
                    "enum": ["critical", "high", "medium", "low", "informational"],
                    "description": "Filter by finding severity level",
                },
                "status": {
                    "type": "string",
                    "enum": ["FAIL", "PASS", "MUTED"],
                    "description": "Filter by finding status (e.g. FAIL for active security violations)",
                },
                "check_id": {
                    "type": "string",
                    "description": "Optional check ID substring (e.g. 's3_bucket', 'iam_root', 'nsg')",
                },
                "limit": {
                    "type": "integer",
                    "default": 10,
                    "description": "Maximum number of findings to return (default: 10)",
                },
            },
        },
    },
    {
        "name": "ciso_get_resources",
        "description": "List multi-cloud inventory resources (AWS, Azure, GCP, Kubernetes) scanned by the platform.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "service": {
                    "type": "string",
                    "description": "Filter by cloud service (e.g. 's3', 'ec2', 'iam', 'virtualMachines', 'storageAccounts')",
                },
                "region": {
                    "type": "string",
                    "description": "Filter by region (e.g. 'us-east-1', 'eastus', 'global')",
                },
                "limit": {
                    "type": "integer",
                    "default": 10,
                },
            },
        },
    },
    {
        "name": "ciso_analyze_finding",
        "description": "Perform deep Digital CISO AI analysis on a specific finding using Qwen 3.5 on Azure VM or Claude. Returns root-cause, attack scenario, compliance impact, and risk score.",
        "inputSchema": {
            "type": "object",
            "required": ["finding_id"],
            "properties": {
                "finding_id": {
                    "type": "string",
                    "description": "UUID of the security finding to analyze",
                },
                "force_reanalysis": {
                    "type": "boolean",
                    "default": False,
                    "description": "Bypass cache and force fresh AI model inference",
                },
            },
        },
    },
    {
        "name": "ciso_get_compliance_overview",
        "description": "Fetch compliance benchmark readiness scores for CIS Benchmarks, SOC 2 Type II, ISO 27001, and PCI-DSS.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "framework": {
                    "type": "string",
                    "description": "Optional framework filter (e.g. 'cis_aws', 'soc2', 'iso27001', 'pci_dss')",
                },
            },
        },
    },
    {
        "name": "remediation_generate_playbook",
        "description": "Auto-generate actionable remediation code (Terraform HCL, AWS CLI, Azure CLI, Ansible, Python) for a specific finding.",
        "inputSchema": {
            "type": "object",
            "required": ["finding_id"],
            "properties": {
                "finding_id": {
                    "type": "string",
                    "description": "UUID of the finding requiring remediation",
                },
                "script_type": {
                    "type": "string",
                    "enum": ["terraform", "aws_cli", "azure_cli", "ansible", "python"],
                    "default": "terraform",
                    "description": "Format of the generated remediation script",
                },
            },
        },
    },
    {
        "name": "remediation_approve_playbook",
        "description": "Human-In-The-Loop (HITL) approval gate. Approves a remediation playbook so the Execution Agent can apply it to cloud infrastructure.",
        "inputSchema": {
            "type": "object",
            "required": ["playbook_id"],
            "properties": {
                "playbook_id": {
                    "type": "string",
                    "description": "UUID of the remediation playbook to approve",
                },
            },
        },
    },
    {
        "name": "remediation_execute_playbook",
        "description": "Trigger the Execution Agent to apply the remediation script against target cloud infrastructure. STRICTLY requires prior human approval.",
        "inputSchema": {
            "type": "object",
            "required": ["playbook_id"],
            "properties": {
                "playbook_id": {
                    "type": "string",
                    "description": "UUID of the approved remediation playbook to execute",
                },
            },
        },
    },
    {
        "name": "ciso_advisor_query",
        "description": "Ask the Digital CISO any security, architectural, or posture question grounded in your live cloud environment.",
        "inputSchema": {
            "type": "object",
            "required": ["question"],
            "properties": {
                "question": {
                    "type": "string",
                    "description": "Security question or prompt for the Digital CISO",
                },
            },
        },
    },
    {
        "name": "ciso_get_integrations",
        "description": "List all configured SIEM, ticketing (Jira), data lakes (S3), notifications (Slack), and webhook integrations.",
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "ciso_trigger_integration_sync",
        "description": "Trigger an immediate dispatch of critical security findings and compliance audit packs to an integration channel (e.g. Jira, S3, Slack, Security Hub).",
        "inputSchema": {
            "type": "object",
            "required": ["integration_type"],
            "properties": {
                "integration_type": {
                    "type": "string",
                    "enum": ["amazon_s3", "jira", "aws_security_hub", "slack", "splunk", "datadog"],
                    "description": "Target integration channel",
                },
            },
        },
    },
]


# ----------------------------------------------------------------------
# Tool Implementations
# ----------------------------------------------------------------------
class MCPToolExecutor:
    """Executes MCP tool requests against the Django platform."""

    @staticmethod
    def execute_tool(tool_name: str, arguments: dict[str, Any], user: User | None = None, tenant: Tenant | None = None) -> dict[str, Any]:
        if tenant is None:
            raise ValueError("No tenant resolved for this request; refusing to guess one.")
        tenant_id = tenant.id

        if tool_name in ("ciso_get_findings", "prowler_get_findings"):
            return MCPToolExecutor._get_findings(arguments, tenant_id)
        elif tool_name in ("ciso_get_resources", "prowler_get_resources"):
            return MCPToolExecutor._get_resources(arguments, tenant_id)
        elif tool_name == "ciso_analyze_finding":
            return MCPToolExecutor._analyze_finding(arguments, tenant_id)
        elif tool_name == "ciso_get_compliance_overview":
            return MCPToolExecutor._get_compliance(arguments, tenant_id)
        elif tool_name == "remediation_generate_playbook":
            return MCPToolExecutor._generate_playbook(arguments, tenant)
        elif tool_name == "remediation_approve_playbook":
            return MCPToolExecutor._approve_playbook(arguments, user)
        elif tool_name == "remediation_execute_playbook":
            return MCPToolExecutor._execute_playbook(arguments, user)
        elif tool_name == "ciso_advisor_query":
            return MCPToolExecutor._advisor_query(arguments, tenant_id)
        elif tool_name == "ciso_get_integrations":
            return MCPToolExecutor._get_integrations(arguments, tenant_id)
        elif tool_name == "ciso_trigger_integration_sync":
            return MCPToolExecutor._trigger_sync(arguments, tenant_id)
        else:
            raise ValueError(f"Unknown MCP tool: '{tool_name}'")

    @staticmethod
    def _get_findings(args: dict[str, Any], tenant_id) -> dict[str, Any]:
        qs = Finding.objects.filter(tenant_id=tenant_id)
        if "severity" in args and args["severity"]:
            qs = qs.filter(severity=args["severity"].lower())
        if "status" in args and args["status"]:
            qs = qs.filter(status=args["status"].upper())
        if "check_id" in args and args["check_id"]:
            qs = qs.filter(check_id__icontains=args["check_id"])

        limit = int(args.get("limit", 10))
        findings = list(qs.order_by("-inserted_at")[:limit])

        results = []
        for f in findings:
            results.append({
                "id": str(f.id),
                "check_id": f.check_id,
                "severity": f.severity.upper(),
                "status": f.status,
                "status_extended": f.status_extended,
                "impact": f.impact,
                "inserted_at": f.inserted_at.isoformat() if f.inserted_at else None,
            })
        return {"total_returned": len(results), "findings": results}

    @staticmethod
    def _get_resources(args: dict[str, Any], tenant_id) -> dict[str, Any]:
        qs = Resource.objects.filter(tenant_id=tenant_id)
        if "service" in args and args["service"]:
            qs = qs.filter(service__iexact=args["service"])
        if "region" in args and args["region"]:
            qs = qs.filter(region__iexact=args["region"])

        limit = int(args.get("limit", 10))
        resources = list(qs[:limit])

        results = []
        for r in resources:
            results.append({
                "id": str(r.id),
                "uid": r.uid,
                "name": r.name,
                "service": r.service,
                "type": r.type,
                "region": r.region,
            })
        return {"total_returned": len(results), "resources": results}

    @staticmethod
    def _analyze_finding(args: dict[str, Any], tenant_id) -> dict[str, Any]:
        from ai.service import ai_analysis_service
        from ai.views import _finding_to_dict

        finding_id = args.get("finding_id")
        finding = Finding.objects.filter(id=finding_id, tenant_id=tenant_id).first()
        if not finding:
            return {"error": f"Finding {finding_id} not found."}

        finding_data = _finding_to_dict(finding)
        result = ai_analysis_service.analyze(
            finding_id=str(finding.id),
            finding_data=finding_data,
            force_reanalysis=bool(args.get("force_reanalysis", False)),
            tenant_id=str(finding.tenant_id),
        )
        if result.get("error"):
            return {"finding_id": finding_id, "error": result["error"]}

        assessment = result.get("assessment") or {}
        decision = result.get("decision") or {}
        return {
            "finding_id": finding_id,
            "from_cache": result.get("from_cache", False),
            "analysis": {
                "root_cause": assessment.get("root_cause"),
                "attack_scenario": assessment.get("attack_scenario"),
                "business_impact": assessment.get("business_impact"),
                "technical_impact": assessment.get("technical_impact"),
                "remediation": assessment.get("remediation"),
                "risk_score": decision.get("risk_score"),
                "risk_level": decision.get("risk_level"),
                "decision": decision.get("decision"),
            },
            "model_used": assessment.get("model"),
        }

    @staticmethod
    def _get_compliance(args: dict[str, Any], tenant_id) -> dict[str, Any]:
        from api.models import ComplianceOverview
        qs = ComplianceOverview.objects.filter(tenant_id=tenant_id) if tenant_id else ComplianceOverview.objects.all()
        frameworks_list = []
        if qs.exists():
            for c in qs:
                pct = round((c.requirements_passed / max(1, c.total_requirements)) * 100, 1)
                frameworks_list.append({
                    "id": c.compliance_id or c.framework,
                    "name": c.description or c.framework,
                    "version": c.version or "v1.0",
                    "readiness_score": pct,
                    "passed": c.requirements_passed,
                    "failed": c.requirements_failed,
                    "total": c.total_requirements,
                    "status": "COMPLIANT" if pct >= 80 else "AT_RISK"
                })
        return {
            "status": "success",
            "total_frameworks": len(frameworks_list),
            "frameworks": frameworks_list,
            "message": (
                None
                if frameworks_list
                else "No compliance overview has been computed for this tenant yet. Run a scan first."
            ),
        }

    @staticmethod
    def _get_integrations(args: dict[str, Any], tenant_id) -> dict[str, Any]:
        from api.models import Integration
        qs = Integration.objects.filter(tenant_id=tenant_id) if tenant_id else Integration.objects.all()
        items = []
        for integ in qs:
            items.append({
                "id": str(integ.id),
                "type": integ.integration_type,
                "enabled": integ.enabled,
                "connected": integ.connected,
                "configuration": integ.configuration,
            })
        return {
            "status": "success",
            "connected_channels": len([i for i in items if i.get("enabled")]),
            "integrations": items,
            "message": None if items else "No integrations are configured for this tenant yet.",
        }

    @staticmethod
    def _trigger_sync(args: dict[str, Any], tenant_id) -> dict[str, Any]:
        from api.models import Integration

        itype = args.get("integration_type", "jira")

        if itype != Integration.IntegrationChoices.JIRA.value:
            return {
                "status": "error",
                "error": (
                    f"Immediate sync is not supported for integration type '{itype}' yet. "
                    "Only 'jira' is currently wired to real dispatch via this tool."
                ),
            }

        integration = Integration.objects.filter(
            tenant_id=tenant_id,
            integration_type=Integration.IntegrationChoices.JIRA,
            enabled=True,
            connected=True,
        ).first()
        if integration is None:
            return {
                "status": "error",
                "error": "No connected Jira integration is configured for this tenant.",
            }

        project_key = integration.configuration.get("default_project_key")
        issue_type = integration.configuration.get("default_issue_type")
        if not project_key or not issue_type:
            return {
                "status": "error",
                "error": (
                    "The Jira integration has no default project/issue type configured. "
                    "Set 'default_project_key' and 'default_issue_type' on the integration first."
                ),
            }

        finding_ids = list(
            Finding.objects.filter(
                tenant_id=tenant_id,
                status="FAIL",
                muted=False,
                severity__in=["critical", "high"],
            )
            .order_by("-inserted_at")
            .values_list("id", flat=True)[:10]
        )
        if not finding_ids:
            return {
                "status": "success",
                "dispatched_to": "jira",
                "events_synced": 0,
                "dispatched_at": django_tz.now().isoformat(),
                "message": "No unresolved critical/high findings to sync.",
            }

        from tasks.jobs.integrations import send_findings_to_jira

        result = send_findings_to_jira(
            tenant_id=str(tenant_id),
            integration_id=str(integration.id),
            project_key=project_key,
            issue_type=issue_type,
            finding_ids=[str(fid) for fid in finding_ids],
        )
        return {
            "status": "success" if result.get("created_count") else "error",
            "dispatched_to": "jira",
            "events_synced": result.get("created_count", 0),
            "failed_count": result.get("failed_count", 0),
            "dispatched_at": django_tz.now().isoformat(),
            "error": result.get("error"),
        }

    @staticmethod
    def _generate_playbook(args: dict[str, Any], tenant: Tenant | None) -> dict[str, Any]:
        finding_id = args.get("finding_id")
        script_type = args.get("script_type", "terraform").lower()
        finding = Finding.objects.filter(id=finding_id).first()
        if not finding:
            return {"error": f"Finding {finding_id} not found."}

        tenant_obj = tenant or Tenant.objects.first()
        provider = get_ai_provider(tenant_id=str(tenant_obj.id) if tenant_obj else None)

        system_prompt = (
            f"Generate a production-ready {script_type} script to remediate this finding. "
            f"Return JSON with 'title', 'code_snippet', 'rollback_snippet', 'estimated_downtime_minutes'."
        )
        user_prompt = f"Check: {finding.check_id}\nSeverity: {finding.severity}\nEvidence: {finding.status_extended}"

        if hasattr(provider, "_call_vllm_chat"):
            data = provider._call_vllm_chat(system_prompt=system_prompt, user_prompt=user_prompt, temperature=0.1, max_tokens=1000)
        else:
            data = {
                "title": f"Remediate {finding.check_id}",
                "code_snippet": f"# Remediation for {finding.check_id}\n# Apply via {script_type}",
                "rollback_snippet": "# Rollback command",
                "estimated_downtime_minutes": 0,
            }

        playbook = RemediationPlaybook.objects.create(
            tenant=tenant_obj,
            finding_id=finding.id,
            title=data.get("title", f"Remediate {finding.check_id}"),
            script_type=script_type,
            code_snippet=data.get("code_snippet", f"# {script_type} script"),
            rollback_snippet=data.get("rollback_snippet", "# rollback"),
            approval_status=RemediationPlaybook.ApprovalStatus.PENDING_APPROVAL,
        )

        return {
            "status": "success",
            "playbook_id": str(playbook.id),
            "title": playbook.title,
            "script_type": playbook.script_type,
            "approval_status": playbook.approval_status,
            "code_snippet": playbook.code_snippet,
            "rollback_snippet": playbook.rollback_snippet,
        }

    @staticmethod
    def _approve_playbook(args: dict[str, Any], user: User | None) -> dict[str, Any]:
        playbook_id = args.get("playbook_id")
        playbook = RemediationPlaybook.objects.filter(id=playbook_id).first()
        if not playbook:
            return {"error": f"Playbook {playbook_id} not found."}

        playbook.approval_status = RemediationPlaybook.ApprovalStatus.APPROVED
        playbook.approved_by = user
        playbook.approved_at = django_tz.now()
        playbook.save(update_fields=["approval_status", "approved_by", "approved_at", "updated_at"])

        return {
            "status": "success",
            "playbook_id": str(playbook.id),
            "approval_status": playbook.approval_status,
            "approved_by": user.email if user else "Admin",
            "approved_at": playbook.approved_at.isoformat(),
        }

    @staticmethod
    def _execute_playbook(args: dict[str, Any], user: User | None) -> dict[str, Any]:
        playbook_id = args.get("playbook_id")
        playbook = RemediationPlaybook.objects.filter(id=playbook_id).first()
        if not playbook:
            return {"error": f"Playbook {playbook_id} not found."}

        try:
            result = execution_agent.execute(playbook, executed_by=user)
            return {
                "status": "success",
                "playbook_id": str(playbook.id),
                "approval_status": playbook.approval_status,
                "execution_result": result,
            }
        except ExecutionPermissionError as e:
            return {
                "error": "Human Approval Required",
                "detail": str(e),
                "approval_status": playbook.approval_status,
            }

    @staticmethod
    def _advisor_query(args: dict[str, Any], tenant_id) -> dict[str, Any]:
        question = args.get("question", "")
        provider = get_ai_provider(tenant_id=str(tenant_id) if tenant_id else None)
        
        # Grounding context with top critical findings
        findings = list(Finding.objects.filter(tenant_id=tenant_id, severity__in=["critical", "high"])[:5])
        context = "\n".join([f"- [{f.severity.upper()}] {f.check_id}: {f.status_extended}" for f in findings])
        
        system_prompt = "You are the Digital CISO Advisor. Provide executive, actionable cloud security advice grounded in the findings context."
        user_prompt = f"Open Cloud Findings in Environment:\n{context}\n\nUser Question: {question}"

        if hasattr(provider, "_call_vllm_chat"):
            answer = provider._call_vllm_chat(system_prompt=system_prompt, user_prompt=user_prompt, temperature=0.1, max_tokens=500)
        else:
            answer = {"answer": f"Analysis for: {question}", "summary": "Environment evaluated."}

        return {"question": question, "response": answer, "grounded_findings_count": len(findings)}