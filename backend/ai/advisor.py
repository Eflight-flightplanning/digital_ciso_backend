"""
Spectra advisor: shared prompt building, history handling, answer extraction and
data-only fallback for every LLM backend (vLLM/Qwen, Claude, OpenAI).

Design rules (these fix the old behaviour):
  * The model answers in Markdown, not JSON. Remediation answers often contain
    JSON policies; parsing the reply as JSON used to grab those snippets and
    throw the real answer away, which then triggered a canned response.
  * Context is labelled by how it was found: findings the user referenced,
    findings that match the question, and background findings. The model is told
    to use background findings only when the question is about overall risk, so
    different questions no longer get the same "top findings" answer.
  * When the LLM is unreachable or returns nothing, the reply says so and shows
    only real data from the database. Nothing is synthesised: no default scores,
    no invented posture statements.
"""

from __future__ import annotations

import json
import re
from typing import Any

# Synthetic context rows (platform summaries) are not findings the user can open.
SYNTHETIC_ID_PREFIXES = ("COMPLIANCE-", "OCI-TENANCY", "ORACLE-SAAS", "AZURE-TENANCY")

MAX_HISTORY_MESSAGES = 8
MAX_HISTORY_CHARS = 1500
MAX_CONTEXT_CHARS = 14000  # keeps the prompt well inside an 8k-token model window

# Assistant messages that are UI placeholders or failures, not real answers. Feeding
# them back as history makes the model imitate them.
_NON_ANSWER_PREFIXES = (
    "spectra threat analysis & security advisor engine initialized",
    "spectra analysis engine is currently unavailable",
    "> ⚠️ **spectra's language model is not reachable",
    "**spectra's language model is not reachable",
)

_COMPLIANCE_WORDS = re.compile(
    r"\b(cis|compliance|compliant|benchmark|framework|nis2|iso|soc ?2?|sox|itgc|nca|ecc|pci|hipaa|nist|"
    r"score|posture|audit|readiness|briefing|executive|overall|report)\b",
    re.IGNORECASE,
)
_GREETING = re.compile(
    r"^\s*(hi|hello|hey|good (morning|afternoon|evening)|who are you|what can you do|help)\b[\s!?.]*$",
    re.IGNORECASE,
)

PROVIDER_LABELS = {
    "azure": "Microsoft Azure",
    "aws": "AWS",
    "gcp": "Google Cloud",
    "oraclecloud": "Oracle Cloud (OCI)",
    "oci": "Oracle Cloud (OCI)",
    "oracle_saas": "Oracle Fusion SaaS",
    "kubernetes": "Kubernetes",
    "github": "GitHub",
    "m365": "Microsoft 365",
}


def is_synthetic(f: dict[str, Any]) -> bool:
    return str(f.get("finding_id", "")).startswith(SYNTHETIC_ID_PREFIXES)


def relevance(f: dict[str, Any]) -> str:
    if f.get("_pinned"):
        return "pinned"
    if is_synthetic(f):
        return "summary"
    return f.get("_relevance") or "match"


def wants_compliance(question: str) -> bool:
    return bool(_COMPLIANCE_WORDS.search(question or ""))


def is_greeting(question: str) -> bool:
    return bool(_GREETING.match(question or ""))


# ---------------------------------------------------------------- history


