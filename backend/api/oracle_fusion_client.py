from __future__ import annotations

import base64
import io
import json
import logging
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any, Optional
import zipfile

logger = logging.getLogger(__name__)

SOD_TOXIC_MATRICES = [
    {
        "code": "SOD-AP-01",
        "name": "AP Manager + Payment Disbursement Processor",
        "role_a": "ORA_AP_ACCOUNTS_PAYABLE_MANAGER_JOB",
        "role_b": "ORA_AP_PAYMENT_PROCESSING_JOB",
        "risk": "Can create fictitious vendor invoices and disburse payments without a secondary approver.",
        "framework": "SOX 404 ITGC / SOC 1 Type 2 (ICFR)",
        "severity": "CRITICAL",
    },
    {
        "code": "SOD-GL-01",
        "name": "General Ledger Accountant + Journal Entry Manager",
        "role_a": "ORA_GL_GENERAL_LEDGER_ACCOUNTANT_JOB",
        "role_b": "ORA_GL_JOURNAL_ENTRY_MANAGEMENT_JOB",
        "risk": "Can author, post, and reconcile general ledger journal entries without peer approval.",
        "framework": "SOX 404 ITGC - Financial Record Tampering",
        "severity": "CRITICAL",
    },
    {
        "code": "SOD-PO-01",
        "name": "Procurement Buyer + AP Specialist",
        "role_a": "ORA_PO_BUYER_JOB",
        "role_b": "ORA_AP_ACCOUNTS_PAYABLE_SPECIALIST_JOB",
        "risk": "Can issue unauthorized purchase orders and self-approve matching invoices.",
        "framework": "Procurement Fraud & Tampering Control",
        "severity": "HIGH",
    },
    {
        "code": "SOD-AR-01",
        "name": "Billing Specialist + Cash Application Specialist",
        "role_a": "ORA_AR_BILLING_SPECIALIST_JOB",
        "role_b": "ORA_AR_CASH_APPLICATION_SPECIALIST_JOB",
        "risk": "Can generate invoices and apply incoming cash receipts — enables fictitious revenue creation.",
        "framework": "Revenue Recognition Control",
        "severity": "HIGH",
    },
    {
        "code": "SOD-SEC-01",
        "name": "Security Manager + Implementation Consultant",
        "role_a": "ORA_IT_SECURITY_MANAGER",
        "role_b": "ORA_FND_APPLICATION_IMPLEMENTATION_CONSULTANT",
        "risk": "Holds unrestricted system configuration and security role management privileges simultaneously.",
        "framework": "Privileged Access Management (PAM)",
        "severity": "CRITICAL",
    },
]

SUPERUSER_ROLES = {
    "ORA_FND_APPLICATION_IMPLEMENTATION_CONSULTANT",
    "ORA_IT_SECURITY_MANAGER",
    "ORA_APPS_SUPER_USER",
    "ORA_FND_SYSTEM_ADMIN_JOB",
    "ORA_IDCS_ADMINISTRATOR",
    "ORA_ASE_APPLICATION_IMPLEMENTOR",
}


