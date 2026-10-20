import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Download,
  Search,
  ChevronRight,
  CheckCircle2,
  XCircle,
  FileText,
  Check,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { NcaWorkspace, ControlDrawer, REASON_TEXT, BASIS_LABEL, useNcaOverview, NCA_FRAMEWORK_LABEL } from "@/components/compliance/NcaWorkspace";
import { useQuery } from "@tanstack/react-query";
import { ncaDownload, ncaFetch, ncaPost, qs } from "@/lib/nca-api";
import { useCompliance, useComplianceRequirements, useProviders, useResources } from "@/hooks/use-api";

export const Route = createFileRoute("/compliance")({
  component: CompliancePage,
});

interface FrameworkCardData {
  id: string;
  complianceId: string;
  name: string;
  version: string;
  category: "Industry" | "Government" | "Cloud" | "Privacy";
  providerTarget: string;
  totalControls: number;
  score: number;
  passed: number;
  failed: number;
  manual: number;
  textColor: string;
  strokeColor: string;
  nca?: { key: string; coverage: number; error: number; notApplicable: number; manualPending: number; accounting: any; checks: any; controls: { passed: number; failed: number; manual: number; notTested: number; score: number }; controlTotal: number; unit: string };
}

// Framework category/provider labels aren't returned by the API (it only knows
// requirement counts) — inferred from the real compliance_id/framework name that
// Prowler assigns, purely for grouping/display.
function classifyCategory(name: string): FrameworkCardData["category"] {
  const n = name.toUpperCase();
  if (n.includes("GDPR") || n.includes("PRIVACY")) return "Privacy";
  if (n.includes("NIST") || n.includes("FEDRAMP") || n.includes("ECC") || n.includes("CSCC") || n.includes("CCC") || n.includes("NCA")) return "Government";
  if (n.includes("CIS") || n.includes("CLOUD") || n.includes("MITRE")) return "Cloud";
  return "Industry";
}

function classifyProviderLabel(complianceId: string): string {
  const id = complianceId.toLowerCase();
  if (id.includes("azure")) return "AZURE";
  if (id.includes("aws")) return "AWS";
  if (id.includes("gcp")) return "GCP";
  if (id.includes("oraclecloud") || /(^|_)oci(_|$)/.test(id)) return "OCI";
  if (id.includes("oracle_saas")) return "ORACLE SAAS";
  if (id.includes("kubernetes") || /(^|_)k8s(_|$)/.test(id)) return "KUBERNETES";
  return "Multi-Cloud";
}

// The underlying real compliance_id/scan-engine name is never shown to users — this
// product is not branded as Prowler in the UI. Everything else (real check data, real
// framework identity) stays untouched; only the display label changes.
function rebrandFrameworkName(name: string): string {
  return name.replace(/\bProwler\s*/gi, "Digital CISO ").replace(/\s+/g, " ").trim();
}

function providerDisplayName(value: string): string {
  const map: Record<string, string> = {
    aws: "AWS",
    azure: "Azure",
    gcp: "GCP",
    oraclecloud: "OCI",
    oracle_saas: "Oracle SaaS",
    kubernetes: "Kubernetes",
    m365: "M365",
    github: "GitHub",
  };
  return map[value] || value.toUpperCase();
}

function scoreColors(score: number, total: number): { text: string; stroke: string } {
  if (total === 0) return { text: "text-muted-foreground", stroke: "#64748b" };
  if (score >= 75) return { text: "text-emerald-400", stroke: "#34d399" };
  if (score >= 60) return { text: "text-amber-400", stroke: "#fbbf24" };
  return { text: "text-rose-400", stroke: "#fb7185" };
}

function CircularScoreRing({ score, strokeColor }: { score: number; strokeColor: string }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center h-14 w-14">
      <svg className="h-14 w-14 -rotate-90" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={radius} fill="transparent" stroke="#1e293b" strokeWidth="4" />
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
      <span className="absolute font-mono text-xs font-bold text-foreground">{score}%</span>
    </div>
  );
}

function FleetCircularGauge({ score }: { score: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center h-16 w-16 shrink-0">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={radius} fill="transparent" stroke="#1e293b" strokeWidth="5" />
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
      <span className="absolute font-mono text-sm font-black text-emerald-400">{score}%</span>
    </div>
  );
}

