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
        else:
            question = ""

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
            _attrs = request.data.get("data", {}).get("attributes", {})
            provider_filter = _attrs.get("provider") or request.data.get("provider")
            if provider_filter and str(provider_filter).strip().lower() in (
                "aws", "azure", "gcp", "kubernetes", "github", "m365", "oraclecloud"
            ):
                provider_filter = str(provider_filter).strip().lower()
            else:
                provider_filter = None

            # Retrieve relevant findings from DB — compact summaries only
            relevant_findings = _retrieve_relevant_findings(
                request, clean_question, provider=provider_filter
            )

            ai_provider = get_ai_provider()
            result = ai_provider.answer_advisor_query(
                question=clean_question,
                relevant_findings=relevant_findings,
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
) -> list[dict]:
    """
    Retrieve a comprehensive, relevant list of findings for the AI Advisor.
    Prioritizes findings that match keywords, check IDs, or resource names in the query,
    then pads with top-severity failing findings.
    """
    try:
        from contextlib import nullcontext
        from django.db.models import Case, IntegerField, Q, Value, When

        from api.db_utils import rls_transaction
        from api.models import Finding

        tenant_id = getattr(request, "tenant_id", None) or (
            request.auth.get("tenant_id") if request.auth and hasattr(request.auth, "get") else None
        )

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
                qs = qs.filter(scan__provider__provider__iexact=provider)

            # Keyword matching: extract meaningful terms from question
            words = [w.strip("?,.:;\"'()[]") for w in question.split() if len(w.strip("?,.:;\"'()[]")) > 2]
            stop_words = {
                "analyze", "finding", "what", "risk", "and", "how", "we", "remediate",
                "the", "with", "for", "show", "give", "tell", "about", "which", "are",
                "from", "that", "this", "can", "our", "all", "does", "have"
            }
            meaningful_keywords = [w for w in words if w.lower() not in stop_words]

            matching_ids = set()
            matching_findings = []

            if meaningful_keywords:
                q_obj = Q()
                for kw in meaningful_keywords:
                    q_obj |= (
                        Q(check_id__icontains=kw)
                        | Q(status_extended__icontains=kw)
                        | Q(uid__icontains=kw)
                        | Q(resources__name__icontains=kw)
                        | Q(resources__uid__icontains=kw)
                    )

                matched_qs = qs.filter(q_obj).distinct()[:limit]
                for f in matched_qs:
                    matching_ids.add(f.id)
                    first_resource = f.resources.first()
                    prov = f.scan.provider if f.scan else None
                    matching_findings.append(
                        {
                            "finding_id": str(f.id),
                            "uid": f.uid or "",
                            "check_id": f.check_id,
                            "check_title": f.check_metadata.get("checktitle", "") if f.check_metadata else "",
                            "severity": f.severity,
                            "status": f.status,
                            "status_extended": f.status_extended or "",
                            "remediation": f.check_metadata.get("remediation_text", "") if f.check_metadata else "",
                            "provider": prov.provider if prov else "",
                            "resource": {"name": first_resource.name if first_resource else ""},
                        }
                    )

            # Fill remaining slots with top severity findings
            remaining_limit = max(0, limit - len(matching_findings))
            if remaining_limit > 0:
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
                    first_resource = f.resources.first()
                    prov = f.scan.provider if f.scan else None
                    matching_findings.append(
                        {
                            "finding_id": str(f.id),
                            "uid": f.uid or "",
                            "check_id": f.check_id,
                            "check_title": f.check_metadata.get("checktitle", "") if f.check_metadata else "",
                            "severity": f.severity,
                            "status": f.status,
                            "status_extended": f.status_extended or "",
                            "remediation": f.check_metadata.get("remediation_text", "") if f.check_metadata else "",
                            "provider": prov.provider if prov else "",
                            "resource": {"name": first_resource.name if first_resource else ""},
                        }
                    )

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