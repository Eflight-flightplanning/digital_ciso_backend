"""
Secret Sanitizer — removes credentials before any Claude call.

Cloud data is untrusted. Resource names, tags, descriptions, policies,
and evidence fields may contain embedded secrets or prompt injection attempts.

Rules:
- Never log removed secrets
- Replace with [REDACTED] marker
- Also treat embedded instruction patterns as prompt injection attempts
"""
from __future__ import annotations

import json
import re
from typing import Any

# ─────────────────────────────────────────────────────────────
# Secret patterns to detect and redact
# ─────────────────────────────────────────────────────────────

SECRET_PATTERNS = [
    # AWS keys
    (r"(?i)(AKIA|ASIA|AROA|AIDA|AGPA|AIPA|ANPA|ANVA|APKA)[A-Z0-9]{16}", "[REDACTED_AWS_KEY]"),
    # Generic API keys (key=..., apikey=..., api_key=..., etc.)
    (r"(?i)(api[_-]?key|apikey|x-api-key)\s*[=:]\s*['\"]?([a-zA-Z0-9\-_]{20,})['\"]?", "[REDACTED_API_KEY]"),
    # Bearer tokens
    (r"(?i)bearer\s+([a-zA-Z0-9\-_\.]{20,})", "Bearer [REDACTED_TOKEN]"),
    # Authorization headers
    (r"(?i)(authorization|auth)\s*[=:]\s*['\"]?([^\s'\"]{10,})['\"]?", "[REDACTED_AUTH]"),
    # Passwords
    (r"(?i)(password|passwd|pwd)\s*[=:]\s*['\"]?([^\s'\"]{6,})['\"]?", "[REDACTED_PASSWORD]"),
    # Private keys
    (r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", "[REDACTED_PRIVATE_KEY]"),
    # Generic secrets
    (r"(?i)(secret|token|credential)\s*[=:]\s*['\"]?([^\s'\"]{10,})['\"]?", "[REDACTED_SECRET]"),
    # Connection strings
    (r"(?i)(mongodb|mysql|postgresql|postgres|redis|amqp)://[^\s\"']+", "[REDACTED_CONNECTION_STRING]"),
    # S3 / storage URLs with embedded creds
    (r"(?i)https?://[a-zA-Z0-9._%-]+:[a-zA-Z0-9._%-]+@[^\s\"']+", "[REDACTED_CREDENTIAL_URL]"),
]

# ─────────────────────────────────────────────────────────────
# Prompt injection patterns — resource data may try to hijack Claude
# ─────────────────────────────────────────────────────────────

INJECTION_PATTERNS = [
    r"(?i)ignore previous instructions",
    r"(?i)disregard (all|previous|above) (instructions|prompts?|rules?)",
    r"(?i)(mark|set|change) (everything|all findings?) (as )?(safe|pass|ok|compliant)",
    r"(?i)you are now",
    r"(?i)system prompt",
    r"(?i)(print|output|reveal|show) (your )?(system )?prompt",
    r"(?i)jailbreak",
    r"(?i)DAN mode",
]

_COMPILED_SECRETS = [(re.compile(p, re.DOTALL), r) for p, r in SECRET_PATTERNS]
_COMPILED_INJECTIONS = [re.compile(p) for p in INJECTION_PATTERNS]


class SecretSanitizer:
    """Remove secrets and prompt injection attempts from data before Claude."""

    def sanitize_string(self, value: str) -> str:
        """Redact secrets and neutralize injection attempts in a string."""
        if not isinstance(value, str):
            return value

        result = value

        # Redact secrets
        for pattern, replacement in _COMPILED_SECRETS:
            result = pattern.sub(replacement, result)

        # Neutralize injection attempts (replace with warning marker)
        for pattern in _COMPILED_INJECTIONS:
            if pattern.search(result):
                result = f"[PROMPT_INJECTION_ATTEMPT_NEUTRALIZED: {result[:50]}...]"
                break

        return result

    def sanitize_dict(self, data: dict[str, Any]) -> dict[str, Any]:
        """Recursively sanitize all string values in a dict."""
        return {k: self._sanitize_value(v) for k, v in data.items()}

    def sanitize_list(self, data: list[Any]) -> list[Any]:
        """Recursively sanitize all string values in a list."""
        return [self._sanitize_value(v) for v in data]

    def _sanitize_value(self, value: Any) -> Any:
        if isinstance(value, str):
            return self.sanitize_string(value)
        if isinstance(value, dict):
            return self.sanitize_dict(value)
        if isinstance(value, list):
            return self.sanitize_list(value)
        return value

    def sanitize_context(self, context: dict[str, Any]) -> dict[str, Any]:
        """Sanitize the full context object before sending to Claude."""
        return self.sanitize_dict(context)


# ─────────────────────────────────────────────────────────────
# Singleton instance
# ─────────────────────────────────────────────────────────────

sanitizer = SecretSanitizer()
