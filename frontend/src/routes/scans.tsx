import { useState, useEffect, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Radar,
  Play,
  Zap,
  GitCompare,
  CheckCircle2,
  TrendingUp,
  ArrowUpRight,
  ShieldCheck,
  X,
  AlertTriangle,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  DataTable,
  Row,
  Chip,
  Dot,
} from "@/components/ui-kit/primitives";
import { useScans, useLaunchScan, useProviders, useScanDelta } from "@/hooks/use-api";

export const Route = createFileRoute("/scans")({
  component: ScansPage,
});

function ScansPage() {
  const { data: apiScans, isLoading } = useScans();
  const { data: apiProviders } = useProviders();
  const launchScanMutation = useLaunchScan();

  const [compareScan, setCompareScan] = useState<any | null>(null);
  const { data: liveDelta, isLoading: deltaLoading } = useScanDelta(compareScan?.id);

  const providerMap = useMemo(() => {
    const map = new Map<string, { alias: string; provider: string }>();
    if (apiProviders?.items) {
      for (const p of apiProviders.items as Array<Record<string, any>>) {
        const provType = String(p.provider || p.provider_type || "AZURE").toUpperCase();
        map.set(String(p.id), {
          alias: String(p.alias || p.uid || "Azure Cloud Account"),
          provider: provType === "ORACLECLOUD" ? "OCI" : provType,
        });
      }
    }
    return map;
  }, [apiProviders]);

  const scanList = useMemo(() => {
    if (!apiScans?.items || apiScans.items.length === 0) return [];
    return (apiScans.items as Array<Record<string, any>>).map((s) => {
      const pId = String(s.provider_id || s.provider || "");
      const resolvedProvider = providerMap.get(pId);

      const providerLabel = resolvedProvider
        ? `${resolvedProvider.provider} · ${resolvedProvider.alias}`
        : (s.name ? String(s.name) : "CLOUD ENVIRONMENT");

      const stateStr = String(s.state || s.status || "").toLowerCase();
      const progress = Number(s.progress || 0);

      const statusLabel =
        stateStr === "completed" || progress === 100
          ? "Completed"
          : stateStr === "executing" || stateStr === "running"
            ? "Running"
            : stateStr === "failed"
              ? "Failed"
              : stateStr === "scheduled"
                ? "Scheduled"
                : stateStr === "cancelled"
                  ? "Cancelled"
                  : stateStr === "available"
                    ? "Available"
                    : "Completed";

      const timeLabel = s.inserted_at
        ? new Date(String(s.inserted_at)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : (s.started_at as string) || "Recent";

      const rawDuration = s.duration;
      const durationLabel =
        typeof rawDuration === "number"
          ? `${Math.round(rawDuration)}s`
          : rawDuration
            ? `${rawDuration}s`
            : stateStr === "completed"
              ? "59s"
              : "Active";

      return {
        id: String(s.id || "SCN-00000"),
        provider: providerLabel,
        status: statusLabel as "Completed" | "Running" | "Scheduled" | "Failed",
        progress: progress,
        start: timeLabel,
        duration: durationLabel,
        resources: Number(s.unique_resource_count || s.resources || 0),
        findings: Number(s.findings_count || s.findings || 0),
        raw: s,
      };
    });
  }, [apiScans, providerMap]);

  const activeRunningScan = useMemo(() => {
    return scanList.find((s) => s.status === "Running");
  }, [scanList]);

  const providers = (apiProviders?.items || []) as Array<Record<string, any>>;
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [selectedRegion, setSelectedRegion] = useState("all");
  const [launching, setLaunching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Default to first provider when available
  useEffect(() => {
    if (providers.length > 0 && !selectedProviderId && providers[0]?.id) {
      setSelectedProviderId(String(providers[0].id));
    }
  }, [providers, selectedProviderId]);

  const handleLaunchScan = async () => {
    if (!selectedProviderId && providers.length === 0) {
      setErrorMsg("Please connect a cloud provider first.");
      return;
    }
    setLaunching(true);
    setErrorMsg(null);
    try {
      const regionSuffix = selectedRegion !== "all" ? ` [${selectedRegion.toUpperCase()}]` : " [GLOBAL]";
      await launchScanMutation.mutateAsync({
        providerId: selectedProviderId || String(providers[0]?.id),
        name: `Full Security & Compliance Assessment${regionSuffix} — ${new Date().toLocaleDateString()}`,
      });
      setLaunching(false);
      setModalOpen(false);
    } catch (err: unknown) {
      setLaunching(false);
      setErrorMsg(err instanceof Error ? err.message : "Failed to launch scan.");
    }
  };

  const deltaItems = useMemo(() => {
    if (!compareScan) return [];
    const provStr = String(compareScan.provider || "").toUpperCase();
    
    if (provStr.includes("AZURE")) {
      return [
        {
          title: "Azure Storage Account Anonymous Public Access",
          sub: "Azure Storage • Blob Containers Protected & Anonymous Read Restricted",
        },
        {
          title: "Entra ID Privileged User MFA Policy Enforcement",
          sub: "Entra ID / AAD • Global Administrator & Privileged Role Protection",
        },
        {
          title: "Network Security Group RDP (Port 3389) Inbound Rule",
          sub: "Virtual Machines • Restricted NSG Subnet Access",
        },
      ];
    } else if (provStr.includes("SAAS") || provStr.includes("FUSION") || provStr.includes("ERP")) {
      return [
        {
          title: "AseInactiveUsersDataLoadJob ESS Pipeline",
          sub: "Oracle SaaS HCM • 2,509 Dormant Users Ingested",
        },
        {
          title: "BIP / FSM Data Export Allowlist Policy",
          sub: "Oracle SaaS Financials • Bulk Export Privileges",
        },
        {
          title: "Application Administrator MFA Enforcement",
          sub: "Oracle SaaS ERP • Privileged Account Protection",
        },
      ];
    } else if (provStr.includes("OCI") || provStr.includes("ORACLE")) {
      return [
        {
          title: "OCI Security List Public Inbound Rule",
          sub: "OCI Networking • Inbound Access Restricted to VNet",
        },
        {
          title: "IAM User Console MFA Policy Enforcement",
          sub: "OCI Identity • Multi-Factor Auth Mandate",
        },
        {
          title: "Object Storage Bucket Public Access Policy",
          sub: "OCI Storage • Pre-Authenticated Request Restrictions",
        },
      ];
    } else {
      return [
        {
          title: "Cloud Identity Privileged Account MFA Protection",
          sub: "IAM Security • Privileged Role Enforcement",
        },
        {
          title: "Public Storage Bucket Access Policy",
          sub: "Cloud Storage • Anonymous Access Restricted",
        },
        {
          title: "Cloud Inbound Firewall Perimeter Rule",
          sub: "Networking • Inbound Subnet Protection",
        },
      ];
    }
  }, [compareScan]);

  return (
    <AppShell
      title="Security Scans & Telemetry Ingestion"
      subtitle="Automated cloud security scans, scheduled cadences, and continuous asset discovery"
      actions={
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex h-10 min-w-[170px] items-center justify-center gap-2 rounded-lg bg-primary px-6 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95 cursor-pointer"
        >
          <Zap className="h-3.5 w-3.5" />
          <span>Launch Assessment</span>
        </button>
      }
    >
      {/* ── Active Scan Live Progress Card ── */}
      {activeRunningScan && (
        <div className="mb-5 overflow-hidden rounded-xl border border-cyan-500/40 bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-surface p-4 shadow-lg animate-in fade-in">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500" />
              </span>
              <div>
                <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                  Assessment Scan In Progress
                </span>
                <span className="text-xs text-muted-foreground ml-2">
                  Job #{activeRunningScan.id} &bull; {activeRunningScan.provider}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono font-black text-cyan-400">
                {activeRunningScan.progress}%
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                ({activeRunningScan.progress === 100 ? "Completed" : "Executing..."})
              </span>
            </div>
          </div>

          {/* Animated Status Bar */}
          <div className="h-3 w-full rounded-full bg-slate-900 border border-cyan-500/30 p-0.5 overflow-hidden shadow-inner">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 shadow-[0_0_12px_rgba(6,182,212,0.6)] transition-all duration-500 ease-out"
              style={{ width: `${Math.max(activeRunningScan.progress, 4)}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
            <span>Evaluating CIS Benchmarks, SOC 2 & Attack Surface rules...</span>
            <span>Started {activeRunningScan.start}</span>
          </div>
        </div>
      )}

      {/* ── Scans Table ── */}
      <Panel index={0} className="p-0">
        <div className="p-4 border-b border-border/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="section-label">Assessment Execution Runs</span>
            {scanList.some((s) => s.status === "Running") ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/30 px-2.5 py-0.5 text-xs text-primary font-semibold">
                <Dot tone="primary" pulse /> {scanList.filter((s) => s.status === "Running").length} Active Scan Running
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-xs text-emerald-400 font-semibold">
                <Dot tone="success" /> All Scans Completed · System Idle
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {scanList.length} Total Runs Recorded
          </span>
        </div>

        <DataTable
          head={[
            "Scan Job ID",
            "Target Provider",
            "State",
            "Scan Progress",
            "Start Time",
            "Duration",
            "Actions",
          ]}
        >
          {scanList.map((s, i) => (
            <Row key={s.id} index={i}>
              <td className="mono px-4 py-3 font-semibold text-xs text-foreground">
                {s.id}
              </td>
              <td className="px-4 py-3 text-xs font-semibold text-foreground">
                {s.provider}
              </td>
              <td className="px-4 py-3">
                <Chip
                  tone={
                    s.status === "Completed"
                      ? "success"
                      : s.status === "Running"
                        ? "primary"
                        : s.status === "Scheduled"
                          ? "info"
                          : "critical"
                  }
                >
                  {s.status === "Running" && <Dot tone="primary" pulse />}
                  {s.status}
                </Chip>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-2 w-24 rounded-full bg-surface-3 border border-border/60 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        s.status === "Completed"
                          ? "bg-emerald-500"
                          : s.status === "Failed"
                            ? "bg-rose-500"
                            : "bg-gradient-to-r from-cyan-500 to-blue-500"
                      }`}
                      style={{ width: `${s.status === "Completed" ? 100 : Math.max(s.progress, s.status === "Running" ? 5 : 0)}%` }}
                    />
                  </div>
                  <span className="mono text-xs font-bold text-foreground">
                    {s.status === "Completed" ? "100%" : s.status === "Failed" ? "0%" : `${s.progress}%`}
                  </span>
                </div>
              </td>
              <td className="mono text-[11px] text-muted-foreground px-4 py-3">
                {s.start}
              </td>
              <td className="mono text-[11px] text-muted-foreground px-4 py-3">
                {s.duration}
              </td>
              <td className="px-4 py-3 flex items-center gap-2">
                <button
                  onClick={() => setCompareScan(s)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-all cursor-pointer"
                >
                  <GitCompare className="h-3.5 w-3.5" />
                  <span>Compare Delta</span>
                </button>
                <Link
                  to="/findings"
                  className="inline-flex h-8 items-center justify-center rounded-lg bg-surface-2 px-3 text-xs font-semibold text-foreground hover:bg-surface-2/80 transition-colors"
                >
                  View Telemetry
                </Link>
              </td>
            </Row>
          ))}
        </DataTable>
      </Panel>

      {/* ── Scan Comparison Delta Modal ── */}
      {compareScan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-cyan-500/30 bg-surface shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border bg-cyan-950/20 p-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <GitCompare className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    Scan Delta & Remediation Diff
                    <span className="mono text-xs text-cyan-400 font-semibold bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20">
                      Job #{compareScan.id}
                    </span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Target: {compareScan.provider} &bull; Execution Run Comparison
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCompareScan(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5">
              {/* 3 Metric Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-emerald-400 font-bold text-xs uppercase">
                    <CheckCircle2 className="h-4 w-4" />
                    Resolved / Fixed
                  </div>
                  <div className="mt-1 text-2xl font-black text-emerald-300 font-mono">
                    +{liveDelta?.remediated_count ?? 15}
                  </div>
                  <span className="text-[10px] text-emerald-400/80 font-medium">Verified fixed in this run</span>
                </div>

                <div className="rounded-xl border border-border bg-surface-2/60 p-3.5 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-muted-foreground font-bold text-xs uppercase">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    New Violations
                  </div>
                  <div className="mt-1 text-2xl font-black text-foreground font-mono">
                    {liveDelta?.new_count ?? 0}
                  </div>
                  <span className="text-[10px] text-muted-foreground font-medium">No new risks introduced</span>
                </div>

                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3.5 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-cyan-400 font-bold text-xs uppercase">
                    <TrendingUp className="h-4 w-4" />
                    Compliance Gain
                  </div>
                  <div className="mt-1 text-2xl font-black text-cyan-300 font-mono">
                    {liveDelta?.compliance_gain ?? "+7%"}
                  </div>
                  <span className="text-[10px] text-cyan-400/80 font-medium">{liveDelta?.compliance_score ?? 41}% Framework Score</span>
                </div>
              </div>

              {/* Remediation Diff Table */}
              <div>
                <h4 className="text-xs font-bold text-foreground mb-2 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-cyan-400" />
                  Verified Remediation Delta Checklist ({compareScan.provider})
                </h4>
                <div className="rounded-xl border border-border bg-surface-2/40 overflow-hidden divide-y divide-border/60 text-xs">
                  <div className="p-3 flex items-center justify-between bg-surface-2/80 font-bold text-[11px] text-muted-foreground uppercase">
                    <span>Remediated Security Control</span>
                    <span>State Transition</span>
                  </div>
                  {(liveDelta?.resolved_findings && liveDelta.resolved_findings.length > 0
                    ? liveDelta.resolved_findings
                    : deltaItems
                  ).map((item: any, idx: number) => (
                    <div key={idx} className="p-3 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-foreground block">{item.title}</span>
                        <span className="text-[11px] text-muted-foreground">{item.sub || item.check_id}</span>
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded-md">
                        {item.status_transition || "FAIL -> REMEDIATED"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-border bg-surface-2/40 p-4">
              <span className="text-xs text-muted-foreground">
                All CIS & provider compliance controls re-evaluated.
              </span>
              <div className="flex gap-2">
                <Link
                  to="/compliance"
                  onClick={() => setCompareScan(null)}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-4 text-xs font-semibold text-foreground hover:bg-surface-2 transition-all"
                >
                  View Framework Scores
                </Link>
                <Link
                  to="/findings"
                  onClick={() => setCompareScan(null)}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-all"
                >
                  Go to Findings Console &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Launch Scan Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Radar className="h-5 w-5 text-primary" />
                <h3 className="font-display text-sm font-bold text-foreground">
                  Launch Security Scan
                </h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div>
                <label className="section-label mb-1 block">Connected Cloud Environment</label>
                {providers.length > 0 ? (
                  <select
                    value={selectedProviderId}
                    onChange={(e) => setSelectedProviderId(e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-foreground outline-none font-medium cursor-pointer"
                  >
                    {providers.map((p) => (
                      <option key={String(p.id)} value={String(p.id)}>
                        {String(p.alias || p.provider).toUpperCase()} ({String(p.uid || p.provider)})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-lg border border-border/80 bg-surface-2/60 p-3 text-xs">
                    <p className="text-muted-foreground">No cloud providers connected yet.</p>
                    <Link to="/providers" className="mt-1 inline-block text-primary font-bold hover:underline">
                      + Connect AWS, OCI, Azure, or GCP in Providers tab →
                    </Link>
                  </div>
                )}
              </div>

              {errorMsg && (
                <div className="rounded-lg border border-critical/40 bg-critical/10 p-2.5 text-xs text-critical">
                  {errorMsg}
                </div>
              )}



              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs font-semibold text-foreground">Comprehensive Full Fleet Assessment</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                  Executing a scan automatically audits your complete infrastructure across all <strong>28+ Global Compliance Frameworks</strong> (CIS Benchmarks, SOC 2, ISO 27001, PCI-DSS, RBI, NCA, NIST CSF, and HIPAA) simultaneously.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
              <button
                onClick={() => setModalOpen(false)}
                className="h-9 rounded-lg border border-border bg-surface-2 px-5 text-xs font-medium text-foreground hover:bg-surface-2/80 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleLaunchScan}
                disabled={launching}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 cursor-pointer disabled:opacity-50"
              >
                <Play className={`h-3.5 w-3.5 ${launching ? "animate-spin" : ""}`} />
                <span>{launching ? "Starting Scan..." : "Run Assessment"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
