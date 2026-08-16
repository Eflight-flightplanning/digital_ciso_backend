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
  FileText,
  Plug,
  CheckCircle2,
  Lock,
  Search,
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
  findings as mockFindings,
} from "@/lib/mock";
import { useOverview, useCompliance, useDecisionLogs, useFindings } from "@/hooks/use-api";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  const [selectedProvider, setSelectedProvider] = useState("all");
  const [activeTab, setActiveTab] = useState<"radar" | "inventory" | "threat-map">("radar");
  const [refreshing, setRefreshing] = useState(false);
  const [advisorInput, setAdvisorInput] = useState("");

  // ── Live API data with mock fallback ──
  const { data: overviewRaw, refetch: refetchOverview } = useOverview();
  const { data: complianceRaw } = useCompliance({ "page[size]": "5" });
  const { data: decisionLogsRaw } = useDecisionLogs();
  const { data: findingsRaw } = useFindings();

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

  const liveFindings = (findingsRaw?.items && findingsRaw.items.length > 0)
    ? findingsRaw.items
    : mockFindings;

  const handleRefresh = () => {
    setRefreshing(true);
    refetchOverview().finally(() => {
      setTimeout(() => setRefreshing(false), 800);
    });
  };

  return (
    <AppShell
      title="Security Command Center"
      subtitle="Autonomous multi-cloud security operations, continuous compliance, and AI remediation"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {/* Cloud Scope Selector */}
          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            className="h-10 rounded-lg border border-border bg-surface-2/60 px-3 text-xs font-medium text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
          >
            <option value="all">All Cloud Environments (6)</option>
            <option value="aws">AWS Production (acme-prod)</option>
            <option value="azure">Azure EMEA (acme-emea)</option>
            <option value="gcp">GCP Core (acme-core)</option>
            <option value="k8s">Kubernetes Cluster</option>
          </select>

          {/* Quick Action: Trigger Scan */}
          <Link
            to="/scans"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2/50 px-3.5 text-xs font-semibold text-foreground transition-all hover:border-primary/40 active:scale-95"
          >
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span>Audit Scans</span>
          </Link>

          {/* Executive Report Download */}
          <Link
            to="/reports"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Executive Report</span>
          </Link>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            title="Refresh telemetry"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-2/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-primary" : ""}`} />
          </button>
        </div>
      }
    >
      {/* ── AI Advisor Prompt Bar ── */}
      <div className="mb-6 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-surface-2/40 to-info/10 p-4 backdrop-blur-xl shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary shadow-inner">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-bold text-foreground">
                  Digital CISO AI Advisor
                </span>
                <Chip tone="primary">Qwen 3.5 9B / Claude</Chip>
              </div>
              <p className="text-xs text-muted-foreground">
                Ask any question grounded in your live cloud findings and compliance audit controls
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Ask CISO: 'How to remediate critical S3 bucket exposures?'..."
                value={advisorInput}
                onChange={(e) => setAdvisorInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && advisorInput.trim()) {
                    window.location.href = `/ai/advisor?prompt=${encodeURIComponent(advisorInput)}`;
                  }
                }}
                className="h-9 w-full rounded-lg border border-border/80 bg-surface/90 pr-3 pl-9 text-xs text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
              />
            </div>
            <Link
              to="/ai/advisor"
              search={{ prompt: advisorInput || "Triage all open critical findings" }}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
            >
              <span>Consult</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── 4 Primary Interactive KPI Panels ── */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Posture Score */}
        <Link to="/compliance" className="block group">
          <Panel index={0} glow="primary" className="p-4 transition-transform group-hover:-translate-y-1">
            <div className="flex items-center justify-between">
              <span className="section-label">Enterprise Posture Score</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="kpi-number text-3xl font-extrabold text-foreground">
                <Counter value={kpis.postureScore} />
              </span>
              <span className="text-xs font-bold text-success">
                +{kpis.postureTrend}% 30d
              </span>
            </div>
            <span className="mt-1 text-[11px] text-muted-foreground block">
              Passing 142 of 145 CIS & SOC controls
            </span>
          </Panel>
        </Link>

        {/* KPI 2: Open Security Violations */}
        <Link to="/findings" className="block group">
          <Panel index={1} glow="critical" className="p-4 transition-transform group-hover:-translate-y-1">
            <div className="flex items-center justify-between">
              <span className="section-label">Active Security Findings</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-critical transition-colors" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="kpi-number text-3xl font-extrabold text-critical">
                <Counter value={kpis.openFindings} />
              </span>
              <Chip tone="critical">2 Critical · 1 High</Chip>
            </div>
            <span className="mt-1 text-[11px] text-muted-foreground block">
              1 S3 Public Access · 1 Root MFA Missing
            </span>
          </Panel>
        </Link>

        {/* KPI 3: Toxic Combinations & Attack Paths */}
        <Link to="/attack-paths" className="block group">
          <Panel index={2} glow="high" className="p-4 transition-transform group-hover:-translate-y-1">
            <div className="flex items-center justify-between">
              <span className="section-label">Toxic Attack Combinations</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-high transition-colors" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="kpi-number text-3xl font-extrabold text-high">
                <Counter value={1} />
              </span>
              <Chip tone="high">3 Hops to Crown Jewel</Chip>
            </div>
            <span className="mt-1 text-[11px] text-muted-foreground block">
              Internet → CI Runner → S3 Billing Bucket
            </span>
          </Panel>
        </Link>

        {/* KPI 4: HITL Decisions Queue */}
        <Link to="/ai/decisions" className="block group">
          <Panel index={3} glow="info" className="p-4 transition-transform group-hover:-translate-y-1">
            <div className="flex items-center justify-between">
              <span className="section-label">HITL Remediation Queue</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-info transition-colors" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="kpi-number text-3xl font-extrabold text-info">
                <Counter value={2} />
              </span>
              <Chip tone="info">Awaiting Authorization</Chip>
            </div>
            <span className="mt-1 text-[11px] text-muted-foreground block">
              AI Terraform playbooks ready for execution
            </span>
          </Panel>
        </Link>
      </div>

      {/* ── Main Operations Grid (Visual Charts + Live Streams) ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (8 Cols): Security Radar & Threat Visuals */}
        <div className="space-y-6 lg:col-span-8">
          {/* Main Visual Panel with Dynamic Tabs */}
          <Panel index={4} holo glow="primary" className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
              <div>
                <h3 className="font-display text-sm font-bold text-foreground">
                  Continuous Assurance & Attack Surface
                </h3>
                <p className="text-xs text-muted-foreground">
                  28 Prowler compliance frameworks continuously audited
                </p>
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5 text-xs">
                <button
                  onClick={() => setActiveTab("radar")}
                  className={`rounded-md px-3 py-1 font-semibold transition-all ${
                    activeTab === "radar"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Compliance Radar
                </button>
                <button
                  onClick={() => setActiveTab("threat-map")}
                  className={`rounded-md px-3 py-1 font-semibold transition-all ${
                    activeTab === "threat-map"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Global Attack Map
                </button>
                <button
                  onClick={() => setActiveTab("inventory")}
                  className={`rounded-md px-3 py-1 font-semibold transition-all ${
                    activeTab === "inventory"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Cloud Inventory
                </button>
              </div>
            </div>

            <div className="mt-4">
              {activeTab === "radar" && (
                <div>
                  <SecurityRadar />
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-border/60 pt-3">
                    <Link to="/compliance" className="text-center group">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">CIS AWS v3.0</span>
                      <div className="font-display text-base font-bold text-foreground group-hover:text-primary">91.2%</div>
                    </Link>
                    <Link to="/compliance" className="text-center group">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">SOC 2 Type II</span>
                      <div className="font-display text-base font-bold text-foreground group-hover:text-primary">94.0%</div>
                    </Link>
                    <Link to="/compliance" className="text-center group">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">ISO 27001</span>
                      <div className="font-display text-base font-bold text-foreground group-hover:text-primary">90.2%</div>
                    </Link>
                    <Link to="/compliance" className="text-center group">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">PCI-DSS v4.0</span>
                      <div className="font-display text-base font-bold text-foreground group-hover:text-primary">95.0%</div>
                    </Link>
                  </div>
                </div>
              )}

              {activeTab === "threat-map" && <AttackSurfaceMap />}
              {activeTab === "inventory" && <ResourceBars />}
            </div>
          </Panel>

          {/* Active Findings Preview Bar */}
          <Panel index={5} className="p-5">
            <div className="flex items-center justify-between border-b border-border/70 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-critical" />
                <h3 className="font-display text-sm font-bold text-foreground">
                  Live Security Findings Triage
                </h3>
              </div>
              <Link
                to="/findings"
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              >
                <span>View All Findings ({liveFindings.length})</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="space-y-2">
              {liveFindings.slice(0, 3).map((f: any) => (
                <Link
                  key={f.id}
                  to="/findings"
                  className="flex items-center justify-between rounded-xl border border-border/70 bg-surface-2/30 p-3 text-xs transition-all hover:border-primary/50 hover:bg-surface-2/60 block"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        f.severity === "critical" ? "bg-critical" : "bg-high"
                      }`}
                    />
                    <div>
                      <h4 className="font-bold text-foreground text-xs">{f.title}</h4>
                      <span className="mono text-[10px] text-muted-foreground">
                        {f.check_id} · {f.provider} ({f.region || "us-east-1"})
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Chip tone={f.status === "FAIL" ? "critical" : "success"}>
                      {f.status}
                    </Chip>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          </Panel>
        </div>

        {/* Right Column (4 Cols): Threat Gauge & Integrations */}
        <div className="space-y-6 lg:col-span-4">
          {/* Threat Gauge & Passing Donut */}
          <Panel index={6} glow="primary" className="p-5 text-center">
            <PanelTitle title="Real-time Risk Posture" hint="Continuous telemetry scoring" />
            <ThreatGauge value={85} />
            <div className="mt-4 border-t border-border/60 pt-3">
              <StatusDonut />
            </div>
          </Panel>

          {/* Quick Navigation to Key Enterprise Modules */}
          <Panel index={7} className="p-5">
            <PanelTitle title="Enterprise Platform Modules" hint="Direct operational access" />
            <div className="mt-3 space-y-2.5 text-xs">
              <Link
                to="/ai/decisions"
                className="flex items-center justify-between rounded-xl border border-border/80 bg-surface-2/40 p-3 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Lock className="h-4 w-4 text-high" />
                  <div>
                    <span className="font-bold text-foreground block">HITL Execution Gate</span>
                    <span className="text-[10px] text-muted-foreground">Approve & apply AI playbooks</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>

              <Link
                to="/compliance"
                className="flex items-center justify-between rounded-xl border border-border/80 bg-surface-2/40 p-3 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="h-4 w-4 text-success" />
                  <div>
                    <span className="font-bold text-foreground block">Compliance Scorecard</span>
                    <span className="text-[10px] text-muted-foreground">28 Prowler frameworks</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>

              <Link
                to="/integrations"
                className="flex items-center justify-between rounded-xl border border-border/80 bg-surface-2/40 p-3 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Plug className="h-4 w-4 text-primary" />
                  <div>
                    <span className="font-bold text-foreground block">SIEM & Webhook Hub</span>
                    <span className="text-[10px] text-muted-foreground">S3, Jira, Slack, Security Hub</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>

              <Link
                to="/reports"
                className="flex items-center justify-between rounded-xl border border-border/80 bg-surface-2/40 p-3 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <FileText className="h-4 w-4 text-info" />
                  <div>
                    <span className="font-bold text-foreground block">White-Labeled CISO Reports</span>
                    <span className="text-[10px] text-muted-foreground">One-click executive PDF export</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}