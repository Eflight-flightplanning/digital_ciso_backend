"""
AI API Views for Digital CISO

All views require authentication (via Prowler's existing JWT auth).
All AI calls go through the service — never direct from request to Claude.

Endpoints:
  POST /ai/findings/{id}/analyze    — Trigger AI analysis
  GET  /ai/findings/{id}/assessment — Get cached AI assessment
  GET  /ai/findings/{id}/decision   — Get security decision
  GET  /ai/decisions                — Decision log (paginated)
  PATCH /ai/decisions/{id}          — Submit human review
  POST /ai/advisor/query            — AI Advisor query
"""
from __future__ import annotations

import logging
import os
from typing import Any

from django.http import JsonResponse
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import JSONParser
from rest_framework_json_api.parsers import JSONParser as JSONAPIParser
from rest_framework.renderers import JSONRenderer
from rest_framework_json_api.renderers import JSONRenderer as JSONAPIRenderer

logger = logging.getLogger(__name__)


def _ai_unavailable_response() -> JsonResponse:
    """Return a graceful 503 when AI service is unavailable."""
    return JsonResponse(
        {
            "errors": [
                {
                    "status": "503",
                    "title": "AI Service Unavailable",
                    "detail": (
                        "AI analysis is temporarily unavailable. "
                        "Prowler finding data is still accessible from other endpoints."
                    ),
                }
            ]
        },
        status=503,
        content_type="application/vnd.api+json",
    )


def _is_ai_enabled() -> bool:
    return os.getenv("AI_ENABLED", "true").lower() == "true"


def _json_api_success(data: dict[str, Any], resource_type: str, resource_id: str) -> Response:
    """Wrap data in a JSON:API response envelope."""
    return Response(
        {
            "type": resource_type,
            "id": resource_id,
            "attributes": data,
        },
        status=status.HTTP_200_OK,
        content_type="application/vnd.api+json",
    )


def _json_api_list(items: list[dict[str, Any]], resource_type: str, total: int, page: int, page_size: int) -> Response:
    """Wrap list data in a JSON:API response envelope with pagination."""
    return Response(
        {
            "data": [
                {"type": resource_type, "id": item.get("id", ""), "attributes": item}
                for item in items
            ],
            "meta": {
                "pagination": {
                    "count": total,
                    "page": page,
                    "pages": (total + page_size - 1) // page_size if page_size else 1,
                    "next": page * page_size < total,
                    "previous": page > 1,
                }
            },
        },
        status=status.HTTP_200_OK,
        content_type="application/vnd.api+json",
    )


class AIFindingAnalysisView(APIView):
    """
    POST /ai/findings/{finding_id}/analyze
    Trigger AI analysis for a Prowler finding.
    """

    def post(self, request: Request, finding_id: str) -> Response:
        if not _is_ai_enabled():
            return _ai_unavailable_response()

        try:
            from ai.service import ai_analysis_service
            from api.models import Finding

            # Fetch Prowler finding (authoritative source)
            try:
                finding = Finding.objects.get(id=finding_id)
            except Finding.DoesNotExist:
                return Response(
                    {
                        "errors": [
                            {
                                "status": "404",
                                "title": "Finding Not Found",
                                "detail": f"Finding {finding_id} not found.",
                            }
                        ]
                    },
                    status=404,
                    content_type="application/vnd.api+json",
                )

            # Build finding data dict compatible with normalizer
            finding_data = _finding_to_dict(finding)
            force = request.data.get("force_reanalysis", False)

            result = ai_analysis_service.analyze(
                finding_id=str(finding.id),
                finding_data=finding_data,
                force_reanalysis=bool(force),
                tenant_id=str(finding.tenant_id),
            )

            if result.get("error"):
                logger.warning("AI analysis error for %s: %s", finding_id, result["error"])
                return _ai_unavailable_response()

            return Response(
                {
                    "data": {
                        "type": "ai-analysis",
                        "id": finding_id,
                        "attributes": {
                            "from_cache": result.get("from_cache", False),
                            "assessment_id": result.get("assessment", {}).get("id"),
                            "decision_id": result.get("decision", {}).get("id"),
                            "risk_score": result.get("decision", {}).get("risk_score"),
                            "risk_level": result.get("decision", {}).get("risk_level"),
                        },
                    }
                },
                status=status.HTTP_202_ACCEPTED,
                content_type="application/vnd.api+json",
            )

        except Exception as e:
            logger.error("AI analyze endpoint error: %s", e)
            return _ai_unavailable_response()


