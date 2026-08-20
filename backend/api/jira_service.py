"""
Jira Cloud Integration Service for Digital CISO Platform.
Handles authentication, project/issue type/assignee synchronization,
ticket creation with structured templates, status polling, and timeline tracking.
"""
import base64
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import requests
from django.conf import settings
from cryptography.fernet import Fernet

logger = logging.getLogger("api.jira_service")

# Initialize Fernet cipher with platform secret key
_fernet = Fernet(settings.SECRETS_ENCRYPTION_KEY.encode())


def encrypt_token(plain_token: str) -> str:
    """Encrypts sensitive Jira API token string into safe base64-encoded encrypted text."""
    if not plain_token:
        return ""
    return _fernet.encrypt(plain_token.encode("utf-8")).decode("utf-8")


def decrypt_token(encrypted_token: str) -> str:
    """Decrypts encrypted Jira API token."""
    if not encrypted_token:
        return ""
    try:
        return _fernet.decrypt(encrypted_token.encode("utf-8")).decode("utf-8")
    except Exception as e:
        logger.error(f"Failed to decrypt Jira API token: {e}")
        return ""


class JiraServiceError(Exception):
    """Custom exception class for Jira API errors with status code and details."""
    def __init__(self, message: str, status_code: Optional[int] = None, details: Optional[Any] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details


class JiraService:
    """
    Client for Atlassian Jira Cloud REST API v3.
    """

    def __init__(self, base_url: str, email: str, api_token: str):
        self.base_url = base_url.rstrip("/") if base_url else ""
        self.email = email.strip() if email else ""
        self.api_token = api_token.strip() if api_token else ""
        self.timeout = 15

    @classmethod
    def from_integration(cls, integration) -> "JiraService":
        """Builds a JiraService instance from an Integration model or tenant config."""
        config = integration.configuration or {}
        credentials = integration.credentials or {}
        
        base_url = config.get("base_url") or credentials.get("domain") or credentials.get("base_url") or ""
        if base_url and not base_url.startswith("http"):
            base_url = f"https://{base_url}"
        
        email = credentials.get("user_mail") or credentials.get("email") or config.get("email") or ""
        api_token = credentials.get("api_token") or ""
        
        return cls(base_url=base_url, email=email, api_token=api_token)

    def _get_auth_headers(self) -> Dict[str, str]:
        """Generates Basic Authentication header using email and API token."""
        if not self.email or not self.api_token:
            raise JiraServiceError("Jira credentials missing: email and API token are required.", status_code=401)
        
        auth_str = f"{self.email}:{self.api_token}"
        encoded_auth = base64.b64encode(auth_str.encode("utf-8")).decode("utf-8")
        return {
            "Authorization": f"Basic {encoded_auth}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "DigitalCISO-SecurityPlatform/1.0",
        }

    def _request(self, method: str, endpoint: str, params: Optional[Dict[str, Any]] = None, data: Optional[Dict[str, Any]] = None) -> Any:
        """Executes an HTTP request to Jira Cloud REST API with error handling."""
        if not self.base_url:
            raise JiraServiceError("Jira Base URL is not configured.", status_code=400)

        url = f"{self.base_url}{endpoint}"
        headers = self._get_auth_headers()

        try:
            response = requests.request(
                method=method,
                url=url,
                headers=headers,
                params=params,
                json=data if data else None,
                timeout=self.timeout,
            )
        except requests.RequestException as e:
            logger.error(f"Jira API connection error to {url}: {e}")
            raise JiraServiceError(f"Could not connect to Jira Cloud: {str(e)}", status_code=503)

        if response.status_code in (200, 201):
            if response.text:
                try:
                    return response.json()
                except Exception:
                    return response.text
            return {}
        elif response.status_code == 204:
            return {}
        elif response.status_code == 401:
            raise JiraServiceError("Authentication failed: Invalid Jira Email or API Token.", status_code=401)
        elif response.status_code == 403:
            raise JiraServiceError("Forbidden: User lacks necessary Jira permissions.", status_code=403)
        elif response.status_code == 404:
            raise JiraServiceError(f"Resource not found at {endpoint}", status_code=404)
        else:
            err_msg = f"Jira API error ({response.status_code})"
            try:
                err_data = response.json()
                if "errorMessages" in err_data and err_data["errorMessages"]:
                    err_msg = "; ".join(err_data["errorMessages"])
                elif "errors" in err_data:
                    err_msg = json.dumps(err_data["errors"])
            except Exception:
                err_msg = response.text[:300] or err_msg
            logger.error(f"Jira API returned error {response.status_code}: {err_msg}")
            raise JiraServiceError(err_msg, status_code=response.status_code)

    def test_connection(self) -> Dict[str, Any]:
        """
        Tests connectivity and authenticates using /rest/api/3/myself.
        Returns user details, active site, and server status.
        """
        user_info = self._request("GET", "/rest/api/3/myself")
        return {
            "success": True,
            "connected": True,
            "account_id": user_info.get("accountId"),
            "display_name": user_info.get("displayName"),
            "email_address": user_info.get("emailAddress") or self.email,
            "active": user_info.get("active", True),
            "time_zone": user_info.get("timeZone"),
            "base_url": self.base_url,
            "verified_at": datetime.now(timezone.utc).isoformat(),
        }

    def get_myself(self) -> Dict[str, Any]:
        """Retrieves details of the currently authenticated Atlassian user."""
        return self._request("GET", "/rest/api/3/myself")

    def get_projects(self) -> List[Dict[str, Any]]:
        """
        Retrieves all accessible Jira projects using paginated /project/search.
        Handles enterprises with 50+ projects correctly.
        Uses maxResults=100 per page (Atlassian Cloud max) with startAt cursor.
        """
        projects: List[Dict[str, Any]] = []
        start_at = 0
        max_results = 100

        while True:
            page = self._request(
                "GET",
                "/rest/api/3/project/search",
                params={"startAt": start_at, "maxResults": max_results, "orderBy": "name"},
            )
            values = page.get("values", [])
            for p in values:
                projects.append({
                    "id": str(p.get("id")),
                    "key": p.get("key"),
                    "name": p.get("name"),
                    "project_type_key": p.get("projectTypeKey"),
                    "avatar_url": (
                        p.get("avatarUrls", {}).get("48x48")
                        or p.get("avatarUrls", {}).get("24x24")
                    ),
                    "lead": (
                        p.get("lead", {}).get("displayName")
                        if isinstance(p.get("lead"), dict)
                        else None
                    ),
                })
            is_last = page.get("isLast", True)
            total = page.get("total", 0)
            start_at += len(values)
            if is_last or not values or start_at >= total:
                break

        return projects

    def get_issue_types(self, project_key: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retrieves issue types for a given project or globally."""
        if project_key:
            data = self._request("GET", f"/rest/api/3/project/{project_key}")
            issue_types = data.get("issueTypes", [])
        else:
            issue_types = self._request("GET", "/rest/api/3/issuetype")

        result = []
        for it in issue_types:
            result.append({
                "id": str(it.get("id")),
                "name": it.get("name"),
                "description": it.get("description", ""),
                "subtask": it.get("subtask", False),
                "icon_url": it.get("iconUrl"),
            })
        return result

    def get_assignable_users(self, project_key: str, query: str = "") -> List[Dict[str, Any]]:
        """
        Searches assignable users for a Jira project.
        Uses /rest/api/3/user/assignable/search.

        Atlassian requires at least 1 character in 'query' for some cloud sites.
        When query is blank we omit the parameter entirely — Jira will return
        the default assignee list for the project (safe, no 400 risk).
        """
        params: Dict[str, Any] = {
            "project": project_key,
            "maxResults": 50,
            "startAt": 0,
        }
        # Only send query param when the caller actually typed something.
        # Omitting it avoids HTTP 400 on sites requiring a non-empty query.
        if query and query.strip():
            params["query"] = query.strip()

        try:
            users_data = self._request("GET", "/rest/api/3/user/assignable/search", params=params)
        except JiraServiceError as e:
            # 400 can occur if query rules are enforced by the site.
            # Return empty list so caller can fall back to cache.
            if e.status_code == 400:
                logger.warning(f"Jira assignee search returned 400 for project {project_key}: {e.message}")
                return []
            raise

        users = []
        for u in users_data:
            # Skip Jira automation bots and app accounts
            if u.get("accountType") in ("app", "customer"):
                continue
            users.append({
                "account_id": u.get("accountId"),
                "display_name": u.get("displayName"),
                "email_address": u.get("emailAddress") or "",
                "avatar_url": (
                    u.get("avatarUrls", {}).get("48x48")
                    or u.get("avatarUrls", {}).get("24x24")
                ),
                "active": u.get("active", True),
            })
        return users

    def get_priorities(self) -> List[Dict[str, Any]]:
        """Retrieves all issue priority levels configured in Jira."""
        data = self._request("GET", "/rest/api/3/priority")
        priorities = []
        for p in data:
            priorities.append({
                "id": str(p.get("id")),
                "name": p.get("name"),
                "description": p.get("description", ""),
                "icon_url": p.get("iconUrl"),
            })
        return priorities

    def create_issue(
        self,
        project_key: str,
        summary: str,
        description_adf: Dict[str, Any],
        issue_type: str = "Task",
        priority: str = "Medium",
        assignee_account_id: Optional[str] = None,
        labels: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Creates an issue in Jira Cloud using API v3 with ADF description.
        Assigns the issue immediately to the selected user.
        """
        # Ensure sanitized labels (strictly exclude 'prowler')
        clean_labels = []
        if labels:
            for l in labels:
                sanitized = str(l).strip().replace(" ", "-").lower()
                if sanitized and sanitized != "prowler" and sanitized not in clean_labels:
                    clean_labels.append(sanitized)

        fields: Dict[str, Any] = {
            "project": {"key": project_key},
            "summary": summary[:255],
            "description": description_adf,
            "issuetype": {"name": issue_type},
        }

        if priority:
            fields["priority"] = {"name": priority}

        if assignee_account_id:
            fields["assignee"] = {"accountId": assignee_account_id}

        if clean_labels:
            fields["labels"] = clean_labels

        payload = {"fields": fields}
        response = self._request("POST", "/rest/api/3/issue", data=payload)
        
        issue_key = response.get("key")
        issue_id = str(response.get("id"))
        issue_url = f"{self.base_url}/browse/{issue_key}" if issue_key else ""

        return {
            "key": issue_key,
            "id": issue_id,
            "url": issue_url,
            "project_key": project_key,
            "summary": summary,
        }

    def get_issue(self, issue_key: str) -> Dict[str, Any]:
        """
        Retrieves issue status, assignee, priority, and timestamps.
        """
        params = {"fields": "status,assignee,priority,summary,created,updated,resolution,labels"}
        data = self._request("GET", f"/rest/api/3/issue/{issue_key}", params=params)
        fields = data.get("fields", {})

        status_obj = fields.get("status", {})
        status_category = status_obj.get("statusCategory", {})
        assignee_obj = fields.get("assignee") or {}
        priority_obj = fields.get("priority") or {}

        return {
            "key": data.get("key"),
            "id": str(data.get("id")),
            "summary": fields.get("summary"),
            "status": status_obj.get("name", "Unknown"),
            "status_category_key": status_category.get("key", "new"),  # new, indeterminate, done
            "status_category_name": status_category.get("name", "To Do"),
            "assignee_name": assignee_obj.get("displayName"),
            "assignee_account_id": assignee_obj.get("accountId"),
            "assignee_email": assignee_obj.get("emailAddress"),
            "priority": priority_obj.get("name", "Medium"),
            "created": fields.get("created"),
            "updated": fields.get("updated"),
            "is_resolved": fields.get("resolution") is not None or status_category.get("key") == "done",
            "url": f"{self.base_url}/browse/{data.get('key')}",
        }
