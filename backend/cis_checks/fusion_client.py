"""Oracle Fusion pod REST client for the Inactive Users Report (ESS), ported from
security_platform's backend/api/oracle_fusion_client.py.

Pipeline (same as the platform):
  1. POST ess/rest/scheduler/v1/requests  AseInactiveUsersDataLoadJob   (refreshes the data)
  2. poll the request until it finishes
  3. POST ess/rest/scheduler/v1/requests  AseInactiveUsersJob(days)     (the report)
  4. poll the request until it finishes
  5. GET  fscmRestApi/.../erpintegrations?finder=ESSJobExecutionDetailsRF  -> Base64 ZIP -> XML rows

Differences from the platform version: TLS certificates are verified, a job that does not
finish in time is an error (not assumed successful), and a row without a days-inactive value
is reported as unknown instead of defaulting to 30.

Configuration: ORACLE_FUSION_POD_URL, ORACLE_FUSION_USERNAME, ORACLE_FUSION_PASSWORD (the same
variable names security_platform uses). The password is never logged or returned.
"""
import base64
import io
import logging
import os
import time
import xml.etree.ElementTree as ET
import zipfile

import requests

from .base import env_int

log = logging.getLogger(__name__)

ESS_REQUESTS = "/ess/rest/scheduler/v1/requests"
USER_ACCOUNTS = "/hcmRestApi/resources/11.13.18.05/userAccounts"
# Role catalogue for CIS 4.1.3, tried in order: Fusion SCIM Roles, then the HCM REST roles resource.
# FUSION_ROLES_PATH points at one specific resource instead.
ROLE_SOURCES = ["/hcmRestApi/scim/Roles", "/hcmRestApi/resources/11.13.18.05/roles"]
USER_ACCOUNT_FIELDS = "GUID,Username,SuspendedFlag,PersonNumber;userAccountRoles:UserRoleId,RoleCode,CreationDate,CreatedBy"
DATA_LOAD_JOB = "JobDefinition://oracle/apps/ess/hcm/users/AseInactiveUsersDataLoadJob"
REPORT_JOB = "JobDefinition://oracle/apps/ess/hcm/users/AseInactiveUsersJob"
DONE = {"SUCCEEDED", "SUCCESS", "COMPLETED", "FINISHED"}
FAILED = {"ERROR", "FAILED", "CANCELLED", "BLOCKED", "WARNING"}


class FusionError(RuntimeError):
    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


def _first(row, *names):
    for n in names:
        value = row.findtext(n)
        if value not in (None, ""):
            return value.strip()
    return None


def parse_inactive_users_report(doc_b64):
    """Decode the Base64 ZIP (nested ZIPs included) and return one dict per user row."""
    try:
        data = base64.b64decode(doc_b64.strip())
    except ValueError as exc:
        raise FusionError(f"Report content is not valid Base64: {exc}") from exc

    xml_docs = []

    def walk(blob):
        with zipfile.ZipFile(io.BytesIO(blob)) as z:
            for name in z.namelist():
                content = z.read(name)
                if name.lower().endswith(".zip"):
                    walk(content)
                elif name.lower().endswith(".xml") or "inactive_users" in name.lower():
                    xml_docs.append(content.decode("utf-8", errors="ignore"))

    walk(data)
    records = []
    for raw in xml_docs:
        root = ET.fromstring(raw)
        rows = root.findall(".//USER") or root.findall(".//user") or root.findall(".//User") or root.findall(".//ROW") or root.findall(".//G_1")
        for row in rows:
            username = _first(row, "USER-NAME", "USER_NAME", "USERNAME", "userName")
            if not username:
                continue
            days = _first(row, "DAYS-INACTIVE", "DAYS_INACTIVE", "INACTIVE_DAYS", "DaysInactive")
            suspended = _first(row, "SUSPENDED", "Suspended")
            records.append(
                {
                    "user": username,
                    "person_number": _first(row, "PERSON-ID", "PARTY-ID", "PERSON_NUMBER", "PersonNumber"),
                    "last_sign_in": _first(row, "LAST-ACTIVITY-DATE", "LAST_LOGIN_DATE", "LAST-LOGIN-DATE", "LastLoginDate"),
                    "days_inactive": int(days) if days and days.isdigit() else None,
                    "suspended": (suspended or "").upper() in ("Y", "TRUE", "SUSPENDED"),
                    "department": _first(row, "DEPARTMENT", "Department"),
                }
            )
    return records


