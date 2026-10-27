"""Runs security_platform's Prowler OCI identity checks (MFA, password length, password expiry)
on this run's identity domain data, through prowler_runner.py in security_platform's own Python.

Configuration (both required, otherwise the built-in logic is used):
  PROWLER_ROOT    folder that contains the prowler package, e.g. D:\\security_platform
  PROWLER_PYTHON  a Python with Prowler's dependencies, e.g. D:\\security_platform\\backend\\.venv\\Scripts\\python.exe
"""
import json
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

from .base import EXT_CAPABILITIES, EXT_MFA, env_int
from .context import user_ext, users

RUNNER = Path(__file__).with_name("prowler_runner.py")
SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3, "informational": 4}


class ProwlerError(RuntimeError):
    pass


def settings():
    """Inside security_platform the defaults are this repository's prowler/ folder and the running Python.
    PROWLER_ROOT=off switches the Prowler checks off (the identity domain checks are used instead)."""
    repo = Path(__file__).resolve().parents[2]
    env_root = os.environ.get("PROWLER_ROOT", "").strip()
    if env_root.lower() == "off":
        return "", ""
    root = env_root or (str(repo) if (repo / "prowler").is_dir() else "")
    python = os.environ.get("PROWLER_PYTHON", "").strip() or (sys.executable if root else "")
    return root, python


def configured():
    root, python = settings()
    return bool(root and python)


def password_policies(api, ctx):
    if "password_policies" not in ctx:
        ctx["password_policies"] = api.list("PasswordPolicies")
    return ctx["password_policies"]


def highest(severities):
    known = [s for s in severities if s in SEVERITY_RANK]
    return min(known, key=SEVERITY_RANK.get) if known else None


def run(api, ctx):
    """Prowler results keyed by check id, cached for the run. Raises ProwlerError on failure."""
    if "prowler" in ctx:
        if isinstance(ctx["prowler"], ProwlerError):
            raise ctx["prowler"]
        return ctx["prowler"]
    root, python = settings()
    host = urlparse(getattr(api, "base", "") or "").hostname or "idcs-domain"
    payload = {
        "users": [
            {
                "id": u["id"],
                "userName": u.get("userName"),
                "active": u.get("active", True),
                "mfa_status": user_ext(u, EXT_MFA, "mfaStatus"),
                "can_use_console_password": user_ext(u, EXT_CAPABILITIES, "canUseConsolePassword", True),
            }
            for u in users(api, ctx)
        ],
        "password_policies": password_policies(api, ctx),
        "domain": {"id": host, "name": os.environ.get("TENANT_NAME") or host, "url": getattr(api, "base", "")},
    }
    try:
        proc = subprocess.run(
            [python, "-I", str(RUNNER), root],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=env_int("PROWLER_TIMEOUT", 300),
        )
        if proc.returncode != 0:
            last = (proc.stderr.strip().splitlines() or ["no error output"])[-1]
            raise ProwlerError(f"Prowler runner exited with code {proc.returncode}: {last[:300]}")
        ctx["prowler"] = json.loads(proc.stdout)["checks"]
    except ProwlerError as exc:
        ctx["prowler"] = exc
        raise
    except (OSError, subprocess.TimeoutExpired, ValueError, KeyError) as exc:
        ctx["prowler"] = ProwlerError(f"{type(exc).__name__}: {exc}")
        raise ctx["prowler"] from exc
    return ctx["prowler"]
