"""Runs security_platform's native Prowler OCI identity checks on identity domain data.

Executed in security_platform's own Python (PROWLER_PYTHON) as a separate process:
    python -I prowler_runner.py <PROWLER_ROOT>   < input.json   > output.json

The approach is the one in security_platform/idcs_to_prowler_oci.py: IDCS users and password
policies are mapped onto Prowler's User / IdentityDomain / DomainPasswordPolicy models, the
Identity service constructor is patched so no OCI config or key is needed, and the real check
classes are executed unchanged.

Input:  {"users": [{id, userName, active, mfa_status, can_use_console_password}],
         "password_policies": [raw IDCS PasswordPolicy resources], "domain": {...}}
Output: {"checks": {check_id: {"severity", "title", "findings": [{status, status_extended,
          resource_name, resource_id}]}}}
"""
import json
import sys
import unittest.mock

CHECKS = [
    "identity_user_mfa_enabled_console_access",
    "identity_password_policy_minimum_length_14",
    "identity_password_policy_expires_within_365_days",
]
SERVICE = "prowler.providers.oraclecloud.services.identity"
# Prowler skips these system-managed policies (see Identity.__list_domain_password_policies__).
SYSTEM_POLICIES = ("SimplePasswordPolicy", "StandardPasswordPolicy")


def main():
    sys.path.insert(0, sys.argv[1])
    data = json.load(sys.stdin)
    # Anything Prowler prints goes to stderr, so stdout carries only the JSON result.
    result_stream, sys.stdout = sys.stdout, sys.stderr

    from prowler.providers.oraclecloud.services.identity.identity_service import (
        DomainPasswordPolicy,
        Identity,
        IdentityDomain,
        User,
    )

    domain = data.get("domain") or {}
    region = domain.get("region") or "global"
    users = [
        User(
            id=u["id"],
            name=u.get("userName") or u["id"],
            compartment_id="idcs-identity-domain",
            lifecycle_state="ACTIVE" if u.get("active", True) else "INACTIVE",
            region=region,
            can_use_console_password=u.get("can_use_console_password", True),
            is_mfa_activated=str(u.get("mfa_status") or "").upper() == "ENROLLED",
        )
        for u in data.get("users", [])
    ]
    policies = [
        DomainPasswordPolicy(
            id=p.get("id") or p.get("name") or "unnamed-policy",
            name=p.get("name") or p.get("id"),
            description=p.get("description") or "",
            min_length=p.get("minLength"),
            password_expires_after=p.get("passwordExpiresAfter"),
            num_passwords_in_history=p.get("numPasswordsInHistory"),
            password_expire_warning=p.get("passwordExpireWarning"),
            min_password_age=p.get("minPasswordAge"),
        )
        for p in data.get("password_policies", [])
        if p.get("id") not in SYSTEM_POLICIES
    ]
    identity = Identity.__new__(Identity)
    identity.users = users
    identity.domains = [
        IdentityDomain(
            id=domain.get("id") or "idcs-domain",
            display_name=domain.get("name") or "idcs-domain",
            url=domain.get("url") or "",
            home_region=region,
            compartment_id="idcs-identity-domain",
            lifecycle_state="ACTIVE",
            region=region,
            password_policies=policies,
        )
    ]
    identity.password_policy = None

    out = {}
    with unittest.mock.patch(f"{SERVICE}.identity_service.Identity.__init__", return_value=None):
        import prowler.providers.oraclecloud.services.identity.identity_client as client_module

        client_module.identity_client = identity
        for check_id in CHECKS:
            module_path = f"{SERVICE}.{check_id}.{check_id}"
            module = __import__(module_path, fromlist=[check_id])
            with unittest.mock.patch(f"{module_path}.identity_client", identity):
                check = getattr(module, check_id)()
                findings = check.execute()
            out[check_id] = {
                "severity": check.Severity.value,
                "title": check.CheckTitle,
                "findings": [
                    {
                        "status": f.status,
                        "status_extended": f.status_extended,
                        "resource_name": getattr(f, "resource_name", ""),
                        "resource_id": getattr(f, "resource_id", ""),
                    }
                    for f in findings
                ],
            }
    json.dump({"checks": out}, result_stream)


if __name__ == "__main__":
    main()
