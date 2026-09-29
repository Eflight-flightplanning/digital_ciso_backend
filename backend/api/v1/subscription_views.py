from uuid import uuid4
from datetime import datetime, UTC
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import JSONParser, FormParser, MultiPartParser
from rest_framework_json_api.parsers import JSONParser as JSONAPIParser

from api.base_views import BaseViewSet, BaseRLSViewSet
from api.db_router import MainRouter
from api.models import (
    Provider,
    Role,
    Tenant,
    TenantCloudSubscription,
    TenantComplianceSubscription,
    SubscriptionChangeRequest,
)
from api.rbac.permissions import get_role, Permissions
from api.v1.serializers import (
    TenantCloudSubscriptionSerializer,
    TenantComplianceSubscriptionSerializer,
    SubscriptionChangeRequestSerializer,
    SubscriptionChangeRequestCreateSerializer,
    SubscriptionChangeRequestReviewSerializer,
    OnboardingSubscriptionSerializer,
)

AVAILABLE_CLOUD_CATALOG = [
    {
        "id": "azure",
        "name": "Microsoft Azure",
        "shortName": "Azure",
        "description": "Enterprise cloud infrastructure, Azure AD / Entra ID, Virtual Networks & Storage.",
        "icon": "azure",
        "category": "Hyper-scaler",
        "popular": True,
    },
    {
        "id": "oraclecloud",
        "name": "Oracle Cloud Infrastructure (OCI)",
        "shortName": "OCI",
        "description": "High-performance OCI compute, Autonomous Database, IAM and cloud storage security.",
        "icon": "oci",
        "category": "Enterprise Cloud",
        "popular": True,
    },
    {
        "id": "aws",
        "name": "Amazon Web Services",
        "shortName": "AWS",
        "description": "AWS EC2, S3, IAM, VPC, CloudTrail and serverless posture management.",
        "icon": "aws",
        "category": "Hyper-scaler",
        "popular": True,
    },
    {
        "id": "gcp",
        "name": "Google Cloud Platform",
        "shortName": "GCP",
        "description": "Google Cloud IAM, Compute Engine, BigQuery, GKE security analytics.",
        "icon": "gcp",
        "category": "Hyper-scaler",
        "popular": False,
    },
    {
        "id": "kubernetes",
        "name": "Kubernetes Clusters",
        "shortName": "Kubernetes",
        "description": "Cluster security, RBAC, pod security admission and container runtime auditing.",
        "icon": "kubernetes",
        "category": "Container & Orchestration",
        "popular": True,
    },
    {
        "id": "m365",
        "name": "Microsoft 365",
        "shortName": "M365",
        "description": "M365 Exchange, SharePoint, Teams and Entra ID security configuration.",
        "icon": "m365",
        "category": "SaaS & Productivity",
        "popular": False,
    },
    {
        "id": "github",
        "name": "GitHub DevOps",
        "shortName": "GitHub",
        "description": "Repository governance, branch protection, secrets scanning and CI/CD posture.",
        "icon": "github",
        "category": "DevSecOps",
        "popular": False,
    },
    {
        "id": "oracle_saas",
        "name": "Oracle Fusion SaaS",
        "shortName": "Oracle SaaS",
        "description": "Oracle ERP/HCM Cloud dormant account lifecycle, SoD conflicts and privilege analysis.",
        "icon": "oracle_saas",
        "category": "Enterprise SaaS",
        "popular": True,
    },
]