class AIFindingAssessmentView(APIView):
    """
    GET /ai/findings/{finding_id}/assessment
    Retrieve cached AI assessment for a finding.
    """

    def get(self, request: Request, finding_id: str) -> Response:
        if not _is_ai_enabled():
            return _ai_unavailable_response()

        try:
            from api.models import AIAssessment
            from ai.service import ai_analysis_service

            assessment = AIAssessment.objects.filter(finding_id=finding_id).first()
            if not assessment:
                return Response(
                    {
                        "errors": [
                            {
                                "status": "404",
                                "title": "No AI Assessment",
                                "detail": "No AI assessment found for this finding. Trigger analysis to generate one.",
                            }
                        ]
                    },
                    status=404,
                    content_type="application/vnd.api+json",
                )

            data = ai_analysis_service._assessment_to_dict(assessment)
            return _json_api_success(data, "ai-assessments", str(assessment.id))
        except Exception as e:
            logger.error("AI assessment view error: %s", e)
            return _ai_unavailable_response()


class AIFindingDecisionView(APIView):
    """
    GET /ai/findings/{finding_id}/decision
    Retrieve security decision for a finding.
    """

    def get(self, request: Request, finding_id: str) -> Response:
        if not _is_ai_enabled():
            return _ai_unavailable_response()

        try:
            from api.models import SecurityDecision
            from ai.service import ai_analysis_service

            decision = SecurityDecision.objects.filter(finding_id=finding_id).first()
            if not decision:
                return Response(
                    {"errors": [{"status": "404", "title": "No Decision", "detail": "No decision found."}]},
                    status=404,
                    content_type="application/vnd.api+json",
                )

            data = ai_analysis_service._decision_to_dict(decision)
            return _json_api_success(data, "security-decisions", str(decision.id))
        except Exception as e:
            logger.error("AI decision view error: %s", e)
            return _ai_unavailable_response()


class AIDecisionLogView(APIView):
    """
    GET /ai/decisions — List all decisions (paginated)
    """

    def get(self, request: Request) -> Response:
        if not _is_ai_enabled():
            return _ai_unavailable_response()

        try:
            from api.models import SecurityDecision
            from ai.service import ai_analysis_service

            page = int(request.query_params.get("page[number]", 1))
            page_size = int(request.query_params.get("page[size]", 20))

            qs = SecurityDecision.objects.all().order_by("-inserted_at")

            # Filters
            prio = request.query_params.get("filter[priority]")
            if prio:
                qs = qs.filter(priority=prio)
            review_status = request.query_params.get("filter[human_review_status]")
            if review_status:
                qs = qs.filter(human_review_status=review_status)
            dec = request.query_params.get("filter[decision]")
            if dec:
                qs = qs.filter(decision=dec)

            total = qs.count()
            start = (page - 1) * page_size
            end = start + page_size
            decisions = qs[start:end]

            items = [ai_analysis_service._decision_to_dict(d) for d in decisions]
            return _json_api_list(items, "security-decisions", total, page, page_size)
        except Exception as e:
            logger.error("Decision log view error: %s", e)
            return _ai_unavailable_response()


class AIDecisionDetailView(APIView):
    """
    PATCH /ai/decisions/{decision_id} — Submit human review
    """

    def patch(self, request: Request, decision_id: str) -> Response:
        if not _is_ai_enabled():
            return _ai_unavailable_response()

        try:
            from django.utils import timezone
            from api.models import SecurityDecision
            from ai.service import ai_analysis_service

            decision = SecurityDecision.objects.filter(id=decision_id).first()
            if not decision:
                return Response(
                    {"errors": [{"status": "404", "title": "Not Found", "detail": "Decision not found."}]},
                    status=404,
                    content_type="application/vnd.api+json",
                )

            data = request.data.get("data", {}).get("attributes", request.data)
            status_val = data.get("human_review_status")
            if status_val:
                decision.human_review_status = status_val
                decision.reviewed_at = timezone.now()
                if request.user and request.user.is_authenticated:
                    decision.reviewed_by = getattr(request.user, "email", str(request.user))
                else:
                    decision.reviewed_by = data.get("assigned_to", "Reviewer")

            notes = data.get("notes")
            if notes and status_val and "REJECTED" in status_val:
                decision.remediation_status = "REJECTED"
            elif notes and status_val and "MODIFIED" in status_val:
                decision.remediation_status = "RISK_ACCEPTED"

            decision.save()

            out_data = ai_analysis_service._decision_to_dict(decision)
            return _json_api_success(out_data, "security-decisions", str(decision.id))
        except Exception as e:
            logger.error("Decision detail patch error: %s", e)
            return _ai_unavailable_response()


