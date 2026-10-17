"""
Evaluate IDCS Password Policies using Prowler's Native Identity Service and Checks:
- identity_password_policy_minimum_length_14 (CIS 1.4: Length >= 14)
- identity_password_policy_expires_within_365_days (CIS 1.5: Rotation <= 365 days)
- identity_password_policy_prevents_reuse (CIS 1.6: Reuse prevention)
"""

import base64
import json
import os
import sys
import unittest.mock
import urllib.request

# Ensure UTF-8 output on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def get_credentials():
    domain_url = os.environ.get("IDCS_DOMAIN_URL", "").strip()
    client_id = os.environ.get("IDCS_CLIENT_ID", "").strip()
    client_secret = os.environ.get("IDCS_CLIENT_SECRET", "").strip()

    if not (domain_url and client_id and client_secret):
        env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend", ".env")
        if os.path.exists(env_file):
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("IDCS_DOMAIN_URL="):
                        domain_url = line.split("=", 1)[1].strip(" \"'")
                    elif line.startswith("IDCS_CLIENT_ID="):
                        client_id = line.split("=", 1)[1].strip(" \"'")
                    elif line.startswith("IDCS_CLIENT_SECRET="):
                        client_secret = line.split("=", 1)[1].strip(" \"'")

    return domain_url, client_id, client_secret


def main():
    domain_url, client_id, client_secret = get_credentials()
    if not (domain_url and client_id and client_secret):
        print("[!] Error: IDCS credentials not found.")
        sys.exit(1)

    # ── STEP 1: Acquire Bearer Token ─────────────────────────────────────────
    auth_header = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    token_req = urllib.request.Request(
        f"{domain_url.rstrip('/')}/oauth2/v1/token",
        data=b"grant_type=client_credentials&scope=urn:opc:idm:__myscopes__",
        headers={"Authorization": f"Basic {auth_header}", "Content-Type": "application/x-www-form-urlencoded"}
    )
    with urllib.request.urlopen(token_req, timeout=15) as resp:
        token = json.loads(resp.read().decode())["access_token"]

    # ── STEP 2: Query IDCS Password Policies ─────────────────────────────────
    api_req = urllib.request.Request(
        f"{domain_url.rstrip('/')}/admin/v1/PasswordPolicies",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"}
    )
    with urllib.request.urlopen(api_req, timeout=15) as resp:
        raw_policies = json.loads(resp.read().decode()).get("Resources", [])

    # ── STEP 3: Map into Prowler Native Models ───────────────────────────────
    from prowler.providers.oraclecloud.services.identity.identity_service import (
        Identity,
        IdentityDomain,
        DomainPasswordPolicy,
    )

    domain_policies = []
    for p in raw_policies:
        domain_policies.append(
            DomainPasswordPolicy(
                id=p.get("id"),
                name=p.get("name", p.get("id")),
                description=p.get("description", ""),
                min_length=p.get("minLength"),
                password_expires_after=p.get("passwordExpiresAfter"),
                num_passwords_in_history=p.get("numPasswordsInHistory"),
                password_expire_warning=p.get("passwordExpireWarning"),
            )
        )

    # Construct Prowler IdentityDomain
    prowler_domain = IdentityDomain(
        id="idcs-primary-domain",
        display_name="Primary Identity Domain",
        url=domain_url,
        home_region="global",
        compartment_id="idcs-identity-domain",
        lifecycle_state="ACTIVE",
        region="global",
        password_policies=domain_policies,
    )

    # Bypass OCI SDK __init__
    mock_identity = Identity.__new__(Identity)
    mock_identity.domains = [prowler_domain]
    mock_identity.password_policy = None

    # ── STEP 4: Execute Real Prowler Checks ──────────────────────────────────
    with unittest.mock.patch("prowler.providers.oraclecloud.services.identity.identity_service.Identity.__init__", return_value=None):
        import prowler.providers.oraclecloud.services.identity.identity_client as client_module
        client_module.identity_client = mock_identity

        from prowler.providers.oraclecloud.services.identity.identity_password_policy_minimum_length_14.identity_password_policy_minimum_length_14 import (
            identity_password_policy_minimum_length_14,
        )
        from prowler.providers.oraclecloud.services.identity.identity_password_policy_expires_within_365_days.identity_password_policy_expires_within_365_days import (
            identity_password_policy_expires_within_365_days,
        )
        from prowler.providers.oraclecloud.services.identity.identity_password_policy_prevents_reuse.identity_password_policy_prevents_reuse import (
            identity_password_policy_prevents_reuse,
        )

        checks = [
            (
                "identity_password_policy_minimum_length_14",
                identity_password_policy_minimum_length_14,
                "prowler.providers.oraclecloud.services.identity.identity_password_policy_minimum_length_14.identity_password_policy_minimum_length_14.identity_client",
            ),
            (
                "identity_password_policy_expires_within_365_days",
                identity_password_policy_expires_within_365_days,
                "prowler.providers.oraclecloud.services.identity.identity_password_policy_expires_within_365_days.identity_password_policy_expires_within_365_days.identity_client",
            ),
            (
                "identity_password_policy_prevents_reuse",
                identity_password_policy_prevents_reuse,
                "prowler.providers.oraclecloud.services.identity.identity_password_policy_prevents_reuse.identity_password_policy_prevents_reuse.identity_client",
            ),
        ]

        for check_id, check_cls, patch_target in checks:
            with unittest.mock.patch(patch_target, mock_identity):
                check_inst = check_cls()
                findings = check_inst.execute()
                if findings:
                    meta = findings[0].check_metadata
                    print(f"\n[{meta.CheckID}] {meta.CheckTitle} - [{meta.Severity.upper()}]")
                    pass_count = 0
                    fail_count = 0
                    for r in findings:
                        if r.status == "PASS":
                            pass_count += 1
                            print(f"\tPASS [{r.region}]: {r.status_extended}")
                        elif r.status == "FAIL":
                            fail_count += 1
                            print(f"\tFAIL [{r.region}]: {r.status_extended}")
                    print(f"\tFindings: {pass_count} Passed, {fail_count} Failed")

    print("\n" + "=" * 80)
    print("  PW POLICY AUDIT COMPLETE: Evaluated via Prowler Identity Service!")
    print("=" * 80 + "\n")


if __name__ == "__main__":
    main()
