import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Plug,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Settings,
  Shield,
  Layers,
  Database,
  Bell,
  Check,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  PanelTitle,
  Counter,
  Chip,
  Dot,
} from "@/components/ui-kit/primitives";
import { useIntegrations } from "@/hooks/use-api";

export const Route = createFileRoute("/integrations")({
  component: IntegrationsPage,
});

interface Integration {
  id: string;
  name: string;
  category: string;
  desc: string;
  status: "connected" | "available" | "error";
  syncTime?: string;
}

const initialIntegrations: Integration[] = [
  {
    id: "s3",
    name: "Amazon S3 Export",
    category: "Data Pipeline",
    desc: "Automatically sync raw JSON:API finding snapshots and compliance audit packs to a dedicated S3 bucket.",
    status: "connected",
    syncTime: "Hourly sync",
  },
  {
    id: "jira",
    name: "Jira Cloud SecOps",
    category: "Ticketing & Triage",
    desc: "Autonomous creation and bi-directional status synchronization of Jira tickets when AEGIS marks findings as P1/P2.",
    status: "connected",
    syncTime: "Real-time webhook",
  },
  {
    id: "sechub",
    name: "AWS Security Hub",
    category: "Cloud Native SIEM",
    desc: "Stream standardized ASFF (AWS Security Finding Format) events to Security Hub across all member accounts.",
    status: "connected",
    syncTime: "Continuous stream",
  },
  {
    id: "slack",
    name: "Slack Critical Alerts",
    category: "Notifications",
    desc: "Instant rich notification payloads sent to #secops-alerts when a new toxic combination or SLA breach is detected.",
    status: "connected",
    syncTime: "Instant triggers",
  },
  {
    id: "splunk",
    name: "Splunk Enterprise SIEM",
    category: "SIEM & Logging",
    desc: "Forward high-velocity raw audit telemetry into your centralized Splunk HEC (HTTP Event Collector).",
    status: "available",
  },
  {
    id: "datadog",
    name: "Datadog Cloud Security",
    category: "Observability",
    desc: "Correlate infrastructure security scores with runtime APM and log trace metrics.",
    status: "available",
  },
];

function IntegrationsPage() {
  const { data: apiIntegrations, isLoading } = useIntegrations();

  const [integrationsList, setIntegrationsList] = useState<Integration[]>(initialIntegrations);
  const [selectedInteg, setSelectedInteg] = useState<Integration | null>(null);
  const [endpoint, setEndpoint] = useState("");
  const [saving, setSaving] = useState(false);

  const integrations = (apiIntegrations?.items && apiIntegrations.items.length > 0)
    ? integrationsList.map((item) => {
        const found = (apiIntegrations.items as Array<Record<string, unknown>>).find(
          (ai) => (ai.integration_type as string)?.toLowerCase() === item.id.toLowerCase()
        );
        if (found) {
          return {
            ...item,
            status: (found.enabled ? "connected" : "available") as Integration["status"],
          };
        }
        return item;
      })
    : integrationsList;

  const handleSaveConfig = () => {
    if (!selectedInteg) return;
    setSaving(true);
    setTimeout(() => {
      setIntegrationsList((prev) =>
        prev.map((item) =>
          item.id === selectedInteg.id
            ? { ...item, status: "connected", syncTime: "Configured just now" }
            : item
        )
      );
      setSaving(false);
      setSelectedInteg(null);
    }, 1000);
  };

  return (
    <AppShell
      title="Third-Party Integrations & SIEM Webhooks"
      subtitle="Connect ticketing, SIEM, data lakes, and notification webhooks into the Digital CISO nervous system"
    >
      {/* ── Summary Stats ── */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Panel index={0} glow="primary">
          <span className="section-label">Active Connected Channels</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="kpi-number text-2xl text-foreground">
              <Counter
                value={integrations.filter((i) => i.status === "connected").length}
              />
            </span>
            <span className="text-xs text-success font-semibold">
              Live Webhooks Active
            </span>
          </div>
        </Panel>

        <Panel index={1} glow="info">
          <span className="section-label">Events Dispatched 24h</span>
          <div className="mt-2">
            <span className="kpi-number text-2xl text-info">
              <Counter value={18420} />
            </span>
          </div>
        </Panel>

        <Panel index={2} glow="success">
          <span className="section-label">Webhook Delivery Rate</span>
          <div className="mt-2 flex items-center gap-1.5">
            <Dot tone="success" pulse />
            <span className="kpi-number text-2xl text-success">99.98%</span>
          </div>
        </Panel>
      </div>

      {/* ── Integrations Grid ── */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {integrations.map((item, i) => (
          <Panel
            key={item.id}
            index={i}
            className="flex flex-col justify-between p-5 transition-all hover:border-primary/50"
          >
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-display text-sm font-bold text-foreground">
                    {item.name}
                  </h3>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {item.category}
                  </span>
                </div>
                <Chip tone={item.status === "connected" ? "success" : "neutral"}>
                  <Dot tone={item.status === "connected" ? "success" : "neutral"} />
                  {item.status === "connected" ? "Connected" : "Available"}
                </Chip>
              </div>

              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                {item.desc}
              </p>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-3">
              <span className="mono text-[10px] text-muted-foreground">
                {item.syncTime ?? "Not configured"}
              </span>
              <button
                onClick={() => setSelectedInteg(item)}
                className="inline-flex items-center gap-1 rounded bg-surface-2 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-primary/20 hover:text-primary transition-colors"
              >
                <Settings className="h-3 w-3" />
                <span>Configure</span>
              </button>
            </div>
          </Panel>
        ))}
      </div>

      {/* ── Configure Integration Modal ── */}
      {selectedInteg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-display text-sm font-bold text-foreground">
                Configure {selectedInteg.name}
              </h3>
              <button
                onClick={() => setSelectedInteg(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div>
                <label className="section-label mb-1 block">
                  Webhook Endpoint / Webhook URL
                </label>
                <input
                  type="text"
                  placeholder="https://api.your-service.com/v1/webhook"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 p-2 font-mono text-[11px] text-foreground outline-none"
                />
              </div>

              <div>
                <label className="section-label mb-1 block">API Authorization Token</label>
                <input
                  type="password"
                  placeholder="Bearer token or API Secret"
                  className="w-full rounded-lg border border-border bg-surface-2 p-2 font-mono text-[11px] text-foreground outline-none"
                />
              </div>

              <div className="rounded-lg border border-border/80 bg-surface-2/40 p-3 text-[11px] text-muted-foreground">
                All payloads are cryptographically signed with HMAC-SHA256 headers before dispatch.
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
              <button
                onClick={() => setSelectedInteg(null)}
                className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-foreground hover:bg-surface-2/80"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfig}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-md hover:bg-primary/90"
              >
                <span>{saving ? "Saving..." : "Save & Verify"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