class FusionClient:
    def __init__(self, pod_url=None, username=None, password=None, timeout=30, session=None):
        self.pod_url = (pod_url if pod_url is not None else os.environ.get("ORACLE_FUSION_POD_URL", "")).rstrip("/")
        self._username = username if username is not None else os.environ.get("ORACLE_FUSION_USERNAME", "")
        self._password = password if password is not None else os.environ.get("ORACLE_FUSION_PASSWORD", "")
        self.timeout = timeout
        self._session = session or requests.Session()

    def __repr__(self):
        return f"FusionClient(pod_url={self.pod_url!r})"

    @property
    def configured(self):
        return bool(self.pod_url and self._username and self._password)

    def _request(self, method, path, json=None, headers=None):
        resp = self._session.request(
            method,
            path if path.startswith("http") else f"{self.pod_url}{path}",
            json=json,
            auth=(self._username, self._password),
            headers={"Accept": "application/json", **(headers or {})},
            timeout=self.timeout,
        )
        if resp.status_code >= 400:
            raise FusionError(f"{method} {path.split('?')[0]} returned HTTP {resp.status_code}", resp.status_code)
        return resp.json() if resp.content.strip() else {}

    def submit(self, job_definition, description, parameters=None):
        payload = {"description": description, "jobDefinitionId": job_definition, "application": "EarHcmEss", "product": "PER"}
        if parameters:
            payload["requestParameters"] = parameters
        body = self._request("POST", ESS_REQUESTS, json=payload)
        if not body.get("id"):
            raise FusionError(f"ESS did not return a request id for {job_definition.rsplit('/', 1)[-1]}")
        return int(body["id"])

    def wait(self, request_id, max_wait):
        deadline = time.monotonic() + max_wait
        state = "UNKNOWN"
        while time.monotonic() < deadline:
            body = self._request("GET", f"{ESS_REQUESTS}/{request_id}?fields=@full")
            state = str(body.get("state") or body.get("status") or body.get("requestStatus") or "").upper()
            if state in DONE:
                return state
            if state in FAILED:
                raise FusionError(f"ESS request {request_id} ended in state {state}")
            time.sleep(5)
        raise FusionError(f"ESS request {request_id} did not finish within {max_wait}s (last state {state})")

    def download(self, request_id):
        body = self._request(
            "GET",
            f"/fscmRestApi/resources/11.13.18.05/erpintegrations?finder=ESSJobExecutionDetailsRF;requestId={request_id},fileType=OUT",
            headers={"Content-Type": "application/vnd.oracle.adf.resourceitem+json"},
        )
        items = body.get("items") or []
        content = items[0].get("DocumentContent") if items else None
        if not content:
            raise FusionError(f"ESS request {request_id} produced no report output")
        return parse_inactive_users_report(content)

    def inactive_users(self, days):
        """Run the data load and the Inactive Users Report; return (records, job ids)."""
        max_wait = env_int("FUSION_ESS_TIMEOUT", 600)
        load_id = self.submit(DATA_LOAD_JOB, "Imports information that the Inactive Users Report uses to identify inactive users.")
        self.wait(load_id, max_wait)
        report_id = self.submit(
            REPORT_JOB,
            f"Lists users who have been inactive for {days} days.",
            [{"name": "submit.argument6", "paramType": "STRING", "value": str(days)}],
        )
        self.wait(report_id, max_wait)
        log.info("Fusion Inactive Users Report finished (data load %s, report %s)", load_id, report_id)
        return self.download(report_id), {"data_load": load_id, "report": report_id}

    def user_roles(self):
        """Every user account with its role assignments (HCM REST userAccounts + userAccountRoles)."""
        users, offset = [], 0
        while True:
            body = self._request(
                "GET", f"{USER_ACCOUNTS}?limit=500&offset={offset}&onlyData=true&expand=userAccountRoles&fields={USER_ACCOUNT_FIELDS}"
            )
            items = body.get("items") or []
            for u in items:
                users.append(
                    {
                        "user": u.get("Username"),
                        "guid": u.get("GUID"),
                        "person_number": u.get("PersonNumber"),
                        "suspended": bool(u.get("SuspendedFlag")),
                        "roles": [
                            {
                                "code": r.get("RoleCode"),
                                "user_role_id": r.get("UserRoleId"),
                                "assigned": r.get("CreationDate"),
                                "assigned_by": r.get("CreatedBy"),
                            }
                            for r in u.get("userAccountRoles") or []
                            if r.get("RoleCode")
                        ],
                    }
                )
            if not body.get("hasMore") or not items:
                return users
            offset += len(items)

    def roles(self):
        """Every role defined on the pod: ([{code, name, category}], source path).

        Raises FusionError when no role source answers (404 on each, or any other HTTP error).
        """
        custom = os.environ.get("FUSION_ROLES_PATH", "").strip()
        tried = []
        for path in [custom] if custom else ROLE_SOURCES:
            try:
                return (self._scim_roles(path) if "/scim/" in path else self._rest_roles(path)), path
            except FusionError as exc:
                if exc.status != 404:
                    raise
                tried.append(path)
        raise FusionError(f"No role catalogue on this pod (HTTP 404 on {', '.join(tried)})", 404)

    def _scim_roles(self, path):
        roles, start = [], 1
        while True:
            body = self._request("GET", f"{path}?startIndex={start}&count=500&attributes=name,displayName,category")
            items = body.get("Resources") or []
            roles += [
                {"code": r.get("name"), "name": r.get("displayName"), "category": (r.get("category") or "").upper()}
                for r in items
                if r.get("name")
            ]
            start += len(items)
            if not items or start > int(body.get("totalResults") or 0):
                return roles

    def _rest_roles(self, path):
        roles, offset = [], 0
        while True:
            body = self._request("GET", f"{path}?limit=500&offset={offset}&onlyData=true")
            items = body.get("items") or []
            for r in items:
                code = r.get("RoleCode") or r.get("RoleCommonName")
                if code:
                    roles.append({"code": code, "name": r.get("RoleName"), "category": str(r.get("RoleCategory") or r.get("Category") or "").upper()})
            if not body.get("hasMore") or not items:
                return roles
            offset += len(items)

    # ---- remediation (the same two actions security_platform offers) ----

    @staticmethod
    def suspend_request(guid):
        """The HCM REST call that suspends a user account (no credentials included)."""
        return {
            "method": "PATCH",
            "endpoint": f"{USER_ACCOUNTS}/{guid}",
            "headers": {"Content-Type": "application/vnd.oracle.adf.resourceitem+json"},
            "payload": {"SuspendedFlag": True},
        }

    @staticmethod
    def revoke_role_request(guid, user_role_id):
        """The HCM REST call that removes one role assignment from a user account."""
        return {"method": "DELETE", "endpoint": f"{USER_ACCOUNTS}/{guid}/child/userAccountRoles/{user_role_id}", "headers": {}, "payload": None}

    def execute(self, req):
        return self._request(req["method"], req["endpoint"], json=req["payload"], headers=req["headers"])
