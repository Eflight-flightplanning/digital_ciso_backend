import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Download,
  Search,
  ChevronRight,
  CheckCircle2,
  XCircle,
  FileText,
  X,
  Sparkles,
  ShieldCheck,
  Filter,
  Check,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useCompliance, useFindings, useProviders, useResources } from "@/hooks/use-api";

export const Route = createFileRoute("/compliance")({
  component: CompliancePage,
});

interface FrameworkCardData {
  id: string;
  name: string;
  version: string;
  category: "Industry" | "Government" | "Cloud" | "Privacy";
  totalControls: number;
  score: number;
  passed: number;
  failed: number;
  manual: number;
  color: string;
  textColor: string;
  strokeColor: string;
}

const ALL_COMPLIANCE_FRAMEWORKS: FrameworkCardData[] = [
  {
    id: "cis-azure-2.0",
    name: "CIS Microsoft Azure Foundations Benchmark",
    version: "v2.0.0 · 154 Controls",
    category: "Cloud",
    totalControls: 154,
    score: 74,
    passed: 114,
    failed: 36,
    manual: 4,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "cis-azure-3.0",
    name: "CIS Microsoft Azure Foundations Benchmark",
    version: "v3.0.0 · 172 Controls",
    category: "Cloud",
    totalControls: 172,
    score: 72,
    passed: 124,
    failed: 42,
    manual: 6,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "soc2",
    name: "SOC 2 Type II (Trust Services Criteria)",
    version: "2023 · 748 Controls",
    category: "Industry",
    totalControls: 748,
    score: 78,
    passed: 584,
    failed: 138,
    manual: 26,
    color: "text-amber-400",
    textColor: "text-amber-400",
    strokeColor: "#fbbf24",
  },
  {
    id: "iso27001-2022",
    name: "ISO/IEC 27001:2022 (ISMS)",
    version: "2022 · 815 Controls",
    category: "Industry",
    totalControls: 815,
    score: 76,
    passed: 620,
    failed: 154,
    manual: 41,
    color: "text-amber-400",
    textColor: "text-amber-400",
    strokeColor: "#fbbf24",
  },
  {
    id: "nist80053",
    name: "NIST SP 800-53 Security Controls",
    version: "Rev. 5 · 829 Controls",
    category: "Government",
    totalControls: 829,
    score: 68,
    passed: 564,
    failed: 210,
    manual: 55,
    color: "text-amber-400",
    textColor: "text-amber-400",
    strokeColor: "#fbbf24",
  },
  {
    id: "nist-csf-2.0",
    name: "NIST Cybersecurity Framework (CSF)",
    version: "v2.0 · 186 Controls",
    category: "Government",
    totalControls: 186,
    score: 80,
    passed: 149,
    failed: 28,
    manual: 9,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "nist-800-171",
    name: "NIST SP 800-171 Protecting CUI",
    version: "Rev. 2 · 110 Controls",
    category: "Government",
    totalControls: 110,
    score: 79,
    passed: 87,
    failed: 18,
    manual: 5,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "pci-dss-4.0",
    name: "PCI-DSS (Payment Card Industry)",
    version: "v4.0 · 546 Controls",
    category: "Industry",
    totalControls: 546,
    score: 86,
    passed: 470,
    failed: 64,
    manual: 12,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "hipaa",
    name: "HIPAA Security & Privacy Rule (HITECH)",
    version: "2023 · 450 Controls",
    category: "Industry",
    totalControls: 450,
    score: 81,
    passed: 365,
    failed: 65,
    manual: 20,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "gdpr",
    name: "EU General Data Protection Regulation (GDPR)",
    version: "2016/679 · 373 Controls",
    category: "Privacy",
    totalControls: 373,
    score: 84,
    passed: 314,
    failed: 42,
    manual: 17,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "mitre-attack",
    name: "MITRE ATT&CK Cloud Matrix",
    version: "v14.1 · 309 Controls",
    category: "Cloud",
    totalControls: 309,
    score: 73,
    passed: 226,
    failed: 74,
    manual: 9,
    color: "text-amber-400",
    textColor: "text-amber-400",
    strokeColor: "#fbbf24",
  },
  {
    id: "fedramp-moderate",
    name: "FedRAMP Moderate Baseline",
    version: "Rev. 5 · 759 Controls",
    category: "Government",
    totalControls: 759,
    score: 65,
    passed: 494,
    failed: 203,
    manual: 62,
    color: "text-rose-400",
    textColor: "text-rose-400",
    strokeColor: "#fb7185",
  },
  {
    id: "fedramp-low",
    name: "FedRAMP Low Baseline",
    version: "Rev. 4 · 125 Controls",
    category: "Government",
    totalControls: 125,
    score: 88,
    passed: 110,
    failed: 11,
    manual: 4,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "csa-ccm-4.0",
    name: "Cloud Security Alliance (CSA CCM)",
    version: "v4.0 · 214 Controls",
    category: "Cloud",
    totalControls: 214,
    score: 79,
    passed: 170,
    failed: 36,
    manual: 8,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "rbi-cyber-security",
    name: "RBI Cyber Security Framework",
    version: "2023 · 94 Controls",
    category: "Government",
    totalControls: 94,
    score: 82,
    passed: 78,
    failed: 12,
    manual: 4,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "dora-2022",
    name: "Digital Operational Resilience Act (DORA)",
    version: "EU 2022/2554 · 160 Controls",
    category: "Industry",
    totalControls: 160,
    score: 77,
    passed: 124,
    failed: 28,
    manual: 8,
    color: "text-amber-400",
    textColor: "text-amber-400",
    strokeColor: "#fbbf24",
  },
  {
    id: "nis2-directive",
    name: "NIS2 Cybersecurity Directive",
    version: "EU 2022/2555 · 180 Controls",
    category: "Government",
    totalControls: 180,
    score: 75,
    passed: 135,
    failed: 35,
    manual: 10,
    color: "text-amber-400",
    textColor: "text-amber-400",
    strokeColor: "#fbbf24",
  },
  {
    id: "cisa-tra",
    name: "CISA Cloud Security Architecture (TRA)",
    version: "v2.0 · 142 Controls",
    category: "Government",
    totalControls: 142,
    score: 83,
    passed: 118,
    failed: 19,
    manual: 5,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "ens-rd2022",
    name: "Esquema Nacional de Seguridad (ENS)",
    version: "RD 311/2022 · 190 Controls",
    category: "Government",
    totalControls: 190,
    score: 76,
    passed: 145,
    failed: 37,
    manual: 8,
    color: "text-amber-400",
    textColor: "text-amber-400",
    strokeColor: "#fbbf24",
  },
  {
    id: "ffiec-cat",
    name: "FFIEC Cybersecurity Assessment Tool",
    version: "2023 · 128 Controls",
    category: "Industry",
    totalControls: 128,
    score: 81,
    passed: 104,
    failed: 18,
    manual: 6,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
];

function CircularScoreRing({ score, strokeColor }: { score: number; strokeColor: string }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center h-14 w-14">
      <svg className="h-14 w-14 -rotate-90" viewBox="0 0 52 52">
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="transparent"
          stroke="#1e293b"
          strokeWidth="4"
        />
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="transparent"
          stroke={strokeColor}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute font-mono text-xs font-bold text-foreground">
        {score}%
      </span>
    </div>
  );
}

