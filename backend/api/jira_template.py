"""
Structured Jira Ticket Template Generator for Digital CISO Remediation.
Generates comprehensive, production-ready Jira tickets in Atlassian Document Format (ADF)
and Markdown with Executive Summary, Affected Resource, Compliance Finding, Risk,
AI Recommended Fix, Telemetry Evidence, and Validation Steps.
"""
from typing import Any, Dict, List, Optional


def build_jira_ticket_markdown(
    finding_title: str,
    check_id: str,
    provider: str,
    region: str,
    resource_uid: str,
    resource_name: str,
    severity: str,
    risk_score: int,
    risk_summary: str,
    compliance_rules: List[Dict[str, Any]] | List[str],
    recommended_fix: str,
    code_snippet: Optional[str] = None,
    ai_reasoning: Optional[str] = None,
    evidence: Optional[str] = None,
    validation_steps: Optional[List[str]] = None,
) -> str:
    """Builds a beautifully structured Markdown description for Jira issues."""
    compliance_str = ""
    if compliance_rules:
        if isinstance(compliance_rules[0], dict):
            compliance_str = "\n".join(
                [f"- **{c.get('framework', 'Standard')}**: {c.get('rule', c.get('name', 'Requirement'))}" for c in compliance_rules]
            )
        else:
            compliance_str = "\n".join([f"- {str(c)}" for c in compliance_rules])
    else:
        compliance_str = "- CIS Cloud Security Benchmark & NCA Essential Controls"

    val_steps_str = ""
    if validation_steps:
        val_steps_str = "\n".join([f"{i+1}. {step}" for i, step in enumerate(validation_steps)])
    else:
        val_steps_str = (
            "1. Apply the recommended remediation configuration.\n"
            "2. Verify resource state in cloud provider management console or CLI.\n"
            "3. Trigger an on-demand Digital CISO / Prowler assessment scan.\n"
            "4. Confirm check status transitions from FAIL to PASS."
        )

    code_block = ""
    if code_snippet:
        code_block = f"\n```terraform\n{code_snippet.strip()}\n```\n"

    md = f"""## 🛡️ Executive Summary
{finding_title}
**Severity:** {severity.upper()} | **Risk Score:** {risk_score}/100 | **Cloud Provider:** {provider.upper()}

## 📦 Affected Resource
* **Resource UID:** `{resource_uid}`
* **Resource Name:** {resource_name or resource_uid}
* **Cloud Provider:** {provider.upper()}
* **Region / Zone:** {region or 'Global'}

## ⚖️ Compliance & Governance Finding
* **Check ID:** `{check_id}`
* **Applicable Frameworks:**
{compliance_str}

## ⚠️ Risk & Threat Analysis
{risk_summary or 'Unmitigated cloud misconfiguration posing immediate exploitability and lateral movement risk.'}
{f'**AI Threat Reasoning:** {ai_reasoning}' if ai_reasoning else ''}

## 🔧 AI Recommended Remediation
{recommended_fix}
{code_block}
## 📊 Telemetry & Evidence
{evidence or 'Verified through live Digital CISO cloud API posture audit.'}

## ✅ Validation & Verification Steps
{val_steps_str}

---
*Generated automatically by Digital CISO Autonomous Remediation Engine*
"""
    return md