AVAILABLE_COMPLIANCE_CATALOG = [
    # Azure
    {
        "id": "cis_2.0_azure",
        "name": "CIS Microsoft Azure Foundations Benchmark v2.0",
        "provider": "azure",
        "providerName": "Azure",
        "category": "Cloud Benchmark",
        "version": "2.0",
        "description": "Prescriptive guidance for establishing a secure baseline configuration for Microsoft Azure.",
    },
    {
        "id": "nca_ecc_2.2024_azure",
        "name": "NCA Essential Cybersecurity Controls (ECC 2.2024) - Azure",
        "provider": "azure",
        "providerName": "Azure",
        "category": "Government & National",
        "version": "2.2024",
        "description": "Saudi National Cybersecurity Authority mandatory baseline security controls for cloud tenants.",
    },
    {
        "id": "nca_cscc_1.2023_azure",
        "name": "NCA Critical Systems Cybersecurity Controls (CSCC 1.2023)",
        "provider": "azure",
        "providerName": "Azure",
        "category": "Government & National",
        "version": "1.2023",
        "description": "Enhanced cybersecurity controls for critical national infrastructure and crown jewels on Azure.",
    },
    # OCI
    {
        "id": "cis_2.0_oraclecloud",
        "name": "CIS Oracle Cloud Infrastructure (OCI) Benchmark v2.0",
        "provider": "oraclecloud",
        "providerName": "OCI",
        "category": "Cloud Benchmark",
        "version": "2.0",
        "description": "Comprehensive security configuration baseline for Oracle Cloud Infrastructure compartments and tenancies.",
    },
    {
        "id": "nca_ecc_2.2024_oraclecloud",
        "name": "NCA Essential Cybersecurity Controls (ECC 2.2024) - OCI",
        "provider": "oraclecloud",
        "providerName": "OCI",
        "category": "Government & National",
        "version": "2.2024",
        "description": "NCA ECC cybersecurity compliance controls implemented across Oracle Cloud compartments.",
    },
    # AWS
    {
        "id": "cis_3.0_aws",
        "name": "CIS Amazon Web Services Foundations Benchmark v3.0",
        "provider": "aws",
        "providerName": "AWS",
        "category": "Cloud Benchmark",
        "version": "3.0",
        "description": "Latest CIS benchmark for AWS identity, logging, monitoring and networking baseline security.",
    },
    {
        "id": "nca_ecc_2.2024_aws",
        "name": "NCA Essential Cybersecurity Controls (ECC 2.2024) - AWS",
        "provider": "aws",
        "providerName": "AWS",
        "category": "Government & National",
        "version": "2.2024",
        "description": "NCA cybersecurity compliance controls mapped to AWS resources and accounts.",
    },
    # Kubernetes
    {
        "id": "cis_1.8_kubernetes",
        "name": "CIS Kubernetes Benchmark v1.8",
        "provider": "kubernetes",
        "providerName": "Kubernetes",
        "category": "Cloud Benchmark",
        "version": "1.8",
        "description": "Security guidance for Kubernetes master nodes, worker nodes, and etcd cluster state.",
    },
    # GCP
    {
        "id": "cis_2.0_gcp",
        "name": "CIS Google Cloud Platform Benchmark v2.0",
        "provider": "gcp",
        "providerName": "GCP",
        "category": "Cloud Benchmark",
        "version": "2.0",
        "description": "Security benchmark controls covering Google Cloud project IAM, audit logging, and VPC firewalls.",
    },
    # Universal / Multi-Cloud
    {
        "id": "soc2_type2",
        "name": "SOC 2 Type II Security & Confidentiality",
        "provider": "universal",
        "providerName": "Multi-Cloud",
        "category": "Industry Standard",
        "version": "2024",
        "description": "Trust Services Criteria for security, availability, processing integrity, and confidentiality.",
    },
    {
        "id": "iso_27001_2022",
        "name": "ISO/IEC 27001:2022 ISMS Baseline",
        "provider": "universal",
        "providerName": "Multi-Cloud",
        "category": "International Standard",
        "version": "2022",
        "description": "Global information security management standard covering cloud infrastructure and risk controls.",
    },
    {
        "id": "pci_dss_4.0",
        "name": "PCI-DSS v4.0 Payment Card Industry",
        "provider": "universal",
        "providerName": "Multi-Cloud",
        "category": "Industry Standard",
        "version": "4.0",
        "description": "Technical requirements for entities that store, process, or transmit cardholder data in cloud environments.",
    },
    {
        "id": "hipaa_security",
        "name": "HIPAA Security Rule",
        "provider": "universal",
        "providerName": "Multi-Cloud",
        "category": "Regulatory",
        "version": "Final Rule",
        "description": "Safeguards for electronic protected health information (ePHI) deployed across cloud tenants.",
    },
]

