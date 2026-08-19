from pydantic import BaseModel

from prowler.config.config import output_file_timestamp
from prowler.providers.common.models import ProviderOutputOptions


class OracleSaasSession(BaseModel):
    """Holds live Basic Auth or OAuth 2.0 session credentials for Oracle SaaS / ERP."""

    auth_type: str = "basic"
    username: str = ""
    password: str = ""
    domain_url: str = ""          # https://idcs-xxxx.identity.oraclecloud.com
    client_id: str = ""
    client_secret: str = ""
    erp_base_url: str = ""        # https://fa-xxxx.fa.ocs.oraclecloud.com
    erp_type: str = "FUSION_ERP"  # FUSION_ERP | FUSION_HCM | NETSUITE | ORACLE_SCM
    access_token: str = ""


class OracleSaasIdentityInfo(BaseModel):
    """Authenticated identity details for Oracle SaaS."""

    auth_type: str = "basic"
    username: str = ""
    password: str = ""
    tenant_id: str = "oracle-saas"  # Oracle Identity Domain / Tenant ID
    erp_base_url: str = ""
    erp_type: str = "FUSION_ERP"
    display_name: str = "Oracle SaaS Tenant"


class OracleSaasOutputOptions(ProviderOutputOptions):
    def __init__(self, arguments, bulk_checks_metadata, identity):
        super().__init__(arguments, bulk_checks_metadata)
        if (
            not hasattr(arguments, "output_filename")
            or arguments.output_filename is None
        ):
            tenant = getattr(identity, "tenant_id", "oracle-saas")
            self.output_filename = (
                f"prowler-output-{tenant}-{output_file_timestamp}"
            )
        else:
            self.output_filename = arguments.output_filename
