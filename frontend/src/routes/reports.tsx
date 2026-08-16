import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FileBarChart,
  Download,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  PanelTitle,
  Chip,
  DataTable,
  Row,
} from "@/components/ui-kit/primitives";
import { reportHistory as initialReports } from "@/lib/mock";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const [reports, setReports] = useState<Array<{ id: string; framework: string; range: string; format: string; created: string; size: string }>>([]);
  const [framework, setFramework] = useState("CIS AWS Foundations");
  const [format, setFormat] = useState("PDF");
  const [range, setRange] = useState("Last 30 Days");
  const [generating, setGenerating] = useState(false);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      const newReport = {
        id: `RPT-${Math.floor(3000 + Math.random() * 9000)}`,
        framework,
        range: "Current Period",
        format,
        created: "Just now",
        size: format === "PDF" ? "3.2 MB" : "1.4 MB",
      };
      setReports([newReport, ...reports]);
      setGenerating(false);
    }, 1000);
  };

  const handleDownload = (id: string, name: string) => {
    const text = `Digital CISO Executive Report\nReport ID: ${id}\nFramework: ${name}\nGenerated: ${new Date().toISOString()}`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/\s+/g, "_")}_${id}.txt`;
    a.click();
  };

  return (
    <AppShell
      title="Executive Reporting & Audit Exports"
      subtitle="Generate audit-ready board presentations, compliance attestations, and raw finding telemetry"
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Report Generation Panel ── */}
        <Panel index={0} holo glow="primary" className="p-5">
          <PanelTitle
            title="Generate Audit Report"
            hint="Compile real-time posture and telemetry evidence"
          />

          <div className="mt-4 space-y-4 text-xs">
            <div>
              <label className="section-label mb-1.5 block">Audit Framework</label>
              <select
                value={framework}
                onChange={(e) => setFramework(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-foreground outline-none"
              >
                <option value="CIS AWS Foundations">CIS AWS Foundations v3.0</option>
                <option value="SOC 2 Type II">SOC 2 Type II Security Assessment</option>
                <option value="ISO/IEC 27001">ISO 27001 ISMS Audit</option>
                <option value="NIST 800-53">NIST 800-53 Rev 5 Moderate</option>
                <option value="PCI-DSS v4.0">PCI-DSS v4.0 Cardholder Data</option>
                <option value="All Findings Telemetry">Comprehensive Finding Export</option>
              </select>
            </div>

            <div>
              <label className="section-label mb-1.5 block">Evaluation Range</label>
              <select
                value={range}
                onChange={(e) => setRange(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-foreground outline-none"
              >
                <option value="Current Live State">Current Live State (Instant)</option>
                <option value="Last 7 Days">Last 7 Days Rolling</option>
                <option value="Last 30 Days">Last 30 Days Rolling</option>
                <option value="Q2 2026">Q2 2026 Quarterly Snapshot</option>
              </select>
            </div>

            <div>
              <label className="section-label mb-1.5 block">Export Format</label>
              <div className="grid grid-cols-3 gap-2">
                {["PDF", "CSV", "JSON"].map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setFormat(fmt)}
                    className={`h-9 rounded-lg border text-center text-xs font-semibold transition-all ${
                      format === fmt
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-surface-2 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-xs font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-40 active:scale-95"
            >
              <Download className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
              <span>{generating ? "Compiling Report..." : "Generate & Download Report"}</span>
            </button>
          </div>
        </Panel>

        {/* ── Generated Reports History ── */}
        <div className="space-y-4 lg:col-span-2">
          <Panel index={1} className="p-0">
            <div className="p-4 border-b border-border/80">
              <h3 className="font-display text-sm font-bold text-foreground">
                Generated Reports & Audit Archive
              </h3>
              <p className="text-xs text-muted-foreground">
                Download past snapshots and audit attestation packages
              </p>
            </div>

            <DataTable
              head={[
                "Report ID",
                "Framework / Scope",
                "Range",
                "Format",
                "Generated",
                "Size",
                "Action",
              ]}
            >
              {reports.map((r, i) => (
                <Row key={r.id} index={i}>
                  <td className="mono px-4 py-3 text-xs font-semibold text-foreground">
                    {r.id}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-foreground">
                    {r.framework}
                  </td>
                  <td className="mono text-[11px] text-muted-foreground px-4 py-3">
                    {r.range}
                  </td>
                  <td className="px-4 py-3">
                    <Chip tone="primary">{r.format}</Chip>
                  </td>
                  <td className="mono text-[11px] text-muted-foreground px-4 py-3">
                    {r.created}
                  </td>
                  <td className="mono text-[11px] text-muted-foreground px-4 py-3">
                    {r.size}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDownload(r.id, r.framework)}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-surface-2 px-4 text-xs font-semibold text-foreground hover:bg-surface-2/80 transition-colors"
                    >
                      <Download className="h-3 w-3" />
                      <span>Download</span>
                    </button>
                  </td>
                </Row>
              ))}
            </DataTable>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
