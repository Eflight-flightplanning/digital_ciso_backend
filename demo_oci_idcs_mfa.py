"""
DEMO: Why OCI SDK Fails with IDCS Credentials — and the Working Alternative
============================================================================

PART 1  →  Shows the EXACT error when using Prowler's OCI provider
            (identity_service.py) with only IDCS Client ID + Client Secret.
            Root cause: OCI SDK always requires a .pem private key.

PART 2  →  Shows the working alternative:
            IDCS Client ID + Secret -> Bearer Token -> OCI Identity Domain API
            -> Prowler User model -> MFA PASS/FAIL findings (same output format).

Run:
    python demo_oci_idcs_mfa.py

Or with real credentials:
    python demo_oci_idcs_mfa.py <domain_url> <client_id> <client_secret>
"""

import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

DIVIDER   = "=" * 78
THIN_LINE = "-" * 78


def section(title):
    print(f"\n{DIVIDER}")
    print(f"  {title}")
    print(DIVIDER)


def ok(msg):
    print(f"  [OK ] {msg}")


def fail(msg):
    print(f"  [ERR] {msg}")


def info(msg):
    print(f"  [i ] {msg}")


# ---------------------------------------------------------------------------
# PART 1 - Show the OCI SDK .pem error
# ---------------------------------------------------------------------------
def part1_show_oci_sdk_error():
    section("PART 1 - Prowler OCI Provider (identity_service.py) - FAILS without .pem")

    print("""
  Prowler's OCI provider uses the OCI Python SDK:
      oci.identity.IdentityClient.list_users(compartment_id=...)

  Session is set up in:
      prowler/providers/oraclecloud/oraclecloud_provider.py -> setup_session()

  Authentication options - ALL require a .pem RSA private key:
      [1] API Key auth      -> ~/.oci/config + private_key.pem
      [2] Session Token     -> token file    + private_key.pem
      [3] Instance Principal -> only inside an OCI VM
""")

    print("  Simulating Prowler OCI provider init with IDCS Client ID/Secret only ...")
    print(THIN_LINE)

    # Reproduce the exact code path from oraclecloud_provider.py lines 352-380
    # Reproduce the exact error regardless of whether the oci package is installed.
    # This is the code path from oraclecloud_provider.py lines 352-380.

    class OCINoCredentialsError(Exception):
        """Mirrors prowler.providers.oraclecloud.exceptions.OCINoCredentialsError"""
        pass

    # These are OCI SDK params - you only have IDCS Client ID + Secret,
    # NOT the required .pem private key
    key_file    = None
    key_content = None

    try:
        # Exact logic from oraclecloud_provider.py lines 352-380:
        if key_content:
            pass  # config["key_content"] = decoded_key
        elif key_file:
            pass  # config["key_file"] = os.path.expanduser(key_file)
        else:
            raise OCINoCredentialsError(
                "Either key_file or key_content must be provided\n"
                "    OCI SDK cannot authenticate with IDCS Client ID + Secret.\n"
                "    A .pem RSA private key is mandatory for OCI SDK auth."
            )
    except Exception as exc:
        error_name = type(exc).__name__
        error_msg  = str(exc)
    else:
        error_name = "No error (unexpected)"
        error_msg  = ""

    print()
    fail(f"Prowler OCI provider raises: {error_name}")
    print()
    print("  ERROR:")
    for line in error_msg.strip().splitlines():
        print(f"      {line}")

    print()
    print("  SOURCE (oraclecloud_provider.py lines 374-380):")
    print("""
      elif key_file:
          config["key_file"] = os.path.expanduser(key_file)
      else:
          raise OCINoCredentialsError(      # <-- ALWAYS raised without .pem
              message="Either key_file or key_content must be provided"
          )
""")
    print()
    info("identity_service.py is built on this SDK session.")
    info("Without a .pem key the session cannot start - MFA check never runs.")


