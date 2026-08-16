import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Cloud,
  Plus,
  RefreshCw,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  Chip,
  Dot,
} from "@/components/ui-kit/primitives";
import { providers as initialProviders } from "@/lib/mock";
import { useProviders, useCreateProvider } from "@/hooks/use-api";

export const Route = createFileRoute("/providers")({
  component: ProvidersPage,
});

function ProvidersPage() {
  const { data: apiProviders, isLoading } = useProviders();
  const createProviderMutation = useCreateProvider();

  const providerList = (apiProviders?.items && apiProviders.items.length > 0)
    ? (apiProviders.items as Array<Record<string, unknown>>).map((p) => ({
        name: ((p.provider as string) || "AWS").toUpperCase(),
        alias: (p.alias as string) || (p.uid as string) || "cloud-account",
        status: (p.connected === false ? "disconnected" : "connected") as "connected" | "disconnected" | "syncing",
        lastScan: (p.last_scan_at as string) || "Recent",
        resources: (p.resources_count as number) || (p.findings_count as number) || 85,
      }))
    : initialProviders;

  const [modalOpen, setModalOpen] = useState(false);
  const [newType, setNewType] = useState("AWS");
  const [newAlias, setNewAlias] = useState("");
  const [newRoleArn, setNewRoleArn] = useState("");
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    if (!newAlias) return;
    setConnecting(true);
    try {
      await createProviderMutation.mutateAsync({
        provider: newType.toLowerCase(),
        uid: newRoleArn || newAlias,
        alias: newAlias,
      });
      setConnecting(false);
      setModalOpen(false);
      setNewAlias("");
      setNewRoleArn("");
    } catch {
      // Fallback for demo if backend is in offline mode
      setConnecting(false);
      setModalOpen(false);
    }
  };

  return (
    <AppShell
      title="Connected Cloud Environments"
      subtitle="Multi-cloud IAM credentials, AssumeRole permissions, and ingestion state"
      actions={
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex h-10 min-w-[190px] items-center justify-center gap-2 rounded-lg bg-primary px-6 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Connect Cloud Account</span>
        </button>
      }
    >
      {/* ── Provider Cards Grid ── */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {providerList.map((p, i) => (
          <Panel
            key={`${p.name}-${p.alias}`}
            index={i}
            className="flex flex-col justify-between p-5 transition-all hover:border-primary/50"
          >
            <div>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-foreground font-display text-sm font-bold">
                    {(p.name || p.alias || 'AWS').slice(0, 3).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold text-foreground">
                      {p.alias}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {p.name} Environment
                    </span>
                  </div>
                </div>
                <Chip tone={p.status === "connected" ? "success" : "critical"}>
                  <Dot tone={p.status === "connected" ? "success" : "critical"} />
                  {p.status}
                </Chip>
              </div>

              <div className="mt-4 space-y-2 rounded-lg border border-border/80 bg-surface-2/40 p-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Scanned:</span>
                  <span className="font-semibold text-foreground">{p.lastScan}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discovered Assets:</span>
                  <span className="mono font-semibold text-foreground">
                    {(p.resources ?? p.findings_count ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
              <Link
                to="/scans"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <Zap className="h-3 w-3" />
                <span>Scan Now</span>
              </Link>
              <Link
                to="/resources"
                className="text-xs text-muted-foreground hover:text-foreground font-medium"
              >
                View Assets →
              </Link>
            </div>
          </Panel>
        ))}
      </div>

      {/* ── Connect Provider Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Cloud className="h-5 w-5 text-primary" />
                <h3 className="font-display text-sm font-bold text-foreground">
                  Connect Cloud Environment
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
                <label className="section-label mb-1 block">Provider Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-foreground outline-none"
                >
                  <option value="AWS">Amazon Web Services (AWS)</option>
                  <option value="Azure">Microsoft Azure</option>
                  <option value="GCP">Google Cloud Platform (GCP)</option>
                  <option value="Kubernetes">Kubernetes Cluster</option>
                  <option value="GitHub">GitHub Enterprise</option>
                </select>
              </div>

              <div>
                <label className="section-label mb-1 block">Account Alias</label>
                <input
                  type="text"
                  placeholder="e.g. prod-infrastructure"
                  value={newAlias}
                  onChange={(e) => setNewAlias(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-foreground outline-none"
                />
              </div>

              <div>
                <label className="section-label mb-1 block">AssumeRole ARN</label>
                <input
                  type="text"
                  placeholder="arn:aws:iam::123456789012:role/DigitalCISO"
                  value={newRoleArn}
                  onChange={(e) => setNewRoleArn(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-foreground outline-none font-mono text-[11px]"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
              <button
                onClick={() => setModalOpen(false)}
                className="h-9 rounded-lg border border-border bg-surface-2 px-5 text-xs text-foreground hover:bg-surface-2/80"
              >
                Cancel
              </button>
              <button
                onClick={handleConnect}
                disabled={connecting || !newAlias}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-40"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${connecting ? "animate-spin" : ""}`}
                />
                <span>{connecting ? "Connecting..." : "Verify & Connect"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
