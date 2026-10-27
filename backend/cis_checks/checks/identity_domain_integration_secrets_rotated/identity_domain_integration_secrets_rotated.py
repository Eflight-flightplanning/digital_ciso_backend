from cis_checks.base import Check, env_int, parse_time, utc_now
from cis_checks.checks.identity_domain_integrations_use_oauth.identity_domain_integrations_use_oauth import oauth_clients


class identity_domain_integration_secrets_rotated(Check):
    def execute(self, api, ctx):
        max_days = env_int("SECRET_ROTATION_DAYS", 180)
        now = utc_now()
        rows = []
        for app in oauth_clients(api, ctx):
            if not app.get("active", True) or (app.get("clientType") or "").lower() != "confidential":
                continue
            meta = app.get("meta") or {}
            modified = parse_time(meta.get("lastModified")) or parse_time(meta.get("created"))
            age = (now - modified).days if modified else None
            rows.append(
                {
                    "name": app.get("displayName"),
                    "created": meta.get("created"),
                    "last_modified": meta.get("lastModified"),
                    "days_since_change": age,
                    "stale": age is None or age > max_days,
                }
            )
        stale = [r for r in rows if r["stale"]]
        evidence = {"rotation_days": max_days, "confidential_clients": rows, "stale_clients": len(stale)}

        if not rows:
            return self.result("PARTIAL", "No active confidential OAuth clients were found in the identity domain. JWT keys and certificates held elsewhere are NOT assessed from here.", evidence)
        if stale:
            names = ", ".join(r["name"] or "?" for r in stale[:5])
            reason = (
                f"{len(stale)} of {len(rows)} confidential OAuth clients have not changed in over {max_days} days, so their "
                f"secrets cannot have been regenerated in that period ({names})."
            )
            return self.result("FAIL", reason, evidence)
        reason = (
            f"All {len(rows)} confidential OAuth clients changed within {max_days} days. A configuration change does not prove "
            "the secret was rotated, so confirm against rotation records."
        )
        return self.result("PARTIAL", reason, evidence)
