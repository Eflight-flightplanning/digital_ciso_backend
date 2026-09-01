import { useState, useEffect, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
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
  RefreshCw,
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

/** Ticks once a second so the "connecting" phase visibly counts up instead of
 * looking frozen while there's no real percentage to report yet. */
function useElapsedSeconds(startIso: string | undefined | null): number {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (!startIso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startIso]);
  if (!startIso || now === null) return 0;
  const startMs = new Date(startIso).getTime();
  if (Number.isNaN(startMs)) return 0;
  return Math.max(0, Math.floor((now - startMs) / 1000));
}

function ScansPage() {
  const queryClient = useQueryClient();
  const { data: apiScans, isLoading, refetch } = useScans();
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
    const items = apiScans.items as Array<Record<string, any>>;

    // A scan with no dispatched work yet ("available") sitting behind another scan that's
    // actively executing for the same provider is queued, not stuck — surface that instead
    // of the generic "Available" label, which previously fell through to a red/critical chip.
    const executingProviderIds = new Set(
      items
        .filter((s) => String(s.state || "").toLowerCase() === "executing")
        .map((s) => String(s.provider_id || s.provider || ""))
    );

    return items.map((s) => {
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
                  : stateStr === "available" && executingProviderIds.has(pId)
                    ? "Queued"
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
              ? "—"
              : "Active";

      return {
        id: String(s.id || "SCN-00000"),
        provider: providerLabel,
        status: statusLabel as "Completed" | "Running" | "Scheduled" | "Failed" | "Queued" | "Cancelled" | "Available",
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

  const activeScanStartedAt = (activeRunningScan?.raw as Record<string, unknown> | undefined)?.started_at as string | undefined;
  const activeScanElapsedSeconds = useElapsedSeconds(activeRunningScan ? activeScanStartedAt : null);

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


  return (
    <AppShell
      title="Security Scans & Telemetry Ingestion"
      subtitle="Automated cloud security scans, scheduled cadences, and continuous asset discovery"
      actions={
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["scans"] });
              refetch();
            }}
            title="Refresh scan history"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-surface-2 px-4 text-xs font-semibold text-foreground shadow-sm hover:bg-surface-3 active:scale-95 transition-all cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex h-10 min-w-[170px] items-center justify-center gap-2 rounded-lg bg-primary px-6 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95 cursor-pointer"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>Launch Assessment</span>
          </button>
        </div>
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
                {activeRunningScan.progress < 10
                  ? `${activeScanElapsedSeconds}s`
                  : `${activeRunningScan.progress}%`}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                ({activeRunningScan.progress >= 100
                  ? "Completed"
                  : activeRunningScan.progress >= 95
                    ? "Finalizing & Scoring..."
                    : activeRunningScan.progress >= 10
                      ? "Executing Checks..."
                      : "Connecting & Authenticating..."})
              </span>
            </div>
          </div>

          {/* Animated Status Bar — during connection there is no real percentage yet
              (see backend note above), so an indeterminate sweep honestly signals
              "still working" instead of a static bar that looks frozen. */}
          <div className="h-3.5 w-full rounded-full bg-slate-900 border border-cyan-500/30 p-0.5 overflow-hidden shadow-inner relative">
            {activeRunningScan.progress < 10 ? (
              <div className="absolute inset-0.5 rounded-full overflow-hidden">
                <div className="absolute inset-y-0 rounded-full bg-gradient-to-r from-cyan-600 via-sky-400 to-cyan-600 shadow-[0_0_12px_rgba(6,182,212,0.6)] animate-[indeterminate-sweep_1.4s_ease-in-out_infinite]" />
              </div>
            ) : (
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-sky-400 to-indigo-500 shadow-[0_0_12px_rgba(6,182,212,0.6)] transition-all duration-700 ease-out relative overflow-hidden"
                style={{ width: `${Math.max(activeRunningScan.progress, 5)}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
              </div>
            )}
          </div>
          <div className="mt-2 flex justify-between text-[11.5px]">
            <span className="text-cyan-300 font-medium flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3 animate-spin text-cyan-400" />
              {activeRunningScan.progress < 10
                ? `Connecting to Cloud API & authenticating (${activeScanElapsedSeconds}s elapsed)...`
                : activeRunningScan.progress >= 95
                  ? "Finalizing compliance scoring & attack graph delta..."
                  : `Evaluating CIS Benchmarks & security controls (${activeRunningScan.progress}% complete)...`}
            </span>
            <span className="text-muted-foreground font-mono text-[11px]">Started {activeRunningScan.start}</span>
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
                          : s.status === "Queued"
                            ? "medium"
                            : s.status === "Cancelled" || s.status === "Available"
                              ? "neutral"
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
                    {s.status === "Completed" ? "100%" : s.status === "Failed" ? "Failed" : `${s.progress}%`}
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
                  disabled={s.status !== "Completed"}
                  title={s.status !== "Completed" ? "Delta comparison is available once this scan completes" : undefined}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-cyan-500/10"
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
                    +{liveDelta?.remediated_count ?? 0}
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
                    {liveDelta?.compliance_gain ?? "0%"}
                  </div>
                  <span className="text-[10px] text-cyan-400/80 font-medium">{liveDelta?.compliance_score ?? 0}% Framework Score</span>
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
                  {deltaLoading ? (
                    <div className="p-6 text-center text-muted-foreground">Loading real delta…</div>
                  ) : liveDelta?.resolved_findings && liveDelta.resolved_findings.length > 0 ? (
                    liveDelta.resolved_findings.map((item: any, idx: number) => (
                      <div key={idx} className="p-3 flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-foreground block">{item.title}</span>
                          <span className="text-[11px] text-muted-foreground">{item.sub || item.check_id}</span>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded-md">
                          {item.status_transition || "FAIL -> REMEDIATED"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-muted-foreground">
                      No controls were remediated between this run and the previous completed scan for this provider.
                    </div>
                  )}
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
