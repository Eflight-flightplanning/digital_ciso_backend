"""
IDCS -> Prowler OCI identity checks adapter
===========================================

Runs Prowler's UNMODIFIED OCI identity checks (MFA, password policy, console
access, credential rotation, ...) against data fetched from an OCI Identity
Domain (IDCS) with a client-credentials Bearer token, instead of the OCI SDK
(.pem API key) that Prowler normally needs.

You never pass IDCS endpoint URLs: every endpoint is defined once in DATASETS
below, and each supported check declares which datasets it needs. Only the
domain URL + client credentials are configured (in .env). Pick checks with
--checks; the script fetches just the IDCS data those checks need.

Flow:
  0. Show Prowler's native OCI SDK path failing (real errors; --skip-oci-demo to skip)
  1. Resolve settings: CLI flag > env var > .env file > default > prompt
  2. POST {domain}/oauth2/v1/token -> Bearer token
  3. GET the IDCS datasets the selected checks need (paginated SCIM)
  4. Map them into Prowler's own models (User, Group, IdentityDomain, ...)
  5. Build a real Prowler Identity object holding that data (its OCI-SDK
     __init__ skipped), patch Identity.__init__ + each check's `identity_client`
  6. Import and execute the real checks
  7. Print findings per check and a summary

Stdlib only (urllib, json, base64, unittest.mock).

Settings (put them once in the git-ignored .env next to this script):
    IDCS_DOMAIN_URL=https://idcs-xxxx.identity.oraclecloud.com
    IDCS_CLIENT_ID=...
    IDCS_CLIENT_SECRET=...
    IDCS_SCOPE=urn:opc:idm:__myscopes__      # optional, this is the default
    OCI_REGION=us-ashburn-1                  # optional, enables Attempt 3
    OCI_TENANCY_OCID=ocid1.tenancy.oc1..xxxx # optional, enables Attempt 3

Run:
    python test_idcs_to_prowler_mfa_check.py --list-checks        # what's supported
    python test_idcs_to_prowler_mfa_check.py                      # all supported checks
    python test_idcs_to_prowler_mfa_check.py --checks mfa,password   # words in check names
    python test_idcs_to_prowler_mfa_check.py --data-dir saved/    # offline: <dataset>.json
    python test_idcs_to_prowler_mfa_check.py --users-file users.json   # offline, users only
Missing required settings are prompted for (secret input hidden).
"""

import argparse
import base64
import contextlib
import importlib
import json
import os
import sys
import unittest.mock
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Windows consoles default to cp1252, which can't print "→"
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

IDENTITY_PKG = "prowler.providers.oraclecloud.services.identity"
IDENTITY_CLIENT_MODULE = f"{IDENTITY_PKG}.identity_client"
IDENTITY_SERVICE_MODULE = f"{IDENTITY_PKG}.identity_service"
PAGE_SIZE = 200
HTTP_TIMEOUT = 15

MFA_EXT = "urn:ietf:params:scim:schemas:oracle:idcs:extension:mfa:User"
CAPABILITIES_EXT = "urn:ietf:params:scim:schemas:oracle:idcs:extension:capabilities:User"

# ─── IDCS datasets: the ONLY place endpoint URLs live ────────────────────────
# name -> (path under the domain URL, `attributes` to request or None for defaults)
DATASETS = {
    "users": (
        "/admin/v1/Users",
        [
            "id",
            "userName",
            "displayName",
            "emails",
            "active",
            "groups",  # returned only on request
            "meta",
            # IDCS has no top-level mfaEnabled; MFA state lives in this extension.
            # mfaStatus: ENROLLED | IGNORED | UN_ENROLLED | DISABLED
            f"{MFA_EXT}:mfaStatus",
            # Same flags Prowler reads from user.capabilities via the OCI SDK
            f"{CAPABILITIES_EXT}:canUseConsolePassword",
            f"{CAPABILITIES_EXT}:canUseApiKeys",
        ],
    ),
    "groups": ("/admin/v1/Groups", ["id", "displayName", "meta"]),
    "password_policies": ("/admin/v1/PasswordPolicies", None),
    "api_keys": ("/admin/v1/ApiKeys", None),
    "auth_tokens": ("/admin/v1/AuthTokens", None),
    "customer_secret_keys": ("/admin/v1/CustomerSecretKeys", None),
    "db_credentials": ("/admin/v1/UserDbCredentials", None),
}

