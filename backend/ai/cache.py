"""
AI Analysis Cache

Implements fingerprint-based caching for AI assessments.
If the normalized evidence + resource context + prompt version haven't changed,
reuse the previous AI analysis instead of calling Claude again.

Cache key:
  hash(check_id + normalized_evidence + resource_context + prompt_version)

Re-analyze when:
  - Evidence changes (new scan result)
  - Resource context changes materially
  - Prompt version changes
  - Policy requires re-analysis
  - Human requests re-analysis
"""
from __future__ import annotations

import hashlib
import json
from typing import Any


def build_fingerprint(
    check_id: str,
    normalized_evidence: dict[str, Any],
    resource_context: dict[str, Any],
    prompt_version: str,
) -> str:
    """
    Build a deterministic fingerprint for an AI analysis input.

    This fingerprint is used to decide whether to reuse a cached result.
    The fingerprint is stored with the assessment so it can be compared
    when the same finding arrives again.
    """
    # Sort keys for deterministic serialization
    payload = {
        "check_id": check_id,
        "evidence": normalized_evidence,
        "context": resource_context,
        "prompt_version": prompt_version,
    }
    serialized = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode()).hexdigest()


def fingerprints_match(
    new_fingerprint: str,
    cached_fingerprint: str | None,
) -> bool:
    """Check if the new fingerprint matches the cached one."""
    if not cached_fingerprint:
        return False
    return new_fingerprint == cached_fingerprint


class AIAnalysisCache:
    """
    In-process cache check helper.

    The actual storage is in the ai_assessments database table.
    This helper determines whether a DB lookup would find a valid cached result.

    For heavier caching (Redis), this can be extended.
    """

    @staticmethod
    def should_reanalyze(
        new_fingerprint: str,
        cached_fingerprint: str | None,
        force_reanalysis: bool = False,
    ) -> bool:
        """
        Return True if Claude should be called (cache miss or forced refresh).
        Return False if the cached result can be reused.
        """
        if force_reanalysis:
            return True
        return not fingerprints_match(new_fingerprint, cached_fingerprint)
