import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { OracleCisTab } from "@/components/oracle-cis/OracleCisTab";

/**
 * Oracle SaaS: the CIS Oracle SaaS Cloud Applications Benchmark v1.0.0 assessment (identity domain + Fusion pod),
 * with identity risks (dormant accounts, ghost employees), Jira tickets, remediation and the connection settings.
 * "Open in new tab" shows the same dashboard full-screen at /oracle-saas-cis.
 */
export const Route = createFileRoute("/oracle-saas")({
  component: OracleSaasPage,
});

function OracleSaasPage() {
  return (
    <AppShell>
      <div className="pb-12">
        <OracleCisTab />
      </div>
    </AppShell>
  );
}