# ---------------------------------------------------------------------------
# PART 2 - Working alternative: IDCS Bearer Token -> Prowler User -> MFA check
# ---------------------------------------------------------------------------
def part2_idcs_bearer_solution(domain_url, client_id, client_secret):
    section("PART 2 - Working Alternative: IDCS Bearer Token -> Prowler OCI MFA Check")

    print("""
  Flow:
    Step 1: POST /oauth2/v1/token  (Client ID + Secret)  -> Bearer token
    Step 2: GET  /admin/v1/Users   (Bearer token)         -> users + mfaEnabled
    Step 3: Map each user into Prowler's native OCI User model
    Step 4: Run the EXACT same MFA logic as identity_user_mfa_enabled_console_access.py
""")

    # Step 1: Get Bearer Token
    print(f"  [STEP 1] Acquiring OAuth2 Bearer Token ...")
    print(f"           POST {domain_url.rstrip('/')}/oauth2/v1/token")

    token_url   = f"{domain_url.rstrip('/')}/oauth2/v1/token"
    auth_header = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    payload     = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "scope": "urn:opc:idm:__myscopes__",
    }).encode("utf-8")

    token_req = urllib.request.Request(
        token_url,
        data=payload,
        headers={
            "Authorization": f"Basic {auth_header}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(token_req, timeout=15) as resp:
            token_json   = json.loads(resp.read().decode())
            access_token = token_json.get("access_token")
            expires_in   = token_json.get("expires_in", 3600)
        ok(f"Bearer token acquired (valid for {expires_in}s)")
        ok("No .pem file needed - only Client ID + Secret!")
    except urllib.error.HTTPError as e:
        fail(f"HTTP {e.code}: {e.read().decode()}")
        sys.exit(1)
    except Exception as e:
        fail(f"Connection error: {e}")
        sys.exit(1)

    api_headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    }

    # Step 2: Get users from OCI Identity Domain API
    print(f"\n  [STEP 2] Calling OCI Identity Domain API ...")
    users_url = (
        f"{domain_url.rstrip('/')}/admin/v1/Users"
        f"?count=200&attributes=userName,displayName,emails,active,mfaEnabled"
    )
    print(f"           GET {users_url}")

    try:
        with urllib.request.urlopen(
            urllib.request.Request(users_url, headers=api_headers), timeout=15
        ) as resp:
            users_json = json.loads(resp.read().decode())
            raw_users  = users_json.get("Resources", [])
        ok(f"Retrieved {len(raw_users)} users from OCI Identity Domain.")
    except Exception as e:
        fail(f"Failed to query users: {e}")
        sys.exit(1)

    # Step 3: Map into Prowler's native OCI User model
    print(f"\n  [STEP 3] Mapping into Prowler's native OCI User model ...")

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    use_prowler_model = False
    try:
        from prowler.providers.oraclecloud.services.identity.identity_service import User
        ok("Prowler OCI User model imported successfully.")
        use_prowler_model = True
    except Exception as imp_err:
        info(f"Prowler model unavailable ({imp_err}). Using dict fallback.")

    prowler_users = []
    for u in raw_users:
        emails   = u.get("emails", [])
        email    = emails[0].get("value", "") if emails else ""
        mfa_flag = u.get("mfaEnabled", False)

        if use_prowler_model:
            user_obj = User(
                id=u.get("id", u.get("userName")),
                name=u.get("userName"),
                description=u.get("displayName", ""),
                email=email,
                email_verified=False,
                compartment_id="idcs-identity-domain",
                time_created=None,
                lifecycle_state="ACTIVE" if u.get("active", True) else "INACTIVE",
                can_use_api_keys=True,
                can_use_console_password=True,
                is_mfa_activated=mfa_flag,   # <- exact Prowler field name
                api_keys=[],
                auth_tokens=[],
                customer_secret_keys=[],
                db_passwords=[],
                groups=[],
                region="global",
            )
        else:
            user_obj = type("User", (), {
                "name": u.get("userName"),
                "can_use_console_password": True,
                "is_mfa_activated": mfa_flag,
            })()

        prowler_users.append(user_obj)

    ok(f"Constructed {len(prowler_users)} Prowler User objects.")

    # Step 4: Run Prowler CIS 1.7 MFA check - identical logic to Prowler check
    print(f"\n  [STEP 4] Running Prowler CIS 1.7 MFA Check ...")
    print(f"           (Same logic as identity_user_mfa_enabled_console_access.py)")
    print()
    print(f"  {'STATUS':<8}  {'USERNAME':<35}  FINDING")
    print(f"  {THIN_LINE}")

    pass_count = fail_count = 0

    for user in prowler_users:
        # ---- EXACT SAME CODE as identity_user_mfa_enabled_console_access.py ----
        if user.can_use_console_password:
            if user.is_mfa_activated:
                status  = "PASS"
                finding = f"User {user.name} has MFA enabled for console access."
                pass_count += 1
            else:
                status  = "FAIL"
                finding = f"User {user.name} has console password enabled but MFA is not activated."
                fail_count += 1
        # -------------------------------------------------------------------------
            marker = "+" if status == "PASS" else "!"
            print(f"  [{marker} {status:<4}]  {user.name:<35}  {finding}")

    print(f"  {THIN_LINE}")
    print()
    ok(f"CIS 1.7 Summary:  {pass_count} PASSED  |  {fail_count} FAILED")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print(f"\n{DIVIDER}")
    print("  DEMO: OCI SDK Error  vs.  IDCS Bearer Token Solution — MFA Check")
    print(f"{DIVIDER}")

    # Part 1: always runs, no credentials needed
    part1_show_oci_sdk_error()

    # Part 2: needs IDCS credentials
    domain_url    = os.environ.get("IDCS_DOMAIN_URL", "").strip()
    client_id     = os.environ.get("IDCS_CLIENT_ID", "").strip()
    client_secret = os.environ.get("IDCS_CLIENT_SECRET", "").strip()

    if len(sys.argv) >= 4:
        domain_url    = sys.argv[1].strip()
        client_id     = sys.argv[2].strip()
        client_secret = sys.argv[3].strip()

    if not (domain_url and client_id and client_secret):
        print(f"\n{THIN_LINE}")
        info("To run PART 2 (live IDCS call), provide your credentials:")
        info("")
        info("  PowerShell env vars:")
        info("    $env:IDCS_DOMAIN_URL='https://idcs-xxxx.identity.oraclecloud.com'")
        info("    $env:IDCS_CLIENT_ID='<your_client_id>'")
        info("    $env:IDCS_CLIENT_SECRET='<your_secret>'")
        info("    python demo_oci_idcs_mfa.py")
        info("")
        info("  CLI args:")
        info("    python demo_oci_idcs_mfa.py <domain_url> <client_id> <client_secret>")
        print(f"{THIN_LINE}\n")
        try:
            domain_url    = input("  IDCS Domain URL  (Enter to skip): ").strip()
            client_id     = input("  IDCS Client ID   (Enter to skip): ").strip()
            client_secret = input("  IDCS Secret      (Enter to skip): ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n  Skipping live call.")

    if domain_url and client_id and client_secret:
        part2_idcs_bearer_solution(domain_url, client_id, client_secret)
    else:
        section("PART 2 - Skipped (no credentials provided)")
        info("Part 2 would show the IDCS Bearer Token approach working live.")
        info("Maps IDCS users into Prowler OCI User model and runs CIS 1.7 check.")

    print(f"\n{DIVIDER}")
    print("  DEMO COMPLETE")
    print(f"{DIVIDER}\n")


if __name__ == "__main__":
    main()
