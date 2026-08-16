from ai.mcp_views import MCPGatewayView
from ai.urls import ai_urlpatterns
from api.v1.views import (
    TenantLLMConfigViewSet,
    FindingAIAnalysisViewSet,
    RemediationPlaybookViewSet,
    CISOAdvisorConversationViewSet,

    ManagedServiceConfigViewSet,
    HITLReviewQueueViewSet,
    ReviewDecisionViewSet,
    DecisionLogViewSet,
    AttackPathsScanViewSet,
    ComplianceOverviewViewSet,
    CustomTokenObtainView,
    CustomTokenRefreshView,
    CustomTokenSwitchTenantView,
    FindingGroupViewSet,
    FindingViewSet,
    IntegrationJiraViewSet,
    IntegrationViewSet,
    InvitationAcceptViewSet,
    InvitationViewSet,
    LighthouseConfigViewSet,
    LighthouseProviderConfigViewSet,
    LighthouseProviderModelsViewSet,
    LighthouseTenantConfigViewSet,
    MembershipViewSet,
    MuteRuleViewSet,
    OverviewViewSet,
    ProcessorViewSet,
    ProviderGroupProvidersRelationshipView,
    ProviderGroupViewSet,
    ProviderSecretViewSet,
    ProviderViewSet,
    ResourceViewSet,
    RoleProviderGroupRelationshipView,
    RoleViewSet,
    ScanViewSet,
    ScheduleViewSet,
    SchemaView,
    TaskViewSet,
    TenantApiKeyViewSet,
    TenantMembersViewSet,
    TenantViewSet,
    UserRoleRelationshipView,
    UserViewSet,
)
from django.http import JsonResponse
from django.urls import include, path
from django.views.decorators.csrf import csrf_exempt
from drf_spectacular.views import SpectacularRedocView, SpectacularSwaggerView
from rest_framework_nested import routers


@csrf_exempt
def _blocked_endpoint(request, *args, **kwargs):
    return JsonResponse(
        {"errors": [{"detail": "This endpoint is not available."}]},
        status=405,
        content_type="application/vnd.api+json",
    )


router = routers.DefaultRouter(trailing_slash=False)

router.register(r"users", UserViewSet, basename="user")
router.register(r"tenants", TenantViewSet, basename="tenant")
router.register(r"providers", ProviderViewSet, basename="provider")
router.register(r"provider-groups", ProviderGroupViewSet, basename="providergroup")
router.register(r"scans", ScanViewSet, basename="scan")
router.register(
    r"attack-paths-scans", AttackPathsScanViewSet, basename="attack-paths-scans"
)
router.register(r"tasks", TaskViewSet, basename="task")
router.register(r"resources", ResourceViewSet, basename="resource")
router.register(r"findings", FindingViewSet, basename="finding")
router.register(r"finding-groups", FindingGroupViewSet, basename="finding-group")
router.register(r"roles", RoleViewSet, basename="role")
router.register(
    r"compliance-overviews", ComplianceOverviewViewSet, basename="complianceoverview"
)
router.register(r"overviews", OverviewViewSet, basename="overview")
router.register(r"schedules", ScheduleViewSet, basename="schedule")
router.register(r"integrations", IntegrationViewSet, basename="integration")
router.register(r"processors", ProcessorViewSet, basename="processor")
router.register(
    r"lighthouse-configurations",
    LighthouseConfigViewSet,
    basename="lighthouseconfiguration",
)
router.register(r"api-keys", TenantApiKeyViewSet, basename="api-key")
router.register(
    r"lighthouse/providers",
    LighthouseProviderConfigViewSet,
    basename="lighthouse-providers",
)
router.register(
    r"lighthouse/models",
    LighthouseProviderModelsViewSet,
    basename="lighthouse-models",
)
router.register(r"mute-rules", MuteRuleViewSet, basename="mute-rule")
router.register(r"managed-service-configs", ManagedServiceConfigViewSet, basename="managedserviceconfig")
router.register(r"hitl-reviews", HITLReviewQueueViewSet, basename="hitlreview")
router.register(r"review-decisions", ReviewDecisionViewSet, basename="reviewdecision")
router.register(r"decision-logs", DecisionLogViewSet, basename="decisionlog")
router.register(r"tenant-llm-configs", TenantLLMConfigViewSet, basename="tenantllmconfig")
router.register(r"finding-ai-analyses", FindingAIAnalysisViewSet, basename="findingaianalysis")
router.register(r"remediation-playbooks", RemediationPlaybookViewSet, basename="remediationplaybook")
router.register(r"ciso-conversations", CISOAdvisorConversationViewSet, basename="cisoadvisorconversation")