# ─── Supported Prowler checks -> IDCS datasets they need ─────────────────────
SUPPORTED_CHECKS = {
    "identity_user_mfa_enabled_console_access": ["users"],
    "identity_user_valid_email_address": ["users"],
    "identity_password_policy_minimum_length_14": ["password_policies"],
    "identity_password_policy_expires_within_365_days": ["password_policies"],
    "identity_password_policy_prevents_reuse": ["password_policies"],
    "identity_user_api_keys_rotated_90_days": ["users", "api_keys"],
    "identity_user_auth_tokens_rotated_90_days": ["users", "auth_tokens"],
    "identity_user_customer_secret_keys_rotated_90_days": ["users", "customer_secret_keys"],
    "identity_user_db_passwords_rotated_90_days": ["users", "db_credentials"],
    "identity_tenancy_admin_users_no_api_keys": ["users", "groups", "api_keys"],
}

# Checks whose data IDCS does not have (OCI IAM policies / Search / compartments)
UNSUPPORTED_CHECKS = {
    "identity_iam_admins_cannot_update_tenancy_admins": "needs OCI IAM policies",
    "identity_service_level_admins_exist": "needs OCI IAM policies",
    "identity_storage_service_level_admins_scoped": "needs OCI IAM policies",
    "identity_tenancy_admin_permissions_limited": "needs OCI IAM policies",
    "identity_instance_principal_used": "needs OCI dynamic groups + policies",
    "identity_no_resources_in_root_compartment": "needs OCI Search API",
    "identity_non_root_compartment_exists": "needs OCI Search API",
}

# Prowler skips these system-managed, non-configurable policies too
SYSTEM_PASSWORD_POLICIES = {"SimplePasswordPolicy", "StandardPasswordPolicy"}


def fail(msg):
    print(f"[ERROR] {msg}", file=sys.stderr)
    sys.exit(1)


def warn(msg):
    sys.stdout.flush()  # keep warnings in order with normal output
    print(f"[WARN] {msg}", file=sys.stderr)


def check_module_name(check):
    return f"{IDENTITY_PKG}.{check}.{check}"


# ─── Step 1: Settings ────────────────────────────────────────────────────────
# Each setting is resolved as: CLI flag > environment variable > .env file >
# default > interactive prompt (required ones only, when run in a terminal).
DEFAULT_ENV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
DEFAULT_SCOPE = "urn:opc:idm:__myscopes__"

# (arg name, env var, default, required for a live run, secret)
SETTINGS = [
    ("domain_url", "IDCS_DOMAIN_URL", None, True, False),
    ("client_id", "IDCS_CLIENT_ID", None, True, False),
    ("client_secret", "IDCS_CLIENT_SECRET", None, True, True),
    ("scope", "IDCS_SCOPE", DEFAULT_SCOPE, False, False),
    ("oci_region", "OCI_REGION", None, False, False),
    ("tenancy_ocid", "OCI_TENANCY_OCID", None, False, False),
]