def build_jira_ticket_adf(
    finding_title: str,
    check_id: str,
    provider: str,
    region: str,
    resource_uid: str,
    resource_name: str,
    severity: str,
    risk_score: int,
    risk_summary: str,
    compliance_rules: List[Dict[str, Any]] | List[str],
    recommended_fix: str,
    code_snippet: Optional[str] = None,
    ai_reasoning: Optional[str] = None,
    evidence: Optional[str] = None,
    validation_steps: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Builds an Atlassian Document Format (ADF) JSON structure for Jira Cloud API v3.
    """
    def text_node(text: str, bold: bool = False, code: bool = False) -> Dict[str, Any]:
        marks = []
        if bold:
            marks.append({"type": "strong"})
        if code:
            marks.append({"type": "code"})
        node: Dict[str, Any] = {"type": "text", "text": text}
        if marks:
            node["marks"] = marks
        return node

    def paragraph_nodes(nodes: List[Dict[str, Any]]) -> Dict[str, Any]:
        return {"type": "paragraph", "content": nodes}

    def heading_node(text: str, level: int = 2) -> Dict[str, Any]:
        return {
            "type": "heading",
            "attrs": {"level": level},
            "content": [{"type": "text", "text": text}],
        }

    content: List[Dict[str, Any]] = []

    # 1. Executive Summary
    content.append(heading_node("🛡️ Executive Summary", 2))
    content.append(
        paragraph_nodes([
            text_node(finding_title + "\n"),
            text_node("Severity: ", bold=True),
            text_node(f"{severity.upper()}  |  "),
            text_node("Risk Score: ", bold=True),
            text_node(f"{risk_score}/100  |  "),
            text_node("Cloud Provider: ", bold=True),
            text_node(provider.upper()),
        ])
    )

    # 2. Affected Resource
    content.append(heading_node("📦 Affected Resource", 2))
    content.append({
        "type": "bulletList",
        "content": [
            {
                "type": "listItem",
                "content": [paragraph_nodes([text_node("Resource UID: ", bold=True), text_node(resource_uid, code=True)])],
            },
            {
                "type": "listItem",
                "content": [paragraph_nodes([text_node("Resource Name: ", bold=True), text_node(resource_name or resource_uid)])],
            },
            {
                "type": "listItem",
                "content": [paragraph_nodes([text_node("Provider: ", bold=True), text_node(provider.upper())])],
            },
            {
                "type": "listItem",
                "content": [paragraph_nodes([text_node("Region: ", bold=True), text_node(region or "Global")])],
            },
        ],
    })

    # 3. Compliance Finding
    content.append(heading_node("⚖️ Compliance Finding", 2))
    comp_list_items = []
    if compliance_rules:
        for c in compliance_rules:
            txt = f"{c.get('framework', 'Standard')}: {c.get('rule', c.get('name', 'Requirement'))}" if isinstance(c, dict) else str(c)
            comp_list_items.append({
                "type": "listItem",
                "content": [paragraph_nodes([text_node(txt)])],
            })
    else:
        comp_list_items.append({
            "type": "listItem",
            "content": [paragraph_nodes([text_node("CIS Cloud Security Benchmark & NCA Essential Cybersecurity Controls (ECC)")])],
        })

    content.append({
        "type": "bulletList",
        "content": [
            {
                "type": "listItem",
                "content": [paragraph_nodes([text_node("Check ID: ", bold=True), text_node(check_id, code=True)])],
            },
            *comp_list_items,
        ],
    })

    # 4. Risk & Threat Analysis
    content.append(heading_node("⚠️ Risk & Threat Analysis", 2))
    risk_desc = risk_summary or "Unmitigated cloud misconfiguration posing immediate compliance and security risk."
    content.append(paragraph_nodes([text_node(risk_desc)]))
    if ai_reasoning:
        content.append(paragraph_nodes([text_node("AI Threat Reasoning: ", bold=True), text_node(ai_reasoning)]))

    # 5. AI Recommended Fix
    content.append(heading_node("🔧 AI Recommended Fix", 2))
    content.append(paragraph_nodes([text_node(recommended_fix)]))

    if code_snippet:
        content.append({
            "type": "codeBlock",
            "attrs": {"language": "terraform"},
            "content": [{"type": "text", "text": code_snippet.strip()}],
        })

    # 6. Telemetry & Evidence
    content.append(heading_node("📊 Telemetry & Evidence", 2))
    content.append(paragraph_nodes([text_node(evidence or "Detected during continuous automated posture assessment scan.")]))

    # 7. Validation Steps
    content.append(heading_node("✅ Validation & Verification Steps", 2))
    steps = validation_steps or [
        "Apply the recommended configuration changes.",
        "Verify the modified resource state in the cloud provider console.",
        "Trigger an on-demand Digital CISO scan to verify compliance.",
        "Ensure finding check status transitions from FAIL to PASS.",
    ]
    content.append({
        "type": "orderedList",
        "content": [
            {"type": "listItem", "content": [paragraph_nodes([text_node(s)])]}
            for s in steps
        ],
    })

    # Footer rule
    content.append({"type": "rule"})
    content.append(paragraph_nodes([text_node("Generated by Digital CISO Autonomous Remediation Engine", bold=True)]))

    return {
        "version": 1,
        "type": "doc",
        "content": content,
    }
