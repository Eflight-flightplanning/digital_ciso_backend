"""Minimal OCI IAM identity domain (IDCS) REST client used by the CIS checks.

Configuration comes from the environment when the client is created (not at import):
IDCS_BASE, IDCS_CLIENT_ID and IDCS_CLIENT_SECRET. The client secret and the access
token are never logged, returned in errors, or stored anywhere outside this object.
"""
import logging
import os
import time

import requests

log = logging.getLogger(__name__)

PAGE_SIZE = 500
TOKEN_SCOPE = "urn:opc:idm:__myscopes__"


class IdcsError(RuntimeError):
    pass


class IdcsNotConfigured(IdcsError):
    pass


def _error_detail(resp):
    """Short, secret-free description of an error response."""
    try:
        body = resp.json()
    except ValueError:
        return ""
    detail = body.get("detail") or body.get("error_description") or ""
    return str(detail)[:200]


class Idcs:
    def __init__(self, base=None, client_id=None, client_secret=None, timeout=60, session=None):
        self.base = (base if base is not None else os.environ.get("IDCS_BASE", "")).rstrip("/")
        self._client_id = client_id if client_id is not None else os.environ.get("IDCS_CLIENT_ID", "")
        self._client_secret = (
            client_secret if client_secret is not None else os.environ.get("IDCS_CLIENT_SECRET", "")
        )
        self.timeout = timeout
        self._session = session or requests.Session()
        self._token = None
        self._token_expires = 0.0

    def __repr__(self):
        return f"Idcs(base={self.base!r})"

    @property
    def configured(self):
        return bool(self.base and self._client_id and self._client_secret)

    def _access_token(self):
        if not self.configured:
            raise IdcsNotConfigured("IDCS_BASE, IDCS_CLIENT_ID and IDCS_CLIENT_SECRET must all be set")
        if self._token and time.time() < self._token_expires - 60:
            return self._token
        resp = self._session.post(
            f"{self.base}/oauth2/v1/token",
            data={"grant_type": "client_credentials", "scope": TOKEN_SCOPE},
            auth=(self._client_id, self._client_secret),
            timeout=self.timeout,
        )
        if resp.status_code != 200:
            raise IdcsError(f"Token request failed with HTTP {resp.status_code}")
        body = resp.json()
        self._token = body["access_token"]
        self._token_expires = time.time() + int(body.get("expires_in", 3600))
        return self._token

    def get(self, path, params=None):
        for attempt in range(4):
            try:
                resp = self._session.get(
                    f"{self.base}{path}",
                    params=params,
                    headers={
                        "Authorization": f"Bearer {self._access_token()}",
                        "Accept": "application/scim+json, application/json",
                    },
                    timeout=self.timeout,
                )
            except (requests.Timeout, requests.ConnectionError) as exc:
                # A slow or dropped response (large Users pages can take a while): retry, then report it.
                if attempt < 3:
                    time.sleep(2**attempt)
                    continue
                raise IdcsError(f"GET {path} did not respond after {attempt + 1} attempts ({type(exc).__name__})") from exc
            if resp.status_code == 401 and attempt == 0:
                self._token = None
                continue
            if (resp.status_code == 429 or resp.status_code >= 500) and attempt < 3:
                time.sleep(2**attempt)
                continue
            if resp.status_code >= 400:
                raise IdcsError(f"GET {path} returned HTTP {resp.status_code} {_error_detail(resp)}".strip())
            return resp.json()
        raise IdcsError(f"GET {path} failed after retries")

    def list(self, resource, filter=None, attributes=None, sort_by=None, sort_order=None, limit=None):
        """Page through /admin/v1/<resource> and return the Resources."""
        out = []
        start = 1
        while True:
            count = PAGE_SIZE if not limit else min(PAGE_SIZE, limit - len(out))
            params = {"startIndex": start, "count": count}
            if filter:
                params["filter"] = filter
            if attributes:
                params["attributes"] = ",".join(attributes)
            if sort_by:
                params["sortBy"] = sort_by
                params["sortOrder"] = sort_order or "ascending"
            body = self.get(f"/admin/v1/{resource}", params)
            items = body.get("Resources") or []
            out.extend(items)
            total = body.get("totalResults", len(out))
            if not items or len(out) >= total or (limit and len(out) >= limit):
                return out[:limit] if limit else out
            start += len(items)