def load_env_file(path):
    """Minimal KEY=VALUE .env reader (stdlib only). Missing file -> {}."""
    values = {}
    if not os.path.isfile(path):
        return values
    with open(path, encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            if key.startswith("export "):
                key = key[len("export "):].strip()
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            values[key] = value
    return values


def normalize_domain_url(url):
    """Accept 'idcs-xxx.identity.oraclecloud.com' or a pasted console URL
    ('https://idcs-xxx.../ui/v1/adminconsole') and keep only scheme://host[:port]."""
    url = url.strip()
    if "://" not in url:
        url = f"https://{url}"
    parts = urllib.parse.urlsplit(url)
    if not parts.netloc:
        fail(f"Invalid IDCS domain URL: {url}")
    return f"{parts.scheme}://{parts.netloc}"


def prompt(label, secret):
    """Returns the entered value, "" if left blank, or None at end of input."""
    import getpass

    try:
        value = getpass.getpass(f"{label}: ") if secret else input(f"{label}: ")
    except KeyboardInterrupt:
        print()
        sys.exit(1)
    except EOFError:
        # e.g. stdin is NUL, which Windows reports as a TTY
        print()
        return None
    return value.strip()


def matches_check(term, check):
    """Whole-word match on '_'-separated parts: 'password' hits the
    password_policy checks but not db_passwords; 'api_keys' hits both key checks."""
    words, parts = term.split("_"), check.split("_")
    return any(parts[i : i + len(words)] == words for i in range(len(parts)))


def select_checks(spec):
    """'all' or comma-separated full names / name words (e.g. 'mfa,password')."""
    if not spec or spec.strip().lower() == "all":
        return list(SUPPORTED_CHECKS)
    selected = []
    for term in (t.strip().lower() for t in spec.split(",") if t.strip()):
        if term in UNSUPPORTED_CHECKS:
            fail(f"{term} can't run from IDCS data: {UNSUPPORTED_CHECKS[term]}")
        matches = [c for c in SUPPORTED_CHECKS if matches_check(term, c)]
        if not matches:
            fail(f"No supported check matches '{term}'. See --list-checks.")
        selected += [c for c in matches if c not in selected]
    return selected


def print_check_list():
    print("Supported (IDCS datasets used):")
    for check, datasets in SUPPORTED_CHECKS.items():
        print(f"  {check:<52} {', '.join(datasets)}")
    print("\nNot supported from IDCS:")
    for check, reason in UNSUPPORTED_CHECKS.items():
        print(f"  {check:<52} {reason}")
    print("\nIDCS endpoints (relative to IDCS_DOMAIN_URL):")
    for name, (path, _) in DATASETS.items():
        print(f"  {name:<22} {path}")


def get_settings():
    parser = argparse.ArgumentParser(
        description="Run Prowler's OCI identity checks against IDCS data. Settings come from "
        "CLI flags, then env vars, then the .env file; missing required ones are prompted for.",
    )
    parser.add_argument("domain_url", nargs="?", help="IDCS domain URL [IDCS_DOMAIN_URL]")
    parser.add_argument("client_id", nargs="?", help="[IDCS_CLIENT_ID]")
    parser.add_argument("client_secret", nargs="?", help="[IDCS_CLIENT_SECRET]")
    parser.add_argument(
        "--checks",
        default="all",
        help="'all' (default) or comma-separated check names / name words, e.g. 'mfa,password'",
    )
    parser.add_argument(
        "--list-checks", action="store_true", help="List supported checks and endpoints, then exit."
    )
    parser.add_argument("--scope", help=f"OAuth scope [IDCS_SCOPE] (default {DEFAULT_SCOPE})")
    parser.add_argument(
        "--oci-region",
        help="[OCI_REGION] region for the Attempt 3 OCI Identity API call, e.g. us-ashburn-1",
    )
    parser.add_argument(
        "--tenancy-ocid",
        help="[OCI_TENANCY_OCID] tenancy OCID for the Attempt 3 OCI Identity API call",
    )
    parser.add_argument(
        "--env-file",
        default=DEFAULT_ENV_FILE,
        help="Settings file to read (default: .env next to this script)",
    )
    parser.add_argument(
        "--data-dir",
        help="Offline mode: folder of saved IDCS responses named <dataset>.json "
        f"({', '.join(DATASETS)}). No credentials needed.",
    )
    parser.add_argument(
        "--users-file",
        help="Offline mode shortcut: a saved /admin/v1/Users response (other datasets empty).",
    )
    parser.add_argument(
        "--skip-oci-demo",
        action="store_true",
        help="Don't first show Prowler's native OCI SDK path failing.",
    )
    args = parser.parse_args()
    if args.list_checks:
        print_check_list()
        sys.exit(0)
    args.checks = select_checks(args.checks)
    args.offline = bool(args.data_dir or args.users_file)

    env_file = load_env_file(args.env_file)
    interactive = sys.stdin.isatty()
    missing = []
    for name, env_var, default, required, secret in SETTINGS:
        value = (
            getattr(args, name)
            or os.environ.get(env_var)
            or env_file.get(env_var)
            or default
        )
        value = value.strip() if value else None
        if not value and required and not args.offline:
            if interactive:
                value = prompt(env_var, secret)
                if value is None:  # no input available: stop prompting
                    interactive = False
            if not value:
                missing.append(env_var)
        setattr(args, name, value)

    if missing:
        parser.error(
            f"missing {', '.join(missing)}: pass as arguments, set env vars, "
            f"or add them to {args.env_file}"
        )
    if args.domain_url:
        args.domain_url = normalize_domain_url(args.domain_url)
    return args


# ─── Step 2: Bearer token ────────────────────────────────────────────────────
def http_json(req):
    """Returns (data, None) on success or (None, error message) on failure."""
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8")), None
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return None, f"HTTP {e.code} from {req.full_url}: {body[:500]}"
    except urllib.error.URLError as e:
        return None, f"Cannot reach {req.full_url}: {e.reason}"


def get_bearer_token(domain_url, client_id, client_secret, scope=DEFAULT_SCOPE):
    basic = base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode("ascii")
    body = urllib.parse.urlencode(
        {"grant_type": "client_credentials", "scope": scope}
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{domain_url}/oauth2/v1/token",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
    )
    data, error = http_json(req)
    if error:
        fail(error)
    token = data.get("access_token")
    if not token:
        fail(f"Token response had no access_token: {data}")
    return token


# ─── Step 3: Fetch IDCS datasets ─────────────────────────────────────────────
def fetch_dataset(domain_url, token, name):
    """All pages of one IDCS SCIM resource. Returns (resources, error)."""
    path, attributes = DATASETS[name]
    resources = []
    start_index = 1
    while True:
        params = {"count": PAGE_SIZE, "startIndex": start_index}
        if attributes:
            params["attributes"] = ",".join(attributes)
        req = urllib.request.Request(
            f"{domain_url}{path}?{urllib.parse.urlencode(params)}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
        data, error = http_json(req)
        if error:
            return None, error
        page = data.get("Resources", []) or []
        resources.extend(page)
        total = int(data.get("totalResults", len(resources)))
        if not page or len(resources) >= total:
            return resources, None
        start_index += len(page)


def load_json_resources(path):
    """A saved SCIM ListResponse ({"Resources": [...]}), a bare list, or one resource."""
    try:
        with open(path, encoding="utf-8-sig") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        fail(f"Cannot read {path}: {e}")
    if isinstance(data, dict):
        return data.get("Resources", [data] if "id" in data else [])
    return data


def load_datasets(args, token, needed):
    """Returns {dataset: resources}; datasets that failed to load are left out."""
    loaded = {}
    for name in needed:
        if args.offline:
            if name == "users" and args.users_file:
                path = args.users_file
            elif args.data_dir:
                path = os.path.join(args.data_dir, f"{name}.json")
            else:
                path = None
            if path and os.path.isfile(path):
                loaded[name] = load_json_resources(path)
                print(f"  {name:<22} {len(loaded[name]):>5}  from {path}")
            else:
                print(f"  {name:<22}   n/a  no saved file (<dataset>.json in --data-dir)")
            continue

        resources, error = fetch_dataset(args.domain_url, token, name)
        if error:
            print(f"  {name:<22}   n/a  {error}")
        else:
            loaded[name] = resources
            print(f"  {name:<22} {len(resources):>5}  GET {DATASETS[name][0]}")
    return loaded


# ─── Step 4: Map IDCS data into Prowler's models ─────────────────────────────
def parse_time(value):
    """IDCS ISO-8601 -> timezone-aware datetime (Prowler compares against UTC now)."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def credential_state(raw):
    """IDCS never returns credential `status`, so derive Prowler's lifecycle_state
    from expiry: expired -> INACTIVE, otherwise ACTIVE."""
    expires = parse_time(raw.get("expiresOn"))
    if raw.get("expired") or (expires and expires <= datetime.now(timezone.utc)):
        return "INACTIVE"
    return "ACTIVE"


def owner_id(raw):
    return (raw.get("user") or {}).get("value")


def mfa_status(raw):
    """The user's IDCS mfaStatus, or None if the response didn't include it."""
    return (raw.get(MFA_EXT) or {}).get("mfaStatus")


def build_users(raw_users, data, compartment_id):
    from prowler.providers.oraclecloud.services.identity.identity_service import (
        ApiKey,
        AuthToken,
        CustomerSecretKey,
        DbPassword,
        User,
    )

    def by_owner(dataset, build):
        grouped = {}
        for raw in data.get(dataset, []):
            if owner_id(raw):
                grouped.setdefault(owner_id(raw), []).append(build(raw))
        return grouped

    api_keys = by_owner(
        "api_keys",
        lambda r: ApiKey(
            key_id=r["id"],
            fingerprint=r.get("fingerprint") or "",
            lifecycle_state=credential_state(r),
            time_created=parse_time((r.get("meta") or {}).get("created")),
            user_id=owner_id(r),
        ),
    )
    auth_tokens = by_owner(
        "auth_tokens",
        lambda r: AuthToken(
            id=r["id"],
            description=r.get("description") or "",
            lifecycle_state=credential_state(r),
            time_created=parse_time((r.get("meta") or {}).get("created")),
            time_expires=parse_time(r.get("expiresOn")),
            user_id=owner_id(r),
        ),
    )
    secret_keys = by_owner(
        "customer_secret_keys",
        lambda r: CustomerSecretKey(
            id=r["id"],
            display_name=r.get("displayName") or "",
            lifecycle_state=credential_state(r),
            time_created=parse_time((r.get("meta") or {}).get("created")),
            time_expires=parse_time(r.get("expiresOn")),
            user_id=owner_id(r),
        ),
    )
    db_passwords = by_owner(
        "db_credentials",
        lambda r: DbPassword(
            id=r["id"],
            description=r.get("description") or "",
            lifecycle_state=credential_state(r),
            time_created=parse_time((r.get("meta") or {}).get("created")),
            time_expires=parse_time(r.get("expiresOn")),
            user_id=owner_id(r),
        ),
    )

    users = []
    for raw in raw_users:
        emails = raw.get("emails") or []
        primary = next((e for e in emails if e.get("primary")), emails[0] if emails else {})
        capabilities = raw.get(CAPABILITIES_EXT) or {}
        user_id = raw.get("id")
        users.append(
            User(
                id=user_id,
                name=raw.get("userName") or user_id,
                description=raw.get("displayName") or "",
                email=primary.get("value", ""),
                email_verified=bool(primary.get("verified", False)),
                compartment_id=compartment_id,
                time_created=parse_time((raw.get("meta") or {}).get("created")),
                lifecycle_state="ACTIVE" if raw.get("active", True) else "INACTIVE",
                # Missing flag -> True: IDCS users can use console passwords unless
                # an admin turned the capability off (see warn_about_gaps).
                can_use_api_keys=capabilities.get("canUseApiKeys", True),
                can_use_console_password=capabilities.get("canUseConsolePassword", True),
                is_mfa_activated=str(mfa_status(raw) or "").upper() == "ENROLLED",
                api_keys=api_keys.get(user_id, []),
                auth_tokens=auth_tokens.get(user_id, []),
                customer_secret_keys=secret_keys.get(user_id, []),
                db_passwords=db_passwords.get(user_id, []),
                groups=[g["value"] for g in raw.get("groups") or [] if g.get("value")],
                region="global",
            )
        )
    return users


def build_identity_service(data, args):
    """A real Prowler Identity object, populated from IDCS instead of the OCI SDK.

    Identity.__new__ skips __init__ (which calls the OCI IAM API); we then set
    the same attributes __init__ would, filled from IDCS where we have the data.
    """
    from prowler.providers.oraclecloud.services.identity.identity_service import (
        DomainPasswordPolicy,
        Group,
        Identity,
        IdentityDomain,
    )

    compartment_id = args.tenancy_ocid or "idcs-identity-domain"
    domain_host = urllib.parse.urlsplit(args.domain_url or "").netloc or "idcs-domain"

    identity = Identity.__new__(Identity)
    identity.provider = None
    identity.audited_tenancy = compartment_id
    identity.audited_regions = []
    identity.users = build_users(data.get("users", []), data, compartment_id)
    identity.groups = [
        Group(
            id=g["id"],
            name=g.get("displayName") or g["id"],
            compartment_id=compartment_id,
            time_created=parse_time((g.get("meta") or {}).get("created")),
            lifecycle_state="ACTIVE",
            region="global",
        )
        for g in data.get("groups", [])
    ]
    identity.domains = []
    if "password_policies" in data:
        identity.domains.append(
            IdentityDomain(
                id=domain_host,
                display_name=domain_host,
                url=args.domain_url or "",
                home_region=args.oci_region or "global",
                compartment_id=compartment_id,
                lifecycle_state="ACTIVE",
                region="global",
                password_policies=[
                    DomainPasswordPolicy(
                        id=p["id"],
                        name=p.get("name") or p["id"],
                        description=p.get("description") or "",
                        min_length=p.get("minLength"),
                        password_expires_after=p.get("passwordExpiresAfter"),
                        num_passwords_in_history=p.get("numPasswordsInHistory"),
                        password_expire_warning=p.get("passwordExpireWarning"),
                        min_password_age=p.get("minPasswordAge"),
                    )
                    for p in data["password_policies"]
                    if p.get("id") not in SYSTEM_PASSWORD_POLICIES
                ],
            )
        )
    identity.policies = []
    identity.dynamic_groups = []
    identity.password_policy = None
    identity.root_compartment_resources = []
    identity.active_non_root_compartments = []
    return identity


def warn_about_gaps(checks, data):
    users = data.get("users", [])
    if "identity_user_mfa_enabled_console_access" in checks and users:
        if not any(mfa_status(u) is not None for u in users):
            warn(
                f"No user has {MFA_EXT}:mfaStatus - either nobody is enrolled or the app "
                "can't read it. Verify before trusting MFA FAIL results."
            )
        if not any(CAPABILITIES_EXT in u for u in users):
            warn(
                "No user has the capabilities extension; console access was assumed "
                "(can_use_console_password=True) for everyone."
            )
    if "identity_tenancy_admin_users_no_api_keys" in checks and users:
        if not any(u.get("groups") for u in users):
            warn("No user has group memberships; the tenancy-admin check will find no admins.")


# ─── Steps 5 + 6: Patch, import and run the real checks ──────────────────────
def run_prowler_checks(checks, identity_service):
    """Returns [(check, findings or None, error or None)]."""
    modules = [check_module_name(c) for c in checks]

    # Each check binds `identity_client` at import time
    # (`from ...identity_client import identity_client`), and identity_client.py
    # calls Identity(Provider.get_global_provider()) at import time too. Drop any
    # cached copies so the imports below re-run under our patches; restore the
    # originals afterwards so no half-built Identity is left in sys.modules.
    cached = {
        name: sys.modules.pop(name)
        for name in modules + [IDENTITY_CLIENT_MODULE]
        if name in sys.modules
    }

    results = []
    try:
        with contextlib.ExitStack() as stack:
            # Patch 1 first, so importing identity_client.py never touches the OCI SDK
            stack.enter_context(
                unittest.mock.patch(f"{IDENTITY_SERVICE_MODULE}.Identity.__init__", return_value=None)
            )
            for check, module_name in zip(checks, modules):
                try:
                    # Patch 2 (resolving it imports the check module under patch 1)
                    stack.enter_context(
                        unittest.mock.patch(f"{module_name}.identity_client", identity_service)
                    )
                    module = importlib.import_module(module_name)
                    # Check.__init__(**data) ignores its args and loads .metadata.json
                    instance = getattr(module, check)()
                    results.append((check, instance.execute(), None))
                except Exception as e:
                    results.append((check, None, f"{type(e).__name__}: {e}"))
    finally:
        for name in modules + [IDENTITY_CLIENT_MODULE]:
            sys.modules.pop(name, None)
        sys.modules.update(cached)
    return results


# ─── Step 0: Show Prowler's native OCI SDK path failing ──────────────────────
def call_oci_identity_api_with_idcs_token(token, region, tenancy_ocid):
    """Fire the OCI IAM ListUsers API (what Prowler's Identity service calls via
    the OCI SDK) with the IDCS Bearer token, and print OCI's exact response."""
    url = (
        f"https://identity.{region}.oci.oraclecloud.com/20160918/users?"
        + urllib.parse.urlencode({"compartmentId": tenancy_ocid})
    )
    print(f"  GET {url}")
    print("  Authorization: Bearer <IDCS access token>")
    req = urllib.request.Request(
        url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            print(f"  -> HTTP {resp.status}: OCI ACCEPTED the IDCS token (unexpected).")
    except urllib.error.HTTPError as e:
        print(f"  -> FAILED: HTTP {e.code} {e.reason}")
        print(f"     opc-request-id: {e.headers.get('opc-request-id', '-')}")
        body = e.read().decode("utf-8", errors="replace").strip()
        for line in body.splitlines():
            print(f"     {line}")
    except urllib.error.URLError as e:
        print(f"  -> Could not reach OCI: {e.reason}")


def show_oci_sdk_failure(token=None, oci_region=None, tenancy_ocid=None):
    """Run Prowler's normal OCI path for real and print the errors it raises.

    Nothing here is simulated: each attempt calls Prowler code / the OCI API
    unpatched and prints whatever comes back (or says so if it unexpectedly works).
    """
    import logging

    demo_check = "identity_user_mfa_enabled_console_access"
    demo_module = check_module_name(demo_check)

    print("=" * 78)
    print("PART 1: Prowler's native OCI SDK path (no .pem / ~/.oci/config)")
    print("=" * 78)

    # Prowler logs setup failures at CRITICAL; the exceptions below say the same.
    logging.getLogger().setLevel(logging.CRITICAL + 1)

    # Attempt 1: what `prowler oraclecloud` does first - build an OCI SDK session
    print("\n[Attempt 1] OraclecloudProvider.setup_session()  (OCI SDK config + API key)")
    try:
        from prowler.providers.oraclecloud.oraclecloud_provider import OraclecloudProvider

        OraclecloudProvider.setup_session()
        print("  -> Session created: OCI SDK credentials ARE configured on this machine.")
    except Exception as e:
        cause = getattr(e, "original_exception", None) or e.__cause__
        print(f"  -> FAILED: {type(e).__name__}: {e}")
        if cause is not None:
            print(f"     cause : {type(cause).__name__}: {cause}")

    # Attempt 2: load an identity check with no OCI provider set (no patches)
    print(f"\n[Attempt 2] import {demo_check}  (identity_client needs an OCI provider)")
    cached = {
        name: sys.modules.pop(name)
        for name in (demo_module, IDENTITY_CLIENT_MODULE)
        if name in sys.modules
    }
    try:
        importlib.import_module(demo_module)
        print("  -> Imported: a global OCI provider is already set in this process.")
    except Exception as e:
        print(f"  -> FAILED: {type(e).__name__}: {e}")
        print("     at    : identity_client.py -> Identity(Provider.get_global_provider())")
    finally:
        for name in (demo_module, IDENTITY_CLIENT_MODULE):
            sys.modules.pop(name, None)
        sys.modules.update(cached)

    # Attempt 3: the OCI Identity API Prowler uses, called with the IDCS token
    print("\n[Attempt 3] OCI Identity API (used by Prowler's Identity service) with IDCS token")
    if not token:
        print("  -> Skipped: needs a live IDCS token (not available offline).")
    elif not (oci_region and tenancy_ocid):
        print("  -> Skipped: pass --oci-region and --tenancy-ocid "
              "(or OCI_REGION / OCI_TENANCY_OCID) to run it.")
    else:
        call_oci_identity_api_with_idcs_token(token, oci_region, tenancy_ocid)

    print("\n=> The unmodified checks cannot run through the OCI SDK without a .pem key,")
    print("   and the OCI Identity API does not accept an IDCS Bearer token.")
    print()
    print("=" * 78)
    print("PART 2: Bypass OCI SDK - IDCS Bearer token -> Prowler Identity -> same checks")
    print("=" * 78)


# ─── Step 7: Report ──────────────────────────────────────────────────────────
def print_results(results, data):
    totals = {}
    for check, findings, error in results:
        missing = [d for d in SUPPORTED_CHECKS[check] if d not in data]
        print(f"\n## {check}")
        if error:
            print(f"  [ERROR] {error}")
            totals["ERROR"] = totals.get("ERROR", 0) + 1
            continue
        if missing:
            print(f"  [WARN] IDCS data not loaded: {', '.join(missing)} - results incomplete")
        if not findings:
            print("  (no findings - nothing in scope)")
        for f in findings:
            print(f'  [{f.status}] {f.resource_name} → "{f.status_extended}"')
            totals[f.status] = totals.get(f.status, 0) + 1

    order = ["PASS", "FAIL", "MANUAL", "ERROR"]
    parts = [f"{totals[s]} {s.lower()}" for s in order if s in totals]
    parts += [f"{n} {s.lower()}" for s, n in totals.items() if s not in order]
    print(f"\nSummary ({len(results)} checks): {', '.join(parts) or 'no findings'}")
    return totals.get("FAIL", 0) + totals.get("ERROR", 0)


def main():
    args = get_settings()
    token = None
    if not args.offline:
        token = get_bearer_token(args.domain_url, args.client_id, args.client_secret, args.scope)
    if not args.skip_oci_demo:
        show_oci_sdk_failure(token, args.oci_region, args.tenancy_ocid)

    needed = []
    for check in args.checks:
        needed += [d for d in SUPPORTED_CHECKS[check] if d not in needed]
    source = "offline files" if args.offline else f"{args.domain_url} (IDCS Bearer token)"
    print(f"Source: {source}")
    print(f"Checks: {len(args.checks)}  |  IDCS data loaded:")
    data = load_datasets(args, token, needed)

    warn_about_gaps(args.checks, data)
    identity_service = build_identity_service(data, args)
    results = run_prowler_checks(args.checks, identity_service)
    problems = print_results(results, data)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