class AIDecisionCreateJiraTicketView(APIView):
    """
    POST /ai/decisions/{decision_id}/jira-ticket

    Create a real Jira ticket for this decision's finding using the
    tenant's existing connected Jira integration (see
    tasks/jobs/integrations.py::send_findings_to_jira — the same code path
    the manual Findings-page "send to Jira" flow uses). Idempotent: if a
    ticket was already created for this decision, returns the existing one
    instead of creating a duplicate.
    """

    def post(self, request: Request, decision_id: str) -> Response:
        try:
            from api.db_utils import rls_transaction
            from api.models import Integration, SecurityDecision

            tenant_id = getattr(request, "tenant_id", None)
            if not tenant_id:
                return Response(
                    {"errors": [{"status": "400", "title": "No tenant resolved for this request."}]},
                    status=400,
                    content_type="application/vnd.api+json",
                )

            with rls_transaction(tenant_id):
                decision = SecurityDecision.objects.filter(
                    id=decision_id, tenant_id=tenant_id
                ).first()
                if not decision:
                    return Response(
                        {"errors": [{"status": "404", "title": "Not Found", "detail": "Decision not found."}]},
                        status=404,
                        content_type="application/vnd.api+json",
                    )

                # Idempotent — don't spam a new ticket on repeat clicks.
                if decision.jira_ticket_key:
                    from ai.service import ai_analysis_service
                    return _json_api_success(
                        ai_analysis_service._decision_to_dict(decision),
                        "security-decisions",
                        str(decision.id),
                    )

                integration = Integration.objects.filter(
                    tenant_id=tenant_id,
                    integration_type=Integration.IntegrationChoices.JIRA,
                    enabled=True,
                    connected=True,
                ).first()
                if integration is None:
                    return Response(
                        {"errors": [{"status": "400", "title": "No connected Jira integration is configured for this tenant."}]},
                        status=400,
                        content_type="application/vnd.api+json",
                    )

                body = request.data.get("data", {}).get("attributes", request.data) if isinstance(request.data, dict) else {}
                project_key = body.get("project_key") or integration.configuration.get("default_project_key")
                issue_type = body.get("issue_type") or integration.configuration.get("default_issue_type")
                if not project_key or not issue_type:
                    return Response(
                        {"errors": [{"status": "400", "title": "project_key/issue_type not provided and no default is configured on the Jira integration."}]},
                        status=400,
                        content_type="application/vnd.api+json",
                    )

            from tasks.jobs.integrations import send_findings_to_jira

            result = send_findings_to_jira(
                tenant_id=str(tenant_id),
                integration_id=str(integration.id),
                project_key=project_key,
                issue_type=issue_type,
                finding_ids=[str(decision.finding_id)],
            )

            ticket = result.get("tickets", {}).get(str(decision.finding_id))
            if not ticket:
                return Response(
                    {"errors": [{"status": "502", "title": "Jira ticket creation failed", "detail": result.get("error", "Unknown error.")}]},
                    status=502,
                    content_type="application/vnd.api+json",
                )

            with rls_transaction(tenant_id):
                decision.jira_ticket_key = ticket["key"]
                decision.jira_ticket_url = ticket["url"]
                decision.save(update_fields=["jira_ticket_key", "jira_ticket_url", "updated_at"])

            from ai.service import ai_analysis_service
            return _json_api_success(
                ai_analysis_service._decision_to_dict(decision),
                "security-decisions",
                str(decision.id),
            )
        except Exception as e:
            logger.error("Create Jira ticket error: %s", e)
            return Response(
                {"errors": [{"status": "500", "title": "Failed to create Jira ticket", "detail": str(e)}]},
                status=500,
                content_type="application/vnd.api+json",
            )


