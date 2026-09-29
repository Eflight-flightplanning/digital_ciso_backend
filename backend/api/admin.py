from django.contrib import admin
from api.models import (
    TenantLLMConfig,
    FindingAIAnalysis,
    RemediationPlaybook,
    CISOAdvisorConversation,
    TenantCloudSubscription,
    TenantComplianceSubscription,
    SubscriptionChangeRequest,

    Tenant,
    User,
    Membership,
    Provider,
    ProviderGroup,
    Scan,
    Task,
    Finding,
    Resource,
    ResourceTag,
    ComplianceOverview,
    ComplianceRequirementOverview,
    ScanSummary,
    MuteRule,
    Integration,
    Processor,
    ManagedServiceConfig,
    HITLReviewQueue,
    ReviewDecision,
    DecisionLog,
)


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ["id", "name", "inserted_at"]
    search_fields = ["name"]


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ["id", "email", "name", "is_active", "date_joined"]
    search_fields = ["email", "name"]
    list_filter = ["is_active"]


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "tenant", "role", "date_joined"]
    list_filter = ["role"]
    search_fields = ["user__email", "tenant__name"]


@admin.register(Provider)
class ProviderAdmin(admin.ModelAdmin):
    list_display = ["id", "alias", "provider", "uid", "connected", "tenant_id", "connection_last_checked_at"]
    list_filter = ["provider", "connected"]
    search_fields = ["alias", "uid"]


@admin.register(Scan)
class ScanAdmin(admin.ModelAdmin):
    list_display = ["id", "state", "trigger", "progress", "provider", "started_at", "completed_at"]
    list_filter = ["state", "trigger"]
    search_fields = ["id", "provider__alias"]


@admin.register(Finding)
class FindingAdmin(admin.ModelAdmin):
    list_display = ["id", "check_id", "status", "severity", "inserted_at"]
    list_filter = ["status", "severity"]
    search_fields = ["check_id", "uid"]


@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    list_display = ["id", "uid", "name", "service", "type", "region", "failed_findings_count"]
    list_filter = ["service", "region"]
    search_fields = ["uid", "name"]


@admin.register(ComplianceOverview)
class ComplianceOverviewAdmin(admin.ModelAdmin):
    list_display = ["id", "compliance_id", "framework", "version", "region", "inserted_at"]
    list_filter = ["framework", "region"]


@admin.register(ComplianceRequirementOverview)
class ComplianceRequirementOverviewAdmin(admin.ModelAdmin):
    list_display = ["id", "compliance_id", "requirement_id", "requirement_status", "passed_checks", "failed_checks"]
    list_filter = ["requirement_status"]


@admin.register(ScanSummary)
class ScanSummaryAdmin(admin.ModelAdmin):
    list_display = ["id", "scan_id", "tenant_id", "inserted_at"]


@admin.register(MuteRule)
class MuteRuleAdmin(admin.ModelAdmin):
    list_display = ["id", "name", "tenant_id", "enabled", "inserted_at"]
    list_filter = ["enabled"]
    search_fields = ["name"]


@admin.register(ManagedServiceConfig)
class ManagedServiceConfigAdmin(admin.ModelAdmin):
    list_display = ["id", "tenant", "operator_name", "operator_email", "sla_hours", "max_auto_approve_severity"]
    search_fields = ["operator_name", "operator_email", "tenant__name"]


@admin.register(HITLReviewQueue)
class HITLReviewQueueAdmin(admin.ModelAdmin):
    list_display = ["id", "finding", "status", "review_mode", "assigned_analyst", "due_at", "inserted_at"]
    list_filter = ["status", "review_mode"]
    search_fields = ["finding__check_id", "assigned_analyst__email"]


@admin.register(ReviewDecision)
class ReviewDecisionAdmin(admin.ModelAdmin):
    list_display = ["id", "review", "analyst", "decision", "previous_status", "new_status", "inserted_at"]
    list_filter = ["decision"]
    search_fields = ["analyst__email", "rationale"]


@admin.register(DecisionLog)
class DecisionLogAdmin(admin.ModelAdmin):
    list_display = ["id", "tenant_id", "review_id", "finding_check_id", "analyst_email", "decision", "inserted_at"]
    list_filter = ["decision", "provider_type", "severity"]
    search_fields = ["finding_check_id", "analyst_email"]



