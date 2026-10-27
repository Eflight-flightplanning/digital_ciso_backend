from cis_checks.base import Check

APP_ATTRIBUTES = ["displayName", "active", "isOAuthClient", "clientType", "allowedGrants", "meta"]


def oauth_clients(api, ctx):
    if "oauth_clients" not in ctx:
        ctx["oauth_clients"] = api.list("Apps", filter="isOAuthClient eq true", attributes=APP_ATTRIBUTES)
    return ctx["oauth_clients"]


class identity_domain_integrations_use_oauth(Check):
    def execute(self, api, ctx):
        apps = [a for a in oauth_clients(api, ctx) if a.get("active", True)]
        rows = [
            {
                "name": a.get("displayName"),
                "client_type": a.get("clientType"),
                "grants": a.get("allowedGrants") or [],
                "password_grant": "password" in (a.get("allowedGrants") or []),
            }
            for a in apps
        ]
        password_grant = [r["name"] for r in rows if r["password_grant"]]
        evidence = {"oauth_clients": rows, "client_count": len(rows), "password_grant_clients": password_grant}

        if password_grant:
            reason = (
                f"Provisional: {len(password_grant)} active OAuth client(s) allow the resource-owner password grant, which sends a "
                f"user's static password ({', '.join(password_grant[:5])}). Basic Authentication use inside Fusion is NOT assessed from here."
            )
            return self.result("FAIL (provisional)", reason, evidence)
        reason = (
            f"{len(rows)} active OAuth clients are registered and none allows the password grant. Whether Fusion integrations still "
            "use Basic Authentication is NOT assessed from here (needs Fusion audit logs)."
        )
        return self.result("PARTIAL", reason, evidence)
