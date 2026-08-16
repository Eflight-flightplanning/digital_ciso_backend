import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShieldCheck,
  Server,
  Activity,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  RefreshCw,
  Zap,
  ArrowUpRight,
  BrainCircuit,
  Eye,
  GitBranch,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  ThreatGauge,
  StatusDonut,
  SeverityBars,
  ResourceBars,
  SeverityTrend,
  Sparkline,
  SecurityRadar,
  AttackSurfaceMap,
} from "@/components/dashboard/charts";
import {
  Panel,
  PanelTitle,
  Counter,
  Chip,
  Dot,
} from "@/components/ui-kit/primitives";
import {
  kpis as mockKpis,
  radarFrameworks as mockRadarFrameworks,
  decisions as mockDecisions,
} from "@/lib/mock";
import { useOverview, useCompliance, useDecisionLogs } from "@/hooks/use-api";


export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  const [selectedProvider, setSelectedProvider] = useState("all");
  const [activeTab, setActiveTab] = useState<"radar" | "inventory" | "threat-map">("radar");
  const [refreshing, setRefreshing] = useState(false);

  // ── Live API data (falls back to mock when backend is unreachable) ──
  const { data: overviewRaw, refetch: refetchOverview } = useOverview();
  const { data: complianceRaw } = useCompliance({ "page[size]": "5" });
  const { data: decisionLogsRaw } = useDecisionLogs();

  // Map backend overview to KPI shape expected by UI
  const overview = Array.isArray(overviewRaw) ? overviewRaw[0] : null;
  const kpis = overview
    ? {
        postureScore: Math.round((overview as Record<string, unknown>).security_score as number ?? mockKpis.postureScore),
        postureTrend: (overview as Record<string, unknown>).security_score_change as number ?? mockKpis.postureTrend,
        connectedClouds: (overview as Record<string, unknown>).providers_connected as number ?? mockKpis.connectedClouds,
        frameworks: (overview as Record<string, unknown>).compliance_frameworks as number ?? mockKpis.frameworks,
        openFindings: (overview as Record<string, unknown>).open_findings as number ?? mockKpis.openFindings,
        severityBreakdown: {
          critical: (overview as Record<string, unknown>).critical_findings as number ?? mockKpis.severityBreakdown.critical,
        },
      }
    : mockKpis;

  // Map compliance overview items to radar framework cards
  const complianceItems = complianceRaw?.items as Array<Record<string, unknown>> | undefined;
  const radarFrameworks = complianceItems?.length
    ? complianceItems.map((c) => ({
        framework: (c.framework as string)?.split("_")[0]?.toUpperCase() ?? "FW",
        pass: Math.round((c.pass_rate as number ?? 0) * 100),
        trend: `+${(c.pass_rate_change as number ?? 0).toFixed(1)}%`,
      }))
    : mockRadarFrameworks;

  // Map decision log items to the decision queue shape
  const decisionItems = decisionLogsRaw?.items as Array<Record<string, unknown>> | undefined;
  const decisions = decisionItems?.length
    ? decisionItems.map((d) => ({
        id: d.id as string,
        finding: (d.finding_title as string) ?? "Security Finding",
        priority: (d.priority as string) ?? "P2",
        risk: (d.risk_score as number) ?? 72,
        review: (d.status as string) ?? "Pending",
        sla: (d.sla_deadline as string) ?? new Date().toISOString(),
        reviewer: (d.reviewer as string) ?? "",
      }))
    : mockDecisions;

  const handleRefresh = () => {
    setRefreshing(true);
    refetchOverview().finally(() => setRefreshing(false));
  };

  return (
    <AppShell
      title="Security Command Center"
      subtitle="Multi-cloud posture monitoring, threat correlation, and automated triage"
      actions={
        <div className="flex items-center gap-3">
          {/* Scope Selector */}
          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            className="h-10 min-w-[220px] rounded-lg border border-border bg-surface-2/60 px-4 text-xs font-medium text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
          >
            <option value="all">All Cloud Environments (6)</option>
            <option value="aws">AWS Production (acme-prod)</option>
            <option value="azure">Azure EMEA (acme-emea)</option>
            <option value="gcp">GCP Core (acme-core)</option>
            <option value="k8s">Kubernetes (cluster-prod-1)</option>
          </select>

          <button
            onClick={handleRefresh}
            className="inline-flex h-10 min-w-[140px] items-center justify-center gap-2 rounded-lg border border-border bg-surface-2/50 px-5 text-xs font-semibold text-foreground transition-all hover:border-primary/40 active:scale-95"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-primary" : ""}`}
            />
            <span>{refreshing ? "Syncing..." : "Sync State"}</span>
          </button>

          <Link
            to="/scans"
            className="inline-flex h-10 min-w-[140px] items-center justify-center gap-2 rounded-lg bg-primary px-5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>Launch Scan</span>
          </Link>
        </div>
      }
    >
      {/* ── Top Executive KPI Cards ── */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Posture Score */}
        <Panel index={0} glow="primary" className="p-4">
          <div className="flex items-center justify-between">
            <span className="section-label">Security Posture</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-foreground">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="kpi-number text-3xl text-foreground">
              <Counter value={kpis.postureScore} suffix="%" />
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success ring-1 ring-success/30">
              <Dot tone="success" pulse />
              +{kpis.postureTrend}% 7d
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            6 cloud accounts actively guarded
          </p>
        </Panel>

        {/* KPI 2: Connected Clouds */}
        <Panel index={1} glow="info" className="p-4">
          <div className="flex items-center justify-between">
            <span className="section-label">Connected Clouds</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-foreground">
              <Server className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between">
            <span className="kpi-number text-3xl text-foreground">
              <Counter value={kpis.connectedClouds} />
            </span>
            <div className="flex gap-1 text-[10px] text-muted-foreground">
              <span className="rounded bg-surface-2 px-1.5 py-0.5 font-medium text-foreground">AWS</span>
              <span className="rounded bg-surface-2 px-1.5 py-0.5 font-medium text-foreground">Azure</span>
              <span className="rounded bg-surface-2 px-1.5 py-0.5 font-medium text-foreground">GCP</span>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground flex justify-between items-center">
            <span>5 online · 1 sync</span>
            <Link to="/providers" className="text-primary hover:underline text-[10px] font-medium">
              Manage →
            </Link>
          </p>
        </Panel>

        {/* KPI 3: Compliance Standards */}
        <Panel index={2} glow="success" className="p-4">
          <div className="flex items-center justify-between">
            <span className="section-label">Compliance Standards</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-foreground">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between">
            <span className="kpi-number text-3xl text-foreground">
              <Counter value={kpis.frameworks} />
            </span>
            <div className="w-20">
              <Sparkline />
            </div>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground flex justify-between items-center">
            <span>CIS · SOC 2 · ISO · PCI</span>
            <Link to="/compliance" className="text-success hover:underline text-[10px] font-medium">
              Audit →
            </Link>
          </p>
        </Panel>

        {/* KPI 4: Open Findings */}
        <Panel index={3} glow="critical" className="p-4">
          <div className="flex items-center justify-between">
            <span className="section-label">Open Findings</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-foreground">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="kpi-number text-3xl text-foreground">
              <Counter value={kpis.openFindings} />
            </span>
            <span className="text-xs font-semibold text-critical">
              {kpis.severityBreakdown.critical} Critical
            </span>
          </div>
          <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="bg-critical" style={{ width: "15%" }} title="Critical" />
            <div className="bg-high" style={{ width: "35%" }} title="High" />
            <div className="bg-info" style={{ width: "30%" }} title="Medium" />
            <div className="bg-primary" style={{ width: "20%" }} title="Low" />
          </div>
        </Panel>
      </div>

      {/* ── Top Visual Row: Security Radar (8 Cols) & Threat Gauges (4 Cols) ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-stretch">
        {/* Left Column (8 Cols): Security Posture Radar */}
        <div className="lg:col-span-8 flex flex-col">
          <Panel index={4} holo glow="primary" className="p-5 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
                <div>
                  <h3 className="font-display text-sm font-bold text-foreground">
                    Security Posture Radar
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Top 5 Compliance Standards continuous assessment coverage
                  </p>
                </div>

                {/* View Switcher Tabs */}
                <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2/40 p-1 text-xs">
                  <button
                    onClick={() => setActiveTab("radar")}
                    className={`h-8 rounded-md px-3.5 text-xs font-medium transition-all ${
                      activeTab === "radar"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Radar Posture
                  </button>
                  <button
                    onClick={() => setActiveTab("inventory")}
                    className={`h-8 rounded-md px-3.5 text-xs font-medium transition-all ${
                      activeTab === "inventory"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Asset Volume
                  </button>
                  <button
                    onClick={() => setActiveTab("threat-map")}
                    className={`h-8 rounded-md px-3.5 text-xs font-medium transition-all ${
                      activeTab === "threat-map"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Threat Map
                  </button>
                </div>
              </div>

              {/* Tab 1: Security Radar */}
              {activeTab === "radar" && (
                <div className="pt-3">
                  <SecurityRadar />
                  <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-5 border-t border-border/60 pt-3 text-center">
                    {radarFrameworks.map((rf) => (
                      <div key={rf.framework} className="rounded-lg bg-surface-2/40 p-2.5 border border-border/40">
                        <span className="block truncate text-[11px] text-muted-foreground font-medium">
                          {rf.framework}
                        </span>
                        <span className="font-display text-sm font-bold text-foreground">
                          {rf.pass}%
                        </span>
                        <span className="block text-[10px] text-success font-semibold">{rf.trend}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab 2: Resource Bars */}
              {activeTab === "inventory" && (
                <div className="pt-3">
                  <ResourceBars />
                </div>
              )}

              {/* Tab 3: Threat Map */}
              {activeTab === "threat-map" && (
                <div className="pt-3">
                  <AttackSurfaceMap />
                </div>
              )}
            </div>
          </Panel>
        </div>

        {/* Right Column (4 Cols): Threat Index (Above) & Findings Triage (Below) */}
        <div className="flex flex-col justify-between gap-4 lg:col-span-4">
          {/* Card 1 (Top): Threat Index Gauge */}
          <Panel index={5} glow="primary" className="p-4 flex-1 flex flex-col justify-between">
            <PanelTitle
              title="Threat Index"
              hint="Composite exploitability"
              right={<Chip tone="critical">High Risk</Chip>}
            />
            <div className="py-1">
              <ThreatGauge value={64} />
            </div>
          </Panel>

          {/* Card 2 (Below): Findings Triage Donut */}
          <Panel index={6} glow="info" className="p-4 flex-1 flex flex-col justify-between">
            <PanelTitle
              title="Findings Triage"
              hint="Resolution breakdown"
              right={
                <Link to="/findings" className="text-xs text-primary hover:underline font-medium">
                  Explore →
                </Link>
              }
            />
            <div className="py-1">
              <StatusDonut />
            </div>
          </Panel>
        </div>
      </div>

      {/* ── Lower Row: Spectra & Aegis Decision Core + Toxic Attack Path Alert ── */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left (8 Cols): Spectra & Aegis Decision Queue */}
        <div className="lg:col-span-8">
          <Panel index={7} holo glow="info" className="p-5 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between border-b border-border/70 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-foreground">
                    <BrainCircuit className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold text-foreground">
                      Spectra & Aegis Decision Core
                    </h3>
                    <span className="text-[10px] text-muted-foreground">
                      Autonomous threat correlation and recommended actions
                    </span>
                  </div>
                </div>
                <Link
                  to="/ai/advisor"
                  className="inline-flex h-9 min-w-[110px] items-center justify-center gap-1.5 rounded-lg bg-surface-2 px-4 text-xs font-semibold text-foreground hover:bg-surface-2/80 transition-colors"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span>Analyze</span>
                </Link>
              </div>

              {/* Priority Action Queue */}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {decisions.slice(0, 3).map((d) => (
                  <div
                    key={d.id}
                    className="flex flex-col justify-between rounded-lg border border-border/70 bg-surface-2/40 p-3.5 transition-colors hover:border-primary/40"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs">
                        <Chip tone={d.priority === "P1" ? "critical" : "high"}>
                          {d.priority}
                        </Chip>
                        <span className="mono font-bold text-critical text-[11px]">
                          Risk: {d.risk}
                        </span>
                      </div>

                      <p className="mt-2 line-clamp-2 text-xs font-semibold text-foreground">
                        {d.finding}
                      </p>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2 text-[11px]">
                      <span className="text-muted-foreground">SLA: {d.sla.slice(11, 16)}</span>
                      <Link
                        to="/ai/decisions"
                        className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                      >
                        <Eye className="h-3 w-3" />
                        <span>Review</span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Link
              to="/ai/decisions"
              className="mt-4 flex h-10 w-full items-center justify-center gap-1 rounded-lg border border-border bg-surface-2/50 px-5 text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary transition-colors"
            >
              <span>View Full Decision Log ({decisions.length})</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Panel>
        </div>

        {/* Right (4 Cols): Toxic Attack Path Alert */}
        <div className="lg:col-span-4 flex flex-col justify-between">
          <Panel index={8} glow="critical" className="p-5 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between border-b border-border/70 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-foreground">
                    <GitBranch className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-display text-xs font-bold text-foreground">
                      Toxic Attack Path Detected
                    </h4>
                    <span className="text-[10px] text-critical font-semibold">
                      Critical Risk Surface
                    </span>
                  </div>
                </div>
                <Chip tone="critical">3 Hops</Chip>
              </div>

              <div className="mt-4 space-y-2 text-xs">
                <div className="rounded bg-surface-2/40 p-2.5 border border-border/60">
                  <span className="mono text-[10px] font-bold text-critical block">
                    1. Internet Ingress (Port 3389)
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Public CI runner exposed to 0.0.0.0/0
                  </span>
                </div>
                <div className="rounded bg-surface-2/40 p-2.5 border border-border/60">
                  <span className="mono text-[10px] font-bold text-high block">
                    2. STS IAM Role Assume
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    AdministratorAccess escalation
                  </span>
                </div>
                <div className="rounded bg-surface-2/40 p-2.5 border border-border/60">
                  <span className="mono text-[10px] font-bold text-info block">
                    3. Crown Jewel S3 Bucket
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    prod-billing-exports customer data
                  </span>
                </div>
              </div>
            </div>

            <Link
              to="/attack-paths"
              className="mt-4 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            >
              <span>Inspect Attack Topology</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
