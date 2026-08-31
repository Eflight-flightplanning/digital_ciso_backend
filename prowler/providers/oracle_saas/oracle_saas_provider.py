
from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from typing import Optional

from prowler.lib.logger import logger
from prowler.providers.common.models import Audit_Metadata, Connection
from prowler.providers.common.provider import Provider
from prowler.providers.oracle_saas.models import (
    OracleSaasIdentityInfo,
    OracleSaasSession,
)


class OracleSaasProvider(Provider):
    _type: str = "oracle_saas"
    _session: OracleSaasSession
    _identity: OracleSaasIdentityInfo
    _audit_config: dict
    _fixer_config: dict
    audit_metadata: Audit_Metadata

    def __init__(
        self,
        auth_type: str = "basic",
        username: str = "",
        password: str = "",
        domain_url: str = "",
        client_id: str = "",
        client_secret: str = "",
        erp_base_url: str = "",
        erp_type: str = "FUSION_ERP",
        config_path: str = None,
        config_content: dict = None,
        fixer_config: dict = {},
        mutelist_path: str = None,
        mutelist_content: dict = None,
    ):
        """Initialize the Oracle SaaS Provider."""
        logger.info("Instantiating Oracle SaaS Provider...")

        OracleSaasProvider._validate_arguments(
            auth_type=auth_type,
            username=username,
            password=password,
            domain_url=domain_url,
            client_id=client_id,
            client_secret=client_secret,
            erp_base_url=erp_base_url,
        )

        self._session = OracleSaasProvider._setup_session(
            auth_type=auth_type,
            username=username,
            password=password,
            domain_url=domain_url,
            client_id=client_id,
            client_secret=client_secret,
            erp_base_url=erp_base_url,
            erp_type=erp_type,
        )

        self._identity = OracleSaasProvider._setup_identity(self._session)
        self._audit_config = {}
        self._fixer_config = fixer_config

        # Set as active global provider instance
        Provider.set_global_provider(self)

        # Load config file if provided
        if config_content:
            self._audit_config = config_content
        elif config_path:
            try:
                import yaml
                with open(config_path) as f:
                    self._audit_config = yaml.safe_load(f) or {}
            except Exception as e:
                logger.warning(f"Oracle SaaS: Could not load config file: {e}")

        super().__init__()

    # ── Properties ───────────────────────────────────────────────────────────

    @property
    def type(self) -> str:
        return self._type

    @property
    def session(self) -> OracleSaasSession:
        return self._session

    @property
    def domain_url(self) -> str:
        return getattr(self._session, "domain_url", "") or getattr(self._session, "erp_base_url", "")

    @property
    def erp_base_url(self) -> str:
        return getattr(self._session, "erp_base_url", "") or getattr(self._session, "domain_url", "")

    @property
    def identity(self) -> OracleSaasIdentityInfo:
        return self._identity

    @property
    def audit_config(self) -> dict:
        return self._audit_config

    @property
    def fixer_config(self) -> dict:
        return self._fixer_config

    # ── Validation ───────────────────────────────────────────────────────────

    @staticmethod
    def _validate_arguments(
        auth_type: str = "basic",
        username: str = "",
        password: str = "",
        domain_url: str = "",
        client_id: str = "",
        client_secret: str = "",
        erp_base_url: str = "",
    ) -> None:
        """Validate required Oracle SaaS credentials."""
        if not erp_base_url:
            raise ValueError(
                "Oracle SaaS: 'erp_base_url' is required. "
                "Format: https://fa-xxxx.fa.ocs.oraclecloud.com"
            )

        if auth_type == "basic":
            if not username:
                raise ValueError("Oracle SaaS: 'username' is required for Basic Auth.")
            if not password:
                raise ValueError("Oracle SaaS: 'password' is required for Basic Auth.")
        else:
            if not domain_url:
                raise ValueError(
                    "Oracle SaaS: 'domain_url' is required for OAuth2. "
                    "Format: https://idcs-xxxx.identity.oraclecloud.com"
                )
            if not client_id:
                raise ValueError("Oracle SaaS: 'client_id' is required for OAuth2.")
            if not client_secret:
                raise ValueError("Oracle SaaS: 'client_secret' is required for OAuth2.")

    # ── Session Setup ─────────────────────────────────────────────────────────

    @staticmethod
    def _setup_session(
        auth_type: str = "basic",
        username: str = "",
        password: str = "",
        domain_url: str = "",
        client_id: str = "",
        client_secret: str = "",
        erp_base_url: str = "",
        erp_type: str = "FUSION_ERP",
    ) -> OracleSaasSession:
        """Set up session for Basic Auth or OAuth 2.0."""
        import base64
        import ssl

        if auth_type == "basic":
            logger.info("Oracle SaaS: Configuring Basic Authentication for user '%s' against pod '%s'", username, erp_base_url)
            return OracleSaasSession(
                auth_type="basic",
                username=username,
                password=password,
                erp_base_url=erp_base_url,
                erp_type=erp_type,
                domain_url=domain_url or erp_base_url,
                client_id=client_id or username,
                client_secret=client_secret or password,
                access_token="",
            )

        logger.info("Oracle SaaS: Acquiring OAuth 2.0 access token...")
        token_url = f"{domain_url.rstrip('/')}/oauth2/v1/token"
        data = urllib.parse.urlencode({
            "grant_type": "client_credentials",
            "scope": "urn:opc:idm:__myscopes__",
        }).encode("utf-8")

        credentials = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()

        req = urllib.request.Request(
            token_url,
            data=data,
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
            },
            method="POST",
        )

        access_token = ""
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310
                token_data = json.loads(resp.read())
                access_token = token_data.get("access_token", "")
                logger.info("Oracle SaaS: OAuth token acquired successfully.")
        except Exception as e:
            logger.warning(
                f"Oracle SaaS: Could not acquire access token: {e}. "
                "Proceeding without live token (offline/test mode)."
            )

        return OracleSaasSession(
            auth_type="oauth2",
            domain_url=domain_url,
            client_id=client_id,
            client_secret=client_secret,
            erp_base_url=erp_base_url,
            erp_type=erp_type,
            access_token=access_token,
        )

    @staticmethod
    def _setup_identity(session: OracleSaasSession) -> OracleSaasIdentityInfo:
        """Resolve tenant identity from the Oracle Identity Domain or Pod URL."""
        match = re.search(r"//([^.]+)\.", session.erp_base_url or session.domain_url)
        tenant_id = match.group(1) if match else (session.username or session.client_id[:16])

        erp_type_labels = {
            "FUSION_ERP": "Oracle Fusion Cloud ERP",
            "FUSION_HCM": "Oracle Fusion Cloud HCM",
            "NETSUITE": "Oracle NetSuite ERP",
            "ORACLE_SCM": "Oracle Fusion Cloud SCM",
        }
        display_name = erp_type_labels.get(session.erp_type, "Oracle SaaS")

        logger.info(f"Oracle SaaS identity: tenant={tenant_id}, type={session.erp_type}")

        return OracleSaasIdentityInfo(
            auth_type=session.auth_type,
            username=session.username,
            password=session.password,
            tenant_id=tenant_id,
            erp_base_url=session.erp_base_url,
            erp_type=session.erp_type,
            display_name=display_name,
        )

    # ── Connection Test ───────────────────────────────────────────────────────

    @staticmethod
    def test_connection(
        auth_type: str = "basic",
        username: str = "",
        password: str = "",
        domain_url: str = "",
        client_id: str = "",
        client_secret: str = "",
        erp_base_url: str = "",
        erp_type: str = "FUSION_ERP",
    ) -> Connection:
        """Test live connectivity to Oracle SaaS."""
        import base64
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        if auth_type == "basic":
            test_url = f"{erp_base_url.rstrip('/')}/hcmRestApi/resources/11.13.18.05/userAccounts?limit=1"
            auth_header = "Basic " + base64.b64encode(f"{username}:{password}".encode()).decode()
            req = urllib.request.Request(test_url, headers={
                "Authorization": auth_header,
                "Accept": "application/json",
            })
            try:
                with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
                    if resp.status == 200:
                        return Connection(is_connected=True)
            except Exception as e:
                return Connection(is_connected=False, error=str(e))
            return Connection(is_connected=False, error="Connection test returned non-200 status")

        # OAuth 2.0 flow
        try:
            OracleSaasProvider._validate_arguments(
                auth_type="oauth2",
                domain_url=domain_url,
                client_id=client_id,
                client_secret=client_secret,
                erp_base_url=erp_base_url,
            )
            session = OracleSaasProvider._setup_session(
                auth_type="oauth2",
                domain_url=domain_url,
                client_id=client_id,
                client_secret=client_secret,
                erp_base_url=erp_base_url,
                erp_type=erp_type,
            )
            connected = bool(session.access_token)
            return Connection(
                is_connected=connected,
                error=None if connected else Exception(
                    "Oracle SaaS: Failed to acquire access token. "
                    "Check Client ID, Client Secret and Domain URL."
                ),
            )
        except Exception as error:
            logger.error(f"Oracle SaaS test_connection failed: {error}")
            return Connection(is_connected=False, error=error)

    # ── API Helpers ───────────────────────────────────────────────────────────

    def get_json(self, url: str) -> dict:
        """Perform an authenticated GET request to an Oracle SaaS REST API.

        Supports Basic Auth and OAuth 2.0 with fast in-memory caching.
        Returns parsed JSON dict or empty dict on failure.
        """
        data, _ok = self.get_json_with_status(url)
        return data

    def get_json_with_status(self, url: str) -> tuple[dict, bool]:
        """Same as `get_json`, but also reports whether the call actually succeeded.

        Checks that rely on data only obtainable from a specific endpoint (e.g. IDCS
        SCIM APIs, which are unreachable when a provider only has Basic Auth
        credentials against the Fusion ERP REST API) need this distinction: an empty
        `{}` from a failed/unauthenticated call is not the same fact as a real API
        response that legitimately contains no resources, and treating them the same
        produces a confidently wrong PASS or FAIL instead of an honest "can't tell".
        """
        if not hasattr(self, "_api_cache"):
            self._api_cache = {}
        if not hasattr(self, "_api_cache_ok"):
            self._api_cache_ok = {}

        if url in self._api_cache:
            return self._api_cache[url], self._api_cache_ok.get(url, True)

        import base64
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

        if self._session.auth_type == "basic":
            creds = base64.b64encode(f"{self._session.username}:{self._session.password}".encode()).decode()
            headers["Authorization"] = f"Basic {creds}"
        elif self._session.access_token:
            headers["Authorization"] = f"Bearer {self._session.access_token}"
        else:
            logger.warning(f"Oracle SaaS: No active credentials — skipping GET {url}")
            self._api_cache[url] = {}
            self._api_cache_ok[url] = False
            return {}, False

        import urllib.parse
        clean_url = urllib.parse.quote(url, safe=":/?&=#+%,@")
        req = urllib.request.Request(clean_url, headers=headers)
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                self._api_cache[url] = data
                self._api_cache_ok[url] = True
                return data, True
        except Exception as e:
            logger.warning(f"Oracle SaaS GET {url} failed: {e}")
            self._api_cache[url] = {}
            self._api_cache_ok[url] = False
            return {}, False

    def get_idcs_url(self, path: str) -> str:
        """Build a full Oracle Identity Domain API URL."""
        return f"{self._session.domain_url.rstrip('/')}/{path.lstrip('/')}"

    def get_erp_url(self, path: str) -> str:
        """Build a full Oracle Fusion ERP REST API URL."""
        return f"{self._session.erp_base_url.rstrip('/')}/{path.lstrip('/')}"

    def get_html_assessment_summary(self) -> str:
        """Return HTML assessment summary for Oracle SaaS reports."""
        tenant = getattr(self.identity, "tenant_id", "Oracle SaaS")
        erp_type = getattr(self.session, "erp_type", "FUSION_ERP")
        pod_url = getattr(self, "erp_base_url", "")
        return f"""
            <div class="col-md-3">
                <div class="card">
                    <div class="card-header">Oracle SaaS Assessment Summary</div>
                    <ul class="list-group list-group-flush">
                        <li class="list-group-item"><b>Tenant:</b> {tenant}</li>
                        <li class="list-group-item"><b>Type:</b> {erp_type}</li>
                        <li class="list-group-item"><b>Pod URL:</b> {pod_url}</li>
                    </ul>
                </div>
            </div>"""

    def get_finding_output_data(self, check_output) -> dict:
        """Return standardized output data dictionary for finding transformation."""
        res_name = (
            getattr(check_output, "resource_name", "")
            or getattr(check_output, "resource_id", "")
            or getattr(getattr(check_output, "resource", None), "name", "")
            or getattr(getattr(check_output, "resource", None), "username", "")
            or "oracle_saas_resource"
        )
        res_id = getattr(check_output, "resource_id", "") or f"oracle-saas://{self.identity.tenant_id}/{res_name}"
        return {
            "auth_method": self.session.auth_type.upper(),
            "account_uid": self.identity.tenant_id,
            "account_name": self.identity.display_name,
            "resource_name": res_name,
            "resource_uid": res_id,
            "region": "global",
        }

    # ── print_audit_credentials ───────────────────────────────────────────────

    def print_credentials(self) -> None:
        """Print redacted Oracle SaaS credentials for audit logging."""
        erp_type_labels = {
            "FUSION_ERP": "Oracle Fusion Cloud ERP",
            "FUSION_HCM": "Oracle Fusion Cloud HCM",
            "NETSUITE": "Oracle NetSuite ERP",
            "ORACLE_SCM": "Oracle Fusion Cloud SCM",
        }
        print(
            f"\nOracle SaaS Provider — {erp_type_labels.get(self._session.erp_type, 'ERP')}\n"
            f"  Identity Domain : {self._session.domain_url}\n"
            f"  Client ID       : {self._session.client_id[:8]}...\n"
            f"  ERP Base URL    : {self._session.erp_base_url}\n"
            f"  Tenant ID       : {self._identity.tenant_id}\n"
            f"  Token Acquired  : {'✓ Yes' if self._session.access_token else '✗ No (offline mode)'}\n"
        )
