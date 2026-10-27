"""Tests never use a real tenant: clear connection settings the environment may have, and switch Prowler off."""
import os

for _name in (
    "IDCS_BASE", "IDCS_CLIENT_ID", "IDCS_CLIENT_SECRET",
    "ORACLE_FUSION_POD_URL", "ORACLE_FUSION_USERNAME", "ORACLE_FUSION_PASSWORD",
    "PROWLER_PYTHON", "EXCLUDE_ACTORS", "ORACLE_CIS_REMEDIATION_LIVE",
):
    os.environ.pop(_name, None)
os.environ["PROWLER_ROOT"] = "off"
os.environ["ORACLE_CIS_RUN_IN_THREAD"] = "false"