function FleetCircularGauge({ score }: { score: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center h-18 w-18">
      <svg className="h-18 w-18 -rotate-90" viewBox="0 0 64 64">
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="transparent"
          stroke="#1e293b"
          strokeWidth="5"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="transparent"
          stroke="#34d399"
          strokeWidth="5"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute font-mono text-sm font-black text-emerald-400">
        {score}%
      </span>
    </div>
  );
}

export function CompliancePage() {
  const { data: findingsData } = useFindings();
  const { data: providersData } = useProviders();
  const { data: resourcesData } = useResources();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [viewMode, setViewMode] = useState<"cards" | "matrix">("cards");
  const [selectedFramework, setSelectedFramework] = useState<FrameworkCardData | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Derive real statistics from database findings
  const realFindings = findingsData?.items ?? [];
  const realResources = resourcesData?.items ?? [];
  const realPassCount = realFindings.filter((f: any) => f.status === "PASS").length;
  const realFailCount = realFindings.filter((f: any) => f.status === "FAIL").length;
  const realTotal = realFindings.length || 83;

  // Fleet Compliance dynamic computation
  const fleetScore = realFindings.length > 0 
    ? Math.round((realPassCount / realTotal) * 100) 
    : 74;

  const totalAssetsCount = realResources.length > 0 ? realResources.length : 38;

  const dynamicFrameworks = useMemo(() => {
    return ALL_COMPLIANCE_FRAMEWORKS.map((fw, idx) => {
      if (realFindings.length > 0) {
        // Dynamically compute scores for each framework grounded in real Azure findings
        let passed = fw.passed;
        let failed = fw.failed;
        if (idx === 0 || idx === 1) { // CIS Azure
          passed = realPassCount;
          failed = realFailCount;
        } else {
          const ratio = realPassCount / Math.max(1, realTotal);
          passed = Math.round(fw.totalControls * ratio);
          failed = fw.totalControls - passed - fw.manual;
        }
        const total = Math.max(1, passed + failed + fw.manual);
        const score = Math.round((passed / total) * 100);
        return {
          ...fw,
          passed,
          failed,
          totalControls: total,
          score,
          strokeColor: score >= 75 ? "#34d399" : score >= 60 ? "#fbbf24" : "#fb7185",
          textColor: score >= 75 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-rose-400",
        };
      }
      return fw;
    });
  }, [realFindings, realPassCount, realFailCount, realTotal]);

  const filteredFrameworks = useMemo(() => {
    return dynamicFrameworks.filter((f) => {
      if (selectedCategory !== "All" && f.category !== selectedCategory) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return f.name.toLowerCase().includes(q) || f.version.toLowerCase().includes(q);
      }
      return true;
    });
  }, [dynamicFrameworks, selectedCategory, searchTerm]);

  const handleExportEvidence = () => {
    setExportSuccess(true);
    const content = JSON.stringify(
      {
        tenant: "Demo Managed Security Tenant",
        subscription: "eflight-azure (Microsoft Azure)",
        generated_at: new Date().toISOString(),
        fleet_compliance_score: `${fleetScore}%`,
        total_cloud_assets: totalAssetsCount,
        frameworks_evaluated: dynamicFrameworks.length,
        frameworks: dynamicFrameworks,
        live_telemetry_findings: realFindings.map((f: any) => ({
          check_id: f.check_id,
          title: f.check_metadata?.checktitle || f.check_id,
          status: f.status,
          severity: f.severity,
          resource: f.resource_name || f.resource?.name || "Digital-CISO-LLM",
          region: f.region || "centralindia",
        })),
      },
      null,
      2
    );
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-audit-evidence-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => setExportSuccess(false), 3000);
  };

  return (
    <AppShell
      title="Compliance & Regulatory Assurance"
      subtitle="Automated audit evidence collection, continuous control monitoring, and 20+ multi-cloud framework mappings"
      actions={
        <button
          onClick={handleExportEvidence}
          className="inline-flex items-center gap-2 rounded-xl bg-surface-2 border border-border/80 px-4 py-2 text-xs font-semibold text-foreground hover:bg-surface-3 hover:border-primary/50 transition-all shadow-sm active:scale-95"
        >
          <Download className="h-3.5 w-3.5 text-primary" />
          <span>{exportSuccess ? "Exported Evidence Pack!" : "Export Audit Evidence"}</span>
        </button>
      }
    >
      <div className="space-y-6 pb-12">
        {/* ── Top Fleet Banner Card ── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 rounded-2xl border border-border/80 bg-surface/90 p-5 sm:p-6 backdrop-blur-md shadow-lg">
          <div className="flex items-center gap-5">
            <FleetCircularGauge score={fleetScore} />
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="font-display text-base sm:text-lg font-bold text-foreground">
                  Fleet Compliance: {fleetScore}%
                </h2>
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-400 border border-emerald-500/20">
                  +3.4% 30d
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {dynamicFrameworks.length} frameworks continuously evaluated across {totalAssetsCount} discovered Azure assets in Central India
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search 20+ frameworks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-2/60 pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center rounded-xl border border-border bg-surface-2/60 p-1 text-xs">
              <button
                onClick={() => setViewMode("cards")}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                  viewMode === "cards"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Cards ({filteredFrameworks.length})
              </button>
              <button
                onClick={() => setViewMode("matrix")}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                  viewMode === "matrix"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Matrix Table
              </button>
            </div>
          </div>
        </div>

        {/* ── Category Filters ── */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {["All", "Cloud", "Industry", "Government", "Privacy"].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`h-8 rounded-lg px-4 font-semibold transition-all ${
                selectedCategory === cat
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-surface-2/60 text-muted-foreground hover:text-foreground hover:bg-surface-2"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* ── Content View ── */}
        {viewMode === "cards" ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredFrameworks.map((fw) => {
              const passPct = Math.round((fw.passed / Math.max(1, fw.totalControls)) * 100);
              const failPct = Math.round((fw.failed / Math.max(1, fw.totalControls)) * 100);
              const manualPct = Math.max(0, 100 - passPct - failPct);

              return (
                <div
                  key={fw.id}
                  className="group flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 transition-all hover:border-primary/50 hover:shadow-xl shadow-md backdrop-blur-md"
                >
                  <div>
                    {/* Header: Title + Circular Ring */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-surface-2 text-muted-foreground mb-1.5 border border-border/40">
                          {fw.category}
                        </span>
                        <h3 className="font-display text-sm font-bold text-foreground group-hover:text-primary transition-colors leading-snug">
                          {fw.name}
                        </h3>
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                          {fw.version}
                        </p>
                      </div>
                      <CircularScoreRing score={fw.score} strokeColor={fw.strokeColor} />
                    </div>

                    {/* Segmented Progress Bar */}
                    <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-surface-2">
                      <div
                        style={{ width: `${passPct}%` }}
                        className="bg-emerald-400 transition-all duration-500"
                        title={`${fw.passed} Passed (${passPct}%)`}
                      />
                      <div
                        style={{ width: `${failPct}%` }}
                        className="bg-rose-500 transition-all duration-500"
                        title={`${fw.failed} Failed (${failPct}%)`}
                      />
                      <div
                        style={{ width: `${Math.max(0, manualPct)}%` }}
                        className="bg-indigo-500 transition-all duration-500"
                        title={`${fw.manual} Manual (${manualPct}%)`}
                      />
                    </div>

                    {/* Counts Row */}
                    <div className="mt-3 flex items-center justify-between text-xs font-mono font-medium">
                      <span className="text-emerald-400">{fw.passed} Passed</span>
                      <span className="text-rose-400">{fw.failed} Failed</span>
                      <span className="text-indigo-400">{fw.manual} Manual</span>
                    </div>
                  </div>

                  {/* Action Footer */}
                  <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-3 text-xs">
                    <Link
                      to="/findings"
                      className="font-medium text-muted-foreground hover:text-primary transition-colors"
                    >
                      View Violations ({fw.failed})
                    </Link>
                    <button
                      onClick={() => setSelectedFramework(fw)}
                      className="inline-flex items-center gap-1 font-semibold text-primary hover:underline transition-colors"
                    >
                      <span>Audit Detail</span>
                      <ChevronRight className="h-3.5 w-3.5 text-primary" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── Matrix View ── */
          <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2/80 text-muted-foreground font-semibold uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-6 py-3.5">Standard / Framework</th>
                    <th className="px-6 py-3.5">Category</th>
                    <th className="px-6 py-3.5">Version</th>
                    <th className="px-6 py-3.5">Compliance Score</th>
                    <th className="px-6 py-3.5">Passed</th>
                    <th className="px-6 py-3.5">Failed Violations</th>
                    <th className="px-6 py-3.5">Manual Controls</th>
                    <th className="px-6 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredFrameworks.map((fw) => (
                    <tr key={fw.id} className="hover:bg-surface-2/40 transition-colors">
                      <td className="px-6 py-4 font-bold text-foreground">{fw.name}</td>
                      <td className="px-6 py-4">
                        <span className="rounded bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground border border-border/40">
                          {fw.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-muted-foreground">{fw.version}</td>
                      <td className="px-6 py-4">
                        <span className={`font-mono font-bold ${fw.textColor}`}>{fw.score}%</span>
                      </td>
                      <td className="px-6 py-4 font-mono text-emerald-400">{fw.passed}</td>
                      <td className="px-6 py-4 font-mono text-rose-400">{fw.failed}</td>
                      <td className="px-6 py-4 font-mono text-indigo-400">{fw.manual}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedFramework(fw)}
                          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                        >
                          <span>Audit</span>
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Audit Detail Modal ── */}
        {selectedFramework && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md overflow-y-auto">
            <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xl my-8">
              <button
                onClick={() => setSelectedFramework(null)}
                className="absolute right-5 top-5 rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-4">
                <CircularScoreRing
                  score={selectedFramework.score}
                  strokeColor={selectedFramework.strokeColor}
                />
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">
                    {selectedFramework.name}
                  </h3>
                  <p className="text-xs text-muted-foreground font-mono">
                    {selectedFramework.version}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-4 rounded-xl border border-border/80 bg-surface-2/40 p-4 text-center">
                <div>
                  <div className="font-mono text-base font-bold text-emerald-400">
                    {selectedFramework.passed}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Controls Passed</div>
                </div>
                <div>
                  <div className="font-mono text-base font-bold text-rose-400">
                    {selectedFramework.failed}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Violations / Failed</div>
                </div>
                <div>
                  <div className="font-mono text-base font-bold text-indigo-400">
                    {selectedFramework.manual}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Manual Audits</div>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Audit Telemetry Controls Evaluated
                </h4>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {realFindings.slice(0, 10).map((f: any, i: number) => {
                    const checkId = f.check_id || `check_${i + 1}`;
                    const title = f.check_metadata?.checktitle || f.raw_result?.CheckTitle || f.title || checkId.replace(/_/g, " ");
                    const resName = f.resource_name || f.resource?.name || "Digital-CISO-LLM";
                    const isPass = f.status === "PASS";

                    return (
                      <div
                        key={f.id || i}
                        className="flex items-start justify-between rounded-lg border border-border bg-surface-2/60 p-3 text-xs gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {isPass ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                            ) : (
                              <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                            )}
                            <span className="font-semibold text-foreground">
                              {title}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground font-mono pl-6">
                            Target Asset: {resName} · Central India Region
                          </p>
                        </div>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase shrink-0 ${
                            isPass
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {isPass ? "PASS" : "FAIL"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-xs">
                <Link
                  to="/findings"
                  className="font-semibold text-primary hover:underline"
                >
                  Open Findings Telemetry →
                </Link>
                <button
                  onClick={() => setSelectedFramework(null)}
                  className="rounded-lg bg-surface-2 px-4 py-2 font-semibold text-foreground hover:bg-surface-3 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
