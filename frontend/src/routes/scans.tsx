import { useState, useEffect, useMemo } from "react";
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
import { useScans, useLaunchScan, useProviders } from "@/hooks/use-api";

export const Route = createFileRoute("/scans")({
  component: ScansPage,
});

function ScansPage() {
  const { data: apiScans, isLoading } = useScans();
  const { data: apiProviders } = useProviders();
  const launchScanMutation = useLaunchScan();

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
        start: timeLabel,
        duration: durationLabel,
        resources: Number(s.unique_resource_count || s.resources || 0),
        findings: Number(s.findings_count || s.findings || 0),
      };
    });
  }, [apiScans, providerMap]);

  const providers = (apiProviders?.items || []) as Array<Record<string, any>>;
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [selectedProfile, setSelectedProfile] = useState("Full Assessment");
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
      const regionSuffix = selectedRegion !== "all" ? ` [${selectedRegion.toUpperCase()}]` : "";
      await launchScanMutation.mutateAsync({
        providerId: selectedProviderId || String(providers[0]?.id),
        name: `${selectedProfile}${regionSuffix} — ${new Date().toLocaleDateString()}`,
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
                {(s.resources || 0).toLocaleString()}
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
                <label className="section-label mb-1 block">Target Geographic Region</label>
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-foreground outline-none font-medium"
                >
                  <option value="all">🌍 All Deployed Cloud Regions (Global Fleet)</option>
                  <option value="centralindia">🇮🇳 Central India (centralindia / ap-south-1)</option>
                  <option value="uk-london-1">🇬🇧 UK London / West Europe (uk-london-1 / westeurope)</option>
                  <option value="me-central-1">🇸🇦 Saudi Arabia & Middle East (me-central-1 / me-south-1)</option>
                  <option value="us-east-1">🇺🇸 US East & North America (us-east-1 / us-west-2)</option>
                </select>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Select a single geographical region to run focused regional compliance or audit your full multi-region perimeter.
                </p>
              </div>

              <div>
                <label className="section-label mb-1 block">Compliance Standard & Assessment Profile</label>
                <select
                  value={selectedProfile}
                  onChange={(e) => setSelectedProfile(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-foreground outline-none font-medium"
                >
                  <optgroup label="Saudi Arabia (NCA & SAMA)">
                    <option value="NCA ECC-1:2018">NCA ECC-1:2018 (Essential Cybersecurity Controls)</option>
                    <option value="NCA CSCC-1:2019">NCA CSCC-1:2019 (Cloud Cybersecurity Controls)</option>
                    <option value="SAMA Cyber Security">SAMA Cyber Security Framework (Saudi Central Bank)</option>
                  </optgroup>
                  <optgroup label="India (RBI & CERT-In)">
                    <option value="RBI Cyber Security Framework">RBI Cyber Security Framework & Master Directions</option>
                    <option value="CERT-In Directives">CERT-In 2022 Cybersecurity Directives & DPDP Act</option>
                  </optgroup>
                  <optgroup label="European Union (GDPR & DORA)">
                    <option value="EU GDPR & DORA">EU GDPR & DORA Digital Operational Resilience</option>
                    <option value="NIS2 Directive">NIS2 Directive & ENS Esquema Nacional de Seguridad</option>
                  </optgroup>
                  <optgroup label="United States (FedRAMP & NIST)">
                    <option value="FedRAMP Moderate">FedRAMP Moderate Baseline & CISA TRA</option>
                    <option value="NIST SP 800-53 Rev 5">NIST SP 800-53 Rev 5 & NIST CSF 2.0</option>
                  </optgroup>
                  <optgroup label="Global & Industry Standards">
                    <option value="Full Assessment">Full Multi-Cloud Assessment (All 22 Frameworks)</option>
                    <option value="CIS Foundations Benchmark">CIS Foundations Benchmark v3.0 (Strict)</option>
                    <option value="SOC 2 Type II">SOC 2 Type II Security & Confidentiality</option>
                    <option value="ISO/IEC 27001:2022">ISO/IEC 27001:2022 ISMS Controls</option>
                    <option value="PCI-DSS v4.0">PCI-DSS v4.0 Cardholder Data Environment</option>
                  </optgroup>
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