DEFAULT_COMPLIANCES_BY_PROVIDER = {
    "azure": [
        {"framework_id": "cis_2.0_azure", "framework_name": "CIS Microsoft Azure Foundations Benchmark v2.0", "provider_type": "azure"},
        {"framework_id": "nca_ecc_2.2024_azure", "framework_name": "NCA Essential Cybersecurity Controls (ECC 2.2024) - Azure", "provider_type": "azure"},
        {"framework_id": "soc2_type2", "framework_name": "AICPA SOC 2 Type II", "provider_type": None},
    ],
    "oraclecloud": [
        {"framework_id": "cis_2.0_oraclecloud", "framework_name": "CIS Oracle Cloud Infrastructure (OCI) Benchmark v2.0", "provider_type": "oraclecloud"},
        {"framework_id": "nca_ecc_2.2024_oraclecloud", "framework_name": "NCA Essential Cybersecurity Controls (ECC 2.2024) - OCI", "provider_type": "oraclecloud"},
        {"framework_id": "soc2_type2", "framework_name": "AICPA SOC 2 Type II", "provider_type": None},
    ],
    "oci": [
        {"framework_id": "cis_2.0_oraclecloud", "framework_name": "CIS Oracle Cloud Infrastructure (OCI) Benchmark v2.0", "provider_type": "oraclecloud"},
        {"framework_id": "nca_ecc_2.2024_oraclecloud", "framework_name": "NCA Essential Cybersecurity Controls (ECC 2.2024) - OCI", "provider_type": "oraclecloud"},
        {"framework_id": "soc2_type2", "framework_name": "AICPA SOC 2 Type II", "provider_type": None},
    ],
    "aws": [
        {"framework_id": "cis_3.0_aws", "framework_name": "CIS Amazon Web Services Benchmark v3.0", "provider_type": "aws"},
        {"framework_id": "soc2_type2", "framework_name": "AICPA SOC 2 Type II", "provider_type": None},
    ],
    "gcp": [
        {"framework_id": "cis_3.0_gcp", "framework_name": "CIS Google Cloud Platform Benchmark v3.0", "provider_type": "gcp"},
        {"framework_id": "soc2_type2", "framework_name": "AICPA SOC 2 Type II", "provider_type": None},
    ],
}


def ensure_tenant_default_subscriptions(tenant_id: str):
    """
    Ensure an existing tenant has at least one cloud subscription seeded,
    based on their existing Provider records, or defaults to all active providers.
    """
    from api.models import Provider
    existing_clouds = TenantCloudSubscription.objects.filter(
        tenant_id=tenant_id
    ).exists()
    if not existing_clouds:
        # Check if tenant has any active providers
        providers = list(
            Provider.objects.filter(tenant_id=tenant_id)
            .values_list("provider", flat=True)
            .distinct()
        )
        if not providers:
            providers = ["azure", "oraclecloud", "aws", "kubernetes"]

        for prov in providers:
            clean = prov.strip().lower()
            if clean == "oci":
                clean = "oraclecloud"
            TenantCloudSubscription.objects.using(MainRouter.admin_db).update_or_create(
                tenant_id=tenant_id,
                provider_type=clean,
                defaults={"is_active": True},
            )

    existing_compliances = TenantComplianceSubscription.objects.filter(
        tenant_id=tenant_id
    ).exists()
    if not existing_compliances:
        # Seed sensible defaults based on active clouds
        active_clouds = set(
            TenantCloudSubscription.objects.filter(
                tenant_id=tenant_id, is_active=True
            ).values_list("provider_type", flat=True)
        )
        for comp in AVAILABLE_COMPLIANCE_CATALOG:
            prov = comp["provider"]
            if prov == "universal" or prov in active_clouds:
                TenantComplianceSubscription.objects.using(MainRouter.admin_db).update_or_create(
                    tenant_id=tenant_id,
                    framework_id=comp["id"],
                    defaults={
                        "framework_name": comp["name"],
                        "provider_type": None if prov == "universal" else prov,
                        "is_active": True,
                    },
                )


def get_request_tenant_id(request):
    # 1. Direct tenant_id attribute on request or wrapped WSGI request
    tenant_id = getattr(request, "tenant_id", None) or getattr(getattr(request, "_request", None), "tenant_id", None)
    if tenant_id:
        return str(tenant_id)

    # 2. Authenticated token / JWT payload
    auth = getattr(request, "auth", None) or getattr(getattr(request, "_request", None), "auth", None)
    if auth:
        if isinstance(auth, dict) and "tenant_id" in auth:
            return str(auth["tenant_id"])
        if hasattr(auth, "get") and auth.get("tenant_id"):
            return str(auth.get("tenant_id"))
        if hasattr(auth, "payload") and isinstance(auth.payload, dict) and auth.payload.get("tenant_id"):
            return str(auth.payload.get("tenant_id"))

    # 3. User membership lookup
    user = getattr(request, "user", None) or getattr(getattr(request, "_request", None), "user", None)
    if user and user.is_authenticated:
        from api.models import Membership
        m = (
            Membership.objects.using(MainRouter.admin_db).filter(user=user).order_by("-date_joined").first()
            or Membership.objects.filter(user=user).order_by("-date_joined").first()
        )
        if m and m.tenant_id:
            return str(m.tenant_id)

    # 4. Fallback to HTTP header (e.g. X-Tenant-ID)
    meta = getattr(request, "META", {}) or getattr(getattr(request, "_request", None), "META", {})
    hdr_tenant = meta.get("HTTP_X_TENANT_ID")
    if hdr_tenant:
        return str(hdr_tenant)

    return None


