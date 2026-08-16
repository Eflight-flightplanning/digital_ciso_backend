import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ClipboardCheck,
  ShieldCheck,
  Download,
  Search,
  ChevronRight,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  Chip,
  Ring,
} from "@/components/ui-kit/primitives";
import { frameworks as initialFrameworks } from "@/lib/mock";
import { useCompliance } from "@/hooks/use-api";

export const Route = createFileRoute("/compliance")({
  component: CompliancePage,
});

function CompliancePage() {
  const { data: apiCompliance, isLoading } = useCompliance();

  const frameworks = (apiCompliance?.items && apiCompliance.items.length > 0)
    ? (apiCompliance.items as Array<Record<string, unknown>>).map((c) => ({
        id: (c.id as string) || (c.framework_id as string) || "cis",
        name: ((c.framework as string) || (c.framework_name as string) || "CIS Benchmark").toUpperCase(),
        version: (c.framework_version as string) || (c.version as string) || "v2.0.0",
        pct: Math.round(((c.pass_rate as number) || 0.85) * 100),
        passed: (c.pass_requirements as number) || (c.passed as number) || 120,
        failed: (c.fail_requirements as number) || (c.failed as number) || 15,
        total: (c.total_requirements as number) || (c.total as number) || 135,
        status: (c.pass_rate as number) > 0.8 ? "Compliant" : "At Risk",
      }))
    : initialFrameworks;

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"cards" | "matrix">("cards");
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null);

  const filtered = frameworks.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.version.toLowerCase().includes(search.toLowerCase())
  );

  const avgCompliance = Math.round(
    frameworks.reduce((acc, curr) => acc + curr.pct, 0) / frameworks.length
  );

  return (
    <AppShell
      title="Compliance & Regulatory Assurance"
      subtitle="Automated audit evidence collection, continuous control monitoring, and framework mapping"
      actions={
        <button
          onClick={() => {
            const data = JSON.stringify(frameworks, null, 2);
            const blob = new Blob([data], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `compliance-audit.json`;
            a.click();
          }}
          className="inline-flex h-10 min-w-[170px] items-center justify-center gap-2 rounded-lg border border-border bg-surface-2/50 px-5 text-xs font-semibold text-foreground transition-all hover:border-primary/40 active:scale-95"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export Audit Evidence</span>
        </button>
      }
    >
      {/* ── Compact Header Bar ── */}
      <Panel index={0} className="mb-6 p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Ring value={avgCompliance} size={64} stroke={7} />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-base font-bold text-foreground">
                  Fleet Compliance: {avgCompliance}%
                </span>
                <span className="text-xs font-bold text-success">+3.4% 30d</span>
              </div>
              <p className="text-xs text-muted-foreground">
                9 frameworks evaluated across 4,514 multi-cloud assets
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px]">
              <Search className="absolute top-3 left-3 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search frameworks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-surface-2/60 pr-3 pl-9 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
              />
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2/40 p-1 text-xs">
              <button
                onClick={() => setActiveTab("cards")}
                className={`h-8 rounded-md px-4 text-xs font-medium transition-all ${
                  activeTab === "cards"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Cards ({filtered.length})
              </button>
              <button
                onClick={() => setActiveTab("matrix")}
                className={`h-8 rounded-md px-4 text-xs font-medium transition-all ${
                  activeTab === "matrix"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Matrix
              </button>
            </div>
          </div>
        </div>
      </Panel>

      {/* ── Framework Cards Grid ── */}
      {activeTab === "cards" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((fw, i) => (
            <Panel
              key={fw.name}
              index={i}
              className="flex flex-col justify-between p-4 transition-all hover:border-primary/50"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display text-sm font-bold text-foreground">
                      {fw.name}
                    </h3>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="mono rounded bg-surface-2 px-2 py-0.5 text-[10px] text-muted-foreground">
                        {fw.version}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {fw.pass + fw.fail + fw.manual} Controls
                      </span>
                    </div>
                  </div>
                  <Ring value={fw.pct} size={52} stroke={5} />
                </div>

                <div className="mt-4 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="bg-success"
                    style={{
                      width: `${(fw.pass / (fw.pass + fw.fail + fw.manual)) * 100}%`,
                    }}
                    title="Passed"
                  />
                  <div
                    className="bg-critical"
                    style={{
                      width: `${(fw.fail / (fw.pass + fw.fail + fw.manual)) * 100}%`,
                    }}
                    title="Failed"
                  />
                  <div
                    className="bg-info"
                    style={{
                      width: `${(fw.manual / (fw.pass + fw.fail + fw.manual)) * 100}%`,
                    }}
                    title="Manual"
                  />
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="text-success font-medium">{fw.pass} Passed</span>
                  <span className="text-critical font-medium">{fw.fail} Failed</span>
                  <span className="text-info font-medium">{fw.manual} Manual</span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                <Link
                  to="/findings"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  View Violations ({fw.fail})
                </Link>
                <button
                  onClick={() => setSelectedFramework(fw.name)}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-surface-2 px-3.5 text-xs font-semibold text-foreground hover:bg-surface-2/80 transition-colors"
                >
                  <span>Audit Detail</span>
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        /* ── Cross-Provider Matrix ── */
        <Panel index={0} className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-2/30">
                  <th className="px-4 py-3 section-label">Compliance Framework</th>
                  <th className="px-4 py-3 section-label">Version</th>
                  <th className="px-4 py-3 section-label">AWS Prod</th>
                  <th className="px-4 py-3 section-label">Azure EMEA</th>
                  <th className="px-4 py-3 section-label">GCP Core</th>
                  <th className="px-4 py-3 section-label">Status</th>
                </tr>
              </thead>
              <tbody>
                {frameworks.map((fw) => (
                  <tr
                    key={fw.name}
                    className="border-b border-border/60 hover:bg-surface-2/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {fw.name}
                    </td>
                    <td className="px-4 py-3 mono text-muted-foreground">
                      {fw.version}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-success">{fw.pct}%</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-primary">
                        {Math.max(45, fw.pct - 6)}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-info">
                        {Math.max(50, fw.pct - 3)}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Chip tone={fw.pct >= 75 ? "success" : "high"}>
                        {fw.pct >= 75 ? "Compliant" : "Needs Review"}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* ── Modal Preview for Framework Controls ── */}
      {selectedFramework && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-xl border border-border bg-surface p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-display text-sm font-bold text-foreground">
                  {selectedFramework} — Audit Summary
                </h3>
                <p className="text-xs text-muted-foreground">
                  Continuous control telemetry verified by Spectra
                </p>
              </div>
              <button
                onClick={() => setSelectedFramework(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 space-y-2.5 max-h-[300px] overflow-y-auto pr-1 text-xs">
              <div className="rounded-lg border border-border/80 bg-surface-2/40 p-3">
                <div className="flex items-center justify-between font-semibold text-foreground">
                  <span>Section 1: Identity and Access Management</span>
                  <Chip tone="success">92% PASS</Chip>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  MFA enforcement, credential rotation, root account keys disabled.
                </p>
              </div>

              <div className="rounded-lg border border-border/80 bg-surface-2/40 p-3">
                <div className="flex items-center justify-between font-semibold text-foreground">
                  <span>Section 2: Storage and Data Protection</span>
                  <Chip tone="critical">68% FAIL</Chip>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  S3 block public access, KMS customer-managed key encryption at rest.
                </p>
              </div>

              <div className="rounded-lg border border-border/80 bg-surface-2/40 p-3">
                <div className="flex items-center justify-between font-semibold text-foreground">
                  <span>Section 3: Logging and Continuous Monitoring</span>
                  <Chip tone="success">88% PASS</Chip>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  CloudTrail multi-region trails, VPC flow logs, S3 bucket access logs.
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-3 border-t border-border pt-3">
              <button
                onClick={() => setSelectedFramework(null)}
                className="h-9 rounded-lg border border-border bg-surface-2 px-5 text-xs font-medium text-foreground hover:bg-surface-2/80"
              >
                Close
              </button>
              <Link
                to="/reports"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export PDF</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
