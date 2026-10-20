"""NCA control catalog: loads the vendored Prowler NCA framework files for OCI and
overlays the platform supplement mapping. Nothing here is network- or DB-dependent."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

COMPLIANCE_DIR = Path(__file__).resolve().parents[2] / "prowler" / "compliance" / "oraclecloud"
SUPPLEMENT_FILE = Path(__file__).with_name("supplement_mapping.json")

# framework key -> (source file, supplement section)
FRAMEWORK_FILES = {
    "nca_ecc_2.2024": ("nca_ecc_2.2024_oraclecloud.json", "common"),
    "nca_ecc_1.2018": ("nca_ecc_1.2018_oraclecloud.json", "common"),
    "nca_ccc_2.2024": ("nca_cscc_1.2024_oraclecloud.json", "nca_ccc_2.2024"),
}

# Check ids implemented by this platform (not Prowler); see nca/native_checks.py.
NATIVE_CHECK_PREFIX = "oci_"


@dataclass
class Control:
    framework: str
    control_id: str
    name: str
    description: str
    section: str
    subsection: str
    service: str
    assessment_type: str  # "Manual" or "Automated"
    framework_checks: list[str] = field(default_factory=list)
    supplement_checks: list[str] = field(default_factory=list)
    supplement_rationale: str = ""
    scope: str = "partial"  # automated checks only evidence the technical portion
    workbook_checks: list[str] = field(default_factory=list)
    workbook_rows: list[str] = field(default_factory=list)  # workbook sub-control ids that feed this control
    workbook_detail: list[dict] = field(default_factory=list)
    parent_id: str = ""        # set for official sub-controls (e.g. 2-2-3-2 -> 2-2-3)
    is_container: bool = False  # main control that is made up of sub-controls
    text_source: str = ""

    @property
    def checks(self) -> list[str]:
        out = list(self.framework_checks)
        out += [c for c in self.supplement_checks if c not in out]
        out += [c for c in self.workbook_checks if c not in out]
        return out

    def check_source(self, check_id: str) -> str:
        if check_id in self.framework_checks:
            return "framework"
        return "platform-supplement" if check_id in self.supplement_checks else "workbook"

    def as_dict(self) -> dict:
        return {
            "framework": self.framework,
            "control_id": self.control_id,
            "name": self.name,
            "description": self.description,
            "section": self.section,
            "subsection": self.subsection,
            "service": self.service,
            "assessment_type": self.assessment_type,
            "checks": self.checks,
            "framework_checks": self.framework_checks,
            "supplement_checks": self.supplement_checks,
            "supplement_rationale": self.supplement_rationale,
            "workbook_checks": self.workbook_checks,
            "workbook_rows": self.workbook_rows,
            "workbook_detail": self.workbook_detail,
            "parent_id": self.parent_id,
            "is_container": self.is_container,
            "text_source": self.text_source,
            "scope": self.scope,
            "manual_category": manual_category(self)[0] if not self.checks else "",
            "manual_label": manual_category(self)[1] if not self.checks else "",
        }


MANUAL_LABELS = {
    "periodic_review": "Periodic review — evidence of the review (minutes, sign-off)",
    "governance": "Governance / organisation — documents and records, not an OCI configuration",
    "hr": "Human resources — HR process evidence",
    "third_party": "Third-party / supplier contracts — contractual evidence",
    "physical_security": "Physical security — OCI data centres are Oracle's responsibility (attestation reports); tenant premises need evidence",
    "mobile_devices": "Mobile devices / BYOD — managed by MDM outside OCI",
    "penetration_testing": "Penetration testing — test reports and scope; not visible through OCI APIs",
    "ics": "Industrial control systems — outside cloud infrastructure (candidate for not applicable)",
    "policy": "Policy definition and approval — approved document required",
    "implementation": "Implementation of the policy — process evidence required",
    "process_evidence": "Process control — evidence required; no OCI API exposes it",
}


def manual_category(c: "Control") -> tuple[str, str]:
    """Why a control with no OCI check cannot be verified automatically (category, label)."""
    text = f"{c.name} {c.description}".lower()
    parts = c.control_id.split("-")
    domain, sub = parts[0], "-".join(parts[:2])
    if any(p in text for p in ("periodic review", "periodically reviewed", "reviewed at planned intervals", "periodic internal")):
        cat = "periodic_review"
    elif c.framework.startswith("nca_ecc") and domain == "5":
        cat = "ics"
    elif sub in ("1-9", "1-10"):
        cat = "hr"
    elif domain == "1":
        cat = "governance"
    elif sub == "2-14":
        cat = "physical_security"
    elif sub == "2-6":
        cat = "mobile_devices"
    elif sub == "2-11":
        cat = "penetration_testing"
    elif sub == "4-1":
        cat = "third_party"
    elif "identified, documented, and approved" in text or ("policy" in c.name.lower() and "implementation" not in c.name.lower()):
        cat = "policy"
    elif "shall be implemented" in text or "implementation" in c.name.lower():
        cat = "implementation"
    else:
        cat = "process_evidence"
    return cat, MANUAL_LABELS[cat]


@dataclass
class Framework:
    key: str
    name: str
    version: str
    description: str
    source_file: str
    controls: list[Control]

    def as_dict(self, with_controls: bool = False) -> dict:
        d = {
            "key": self.key,
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "source_file": self.source_file,
            "control_count": len(self.controls),
            "automated_control_count": sum(1 for c in self.controls if c.checks),
            "manual_only_control_count": sum(1 for c in self.controls if not c.checks),
            "check_count": len({k for c in self.controls for k in c.checks}),
        }
        if with_controls:
            d["controls"] = [c.as_dict() for c in self.controls]
        return d


@lru_cache(maxsize=1)
def _supplement() -> dict:
    return json.loads(SUPPLEMENT_FILE.read_text(encoding="utf-8"))


@lru_cache(maxsize=None)
def load_framework(key: str) -> Framework:
    if key not in FRAMEWORK_FILES:
        raise KeyError(f"Unknown NCA framework '{key}'. Available: {sorted(FRAMEWORK_FILES)}")
    filename, supp_key = FRAMEWORK_FILES[key]
    raw = json.loads((COMPLIANCE_DIR / filename).read_text(encoding="utf-8", errors="replace"))
    supp = _supplement().get(supp_key, {})
    controls: list[Control] = []
    for req in raw["Requirements"]:
        attrs = (req.get("Attributes") or [{}])[0]
        s = supp.get(req["Id"], {})
        fw_checks = list(req.get("Checks") or [])
        controls.append(
            Control(
                framework=key,
                control_id=req["Id"],
                name=req["Name"].strip(),
                description=req.get("Description", ""),
                section=attrs.get("Section", ""),
                subsection=attrs.get("SubSection", ""),
                service=attrs.get("Service", ""),
                assessment_type=req.get("AssessmentType") or ("Automated" if fw_checks else "Manual"),
                framework_checks=fw_checks,
                supplement_checks=[c for c in s.get("checks", []) if c not in fw_checks],
                supplement_rationale=s.get("rationale", ""),
            )
        )
    if key == "nca_ecc_2.2024":
        controls = _official_2024(controls, supp)
    if key.startswith("nca_ecc"):
        _merge_workbook(controls)
    return Framework(
        key=key,
        name=raw["Name"],
        version=raw["Version"],
        description=raw.get("Description", ""),
        source_file=filename,
        controls=controls,
    )


OFFICIAL_2024_FILE = Path(__file__).with_name("ecc2024_official.json")
# Prowler's framework file follows the 2018 numbering for these ids; in ECC-2:2024 their meaning changed
# (2-7-3 is now the periodic review, the old data-ownership/classification/privacy sub-controls were removed).
_PROWLER_MISMATCH_2024 = {"2-7-3"}


def _short(text: str) -> str:
    t = re.sub(r"\s+(shall|must)\s+include\s+(the following|at least)[^:]*:?$", "", text.strip(), flags=re.I)
    t = re.split(r"(?<=[.;])\s", t)[0].rstrip(".:;")
    return t if len(t) <= 110 else t[:107].rstrip() + "..."


def _idkey(i: str) -> list[int]:
    return [int(p) for p in i.split("-")]


def _official_2024(prowler_controls: list[Control], supp: dict) -> list[Control]:
    """Rebuild ECC-2:2024 from the official NCA document: its 108 main controls and 91 sub-controls (with their
    official wording). Prowler's check mapping is kept for main controls whose meaning is unchanged."""
    off = json.loads(OFFICIAL_2024_FILE.read_text(encoding="utf-8"))
    prowler = {c.control_id: c for c in prowler_controls}
    with_subs = {sc["parent"] for sc in off["subcontrols"]}
    out: list[Control] = []
    for oc in off["controls"]:
        base = prowler.get(oc["id"])
        skip = oc["id"] in _PROWLER_MISMATCH_2024
        fw = [] if (skip or base is None) else list(base.framework_checks)
        sp = {} if skip else supp.get(oc["id"], {})
        out.append(Control(
            framework="nca_ecc_2.2024", control_id=oc["id"], name=_short(oc["text"]), description=oc["text"],
            section=base.section if base else "", subsection=base.subsection if base else "", service=base.service if base else "",
            assessment_type="Manual", framework_checks=fw,
            supplement_checks=[c for c in sp.get("checks", []) if c not in fw], supplement_rationale=sp.get("rationale", ""),
            is_container=oc["id"] in with_subs, text_source="NCA ECC-2:2024 document"))
    by = {c.control_id: c for c in out}
    for sc in off["subcontrols"]:
        p = by[sc["parent"]]
        out.append(Control(
            framework="nca_ecc_2.2024", control_id=sc["id"], name=_short(sc["text"]), description=sc["text"],
            section=p.section, subsection=p.subsection, service=p.service, assessment_type="Manual",
            parent_id=sc["parent"], text_source="NCA ECC-2:2024 document"))
    out.sort(key=lambda c: _idkey(c.control_id))
    for c in out:
        c.assessment_type = "Automated" if c.checks else "Manual"
    return out