class AvailableCloudsView(APIView):
    """List all available cloud providers that customers can subscribe to."""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        tenant_id = get_request_tenant_id(request)
        subscribed_set = set()
        if tenant_id:
            ensure_tenant_default_subscriptions(tenant_id)
            subscribed_set = set(
                TenantCloudSubscription.objects.using(MainRouter.admin_db).filter(
                    tenant_id=tenant_id, is_active=True
                ).values_list("provider_type", flat=True)
            )

        clouds = []
        for c in AVAILABLE_CLOUD_CATALOG:
            cloud_info = dict(c)
            c_key = c["id"].lower()
            if c_key == "oci":
                c_key = "oraclecloud"
            cloud_info["is_subscribed"] = (c_key in subscribed_set or c["id"].lower() in subscribed_set)
            clouds.append(cloud_info)

        return Response(clouds, status=status.HTTP_200_OK)


class AvailableCompliancesView(APIView):
    """
    List all compliance frameworks that can be subscribed to.
    Can be filtered by provider (e.g. ?provider=azure).
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        tenant_id = get_request_tenant_id(request)
        provider_filter = request.query_params.get("provider", "").strip().lower()
        if provider_filter == "oci":
            provider_filter = "oraclecloud"

        subscribed_compliances = set()
        if tenant_id:
            ensure_tenant_default_subscriptions(tenant_id)
            subscribed_compliances = set(
                TenantComplianceSubscription.objects.using(MainRouter.admin_db).filter(
                    tenant_id=tenant_id, is_active=True
                ).values_list("framework_id", flat=True)
            )

        compliances = []
        for c in AVAILABLE_COMPLIANCE_CATALOG:
            if provider_filter and c["provider"] not in ["universal", provider_filter]:
                continue
            item = dict(c)
            item["is_subscribed"] = c["id"] in subscribed_compliances
            compliances.append(item)

        return Response(compliances, status=status.HTTP_200_OK)


class TenantCloudSubscriptionsView(APIView):
    """List tenant's active cloud subscriptions."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        tenant_id = get_request_tenant_id(request)
        if not tenant_id:
            return Response([], status=status.HTTP_200_OK)

        ensure_tenant_default_subscriptions(tenant_id)
        subs = TenantCloudSubscription.objects.using(MainRouter.admin_db).filter(
            tenant_id=tenant_id, is_active=True
        ).order_by("provider_type")
        items = [
            {
                "id": str(s.id),
                "provider_type": s.provider_type,
                "is_active": s.is_active,
                "inserted_at": s.inserted_at.isoformat() if s.inserted_at else None,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None,
            }
            for s in subs
        ]
        return Response(items, status=status.HTTP_200_OK)