@admin.register(TenantLLMConfig)
class TenantLLMConfigAdmin(admin.ModelAdmin):
    list_display = ["id", "name", "tenant", "provider_type", "model_name", "base_url", "is_active", "inserted_at"]
    list_filter = ["provider_type", "is_active"]
    search_fields = ["name", "model_name", "base_url", "tenant__name"]


@admin.register(FindingAIAnalysis)
class FindingAIAnalysisAdmin(admin.ModelAdmin):
    list_display = ["id", "tenant", "check_id", "domain", "exposure", "confidence", "model_name", "inserted_at"]
    list_filter = ["domain", "exposure", "model_name"]
    search_fields = ["check_id", "summary", "root_cause"]


@admin.register(RemediationPlaybook)
class RemediationPlaybookAdmin(admin.ModelAdmin):
    list_display = ["id", "tenant", "title", "script_type", "is_automated", "requires_maintenance_window", "inserted_at"]
    list_filter = ["script_type", "is_automated", "requires_maintenance_window"]
    search_fields = ["title", "code_snippet"]


@admin.register(CISOAdvisorConversation)
class CISOAdvisorConversationAdmin(admin.ModelAdmin):
    list_display = ["id", "tenant", "user", "question", "confidence", "model_name", "inserted_at"]
    search_fields = ["question", "answer"]


@admin.register(TenantCloudSubscription)
class TenantCloudSubscriptionAdmin(admin.ModelAdmin):
    list_display = ["id", "tenant", "provider_type", "is_active", "inserted_at"]
    list_filter = ["provider_type", "is_active"]
    search_fields = ["tenant__name", "provider_type"]


@admin.register(TenantComplianceSubscription)
class TenantComplianceSubscriptionAdmin(admin.ModelAdmin):
    list_display = ["id", "tenant", "framework_id", "framework_name", "provider_type", "is_active", "inserted_at"]
    list_filter = ["provider_type", "is_active"]
    search_fields = ["tenant__name", "framework_id", "framework_name"]


@admin.register(SubscriptionChangeRequest)
class SubscriptionChangeRequestAdmin(admin.ModelAdmin):
    list_display = ["id", "tenant", "requested_by", "request_type", "target_value", "target_display_name", "status", "inserted_at"]
    list_filter = ["status", "request_type"]
    search_fields = ["target_value", "target_display_name", "requested_by__email", "tenant__name"]
    actions = ["approve_selected", "reject_selected"]

    @admin.action(description="Approve selected subscription requests")
    def approve_selected(self, request, queryset):
        from datetime import datetime, UTC
        for req in queryset.filter(status=SubscriptionChangeRequest.RequestStatus.PENDING):
            req.status = SubscriptionChangeRequest.RequestStatus.APPROVED
            req.reviewed_by = request.user
            req.reviewed_at = datetime.now(UTC)
            req.save()
            val = req.target_value.strip()
            if req.request_type == SubscriptionChangeRequest.RequestType.ADD_CLOUD:
                cval = val.lower()
                if cval == "oci":
                    cval = "oraclecloud"
                TenantCloudSubscription.objects.update_or_create(
                    tenant=req.tenant, provider_type=cval, defaults={"is_active": True}
                )
            elif req.request_type == SubscriptionChangeRequest.RequestType.REMOVE_CLOUD:
                cval = val.lower()
                if cval == "oci":
                    cval = "oraclecloud"
                TenantCloudSubscription.objects.filter(tenant=req.tenant, provider_type=cval).update(is_active=False)
            elif req.request_type == SubscriptionChangeRequest.RequestType.ADD_COMPLIANCE:
                TenantComplianceSubscription.objects.update_or_create(
                    tenant=req.tenant, framework_id=val, defaults={"framework_name": req.target_display_name or val, "is_active": True}
                )
            elif req.request_type == SubscriptionChangeRequest.RequestType.REMOVE_COMPLIANCE:
                TenantComplianceSubscription.objects.filter(tenant=req.tenant, framework_id=val).update(is_active=False)

    @admin.action(description="Reject selected subscription requests")
    def reject_selected(self, request, queryset):
        from datetime import datetime, UTC
        queryset.filter(status=SubscriptionChangeRequest.RequestStatus.PENDING).update(
            status=SubscriptionChangeRequest.RequestStatus.REJECTED,
            reviewed_by=request.user,
            reviewed_at=datetime.now(UTC),
        )