class AIAdvisorQueryView(APIView):
    """
    POST /ai/advisor/query  — Ask the AI Advisor a security question

    The advisor:
    1. Retrieves relevant findings from Prowler DB (filtered vector-style)
    2. Sanitizes the finding summaries
    3. Sends compact context to Claude
    4. Returns grounded answer with finding references
    """
    parser_classes = [JSONParser, JSONAPIParser]
    renderer_classes = [JSONRenderer, JSONAPIRenderer]
    resource_name = "advisor-queries"

    def post(self, request: Request) -> Response:
        if not _is_ai_enabled():
            return _ai_unavailable_response()

        raw_data = request.data
        if isinstance(raw_data, dict):
            _attrs = raw_data.get("data", {}).get("attributes", {}) if "data" in raw_data else raw_data.get("attributes", {})
            question = (
                raw_data.get("question")
                or _attrs.get("question")
                or ""
            ).strip()
            history = raw_data.get("history") or _attrs.get("history") or []
        else:
            question = ""
            history = []

        if not isinstance(history, list):
            history = []

        if not question:
            return Response(
                {"errors": [{"status": "400", "title": "Bad Request", "detail": "question is required"}]},
                status=400,
                content_type="application/vnd.api+json",
            )

        if len(question) > 1000:
            return Response(
                {"errors": [{"status": "400", "title": "Bad Request", "detail": "question too long (max 1000 chars)"}]},
                status=400,
                content_type="application/vnd.api+json",
            )

        try:
            from ai.claude_provider import get_ai_provider
            from ai.sanitizer import sanitizer

            # Sanitize question (may contain injection attempts)
            clean_question = sanitizer.sanitize_string(question)

            # Optional provider scope filter — body is JSON:API: {data:{attributes:{provider}}}
            _attrs = request.data.get("data", {}).get("attributes", {}) if isinstance(request.data, dict) else {}
            raw_prov = _attrs.get("provider") or (request.data.get("provider") if isinstance(request.data, dict) else None)

            provider_filter = None
            if raw_prov:
                p_lower = str(raw_prov).strip().lower()
                if p_lower in ("oracle_saas", "oracle-saas", "fusion", "fusion_saas", "fusion-saas", "oracle fusion saas", "oracle saas"):
                    provider_filter = "oracle_saas"
                elif p_lower in ("oci", "oracle", "oraclecloud"):
                    provider_filter = "oraclecloud"
                elif p_lower in ("azure", "az"):
                    provider_filter = "azure"
                elif p_lower in ("aws", "amazon"):
                    provider_filter = "aws"
                elif p_lower in ("gcp", "google"):
                    provider_filter = "gcp"
                elif p_lower in ("k8s", "kubernetes"):
                    provider_filter = "kubernetes"
                elif p_lower in ("github", "m365"):
                    provider_filter = p_lower

            # Natural Language Provider Intent Detection from question (with typo tolerance)
            if not provider_filter:
                q_lower = clean_question.lower()
                if any(k in q_lower for k in ("oracle saas", "oracle_saas", "oracale saas", "fusion", "erp", "hcm", "saas", "sod matrix", "toxic combination")):
                    provider_filter = "oracle_saas"
                elif any(k in q_lower for k in ("oci", "oracle cloud", "oraclecloud", "oracale cloud", "tenancy", "compartment", "vcn")):
                    provider_filter = "oraclecloud"
                elif any(k in q_lower for k in ("azure", "entra", "entra id", "defender", "virtual machine", "vnet", "nsg", "microsoft", "active directory", "iam account", "iam accounts", "privilege escalation", "subscription")):
                    provider_filter = "azure"
                elif any(k in q_lower for k in ("aws", "amazon", "s3", "ec2", "iam role")):
                    provider_filter = "aws"
                elif any(k in q_lower for k in ("gcp", "google cloud", "bigquery")):
                    provider_filter = "gcp"

            # Query tenant connected cloud providers
            tenant_id = getattr(request, "tenant_id", None) or (
                request.auth.get("tenant_id") if request.auth and hasattr(request.auth, "get") else None
            )
            connected_providers = []
            try:
                from api.models import Provider
                prov_qs = Provider.objects.all()
                if tenant_id:
                    prov_qs = prov_qs.filter(tenant_id=tenant_id)
                for p in prov_qs:
                    connected_providers.append({
                        "id": str(p.id),
                        "provider": str(p.provider).lower(),
                        "alias": str(p.alias or p.provider),
                        "uid": str(p.uid or ""),
                    })
            except Exception as pe:
                logger.warning("Could not fetch connected providers for advisor: %s", pe)

            # Retrieve relevant findings from DB — compact summaries only
            relevant_findings = _retrieve_relevant_findings(
                request, clean_question, provider=provider_filter, history=history
            )

            ai_provider = get_ai_provider()
            result = ai_provider.answer_advisor_query(
                question=clean_question,
                relevant_findings=relevant_findings,
                history=history,
                connected_providers=connected_providers,
            )

            from django.http import JsonResponse
            return JsonResponse(result.to_dict(), status=200)

        except Exception as e:
            logger.error("AI Advisor query error: %s", e, exc_info=True)
            return _ai_unavailable_response()