# workbook rows keyed by a sub-domain id are evidence for the control that implements it
_WORKBOOK_ALIAS = {"2-1": "2-1-2"}


def _merge_workbook(controls: list[Control]) -> None:
    """Attach workbook rows (and their OCI checks) to the main control and, when the official sub-control exists,
    to that sub-control too (workbook "2-2-3.2" == official sub-control 2-2-3-2)."""
    by_id = {c.control_id: c for c in controls}
    for r in load_api_rows():
        targets = []
        parent = by_id.get(_WORKBOOK_ALIAS.get(r["control_id"], r["control_id"]))
        if parent is not None:
            targets.append(parent)
        sub = by_id.get(r["sub_control"].replace(".", "-")) if "." in r["sub_control"] else None
        if sub is not None and sub is not parent:
            targets.append(sub)
        detail = {"sub_control": r["sub_control"], "api_check": r["api_check"], "automation_level": r["automation_level"],
                  "pass_condition": r["pass_condition"], "fail_condition": r["fail_condition"], "oci_api": r["oci_api"],
                  "evidence_source": r["evidence_source"], "notes": " ".join(x for x in (r["notes"], r["mapping_note"]) if x)}
        for c in targets:
            c.workbook_rows.append(r["sub_control"])
            c.workbook_detail.append(detail)
            for chk in r["checks"]:
                if chk not in c.framework_checks and chk not in c.supplement_checks and chk not in c.workbook_checks:
                    c.workbook_checks.append(chk)


