import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Radar,
  Play,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  DataTable,
  Row,
  Chip,
  Dot,
} from "@/components/ui-kit/primitives";
import { scans as initialScans } from "@/lib/mock";
import { useScans, useLaunchScan, useProviders } from "@/hooks/use-api";

export const Route = createFileRoute("/scans")({
  component: ScansPage,
});

function ScansPage() {
  const { data: apiScans, isLoading } = useScans();
  const { data: apiProviders } = useProviders();
  const launchScanMutation = useLaunchScan();

  const scanList = (apiScans?.items && apiScans.items.length > 0)
    ? (apiScans.items as Array<Record<string, unknown>>).map((s) => ({
        id: (s.id as string) || "SCN-00000",
        provider: ((s.provider_alias as string) || (s.provider as string) || "AWS").toUpperCase(),
        status: (s.state === "EXECUTING" || s.status === "RUNNING"
          ? "Running"
          : s.state === "COMPLETED" || s.status === "COMPLETED"
            ? "Completed"
            : s.state === "FAILED"
              ? "Failed"
              : "Scheduled") as "Completed" | "Running" | "Scheduled" | "Failed",
        start: (s.started_at as string) || "Recent",
        duration: (s.duration as string) || "02m 15s",
        resources: (s.unique_resources_count as number) || (s.resources as number) || 0,
        findings: (s.findings_count as number) || (s.findings as number) || 0,
      }))
    : [];

  const providers = (apiProviders?.items || []) as Array<Record<string, unknown>>;
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [selectedProfile, setSelectedProfile] = useState("Full Assessment");
  const [launching, setLaunching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Default to first provider when available
  useEffect(() => {
    if (providers.length > 0 && !selectedProviderId) {
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
      await launchScanMutation.mutateAsync({
        providerId: selectedProviderId || String(providers[0]?.id),
        name: `${selectedProfile} — ${new Date().toLocaleDateString()}`,
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
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex h-10 min-w-[170px] items-center justify-center gap-2 rounded-lg bg-primary px-6 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
        >
          <Zap className="h-3.5 w-3.5" />
          <span>Launch Assessment</span>
        </button>
      }
    >
      {/* ── Scans Table ── */}
      <Panel index={0} className="p-0">
        <div className="p-4 border-b border-border/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="section-label">Assessment Execution Runs</span>
            <span className="inline-flex items-center gap-1 text-xs text-primary font-semibold">
              <Dot tone="primary" pulse /> {scanList.filter((s) => s.status === "Running").length} Active Scan
            </span>
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
            "Start Time",
            "Duration",
            "Assets Ingested",
            "Findings Detected",
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
              <td className="mono text-[11px] text-muted-foreground px-4 py-3">
                {s.start}
              </td>
              <td className="mono text-[11px] text-muted-foreground px-4 py-3">
                {s.duration}
              </td>
              <td className="mono text-xs font-semibold text-foreground px-4 py-3">
                {(s.resources ?? s.findings_discovered ?? 0).toLocaleString()}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`mono text-xs font-bold ${
                    s.findings > 0 ? "text-critical" : "text-success"
                  }`}
                >
                  {s.findings}
                </span>
              </td>
              <td className="px-4 py-3">
                <Link
                  to="/findings"
                  className="inline-flex h-8 items-center justify-center rounded-lg bg-surface-2 px-3.5 text-xs font-semibold text-foreground hover:bg-surface-2/80 transition-colors"
                >
                  View Telemetry
                </Link>
              </td>
            </Row>
          ))}
        </DataTable>
      </Panel>

      {/* ── Launch Scan Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Radar className="h-5 w-5 text-primary" />
                <h3 className="font-display text-sm font-bold text-foreground">
                  Launch Security Scan
                </h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
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
                    className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-foreground outline-none"
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

              <div>
                <label className="section-label mb-1 block">Assessment Profile</label>
                <select
                  value={selectedProfile}
                  onChange={(e) => setSelectedProfile(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-foreground outline-none"
                >
                  <option value="Full Assessment">Full Multi-Cloud Assessment (All Checks)</option>
                  <option value="CIS Benchmark">CIS Foundations Benchmark Strict</option>
                  <option value="SOC 2 Fast">SOC 2 Rapid Compliance Audit</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
              <button
                onClick={() => setModalOpen(false)}
                className="h-9 rounded-lg border border-border bg-surface-2 px-5 text-xs font-medium text-foreground hover:bg-surface-2/80"
              >
                Cancel
              </button>
              <button
                onClick={handleLaunchScan}
                disabled={launching}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
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
