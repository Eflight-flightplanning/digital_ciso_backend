import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main():

    #to show the Non MFA user's
    show_failed = "--show-failed" in sys.argv  
    if show_failed:
        sys.argv.remove("--show-failed")

    # backend/.env values, used for anything not given as an env var / argument
    env_values = {}
    env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend", ".env")
    if os.path.exists(env_file):
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                key, sep, value = line.strip().partition("=")
                if sep and not key.startswith("#"):
                    env_values[key.strip()] = value.strip(" \"'")

    def setting(name):
        return (os.environ.get(name) or env_values.get(name) or "").strip()

    domain_url = setting("IDCS_DOMAIN_URL")
    client_id = setting("IDCS_CLIENT_ID")
    client_secret = setting("IDCS_CLIENT_SECRET")

    if len(sys.argv) >= 4:
        domain_url = sys.argv[1].strip()
        client_id = sys.argv[2].strip()
        client_secret = sys.argv[3].strip()

    # Optional, only for display in findings. Native Prowler gets these from the
    domain_host = urllib.parse.urlsplit(domain_url).netloc.split(":")[0] if domain_url else ""
    domain_name = setting("IDCS_DOMAIN_NAME") or domain_host or "idcs-domain"
    region = setting("OCI_REGION") or "global"

    if not (domain_url and client_id and client_secret):
        print("\n Missing IDCS credentials in backend/.env or environment variables. Exiting.")
        sys.exit(1)

    print(f"\n[  OAuth2 Bearer Token from IDCS")
    token_url = f"{domain_url.rstrip('/')}/oauth2/v1/token"
    # Base64-encoded client_id:client_secret as required by standard OAuth2 HTTP Basic Authentication
    auth_header = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()   
    payload = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "scope": "urn:opc:idm:__myscopes__" #scope
    }).encode("utf-8")

    token_req = urllib.request.Request(
        token_url,
        data=payload,
        headers={
            "Authorization": f"Basic {auth_header}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(token_req, timeout=15) as resp:
            token_json = json.loads(resp.read().decode())
            access_token = token_json.get("access_token")
    except urllib.error.HTTPError as e:
        print(f" HTTP Error {e.code}: {e.read().decode()}")
        sys.exit(1)
    except Exception as e:
        print(f"  Connection Error: {e}")
        sys.exit(1)

    if not access_token:
        print(f"  No access_token in token response: {token_json}")
        sys.exit(1)

    api_headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json"
    }

    def get_json(path, params, timeout=30, exit_on_error=True):
        url = f"{domain_url.rstrip('/')}{path}?{urllib.parse.urlencode(params)}"
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=api_headers), timeout=timeout) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            print(f"\n  HTTP Error {e.code} from {url}:\n {e.read().decode()}")
        except Exception as e:
            print(f"\n  Failed to query {path}: {e}")
        if exit_on_error:
            sys.exit(1)
        return None

    def get_users_page(params, timeout=30):
        return get_json("/admin/v1/Users", params, timeout)

    # Oracle IDCS schems
    # Found in Oracle IDCS REST API Docs (User Resource) 
    #  mfa_ext: stores user MFA status ('ENROLLED', 'IGNORED', 'UN_ENROLLED', 'DISABLED')
    # cap_ext: stores user login capabilities (canUseConsolePassword: True/False)
    mfa_ext = "urn:ietf:params:scim:schemas:oracle:idcs:extension:mfa:User" 
    cap_ext = "urn:ietf:params:scim:schemas:oracle:idcs:extension:capabilities:User"
    attrs = f"id,userName,displayName,emails,active,{mfa_ext}:mfaStatus,{cap_ext}:canUseConsolePassword"
    enrolled_total = get_users_page(
        {"filter": f'{mfa_ext}:mfaStatus eq "ENROLLED"', "count": 1}, timeout=20
    ).get("totalResults", 0)

    raw_users_map = {}
    start_index = 1
    page_size = 1000
    total_results = None

    while True:
        data_page = get_users_page(
            {"count": page_size, "startIndex": start_index, "attributes": attrs}
        )
        if total_results is None:
            total_results = data_page.get("totalResults", 0)

        resources = data_page.get("Resources", [])
        if not resources:
            break

        for u in resources:
            raw_users_map[u.get("id")] = u

        print(f"Progress: {len(raw_users_map):,} / {total_results:,} users downloaded...", end="\r")

       
        start_index += len(resources)
        if start_index > total_results:
            break

    print(f"\n Retrieved {len(raw_users_map):,} of {total_results:,} users from OCI Identity Domain.")
    if len(raw_users_map) < total_results:
        print(f"  [!] WARNING: {total_results - len(raw_users_map):,} users were not retrieved.")
    raw_users = list(raw_users_map.values())

     #prowler check code expects python objects with specific dot-notation attributes, not raw JSON dictionaries convert
    print(f"\n Mapping {len(raw_users):,} IDCS users into Prowler's native OCI User model for Access check ...")
    from prowler.providers.oraclecloud.services.identity.identity_service import User
    prowler_users = []
    for u in raw_users:
        mfa_status = (u.get(mfa_ext) or {}).get("mfaStatus", "")
        is_mfa_activated = str(mfa_status).upper() == "ENROLLED"
        can_use_console_password = (u.get(cap_ext) or {}).get("canUseConsolePassword", True)

        prowler_user = User(
            id=u.get("id", u.get("userName")),
            name=u.get("userName"),
            compartment_id="idcs-identity-domain",
            lifecycle_state="ACTIVE" if u.get("active", True) else "INACTIVE",
            region=region,
            can_use_console_password=can_use_console_password,
            is_mfa_activated=is_mfa_activated,
        )
        prowler_users.append(prowler_user)

    print(f" Successfully constructed {len(prowler_users)} to user objects")
    print("  is_mfa_activated=True/False.")

    print("=" * 80)
    raw_pw_policies = []
    start_index = 1
    while True:
        data_pw = get_json(
            "/admin/v1/PasswordPolicies",
            {"count": 100, "startIndex": start_index},
            timeout=15,
            exit_on_error=False,
        )
        if data_pw is None:
            raw_pw_policies = None  
            break
        page = data_pw.get("Resources", [])
        raw_pw_policies.extend(page)
        start_index += len(page)
        if not page or start_index > data_pw.get("totalResults", 0):
            break

    from prowler.providers.oraclecloud.services.identity.identity_service import (
        Identity,
        IdentityDomain,
        DomainPasswordPolicy,
    )
    # Prowler skips these system-managed policies (hidden in the OCI Console,
    # not user-configurable) - see Identity.__list_domain_password_policies__
    system_policies = ("SimplePasswordPolicy", "StandardPasswordPolicy")
    domain_policies = [
        DomainPasswordPolicy(
            id=p.get("id"),
            name=p.get("name") or p.get("id"),
            description=p.get("description") or "",
            min_length=p.get("minLength"),
            password_expires_after=p.get("passwordExpiresAfter"),
            num_passwords_in_history=p.get("numPasswordsInHistory"),
            password_expire_warning=p.get("passwordExpireWarning"),
            min_password_age=p.get("minPasswordAge"),
        )
        for p in raw_pw_policies or []
        if p.get("id") not in system_policies
    ]
    if raw_pw_policies is not None:
        print(f"   Retrieved {len(raw_pw_policies)} password policies ")

    prowler_domain = IdentityDomain(
        id=domain_host or domain_name,
        display_name=domain_name,
        url=domain_url,
        home_region=region,
        compartment_id="idcs-identity-domain",
        lifecycle_state="ACTIVE",
        region=region,
        password_policies=domain_policies,
    )

    mock_identity = Identity.__new__(Identity)
    mock_identity.users = prowler_users
    mock_identity.domains = [prowler_domain]
    mock_identity.password_policy = None

    import unittest.mock
    from colorama import Fore, Style
    from prowler.lib.outputs.outputs import set_report_color, stdout_report

   
    # use of unittest.mock:
    #  Bypasses OCI SDK & .pem key check: Prowler's identity_client.py calls
    #    Identity(Provider.get_global_provider()) at import time, which searches
    #    for ~/.oci/config and a .pem private key. Patching Identity.__init__ to
    #    return None neutralizes this check in memory so it never crashes.
    # Leaves Prowler code untouched 
    # calling the actual prowler OCI check from here to check password policy and MFA
    with unittest.mock.patch("prowler.providers.oraclecloud.services.identity.identity_service.Identity.__init__", return_value=None):
        import prowler.providers.oraclecloud.services.identity.identity_client as client_module
        client_module.identity_client = mock_identity

        from prowler.providers.oraclecloud.services.identity.identity_user_mfa_enabled_console_access.identity_user_mfa_enabled_console_access import (
            identity_user_mfa_enabled_console_access,
        )
        from prowler.providers.oraclecloud.services.identity.identity_password_policy_minimum_length_14.identity_password_policy_minimum_length_14 import (
            identity_password_policy_minimum_length_14,
        )
        from prowler.providers.oraclecloud.services.identity.identity_password_policy_expires_within_365_days.identity_password_policy_expires_within_365_days import (
            identity_password_policy_expires_within_365_days,
        )

        checks_to_run = [
            (
                "MFA Check",
                identity_user_mfa_enabled_console_access,
                "prowler.providers.oraclecloud.services.identity.identity_user_mfa_enabled_console_access.identity_user_mfa_enabled_console_access.identity_client",
                True,  # is_user_check MFA is true or not 
            ),
            (
                "Password Policy Length (>=14)",
                identity_password_policy_minimum_length_14,
                "prowler.providers.oraclecloud.services.identity.identity_password_policy_minimum_length_14.identity_password_policy_minimum_length_14.identity_client",
                False, # False = Domain policy check (audits 7 policies; shows all PASS & FAIL)
            ),
            (
                "Password Policy Rotation (<=365 Days)",
                identity_password_policy_expires_within_365_days,
                "prowler.providers.oraclecloud.services.identity.identity_password_policy_expires_within_365_days.identity_password_policy_expires_within_365_days.identity_client",
                False, # to check the 365 day's password policy
            ),
        ]

        for label, check_cls, patch_target, is_user_check in checks_to_run:
            if not is_user_check and raw_pw_policies is None:
                print(f"\n[!] Skipped {label}: password policies could not be read from IDCS (see error above).")
                continue
            # Injects our live IDCS users & policies into the check's identity_client in memory
            with unittest.mock.patch(patch_target, mock_identity):
                check_instance = check_cls()
                findings = check_instance.execute()

                pass_reports = [r for r in findings if r.status == "PASS"]
                fail_reports = [r for r in findings if r.status == "FAIL"]

                # 1. Prints Prowler's standard check header (e.g. Check ID: ... - identity [HIGH])
                print(
                    f"\nCheck ID: {check_instance.CheckID} - {Fore.MAGENTA}{check_instance.ServiceName}"
                    f"{Fore.YELLOW} [{check_instance.Severity.value}]{Style.RESET_ALL}"
                )

                # 2. THIS IS WHERE FINDINGS ARE PRINTED:
                # Calls Prowler's native stdout_report() to print each finding line
                status_filter = [] if (show_failed or not is_user_check) else ["PASS"]
                for finding in findings:
                    stdout_report(
                        finding,
                        set_report_color(finding.status, finding.muted),
                        verbose=True,
                        status=status_filter,
                        fix=False,
                    )
                print()
                print(f"\tFindings: {len(pass_reports)} Passed, {len(fail_reports)} Failed")

                if is_user_check:
                    if fail_reports and not show_failed:
                        print("\t(run with --show-failed to list the failed users)")
                    skipped = len(prowler_users) - len(findings)
                    if skipped:
                        print(f"\t({skipped:,} users without console password access were not checked)")
                    print(f"\tCross-check: IDCS reports {enrolled_total:,} MFA-enrolled users; "
                          f"{len(pass_reports):,} PASS above\n")


if __name__ == "__main__":
    main()
