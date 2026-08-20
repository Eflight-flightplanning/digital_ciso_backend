from decimal import Decimal
import json

import logging

import re

from datetime import UTC, datetime, timedelta

from uuid import UUID, uuid4



import defusedxml

try:
    from allauth.socialaccount.models import SocialApp
except Exception:
    class SocialApp:
        class objects:
            @staticmethod
            def filter(*args, **kwargs):
                class _QuerySet:
                    def exists(self): return False
                    def delete(self): pass
                    def exclude(self, *args, **kwargs): return self
                    def first(self): return None
                return _QuerySet()
            @staticmethod
            def create(*args, **kwargs):
                class _App:
                    sites = type('_Sites', (), {'set': lambda self, x: None})()
                return _App()

try:
    SOCIALACCOUNT_PROVIDERS = {'saml': {}}
except Exception:
    SOCIALACCOUNT_PROVIDERS = {"saml": {}}


from api.db_router import MainRouter

from api.db_utils import (

    CustomUserManager,

    FindingDeltaEnumField,

    IntegrationTypeEnumField,

    InvitationStateEnumField,

    MemberRoleEnumField,

    ProcessorTypeEnumField,

    ProviderEnumField,

    ProviderSecretTypeEnumField,

    ScanTriggerEnumField,

    SeverityEnumField,

    StateEnumField,

    StatusEnumField,

    enum_to_choices,

    generate_api_key_prefix,

    generate_random_token,

    one_week_from_now,

)

from api.exceptions import ModelValidationError

from api.rls import (

    BaseSecurityConstraint,

    RowLevelSecurityConstraint,

    RowLevelSecurityProtectedModel,

    Tenant,

)

from config.custom_logging import BackendLogger

SOCIALACCOUNT_PROVIDERS = {'saml': {}}

from cryptography.fernet import Fernet, InvalidToken

from defusedxml import ElementTree as ET

from django.conf import settings

from django.contrib.auth.models import AbstractBaseUser

from django.contrib.postgres.fields import ArrayField

from django.contrib.postgres.indexes import GinIndex, OpClass

from django.contrib.postgres.search import SearchVector, SearchVectorField

class Site:
    objects = type('obj', (), {'get_current': lambda: None})()

from django.core.exceptions import ValidationError

from django.core.validators import MinLengthValidator

from django.db import models

from django.db.models import Q

from django.db.models.functions import Upper

from django.utils import timezone as django_timezone

from django.utils.translation import gettext_lazy as _

from django_celery_beat.models import PeriodicTask

from django_celery_results.models import TaskResult

from drf_simple_apikey.crypto import get_crypto

from drf_simple_apikey.models import AbstractAPIKey, AbstractAPIKeyManager

from prowler.lib.check.models import Severity

from psqlextra.manager import PostgresManager

from psqlextra.models import PostgresPartitionedModel

from psqlextra.types import PostgresPartitioningMethod

from uuid6 import uuid7



fernet = Fernet(settings.SECRETS_ENCRYPTION_KEY.encode())



# Convert Prowler Severity enum to Django TextChoices

SeverityChoices = enum_to_choices(Severity)



logger = logging.getLogger(BackendLogger.API)





class StatusChoices(models.TextChoices):

    """

    This list is based on the finding status in the Prowler CLI.



    However, it adds another state, MUTED, which is not in the CLI.

    """



    FAIL = "FAIL", _("Fail")

    PASS = "PASS", _("Pass")

    MANUAL = "MANUAL", _("Manual")





class OverviewStatusChoices(models.TextChoices):

    """

    Status filters allowed in overview/severity endpoints.

    """



    FAIL = "FAIL", _("Fail")

    PASS = "PASS", _("Pass")





class StateChoices(models.TextChoices):

    AVAILABLE = "available", _("Available")

    SCHEDULED = "scheduled", _("Scheduled")

    EXECUTING = "executing", _("Executing")

    COMPLETED = "completed", _("Completed")

    FAILED = "failed", _("Failed")

    CANCELLED = "cancelled", _("Cancelled")





class PermissionChoices(models.TextChoices):

    """

    Represents the different permission states that a role can have.



    Attributes:

        UNLIMITED: Indicates that the role possesses all permissions.

        LIMITED: Indicates that the role has some permissions but not all.

        NONE: Indicates that the role does not have any permissions.

    """



    UNLIMITED = "unlimited", _("Unlimited permissions")

    LIMITED = "limited", _("Limited permissions")

    NONE = "none", _("No permissions")





class ActiveProviderManager(models.Manager):

    def get_queryset(self):

        return super().get_queryset().filter(self.active_provider_filter())



    def active_provider_filter(self):

        if self.model is Provider:

            return Q(is_deleted=False)

        elif self.model in [Finding, ComplianceOverview, ScanSummary]:

            return Q(scan__provider__is_deleted=False)

        else:

            return Q(provider__is_deleted=False)





class ActiveProviderPartitionedManager(PostgresManager, ActiveProviderManager):

    def get_queryset(self):

        return super().get_queryset().filter(self.active_provider_filter())





class TenantAPIKeyManager(AbstractAPIKeyManager):

    separator = "."



    def assign_api_key(self, obj) -> str:

        payload = {"_pk": str(obj.pk), "_exp": obj.expiry_date.timestamp()}

        key = get_crypto().generate(payload)



        prefixed_key = f"{obj.prefix}{self.separator}{key}"

        return prefixed_key