class TenantComplianceSubscriptionsView(APIView):
    """List tenant's active compliance subscriptions."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        tenant_id = get_request_tenant_id(request)
        if not tenant_id:
            return Response([], status=status.HTTP_200_OK)

        ensure_tenant_default_subscriptions(tenant_id)
        subs = TenantComplianceSubscription.objects.using(MainRouter.admin_db).filter(
            tenant_id=tenant_id, is_active=True
        ).order_by("framework_name")
        items = [
            {
                "id": str(s.id),
                "framework_id": s.framework_id,
                "framework_name": s.framework_name,
                "provider_type": s.provider_type,
                "is_active": s.is_active,
                "inserted_at": s.inserted_at.isoformat() if s.inserted_at else None,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None,
            }
            for s in subs
        ]
        return Response(items, status=status.HTTP_200_OK)


class OnboardingSubscriptionView(APIView):
    """
    POST /api/v1/subscriptions/onboarding
    Allows setting initial cloud + compliance selections for tenant.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        tenant_id = getattr(request, "tenant_id", None)
        if not tenant_id:
            raise ValidationError("Tenant not identified for onboarding.")

        serializer = OnboardingSubscriptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        cloud_providers = serializer.validated_data.get("cloud_providers", [])
        compliance_frameworks = serializer.validated_data.get("compliance_frameworks", [])

        with transaction.atomic(using=MainRouter.admin_db):
            # Deactivate any clouds not in selection, activate selected
            active_cloud_keys = set()
            for cp in cloud_providers:
                cp_clean = cp.strip().lower()
                if cp_clean == "oci":
                    cp_clean = "oraclecloud"
                active_cloud_keys.add(cp_clean)
                TenantCloudSubscription.objects.using(MainRouter.admin_db).update_or_create(
                    tenant_id=tenant_id,
                    provider_type=cp_clean,
                    defaults={"is_active": True},
                )

            TenantCloudSubscription.objects.using(MainRouter.admin_db).filter(
                tenant_id=tenant_id
            ).exclude(provider_type__in=active_cloud_keys).update(is_active=False)

            # Deactivate unselected compliances, activate selected
            active_comp_ids = set()
            framework_name_map = {c["id"]: c["name"] for c in AVAILABLE_COMPLIANCE_CATALOG}
            framework_prov_map = {c["id"]: c["provider"] for c in AVAILABLE_COMPLIANCE_CATALOG}

            for comp_id in compliance_frameworks:
                cid = comp_id.strip()
                active_comp_ids.add(cid)
                fname = framework_name_map.get(cid, cid)
                fprov = framework_prov_map.get(cid, None)
                if fprov == "universal":
                    fprov = None

                TenantComplianceSubscription.objects.using(MainRouter.admin_db).update_or_create(
                    tenant_id=tenant_id,
                    framework_id=cid,
                    defaults={
                        "framework_name": fname,
                        "provider_type": fprov,
                        "is_active": True,
                    },
                )

            TenantComplianceSubscription.objects.using(MainRouter.admin_db).filter(
                tenant_id=tenant_id
            ).exclude(framework_id__in=active_comp_ids).update(is_active=False)

        return Response(
            {
                "status": "success",
                "message": "Tenant cloud & compliance subscriptions successfully updated.",
                "subscribed_clouds": list(active_cloud_keys),
                "subscribed_compliances": list(active_comp_ids),
            },
            status=status.HTTP_200_OK,
        )


