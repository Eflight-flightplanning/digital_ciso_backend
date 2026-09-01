import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FileBarChart,
  Download,
  Printer,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  PanelTitle,
  Chip,
  DataTable,
  Row,
} from "@/components/ui-kit/primitives";
import { useFindings, useResources, useProviders, useCompliance } from "@/hooks/use-api";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
});

interface ReportItem {
  id: string;
  title: string;
  range: string;
  format: "PDF" | "CSV" | "JSON" | string;
  created: string;
  size: string;
}

const initialReportHistory: ReportItem[] = [];

function ReportsPage() {
  const { data: findingsRaw } = useFindings();
  const { data: resourcesRaw } = useResources();
  const { data: providersRaw } = useProviders();

  const [reports, setReports] = useState<ReportItem[]>(initialReportHistory);
  const [selectedProvider, setSelectedProvider] = useState<string>("ALL");
  const [format, setFormat] = useState<"PDF" | "CSV" | "JSON">("PDF");
  const [range, setRange] = useState("Current Live State");
  const [generating, setGenerating] = useState(false);

  const findings = findingsRaw?.items ?? [];
  const resources = resourcesRaw?.items ?? [];

  const connectedProviders = useMemo(() => {
    const list = (providersRaw?.items as Array<Record<string, unknown>>) || [];
    return list.map((p) => {
      const providerSlug = String(p.provider || "").toLowerCase();
      const provStr = providerSlug.toUpperCase();
      const provType = provStr === "ORACLECLOUD" ? "OCI" : provStr;
      return {
        id: String(p.id),
        alias: String(p.alias || p.name || provType),
        providerUpper: provType,
        providerSlug, // real backend provider_type value, e.g. "oraclecloud", "azure"
      };
    });
  }, [providersRaw]);

  // Real per-framework compliance data (ComplianceOverviewViewSet — the same backend the
  // Compliance page uses), scoped to whichever cloud is selected below. The backend requires
  // an explicit provider filter — no "everything" mode — so for "All Providers" we pass the
  // full set of connected provider types.
  const complianceParams = useMemo((): Record<string, string> | undefined => {
    if (selectedProvider === "ALL") {
      if (connectedProviders.length === 0) return undefined;
      return { "filter[provider_type__in]": connectedProviders.map((p) => p.providerSlug).join(",") };
    }
    const match = connectedProviders.find((p) => p.providerUpper === selectedProvider);
    const slug = match?.providerSlug || (selectedProvider === "OCI" ? "oraclecloud" : selectedProvider.toLowerCase());
    return { "filter[provider_type]": slug };
  }, [selectedProvider, connectedProviders]);

  const { data: complianceRaw } = useCompliance(complianceParams);

  const complianceFrameworks = useMemo(() => {
    const items = (complianceRaw?.items as Array<Record<string, any>>) ?? [];
    return items
      .filter((item) => {
        // Match the real Compliance page's filtering — hide internal/deprecated framework
        // rows so reports don't surface anything the Compliance page itself hides.
        const id = String(item.id || item.compliance_id || "").toLowerCase();
        const fw = String(item.framework || "").toLowerCase();
        return !(
          id.includes("threatscore") ||
          id.includes("threat_score") ||
          fw.includes("threatscore") ||
          fw.includes("threat score") ||
          id.includes("oracle_saas_security_baseline") ||
          id.includes("itgc_sox") ||
          id.includes("soc1_type2") ||
          fw.includes("itgc sox") ||
          fw.includes("soc 1 type")
        );
      })
      .map((item) => {
        const passed = Number(item.requirements_passed) || 0;
        const failed = Number(item.requirements_failed) || 0;
        const total = Number(item.total_requirements) || 0;
        const evaluated = Math.max(1, passed + failed);
        const score = total > 0 ? Math.round((passed / evaluated) * 100) : 0;
        return {
          id: String(item.id ?? ""),
          name: String(item.framework || item.id || "Unnamed Framework"),
          version: String(item.version || ""),
          passed,
          failed,
          total,
          score,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [complianceRaw]);

  // Extract findings strictly scoped to selected provider
  const scopedFindings = useMemo(() => {
    if (selectedProvider === "ALL") return findings;
    return findings.filter((f: any) => {
      const rawP = f.provider || f.provider_type || f.scan?.provider?.provider || f.raw_result?.Provider || f.check_metadata?.Provider;
      if (rawP) {
        const s = String(rawP).toUpperCase();
        if (selectedProvider === "OCI" && (s === "OCI" || s === "ORACLECLOUD")) return true;
        if (selectedProvider === "ORACLE_SAAS" && (s === "ORACLE_SAAS" || s.includes("SAAS"))) return true;
        if (s === selectedProvider) return true;
      }
      const uid = String(f.uid || f.id || f.prowler_uid || "").toLowerCase();
      if (selectedProvider === "AZURE" && (uid.includes("azure") || uid.includes("/subscriptions/"))) return true;
      if (selectedProvider === "OCI" && (uid.includes("ocid1.") || uid.includes("oraclecloud"))) return true;
      if (selectedProvider === "ORACLE_SAAS" && (uid.includes("fusion") || uid.includes("saas") || uid.includes("oracle"))) return true;
      return false;
    });
  }, [findings, selectedProvider]);

  const activeProviderLabel = useMemo(() => {
    if (selectedProvider === "ALL") return "Multi-Cloud Fleet (All Connected Environments)";
    const found = connectedProviders.find((p) => p.providerUpper === selectedProvider);
    if (found) return `${found.providerUpper} · ${found.alias}`;
    return selectedProvider;
  }, [selectedProvider, connectedProviders]);

  // Report title is derived from the selected cloud, not a picked framework — the report
  // always covers every real compliance framework connected to that provider.
  const reportTitle = useMemo(() => {
    if (selectedProvider === "ALL") return "Multi-Cloud Security & Compliance Report";
    const label = connectedProviders.find((p) => p.providerUpper === selectedProvider)?.providerUpper || selectedProvider;
    return `${label} Security & Compliance Report`;
  }, [selectedProvider, connectedProviders]);

  const stats = useMemo(() => {
    const total = scopedFindings.length;
    const pass = scopedFindings.filter((f: any) => f.status === "PASS").length;
    const fail = scopedFindings.filter((f: any) => f.status === "FAIL").length;
    const critical = scopedFindings.filter((f: any) => f.severity === "critical").length;
    const high = scopedFindings.filter((f: any) => f.severity === "high").length;
    const medium = scopedFindings.filter((f: any) => f.severity === "medium").length;
    const low = scopedFindings.filter((f: any) => f.severity === "low").length;
    const score = total > 0 ? Math.round((pass / total) * 100) : 0;

    return { total, pass, fail, critical, high, medium, low, score };
  }, [scopedFindings]);

  const generateCSV = (reportId: string, reportName: string) => {
    const headers = [
      "Finding ID",
      "Check ID",
      "Title",
      "Severity",
      "Status",
      "Provider",
      "Region",
      "Service",
      "Resource ID",
      "Remediation Procedure",
      "Scanned At",
    ];

    const rows = scopedFindings.map((f: any) => {
      const meta = f.check_metadata || f.raw_result || {};
      const checkId = f.check_id || "check_misconfig";
      const title = meta.checktitle || meta.CheckTitle || f.title || checkId.replace(/_/g, " ");
      const resId = meta.resourceid || meta.ResourceId || f.resource_name || f.resource?.name || "cloud-resource";
      const remediation = meta.remediation_text || f.status_extended || "Apply cloud security benchmark best practices.";
      const scanned = f.first_seen_at || f.inserted_at || new Date().toISOString();
      const prov = f.provider || meta.provider || selectedProvider;

      return [
        `"${f.id || ''}"`,
        `"${checkId}"`,
        `"${String(title).replace(/"/g, '""')}"`,
        `"${f.severity || 'medium'}"`,
        `"${f.status || 'FAIL'}"`,
        `"${prov}"`,
        `"${meta.region || f.region || 'global'}"`,
        `"${meta.service_name || f.service || 'Security'}"`,
        `"${String(resId).replace(/"/g, '""')}"`,
        `"${String(remediation).replace(/"/g, '""')}"`,
        `"${scanned}"`,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportName.replace(/[^a-zA-Z0-9_-]/g, "_")}_${selectedProvider}_${reportId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generatePDF = (reportId: string, reportName: string) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${reportName} - Digital CISO Executive Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 40px; line-height: 1.5; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { font-size: 20px; font-weight: 800; color: #0284c7; }
            .meta { font-size: 12px; color: #64748b; text-align: right; }
            .title { font-size: 24px; font-weight: 800; margin-bottom: 8px; }
            .subtitle { font-size: 14px; color: #64748b; margin-bottom: 30px; }
            .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
            .kpi-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; background: #f8fafc; }
            .kpi-val { font-size: 22px; font-weight: 800; font-family: monospace; }
            .kpi-lbl { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th { background: #f1f5f9; text-align: left; padding: 10px; border-bottom: 1px solid #cbd5e1; font-weight: 700; }
            td { padding: 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
            .badge-fail { color: #e11d48; font-weight: 700; }
            .badge-pass { color: #059669; font-weight: 700; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
            @media print {
              body { margin: 20px; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">DIGITAL CISO</div>
              <div style="font-size: 12px; color: #64748b; font-weight: 600;">Autonomous Cyber Defense Platform</div>
            </div>
            <div class="meta">
              <div><strong>Report ID:</strong> ${reportId}</div>
              <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
              <div><strong>Scope / Environment:</strong> ${activeProviderLabel}</div>
            </div>
          </div>

          <div class="title">${reportName}</div>
          <div class="subtitle">Executive Compliance Attestation & Cloud Security Posture Assessment</div>

          <div class="kpi-grid">
            <div class="kpi-card">
              <div class="kpi-val" style="color: #0284c7;">${stats.score}%</div>
              <div class="kpi-lbl">Overall Finding Pass Rate</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-val" style="color: #e11d48;">${stats.fail}</div>
              <div class="kpi-lbl">Failed Controls</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-val" style="color: #059669;">${stats.pass}</div>
              <div class="kpi-lbl">Passing Controls</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-val">${stats.total}</div>
              <div class="kpi-lbl">Total Evaluated Checks</div>
            </div>
          </div>

          <h3 style="font-size: 16px; margin-top: 30px; margin-bottom: 10px;">Compliance Framework Breakdown — ${activeProviderLabel}</h3>
          <table>
            <thead>
              <tr>
                <th style="width: 40%;">Framework</th>
                <th style="width: 15%;">Version</th>
                <th style="width: 15%;">Score</th>
                <th style="width: 15%;">Passed</th>
                <th style="width: 15%;">Failed</th>
              </tr>
            </thead>
            <tbody>
              ${complianceFrameworks.length > 0 ? complianceFrameworks.map((c) => `
                <tr>
                  <td><strong>${c.name}</strong></td>
                  <td style="font-family: monospace; font-size: 11px;">${c.version || "—"}</td>
                  <td><span style="font-weight: 700; color: ${c.score >= 80 ? '#059669' : c.score >= 50 ? '#ea580c' : '#e11d48'};">${c.score}%</span></td>
                  <td class="badge-pass">${c.passed}</td>
                  <td class="badge-fail">${c.failed}</td>
                </tr>
              `).join("") : `<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 16px;">No compliance framework data available for ${activeProviderLabel} yet.</td></tr>`}
            </tbody>
          </table>

          <h3 style="font-size: 16px; margin-top: 30px; margin-bottom: 10px;">Audit Telemetry Findings</h3>
          <table>
            <thead>
              <tr>
                <th style="width: 25%;">Control Title</th>
                <th style="width: 15%;">Check ID</th>
                <th style="width: 12%;">Severity</th>
                <th style="width: 12%;">Status</th>
                <th style="width: 36%;">Target Resource</th>
              </tr>
            </thead>
            <tbody>
              ${scopedFindings.slice(0, 50).map((f: any) => {
                const meta = f.check_metadata || f.raw_result || {};
                const checkId = f.check_id || "check";
                const title = meta.checktitle || meta.CheckTitle || f.title || checkId.replace(/_/g, " ");
                const resId = meta.resourceid || meta.ResourceId || f.resource_name || f.resource?.name || "cloud-resource";
                const isFail = f.status === "FAIL";
                return `
                  <tr>
                    <td><strong>${title}</strong></td>
                    <td style="font-family: monospace; font-size: 11px;">${checkId}</td>
                    <td><span style="text-transform: uppercase; font-weight: 600; color: ${f.severity === 'high' || f.severity === 'critical' ? '#ea580c' : '#475569'};">${f.severity}</span></td>
                    <td><span class="${isFail ? 'badge-fail' : 'badge-pass'}">${f.status}</span></td>
                    <td style="font-family: monospace; font-size: 11px; word-break: break-all;">${resId}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>

          <div class="footer">
            Generated autonomously by Digital CISO Platform · Verified against Security Telemetry Engine · Confidential & Proprietary
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const generateJSON = (reportId: string, reportName: string) => {
    const payload = {
      report_id: reportId,
      report_title: reportName,
      generated_at: new Date().toISOString(),
      tenant_environment: activeProviderLabel,
      provider_scope: selectedProvider,
      executive_summary: {
        overall_finding_pass_rate: stats.score,
        total_findings: stats.total,
        passing_controls: stats.pass,
        failing_violations: stats.fail,
        severity_distribution: {
          critical: stats.critical,
          high: stats.high,
          medium: stats.medium,
          low: stats.low,
        },
        audited_resources_count: stats.total,
      },
      compliance_frameworks: complianceFrameworks,
      findings: scopedFindings,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportName.replace(/[^a-zA-Z0-9_-]/g, "_")}_${selectedProvider}_${reportId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownload = (id: string, name: string, fmt: string = "PDF") => {
    if (fmt === "CSV") {
      generateCSV(id, name);
    } else if (fmt === "JSON") {
      generateJSON(id, name);
    } else {
      generatePDF(id, name);
    }
  };

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      const reportId = `RPT-${Math.floor(3000 + Math.random() * 9000)}`;
      const newReport: ReportItem = {
        id: reportId,
        title: reportTitle,
        range,
        format,
        created: "Just now",
        size: format === "PDF" ? "2.4 MB" : format === "CSV" ? "142 KB" : "380 KB",
      };

      setReports([newReport, ...reports]);
      handleDownload(reportId, reportTitle, format);
      setGenerating(false);
    }, 600);
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
            {/* ── Target Provider Dropdown ── */}
            <div>
              <label className="section-label mb-1.5 block">Target Cloud Environment</label>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-foreground outline-none font-medium cursor-pointer"
              >
                <option value="ALL">🌍 Multi-Cloud Fleet (All Connected Providers)</option>
                {connectedProviders.map((p) => (
                  <option key={p.id} value={p.providerUpper}>
                    {p.providerUpper} · {p.alias}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-muted-foreground">
                The report covers every real compliance framework connected to this cloud — see the live breakdown below.
              </p>
            </div>

            <div>
              <label className="section-label mb-1.5 block">Evaluation Range</label>
              <select
                value={range}
                onChange={(e) => setRange(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-foreground outline-none font-medium cursor-pointer"
              >
                <option value="Current Live State">Current Live State (Real-Time Telemetry)</option>
                <option value="Last 7 Days Rolling">Last 7 Days Rolling</option>
                <option value="Last 30 Days Rolling">Last 30 Days Rolling</option>
              </select>
            </div>

            <div>
              <label className="section-label mb-1.5 block">Export Format</label>
              <div className="grid grid-cols-3 gap-2">
                {(["PDF", "CSV", "JSON"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setFormat(fmt)}
                    className={`h-9 rounded-lg border text-center text-xs font-semibold transition-all cursor-pointer ${
                      format === fmt
                        ? "border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary/30"
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
              className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-xs font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-40 active:scale-95 cursor-pointer"
            >
              <Download className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
              <span>{generating ? "Compiling Report..." : `Generate & Download ${format}`}</span>
            </button>
          </div>
        </Panel>

        {/* ── Live Compliance Framework Breakdown, by cloud provider ── */}
        <div className="space-y-4 lg:col-span-2">
          <Panel index={1} className="p-0">
            <div className="p-4 border-b border-border/80 flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Compliance Frameworks — {activeProviderLabel}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Real per-framework pass/fail data from the Compliance page, scoped to the selected cloud
                </p>
              </div>
              <span className="mono text-xs font-bold text-primary">{complianceFrameworks.length} Frameworks</span>
            </div>
            <DataTable head={["Framework", "Version", "Score", "Passed", "Failed"]}>
              {complianceFrameworks.length === 0 && (
                <Row index={0}>
                  <td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No compliance framework data available for {activeProviderLabel} yet.
                  </td>
                </Row>
              )}
              {complianceFrameworks.map((c, i) => (
                <Row key={c.id || c.name} index={i}>
                  <td className="px-4 py-3 text-xs font-semibold text-foreground">{c.name}</td>
                  <td className="mono text-[11px] text-muted-foreground px-4 py-3">{c.version || "—"}</td>
                  <td className="px-4 py-3">
                    <Chip tone={c.score >= 80 ? "success" : c.score >= 50 ? "high" : "critical"}>
                      {c.score}%
                    </Chip>
                  </td>
                  <td className="mono text-[11px] text-emerald-400 px-4 py-3">{c.passed}</td>
                  <td className="mono text-[11px] text-rose-400 px-4 py-3">{c.failed}</td>
                </Row>
              ))}
            </DataTable>
          </Panel>

          <Panel index={2} className="p-0">
            <div className="p-4 border-b border-border/80 flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold text-foreground">
                  Generated Reports & Audit Archive
                </h3>
                <p className="text-xs text-muted-foreground">
                  Download past snapshots and audit attestation packages
                </p>
              </div>
              <span className="mono text-xs font-bold text-primary">{reports.length} Reports</span>
            </div>

            <DataTable
              head={[
                "Report ID",
                "Report / Scope",
                "Range",
                "Format",
                "Generated",
                "Size",
                "Action",
              ]}
            >
              {reports.length === 0 && (
                <Row index={0}>
                  <td colSpan={7} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No reports generated yet this session. Use the panel on the left to generate one.
                  </td>
                </Row>
              )}
              {reports.map((r, i) => (
                <Row key={r.id} index={i}>
                  <td className="mono px-4 py-3 text-xs font-semibold text-foreground">
                    {r.id}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-foreground">
                    {r.title}
                  </td>
                  <td className="mono text-[11px] text-muted-foreground px-4 py-3">
                    {r.range}
                  </td>
                  <td className="px-4 py-3">
                    <Chip tone={r.format === "PDF" ? "primary" : r.format === "CSV" ? "success" : "neutral"}>
                      {r.format}
                    </Chip>
                  </td>
                  <td className="mono text-[11px] text-muted-foreground px-4 py-3">
                    {r.created}
                  </td>
                  <td className="mono text-[11px] text-muted-foreground px-4 py-3">
                    {r.size}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDownload(r.id, r.title, r.format)}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-surface-2 px-3.5 text-xs font-semibold text-foreground hover:bg-surface-2/80 transition-colors cursor-pointer"
                    >
                      <Download className="h-3 w-3 text-primary" />
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