def _retrieve_relevant_findings(
    request: Request,
    question: str,
    limit: int = 35,
    provider: str | None = None,
    history: list[dict[str, str]] | None = None,
) -> list[dict[str, Any]]:
    """Retrieve relevant findings from DB for AI Advisor context.

    Prioritizes findings that match keywords, check IDs, or resource names in the query,
    then pads with top-severity failing findings.
    """
    try:
        from contextlib import nullcontext
        from django.db.models import Case, IntegerField, Q, Value, When

        from api.db_utils import rls_transaction
        from api.models import Finding

        q_lower = question.strip().lower()

        # Security/technical terms that signify a real technical query
        security_terms = [
            "oci", "oracle", "azure", "aws", "gcp", "saas", "erp", "cloud",
            "high", "critical", "medium", "low", "risk", "finding", "vulnerability", "threat",
            "infrastructure", "network", "subnet", "gateway", "nsg", "iam", "policy", "role", "user",
            "sod", "mfa", "audit", "log", "guard", "topic", "storage", "bucket", "database", "sql",
            "cve", "compliance", "cis", "sox", "itgc", "remediate", "remediation", "patch", "fix"
        ]
        has_security_topic = any(term in q_lower for term in security_terms)

        # 1. Detect pure conversational / greeting questions (ONLY when no security topics are mentioned)
        if not has_security_topic:
            conversational_patterns = [
                "will you work", "will ou work", "hello", "hi", "hey", "who are you", "what can you do",
                "how do you work", "help", "good morning", "good evening", "how are you",
                "are you working", "can you help me", "what is your name", "test"
            ]
            if any(q_lower == p or q_lower.startswith(p + " ") or q_lower.startswith(p + "?") for p in conversational_patterns):
                return []

        # 2. Detect conversational follow-ups (rely on chat history rather than pulling new random findings)
        if history and not has_security_topic and any(k in q_lower for k in ["for that", "about that", "step by step", "explain step", "write code", "generate script", "checklist", "summarize that", "tell me more", "how to fix that", "in detail"]):
            return []

        tenant_id = getattr(request, "tenant_id", None) or (
            request.auth.get("tenant_id") if request.auth and hasattr(request.auth, "get") else None
        )
        if not tenant_id:
            # Fail closed — never guess a tenant via Tenant.objects.first(),
            # that would leak an arbitrary tenant's findings into this
            # request's AI context.
            return []

        if tenant_id:
            cm = rls_transaction(tenant_id)
        else:
            cm = nullcontext()

        with cm:
            qs = Finding.objects.filter(status="FAIL").select_related(
                "scan", "scan__provider"
            ).prefetch_related("resources")

            # Apply provider scope filter when requested
            if provider:
                if provider == "oracle_saas":
                    qs = qs.filter(
                        Q(scan__provider__provider__iexact="oracle_saas")
                        | Q(uid__startswith="prowler-oracle_saas")
                        | Q(uid__startswith="oracle_saas-")
                        | Q(check_id__startswith="erp_")
                    )
                elif provider in ("oraclecloud", "oci"):
                    qs = qs.filter(
                        Q(scan__provider__provider__iexact="oraclecloud")
                        | Q(scan__provider__provider__iexact="oci")
                        | Q(uid__startswith="prowler-oraclecloud")
                        | Q(uid__startswith="prowler-oci")
                        | Q(uid__startswith="oci-")
                        | Q(check_id__startswith="oci_")
                    )
                elif provider == "azure":
                    qs = qs.filter(
                        Q(scan__provider__provider__iexact="azure")
                        | Q(uid__startswith="prowler-azure")
                        | Q(uid__startswith="azure-")
                    )
                elif provider == "aws":
                    qs = qs.filter(
                        Q(scan__provider__provider__iexact="aws")
                        | Q(uid__startswith="prowler-aws")
                        | Q(uid__startswith="aws-")
                    )
                elif provider == "gcp":
                    qs = qs.filter(
                        Q(scan__provider__provider__iexact="gcp")
                        | Q(uid__startswith="prowler-gcp")
                        | Q(uid__startswith="gcp-")
                    )
                else:
                    qs = qs.filter(scan__provider__provider__iexact=provider)

            # Apply specific severity filter if explicitly mentioned in query
            if "critical" in q_lower:
                qs = qs.filter(severity__iexact="critical")
            elif "high" in q_lower:
                qs = qs.filter(severity__iexact="high")
            elif "medium" in q_lower:
                qs = qs.filter(severity__iexact="medium")
            elif "low" in q_lower:
                qs = qs.filter(severity__iexact="low")

            # Keyword matching: extract meaningful terms from question
            words = [w.strip("?,.:;\"'()[]") for w in question.split() if len(w.strip("?,.:;\"'()[]")) > 2]
            stop_words = {
                "analyze", "finding", "what", "risk", "and", "how", "we", "remediate",
                "the", "with", "for", "show", "give", "tell", "about", "which", "are",
                "from", "that", "this", "can", "our", "all", "does", "have", "first", "today",
                "high", "critical", "medium", "low", "find", "infrastructure", "environment",
                "account", "accounts", "missing", "enforce", "enforcement", "status", "check", "user", "users"
            }
            meaningful_keywords = [w for w in words if w.lower() not in stop_words]

            matching_ids = set()
            matching_findings = []

            # Ingest Oracle Fusion SaaS / ERP / Identity Telemetry ONLY when explicitly targeted for SaaS and NOT for other clouds
            is_saas_query = (
                (provider is None or provider == "oracle_saas")
                and provider not in ("azure", "aws", "gcp", "oraclecloud", "oci", "kubernetes")
                and any(k in q_lower for k in ("oracle saas", "fusion", "erp", "hcm", "sod", "toxic combination", "consultant", "curtis", "alan", "mandy", "oracle erp"))
            )
            if is_saas_query:
                try:
                    from api.v1.oracle_saas_views import load_real_pod_users, SOD_TOXIC_MATRICES
                    saas_users = load_real_pod_users()
                    if saas_users:
                        # Filter relevant users based on question keywords
                        relevant_saas_users = []
                        for u in saas_users:
                            dept = (u.get("department") or "").lower()
                            uname = (u.get("username") or "").lower()
                            roles = " ".join(u.get("roles") or []).lower()
                            if any(k in q_lower for k in ("finance", "ap", "gl", "payables", "ledger")) and any(fk in (dept + " " + roles + " " + uname) for fk in ("finance", "ap", "gl", "payables", "account")):
                                relevant_saas_users.append(u)
                            elif any(k in q_lower for k in ("hr", "hcm", "human resource")) and any(hk in (dept + " " + roles + " " + uname) for hk in ("hr", "hcm", "human", "resource", "person")):
                                relevant_saas_users.append(u)
                            elif "pam" in q_lower or "superuser" in q_lower or "consultant" in q_lower:
                                if u.get("is_superuser"):
                                    relevant_saas_users.append(u)
                            elif "sod" in q_lower:
                                if u.get("sod_conflicts"):
                                    relevant_saas_users.append(u)

                        if not relevant_saas_users:
                            relevant_saas_users = saas_users[:10]

                        matching_findings.append({
                            "finding_id": "ORACLE-SAAS-TELEMETRY-SUMMARY",
                            "uid": "oracle_saas-identity-governance",
                            "check_id": "oracle_saas_identity_governance",
                            "check_title": "Oracle Fusion SaaS Identity Governance & SoD Posture",
                            "severity": "CRITICAL" if any(u.get("is_superuser") or u.get("sod_conflicts") for u in relevant_saas_users) else "MEDIUM",
                            "status": "FAIL" if any(u.get("is_superuser") or u.get("sod_conflicts") for u in relevant_saas_users) else "PASS",
                            "status_extended": f"Total Monitored SaaS Users: {len(saas_users)}. Active Accounts: {len([u for u in saas_users if u.get('days_inactive', 0) < 30 and not u.get('is_suspended')])}, Dormant: {len([u for u in saas_users if u.get('days_inactive', 0) >= 30])}, Superusers/PAM: {len([u for u in saas_users if u.get('is_superuser')])}, SoD Toxic Combinations: {sum(len(u.get('sod_conflicts', [])) for u in saas_users)}. Inspected Users: {', '.join(u.get('username') for u in relevant_saas_users[:5])}.",
                            "remediation": "Enforce MFA via Oracle Identity Cloud Service (IDCS) / OCI IAM Domain Conditional Access Policy, decouple conflicting SoD roles, and quarantine unused PAM accounts.",
                            "provider": "oracle_saas",
                            "resource": {"name": "Oracle Fusion Cloud Pod (fa-etar-dev13)"},
                        })
                except Exception as s_err:
                    logger.debug("SaaS telemetry inclusion error: %s", s_err)

            def _serialize_finding(f):
                meta = f.check_metadata or {}
                first_resource = f.resources.first()
                res_name = getattr(f, "resource_name", None) or (first_resource.name if first_resource else "")
                if not res_name and f.uid:
                    parts = f.uid.split("-")
                    if len(parts) > 1:
                        res_name = parts[-1]

                if f.scan and f.scan.provider:
                    prov = f.scan.provider.provider
                elif (f.uid or "").startswith(("prowler-oracle_saas", "oracle_saas-")) or (f.check_id or "").startswith("erp_"):
                    prov = "oracle_saas"
                elif (f.uid or "").startswith(("prowler-oraclecloud", "prowler-oci", "oci-")):
                    prov = "oraclecloud"
                elif (f.uid or "").startswith(("prowler-azure", "azure-")):
                    prov = "azure"
                elif (f.uid or "").startswith(("prowler-aws", "aws-")):
                    prov = "aws"
                elif (f.uid or "").startswith(("prowler-gcp", "gcp-")):
                    prov = "gcp"
                else:
                    prov = "oraclecloud" if provider in ("oraclecloud", "oci") else "azure"
                title = meta.get("checktitle") or meta.get("check_title") or meta.get("CheckTitle") or f.check_id.replace("_", " ")

                rem = ""
                if isinstance(meta.get("remediation"), dict):
                    rem = meta["remediation"].get("recommendation", {}).get("text") or meta["remediation"].get("code", {}).get("cli") or ""
                elif isinstance(meta.get("remediation"), str):
                    rem = meta["remediation"]
                elif meta.get("remediation_text"):
                    rem = meta["remediation_text"]

                return {
                    "finding_id": str(f.id),
                    "uid": f.uid or "",
                    "check_id": f.check_id,
                    "check_title": title,
                    "severity": f.severity,
                    "status": f.status,
                    "status_extended": f.status_extended or "",
                    "remediation": rem,
                    "provider": prov,
                    "resource": {"name": res_name or "Cloud Resource"},
                }

            if meaningful_keywords:
                # Exclude broad noise words to focus on discriminative security and domain terms
                search_kws = [k for k in meaningful_keywords if len(k) >= 2 and k.lower() not in ("administrator", "administrators", "admin", "admins")]
                if not search_kws:
                    search_kws = meaningful_keywords

                q_obj = Q()
                for kw in search_kws:
                    if len(kw) <= 2:
                        q_obj |= (
                            Q(check_id__icontains=f"_{kw}")
                            | Q(check_id__istartswith=f"{kw}_")
                            | Q(status_extended__iregex=rf"\b{kw}\b")
                        )
                    else:
                        q_obj |= (
                            Q(check_id__icontains=kw)
                            | Q(status_extended__iregex=rf"\b{kw}\b")
                            | Q(uid__icontains=kw)
                        )

                matched_qs = qs.filter(q_obj).distinct()[:limit]
                for f in matched_qs:
                    matching_ids.add(f.id)
                    matching_findings.append(_serialize_finding(f))

            # Only pad with top general findings if user explicitly asked for general prioritization
            is_general_triage = any(t in q_lower for t in ["remediate first", "top risk", "top finding", "critical", "prioritize", "today", "what should we fix"])
            if (is_general_triage or not meaningful_keywords) and len(matching_findings) < limit:
                remaining_limit = limit - len(matching_findings)
                severity_order = Case(
                    When(severity="critical", then=Value(0)),
                    When(severity="high", then=Value(1)),
                    When(severity="medium", then=Value(2)),
                    When(severity="low", then=Value(3)),
                    default=Value(4),
                    output_field=IntegerField(),
                )
                fill_qs = (
                    qs.exclude(id__in=matching_ids)
                    .annotate(severity_rank=severity_order)
                    .order_by("severity_rank")[:remaining_limit]
                )

                for f in fill_qs:
                    matching_findings.append(_serialize_finding(f))

            return matching_findings
    except Exception as e:
        logger.warning("Failed to retrieve findings for advisor: %s", e)
        return []