def list_frameworks() -> list[Framework]:
    return [load_framework(k) for k in FRAMEWORK_FILES]


API_ROWS_FILE = Path(__file__).with_name("ecc2024_api_mapping.json")
API_MAP_FILE = Path(__file__).with_name("ecc2024_api_check_map.json")
API_FRAMEWORK = "nca_ecc_2.2024"


@lru_cache(maxsize=1)
def load_api_rows() -> list[dict]:
    """Sub-control rows from the ECC-2:2024 Cloud API Automation Mapping workbook, each with the
    implemented OCI checks (if any) that realise it."""
    rows = json.loads(API_ROWS_FILE.read_text(encoding="utf-8"))["rows"]
    cmap = json.loads(API_MAP_FILE.read_text(encoding="utf-8"))["map"]
    out = []
    for r in rows:
        m = cmap.get(r["api_check"], {})
        out.append({**r, "checks": m.get("checks", []), "coverage": m.get("coverage", ""), "mapping_note": m.get("note", "")})
    return out


def all_check_ids(frameworks: list[str] | None = None) -> list[str]:
    seen: dict[str, None] = {}
    if API_FRAMEWORK in (frameworks or FRAMEWORK_FILES):
        for r in load_api_rows():
            for chk in r["checks"]:
                seen.setdefault(chk)
    for key in frameworks or FRAMEWORK_FILES:
        for c in load_framework(key).controls:
            for chk in c.checks:
                seen.setdefault(chk)
    return sorted(seen)


def get_control(framework: str, control_id: str) -> Control | None:
    return next((c for c in load_framework(framework).controls if c.control_id == control_id), None)