function CompliancePage() {
  const { data: providersData } = useProviders();
  const { data: resourcesData } = useResources();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [viewMode, setViewMode] = useState<"cards" | "matrix">("cards");
  const [selectedFramework, setSelectedFramework] = useState<FrameworkCardData | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [ncaFramework, setNcaFramework] = useState<string | null>(null);
  const { data: ncaOverview } = useNcaOverview();
  const [modalSearchTerm, setModalSearchTerm] = useState("");
  const [modalStatusFilter, setModalStatusFilter] = useState<"ALL" | "PASS" | "FAIL" | "MANUAL" | "NOT_TESTED">("ALL");

  const realResources = resourcesData?.items ?? [];
  const totalAssetsCount = realResources.length;

  // Connected providers, deduped by provider type (one dropdown entry per cloud, not per account).
  const connectedProviders = useMemo(() => {
    const list = (providersData?.items as Array<Record<string, unknown>>) || [];
    const seen = new Map<string, { value: string; alias: string }>();
    list.forEach((p) => {
      const value = String(p.provider || "").toLowerCase();
      if (!value || seen.has(value)) return;
      seen.set(value, { value, alias: String(p.alias || p.name || providerDisplayName(value)) });
    });
    return Array.from(seen.values());
  }, [providersData]);

  // Real backend requires either a scan_id or a provider filter — no "give me everything" mode.
  const complianceParams = useMemo(() => {
    const params: Record<string, string> = {};
    if (selectedProvider === "ALL") {
      if (connectedProviders.length === 0) return undefined;
      params["filter[provider_type__in]"] = connectedProviders.map((p) => p.value).join(",");
    } else {
      params["filter[provider_type]"] = selectedProvider;
    }
    return params;
  }, [selectedProvider, connectedProviders]);

  const { data: complianceData, isLoading: complianceLoading, isFetching: complianceFetching } =
    useCompliance(complianceParams);

  // Real per-framework requirement counts from ComplianceOverviewViewSet — dedup-safe by
  // requirement_id server-side, so passed + failed can never exceed total here.
  const dynamicFrameworks: FrameworkCardData[] = useMemo(() => {
    const items = (complianceData?.items as Array<Record<string, any>>) ?? [];
    const scanCards = items
      .filter((item) => {
        const id = String(item.id || item.compliance_id || "").toLowerCase();
        const fw = String(item.framework || "").toLowerCase();
        // Only hide OCI NCA scan cards if a dedicated NCA assessment has completed and provided cards
        const hasDedicatedNca = Boolean(ncaOverview?.latest?.summary?.by_framework && Object.keys(ncaOverview.latest.summary.by_framework).length > 0);
        if (hasDedicatedNca && /nca_(ecc|cscc|ccc)/.test(id) && (id.includes("oraclecloud") || id.includes("oci"))) return false;
        // Hide internal ThreatScore and deprecated frameworks so only official standards appear
        if (
          id.includes("threatscore") ||
          id.includes("threat_score") ||
          fw.includes("threatscore") ||
          fw.includes("threat score") ||
          id.includes("oracle_saas_security_baseline") ||
          id.includes("itgc_sox") ||
          id.includes("soc1_type2") ||
          fw.includes("oracle cloud saas security baseline") ||
          fw.includes("itgc sox") ||
          fw.includes("soc 1 type")
        ) {
          return false;
        }
        return true;
      })
      .map((item) => {
      const passed = Number(item.requirements_passed) || 0;
      const failed = Number(item.requirements_failed) || 0;
      const manual = Number(item.requirements_manual) || 0;
      const total = Number(item.total_requirements) || 0;
      const evaluated = Math.max(1, passed + failed);
      const score = total > 0 ? Math.round((passed / evaluated) * 100) : 0;
      const colors = scoreColors(score, total);
function formatFrameworkDisplayName(framework: string, complianceId: string): string {
  const idLower = (complianceId || "").toLowerCase();
  const fwUpper = (framework || "").toUpperCase();
  if (fwUpper === "CIS" || fwUpper === "CIS BENCHMARK" || fwUpper.startsWith("CIS_")) {
    if (idLower.includes("oraclecloud") || idLower.includes("oci")) {
      return "CIS Oracle Cloud Infrastructure (OCI) Benchmark";
    }
    if (idLower.includes("oracle_saas") || idLower.includes("saas")) {
      return "CIS Oracle SaaS Foundations Benchmark";
    }
    if (idLower.includes("azure")) {
      return "CIS Microsoft Azure Foundations Benchmark";
    }
    if (idLower.includes("aws")) {
      return "CIS AWS Foundations Benchmark";
    }
    if (idLower.includes("gcp")) {
      return "CIS Google Cloud Platform Benchmark";
    }
    if (idLower.includes("k8s") || idLower.includes("kubernetes")) {
      return "CIS Kubernetes Benchmark";
    }
    return "CIS Foundations Benchmark";
  }
  return framework;
}

      const complianceId = String(item.id ?? "");
      const rawFramework = String(item.framework || complianceId || "");
      const displayName = rebrandFrameworkName(formatFrameworkDisplayName(rawFramework, complianceId));

      return {
        id: complianceId,
        complianceId,
        name: displayName,
        version: String(item.version || ""),
        category: classifyCategory(displayName),
        providerTarget: classifyProviderLabel(complianceId),
        totalControls: total,
        score,
        passed,
        failed,
        manual,
        textColor: colors.text,
        strokeColor: colors.stroke,
      };
    });

    // NCA ECC/CCC on OCI come from the read-only NCA assessment and are listed like every other framework.
    const byFramework = (ncaOverview?.latest?.summary?.by_framework ?? {}) as Record<string, any>;
    const ncaCards: FrameworkCardData[] =
      selectedProvider === "ALL" || selectedProvider === "oraclecloud"
        ? Object.entries(byFramework).map(([key, d]) => {
            const ctl = {
              passed: d.controls.PASS,
              failed: d.controls.FAIL,
              manual: d.controls.MANUAL,
              notTested: d.controls.NOT_APPLICABLE + d.controls.ERROR,
              score: Math.round(d.controls.pass_rate_pct ?? 0),
            };
            const n = { total: d.controls.total, ...ctl };
            const colors = scoreColors(n.score, n.passed + n.failed);
            return {
              id: key,
              complianceId: key,
              name: NCA_FRAMEWORK_LABEL[key] ?? key,
              version: key.split("_").slice(-1)[0],
              category: "Government" as const,
              providerTarget: "OCI",
              totalControls: n.total,
              score: n.score,
              passed: n.passed,
              failed: n.failed,
              manual: n.manual + n.notTested,
              textColor: colors.text,
              strokeColor: colors.stroke,
              nca: {
                key,
                coverage: d.coverage.assessment_coverage_pct,
                error: 0,
                notApplicable: n.notTested,
                manualPending: d.coverage.controls_awaiting_manual_evidence_or_review,
                accounting: d.accounting,
                checks: d.checks,
                controls: ctl,
                controlTotal: d.controls.total,
                unit: key === "nca_ecc_2.2024" ? "Controls & sub-controls" : "Controls",
              },
            };
          })
        : [];
    return [...scanCards, ...ncaCards];
  }, [complianceData, ncaOverview, selectedProvider]);

  const fleetScore = useMemo(() => {
    const totals = dynamicFrameworks.reduce(
      (acc, f) => ({ passed: acc.passed + f.passed, failed: acc.failed + f.failed }),
      { passed: 0, failed: 0 }
    );
    const evaluated = totals.passed + totals.failed;
    return evaluated > 0 ? Math.round((totals.passed / evaluated) * 100) : 0;
  }, [dynamicFrameworks]);

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

  // Real per-requirement drilldown for the framework open in the modal.
  const requirementsParams = useMemo(() => {
    if (!selectedFramework || !complianceParams) return undefined;
    return { "filter[compliance_id]": selectedFramework.complianceId, ...complianceParams };
  }, [selectedFramework, complianceParams]);

  const { data: scanRequirements, isLoading: scanRequirementsLoading } = useComplianceRequirements(requirementsParams);

  // NCA ECC/CCC on OCI: requirements come from the NCA assessment, rendered by the same modal as other frameworks.
  const ncaAssessmentId: string | undefined = ncaOverview?.latest?.id;
  const ncaKey = selectedFramework?.nca?.key;
  const ncaControlsQ = useQuery({
    enabled: !!ncaKey && !!ncaAssessmentId,
    queryKey: ["nca", ncaAssessmentId, "modal-controls", ncaKey],
    queryFn: () => ncaFetch(`/assessments/${ncaAssessmentId}/controls${qs({ framework: ncaKey, limit: 500 })}`),
  });
  const modalRequirements: Array<Record<string, any>> | undefined = ncaKey
    ? (ncaControlsQ.data?.results ?? []).map((c: any) => ({
        id: c.control_id,
        description: c.name.replace(/^[\d-T]+\s*/, ""),
        status: c.status,
        reason: c.reason,
        basis: c.basis,
        manual_label: c.manual_label,
        checks: c.checks,
        framework: c.framework,
      }))
    : (scanRequirements as Array<Record<string, any>> | undefined);
  const requirementsLoading = ncaKey ? ncaControlsQ.isLoading : scanRequirementsLoading;
  const box = useMemo(() => {
    if (!selectedFramework) return null;
    const nca = selectedFramework.nca;
    if (nca) {
      return { total: nca.controlTotal, passed: nca.controls.passed, failed: nca.controls.failed, manual: nca.controls.manual,
        notTested: nca.controls.notTested, score: nca.controls.score };
    }
    return { total: selectedFramework.totalControls, passed: selectedFramework.passed, failed: selectedFramework.failed,
      manual: selectedFramework.manual, notTested: 0, score: selectedFramework.score };
  }, [selectedFramework]);
  const [ncaDrawer, setNcaDrawer] = useState<{ fw: string; id: string } | null>(null);
  const [ncaBusy, setNcaBusy] = useState("");

  const filteredModalRequirements = useMemo(() => {
    const list = (modalRequirements as Array<Record<string, any>>) ?? [];
    // NCA: show results first (fail, pass, not tested) and manual controls last; stable within each group
    const rank: Record<string, number> = { FAIL: 0, PASS: 1, ERROR: 2, NOT_APPLICABLE: 2, MANUAL: 3 };
    const ordered = ncaKey
      ? [...list].sort((a, b) => (rank[a.status] ?? 4) - (rank[b.status] ?? 4))
      : list;
    return ordered.filter((r) => {
      if (modalStatusFilter === "MANUAL") {
        // existing frameworks fold "resource not deployed" into MANUAL; NCA keeps them apart
        if (r.status !== "MANUAL" && !(!ncaKey && r.status === "NOT_APPLICABLE")) return false;
      } else if (modalStatusFilter === "NOT_TESTED") {
        if (r.status !== "NOT_APPLICABLE" && r.status !== "ERROR") return false;
      } else if (modalStatusFilter !== "ALL" && r.status !== modalStatusFilter) return false;
      if (modalSearchTerm.trim()) {
        const q = modalSearchTerm.toLowerCase();
        return String(r.id || "").toLowerCase().includes(q) || String(r.description || "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [modalRequirements, modalStatusFilter, modalSearchTerm]);

  const handleExportEvidence = () => {
    setExportSuccess(true);
    const content = JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        fleet_compliance_score: `${fleetScore}%`,
        frameworks: dynamicFrameworks.map((f) => ({
          framework: f.name,
          version: f.version,
          compliance_id: f.complianceId,
          total_controls: f.totalControls,
          score: `${f.score}%`,
          passed: f.passed,
          failed: f.failed,
          manual: f.manual,
        })),
      },
      null,
      2
    );
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `digital-ciso-compliance-evidence-${Date.now()}.json`;
    a.click();
    setTimeout(() => setExportSuccess(false), 3000);
  };

  const noFrameworksYet = !complianceLoading && !complianceFetching && dynamicFrameworks.length === 0;

  if (ncaFramework) {
    return (
      <AppShell title="Compliance & Governance" subtitle="NCA ECC & CCC controls assessed against your Oracle Cloud Infrastructure tenancy">
        <NcaWorkspace initialFramework={ncaFramework} onBack={() => setNcaFramework(null)} />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Compliance & Governance"
      subtitle="Multi-framework regulatory alignment computed from real scan results"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setNcaFramework("nca_ecc_2.2024")}
            className="inline-flex items-center gap-2 rounded-xl bg-surface-2 border border-border/80 px-4 py-2 text-xs font-semibold text-foreground hover:bg-surface-3 hover:border-primary/50 transition-all shadow-sm active:scale-95"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>NCA Assessment Workspace</span>
          </button>
          <button
            onClick={handleExportEvidence}
            disabled={dynamicFrameworks.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-surface-2 border border-border/80 px-4 py-2 text-xs font-semibold text-foreground hover:bg-surface-3 hover:border-primary/50 transition-all shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="h-3.5 w-3.5 text-primary" />
            <span>{exportSuccess ? "Exported Evidence Pack!" : "Export Audit Evidence"}</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6 pb-12">
        {/* ── Top Fleet Banner Card ── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 rounded-2xl border border-border/80 bg-surface/90 p-5 sm:p-6 backdrop-blur-md shadow-lg">
          <div className="flex items-center gap-5">
            <FleetCircularGauge score={fleetScore} />
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold text-foreground">
                Fleet Compliance: {fleetScore}%
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {dynamicFrameworks.length} framework{dynamicFrameworks.length === 1 ? "" : "s"} evaluated from real scan data across {totalAssetsCount} discovered cloud assets
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="h-9 rounded-xl border border-border bg-surface-2/60 px-3 text-xs font-semibold text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary cursor-pointer"
            >
              <option value="ALL">All Connected Environments ({connectedProviders.length})</option>
              {connectedProviders.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.alias} ({providerDisplayName(p.value)})
                </option>
              ))}
            </select>

            <div className="relative min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search evaluated frameworks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-2/60 pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
              />
            </div>

            <div className="flex items-center rounded-xl border border-border bg-surface-2/60 p-0.5">
              <button
                onClick={() => setViewMode("cards")}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${viewMode === "cards" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                Cards
              </button>
              <button
                onClick={() => setViewMode("matrix")}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${viewMode === "matrix" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                Matrix
              </button>
            </div>
          </div>
        </div>

        {/* ── Category Filter Pills ── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {["All", "Cloud", "Government", "Industry", "Privacy"].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-all shrink-0 ${selectedCategory === cat
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-surface-2/60 text-muted-foreground hover:bg-surface-3 hover:text-foreground border border-border/60"
                }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {complianceLoading || complianceFetching ? (
          <div className="rounded-2xl border border-border/80 bg-surface/90 p-12 text-center text-sm text-muted-foreground">
            Loading real framework results…
          </div>
        ) : noFrameworksYet ? (
          <div className="rounded-2xl border border-border/80 bg-surface/90 p-12 text-center space-y-1">
            <p className="text-sm font-semibold text-foreground">No compliance data for this selection yet</p>
            <p className="text-xs text-muted-foreground">
              {connectedProviders.length === 0
                ? "Connect a cloud provider and run a scan to populate compliance frameworks."
                : "This provider hasn't completed a scan yet, or its compliance overview is still being computed. Try again shortly."}
            </p>
          </div>
        ) : viewMode === "cards" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredFrameworks.map((fw) => (
              <div
                key={fw.id}
                onClick={() => { setSelectedFramework(fw); }}
                className="group relative flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/90 p-5 backdrop-blur-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 cursor-pointer"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="inline-block rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border border-border">
                        {fw.category} · {fw.providerTarget}
                      </span>
                      <h3 className="mt-2 text-sm font-bold text-foreground leading-snug group-hover:text-primary transition-colors">
                        {fw.name}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-muted-foreground font-mono">
                        {fw.version ? `${fw.version} · ` : ""}
                        {fw.totalControls} {fw.nca?.unit ?? "Controls"}
                      </p>
                    </div>
                    <CircularScoreRing score={fw.score} strokeColor={fw.strokeColor} />
                  </div>
                </div>

                <div className="mt-5 pt-3.5 border-t border-border/60 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 font-mono text-[11px] text-emerald-400" title="Passed Controls">
                      <Check className="h-3 w-3" />
                      {fw.passed}
                    </span>
                    <span className="flex items-center gap-1 font-mono text-[11px] text-rose-400" title="Violations / Failed Controls">
                      <X className="h-3 w-3" />
                      {fw.failed}
                    </span>
                    {fw.manual - (fw.nca ? fw.nca.notApplicable + fw.nca.error : 0) > 0 && (
                      <span className="flex items-center gap-1 font-mono text-[11px] text-indigo-400" title={fw.nca ? "Manual controls" : "Manual Audits / Resource Not Available"}>
                        <FileText className="h-3 w-3" />
                        {fw.manual - (fw.nca ? fw.nca.notApplicable + fw.nca.error : 0)}
                      </span>
                    )}
                    {fw.nca && fw.nca.notApplicable + fw.nca.error > 0 && (
                      <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground" title="No OCI resources: the resources this control needs do not exist (or could not be read)">
                        <Search className="h-3 w-3" />
                        {fw.nca.notApplicable + fw.nca.error}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-semibold text-primary group-hover:translate-x-0.5 transition-transform flex items-center">
                    Audit View <ChevronRight className="h-3 w-3 ml-0.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ── Compliance Matrix View ── */
          <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 border-b border-border text-muted-foreground font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Framework Standard</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Target Scope</th>
                    <th className="px-4 py-3 text-center">Score</th>
                    <th className="px-4 py-3 text-center">Passed</th>
                    <th className="px-4 py-3 text-center">Violations</th>
                    <th className="px-4 py-3 text-center">Manual</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-medium">
                  {filteredFrameworks.map((fw) => (
                    <tr
                      key={fw.id}
                      className="hover:bg-surface-2/40 transition-colors cursor-pointer"
                      onClick={() => setSelectedFramework(fw)}
                    >
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {fw.name}
                        <span className="block text-[10px] text-muted-foreground font-mono font-normal">
                          {fw.version} · {fw.totalControls} controls
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                          {fw.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{fw.providerTarget}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-mono font-bold ${fw.textColor}`}>{fw.score}%</span>
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-emerald-400">{fw.passed}</td>
                      <td className="px-4 py-3 text-center font-mono text-rose-400">{fw.failed}</td>
                      <td className="px-4 py-3 text-center font-mono text-indigo-400">{fw.manual}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFramework(fw);
                          }}
                          className="font-semibold text-primary hover:underline inline-flex items-center gap-1"
                        >
                          Inspect <ChevronRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Framework Audit Telemetry Modal / Drawer ── */}
        {selectedFramework && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="inline-block rounded-full bg-surface-2 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary border border-primary/20">
                    {selectedFramework.category} Compliance Standard
                  </span>
                  <h3 className="mt-2 text-lg font-bold text-foreground">{selectedFramework.name}</h3>
                  <p className="text-xs text-muted-foreground font-mono">{selectedFramework.version}</p>
                </div>
                <button
                  onClick={() => {
                    setSelectedFramework(null);
                    setModalSearchTerm("");
                    setModalStatusFilter("ALL");
                  }}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className={`mt-6 grid ${selectedFramework.nca ? "grid-cols-5" : "grid-cols-4"} gap-3 rounded-xl border border-border bg-surface-2/40 p-4 text-center`}>
                <div>
                  <div className="font-mono text-base font-bold text-foreground">{box?.score}%</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Score</div>
                </div>
                <div>
                  <div className="font-mono text-base font-bold text-emerald-400">{box?.passed}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Controls Passed</div>
                </div>
                <div>
                  <div className="font-mono text-base font-bold text-rose-400">{box?.failed}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Violations / Failed</div>
                </div>
                <div>
                  <div className="font-mono text-base font-bold text-indigo-400">
                    {box?.manual}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight" title="Controls requiring manual verification or evidence">
                    {selectedFramework.nca ? "Manual" : "Manual Audits / Resource Not Available"}
                  </div>
                </div>
                {selectedFramework.nca && (
                  <div>
                    <div className="font-mono text-base font-bold text-muted-foreground">{box?.notTested}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight" title="Not testable: the OCI resources this control needs do not exist in the tenancy (or could not be read)">No OCI Resources</div>
                  </div>
                )}
              </div>

              {selectedFramework.nca && (
                <div className="mt-2 flex justify-end gap-1.5 text-[10px]">
                  {["csv", "json"].map((f) => (
                    <button key={f} className="cursor-pointer rounded-md bg-surface-2 px-2 py-0.5 font-bold uppercase text-muted-foreground hover:text-foreground"
                      onClick={() => ncaDownload(`/assessments/${ncaAssessmentId}/report${qs({ fmt: f, framework: selectedFramework.nca!.key })}`, `${selectedFramework.nca!.key}.${f}`).catch((e) => setNcaBusy(e.message))}>
                      {f}
                    </button>
                  ))}
                  <button className="cursor-pointer rounded-md bg-surface-2 px-2 py-0.5 font-bold text-muted-foreground hover:text-foreground"
                    onClick={() => { const k = selectedFramework.nca!.key; setSelectedFramework(null); setNcaFramework(k); }}>
                    Checks &amp; remediation →
                  </button>
                </div>
              )}
              {ncaBusy && <p className="mt-1 text-[11px] text-rose-400">{ncaBusy}</p>}

              <div className="mt-6 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {ncaKey === "nca_ecc_2.2024" ? "Controls & sub-controls" : "Requirements Evaluated"} ({(modalRequirements ?? []).length})
                  </h4>
                  <div className="flex items-center gap-1.5">
                    {((selectedFramework.nca ? ["ALL", "FAIL", "PASS", "MANUAL", "NOT_TESTED"] : ["ALL", "FAIL", "PASS", "MANUAL"]) as Array<"ALL" | "FAIL" | "PASS" | "MANUAL" | "NOT_TESTED">).map((st) => (
                      <button
                        key={st}
                        onClick={() => setModalStatusFilter(st)}
                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase transition-colors cursor-pointer ${modalStatusFilter === st ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground hover:text-foreground"
                          }`}
                      >
                        {st === "MANUAL" ? (selectedFramework.nca ? "MANUAL" : "MANUAL / N/A") : st === "NOT_TESTED" ? "NO OCI RESOURCES" : st}
                      </button>
                    ))}
                  </div>
                </div>

                {(modalRequirements ?? []).length > 5 && (
                  <div className="relative">
                    <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search requirement ID or description..."
                      value={modalSearchTerm}
                      onChange={(e) => setModalSearchTerm(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface-2/60 pl-8.5 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                    />
                  </div>
                )}

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {requirementsLoading ? (
                    <div className="rounded-xl border border-border/60 bg-surface-2/30 p-8 text-center text-xs text-muted-foreground">
                      Loading requirement telemetry…
                    </div>
                  ) : (modalRequirements ?? []).length === 0 ? (
                    <div className="rounded-xl border border-border/60 bg-surface-2/30 p-8 text-center text-xs text-muted-foreground space-y-1">
                      <p className="font-semibold text-foreground">No Live Scan Telemetry for {selectedFramework.name}</p>
                      <p className="text-muted-foreground">
                        No continuous posture audit has produced requirement-level data for this framework yet.
                      </p>
                    </div>
                  ) : filteredModalRequirements.length === 0 ? (
                    <div className="rounded-lg border border-border/60 bg-surface-2/30 p-6 text-center text-xs text-muted-foreground">
                      No requirements match your current filter.
                    </div>
                  ) : (
                    filteredModalRequirements.map((r: any, i: number) => {
                      const isPass = r.status === "PASS";
                      const isManual = r.status === "MANUAL" || r.status === "NOT_APPLICABLE" || r.status === "ERROR";

                      return (
                        <div
                          key={`${r.id || "req"}-${i}`}
                          onClick={selectedFramework.nca ? () => setNcaDrawer({ fw: selectedFramework.nca!.key, id: r.id }) : undefined}
                          className={`flex items-start justify-between rounded-lg border border-border bg-surface-2/60 p-3 text-xs gap-3 ${selectedFramework.nca ? "cursor-pointer hover:border-primary/50" : ""}`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {isPass ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                              ) : isManual ? (
                                <FileText className="h-4 w-4 text-indigo-400 shrink-0" />
                              ) : (
                                <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                              )}
                              <span className="font-semibold text-foreground font-mono">{r.id}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground pl-6">{r.description}</p>
                          </div>
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase shrink-0 ${isPass
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : isManual
                                  ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              }`}
                          >
                            {r.status === "NOT_APPLICABLE" ? (selectedFramework.nca ? "No OCI resources" : "N/A") : r.status === "ERROR" ? "No OCI resources" : isManual ? (selectedFramework.nca ? "Manual" : "Manual / Resource N/A") : (r.status || "FAIL")}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-xs">
                <Link to="/findings" className="font-semibold text-primary hover:underline">
                  Open Findings Telemetry →
                </Link>
                <button
                  onClick={() => {
                    setSelectedFramework(null);
                    setModalSearchTerm("");
                    setModalStatusFilter("ALL");
                  }}
                  className="rounded-lg bg-surface-2 px-4 py-2 font-semibold text-foreground hover:bg-surface-3 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {ncaDrawer && <ControlDrawer fw={ncaDrawer.fw} id={ncaDrawer.id} onClose={() => setNcaDrawer(null)} />}
    </AppShell>
  );
}
