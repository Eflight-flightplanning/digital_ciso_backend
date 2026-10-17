"""
Local Prowler API Server for Postman Demonstration
==================================================
Runs on http://localhost:8080.
Accepts POST /prowler/audit-idcs with IDCS credentials and executes
Prowler's official CIS checks, returning findings in JSON format to Postman.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


class ProwlerApiHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path in ("/prowler/audit-idcs", "/api/v1/prowler/audit-idcs"):
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode() if content_length > 0 else "{}"
            try:
                data = json.loads(body)
            except Exception:
                data = {}

            domain_url = (data.get("domain_url") or data.get("idcs_url") or "").strip()
            client_id = (data.get("client_id") or "").strip()
            client_secret = (data.get("client_secret") or "").strip()

            if not domain_url or not client_id or not client_secret:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({
                    "error": "Missing required fields. Provide 'domain_url', 'client_id', and 'client_secret'."
                }).encode())
                return

            try:
                # 100% Native Prowler Classes
                from prowler.providers.oracle_saas.oracle_saas_provider import OracleSaasProvider
                from prowler.providers.oracle_saas.services.iam import ErpIamService
                from prowler.providers.oracle_saas.services.iam.iam_mfa_not_enforced_admin.iam_mfa_not_enforced_admin import (
                    iam_mfa_not_enforced_admin,
                )

                provider = OracleSaasProvider(
                    auth_type="oauth2",
                    domain_url=domain_url,
                    client_id=client_id,
                    client_secret=client_secret,
                    erp_base_url=domain_url,
                    erp_type="FUSION_ERP",
                )

                if not provider.session.access_token:
                    self.send_response(401)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "status": "AUTH_FAILED",
                        "message": "Could not acquire OAuth2 token from IDCS. Verify client_id and client_secret."
                    }).encode())
                    return

                # Prowler IAM Service
                service = ErpIamService(provider)
                users = [
                    {
                        "username": u.username,
                        "display_name": u.display_name,
                        "active": u.active,
                        "mfa_enabled": u.mfa_enabled,
                    }
                    for u in service.users
                ]

                # Execute Prowler Check
                check = iam_mfa_not_enforced_admin()
                findings = [
                    {
                        "check_id": f.metadata.CheckID,
                        "status": f.status,
                        "status_extended": f.status_extended,
                    }
                    for f in check.execute()
                ]

                # Password policy check
                pw_url = provider.get_idcs_url("admin/v1/PasswordPolicies")
                pw_data, pw_ok = provider.get_json_with_status(pw_url)
                policies = []
                if pw_ok and "Resources" in pw_data:
                    for p in pw_data["Resources"]:
                        min_len = p.get("minLength", 0)
                        policies.append({
                            "name": p.get("name"),
                            "min_length": min_len,
                            "compliant_cis_1_4": isinstance(min_len, int) and min_len >= 14,
                        })

                response = {
                    "engine": "Prowler Security Assessment Engine",
                    "status": "COMPLETED",
                    "idcs_domain": domain_url,
                    "total_monitored_users": len(users),
                    "prowler_cis_mfa_findings": findings,
                    "prowler_cis_password_policy": policies,
                    "raw_idcs_users": users,
                }

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(response, indent=2).encode())

            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()


def start_server(port=8080):
    server = HTTPServer(("127.0.0.1", port), ProwlerApiHandler)
    print(f"\n=================================================================")
    print(f"  Prowler Local API Server is LIVE on http://localhost:{port}")
    print(f"  Postman Endpoint: POST http://localhost:{port}/prowler/audit-idcs")
    print(f"=================================================================\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        server.server_close()


if __name__ == "__main__":
    start_server()
