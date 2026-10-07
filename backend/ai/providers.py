"""
Digital CISO — AI provider selection.

The platform runs a single self-hosted model (Qwen served by vLLM on the Azure VM). There is no
third-party LLM API: no data leaves your infrastructure and no external API keys are involved.
"""

from __future__ import annotations

import logging

from .provider import AIProvider
from .vllm_provider import VLLMAzureProvider

logger = logging.getLogger(__name__)


def get_ai_provider(tenant_id: str | None = None) -> AIProvider:
    """Return the vLLM (Qwen) provider, honouring a tenant's custom endpoint/model if configured."""
    if tenant_id:
        try:
            from api.models import TenantLLMConfig

            config = TenantLLMConfig.objects.filter(tenant_id=tenant_id, is_active=True).first()
            if config:
                return VLLMAzureProvider(
                    base_url=config.base_url,
                    api_key=config.api_key,
                    model_name=config.model_name,
                )
        except Exception as e:
            # e.g. a stored endpoint that fails the SSRF check: use the platform default instead
            logger.warning("Ignoring tenant LLM config for %s: %s", tenant_id, type(e).__name__)
    return VLLMAzureProvider()