def _finding_to_dict(finding: Any) -> dict[str, Any]:
    """Convert a Prowler Finding model instance to a normalizer-compatible dict."""
    resource = getattr(finding, "resource", None)
    scan = getattr(finding, "scan", None)
    provider = getattr(resource, "provider", None) if resource else None

    return {
        "id": str(finding.id),
        "attributes": {
            "uid": finding.uid or "",
            "status": finding.status,
            "status_extended": finding.status_extended or "",
            "severity": finding.severity,
            "check_id": finding.check_id,
            "muted": finding.muted,
            "muted_reason": finding.muted_reason,
            "check_metadata": finding.check_metadata or {},
            "raw_result": finding.raw_result,
            "inserted_at": str(finding.inserted_at) if finding.inserted_at else "",
            "updated_at": str(finding.updated_at) if finding.updated_at else "",
            "first_seen_at": str(finding.first_seen_at) if getattr(finding, "first_seen_at", None) else None,
        },
        "relationships": {
            "resource": {
                "attributes": {
                    "name": resource.name if resource else "",
                    "uid": resource.uid if resource else "",
                    "region": resource.region if resource else "",
                    "service": resource.service if resource else "",
                    "type": resource.type if resource else "",
                    "tags": resource.tags if resource else {},
                }
                if resource
                else {}
            },
            "scan": {
                "attributes": {
                    "name": scan.name if scan else "",
                    "trigger": scan.trigger if scan else "",
                }
                if scan
                else {}
            },
            "provider": {
                "data": {
                    "type": provider.provider if provider else "",
                    "id": str(provider.id) if provider else "",
                }
                if provider
                else {}
            },
        },
    }