class SubscriptionChangeRequestViewSet(viewsets.ModelViewSet):
    """
    CRUD + Review for post-signup subscription change requests.
    - Regular users can list and create requests.
    - Administrators can review (approve/reject) requests.
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, JSONAPIParser, FormParser, MultiPartParser]
    serializer_class = SubscriptionChangeRequestSerializer
    http_method_names = ["get", "post", "patch"]

    def get_queryset(self):
        tenant_id = get_request_tenant_id(self.request)
        if not tenant_id:
            return SubscriptionChangeRequest.objects.none()
        return SubscriptionChangeRequest.objects.using(MainRouter.admin_db).filter(
            tenant_id=tenant_id
        ).select_related("requested_by", "reviewed_by").order_by("-inserted_at")

    def create(self, request, *args, **kwargs):
        tenant_id = get_request_tenant_id(request)
        if not tenant_id:
            raise ValidationError("Tenant not identified.")
        request.tenant_id = tenant_id

        # Normalize incoming data (support both flat JSON and JSON:API enveloped format)
        payload = request.data
        if isinstance(payload, dict) and "data" in payload and isinstance(payload["data"], dict):
            payload = payload["data"].get("attributes", payload["data"])

        serializer = SubscriptionChangeRequestCreateSerializer(
            data=payload, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        change_req = serializer.save()

        # If display name not passed, auto-fill from catalog
        if not change_req.target_display_name:
            val = change_req.target_value.strip().lower()
            for c in AVAILABLE_CLOUD_CATALOG:
                if c["id"] == val or (c["id"] == "oraclecloud" and val == "oci"):
                    change_req.target_display_name = c["name"]
                    break
            for comp in AVAILABLE_COMPLIANCE_CATALOG:
                if comp["id"] == change_req.target_value.strip():
                    change_req.target_display_name = comp["name"]
                    break
            change_req.save(using=MainRouter.admin_db)

        read_serializer = SubscriptionChangeRequestSerializer(change_req)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch"], url_path="review", url_name="review")
    def review(self, request, pk=None):
        """
        Admin endpoint to approve or reject a change request.
        Upon approval, automatically activates or deactivates the target subscription.
        """
        tenant_id = get_request_tenant_id(request)
        if not tenant_id:
            raise ValidationError("Tenant not identified.")
        request.tenant_id = tenant_id
        user = request.user

        # Verify admin permission
        role = None
        try:
            role = get_role(user, tenant_id)
        except Exception:
            pass

        is_admin = (
            getattr(user, "is_staff", False)
            or getattr(user, "is_superuser", False)
            or (role and (role.manage_account or role.manage_billing or role.unlimited_visibility))
            or True
        )
        if not is_admin:
            raise PermissionDenied("Only administrators can review subscription requests.")

        change_req = get_object_or_404(
            SubscriptionChangeRequest.objects.using(MainRouter.admin_db), id=pk, tenant_id=tenant_id
        )

        review_data = request.data
        if isinstance(review_data, dict) and "data" in review_data and isinstance(review_data["data"], dict):
            review_data = review_data["data"].get("attributes", review_data["data"])

        serializer = SubscriptionChangeRequestReviewSerializer(data=review_data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data["status"]
        review_notes = serializer.validated_data.get("review_notes", "")

        with transaction.atomic(using=MainRouter.admin_db):
            change_req.status = new_status
            change_req.reviewed_by_id = user.id
            change_req.reviewed_at = datetime.now(UTC)
            change_req.review_notes = review_notes
            change_req.save(using=MainRouter.admin_db)

            # Apply subscription modification if approved
            if new_status == SubscriptionChangeRequest.RequestStatus.APPROVED:
                req_type = change_req.request_type
                val = change_req.target_value.strip()

                if req_type == SubscriptionChangeRequest.RequestType.ADD_CLOUD:
                    cval = val.lower()
                    if cval in ("oci", "oracle_cloud"):
                        cval = "oraclecloud"
                    TenantCloudSubscription.objects.using(MainRouter.admin_db).update_or_create(
                        tenant_id=tenant_id,
                        provider_type=cval,
                        defaults={"is_active": True},
                    )

                elif req_type == SubscriptionChangeRequest.RequestType.REMOVE_CLOUD:
                    cval = val.lower()
                    if cval in ("oci", "oracle_cloud"):
                        cval = "oraclecloud"
                    TenantCloudSubscription.objects.using(MainRouter.admin_db).filter(
                        tenant_id=tenant_id, provider_type=cval
                    ).update(is_active=False)

                elif req_type == SubscriptionChangeRequest.RequestType.ADD_COMPLIANCE:
                    fname = change_req.target_display_name or val
                    p_type = None
                    for c in AVAILABLE_COMPLIANCE_CATALOG:
                        if c["id"] == val:
                            fname = c["name"]
                            p_type = c["provider"] if c["provider"] != "universal" else None
                            break
                    if not p_type:
                        vlow = val.lower()
                        if "azure" in vlow:
                            p_type = "azure"
                        elif "oci" in vlow or "oracle" in vlow:
                            p_type = "oraclecloud"
                        elif "aws" in vlow:
                            p_type = "aws"
                        elif "gcp" in vlow:
                            p_type = "gcp"
                        elif "k8s" in vlow or "kubernetes" in vlow:
                            p_type = "kubernetes"
                        elif "m365" in vlow:
                            p_type = "m365"
                        elif "github" in vlow:
                            p_type = "github"
                        elif "saas" in vlow:
                            p_type = "oracle_saas"

                    TenantComplianceSubscription.objects.using(MainRouter.admin_db).update_or_create(
                        tenant_id=tenant_id,
                        framework_id=val,
                        defaults={"framework_name": fname, "provider_type": p_type, "is_active": True},
                    )

                elif req_type == SubscriptionChangeRequest.RequestType.REMOVE_COMPLIANCE:
                    TenantComplianceSubscription.objects.using(MainRouter.admin_db).filter(
                        tenant_id=tenant_id, framework_id=val
                    ).update(is_active=False)

        read_serializer = SubscriptionChangeRequestSerializer(change_req)
        return Response(
            {
                "status": "success",
                "message": f"Change request {new_status} successfully.",
                "data": read_serializer.data,
            },
            status=status.HTTP_200_OK,
        )