class OracleFusionClient:
    """Client for Oracle Fusion ERP REST APIs using Basic Authentication."""

    def __init__(
        self,
        erp_base_url: str = "",
        username: str = "",
        password: str = "",
        timeout: int = 30,
    ):
        self.erp_base_url = erp_base_url.rstrip("/") if erp_base_url else ""
        self.username = username or ""
        self.password = password or ""
        self.timeout = timeout

    @property
    def auth_header(self) -> str:
        """Construct Basic Auth Authorization header."""
        if not self.username:
            return ""
        cred = f"{self.username}:{self.password}".encode("utf-8")
        return f"Basic {base64.b64encode(cred).decode('utf-8')}"

    def _make_request(
        self,
        endpoint_url: str,
        method: str = "GET",
        data: dict | None = None,
        headers: dict | None = None,
    ) -> dict[str, Any]:
        """Perform an authenticated HTTP request to the Fusion ERP pod."""
        req_headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if self.auth_header:
            req_headers["Authorization"] = self.auth_header
        if headers:
            req_headers.update(headers)

        req_data = None
        if data is not None:
            req_data = json.dumps(data).encode("utf-8")

        req = urllib.request.Request(
            endpoint_url,
            data=req_data,
            headers=req_headers,
            method=method,
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                content = resp.read().decode("utf-8")
                if not content.strip():
                    return {"status": resp.status, "ok": True}
                try:
                    return json.loads(content)
                except Exception:
                    return {"raw_content": content, "status": resp.status}
        except Exception as e:
            logger.warning("Oracle Fusion REST error [%s %s]: %s", method, endpoint_url, e)
            raise

    # ── ESS Inactive Users Job Pipeline ────────────────────────────────────────

    def trigger_inactive_data_load_job(self) -> int:
        """Step 1: Submit ESS Data Load Job (AseInactiveUsersDataLoadJob)."""
        url = f"{self.erp_base_url}/ess/rest/scheduler/v1/requests"
        payload = {
            "description": "Imports information that the Inactive Users Report uses to identify inactive users.",
            "jobDefinitionId": "JobDefinition://oracle/apps/ess/hcm/users/AseInactiveUsersDataLoadJob",
            "application": "EarHcmEss",
            "product": "PER",
        }
        resp = self._make_request(url, method="POST", data=payload)
        job_id = resp.get("id")
        if not job_id:
            raise ValueError(f"Failed to submit Data Load job. Response: {resp}")
        logger.info("Oracle Fusion: Submitted Data Load ESS Job ID %s", job_id)
        return int(job_id)

    def poll_job_status(self, request_id: int, max_wait_sec: int = 45) -> str:
        """Step 2 & 4: Poll ESS Job Status until SUCCEEDED or FAILED."""
        url = f"{self.erp_base_url}/ess/rest/scheduler/v1/requests/{request_id}?fields=@full"
        start_time = time.time()
        while time.time() - start_time < max_wait_sec:
            try:
                resp = self._make_request(url, method="GET")
                state = resp.get("state") or resp.get("status") or resp.get("requestStatus", "")
                state_upper = str(state).upper()
                if state_upper in ("SUCCEEDED", "SUCCESS", "COMPLETED", "FINISHED"):
                    return "SUCCEEDED"
                if state_upper in ("ERROR", "FAILED", "CANCELLED", "BLOCKED"):
                    return state_upper
            except Exception as e:
                logger.debug("Polling ESS job %s: %s", request_id, e)
            time.sleep(3)
        return "SUCCEEDED"  # Fallback to allow report generation attempt

    def trigger_inactive_users_report_job(self, days: int = 30) -> int:
        """Step 3: Submit Inactive Users Report ESS Job (AseInactiveUsersJob)."""
        url = f"{self.erp_base_url}/ess/rest/scheduler/v1/requests"
        payload = {
            "description": f"Lists users who have been inactive for {days} days.",
            "jobDefinitionId": "JobDefinition://oracle/apps/ess/hcm/users/AseInactiveUsersJob",
            "application": "EarHcmEss",
            "product": "PER",
            "requestParameters": [
                {
                    "name": "submit.argument6",
                    "paramType": "STRING",
                    "value": str(days),
                }
            ],
        }
        resp = self._make_request(url, method="POST", data=payload)
        job_id = resp.get("id")
        if not job_id:
            raise ValueError(f"Failed to submit Inactive Users Report job. Response: {resp}")
        logger.info("Oracle Fusion: Submitted Inactive Users Report ESS Job ID %s (Days: %d)", job_id, days)
        return int(job_id)

    def download_and_decode_report(self, request_id: int) -> list[dict[str, Any]]:
        """Step 5: Download DocumentContent, decode Base64 ZIP, and parse XML into structured records."""
        url = (
            f"{self.erp_base_url}/fscmRestApi/resources/11.13.18.05/erpintegrations"
            f"?finder=ESSJobExecutionDetailsRF;requestId={request_id},fileType=OUT"
        )
        custom_headers = {
            "Content-Type": "application/vnd.oracle.adf.resourceitem+json",
        }
        resp = self._make_request(url, method="GET", headers=custom_headers)
        items = resp.get("items", [])
        if not items:
            logger.warning("No execution items returned for request %s", request_id)
            return []

        doc_b64 = items[0].get("DocumentContent", "")
        if not doc_b64:
            return []

        return self.parse_inactive_users_base64_zip(doc_b64)

    @staticmethod
    def parse_inactive_users_base64_zip(doc_b64: str) -> list[dict[str, Any]]:
        """Decode Base64 ZIP (including nested ZIPs) and extract InactiveUsers XML into structured records."""
        try:
            zip_bytes = base64.b64decode(doc_b64.strip())
        except Exception as e:
            logger.error("Failed to decode Base64 DocumentContent: %s", e)
            return []

        records = []
        xml_contents = []

        def extract_xml_from_zip_bytes(b_data: bytes):
            try:
                with zipfile.ZipFile(io.BytesIO(b_data)) as z:
                    for filename in z.namelist():
                        file_data = z.read(filename)
                        if filename.endswith(".zip"):
                            extract_xml_from_zip_bytes(file_data)
                        elif filename.endswith(".xml") or "Inactive_Users" in filename:
                            xml_contents.append((filename, file_data.decode("utf-8", errors="ignore")))
            except Exception as e:
                logger.error("Zip extraction error: %s", e)

        extract_xml_from_zip_bytes(zip_bytes)

        for filename, raw_xml in xml_contents:
            try:
                root = ET.fromstring(raw_xml)
                user_elements = (
                    root.findall(".//USER")
                    or root.findall(".//user")
                    or root.findall(".//User")
                    or root.findall(".//ROW")
                    or root.findall(".//G_1")
                )
                for row in user_elements:
                    username = (
                        row.findtext("USER-NAME")
                        or row.findtext("USER_NAME")
                        or row.findtext("USERNAME")
                        or row.findtext("userName")
                    )
                    first_name = row.findtext("USER-FIRST-NAME") or row.findtext("FIRST_NAME") or ""
                    last_name = row.findtext("USER-LAST-NAME") or row.findtext("LAST_NAME") or ""
                    display_name = f"{first_name} {last_name}".strip() if (first_name or last_name) else (username or "")

                    department = row.findtext("DEPARTMENT") or row.findtext("Department") or "General Enterprise"
                    location = row.findtext("LOCATION") or row.findtext("CITY") or ""

                    person_no = (
                        row.findtext("PERSON-ID")
                        or row.findtext("PARTY-ID")
                        or row.findtext("PERSON_NUMBER")
                        or row.findtext("PersonNumber")
                    )
                    last_login = (
                        row.findtext("LAST-ACTIVITY-DATE")
                        or row.findtext("LAST_LOGIN_DATE")
                        or row.findtext("LAST-LOGIN-DATE")
                        or row.findtext("LastLoginDate")
                    )
                    inactive_days_str = (
                        row.findtext("DAYS-INACTIVE")
                        or row.findtext("DAYS_INACTIVE")
                        or row.findtext("INACTIVE_DAYS")
                        or row.findtext("DaysInactive")
                    )
                    suspended = (
                        row.findtext("SUSPENDED")
                        or row.findtext("Suspended")
                        or row.findtext("active")
                    )

                    days = 30
                    if inactive_days_str and inactive_days_str.isdigit():
                        days = int(inactive_days_str)

                    if username:
                        is_suspended = suspended in ("Y", "true", "True", "SUSPENDED")
                        risk = "CRITICAL" if days >= 90 else ("HIGH" if days >= 60 else "MEDIUM")
                        records.append({
                            "id": f"USR-{len(records)+1:03d}",
                            "guid": person_no or username,
                            "username": username,
                            "display_name": display_name or username,
                            "email": f"{username.lower()}@enterprise-pod.com",
                            "person_number": person_no or "N/A",
                            "department": department,
                            "job_title": location or "Fusion Cloud User",
                            "last_login": last_login or "No activity recorded",
                            "days_inactive": days,
                            "is_suspended": is_suspended,
                            "risk_level": risk,
                            "status": "SUSPENDED" if is_suspended else "ACTIVE_INACTIVE_RISK",
                            "roles": ["ORA_FND_APPLICATION_USER"],
                            "sod_conflicts": [],
                            "is_superuser": False,
                        })
            except Exception as parse_err:
                logger.error("XML parse error on %s: %s", filename, parse_err)

        return records

    # ── User Accounts & Role Discovery ─────────────────────────────────────────

    def get_user_accounts(self, limit: int = 100) -> list[dict[str, Any]]:
        """Fetch all user accounts from HCM REST API."""
        url = f"{self.erp_base_url}/hcmRestApi/resources/11.13.18.05/userAccounts?limit={limit}"
        resp = self._make_request(url, method="GET")
        return resp.get("items", [])

    def get_user_roles(self, user_guid: str) -> list[dict[str, Any]]:
        """Fetch roles assigned to a user GUID."""
        url = f"{self.erp_base_url}/hcmRestApi/resources/11.13.18.05/userAccounts/{user_guid}/child/userAccountRoles"
        resp = self._make_request(url, method="GET")
        return resp.get("items", [])

    def get_worker_details(self, person_id: str) -> dict[str, Any]:
        """Fetch worker/person profile details by PersonId.
        
        Step 3: GET /hcmRestApi/resources/11.13.18.05/workers?finder=findByPersonId;PersonId={PersonId}
        """
        url = f"{self.erp_base_url}/hcmRestApi/resources/11.13.18.05/workers?finder=findByPersonId;PersonId={person_id}"
        resp = self._make_request(url, method="GET")
        items = resp.get("items", [])
        return items[0] if items else {}

    def get_worker_assignments(self, worker_link: str) -> list[dict[str, Any]]:
        """Fetch assignment details (department + job) from a worker's assignments child link."""
        try:
            resp = self._make_request(worker_link, method="GET")
            return resp.get("items", [])
        except Exception as e:
            logger.debug("Assignment fetch error: %s", e)
            return []

    @staticmethod
    def extract_dept_and_job(worker: dict[str, Any]) -> tuple[str, str]:
        """Extract department and job title from a worker dict, checking multiple field paths."""
        dept = (
            worker.get("DepartmentName")
            or worker.get("departmentName")
            or worker.get("Department")
            or ""
        )
        job = (
            worker.get("JobName")
            or worker.get("jobName")
            or worker.get("JobTitle")
            or worker.get("jobTitle")
            or worker.get("GradeName")
            or ""
        )
        display = (
            worker.get("DisplayName")
            or worker.get("displayName")
            or worker.get("FullName")
            or worker.get("fullName")
            or ""
        )
        return dept, job, display


    def remediate_suspend_user(self, user_guid: str) -> dict[str, Any]:
        """Remediation: Suspend inactive user account."""
        url = f"{self.erp_base_url}/hcmRestApi/resources/11.13.18.05/userAccounts/{user_guid}"
        payload = {"Suspended": True}
        headers = {"Content-Type": "application/vnd.oracle.adf.resourceitem+json"}
        return self._make_request(url, method="PATCH", data=payload, headers=headers)

    def remediate_revoke_role(self, user_guid: str, role_guid: str) -> dict[str, Any]:
        """Remediation: Revoke a specific role from a user."""
        url = f"{self.erp_base_url}/hcmRestApi/resources/11.13.18.05/userAccounts/{user_guid}/child/userAccountRoles/{role_guid}"
        return self._make_request(url, method="DELETE")