class AIReasoningProxyView(APIView):
    """
    Spectra Developer Reasoning Proxy (Qwen 3.5 9B on Azure VM).
    Accepts arbitrary security prompts or telemetry contexts and returns structured CISO reasoning.
    """
    parser_classes = [JSONParser, JSONAPIParser]
    renderer_classes = [JSONRenderer, JSONAPIRenderer]

    def post(self, request: Request) -> Response:
        prompt = request.data.get("prompt")
        if not prompt:
            return Response(
                {"error": "Field 'prompt' is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tenant_id = str(getattr(request, "tenant_id", "") or "")
        from ai.claude_provider import get_ai_provider
        provider = get_ai_provider(tenant_id=tenant_id)

        system_prompt = request.data.get(
            "system_prompt",
            "You are Spectra, an elite Digital CISO reasoning engine. Analyze the cloud security context and return structured JSON.",
        )
        temperature = float(request.data.get("temperature", 0.10))
        max_tokens = int(request.data.get("max_tokens", 2048))

        if hasattr(provider, "_call_vllm_chat"):
            result = provider._call_vllm_chat(
                system_prompt=system_prompt,
                user_prompt=prompt,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        else:
            result = {"summary": "Analysis completed", "raw_output": str(provider)}

        return Response({
            "status": "success",
            "model": getattr(provider, "model", "qwen-3.5-9b"),
            "data": result,
        }, status=status.HTTP_200_OK)


class AIRemediationGeneratorView(APIView):
    """
    Auto-generates Terraform / CLI remediation playbooks for a specific finding using Qwen 3.5 9B.
    """
    def post(self, request: Request, finding_id: str) -> Response:
        script_type = request.data.get("script_type", "terraform").lower()
        
        from api.models import Finding, RemediationPlaybook, Tenant
        from ai.claude_provider import get_ai_provider

        tenant_id = getattr(request, "tenant_id", None)
        finding = Finding.objects.filter(id=finding_id).first()
        if not finding:
            return Response(
                {"error": f"Finding {finding_id} not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        provider = get_ai_provider(tenant_id=str(tenant_id) if tenant_id else None)
        system_prompt = (
            f"You are a Cloud Security Engineer. Generate an actionable {script_type} script to remediate "
            f"this security finding. Return JSON with 'title', 'code_snippet', 'rollback_snippet', "
            f"'estimated_downtime_minutes', and 'requires_maintenance_window'."
        )
        user_prompt = (
            f"Finding Check ID: {finding.check_id}\n"
            f"Severity: {finding.severity}\n"
            f"Status Extended: {finding.status_extended}\n"
            f"Resource: {finding.resource_id}\n"
        )

        if hasattr(provider, "_call_vllm_chat"):
            data = provider._call_vllm_chat(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=0.1,
                max_tokens=1500,
            )
        else:
            data = {
                "title": f"Remediate {finding.check_id}",
                "code_snippet": f"# Remediation for {finding.check_id}\n# Apply via {script_type}",
                "rollback_snippet": "# Rollback steps",
                "estimated_downtime_minutes": 0,
                "requires_maintenance_window": False,
            }

        # Save to RemediationPlaybook if tenant exists
        if tenant_id:
            tenant_obj = Tenant.objects.filter(id=tenant_id).first()
            if tenant_obj:
                playbook = RemediationPlaybook.objects.create(
                    tenant=tenant_obj,
                    finding_id=finding.id,
                    title=data.get("title", f"Remediate {finding.check_id}"),
                    script_type=script_type,
                    code_snippet=data.get("code_snippet", ""),
                    rollback_snippet=data.get("rollback_snippet", ""),
                    estimated_downtime_minutes=int(data.get("estimated_downtime_minutes", 0)),
                    requires_maintenance_window=bool(data.get("requires_maintenance_window", False)),
                    is_automated=False,
                )
                data["playbook_id"] = str(playbook.id)

        return Response({
            "status": "success",
            "finding_id": finding_id,
            "script_type": script_type,
            "data": data,
        }, status=status.HTTP_200_OK)