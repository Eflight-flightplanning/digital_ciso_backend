import os
import sys
import json

repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.django.devel")

import django
django.setup()

from rest_framework.test import APIClient

client = APIClient()

endpoints = [
    ("GET", "/api/v1/oracle-saas/overview"),
    ("GET", "/api/v1/oracle-saas/inactive-users"),
    ("POST", "/api/v1/oracle-saas/remediate"),
    ("GET", "/api/v1/jira/projects"),
    ("GET", "/api/v1/jira/projects/SEC/issue-types"),
    ("GET", "/api/v1/findings"),
    ("GET", "/api/v1/scans"),
    ("GET", "/health/live"),
]

print("\n" + "=" * 70)
print("VERIFYING POST-REMEDIATION ACCESS CONTROL (NO AUTHENTICATION)")
print("=" * 70)

all_passed = True
for method, url in endpoints:
    if method == "GET":
        resp = client.get(url)
    else:
        resp = client.post(url, data=json.dumps({"action": "TEST"}), content_type="application/json")
    
    expected_status = 200 if "/health/" in url else 401
    passed = (resp.status_code == expected_status)
    status_icon = "PASS" if passed else "FAIL"
    print(f"[{status_icon}] {method} {url:<45} -> Status: HTTP {resp.status_code} (Expected {expected_status})")
    if not passed:
        all_passed = False

print("=" * 70)
if all_passed:
    print("ALL ENDPOINTS CORRECTLY ENFORCE AUTHENTICATION (DENY BY DEFAULT).")
else:
    print("WARNING: SOME ENDPOINTS STILL OPEN.")
print("=" * 70 + "\n")
