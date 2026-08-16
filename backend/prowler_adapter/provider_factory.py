"""
Prowler Adapter — Provider Factory

THIS IS THE ONLY FILE (alongside _impl.py) ALLOWED TO IMPORT FROM prowler.*

Builds a Prowler provider object from a provider_type string and a credentials
dictionary.  The credentials dict uses the same keys that the platform's
ProviderSecret model stores (after decryption).

Supported providers and their credential keys:

    aws:          access_key_id, secret_access_key, [session_token], [role_arn]
    azure:        client_id, client_secret, tenant_id, [subscription_id]
    gcp:          service_account_json  (full JSON string)
    kubernetes:   kubeconfig            (full kubeconfig YAML string)
    github:       personal_access_token
    m365:         client_id, client_secret, tenant_id
"""
from __future__ import annotations

import json
import logging
import os
import tempfile

from .exceptions import ProwlerConnectionError

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def build_prowler_provider(
    provider_type: str,
    credentials: dict,
    account_id: str,
):
    """Instantiate and return the Prowler provider for the given cloud provider.

    Args:
        provider_type: One of 'aws', 'azure', 'gcp', 'kubernetes', 'github', 'm365', …
        credentials:   Decrypted credentials dict from ProviderSecret.
        account_id:    Cloud account / project / subscription identifier.

    Returns:
        A Prowler provider object (provider-specific Pydantic model).

    Raises:
        ProwlerConnectionError: If the provider cannot be instantiated.
    """
    builder = _BUILDERS.get(provider_type.lower())
    if builder is None:
        raise ProwlerConnectionError(
            provider_type,
            f"Unsupported provider type '{provider_type}'. "
            f"Supported: {sorted(_BUILDERS.keys())}",
        )
    try:
        return builder(credentials, account_id)
    except ProwlerConnectionError:
        raise
    except Exception as exc:
        raise ProwlerConnectionError(provider_type, str(exc)) from exc


# ---------------------------------------------------------------------------
# Per-provider builders
# ---------------------------------------------------------------------------

def _build_aws(credentials: dict, account_id: str):
    from prowler.providers.aws.aws_provider import AwsProvider

    return AwsProvider(
        aws_access_key_id=credentials.get("access_key_id") or os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=credentials.get("secret_access_key") or os.getenv("AWS_SECRET_ACCESS_KEY"),
        aws_session_token=credentials.get("session_token") or os.getenv("AWS_SESSION_TOKEN"),
        role_arn=credentials.get("role_arn"),
        audit_config={},
    )


def _build_azure(credentials: dict, account_id: str):
    from prowler.providers.azure.azure_provider import AzureProvider

    subscription_ids = [account_id] if account_id else None
    return AzureProvider(
        az_cli_auth=False,
        sp_env_auth=False,
        browser_auth=False,
        managed_entity_auth=False,
        tenant_id=credentials.get("tenant_id", ""),
        azure_subscription_ids=subscription_ids,
        # Inject credentials via environment so Prowler picks them up
        client_id=credentials.get("client_id", ""),
        client_secret=credentials.get("client_secret", ""),
    )


def _build_gcp(credentials: dict, account_id: str):
    from prowler.providers.gcp.gcp_provider import GcpProvider

    sa_json = credentials.get("service_account_json", "")
    if not sa_json:
        raise ProwlerConnectionError("gcp", "service_account_json is required")

    # Write to a temp file — Prowler expects a filesystem path
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, prefix="prowler_gcp_sa_"
    ) as f:
        if isinstance(sa_json, str):
            f.write(sa_json)
        else:
            json.dump(sa_json, f)
        sa_path = f.name

    try:
        return GcpProvider(
            credentials_file=sa_path,
            project_ids=[account_id] if account_id else None,
        )
    finally:
        try:
            os.unlink(sa_path)
        except OSError:
            pass


def _build_kubernetes(credentials: dict, account_id: str):
    from prowler.providers.kubernetes.kubernetes_provider import KubernetesProvider

    kubeconfig = credentials.get("kubeconfig", "")
    if not kubeconfig:
        # Try in-cluster service account
        return KubernetesProvider(kubeconfig_content=None)

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".yaml", delete=False, prefix="prowler_k8s_kube_"
    ) as f:
        f.write(kubeconfig)
        kubeconfig_path = f.name

    try:
        return KubernetesProvider(kubeconfig_file=kubeconfig_path)
    finally:
        try:
            os.unlink(kubeconfig_path)
        except OSError:
            pass


def _build_github(credentials: dict, account_id: str):
    from prowler.providers.github.github_provider import GithubProvider

    return GithubProvider(
        personal_access_token=credentials.get("personal_access_token", ""),
        github_org_name=account_id or "",
    )


def _build_m365(credentials: dict, account_id: str):
    from prowler.providers.m365.m365_provider import M365Provider

    return M365Provider(
        client_id=credentials.get("client_id", ""),
        client_secret=credentials.get("client_secret", ""),
        tenant_id=credentials.get("tenant_id", ""),
    )


# ---------------------------------------------------------------------------
# Builder registry
# ---------------------------------------------------------------------------

_BUILDERS = {
    "aws":        _build_aws,
    "azure":      _build_azure,
    "gcp":        _build_gcp,
    "kubernetes": _build_kubernetes,
    "github":     _build_github,
    "m365":       _build_m365,
}