class User(AbstractBaseUser):

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    name = models.CharField(max_length=150, validators=[MinLengthValidator(3)])

    email = models.EmailField(

        max_length=254,

        unique=True,

        help_text="Case insensitive",

        error_messages={"unique": "Please check the email address and try again."},

    )

    company_name = models.CharField(max_length=150, blank=True)

    is_active = models.BooleanField(default=True)

    date_joined = models.DateTimeField(auto_now_add=True, editable=False)



    USERNAME_FIELD = "email"

    REQUIRED_FIELDS = ["name"]



    objects = CustomUserManager()



    def is_member_of_tenant(self, tenant_id):

        return self.memberships.filter(tenant_id=tenant_id).exists()



    def save(self, *args, **kwargs):

        if self.email:

            self.email = self.email.strip().lower()

        super().save(*args, **kwargs)



    class Meta:

        db_table = "users"



        constraints = [

            BaseSecurityConstraint(

                name="statements_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            )

        ]



    class JSONAPIMeta:

        resource_name = "users"





class Membership(models.Model):

    class RoleChoices(models.TextChoices):

        OWNER = "owner", _("Owner")

        MEMBER = "member", _("Member")



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    user = models.ForeignKey(

        User,

        on_delete=models.CASCADE,

        related_name="memberships",

        related_query_name="membership",

    )

    tenant = models.ForeignKey(

        Tenant,

        on_delete=models.CASCADE,

        related_name="memberships",

        related_query_name="membership",

    )

    role = MemberRoleEnumField(choices=RoleChoices.choices, default=RoleChoices.MEMBER)

    date_joined = models.DateTimeField(auto_now_add=True, editable=False)



    class Meta:

        db_table = "memberships"



        constraints = [

            models.UniqueConstraint(

                fields=("user", "tenant"),

                name="unique_resources_by_membership",

            ),

            BaseSecurityConstraint(

                name="statements_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



    class JSONAPIMeta:

        resource_name = "memberships"





class TenantAPIKey(AbstractAPIKey, RowLevelSecurityProtectedModel):

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    name = models.CharField(max_length=100, validators=[MinLengthValidator(3)])

    created = models.DateTimeField(auto_now_add=True, editable=False)

    prefix = models.CharField(

        max_length=11,

        unique=True,

        default=generate_api_key_prefix,

        editable=False,

        help_text="Unique prefix to identify the API key",

    )

    last_used_at = models.DateTimeField(

        null=True,

        blank=True,

        help_text="Last time this API key was used for authentication",

    )

    entity = models.ForeignKey(

        settings.AUTH_USER_MODEL,

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name="user_api_keys",

    )



    objects = TenantAPIKeyManager()



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "api_keys"



        constraints = [

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

            models.UniqueConstraint(

                fields=("tenant_id", "prefix"),

                name="unique_api_key_prefixes",

            ),

            models.UniqueConstraint(

                fields=("tenant_id", "name"),

                name="unique_api_key_name_per_tenant",

            ),

        ]



        indexes = [

            models.Index(

                fields=["tenant_id", "prefix"], name="api_keys_tenant_prefix_idx"

            ),

        ]



    class JSONAPIMeta:

        resource_name = "api-keys"





class Provider(RowLevelSecurityProtectedModel):

    objects = ActiveProviderManager()

    all_objects = models.Manager()



    class ProviderChoices(models.TextChoices):

        AWS = "aws", _("AWS")

        AZURE = "azure", _("Azure")

        GCP = "gcp", _("GCP")

        KUBERNETES = "kubernetes", _("Kubernetes")

        M365 = "m365", _("M365")

        GITHUB = "github", _("GitHub")

        MONGODBATLAS = "mongodbatlas", _("MongoDB Atlas")

        IAC = "iac", _("IaC")

        ORACLECLOUD = "oraclecloud", _("Oracle Cloud Infrastructure")

        ALIBABACLOUD = "alibabacloud", _("Alibaba Cloud")

        CLOUDFLARE = "cloudflare", _("Cloudflare")

        OPENSTACK = "openstack", _("OpenStack")

        IMAGE = "image", _("Image")

        GOOGLEWORKSPACE = "googleworkspace", _("Google Workspace")

        VERCEL = "vercel", _("Vercel")

        OKTA = "okta", _("Okta")

        ORACLE_SAAS = "oracle_saas", _("Oracle SaaS / ERP")


    @staticmethod

    def validate_aws_uid(value):

        if not re.match(r"^\d{12}$", value):

            raise ModelValidationError(

                detail="AWS provider ID must be exactly 12 digits.",

                code="aws-uid",

                pointer="/data/attributes/uid",

            )



    @staticmethod
    def validate_azure_uid(value):
        try:
            val = UUID(str(value).strip())
        except (ValueError, AttributeError, TypeError):
            raise ModelValidationError(
                detail="Azure provider ID must be a valid UUID.",
                code="azure-uid",
                pointer="/data/attributes/uid",
            )



    @staticmethod

    def validate_m365_uid(value):

        if not re.match(

            r"""^(?!-)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.(?!-)[A-Za-z0-9]"""

            r"""(?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$""",

            value,

        ):

            raise ModelValidationError(

                detail="M365 domain ID must be a valid domain.",

                code="m365-uid",

                pointer="/data/attributes/uid",

            )



    @staticmethod

    def validate_gcp_uid(value):

        # Standard format: 6-30 chars, starts with letter, lowercase + digits + hyphens

        # Legacy App Engine format: domain.com:project-id

        if not re.match(r"^([a-z][a-z0-9.-]*:)?[a-z][a-z0-9-]{5,29}$", value):

            raise ModelValidationError(

                detail="GCP provider ID must be a valid project ID: 6 to 30 characters, start with a letter, "

                "and contain only lowercase letters, numbers, and hyphens. "

                "Legacy App Engine project IDs with a domain prefix (e.g., example.com:my-project) are also accepted.",

                code="gcp-uid",

                pointer="/data/attributes/uid",

            )



    @staticmethod

    def validate_googleworkspace_uid(value):

        if not re.match(r"^C[0-9a-zA-Z]+$", value):

            raise ModelValidationError(

                detail="Google Workspace Customer ID must start with 'C' followed by one or more alphanumeric characters (e.g., C01234abc, C12345678).",

                code="googleworkspace-uid",

                pointer="/data/attributes/uid",

            )



    @staticmethod

    def validate_okta_uid(value):

        if not re.match(

            r"^[a-z0-9][a-z0-9-]*\.("

            r"okta\.com|oktapreview\.com|okta-emea\.com|"

            r"okta-gov\.com|okta\.mil|okta-miltest\.com|trex-govcloud\.com"

            r")$",

            value,

        ):

            raise ModelValidationError(

                detail=(

                    "Okta provider ID must be a valid Okta-managed org domain "

                    "(e.g., acme.okta.com, also .oktapreview.com / .okta-emea.com "

                    "/ .okta-gov.com / .okta.mil / .okta-miltest.com / "

                    ".trex-govcloud.com), without scheme or path."

                ),

                code="okta-uid",

                pointer="/data/attributes/uid",

            )



    @staticmethod

    def validate_kubernetes_uid(value):

        if not re.match(

            r"^[a-zA-Z0-9][a-zA-Z0-9._@:\/-]{1,250}$",

            value,

        ):

            raise ModelValidationError(

                detail="The value must either be a valid Kubernetes UID (up to 63 characters, "

                "starting and ending with a lowercase letter or number, containing only "

                "lowercase alphanumeric characters and hyphens) or a valid AWS EKS Cluster ARN, GCP GKE Context Name or Azure AKS Cluster Name.",

                code="kubernetes-uid",

                pointer="/data/attributes/uid",

            )



    @staticmethod

    def validate_github_uid(value):

        if not re.match(r"^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$", value):

            raise ModelValidationError(

                detail="GitHub provider ID must be a valid GitHub username or organization name (1-39 characters, "

                "starting with alphanumeric, containing only alphanumeric characters and hyphens).",

                code="github-uid",

                pointer="/data/attributes/uid",

            )



    @staticmethod

    def validate_iac_uid(value):

        # Validate that it's a valid repository URL (git URL format)

        if not re.match(

            r"^(https?://|git@|ssh://)[^\s/]+[^\s]*\.git$|^(https?://)[^\s/]+[^\s]*$",

            value,

        ):

            raise ModelValidationError(

                detail="IaC provider ID must be a valid repository URL (e.g., https://github.com/user/repo or https://github.com/user/repo.git).",

                code="iac-uid",

                pointer="/data/attributes/uid",

            )



    @staticmethod

    def validate_oraclecloud_uid(value):

        if not re.match(

            r"^ocid1\.([a-z0-9_-]+)\.([a-z0-9_-]+)\.([a-z0-9_-]*)\.([a-z0-9]+)$", value

        ):

            raise ModelValidationError(

                detail="Oracle Cloud Infrastructure provider ID must be a valid tenancy OCID in the format: "

                "ocid1.<resource_type>.<realm>.<region>.<unique_id>",

                code="oraclecloud-uid",

                pointer="/data/attributes/uid",

            )



    @staticmethod

    def validate_mongodbatlas_uid(value):

        if not re.match(r"^[0-9a-fA-F]{24}$", value):

            raise ModelValidationError(

                detail="MongoDB Atlas organization ID must be a 24-character hexadecimal string.",

                code="mongodbatlas-uid",

                pointer="/data/attributes/uid",

            )



    @staticmethod

    def validate_alibabacloud_uid(value):

        if not re.match(r"^\d{16}$", value):

            raise ModelValidationError(

                detail="Alibaba Cloud account ID must be exactly 16 digits.",

                code="alibabacloud-uid",

                pointer="/data/attributes/uid",

            )



    @staticmethod

    def validate_cloudflare_uid(value):

        if not re.match(r"^[a-f0-9]{32}$", value):

            raise ModelValidationError(

                detail="Cloudflare Account ID must be a 32-character hexadecimal string.",

                code="cloudflare-uid",

                pointer="/data/attributes/uid",

            )



    @staticmethod

    def validate_openstack_uid(value):

        if not re.match(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}$", value):

            raise ModelValidationError(

                detail="OpenStack provider ID must be a valid project ID (UUID or project name).",

                code="openstack-uid",

                pointer="/data/attributes/uid",

            )



    @staticmethod

    def validate_vercel_uid(value):

        if not re.match(r"^team_[a-zA-Z0-9]{16,32}$", value):

            raise ModelValidationError(

                detail="Vercel provider ID must be a valid Vercel Team ID (e.g., team_xxxxxxxxxxxxxxxxxxxxxxxx).",

                code="vercel-uid",

                pointer="/data/attributes/uid",

            )



    @staticmethod
    def validate_oracle_saas_uid(value):
        """Oracle SaaS tenant UID is either Identity Domain or Fusion ERP pod hostname (e.g. fa-xxxx.oraclecloud.com or idcs-xxxx.identity.oraclecloud.com)."""
        val = value.strip().lower()
        # Remove https:// or http:// prefix if provided
        if val.startswith("https://"):
            val = val[8:]
        elif val.startswith("http://"):
            val = val[7:]
        val = val.rstrip("/")

        if not (
            val.endswith(".oraclecloud.com")
            or val.endswith(".oraclepdemos.com")
            or val.endswith(".oracle.com")
            or "fa-" in val
            or "idcs-" in val
            or len(val) >= 3
        ):
            raise ModelValidationError(
                detail=(
                    "Oracle SaaS provider ID must be a valid Fusion ERP Base URL or Identity Domain hostname. "
                    "Example: fa-xxxx.oraclecloud.com or idcs-xxxx.identity.oraclecloud.com"
                ),
                code="oracle-saas-uid",
                pointer="/data/attributes/uid",
            )



    @staticmethod

    def validate_image_uid(value):

        if not re.match(r"^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{2,249}$", value):

            raise ModelValidationError(

                detail="Image provider ID must be a valid container image reference.",

                code="image-uid",

                pointer="/data/attributes/uid",

            )



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    updated_at = models.DateTimeField(auto_now=True, editable=False)

    is_deleted = models.BooleanField(default=False)

    provider = ProviderEnumField(

        choices=ProviderChoices.choices, default=ProviderChoices.AWS

    )

    uid = models.CharField(

        "Unique identifier for the provider, set by the provider",

        max_length=250,

        blank=False,

        validators=[MinLengthValidator(3)],

    )

    alias = models.CharField(

        blank=True, null=True, max_length=100, validators=[MinLengthValidator(3)]

    )

    connected = models.BooleanField(null=True, blank=True)

    connection_last_checked_at = models.DateTimeField(null=True, blank=True)

    metadata = models.JSONField(default=dict, blank=True)

    scanner_args = models.JSONField(default=dict, blank=True)



    def clean(self):

        super().clean()

        if self.provider == self.ProviderChoices.OKTA and self.uid:

            # Mirror the SDK, which lowercases the org domain before connecting.

            # Without this the API would reject Acme.okta.com even though the

            # SDK would accept it, and stored uids could disagree with the

            # authenticated org domain.

            self.uid = self.uid.strip().lower()

        getattr(self, f"validate_{self.provider}_uid")(self.uid)



    def save(self, *args, **kwargs):

        self.full_clean()

        super().save(*args, **kwargs)



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "providers"



        constraints = [

            models.UniqueConstraint(

                fields=("tenant_id", "provider", "uid"),

                condition=Q(is_deleted=False),

                name="unique_provider_uids",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



    class JSONAPIMeta:

        resource_name = "providers"





class ProviderGroup(RowLevelSecurityProtectedModel):

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    name = models.CharField(max_length=255)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    updated_at = models.DateTimeField(auto_now=True, editable=False)

    providers = models.ManyToManyField(

        Provider, through="ProviderGroupMembership", related_name="provider_groups"

    )



    class Meta:

        db_table = "provider_groups"

        constraints = [

            models.UniqueConstraint(

                fields=["tenant_id", "name"],

                name="unique_group_name_per_tenant",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



    class JSONAPIMeta:

        resource_name = "provider-groups"





class ProviderGroupMembership(RowLevelSecurityProtectedModel):

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    provider_group = models.ForeignKey(ProviderGroup, on_delete=models.CASCADE)

    provider = models.ForeignKey(Provider, on_delete=models.CASCADE)

    inserted_at = models.DateTimeField(auto_now_add=True)



    class Meta:

        db_table = "provider_group_memberships"

        constraints = [

            models.UniqueConstraint(

                fields=["provider_id", "provider_group"],

                name="unique_provider_group_membership",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



    class JSONAPIMeta:

        resource_name = "provider_groups-provider"





class Task(RowLevelSecurityProtectedModel):

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    task_runner_task = models.OneToOneField(

        TaskResult,

        on_delete=models.CASCADE,

        related_name="task",

        related_query_name="task",

        null=True,

        blank=True,

    )



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "tasks"



        constraints = [

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



        indexes = [

            models.Index(

                fields=["id", "task_runner_task"],

                name="tasks_id_trt_id_idx",

            ),

        ]



    class JSONAPIMeta:

        resource_name = "tasks"





class Scan(RowLevelSecurityProtectedModel):

    objects = ActiveProviderManager()

    all_objects = models.Manager()



    _SCOPING_SCANNER_ARG_KEYS_CACHE: tuple[str, ...] | None = None



    @classmethod

    def get_scoping_scanner_arg_keys(cls) -> tuple[str, ...]:

        """Return the scanner_args keys that mark a scan as scoped.



        Derived from ``prowler.lib.scan.scan.Scan.__init__`` so the API stays

        in sync with whatever the SDK actually accepts as filters. Cached at

        class level — the signature is stable for the process lifetime.

        """

        if cls._SCOPING_SCANNER_ARG_KEYS_CACHE is None:

            import inspect



            from prowler.lib.scan.scan import Scan as ProwlerScan



            params = inspect.signature(ProwlerScan.__init__).parameters

            cls._SCOPING_SCANNER_ARG_KEYS_CACHE = tuple(

                name for name in params if name not in ("self", "provider")

            )

        return cls._SCOPING_SCANNER_ARG_KEYS_CACHE



    class TriggerChoices(models.TextChoices):

        SCHEDULED = "scheduled", _("Scheduled")

        MANUAL = "manual", _("Manual")



    # Trigger values for scans that ran the SDK end-to-end. Imported scans (or

    # any future trigger) are intentionally NOT in this set — they may carry

    # only a partial slice of resources, so post-scan logic that depends on a

    # full-scope sweep (e.g. resetting ephemeral resource findings) must skip

    # them by default.

    LIVE_SCAN_TRIGGERS = frozenset(

        (TriggerChoices.SCHEDULED.value, TriggerChoices.MANUAL.value)

    )



    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)

    name = models.CharField(

        blank=True, null=True, max_length=100, validators=[MinLengthValidator(3)]

    )

    trigger = ScanTriggerEnumField(

        choices=TriggerChoices.choices,

    )

    state = StateEnumField(choices=StateChoices.choices, default=StateChoices.AVAILABLE)

    unique_resource_count = models.IntegerField(default=0)

    progress = models.IntegerField(default=0)

    scanner_args = models.JSONField(default=dict)

    duration = models.IntegerField(null=True, blank=True)

    scheduled_at = models.DateTimeField(null=True, blank=True)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    updated_at = models.DateTimeField(auto_now=True, editable=False)

    started_at = models.DateTimeField(null=True, blank=True)

    completed_at = models.DateTimeField(null=True, blank=True)

    next_scan_at = models.DateTimeField(null=True, blank=True)

    scheduler_task = models.ForeignKey(

        PeriodicTask, on_delete=models.SET_NULL, null=True, blank=True

    )

    output_location = models.CharField(blank=True, null=True, max_length=4096)

    provider = models.ForeignKey(

        Provider,

        on_delete=models.CASCADE,

        related_name="scans",

        related_query_name="scan",

    )

    task = models.ForeignKey(

        Task,

        on_delete=models.CASCADE,

        related_name="scans",

        related_query_name="scan",

        null=True,

        blank=True,

    )

    processor = models.ForeignKey(

        "Processor",

        on_delete=models.SET_NULL,

        related_name="scans",

        related_query_name="scan",

        null=True,

        blank=True,

    )



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "scans"



        constraints = [

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



        indexes = [

            models.Index(

                fields=["provider", "state", "trigger", "scheduled_at"],

                name="scans_prov_state_trig_sche_idx",

            ),

            models.Index(

                fields=["tenant_id", "provider_id", "state", "inserted_at"],

                name="scans_prov_state_insert_idx",

            ),

            models.Index(

                fields=["tenant_id", "provider_id", "state", "-inserted_at"],

                condition=Q(state=StateChoices.COMPLETED),

                name="scans_prov_state_ins_desc_idx",

            ),

            # TODO This might replace `scans_prov_state_ins_desc_idx` completely. Review usage

            models.Index(

                fields=["tenant_id", "provider_id", "-inserted_at"],

                condition=Q(state=StateChoices.COMPLETED),

                include=["id"],

                name="scans_prov_ins_desc_idx",

            ),

        ]



    class JSONAPIMeta:

        resource_name = "scans"



    def is_full_scope(self) -> bool:

        """Return True if this scan ran with no scoping filters at all.



        Used to gate post-scan operations (such as resetting the

        failed_findings_count of resources missing from the scan) that are only

        safe when the scan covered every check, service, and category. Imported

        scans are NOT full-scope by definition — they may carry only a partial

        slice of resources, so they're rejected via ``trigger`` even before the

        scanner_args check.

        """

        if self.trigger not in self.LIVE_SCAN_TRIGGERS:

            return False

        scanner_args = self.scanner_args or {}

        for key in self.get_scoping_scanner_arg_keys():

            if scanner_args.get(key):

                return False

        return True





class AttackPathsScan(RowLevelSecurityProtectedModel):

    class SinkBackendChoices(models.TextChoices):

        NEO4J = "neo4j", "Neo4j"

        NEPTUNE = "neptune", "Neptune"



    objects = ActiveProviderManager()

    all_objects = models.Manager()



    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    updated_at = models.DateTimeField(auto_now=True, editable=False)



    state = StateEnumField(choices=StateChoices.choices, default=StateChoices.AVAILABLE)

    progress = models.IntegerField(default=0)

    graph_data_ready = models.BooleanField(default=False)



    # Timing

    started_at = models.DateTimeField(null=True, blank=True)

    completed_at = models.DateTimeField(null=True, blank=True)

    duration = models.IntegerField(

        null=True, blank=True, help_text="Duration in seconds"

    )



    # Relationship to the provider and optional prowler Scan and celery Task

    provider = models.ForeignKey(

        "Provider",

        on_delete=models.CASCADE,

        related_name="attack_paths_scans",

        related_query_name="attack_paths_scan",

    )

    scan = models.ForeignKey(

        "Scan",

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name="attack_paths_scans",

        related_query_name="attack_paths_scan",

    )

    task = models.ForeignKey(

        "Task",

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name="attack_paths_scans",

        related_query_name="attack_paths_scan",

    )



    # Cartography specific metadata

    update_tag = models.BigIntegerField(

        null=True, blank=True, help_text="Cartography update tag (epoch)"

    )

    ingestion_exceptions = models.JSONField(default=dict, null=True, blank=True)



    # True when the scan was synced with the current schema (list-typed

    # properties materialised as child item nodes). False for pre-cutover scans

    # still using the previous graph shape. Query catalog selection uses this

    # flag; physical read routing uses sink_backend below.

    # TODO: drop after Neptune cutover

    is_migrated = models.BooleanField(default=False, db_default=False)

    sink_backend = models.CharField(

        choices=SinkBackendChoices.choices,

        db_default=SinkBackendChoices.NEO4J,

        default=SinkBackendChoices.NEO4J,

        max_length=16,

    )



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "attack_paths_scans"



        constraints = [

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



        indexes = [

            models.Index(

                fields=["tenant_id", "provider_id", "-inserted_at"],

                name="aps_prov_ins_desc_idx",

            ),

            models.Index(

                fields=["tenant_id", "state", "-inserted_at"],

                name="aps_state_ins_desc_idx",

            ),

            models.Index(

                fields=["tenant_id", "scan_id"],

                name="aps_scan_lookup_idx",

            ),

        ]



    class JSONAPIMeta:

        resource_name = "attack-paths-scans"





class ResourceTag(RowLevelSecurityProtectedModel):

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    updated_at = models.DateTimeField(auto_now=True, editable=False)



    key = models.TextField(blank=False)

    value = models.TextField(blank=False)



    text_search = models.GeneratedField(

        expression=SearchVector("key", weight="A", config="simple")

        + SearchVector("value", weight="B", config="simple"),

        output_field=SearchVectorField(),

        db_persist=True,

        null=True,

        editable=False,

    )



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "resource_tags"



        constraints = [

            models.UniqueConstraint(

                fields=("tenant_id", "key", "value"),

                name="unique_resource_tags_by_tenant_key_value",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]





class Resource(RowLevelSecurityProtectedModel):

    objects = ActiveProviderManager()

    all_objects = models.Manager()



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    updated_at = models.DateTimeField(auto_now=True, editable=False)



    provider = models.ForeignKey(

        Provider,

        on_delete=models.CASCADE,

        related_name="resources",

        related_query_name="resource",

    )



    uid = models.TextField(

        "Unique identifier for the resource, set by the provider", blank=False

    )

    name = models.TextField("Name of the resource, as set in the provider", blank=False)

    region = models.TextField(

        "Location of the resource, as set by the provider", blank=False

    )

    service = models.TextField(

        "Service of the resource, as set by the provider", blank=False

    )

    type = models.TextField("Type of the resource, as set by the provider", blank=False)



    text_search = models.GeneratedField(

        expression=SearchVector("uid", weight="A", config="simple")

        + SearchVector("name", weight="B", config="simple")

        + SearchVector("region", weight="C", config="simple")

        + SearchVector("service", "type", weight="D", config="simple"),

        output_field=SearchVectorField(),

        db_persist=True,

        null=True,

        editable=False,

    )



    metadata = models.TextField(blank=True, null=True)

    details = models.TextField(blank=True, null=True)

    partition = models.TextField(blank=True, null=True)

    groups = ArrayField(

        models.CharField(max_length=100),

        blank=True,

        null=True,

        help_text="Groups for categorization (e.g., compute, storage, IAM)",

    )



    failed_findings_count = models.IntegerField(default=0)



    # Relationships

    tags = models.ManyToManyField(

        ResourceTag,

        verbose_name="Tags associated with the resource, by provider",

        through="ResourceTagMapping",

    )



    def get_tags(self, tenant_id: str) -> dict:

        return {tag.key: tag.value for tag in self.tags.filter(tenant_id=tenant_id)}



    def clear_tags(self):

        self.tags.clear()

        self.save()



    def upsert_or_delete_tags(self, tags: list[ResourceTag] | None):

        if tags is None:

            self.clear_tags()

            return



        # Add new relationships with the tenant_id field; avoid touching the

        # Resource row unless a mapping is actually created to prevent noisy

        # updates during scans.

        mapping_created = False

        for tag in tags:

            _, created = ResourceTagMapping.objects.update_or_create(

                tag=tag, resource=self, tenant_id=self.tenant_id

            )

            mapping_created = mapping_created or created



        if mapping_created:

            # Only bump updated_at when the tag set truly changed

            self.save(update_fields=["updated_at"])



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "resources"



        indexes = [

            models.Index(

                fields=["uid", "region", "service", "name"],

                name="resource_uid_reg_serv_name_idx",

            ),

            models.Index(

                fields=["tenant_id", "service", "region", "type"],

                name="resource_tenant_metadata_idx",

            ),

            # icontains compiles to UPPER(field) LIKE, so index the same expression

            GinIndex(

                OpClass(Upper("uid"), name="gin_trgm_ops"),

                name="res_uid_trgm_idx",

            ),

            GinIndex(

                OpClass(Upper("name"), name="gin_trgm_ops"),

                name="res_name_trgm_idx",

            ),

            models.Index(fields=["tenant_id", "id"], name="resources_tenant_id_idx"),

            models.Index(

                fields=["tenant_id", "provider_id"],

                name="resources_tenant_provider_idx",

            ),

            models.Index(

                fields=["tenant_id", "-failed_findings_count", "id"],

                name="resources_failed_findings_idx",

            ),

        ]



        constraints = [

            models.UniqueConstraint(

                fields=("tenant_id", "provider_id", "uid"),

                name="unique_resources_by_provider",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



    class JSONAPIMeta:

        resource_name = "resources"





class ResourceTagMapping(RowLevelSecurityProtectedModel):

    # NOTE that we don't really need a primary key here,

    #      but everything is easier with django if we do

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    resource = models.ForeignKey(Resource, on_delete=models.CASCADE)

    tag = models.ForeignKey(ResourceTag, on_delete=models.CASCADE)



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "resource_tag_mappings"



        # django will automatically create indexes for:

        #   - resource_id

        #   - tag_id

        #   - tenant_id

        #   - id



        constraints = [

            models.UniqueConstraint(

                fields=("tenant_id", "resource_id", "tag_id"),

                name="unique_resource_tag_mappings_by_tenant",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



        indexes = [

            models.Index(

                fields=["tenant_id", "resource_id"], name="resource_tag_tenant_idx"

            ),

        ]





class Finding(PostgresPartitionedModel, RowLevelSecurityProtectedModel):

    """

    Defines the Finding model.



    Findings uses a partitioned table to store findings. The partitions are created based on the UUIDv7 `id` field.



    Note when creating migrations, you must use `python manage.py pgmakemigrations` to create the migrations.

    """



    objects = ActiveProviderPartitionedManager()

    all_objects = models.Manager()



    class PartitioningMeta:

        method = PostgresPartitioningMethod.RANGE

        key = ["id"]



    class DeltaChoices(models.TextChoices):

        NEW = "new", _("New")

        CHANGED = "changed", _("Changed")



    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    updated_at = models.DateTimeField(auto_now=True, editable=False)

    first_seen_at = models.DateTimeField(editable=False, null=True)



    uid = models.CharField(max_length=300)

    delta = FindingDeltaEnumField(

        choices=DeltaChoices.choices,

        blank=True,

        null=True,

    )



    status = StatusEnumField(choices=StatusChoices)

    status_extended = models.TextField(blank=True, null=True)



    severity = SeverityEnumField(choices=SeverityChoices)



    impact = SeverityEnumField(choices=SeverityChoices)

    impact_extended = models.TextField(blank=True, null=True)



    raw_result = models.JSONField(default=dict)

    tags = models.JSONField(default=dict, null=True, blank=True)

    check_id = models.CharField(max_length=100, blank=False, null=False)

    check_metadata = models.JSONField(default=dict, null=False)

    muted = models.BooleanField(default=False, null=False)

    muted_reason = models.TextField(

        blank=True, null=True, validators=[MinLengthValidator(3)], max_length=500

    )

    muted_at = models.DateTimeField(

        null=True, blank=True, help_text="Timestamp when this finding was muted"

    )

    compliance = models.JSONField(default=dict, null=True, blank=True)



    # Denormalize resource data for performance

    resource_regions = ArrayField(

        models.CharField(max_length=100), blank=True, null=True

    )

    resource_services = ArrayField(

        models.CharField(max_length=100),

        blank=True,

        null=True,

    )

    resource_types = ArrayField(

        models.CharField(max_length=100),

        blank=True,

        null=True,

    )



    # Check metadata denormalization

    categories = ArrayField(

        models.CharField(max_length=100),

        blank=True,

        null=True,

        help_text="Categories from check metadata for efficient filtering",

    )

    resource_groups = models.TextField(

        blank=True,

        null=True,

        help_text="Resource group from check metadata for efficient filtering",

    )



    # Relationships

    scan = models.ForeignKey(to=Scan, related_name="findings", on_delete=models.CASCADE)



    # many-to-many Resources. Relationship is defined on Resource

    resources = models.ManyToManyField(

        Resource,

        verbose_name="Resources associated with the finding",

        through="ResourceFindingMapping",

        related_name="findings",

    )



    # TODO: Add resource search

    text_search = models.GeneratedField(

        expression=SearchVector(

            "impact_extended", "status_extended", weight="A", config="simple"

        ),

        output_field=SearchVectorField(),

        db_persist=True,

        null=True,

        editable=False,

    )



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "findings"



        constraints = [

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "UPDATE", "INSERT", "DELETE"],

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s_default",

                partition_name="default",

                statements=["SELECT", "UPDATE", "INSERT", "DELETE"],

            ),

        ]



        indexes = [

            models.Index(fields=["tenant_id", "id"], name="findings_tenant_and_id_idx"),

            models.Index(fields=["tenant_id", "scan_id"], name="find_tenant_scan_idx"),

            models.Index(

                fields=["tenant_id", "scan_id", "id"], name="find_tenant_scan_id_idx"

            ),

            models.Index(

                condition=models.Q(status=StatusChoices.FAIL, delta="new"),

                fields=["tenant_id", "scan_id"],

                name="find_tenant_scan_fail_new_idx",

            ),

            models.Index(

                fields=["tenant_id", "uid", "-inserted_at"],

                name="find_tenant_uid_inserted_idx",

            ),

            models.Index(

                fields=["tenant_id", "check_id", "inserted_at"],

                name="find_tenant_check_ins_idx",

            ),

            models.Index(

                fields=["tenant_id", "scan_id", "check_id"],

                name="find_tenant_scan_check_idx",

            ),

            GinIndex(

                fields=[

                    "categories",

                    "resource_services",

                    "resource_regions",

                    "resource_types",

                ],

                name="gin_find_arrays_idx",

            ),

        ]



    class JSONAPIMeta:

        resource_name = "findings"



    def add_resources(self, resources: list[Resource] | None):

        if not resources:

            return



        self.resource_regions = self.resource_regions or []

        self.resource_services = self.resource_services or []

        self.resource_types = self.resource_types or []



        # Deduplication

        regions = set(self.resource_regions)

        services = set(self.resource_services)

        types = set(self.resource_types)



        for resource in resources:

            ResourceFindingMapping.objects.update_or_create(

                resource=resource, finding=self, tenant_id=self.tenant_id

            )

            regions.add(resource.region)

            services.add(resource.service)

            types.add(resource.type)



        self.resource_regions = list(regions)

        self.resource_services = list(services)

        self.resource_types = list(types)

        self.save()





class ResourceFindingMapping(PostgresPartitionedModel, RowLevelSecurityProtectedModel):

    """

    Defines the ResourceFindingMapping model.



    ResourceFindingMapping is used to map a Finding to a Resource.



    It follows the same partitioning strategy as the Finding model.

    """



    # NOTE that we don't really need a primary key here,

    #      but everything is easier with django if we do

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    resource = models.ForeignKey(Resource, on_delete=models.CASCADE)

    finding = models.ForeignKey(Finding, on_delete=models.CASCADE)



    class PartitioningMeta:

        method = PostgresPartitioningMethod.RANGE

        key = ["finding_id"]



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "resource_finding_mappings"

        base_manager_name = "objects"

        abstract = False



        # django will automatically create indexes for:

        #   - resource_id

        #   - finding_id

        #   - tenant_id

        #   - id



        indexes = [

            models.Index(

                fields=["tenant_id", "resource_id"],

                name="rfm_tenant_resource_idx",

            ),

        ]

        constraints = [

            models.UniqueConstraint(

                fields=("tenant_id", "resource_id", "finding_id"),

                name="unique_resource_finding_mappings_by_tenant",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

            RowLevelSecurityConstraint(

                "tenant_id",

                name=f"rls_on_{db_table}_default",

                partition_name="default",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]





class ProviderSecret(RowLevelSecurityProtectedModel):

    objects = ActiveProviderManager()

    all_objects = models.Manager()



    class TypeChoices(models.TextChoices):

        STATIC = "static", _("Key-value pairs")

        ROLE = "role", _("Role assumption")

        SERVICE_ACCOUNT = "service_account", _("GCP Service Account Key")



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    updated_at = models.DateTimeField(auto_now=True, editable=False)

    name = models.CharField(

        blank=True, null=True, max_length=100, validators=[MinLengthValidator(3)]

    )

    secret_type = ProviderSecretTypeEnumField(choices=TypeChoices.choices)

    _secret = models.BinaryField(db_column="secret")

    provider = models.OneToOneField(

        Provider,

        on_delete=models.CASCADE,

        related_name="secret",

        related_query_name="secret",

    )



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "provider_secrets"



        constraints = [

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



    class JSONAPIMeta:

        resource_name = "provider-secrets"



    @property

    def secret(self):

        if isinstance(self._secret, memoryview):

            encrypted_bytes = self._secret.tobytes()

        elif isinstance(self._secret, str):

            encrypted_bytes = self._secret.encode()

        else:

            encrypted_bytes = self._secret

        decrypted_data = fernet.decrypt(encrypted_bytes)

        return json.loads(decrypted_data.decode())



    @secret.setter

    def secret(self, value):

        encrypted_data = fernet.encrypt(json.dumps(value).encode())

        self._secret = encrypted_data





class Invitation(RowLevelSecurityProtectedModel):

    class State(models.TextChoices):

        PENDING = "pending", _("Invitation is pending")

        ACCEPTED = "accepted", _("Invitation was accepted by a user")

        EXPIRED = "expired", _("Invitation expired after the configured time")

        REVOKED = "revoked", _("Invitation was revoked by a user")



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    updated_at = models.DateTimeField(auto_now=True, editable=False)

    email = models.EmailField(max_length=254, blank=False, null=False)

    state = InvitationStateEnumField(choices=State.choices, default=State.PENDING)

    token = models.CharField(

        max_length=14,

        unique=True,

        default=generate_random_token,

        editable=False,

        blank=False,

        null=False,

        validators=[MinLengthValidator(14)],

    )

    expires_at = models.DateTimeField(default=one_week_from_now)

    inviter = models.ForeignKey(

        User,

        on_delete=models.SET_NULL,

        related_name="invitations",

        related_query_name="invitation",

        null=True,

    )



    def save(self, *args, **kwargs):

        if self.email:

            self.email = self.email.strip().lower()

        super().save(*args, **kwargs)



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "invitations"



        constraints = [

            models.UniqueConstraint(

                fields=("tenant", "token", "email"),

                name="unique_tenant_token_email_by_invitation",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



    class JSONAPIMeta:

        resource_name = "invitations"





class Role(RowLevelSecurityProtectedModel):

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    name = models.CharField(max_length=255)

    manage_users = models.BooleanField(default=False)

    manage_account = models.BooleanField(default=False)

    manage_billing = models.BooleanField(default=False)

    manage_providers = models.BooleanField(default=False)

    manage_integrations = models.BooleanField(default=False)

    manage_scans = models.BooleanField(default=False)

    unlimited_visibility = models.BooleanField(default=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    updated_at = models.DateTimeField(auto_now=True, editable=False)

    provider_groups = models.ManyToManyField(

        ProviderGroup, through="RoleProviderGroupRelationship", related_name="roles"

    )

    users = models.ManyToManyField(

        User, through="UserRoleRelationship", related_name="roles"

    )

    invitations = models.ManyToManyField(

        Invitation, through="InvitationRoleRelationship", related_name="roles"

    )



    # Filter permission_state

    PERMISSION_FIELDS = [

        "manage_users",

        "manage_account",

        "manage_billing",

        "manage_providers",

        "manage_integrations",

        "manage_scans",

    ]



    @property

    def permission_state(self):

        values = [getattr(self, field) for field in self.PERMISSION_FIELDS]

        if all(values):

            return PermissionChoices.UNLIMITED

        elif not any(values):

            return PermissionChoices.NONE

        else:

            return PermissionChoices.LIMITED



    @classmethod

    def filter_by_permission_state(cls, queryset, value):

        q_all_true = Q(**dict.fromkeys(cls.PERMISSION_FIELDS, True))

        q_all_false = Q(**dict.fromkeys(cls.PERMISSION_FIELDS, False))



        if value == PermissionChoices.UNLIMITED:

            return queryset.filter(q_all_true)

        elif value == PermissionChoices.NONE:

            return queryset.filter(q_all_false)

        else:

            return queryset.exclude(q_all_true | q_all_false)



    class Meta:

        db_table = "roles"

        constraints = [

            models.UniqueConstraint(

                fields=["tenant_id", "name"],

                name="unique_role_per_tenant",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



    class JSONAPIMeta:

        resource_name = "roles"





class RoleProviderGroupRelationship(RowLevelSecurityProtectedModel):

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    role = models.ForeignKey(Role, on_delete=models.CASCADE)

    provider_group = models.ForeignKey(ProviderGroup, on_delete=models.CASCADE)

    inserted_at = models.DateTimeField(auto_now_add=True)



    class Meta:

        db_table = "role_provider_group_relationship"

        constraints = [

            models.UniqueConstraint(

                fields=["role_id", "provider_group_id"],

                name="unique_role_provider_group_relationship",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



    class JSONAPIMeta:

        resource_name = "role-provider_groups"





class UserRoleRelationship(RowLevelSecurityProtectedModel):

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    role = models.ForeignKey(Role, on_delete=models.CASCADE)

    user = models.ForeignKey(User, on_delete=models.CASCADE)

    inserted_at = models.DateTimeField(auto_now_add=True)



    class Meta:

        db_table = "role_user_relationship"

        constraints = [

            models.UniqueConstraint(

                fields=["role_id", "user_id"],

                name="unique_role_user_relationship",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



    class JSONAPIMeta:

        resource_name = "user-roles"





class InvitationRoleRelationship(RowLevelSecurityProtectedModel):

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    role = models.ForeignKey(Role, on_delete=models.CASCADE)

    invitation = models.ForeignKey(Invitation, on_delete=models.CASCADE)

    inserted_at = models.DateTimeField(auto_now_add=True)



    class Meta:

        db_table = "role_invitation_relationship"

        constraints = [

            models.UniqueConstraint(

                fields=["role_id", "invitation_id"],

                name="unique_role_invitation_relationship",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



    class JSONAPIMeta:

        resource_name = "invitation-roles"





class ComplianceOverview(RowLevelSecurityProtectedModel):

    objects = ActiveProviderManager()

    all_objects = models.Manager()



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    compliance_id = models.CharField(max_length=100, blank=False, null=False)

    framework = models.CharField(max_length=100, blank=False, null=False)

    version = models.CharField(max_length=50, blank=True)

    description = models.TextField(blank=True)

    region = models.CharField(max_length=50, blank=True)

    requirements = models.JSONField(default=dict)

    requirements_passed = models.IntegerField(default=0)

    requirements_failed = models.IntegerField(default=0)

    requirements_manual = models.IntegerField(default=0)

    total_requirements = models.IntegerField(default=0)



    scan = models.ForeignKey(

        Scan,

        on_delete=models.CASCADE,

        related_name="compliance_overviews",

        related_query_name="compliance_overview",

        null=True,

    )



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "compliance_overviews"



        constraints = [

            models.UniqueConstraint(

                fields=("tenant", "scan", "compliance_id", "region"),

                name="unique_tenant_scan_region_compliance_by_compliance_overview",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "DELETE"],

            ),

        ]



    class JSONAPIMeta:

        resource_name = "compliance-overviews"





class ComplianceRequirementOverview(RowLevelSecurityProtectedModel):

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    compliance_id = models.TextField(blank=False)

    framework = models.TextField(blank=False)

    version = models.TextField(blank=True)

    description = models.TextField(blank=True)

    region = models.TextField(blank=False)



    requirement_id = models.TextField(blank=False)

    requirement_status = StatusEnumField(choices=StatusChoices)

    passed_checks = models.IntegerField(default=0)

    failed_checks = models.IntegerField(default=0)

    total_checks = models.IntegerField(default=0)

    passed_findings = models.IntegerField(default=0)

    total_findings = models.IntegerField(default=0)



    scan = models.ForeignKey(

        Scan,

        on_delete=models.CASCADE,

        related_name="compliance_requirements_overviews",

        related_query_name="compliance_requirements_overview",

    )



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "compliance_requirements_overviews"



        constraints = [

            models.UniqueConstraint(

                fields=(

                    "tenant_id",

                    "scan_id",

                    "compliance_id",

                    "requirement_id",

                    "region",

                ),

                name="unique_tenant_compliance_requirement_overview",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "DELETE"],

            ),

        ]

        indexes = [

            models.Index(

                fields=["tenant_id", "scan_id", "compliance_id", "region"],

                name="cro_scan_comp_reg_idx",

            ),

        ]



    class JSONAPIMeta:

        resource_name = "compliance-requirements-overviews"





class ComplianceOverviewSummary(RowLevelSecurityProtectedModel):

    """

    Pre-aggregated compliance overview aggregated across ALL regions.

    One row per (scan_id, compliance_id) combination.



    This table optimizes the common case where users view overall compliance

    without filtering by region. For region-specific views, the detailed

    ComplianceRequirementOverview table is used instead.

    """



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)



    scan = models.ForeignKey(

        Scan,

        on_delete=models.CASCADE,

        related_name="compliance_summaries",

        related_query_name="compliance_summary",

    )



    compliance_id = models.TextField(blank=False)



    # Pre-aggregated scores (computed across ALL regions)

    requirements_passed = models.IntegerField(default=0)

    requirements_failed = models.IntegerField(default=0)

    requirements_manual = models.IntegerField(default=0)

    total_requirements = models.IntegerField(default=0)



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "compliance_overview_summaries"



        constraints = [

            models.UniqueConstraint(

                fields=("tenant_id", "scan_id", "compliance_id"),

                name="unique_compliance_summary_per_scan",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "DELETE"],

            ),

        ]



        indexes = [

            models.Index(

                fields=["tenant_id", "scan_id"],

                name="cos_tenant_scan_idx",

            ),

        ]



    class JSONAPIMeta:

        resource_name = "compliance-overview-summaries"





class ScanSummary(RowLevelSecurityProtectedModel):

    objects = ActiveProviderManager()

    all_objects = models.Manager()



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    check_id = models.CharField(max_length=100, blank=False, null=False)

    service = models.TextField(blank=False)

    severity = SeverityEnumField(choices=SeverityChoices)

    region = models.TextField(blank=False)

    _pass = models.IntegerField(db_column="pass", default=0)

    fail = models.IntegerField(default=0)

    muted = models.IntegerField(default=0)

    total = models.IntegerField(default=0)

    new = models.IntegerField(default=0)

    changed = models.IntegerField(default=0)

    unchanged = models.IntegerField(default=0)



    fail_new = models.IntegerField(default=0)

    fail_changed = models.IntegerField(default=0)

    pass_new = models.IntegerField(default=0)

    pass_changed = models.IntegerField(default=0)

    muted_new = models.IntegerField(default=0)

    muted_changed = models.IntegerField(default=0)



    scan = models.ForeignKey(

        Scan,

        on_delete=models.CASCADE,

        related_name="aggregations",

        related_query_name="aggregation",

    )



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "scan_summaries"



        constraints = [

            models.UniqueConstraint(

                fields=("tenant", "scan", "check_id", "service", "severity", "region"),

                name="unique_scan_summary",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]

        indexes = [

            models.Index(

                fields=["tenant_id", "scan_id"],

                name="scan_summaries_tenant_scan_idx",

            ),

            models.Index(

                fields=["tenant_id", "scan_id", "severity"],

                name="ss_tenant_scan_severity_idx",

            ),

        ]



    class JSONAPIMeta:

        resource_name = "scan-summaries"





class DailySeveritySummary(RowLevelSecurityProtectedModel):

    """

    Pre-aggregated daily severity counts per provider.

    Used by findings_severity/timeseries endpoint for efficient queries.

    """



    objects = ActiveProviderManager()



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    date = models.DateField()



    provider = models.ForeignKey(

        Provider,

        on_delete=models.CASCADE,

        related_name="daily_severity_summaries",

        related_query_name="daily_severity_summary",

    )

    scan = models.ForeignKey(

        Scan,

        on_delete=models.CASCADE,

        related_name="daily_severity_summaries",

        related_query_name="daily_severity_summary",

    )



    # Aggregated fail counts by severity

    critical = models.IntegerField(default=0)

    high = models.IntegerField(default=0)

    medium = models.IntegerField(default=0)

    low = models.IntegerField(default=0)

    informational = models.IntegerField(default=0)

    muted = models.IntegerField(default=0)



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "daily_severity_summaries"



        constraints = [

            models.UniqueConstraint(

                fields=("tenant_id", "provider", "date"),

                name="unique_daily_severity_summary",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



        indexes = [

            models.Index(

                fields=["tenant_id", "id"],

                name="dss_tenant_id_idx",

            ),

            models.Index(

                fields=["tenant_id", "provider_id"],

                name="dss_tenant_provider_idx",

            ),

        ]





class FindingGroupDailySummary(RowLevelSecurityProtectedModel):

    """

    Pre-aggregated daily finding counts per check_id per provider.

    Used by finding-groups endpoint for efficient queries over date ranges.



    Instead of aggregating millions of findings on-the-fly, we pre-compute

    daily summaries and re-aggregate them when querying date ranges.

    This reduces query complexity from O(findings) to O(days × checks × providers).

    """



    objects = ActiveProviderManager()



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(default=django_timezone.now, editable=False)

    updated_at = models.DateTimeField(auto_now=True, editable=False)

    check_id = models.CharField(max_length=255, db_index=True)



    # Provider FK for filtering by specific provider

    provider = models.ForeignKey(

        "Provider",

        on_delete=models.CASCADE,

        related_name="finding_group_summaries",

    )



    # Check metadata (denormalized for performance)

    check_title = models.CharField(max_length=500, blank=True, null=True)

    check_description = models.TextField(blank=True, null=True)



    # Severity stored as integer for MAX aggregation (5=critical, 4=high, etc.)

    severity_order = models.SmallIntegerField(default=1)



    # Finding counts (inclusive of muted findings; use the `muted` flag to

    # tell whether the group has any actionable findings).

    pass_count = models.IntegerField(default=0)

    fail_count = models.IntegerField(default=0)

    manual_count = models.IntegerField(default=0)

    muted_count = models.IntegerField(default=0)



    # Status counts restricted to muted findings, so clients can isolate the

    # muted half of each status (e.g. `pass_count - pass_muted_count` gives the

    # actionable PASS findings).

    pass_muted_count = models.IntegerField(default=0)

    fail_muted_count = models.IntegerField(default=0)

    manual_muted_count = models.IntegerField(default=0)



    # Whether every finding for this (provider, check, day) is muted.

    muted = models.BooleanField(default=False)



    # Delta counts (non-muted, kept for convenience and as a "total" view).

    new_count = models.IntegerField(default=0)

    changed_count = models.IntegerField(default=0)



    # Delta breakdown by (status, muted) so clients can answer questions like

    # "how many new failing findings appeared in this scan?" without scanning

    # the underlying findings table. Mirrors the existing pass/fail/manual

    # naming, with `_muted_count` siblings tracking the muted half of each

    # bucket explicitly.

    new_fail_count = models.IntegerField(default=0)

    new_fail_muted_count = models.IntegerField(default=0)

    new_pass_count = models.IntegerField(default=0)

    new_pass_muted_count = models.IntegerField(default=0)

    new_manual_count = models.IntegerField(default=0)

    new_manual_muted_count = models.IntegerField(default=0)

    changed_fail_count = models.IntegerField(default=0)

    changed_fail_muted_count = models.IntegerField(default=0)

    changed_pass_count = models.IntegerField(default=0)

    changed_pass_muted_count = models.IntegerField(default=0)

    changed_manual_count = models.IntegerField(default=0)

    changed_manual_muted_count = models.IntegerField(default=0)



    # Resource counts

    resources_fail = models.IntegerField(default=0)

    resources_total = models.IntegerField(default=0)



    # Timing

    first_seen_at = models.DateTimeField(null=True, blank=True)

    last_seen_at = models.DateTimeField(null=True, blank=True)

    failing_since = models.DateTimeField(null=True, blank=True)



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "finding_group_daily_summaries"



        constraints = [

            models.UniqueConstraint(

                fields=("tenant_id", "provider", "check_id", "inserted_at"),

                name="unique_finding_group_daily_summary",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



        indexes = [

            models.Index(

                fields=["tenant_id", "inserted_at"],

                name="fgds_tenant_inserted_at_idx",

            ),

            models.Index(

                fields=["tenant_id", "check_id", "inserted_at"],

                name="fgds_tenant_chk_ins_idx",

            ),

            models.Index(

                fields=["tenant_id", "provider", "inserted_at"],

                name="fgds_tenant_prov_ins_idx",

            ),

            # Trigram indexes for case-insensitive search

            GinIndex(

                OpClass(Upper("check_id"), name="gin_trgm_ops"),

                name="fgds_check_id_trgm_idx",

            ),

            GinIndex(

                OpClass(Upper("check_title"), name="gin_trgm_ops"),

                name="fgds_check_title_trgm_idx",

            ),

        ]



    class JSONAPIMeta:

        resource_name = "finding-group-daily-summaries"





class Integration(RowLevelSecurityProtectedModel):

    class IntegrationChoices(models.TextChoices):

        AMAZON_S3 = "amazon_s3", _("Amazon S3")

        AWS_SECURITY_HUB = "aws_security_hub", _("AWS Security Hub")

        JIRA = "jira", _("JIRA")

        SLACK = "slack", _("Slack")



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    updated_at = models.DateTimeField(auto_now=True, editable=False)

    enabled = models.BooleanField(default=False)

    connected = models.BooleanField(null=True, blank=True)

    connection_last_checked_at = models.DateTimeField(null=True, blank=True)

    integration_type = IntegrationTypeEnumField(choices=IntegrationChoices.choices)

    configuration = models.JSONField(default=dict)

    _credentials = models.BinaryField(db_column="credentials")



    providers = models.ManyToManyField(

        Provider,

        related_name="integrations",

        through="IntegrationProviderRelationship",

        blank=True,

    )



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "integrations"



        constraints = [

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



    class JSONAPIMeta:

        resource_name = "integrations"



    @property
    def credentials(self):
        if not self._credentials:
            return {}

        if isinstance(self._credentials, memoryview):
            encrypted_bytes = self._credentials.tobytes()
        elif isinstance(self._credentials, str):
            encrypted_bytes = self._credentials.encode()
        else:
            encrypted_bytes = self._credentials

        if not encrypted_bytes:
            return {}

        try:
            decrypted_data = fernet.decrypt(encrypted_bytes)
            return json.loads(decrypted_data.decode())
        except (InvalidToken, Exception) as e:
            logger.warning(f"Failed to decrypt credentials for integration {self.id}: {e}")
            return {}




    @credentials.setter

    def credentials(self, value):

        encrypted_data = fernet.encrypt(json.dumps(value).encode())

        self._credentials = encrypted_data





class IntegrationProviderRelationship(RowLevelSecurityProtectedModel):

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    integration = models.ForeignKey(Integration, on_delete=models.CASCADE)

    provider = models.ForeignKey(Provider, on_delete=models.CASCADE)

    inserted_at = models.DateTimeField(auto_now_add=True)



    class Meta:

        db_table = "integration_provider_mappings"

        constraints = [

            models.UniqueConstraint(

                fields=["integration_id", "provider_id"],

                name="unique_integration_provider_rel",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]





class SAMLToken(models.Model):

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    updated_at = models.DateTimeField(auto_now=True, editable=False)

    expires_at = models.DateTimeField(editable=False)

    token = models.JSONField(unique=True)

    user = models.ForeignKey(User, on_delete=models.CASCADE)



    class Meta:

        db_table = "saml_tokens"



    def save(self, *args, **kwargs):

        if not self.expires_at:

            self.expires_at = datetime.now(UTC) + timedelta(seconds=15)

        super().save(*args, **kwargs)



    def is_expired(self) -> bool:

        return datetime.now(UTC) >= self.expires_at





class SAMLDomainIndex(models.Model):

    """

    Public index of SAML domains. No RLS. Used for fast lookup in SAML login flow.

    """



    email_domain = models.CharField(max_length=254, unique=True)

    tenant = models.ForeignKey("Tenant", on_delete=models.CASCADE)



    class Meta:

        db_table = "saml_domain_index"



        constraints = [

            models.UniqueConstraint(

                fields=("email_domain", "tenant"),

                name="unique_resources_by_email_domain",

            ),

            BaseSecurityConstraint(

                name="statements_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]





class SAMLConfiguration(RowLevelSecurityProtectedModel):

    """

    Stores per-tenant SAML settings, including email domain and IdP metadata.

    Automatically syncs to a SocialApp instance on save.



    Note:

    This model exists to provide a tenant-aware abstraction over SAML configuration.

    It supports row-level security, custom validation, and metadata parsing, enabling

    Prowler to expose a clean API and admin interface for managing SAML integrations.



    Although Django Allauth uses the SocialApp model to store provider configuration,

    it is not designed for multi-tenant use. SocialApp lacks support for tenant scoping,

    email domain mapping, and structured metadata handling.



    By managing SAMLConfiguration separately, we ensure:

        - Strong isolation between tenants via RLS.

        - Ownership of raw IdP metadata and its validation.

        - An explicit link between SAML config and business-level identifiers (e.g. email domain).

        - Programmatic transformation into the SocialApp format used by Allauth.



    In short, this model acts as a secure and user-friendly layer over Allauth's lower-level primitives.

    """



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    email_domain = models.CharField(

        max_length=254,

        unique=True,

        help_text="Email domain used to identify the tenant, e.g. prowlerdemo.com",

    )

    metadata_xml = models.TextField(

        help_text="Raw IdP metadata XML to configure SingleSignOnService, certificates, etc."

    )

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)



    class JSONAPIMeta:

        resource_name = "saml-configurations"



    class Meta:

        db_table = "saml_configurations"



        constraints = [

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

            # 1 config per tenant

            models.UniqueConstraint(

                fields=["tenant"],

                name="unique_samlconfig_per_tenant",

            ),

        ]



    def clean(self, old_email_domain=None, is_create=False):

        # Domain must not contain @

        if "@" in self.email_domain:

            raise ValidationError({"email_domain": "Domain must not contain @"})



        # Enforce at most one config per tenant

        qs = SAMLConfiguration.objects.filter(tenant=self.tenant)

        # Exclude ourselves in case of update

        if self.pk:

            qs = qs.exclude(pk=self.pk)

        if qs.exists():

            raise ValidationError(

                {"tenant": "A SAML configuration already exists for this tenant."}

            )



        # The email domain must be unique in the entire system

        qs = SAMLConfiguration.objects.using(MainRouter.admin_db).filter(

            email_domain__iexact=self.email_domain

        )

        if qs.exists() and old_email_domain != self.email_domain:

            raise ValidationError(

                {"tenant": "There is a problem with your email domain."}

            )



        # The entityID must be unique in the system

        idp_settings = self._parsed_metadata

        entity_id = idp_settings.get("entity_id")



        if entity_id:

            # Find any SocialApp with this entityID

            q = SocialApp.objects.filter(provider="saml", provider_id=entity_id)



            # If updating, exclude our own SocialApp from the check

            if not is_create:

                q = q.exclude(client_id=old_email_domain)

            else:

                q = q.exclude(client_id=self.email_domain)



            if q.exists():

                raise ValidationError(

                    {"metadata_xml": "There is a problem with your metadata."}

                )



    def save(self, *args, **kwargs):

        self.email_domain = self.email_domain.strip().lower()

        is_create = not SAMLConfiguration.objects.filter(pk=self.pk).exists()



        if not is_create:

            old = SAMLConfiguration.objects.get(pk=self.pk)

            old_email_domain = old.email_domain

            old_metadata_xml = old.metadata_xml

        else:

            old_email_domain = None

            old_metadata_xml = None



        self._parsed_metadata = self._parse_metadata()

        self.clean(old_email_domain, is_create)

        super().save(*args, **kwargs)



        if is_create or (

            old_email_domain != self.email_domain

            or old_metadata_xml != self.metadata_xml

        ):

            self._sync_social_app(old_email_domain)



        # Sync the public index

        if not is_create and old_email_domain and old_email_domain != self.email_domain:

            SAMLDomainIndex.objects.filter(email_domain=old_email_domain).delete()



        # Create/update the new domain index

        SAMLDomainIndex.objects.update_or_create(

            email_domain=self.email_domain, defaults={"tenant": self.tenant}

        )



    def delete(self, *args, **kwargs):

        super().delete(*args, **kwargs)



        SocialApp.objects.filter(provider="saml", client_id=self.email_domain).delete()

        SAMLDomainIndex.objects.filter(email_domain=self.email_domain).delete()



    def _parse_metadata(self):

        """

        Parse the raw IdP metadata XML and extract:

            - entity_id

            - sso_url

            - slo_url (may be None)

            - x509cert (required)

        """

        ns = {

            "md": "urn:oasis:names:tc:SAML:2.0:metadata",

            "ds": "http://www.w3.org/2000/09/xmldsig#",

        }

        try:

            root = ET.fromstring(self.metadata_xml)

        except ET.ParseError as e:

            raise ValidationError({"metadata_xml": f"Invalid XML: {e}"})

        except defusedxml.DefusedXmlException as e:

            raise ValidationError({"metadata_xml": f"Unsafe XML content rejected: {e}"})



        # Entity ID

        entity_id = root.attrib.get("entityID")

        if not entity_id:

            raise ValidationError({"metadata_xml": "Missing entityID in metadata."})



        # SSO endpoint (must exist)

        sso = root.find(".//md:IDPSSODescriptor/md:SingleSignOnService", ns)

        if sso is None or "Location" not in sso.attrib:

            raise ValidationError(

                {"metadata_xml": "Missing SingleSignOnService in metadata."}

            )

        sso_url = sso.attrib["Location"]



        # SLO endpoint (optional)

        slo = root.find(".//md:IDPSSODescriptor/md:SingleLogoutService", ns)

        slo_url = slo.attrib.get("Location") if slo is not None else None



        # X.509 certificate (required)

        cert = root.find(

            './/md:KeyDescriptor[@use="signing"]/ds:KeyInfo/ds:X509Data/ds:X509Certificate',

            ns,

        )

        if cert is None or not cert.text or not cert.text.strip():

            raise ValidationError(

                {

                    "metadata_xml": 'Metadata must include a <ds:X509Certificate> under <KeyDescriptor use="signing">.'

                }

            )

        x509cert = cert.text.strip()



        return {

            "entity_id": entity_id,

            "sso_url": sso_url,

            "slo_url": slo_url,

            "x509cert": x509cert,

        }



    def _sync_social_app(self, previous_email_domain=None):

        """

        Create or update the corresponding SocialApp based on email_domain.

        If the domain changed, update the matching SocialApp.

        """

        settings_dict = SOCIALACCOUNT_PROVIDERS["saml"].copy()

        settings_dict["idp"] = self._parsed_metadata



        current_site = Site.objects.get(id=settings.SITE_ID)



        social_app_qs = SocialApp.objects.filter(

            provider="saml", client_id=previous_email_domain or self.email_domain

        )



        client_id = self.email_domain[:191]

        name = f"SAML-{self.email_domain}"[:40]



        if social_app_qs.exists():

            social_app = social_app_qs.first()

            social_app.client_id = client_id

            social_app.name = name

            social_app.settings = settings_dict

            social_app.provider_id = self._parsed_metadata["entity_id"]

            social_app.save()

            social_app.sites.set([current_site])

        else:

            social_app = SocialApp.objects.create(

                provider="saml",

                client_id=client_id,

                name=name,

                settings=settings_dict,

                provider_id=self._parsed_metadata["entity_id"],

            )

            social_app.sites.set([current_site])





class ResourceScanSummary(RowLevelSecurityProtectedModel):

    scan_id = models.UUIDField(default=uuid7, db_index=True)

    resource_id = models.UUIDField(default=uuid4)

    service = models.CharField(max_length=100)

    region = models.CharField(max_length=100)

    resource_type = models.CharField(max_length=100)



    class Meta:

        db_table = "resource_scan_summaries"

        unique_together = (("tenant_id", "scan_id", "resource_id"),)



        indexes = [

            # Single-dimension lookups:

            models.Index(

                fields=["tenant_id", "scan_id", "service"],

                name="rss_tenant_scan_svc_idx",

            ),

            models.Index(

                fields=["tenant_id", "scan_id", "region"],

                name="rss_tenant_scan_reg_idx",

            ),

            models.Index(

                fields=["tenant_id", "scan_id", "resource_type"],

                name="rss_tenant_scan_type_idx",

            ),

            # Two-dimension cross-filters:

            models.Index(

                fields=["tenant_id", "scan_id", "region", "service"],

                name="rss_tenant_scan_reg_svc_idx",

            ),

            models.Index(

                fields=["tenant_id", "scan_id", "service", "resource_type"],

                name="rss_tenant_scan_svc_type_idx",

            ),

            models.Index(

                fields=["tenant_id", "scan_id", "region", "resource_type"],

                name="rss_tenant_scan_reg_type_idx",

            ),

        ]



        constraints = [

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]





class ScanCategorySummary(RowLevelSecurityProtectedModel):

    """

    Pre-aggregated category metrics per scan by severity.



    Stores one row per (category, severity) combination per scan for efficient

    overview queries. Categories come from check_metadata.categories.



    Count relationships (each is a subset of the previous):

        - total_findings >= failed_findings >= new_failed_findings

    """



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)



    scan = models.ForeignKey(

        Scan,

        on_delete=models.CASCADE,

        related_name="category_summaries",

        related_query_name="category_summary",

    )



    category = models.CharField(max_length=100)

    severity = SeverityEnumField(choices=SeverityChoices)



    total_findings = models.IntegerField(

        default=0, help_text="Non-muted findings (PASS + FAIL)"

    )

    failed_findings = models.IntegerField(

        default=0, help_text="Non-muted FAIL findings (subset of total_findings)"

    )

    new_failed_findings = models.IntegerField(

        default=0,

        help_text="Non-muted FAIL with delta='new' (subset of failed_findings)",

    )



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "scan_category_summaries"



        indexes = [

            models.Index(fields=["tenant_id", "scan"], name="scs_tenant_scan_idx"),

        ]



        constraints = [

            models.UniqueConstraint(

                fields=("tenant_id", "scan_id", "category", "severity"),

                name="unique_category_severity_per_scan",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



    class JSONAPIMeta:

        resource_name = "scan-category-summaries"





class ScanGroupSummary(RowLevelSecurityProtectedModel):

    """

    Pre-aggregated resource group metrics per scan by severity.



    Stores one row per (resource_group, severity) combination per scan for efficient

    overview queries. Resource groups come from check_metadata.Group.



    Count relationships (each is a subset of the previous):

        - total_findings >= failed_findings >= new_failed_findings

    """



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)



    scan = models.ForeignKey(

        Scan,

        on_delete=models.CASCADE,

        related_name="resource_group_summaries",

        related_query_name="resource_group_summary",

    )



    resource_group = models.CharField(max_length=50)

    severity = SeverityEnumField(choices=SeverityChoices)



    total_findings = models.IntegerField(

        default=0, help_text="Non-muted findings (PASS + FAIL)"

    )

    failed_findings = models.IntegerField(

        default=0, help_text="Non-muted FAIL findings (subset of total_findings)"

    )

    new_failed_findings = models.IntegerField(

        default=0,

        help_text="Non-muted FAIL with delta='new' (subset of failed_findings)",

    )

    resources_count = models.IntegerField(

        default=0, help_text="Count of distinct resource_uid values"

    )



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "scan_resource_group_summaries"



        indexes = [

            models.Index(fields=["tenant_id", "scan"], name="srgs_tenant_scan_idx"),

        ]



        constraints = [

            models.UniqueConstraint(

                fields=("tenant_id", "scan_id", "resource_group", "severity"),

                name="unique_resource_group_severity_per_scan",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



    class JSONAPIMeta:

        resource_name = "scan-resource-group-summaries"





class LighthouseConfiguration(RowLevelSecurityProtectedModel):

    """

    Stores configuration and API keys for LLM services.

    """



    class ModelChoices(models.TextChoices):

        GPT_4O_2024_11_20 = "gpt-4o-2024-11-20", _("GPT-4o v2024-11-20")

        GPT_4O_2024_08_06 = "gpt-4o-2024-08-06", _("GPT-4o v2024-08-06")

        GPT_4O_2024_05_13 = "gpt-4o-2024-05-13", _("GPT-4o v2024-05-13")

        GPT_4O = "gpt-4o", _("GPT-4o Default")

        GPT_4O_MINI_2024_07_18 = "gpt-4o-mini-2024-07-18", _("GPT-4o Mini v2024-07-18")

        GPT_4O_MINI = "gpt-4o-mini", _("GPT-4o Mini Default")

        GPT_5_2025_08_07 = "gpt-5-2025-08-07", _("GPT-5 v2025-08-07")

        GPT_5 = "gpt-5", _("GPT-5 Default")

        GPT_5_MINI_2025_08_07 = "gpt-5-mini-2025-08-07", _("GPT-5 Mini v2025-08-07")

        GPT_5_MINI = "gpt-5-mini", _("GPT-5 Mini Default")



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    updated_at = models.DateTimeField(auto_now=True, editable=False)



    name = models.CharField(

        max_length=100,

        validators=[MinLengthValidator(3)],

        blank=False,

        null=False,

        help_text="Name of the configuration",

    )

    api_key = models.BinaryField(

        blank=False, null=False, help_text="Encrypted API key for the LLM service"

    )

    model = models.CharField(

        max_length=50,

        choices=ModelChoices.choices,

        blank=False,

        null=False,

        default=ModelChoices.GPT_4O_2024_08_06,

        help_text="Must be one of the supported model names",

    )

    temperature = models.FloatField(default=0, help_text="Must be between 0 and 1")

    max_tokens = models.IntegerField(

        default=4000, help_text="Must be between 500 and 5000"

    )

    business_context = models.TextField(

        blank=True,

        null=False,

        default="",

        help_text="Additional business context for this AI model configuration",

    )

    is_active = models.BooleanField(default=True)



    def __str__(self):

        return self.name



    def clean(self):

        super().clean()



    @property

    def api_key_decoded(self):

        """Return the decrypted API key, or None if unavailable or invalid."""

        if not self.api_key:

            return None



        try:

            decrypted_key = fernet.decrypt(bytes(self.api_key))

            return decrypted_key.decode()



        except InvalidToken:

            logger.warning("Invalid token while decrypting API key.")

        except Exception as e:

            logger.exception("Unexpected error while decrypting API key: %s", e)



    @api_key_decoded.setter

    def api_key_decoded(self, value):

        """Store the encrypted API key."""

        if not value:

            raise ModelValidationError(

                detail="API key is required",

                code="invalid_api_key",

                pointer="/data/attributes/api_key",

            )

        self.api_key = fernet.encrypt(value.encode())



    def save(self, *args, **kwargs):

        self.full_clean()

        super().save(*args, **kwargs)



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "lighthouse_configurations"



        constraints = [

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

            # Add unique constraint for name within a tenant

            models.UniqueConstraint(

                fields=["tenant_id"], name="unique_lighthouse_config_per_tenant"

            ),

        ]



    class JSONAPIMeta:

        resource_name = "lighthouse-configurations"





class MuteRule(RowLevelSecurityProtectedModel):

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    updated_at = models.DateTimeField(auto_now=True, editable=False)



    # Rule metadata

    name = models.CharField(

        max_length=100,

        validators=[MinLengthValidator(3)],

        help_text="Human-readable name for this rule",

    )

    reason = models.TextField(

        validators=[MinLengthValidator(3)],

        max_length=500,

        help_text="Reason for muting",

    )

    enabled = models.BooleanField(

        default=True, help_text="Whether this rule is currently enabled"

    )



    # Audit fields

    created_by = models.ForeignKey(

        User,

        on_delete=models.SET_NULL,

        null=True,

        related_name="created_mute_rules",

        help_text="User who created this rule",

    )



    # Rule criteria - array of finding UIDs

    finding_uids = ArrayField(

        models.CharField(max_length=255), help_text="List of finding UIDs to mute"

    )



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "mute_rules"



        constraints = [

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

            models.UniqueConstraint(

                fields=("tenant_id", "name"),

                name="unique_mute_rule_name_per_tenant",

            ),

        ]



    class JSONAPIMeta:

        resource_name = "mute-rules"





class Processor(RowLevelSecurityProtectedModel):

    class ProcessorChoices(models.TextChoices):

        MUTELIST = "mutelist", _("Mutelist")



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    updated_at = models.DateTimeField(auto_now=True, editable=False)

    processor_type = ProcessorTypeEnumField(choices=ProcessorChoices.choices)

    configuration = models.JSONField(default=dict)



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "processors"



        constraints = [

            models.UniqueConstraint(

                fields=("tenant_id", "processor_type"),

                name="unique_processor_types_tenant",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]

        indexes = [

            models.Index(

                fields=["tenant_id", "id"],

                name="processor_tenant_id_idx",

            ),

            models.Index(

                fields=["tenant_id", "processor_type"],

                name="processor_tenant_type_idx",

            ),

        ]



    class JSONAPIMeta:

        resource_name = "processors"





class LighthouseProviderConfiguration(RowLevelSecurityProtectedModel):

    """

    Per-tenant configuration for an LLM provider (credentials, base URL, activation).



    One configuration per provider type per tenant.

    """



    class LLMProviderChoices(models.TextChoices):

        OPENAI = "openai", _("OpenAI")

        BEDROCK = "bedrock", _("AWS Bedrock")

        OPENAI_COMPATIBLE = "openai_compatible", _("OpenAI Compatible")



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    updated_at = models.DateTimeField(auto_now=True, editable=False)



    provider_type = models.CharField(

        max_length=50,

        choices=LLMProviderChoices.choices,

        help_text="LLM provider name",

    )



    # For OpenAI-compatible providers

    base_url = models.URLField(blank=True, null=True)



    # Encrypted JSON for provider-specific auth

    credentials = models.BinaryField(

        blank=False, null=False, help_text="Encrypted JSON credentials for the provider"

    )



    is_active = models.BooleanField(default=True)



    def __str__(self):

        return f"{self.get_provider_type_display()} ({self.tenant_id})"



    def clean(self):

        super().clean()



    @property

    def credentials_decoded(self):

        if not self.credentials:

            return None

        try:

            decrypted_data = fernet.decrypt(bytes(self.credentials))

            return json.loads(decrypted_data.decode())

        except (InvalidToken, json.JSONDecodeError) as e:

            logger.warning("Failed to decrypt provider credentials: %s", e)

            return None

        except Exception as e:

            logger.exception(

                "Unexpected error while decrypting provider credentials: %s", e

            )

            return None



    @credentials_decoded.setter

    def credentials_decoded(self, value):

        """

        Set and encrypt credentials (assumes serializer performed validation).

        """

        if not value:

            raise ModelValidationError(

                detail="Credentials are required",

                code="invalid_credentials",

                pointer="/data/attributes/credentials",

            )

        self.credentials = fernet.encrypt(json.dumps(value).encode())



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "lighthouse_provider_configurations"



        constraints = [

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

            models.UniqueConstraint(

                fields=["tenant_id", "provider_type"],

                name="unique_provider_config_per_tenant",

            ),

        ]



        indexes = [

            models.Index(

                fields=["tenant_id", "provider_type"],

                name="lh_pc_tenant_type_idx",

            ),

        ]



    class JSONAPIMeta:

        resource_name = "lighthouse-providers"





class LighthouseTenantConfiguration(RowLevelSecurityProtectedModel):

    """

    Tenant-level Lighthouse settings (business context and defaults).

    One record per tenant.

    """



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    updated_at = models.DateTimeField(auto_now=True, editable=False)



    business_context = models.TextField(blank=True, default="")



    # Preferred provider key (e.g., "openai", "bedrock", "openai_compatible")

    default_provider = models.CharField(max_length=50, blank=True)



    # Mapping of provider -> model id, e.g., {"openai": "gpt-4o", "bedrock": "anthropic.claude-v2"}

    default_models = models.JSONField(default=dict, blank=True)



    def __str__(self):

        return f"Lighthouse Tenant Config for {self.tenant_id}"



    def clean(self):

        super().clean()



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "lighthouse_tenant_config"



        constraints = [

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

            models.UniqueConstraint(

                fields=["tenant_id"], name="unique_tenant_lighthouse_config"

            ),

        ]



    class JSONAPIMeta:

        resource_name = "lighthouse-configurations"





class LighthouseProviderModels(RowLevelSecurityProtectedModel):

    """

    Per-tenant, per-provider configuration list of available LLM models.

    RLS-protected; populated via provider API using tenant-scoped credentials.

    """



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    updated_at = models.DateTimeField(auto_now=True, editable=False)



    # Scope to a specific provider configuration within a tenant

    provider_configuration = models.ForeignKey(

        LighthouseProviderConfiguration,

        on_delete=models.CASCADE,

        related_name="available_models",

    )

    model_id = models.CharField(max_length=100)



    # Human-friendly model name

    model_name = models.CharField(max_length=100)



    # Model-specific default parameters (e.g., temperature, max_tokens)

    default_parameters = models.JSONField(default=dict, blank=True)



    def __str__(self):

        return f"{self.provider_configuration.provider_type}:{self.model_id} ({self.tenant_id})"



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "lighthouse_provider_models"

        constraints = [

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

            models.UniqueConstraint(

                fields=["tenant_id", "provider_configuration", "model_id"],

                name="unique_provider_model_per_configuration",

            ),

        ]

        indexes = [

            models.Index(

                fields=["tenant_id", "provider_configuration"],

                name="lh_prov_models_cfg_idx",

            ),

        ]



    class JSONAPIMeta:

        resource_name = "lighthouse-models"





class ThreatScoreSnapshot(RowLevelSecurityProtectedModel):

    """

    Stores historical ThreatScore metrics for a given scan.

    Snapshots are created automatically after each ThreatScore report generation.

    """



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)



    scan = models.ForeignKey(

        Scan,

        on_delete=models.CASCADE,

        related_name="threatscore_snapshots",

        related_query_name="threatscore_snapshot",

    )



    provider = models.ForeignKey(

        Provider,

        on_delete=models.CASCADE,

        related_name="threatscore_snapshots",

        related_query_name="threatscore_snapshot",

    )



    compliance_id = models.CharField(

        max_length=100,

        blank=False,

        null=False,

        help_text="Compliance framework ID (e.g., 'prowler_threatscore_aws')",

    )



    # Overall ThreatScore metrics

    overall_score = models.DecimalField(

        max_digits=5,

        decimal_places=2,

        help_text="Overall ThreatScore percentage (0-100)",

    )



    # Score improvement/degradation compared to previous snapshot

    score_delta = models.DecimalField(

        max_digits=5,

        decimal_places=2,

        null=True,

        blank=True,

        help_text="Score change compared to previous snapshot (positive = improvement)",

    )



    # Section breakdown stored as JSON

    # Format: {"1. IAM": 85.5, "2. Attack Surface": 92.3, ...}

    section_scores = models.JSONField(

        default=dict,

        blank=True,

        help_text="ThreatScore breakdown by section",

    )



    # Critical requirements metadata stored as JSON

    # Format: [{"requirement_id": "...", "risk_level": 5, "weight": 150, ...}, ...]

    critical_requirements = models.JSONField(

        default=list,

        blank=True,

        help_text="List of critical failed requirements (risk >= 4)",

    )



    # Summary statistics

    total_requirements = models.IntegerField(

        default=0,

        help_text="Total number of requirements evaluated",

    )



    passed_requirements = models.IntegerField(

        default=0,

        help_text="Number of requirements with PASS status",

    )



    failed_requirements = models.IntegerField(

        default=0,

        help_text="Number of requirements with FAIL status",

    )



    manual_requirements = models.IntegerField(

        default=0,

        help_text="Number of requirements with MANUAL status",

    )



    total_findings = models.IntegerField(

        default=0,

        help_text="Total number of findings across all requirements",

    )



    passed_findings = models.IntegerField(

        default=0,

        help_text="Number of findings with PASS status",

    )



    failed_findings = models.IntegerField(

        default=0,

        help_text="Number of findings with FAIL status",

    )



    def __str__(self):

        return f"ThreatScore {self.overall_score}% for scan {self.scan_id} ({self.inserted_at})"



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "threatscore_snapshots"



        constraints = [

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



        indexes = [

            models.Index(

                fields=["tenant_id", "scan_id"],

                name="threatscore_snap_t_scan_idx",

            ),

            models.Index(

                fields=["tenant_id", "provider_id"],

                name="threatscore_snap_t_prov_idx",

            ),

            models.Index(

                fields=["tenant_id", "inserted_at"],

                name="threatscore_snap_t_time_idx",

            ),

        ]



    class JSONAPIMeta:

        resource_name = "threatscore-snapshots"





class AttackSurfaceOverview(RowLevelSecurityProtectedModel):

    """

    Pre-aggregated attack surface metrics per scan.



    Stores counts for each attack surface type (internet-exposed, secrets,

    privilege-escalation, ec2-imdsv1) to enable fast overview queries.

    """



    class AttackSurfaceTypeChoices(models.TextChoices):

        INTERNET_EXPOSED = "internet-exposed", _("Internet Exposed")

        SECRETS = "secrets", _("Exposed Secrets")

        PRIVILEGE_ESCALATION = "privilege-escalation", _("Privilege Escalation")

        EC2_IMDSV1 = "ec2-imdsv1", _("EC2 IMDSv1 Enabled")



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)



    scan = models.ForeignKey(

        Scan,

        on_delete=models.CASCADE,

        related_name="attack_surface_overviews",

        related_query_name="attack_surface_overview",

    )



    attack_surface_type = models.CharField(

        max_length=50,

        choices=AttackSurfaceTypeChoices.choices,

    )



    # Finding counts

    total_findings = models.IntegerField(default=0)  # All findings (PASS + FAIL)

    failed_findings = models.IntegerField(default=0)  # Non-muted failed findings

    muted_failed_findings = models.IntegerField(default=0)  # Muted failed findings



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "attack_surface_overviews"



        constraints = [

            models.UniqueConstraint(

                fields=("tenant_id", "scan_id", "attack_surface_type"),

                name="unique_attack_surface_per_scan",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



        indexes = [

            models.Index(

                fields=["tenant_id", "scan_id"],

                name="attack_surf_tenant_scan_idx",

            ),

        ]



    class JSONAPIMeta:

        resource_name = "attack-surface-overviews"





class ProviderComplianceScore(RowLevelSecurityProtectedModel):

    """

    Compliance requirement status from latest completed scan per provider.



    Used for efficient compliance watchlist queries with FAIL-dominant aggregation

    across multiple providers. Updated via atomic upsert after each scan completion.

    """



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)



    scan = models.ForeignKey(

        Scan,

        on_delete=models.CASCADE,

        related_name="compliance_scores",

        related_query_name="compliance_score",

    )



    provider = models.ForeignKey(

        Provider,

        on_delete=models.CASCADE,

        related_name="compliance_scores",

        related_query_name="compliance_score",

    )



    compliance_id = models.TextField()

    requirement_id = models.TextField()

    requirement_status = StatusEnumField(choices=StatusChoices)



    scan_completed_at = models.DateTimeField()



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "provider_compliance_scores"



        constraints = [

            models.UniqueConstraint(

                fields=("tenant_id", "provider_id", "compliance_id", "requirement_id"),

                name="unique_provider_compliance_req",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



        indexes = [

            models.Index(

                fields=["tenant_id", "provider_id", "compliance_id"],

                name="pcs_tenant_prov_comp_idx",

            ),

        ]





class TenantComplianceSummary(RowLevelSecurityProtectedModel):

    """

    Pre-aggregated compliance counts per tenant with FAIL-dominant logic applied.



    One row per (tenant, compliance_id). Used for fast watchlist queries when

    no provider filter is applied. Recalculated after each scan by aggregating

    across all providers with FAIL-dominant logic at requirement level.

    """



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)



    compliance_id = models.TextField()



    requirements_passed = models.IntegerField(default=0)

    requirements_failed = models.IntegerField(default=0)

    requirements_manual = models.IntegerField(default=0)

    total_requirements = models.IntegerField(default=0)



    updated_at = models.DateTimeField(auto_now=True)



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "tenant_compliance_summaries"



        constraints = [

            models.UniqueConstraint(

                fields=("tenant_id", "compliance_id"),

                name="unique_tenant_compliance_summary",

            ),

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]





class AIAssessment(RowLevelSecurityProtectedModel):

    """

    Structured reasoning output from Claude for a Prowler finding.

    Stored with tenant isolation (RLS).

    """



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    finding_id = models.UUIDField(db_index=True)

    summary = models.TextField()

    domain = models.CharField(max_length=50)

    exposure = models.CharField(max_length=50)

    root_cause = models.TextField()

    technical_impact = models.TextField()

    business_impact = models.TextField()

    attack_scenario = models.TextField()

    remediation = ArrayField(models.TextField(), default=list)

    verification = ArrayField(models.TextField(), default=list)

    unknowns = ArrayField(models.TextField(), default=list)

    rationale_summary = models.TextField()

    confidence = models.FloatField(default=0.5)

    model = models.CharField(max_length=50, default="claude")

    prompt_version = models.CharField(max_length=20, default="1.0.0")

    fingerprint = models.CharField(max_length=64, db_index=True)

    inserted_at = models.DateTimeField(auto_now_add=True)



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "ai_assessments"



        constraints = [

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



        indexes = [

            models.Index(

                fields=["tenant_id", "finding_id"],

                name="ai_assess_tenant_find_idx",

            ),

            models.Index(

                fields=["tenant_id", "fingerprint"],

                name="ai_assess_tenant_fp_idx",

            ),

        ]



    class JSONAPIMeta:

        resource_name = "ai-assessments"





class SecurityDecision(RowLevelSecurityProtectedModel):

    """

    Operational security decision derived from Risk Engine + Policy Engine + Claude.

    Stored with tenant isolation (RLS).

    """



    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)

    finding_id = models.UUIDField(db_index=True)

    assessment = models.ForeignKey(

        AIAssessment,

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name="decisions",

    )

    risk_score = models.IntegerField()

    risk_level = models.CharField(max_length=20)

    decision = models.CharField(max_length=50)

    priority = models.CharField(max_length=5)

    reason = models.TextField()

    recommended_owner = models.CharField(max_length=100, default="Security Team")

    sla_hours = models.IntegerField(default=72)

    human_review_status = models.CharField(max_length=20, default="PENDING")

    reviewed_by = models.CharField(max_length=100, null=True, blank=True)

    reviewed_at = models.DateTimeField(null=True, blank=True)

    remediation_status = models.CharField(max_length=50, default="PENDING")

    applied_policy_rules = ArrayField(models.CharField(max_length=100), default=list)

    jira_ticket_key = models.CharField(max_length=50, null=True, blank=True)

    jira_ticket_url = models.URLField(max_length=500, null=True, blank=True)

    inserted_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)



    class Meta(RowLevelSecurityProtectedModel.Meta):

        db_table = "security_decisions"



        constraints = [

            RowLevelSecurityConstraint(

                field="tenant_id",

                name="rls_on_%(class)s",

                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],

            ),

        ]



        indexes = [

            models.Index(

                fields=["tenant_id", "finding_id"],

                name="sec_dec_tenant_find_idx",

            ),

            models.Index(

                fields=["tenant_id", "priority", "human_review_status"],

                name="sec_dec_tenant_prio_rev_idx",

            ),

        ]



    class JSONAPIMeta:

        resource_name = "security-decisions"




# =============================================================================
# SECURITY PLATFORM EXTENSIONS
# Models below are specific to our platform (not in D:\prwler baseline).
# They add: managed service configuration, HITL review workflows,
# decision audit logs, and managed service user relationships.
# =============================================================================


class ServiceTypeChoices(models.TextChoices):
    SELF_MANAGED = "self_managed", _("Self Managed")
    MANAGED = "managed", _("Managed")


class ManagedServiceConfig(RowLevelSecurityProtectedModel):
    """Configuration for tenants operating as a managed security service provider.

    When a Tenant.service_type == "managed", this record stores the SLA,
    operator contact, and escalation policy for their managed customers.
    """

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    tenant = models.OneToOneField(
        "api.Tenant",
        on_delete=models.CASCADE,
        related_name="managed_service_config",
    )
    operator_name = models.CharField(max_length=200)
    operator_email = models.EmailField()
    sla_hours = models.IntegerField(
        default=24,
        help_text="Maximum hours to resolve a HITL review before escalation",
    )
    escalation_email = models.EmailField(blank=True, null=True)
    max_auto_approve_severity = models.CharField(
        max_length=20,
        choices=[("informational", "Informational"), ("low", "Low"), ("medium", "Medium")],
        default="low",
        help_text="Findings at or below this severity may be auto-approved without analyst review",
    )
    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)
    updated_at = models.DateTimeField(auto_now=True, editable=False)

    class Meta(RowLevelSecurityProtectedModel.Meta):
        db_table = "managed_service_configs"
        constraints = [
            RowLevelSecurityConstraint(
                field="tenant_id",
                name="rls_on_%(class)s",
                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],
            ),
        ]

    class JSONAPIMeta:
        resource_name = "managed-service-configs"


class HITLReviewQueue(RowLevelSecurityProtectedModel):
    """Human-in-the-loop review queue for security findings.

    When a scan produces a finding that requires human review (e.g. FAIL with
    high severity, or a finding in a managed tenant context), a HITLReviewQueue
    record is created and assigned to an analyst.
    """

    class StatusChoices(models.TextChoices):
        PENDING = "pending", _("Pending")
        IN_REVIEW = "in_review", _("In Review")
        APPROVED = "approved", _("Approved")
        REJECTED = "rejected", _("Rejected")
        ESCALATED = "escalated", _("Escalated")
        EXPIRED = "expired", _("Expired")

    class ReviewModeChoices(models.TextChoices):
        STANDARD = "standard", _("Standard  -  analyst decides")
        MANAGED = "managed", _("Managed  -  managed service SLA applies")
        AUTOMATED = "automated", _("Automated  -  system auto-approves below threshold")

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    finding = models.ForeignKey(
        Finding,
        on_delete=models.CASCADE,
        related_name="hitl_reviews",
    )
    scan = models.ForeignKey(
        Scan,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hitl_reviews",
    )
    status = models.CharField(
        max_length=20,
        choices=StatusChoices.choices,
        default=StatusChoices.PENDING,
        db_index=True,
    )
    review_mode = models.CharField(
        max_length=20,
        choices=ReviewModeChoices.choices,
        default=ReviewModeChoices.STANDARD,
    )
    assigned_analyst = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_reviews",
    )
    escalated_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="escalated_reviews",
    )
    due_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="SLA deadline  -  auto-escalates when crossed in managed mode",
    )
    notes = models.TextField(blank=True, null=True)
    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)
    updated_at = models.DateTimeField(auto_now=True, editable=False)

    class Meta(RowLevelSecurityProtectedModel.Meta):
        db_table = "hitl_review_queue"
        indexes = [
            models.Index(fields=["tenant_id", "status"], name="hitl_tenant_status_idx"),
            models.Index(fields=["tenant_id", "due_at"], name="hitl_tenant_due_idx"),
        ]
        constraints = [
            RowLevelSecurityConstraint(
                field="tenant_id",
                name="rls_on_%(class)s",
                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],
            ),
        ]

    class JSONAPIMeta:
        resource_name = "hitl-review-queue"


class ReviewDecision(RowLevelSecurityProtectedModel):
    """Record of an analyst decision on a HITL review item."""

    class DecisionChoices(models.TextChoices):
        APPROVE = "approve", _("Approve  -  finding accepted as-is")
        REJECT = "reject", _("Reject  -  finding disputed or false positive")
        ESCALATE = "escalate", _("Escalate  -  needs senior review")
        REQUEST_INFO = "request_info", _("Request Info  -  needs more context")
        MUTE = "mute", _("Mute  -  suppress this finding class")

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    review = models.ForeignKey(
        HITLReviewQueue,
        on_delete=models.CASCADE,
        related_name="decisions",
    )
    analyst = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="review_decisions",
    )
    decision = models.CharField(
        max_length=20,
        choices=DecisionChoices.choices,
    )
    rationale = models.TextField(blank=True, null=True)
    internal_notes = models.TextField(
        blank=True,
        null=True,
        help_text="Internal notes visible only to the managed service team",
    )
    evidence_links = models.JSONField(
        default=list,
        blank=True,
        help_text="List of URLs or ticket references supporting this decision",
    )
    previous_status = models.CharField(max_length=20, blank=True, null=True)
    new_status = models.CharField(max_length=20, blank=True, null=True)
    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    class Meta(RowLevelSecurityProtectedModel.Meta):
        db_table = "review_decisions"
        indexes = [
            models.Index(fields=["tenant_id", "inserted_at"], name="review_dec_tenant_time_idx"),
        ]
        constraints = [
            RowLevelSecurityConstraint(
                field="tenant_id",
                name="rls_on_%(class)s",
                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],
            ),
        ]

    class JSONAPIMeta:
        resource_name = "review-decisions"


class DecisionLog(models.Model):
    """Immutable global audit trail for all review decisions.

    Unlike ReviewDecision (tenant-scoped), DecisionLog is NOT RLS-protected  - 
    it is an append-only record for compliance auditing across all tenants.
    Only platform admins (is_staff=True) can read it via Django Admin.
    """

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    tenant_id = models.UUIDField(db_index=True)
    review_id = models.UUIDField(db_index=True)
    finding_check_id = models.CharField(max_length=200, blank=True, null=True)
    analyst_id = models.UUIDField(null=True, blank=True)
    analyst_email = models.EmailField(blank=True, null=True)
    decision = models.CharField(max_length=20)
    previous_status = models.CharField(max_length=20, blank=True, null=True)
    new_status = models.CharField(max_length=20, blank=True, null=True)
    rationale_summary = models.TextField(blank=True, null=True)
    provider_type = models.CharField(max_length=50, blank=True, null=True)
    severity = models.CharField(max_length=20, blank=True, null=True)
    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    class Meta:
        db_table = "decision_log"
        # Append-only  -  no UPDATE or DELETE policies
        indexes = [
            models.Index(fields=["tenant_id", "inserted_at"], name="dec_log_tenant_time_idx"),
            models.Index(fields=["tenant_id", "review_id"], name="dec_log_tenant_review_idx"),
        ]
        ordering = ["-inserted_at"]

    def __str__(self):
        return f"DecisionLog[{self.decision}] tenant={self.tenant_id} review={self.review_id}"



class TenantLLMConfig(RowLevelSecurityProtectedModel):
    """
    Configuration for LLM providers (vLLM hosted on Azure VM, Azure OpenAI, Anthropic Claude).
    Allows setting the endpoint URL, model name (e.g. qwen-3.5-9b), API key, and generation hyperparameters.
    """
    class ProviderType(models.TextChoices):
        VLLM_AZURE = "vllm_azure", _("vLLM (Azure VM)")
        AZURE_OPENAI = "azure_openai", _("Azure OpenAI")
        ANTHROPIC_CLAUDE = "anthropic_claude", _("Anthropic Claude")
        OLLAMA = "ollama", _("Ollama / Local")

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    tenant = models.ForeignKey("Tenant", on_delete=models.CASCADE, related_name="llm_configs")
    name = models.CharField(max_length=150, default="Primary Azure vLLM (Qwen)")
    provider_type = models.CharField(
        max_length=50,
        choices=ProviderType.choices,
        default=ProviderType.VLLM_AZURE,
    )
    base_url = models.CharField(
        max_length=500,
        default="http://localhost:8000/v1",
        help_text="vLLM OpenAI-compatible endpoint URL (e.g., http://<azure-vm-ip>:8000/v1)",
    )
    model_name = models.CharField(
        max_length=200,
        default="qwen-3.5-9b",
        help_text="Model identifier served by vLLM (e.g., qwen-3.5-9b, Qwen/Qwen2.5-7B-Instruct)",
    )
    api_key = models.CharField(max_length=500, blank=True, default="EMPTY")
    temperature = models.DecimalField(max_digits=3, decimal_places=2, default=Decimal("0.10"))
    max_tokens = models.IntegerField(default=4096)
    is_active = models.BooleanField(default=True)
    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tenant_llm_configs"
        ordering = ["-inserted_at"]

    def __str__(self):
        return f"{self.name} ({self.provider_type}: {self.model_name})"


class FindingAIAnalysis(RowLevelSecurityProtectedModel):
    """
    Cached AI CISO reasoning and root cause analysis for a security finding.
    Generated by Qwen hosted on Azure VM via vLLM to provide deep contextual understanding.
    """
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    tenant = models.ForeignKey("Tenant", on_delete=models.CASCADE, related_name="ai_analyses")
    finding_id = models.UUIDField(db_index=True)
    finding_hash = models.CharField(max_length=64, db_index=True)
    check_id = models.CharField(max_length=200, blank=True, null=True)
    resource_uid = models.CharField(max_length=500, blank=True, null=True)
    
    # Structured CISO Insights
    summary = models.TextField()
    domain = models.CharField(max_length=100, default="General Security")
    exposure = models.CharField(max_length=50, default="Internal")
    root_cause = models.TextField()
    technical_impact = models.TextField()
    business_impact = models.TextField()
    attack_scenario = models.TextField()
    
    remediation_steps = models.JSONField(default=list)
    verification_steps = models.JSONField(default=list)
    unknowns = models.JSONField(default=list)
    confidence = models.FloatField(default=0.90)
    model_name = models.CharField(max_length=200, default="qwen-3.5-9b")
    
    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "finding_ai_analyses"
        indexes = [
            models.Index(fields=["tenant", "finding_hash"], name="ai_analysis_hash_idx"),
            models.Index(fields=["tenant", "finding_id"], name="ai_analysis_finding_idx"),
        ]
        ordering = ["-inserted_at"]

    def __str__(self):
        return f"AIAnalysis[{self.check_id}] tenant={self.tenant_id}"


class RemediationPlaybook(RowLevelSecurityProtectedModel):
    """
    Actionable remediation script auto-generated by the Digital CISO (Terraform, AWS CLI, Azure CLI, Ansible, Python).
    """
    class ScriptType(models.TextChoices):
        TERRAFORM = "terraform", _("Terraform HCL")
        AWS_CLI = "aws_cli", _("AWS CLI Script")
        AZURE_CLI = "azure_cli", _("Azure CLI Script")
        GCLOUD_CLI = "gcloud_cli", _("Google Cloud CLI")
        POWERSHELL = "powershell", _("PowerShell Script")
        PYTHON = "python", _("Python Boto3 / Azure SDK")
        ANSIBLE = "ansible", _("Ansible Playbook")

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    tenant = models.ForeignKey("Tenant", on_delete=models.CASCADE, related_name="remediation_playbooks")
    finding_id = models.UUIDField(db_index=True)
    title = models.CharField(max_length=255)
    script_type = models.CharField(
        max_length=50,
        choices=ScriptType.choices,
        default=ScriptType.TERRAFORM,
    )
    code_snippet = models.TextField()
    rollback_snippet = models.TextField(blank=True, null=True)
    estimated_downtime_minutes = models.IntegerField(default=0)
    class ApprovalStatus(models.TextChoices):
        PENDING_APPROVAL = "pending_approval", _("Pending Human Approval")
        APPROVED = "approved", _("Approved by Admin")
        REJECTED = "rejected", _("Rejected by Admin")
        EXECUTING = "executing", _("Executing")
        EXECUTED_SUCCESS = "executed_success", _("Executed Successfully")
        EXECUTED_FAILED = "executed_failed", _("Execution Failed")

    approval_status = models.CharField(
        max_length=50,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.PENDING_APPROVAL,
    )
    approved_by = models.ForeignKey("User", on_delete=models.SET_NULL, null=True, blank=True, related_name="approved_playbooks")
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, null=True)
    execution_output = models.TextField(blank=True, null=True)
    executed_at = models.DateTimeField(null=True, blank=True)
    executed_by = models.ForeignKey("User", on_delete=models.SET_NULL, null=True, blank=True, related_name="executed_playbooks")

    requires_maintenance_window = models.BooleanField(default=False)
    is_automated = models.BooleanField(default=False)
    
    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "remediation_playbooks"
        ordering = ["-inserted_at"]

    def __str__(self):
        return f"Playbook[{self.script_type}]: {self.title}"


class CISOAdvisorConversation(RowLevelSecurityProtectedModel):
    """
    Interactive Digital CISO conversation log grounded in real tenant findings.
    """
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    tenant = models.ForeignKey("Tenant", on_delete=models.CASCADE, related_name="ciso_conversations")
    user = models.ForeignKey("User", on_delete=models.SET_NULL, null=True, blank=True)
    
    question = models.TextField()
    answer = models.TextField()
    referenced_findings = models.JSONField(default=list)
    confidence = models.FloatField(default=1.0)
    model_name = models.CharField(max_length=200, default="qwen-3.5-9b")
    
    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)

    class Meta:
        db_table = "ciso_advisor_conversations"
        ordering = ["-inserted_at"]

    def __str__(self):
        return f"CISOConversation tenant={self.tenant_id} q={self.question[:30]}..."


# =============================================================================
# JIRA REMEDIATION ORCHESTRATION MODELS
# =============================================================================

class RemediationExecution(RowLevelSecurityProtectedModel):
    """
    Execution and task tracking record for AI-generated remediations dispatched to Jira Cloud.
    Maintains full lifecycle timeline from approval to resolution.
    """
    class ExecutionStatus(models.TextChoices):
        PENDING = "PENDING", _("Pending Ticket Creation")
        IN_PROGRESS = "IN_PROGRESS", _("In Progress (Jira Active)")
        COMPLETED = "COMPLETED", _("Completed (Jira Resolved)")
        FAILED = "FAILED", _("Failed")

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    tenant = models.ForeignKey("Tenant", on_delete=models.CASCADE, related_name="remediation_executions")
    finding_id = models.UUIDField(db_index=True, null=True, blank=True)
    decision = models.ForeignKey(
        "SecurityDecision",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="remediation_executions",
    )
    playbook = models.ForeignKey(
        "RemediationPlaybook",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="remediation_executions",
    )
    
    # Jira Details
    issue_key = models.CharField(max_length=50, db_index=True)
    issue_url = models.URLField(max_length=500, blank=True, null=True)
    issue_id = models.CharField(max_length=50, blank=True, null=True)
    project_key = models.CharField(max_length=50)
    summary = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    
    # Status & Progress
    status = models.CharField(
        max_length=50,
        choices=ExecutionStatus.choices,
        default=ExecutionStatus.PENDING,
        db_index=True,
    )
    jira_status = models.CharField(max_length=100, default="To Do")
    jira_status_category = models.CharField(max_length=50, default="new")
    priority = models.CharField(max_length=50, default="Medium")
    
    # Assignee
    assignee_name = models.CharField(max_length=200, blank=True, null=True)
    assignee_email = models.CharField(max_length=200, blank=True, null=True)
    assignee_account_id = models.CharField(max_length=200, blank=True, null=True)
    
    # Payload & Audit
    labels = models.JSONField(default=list, blank=True)
    ai_payload = models.JSONField(default=dict, blank=True)
    timeline = models.JSONField(default=list, blank=True)
    error_message = models.TextField(blank=True, null=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    
    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(RowLevelSecurityProtectedModel.Meta):
        db_table = "remediation_executions"
        indexes = [
            models.Index(fields=["tenant_id", "status"], name="remed_exec_tenant_status_idx"),
            models.Index(fields=["tenant_id", "issue_key"], name="remed_exec_tenant_key_idx"),
            models.Index(fields=["tenant_id", "finding_id"], name="remed_exec_tenant_find_idx"),
        ]
        constraints = [
            RowLevelSecurityConstraint(
                field="tenant_id",
                name="rls_on_%(class)s",
                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],
            ),
        ]
        ordering = ["-inserted_at"]

    class JSONAPIMeta:
        resource_name = "remediation-executions"

    def __str__(self):
        return f"RemediationExecution[{self.issue_key}]: {self.summary[:40]} ({self.status})"


class JiraProjectMapping(RowLevelSecurityProtectedModel):
    """
    Per-tenant Jira project defaults and pre-configured mapping for rapid ticket creation.
    """
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    tenant = models.ForeignKey("Tenant", on_delete=models.CASCADE, related_name="jira_project_mappings")
    project_key = models.CharField(max_length=50)
    project_name = models.CharField(max_length=200)
    default_issue_type = models.CharField(max_length=100, default="Task")
    default_priority = models.CharField(max_length=50, default="Medium")
    default_assignee_account_id = models.CharField(max_length=200, blank=True, null=True)
    default_assignee_name = models.CharField(max_length=200, blank=True, null=True)
    default_labels = models.JSONField(default=list, blank=True)
    
    inserted_at = models.DateTimeField(auto_now_add=True, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(RowLevelSecurityProtectedModel.Meta):
        db_table = "jira_project_mappings"
        unique_together = ("tenant", "project_key")
        constraints = [
            RowLevelSecurityConstraint(
                field="tenant_id",
                name="rls_on_%(class)s",
                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],
            ),
        ]

    class JSONAPIMeta:
        resource_name = "jira-project-mappings"


class JiraAssigneeCache(RowLevelSecurityProtectedModel):
    """
    Cached Jira assignable users for fast responsive search in the remediation UI.
    """
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    tenant = models.ForeignKey("Tenant", on_delete=models.CASCADE, related_name="jira_assignees_cache")
    project_key = models.CharField(max_length=50, db_index=True)
    account_id = models.CharField(max_length=200, db_index=True)
    display_name = models.CharField(max_length=200)
    email_address = models.CharField(max_length=200, blank=True, null=True)
    avatar_url = models.URLField(max_length=500, blank=True, null=True)
    active = models.BooleanField(default=True)
    last_synced_at = models.DateTimeField(auto_now=True)

    class Meta(RowLevelSecurityProtectedModel.Meta):
        db_table = "jira_assignees_cache"
        unique_together = ("tenant", "project_key", "account_id")
        constraints = [
            RowLevelSecurityConstraint(
                field="tenant_id",
                name="rls_on_%(class)s",
                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],
            ),
        ]

    class JSONAPIMeta:
        resource_name = "jira-assignees-cache"