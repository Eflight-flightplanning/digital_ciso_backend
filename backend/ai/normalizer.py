"""
Finding Normalizer — Transforms raw Prowler findings into a compact,
structured format suitable for AI context building.

The normalizer:
1. Extracts only the fields needed for AI analysis
2. Computes a deterministic hash for cache fingerprinting
3. Never modifies Prowler's PASS/FAIL status

The normalized output is NOT sent directly to Claude.
It feeds into the Context Builder which adds resource context,
then the Secret Sanitizer removes credentials,
then the compact context goes to Claude.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any


def normalize_finding(finding_data: dict[str, Any]) -> dict[str, Any]:
    """
    Normalize a Prowler finding JSON:API response into a compact dict
    suitable for AI context building.

    Args:
        finding_data: Raw JSON:API response from Prowler API (finding + included)

    Returns:
        Normalized dict with only AI-relevant fields.
    """
    attrs = finding_data.get("attributes", {})
    metadata = attrs.get("check_metadata", {})
    relationships = finding_data.get("relationships", {})
    resource = relationships.get("resource", {})
    resource_attrs = resource.get("attributes", {})
    scan = relationships.get("scan", {})
    scan_attrs = scan.get("attributes", {})

    return {
        # Prowler identity
        "finding_id": finding_data.get("id", ""),
        "check_id": attrs.get("check_id", ""),
        "uid": attrs.get("uid", ""),
        # Prowler status — NEVER modify this
        "status": attrs.get("status", "UNKNOWN"),  # This is immutable
        "status_extended": attrs.get("status_extended", ""),
        # Severity (from Prowler)
        "severity": attrs.get("severity", "medium"),
        # Check metadata
        "check_title": metadata.get("checktitle", ""),
        "description": metadata.get("description", ""),
        "prowler_risk": metadata.get("risk", ""),
        "remediation_text": metadata.get("remediation", {}).get("recommendation", {}).get("text", ""),
        "service": metadata.get("servicename", ""),
        "categories": metadata.get("categories", []),
        "compliance": metadata.get("compliance"),
        "related_url": metadata.get("relatedurl", ""),
        # Resource context (from Prowler)
        "resource": {
            "name": resource_attrs.get("name", ""),
            "uid": resource_attrs.get("uid", ""),
            "region": resource_attrs.get("region", ""),
            "service": resource_attrs.get("service", ""),
            "type": resource_attrs.get("type", ""),
            "tags": resource_attrs.get("tags") or {},
            # Exclude "details" field — may contain raw credentials
        },
        # Raw evidence (compact — exclude full scan state)
        "raw_result": _compact_raw_result(attrs.get("raw_result")),
        # Provider
        "provider": relationships.get("provider", {}).get("data", {}).get("type", ""),
        # Temporal
        "first_seen": attrs.get("first_seen_at"),
        "last_updated": attrs.get("updated_at", ""),
        # Muted status
        "muted": attrs.get("muted", False),
        "muted_reason": attrs.get("muted_reason"),
    }


def _compact_raw_result(raw_result: Any) -> dict[str, Any]:
    """
    Produce a compact, safe representation of raw evidence.

    Excludes deeply nested or very large fields that would bloat the
    AI context window without adding analytical value.
    """
    if not raw_result or not isinstance(raw_result, dict):
        return {}

    # Remove fields that are typically very large or redundant
    EXCLUDE_KEYS = {
        "policy_document",  # Often very large and covered by check description
        "inline_policy",
        "response_header",
        "full_response",
        "raw_policy",
        "cloudtrail_events",  # Too verbose
    }

    result = {}
    for k, v in raw_result.items():
        if k in EXCLUDE_KEYS:
            continue
        if isinstance(v, str) and len(v) > 1000:
            result[k] = v[:500] + f"...[truncated, {len(v)} chars]"
        elif isinstance(v, (dict, list)):
            serialized = json.dumps(v, default=str)
            if len(serialized) > 2000:
                result[k] = f"[complex_object, {len(serialized)} chars]"
            else:
                result[k] = v
        else:
            result[k] = v

    return result


def compute_evidence_fingerprint(normalized: dict[str, Any]) -> str:
    """
    Compute a SHA-256 fingerprint of the normalized evidence.
    Used for AI analysis cache invalidation.
    """
    evidence = {
        "check_id": normalized.get("check_id"),
        "status": normalized.get("status"),
        "status_extended": normalized.get("status_extended"),
        "raw_result": normalized.get("raw_result"),
        "resource_uid": normalized.get("resource", {}).get("uid"),
    }
    serialized = json.dumps(evidence, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode()).hexdigest()