tenants_router = routers.NestedSimpleRouter(router, r"tenants", lookup="tenant")
tenants_router.register(
    r"memberships", TenantMembersViewSet, basename="tenant-membership"
)

users_router = routers.NestedSimpleRouter(router, r"users", lookup="user")
users_router.register(r"memberships", MembershipViewSet, basename="user-membership")

integrations_router = routers.NestedSimpleRouter(
    router, r"integrations", lookup="integration"
)
integrations_router.register(
    r"jira", IntegrationJiraViewSet, basename="integration-jira"
)

urlpatterns = [
    # JWT Token Authentication (Email + Password)
    path("tokens", CustomTokenObtainView.as_view(), name="token-obtain"),
    path("tokens/refresh", CustomTokenRefreshView.as_view(), name="token-refresh"),
    path("tokens/switch", CustomTokenSwitchTenantView.as_view(), name="token-switch"),
    path(
        "providers/secrets",
        ProviderSecretViewSet.as_view({"get": "list", "post": "create"}),
        name="providersecret-list",
    ),
    path(
        "providers/secrets/<uuid:pk>",
        ProviderSecretViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="providersecret-detail",
    ),
    path(
        "tenants/invitations",
        InvitationViewSet.as_view({"get": "list", "post": "create"}),
        name="invitation-list",
    ),
    path(
        "tenants/invitations/<uuid:pk>",
        InvitationViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="invitation-detail",
    ),
    path(
        "invitations/accept",
        InvitationAcceptViewSet.as_view({"post": "accept"}),
        name="invitation-accept",
    ),
    path(
        "roles/<uuid:pk>/relationships/provider_groups",
        RoleProviderGroupRelationshipView.as_view(
            {"post": "create", "patch": "partial_update", "delete": "destroy"}
        ),
        name="role-provider-groups-relationship",
    ),
    path(
        "users/<uuid:pk>/relationships/roles",
        UserRoleRelationshipView.as_view(
            {"post": "create", "patch": "partial_update", "delete": "destroy"}
        ),
        name="user-roles-relationship",
    ),
    path(
        "provider-groups/<uuid:pk>/relationships/providers",
        ProviderGroupProvidersRelationshipView.as_view(
            {"post": "create", "patch": "partial_update", "delete": "destroy"}
        ),
        name="provider_group-providers-relationship",
    ),
    path(
        "lighthouse/configuration",
        LighthouseTenantConfigViewSet.as_view(
            {"get": "list", "patch": "partial_update"}
        ),
        name="lighthouse-configurations",
    ),
    path("", include(router.urls)),
    path("", include(tenants_router.urls)),
    path("", include(users_router.urls)),
    path("", include(integrations_router.urls)),
    path("schema", SchemaView.as_view(), name="schema"),
    path("swagger", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger"),
    path("docs", SpectacularRedocView.as_view(url_name="schema"), name="docs"),
    # Digital CISO — AI endpoints
    path("mcp", MCPGatewayView.as_view(), name="mcp-gateway-v1"),
    path("ai/", include((ai_urlpatterns, "ai"), namespace="ai")),
]