def clean_history(history: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    """Normalise chat history: valid roles only, no placeholders/failures, bounded size."""
    out: list[dict[str, str]] = []
    for item in history or []:
        if not isinstance(item, dict):
            continue
        role = item.get("role") or item.get("sender")
        content = str(item.get("content") or "").strip()
        if role not in ("user", "assistant") or not content:
            continue
        if role == "assistant" and content.lower().startswith(_NON_ANSWER_PREFIXES):
            continue
        if len(content) > MAX_HISTORY_CHARS:
            content = content[:MAX_HISTORY_CHARS] + "\n[earlier answer truncated]"
        out.append({"role": role, "content": content})
    out = out[-MAX_HISTORY_MESSAGES:]
    # Chat APIs expect the conversation to start with a user turn.
    while out and out[0]["role"] != "user":
        out.pop(0)
    # Merge consecutive same-role turns (e.g. a dropped failure between two questions).
    merged: list[dict[str, str]] = []
    for m in out:
        if merged and merged[-1]["role"] == m["role"]:
            merged[-1]["content"] += "\n\n" + m["content"]
        else:
            merged.append(dict(m))
    if merged and merged[-1]["role"] == "user":
        # The current question is sent separately; a trailing unanswered user turn
        # would make two user messages in a row.
        merged.pop()
    return merged


# ---------------------------------------------------------------- context


def _short(text: Any, limit: int) -> str:
    s = re.sub(r"\s+", " ", str(text or "")).strip()
    return s if len(s) <= limit else s[: limit - 1] + "…"


def _finding_line(f: dict[str, Any]) -> str:
    res = f.get("resource")
    res_name = res.get("name") if isinstance(res, dict) else res
    parts = [
        f"- [{str(f.get('severity') or '').upper() or 'N/A'}] {_short(f.get('check_title') or f.get('check_id'), 140)}",
        f"  check_id: {f.get('check_id')} | status: {f.get('status')} | provider: {f.get('provider')} | resource: {_short(res_name, 80)}",
    ]
    if f.get("finding_id") and not is_synthetic(f):
        parts.append(f"  finding_id: {f.get('finding_id')}")
    if f.get("affected_resources", 0) > 1:
        parts.append(f"  affected resources: {f['affected_resources']}")
    if f.get("status_extended"):
        parts.append(f"  detail: {_short(f.get('status_extended'), 260)}")
    if f.get("remediation"):
        parts.append(f"  scanner remediation: {_short(f.get('remediation'), 260)}")
    return "\n".join(parts)


def _relevant_scores(question: str, scores: list[dict[str, Any]]) -> list[dict[str, Any]]:
    q = (question or "").lower()
    wanted = [p for p, words in (
        ("azure", ("azure",)),
        ("oraclecloud", ("oci", "oracle cloud", "oraclecloud")),
        ("oracle_saas", ("saas", "fusion")),
        ("aws", ("aws", "amazon")),
        ("gcp", ("gcp", "google")),
        ("kubernetes", ("kubernetes", "k8s")),
    ) if any(w in q for w in words)]
    if not wanted:
        return scores
    picked = [
        s for s in scores
        if any(w in (str(s.get("provider") or "") + " " + str(s.get("compliance_id") or "")).lower() for w in wanted)
    ]
    return picked or scores


def build_user_prompt(
    question: str,
    findings: list[dict[str, Any]] | None,
    providers: list[dict[str, Any]] | None,
    scores: list[dict[str, Any]] | None,
    scope: dict[str, Any] | None = None,
) -> str:
    findings = findings or []
    providers = providers or []
    scores = scores or []

    groups: dict[str, list[dict[str, Any]]] = {"pinned": [], "match": [], "summary": [], "background": []}
    for f in findings:
        if f.get("_not_found_target"):
            continue
        groups.setdefault(relevance(f), []).append(f)

    lines: list[str] = ["CONTEXT (this organisation's live data; the only source for facts about their environment)", ""]

    if scope:
        label = scope.get("label") or scope.get("scope")
        lines += [
            "## Scope",
            f"You are answering inside the {label} dashboard. Answer only about {label}, using the data below.",
            f"If the question is about another cloud or platform, say in one or two sentences that this assistant covers "
            f"only {label} and that the main Spectra AI page covers every connected environment; do not answer it.",
            "",
        ]

    lines.append("## Connected environments")
    if providers:
        seen = set()
        for p in providers:
            key = (p.get("provider"), p.get("alias"))
            if key in seen:
                continue
            seen.add(key)
            label = PROVIDER_LABELS.get(str(p.get("provider")), str(p.get("provider")))
            lines.append(f"- {label}: {p.get('alias') or p.get('provider')}")
    else:
        lines.append("- None connected.")

    not_found = [f["_not_found_target"] for f in findings if f.get("_not_found_target")]
    if not_found:
        lines += ["", f"## Not found\nThe user referenced `{not_found[0]}`, which does not exist in the scan data."]

    if scores and (wants_compliance(question) or not (groups["pinned"] or groups["match"])):
        lines += ["", "## Compliance scores (latest scan per provider; score = passed / (passed + failed))"]
        for s in _relevant_scores(question, scores)[:15]:
            lines.append(
                f"- {s.get('framework')} {s.get('version') or ''} [{s.get('provider') or s.get('compliance_id')}]: "
                f"{s.get('score')}% ({s.get('passed')} passed, {s.get('failed')} failed, {s.get('manual')} manual, {s.get('total')} total)"
            )

    for block in (scope or {}).get("sections") or []:
        lines += ["", block]

    sections = (
        ("pinned", "## Findings the user referenced"),
        ("match", "## Findings that match the question"),
        ("summary", "## Platform summaries"),
        ("background", "## Other open findings, highest severity first (background: use only if the question is about overall risk or priorities)"),
    )
    caps = {"pinned": 3, "match": 10, "summary": 6, "background": 6}
    for key, title in sections:
        rows = groups.get(key) or []
        if not rows:
            continue
        lines += ["", title]
        lines += [_finding_line(f) for f in rows[: caps[key]]]

    if not (groups["pinned"] or groups["match"] or (scope or {}).get("matched")):
        lines += ["", "(No findings in the scan data match this question directly.)"]

    context = "\n".join(lines)
    if len(context) > MAX_CONTEXT_CHARS:
        context = context[:MAX_CONTEXT_CHARS] + "\n[context truncated]"
    return f"{context}\n\n---\nUSER QUESTION (answer this):\n{question}"


# ---------------------------------------------------------------- model output


_THINK_BLOCK = re.compile(r"<think>[\s\S]*?</think>", re.IGNORECASE)
_LEADING_META = re.compile(
    r"^(?:the user (?:is asking|asked|wants)|let me (?:think|analy[sz]e|structure)|thinking process:|"
    r"here'?s a thinking process|i need to (?:answer|respond|provide))[^\n]*\n+",
    re.IGNORECASE,
)


def extract_answer(raw: str | None) -> str:
    """The model's final Markdown answer, with hidden reasoning removed."""
    text = (raw or "").strip()
    if not text:
        return ""
    text = _THINK_BLOCK.sub("", text).strip()
    if "</think>" in text:  # opening tag cut off by the server
        text = text.split("</think>", 1)[1].strip()

    # A reply that is *entirely* a JSON object with an answer field (older prompt
    # style, or a model that insists on JSON). JSON inside a longer answer is content.
    stripped = re.sub(r"^```(?:json)?\s*|\s*```$", "", text).strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        try:
            obj = json.loads(stripped, strict=False)
            if isinstance(obj, dict):
                for key in ("answer", "response", "content"):
                    if isinstance(obj.get(key), str) and obj[key].strip():
                        return obj[key].strip()
        except ValueError:
            pass

    # Drop a few leading lines of narrated planning, never anything after real content.
    for _ in range(5):
        new = _LEADING_META.sub("", text, count=1).lstrip()
        if new == text:
            break
        text = new
    return text.strip()


# ---------------------------------------------------------------- references


def finding_refs(findings: list[dict[str, Any]] | None, limit: int = 5) -> list[dict[str, str]]:
    """References only for findings tied to the question (never background padding)."""
    refs = []
    for f in findings or []:
        if is_synthetic(f) or f.get("_not_found_target") or relevance(f) not in ("pinned", "match"):
            continue
        refs.append({
            "id": str(f.get("finding_id", "")),
            "name": str(f.get("check_title") or f.get("check_id") or ""),
            "severity": str(f.get("severity") or "medium").lower(),
            "provider": str(f.get("provider") or ""),
        })
        if len(refs) >= limit:
            break
    return refs


# ---------------------------------------------------------------- data-only fallback


def grounded_fallback(
    question: str,
    findings: list[dict[str, Any]] | None,
    providers: list[dict[str, Any]] | None,
    scores: list[dict[str, Any]] | None,
    reason: str = "",
    scope: dict[str, Any] | None = None,
) -> str:
    """A truthful reply when no model output is available: real data only, no analysis."""
    findings = findings or []
    scores = scores or []
    head = (
        "> ⚠️ **Spectra's language model is not reachable right now**, so this is a data-only answer "
        "from your scan results, not an analysis. An administrator can check the model endpoint under AI Settings."
    )
    if reason:
        head += f"\n> _Details: {_short(reason, 160)}_"

    if is_greeting(question):
        return (
            f"{head}\n\nI'm Spectra. Once the model is reachable I can answer questions about your findings, "
            "compliance scores and remediation steps."
        )

    out = [head, ""]
    if providers:
        out.append("**Connected:** " + ", ".join(
            f"{PROVIDER_LABELS.get(str(p.get('provider')), p.get('provider'))} ({p.get('alias')})" for p in providers[:10]
        ))
        out.append("")

    not_found = [f["_not_found_target"] for f in findings if f.get("_not_found_target")]
    if not_found:
        out.append(f"`{not_found[0]}` was not found in your scan data.")
        out.append("")

    if scope and scope.get("fallback"):
        out.append(scope["fallback"])
        out.append("")

    if scores and wants_compliance(question):
        out.append("| Framework | Provider | Score | Passed | Failed | Manual | Total |")
        out.append("| :-- | :-- | :-: | :-: | :-: | :-: | :-: |")
        for s in _relevant_scores(question, scores)[:12]:
            out.append(
                f"| {s.get('framework')} {s.get('version') or ''} | {s.get('provider') or ''} | {s.get('score')}% | "
                f"{s.get('passed')} | {s.get('failed')} | {s.get('manual')} | {s.get('total')} |"
            )
        out.append("")

    related = [f for f in findings if relevance(f) in ("pinned", "match")]
    if related:
        out.append("**Findings that match your question:**")
        for f in related[:6]:
            res = f.get("resource")
            res_name = res.get("name") if isinstance(res, dict) else res
            out.append(
                f"- **{_short(f.get('check_title') or f.get('check_id'), 120)}** "
                f"({str(f.get('severity') or '').upper()}, {f.get('status')}) on `{_short(res_name, 60)}`"
            )
            if f.get("remediation"):
                out.append(f"  - Scanner remediation: {_short(f.get('remediation'), 220)}")
    elif not (scores and wants_compliance(question)):
        out.append("No findings in your scan data match this question.")
    return "\n".join(out).strip()
