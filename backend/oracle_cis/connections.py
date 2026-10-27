"""Identity domain (IDCS) and Fusion pod (HCM) connection details, stored on the tenant's Oracle SaaS provider.

The platform already keeps Oracle SaaS credentials as an api.Provider of type "oracle_saas" with an encrypted
api.ProviderSecret. This module reads and writes the same secret, so the Providers page, the Prowler Oracle SaaS
scan and this assessment share one connection. Keys in the secret:

  erp_base_url, username, password    Fusion pod and Basic Auth user (the provider's existing keys)
  domain_url, client_id, client_secret  identity domain and its confidential app (OAuth client credentials)

The platform maps the secret to Prowler with Basic Auth whenever a username is present, so adding the identity
domain keys does not change how the Prowler scan connects. Values missing from the provider fall back to .env
(ORACLE_FUSION_*, IDCS_*). Secrets never leave this module except to build the API clients.
"""
import os
from contextlib import nullcontext
from urllib.parse import urlparse

from cis_checks.fusion_client import FusionClient
from cis_checks.idcs_client import Idcs

PROVIDER_TYPE = "oracle_saas"

# field name on the page -> (key in the provider secret, .env fallback, is secret)
FIELDS = {
    "idcs_base": ("domain_url", "IDCS_BASE", False),
    "idcs_client_id": ("client_id", "IDCS_CLIENT_ID", False),
    "idcs_client_secret": ("client_secret", "IDCS_CLIENT_SECRET", True),
    "fusion_pod_url": ("erp_base_url", "ORACLE_FUSION_POD_URL", False),
    "fusion_username": ("username", "ORACLE_FUSION_USERNAME", False),
    "fusion_password": ("password", "ORACLE_FUSION_PASSWORD", True),
}


def _rls(tenant_id):
    """RLS scope for api models (Provider, ProviderSecret are row-level-security protected)."""
    if not tenant_id:
        return nullcontext()
    from api.db_utils import rls_transaction

    return rls_transaction(str(tenant_id))


def provider_for(tenant_id):
    """The tenant's Oracle SaaS provider (the oldest, if there are several), or None."""
    from api.models import Provider

    with _rls(tenant_id):
        return Provider.objects.filter(tenant_id=tenant_id, provider=PROVIDER_TYPE).order_by("inserted_at").first()


def _secret_of(provider, tenant_id):
    if provider is None:
        return {}
    from api.models import ProviderSecret

    with _rls(tenant_id):
        row = ProviderSecret.all_objects.filter(provider_id=provider.id).first()
        if row is None:
            return {}
        try:
            return dict(row.secret or {})
        except Exception:  # cannot be decrypted (platform encryption key changed)
            return {"_unreadable": True}


def _clean(value):
    return str(value or "").strip().strip('"').rstrip("/")


def resolved(tenant_id):
    """Effective values with their source ("provider", "env" or None). Secrets included."""
    provider = provider_for(tenant_id)
    secret = _secret_of(provider, tenant_id)
    out = {}
    for name, (key, env_name, _) in FIELDS.items():
        value = _clean(secret.get(key))
        if value:
            out[name] = (value, "provider")
            continue
        env_value = _clean(os.environ.get(env_name))
        out[name] = (env_value, "env") if env_value else ("", None)
    out["_provider"] = provider
    out["_unreadable"] = bool(secret.get("_unreadable"))
    return out


def idcs_client(tenant_id):
    r = resolved(tenant_id)
    return Idcs(base=r["idcs_base"][0], client_id=r["idcs_client_id"][0], client_secret=r["idcs_client_secret"][0])


def fusion_client(tenant_id):
    r = resolved(tenant_id)
    return FusionClient(pod_url=r["fusion_pod_url"][0], username=r["fusion_username"][0], password=r["fusion_password"][0])


def tenant_label(tenant_id):
    """Short name of the identity domain (first label of its host), shown on runs and reports."""
    host = urlparse(resolved(tenant_id)["idcs_base"][0]).hostname or ""
    return host.split(".")[0] if host else "not configured"


def public_view(tenant_id):
    """What the connection form shows: URLs and ids, and only whether each secret is saved."""
    r = resolved(tenant_id)
    provider = r["_provider"]

    def field(name):
        value, source = r[name]
        return {"set": bool(value), "source": source} if FIELDS[name][2] else {"value": value, "source": source}

    return {
        "idcs": {"base_url": field("idcs_base"), "client_id": field("idcs_client_id"), "client_secret": field("idcs_client_secret")},
        "fusion": {"pod_url": field("fusion_pod_url"), "username": field("fusion_username"), "password": field("fusion_password")},
        "provider": {"id": str(provider.id), "alias": provider.alias, "uid": provider.uid} if provider else None,
        "unreadable_secrets": r["_unreadable"],
        "updated_at": provider.updated_at if provider else None,
    }


def save(tenant_id, values, clear=()):
    """Write the given page fields into the provider secret, creating the provider when the tenant has none.

    values: {page field: new value}; a blank secret is ignored (keeps the saved one). clear: secret fields to remove.
    """
    from api.models import Provider, ProviderSecret

    with _rls(tenant_id):
        provider = Provider.objects.filter(tenant_id=tenant_id, provider=PROVIDER_TYPE).order_by("inserted_at").first()
        if provider is None:
            uid = values.get("fusion_pod_url") or values.get("idcs_base")
            if not uid:
                raise ValueError("Enter the Fusion pod URL or the identity domain URL to create the Oracle SaaS connection.")
            provider = Provider.objects.create(tenant_id=tenant_id, provider=PROVIDER_TYPE, uid=uid, alias="Oracle SaaS")
        row = ProviderSecret.all_objects.filter(provider_id=provider.id).first()
        secret = {}
        if row is not None:
            try:
                secret = dict(row.secret or {})
            except Exception:
                secret = {}  # unreadable: replaced by what is entered now
        for name, value in values.items():
            key, _, is_secret = FIELDS[name]
            value = _clean(value) if not is_secret else str(value or "")
            if is_secret and not value:
                continue
            secret[key] = value
        for name in clear:
            secret.pop(FIELDS[name][0], None)
        if secret.get("username"):
            secret.setdefault("auth_mode", "BASIC_AUTH")
        secret.setdefault("erp_type", "FUSION_ERP")
        if row is None:
            row = ProviderSecret(tenant_id=tenant_id, provider=provider, name="Oracle SaaS", secret_type="static")
        row.secret = secret
        row.save()
        provider.save(update_fields=["updated_at"])
    return provider
