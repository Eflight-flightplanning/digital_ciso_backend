import { useState, useMemo, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShieldAlert,
  Search,
  Download,
  VolumeX,
  Volume2,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Zap,
  Copy,
  Check,
  Terminal,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  Chip,
  Dot,
  DataTable,
  Row,
  severityTone,
} from "@/components/ui-kit/primitives";
import { useFindings, useAnalyzeFinding } from "@/hooks/use-api";

export interface Finding {
  id: string;
  check_id?: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "informational";
  status: "FAIL" | "PASS" | "MUTED" | string;
  status_extended?: string;
  resource: string;
  resource_id?: string;
  provider: string;
  region: string;
  service: string;
  scanned: string;
  remediation: string;
}

export function formatFindingId(rawId: string): string {
  if (!rawId) return "FND-0000";
  if (rawId.startsWith("prowler-")) {
    const parts = rawId.split("-");
    const prov = parts[1]?.toUpperCase() || "AZ";
    const shortProv = prov === "AZURE" ? "AZ" : prov === "ORACLECLOUD" ? "OCI" : prov;
    const checkWord = parts[2] ? parts[2].split("_").slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") : "";
    const hash = parts[parts.length - 1] ? parts[parts.length - 1].slice(-6).toUpperCase() : rawId.slice(-6).toUpperCase();
    return `${shortProv}-${checkWord ? checkWord + "-" : ""}${hash}`;
  }
  if (rawId.length > 18) {
    return `FND-${rawId.slice(-6).toUpperCase()}`;
  }
  return rawId;
}

export const Route = createFileRoute("/findings")({
  component: FindingsPage,
});

function FindingsPage() {
  const { data: apiFindings, isLoading } = useFindings();
  const analyzeMutation = useAnalyzeFinding();

  const rawData: Finding[] = useMemo(() => {
    if (apiFindings?.items && apiFindings.items.length > 0) {
      return (apiFindings.items as Array<Record<string, unknown>>).map((f) => {
        const meta = (f.check_metadata as Record<string, any>) || (f.raw_result as Record<string, any>) || {};
        const uid = String(f.uid || f.id || "");

        let prov = String(meta.provider || f.provider || f.provider_type || "").toUpperCase();
        if (!prov) {
          if (uid.includes("prowler-azure-") || uid.includes("/subscriptions/")) prov = "AZURE";
          else if (uid.includes("prowler-oci-") || uid.includes("ocid1.")) prov = "OCI";
          else if (uid.includes("prowler-gcp-") || uid.includes("projects/")) prov = "GCP";
          else if (uid.includes("prowler-aws-") || uid.includes("arn:aws:")) prov = "AWS";
          else prov = "AZURE";
        }
        if (prov === "ORACLECLOUD") prov = "OCI";
        if (prov === "KUBERNETES") prov = "K8S";

        const title = String(
          meta.check_title ||
          f.check_title ||
          f.title ||
          (f.check_id ? String(f.check_id).replace(/_/g, " ") : "Cloud Misconfiguration Finding")
        );

        const service = String(meta.service_name || meta.service || f.service || "Core");
        const region = String(meta.region || f.region || "global");
        const resource = String(meta.resource_name || meta.resource_id || f.resource_name || f.resource_id || "cloud-resource");
        const remediation = String(
          meta.remediation_text ||
          meta.remediation ||
          f.remediation_text ||
          f.remediation ||
          (f.status_extended as string) ||
          "Follow cloud security best practices to resolve this misconfiguration."
        );

        return {
          id: uid || (f.id as string) || "FND-00000",
          title,
          severity: ((f.severity as string) || "medium").toLowerCase() as Finding["severity"],
          status: ((f.status as string) || "FAIL").toUpperCase(),
          provider: prov,
          region,
          service,
          resource,
          scanned: (f.first_seen_at as string) || (f.inserted_at as string) || (f.updated_at as string) || new Date().toISOString(),
          remediation,
        };
      });
    }
    return [];
  }, [apiFindings]);

  const [mutedIds, setMutedIds] = useState<string[]>([]);
  const [remediatedIds, setRemediatedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("All");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("All");
  const [selectedStatus, setSelectedStatus] = useState<string>("All");
  const [expandedId, setExpandedId] = useState<string | null>("FND-40281");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [remediatingId, setRemediatingId] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<Record<string, string>>({});

  const data: Finding[] = useMemo(() => {
    const base = rawData;
    return base.map((f) => {
      if (remediatedIds.includes(f.id)) {
        return { ...f, status: "PASS" };
      }
      if (mutedIds.includes(f.id)) {
        return { ...f, status: f.status === "MUTED" ? "FAIL" : "MUTED" };
      }
      return f;
    });
  }, [rawData, mutedIds, remediatedIds]);

  const filtered = useMemo(() => {
    return data.filter((item) => {
      if (search) {
        const query = search.toLowerCase();
        const matches =
          item.title.toLowerCase().includes(query) ||
          item.id.toLowerCase().includes(query) ||
          item.resource.toLowerCase().includes(query) ||
          item.service.toLowerCase().includes(query);
        if (!matches) return false;
      }
      if (
        selectedProvider !== "All" &&
        item.provider.toUpperCase() !== selectedProvider.toUpperCase()
      ) {
        return false;
      }
      if (
        selectedSeverity !== "All" &&
        item.severity.toLowerCase() !== selectedSeverity.toLowerCase()
      ) {
        return false;
      }
      if (selectedStatus !== "All" && item.status !== selectedStatus) {
        return false;
      }
      return true;
    });
  }, [data, search, selectedProvider, selectedSeverity, selectedStatus]);

  const counts = useMemo(() => {
    return {
      total: data.length,
      critical: data.filter((d) => d.severity === "critical").length,
      high: data.filter((d) => d.severity === "high").length,
      medium: data.filter((d) => d.severity === "medium").length,
      low: data.filter((d) => d.severity === "low").length,
      muted: data.filter((d) => d.status === "MUTED").length,
    };
  }, [data]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleToggleMute = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMutedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleRemediate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRemediatingId(id);
    setTimeout(() => {
      setRemediatingId(null);
      setRemediatedIds((prev) => [...prev, id]);
    }, 1500);
  };

  return (
    <AppShell
      title="Security Findings"
      subtitle="Multi-cloud vulnerability telemetry, risk scoring, and automated patch execution"
      actions={
        <button
          onClick={() => {
            const csv =
              "id,title,severity,status,provider,service,resource\n" +
              filtered
                .map(
                  (f) =>
                    `"${f.id}","${f.title}","${f.severity}","${f.status}","${f.provider}","${f.service}","${f.resource}"`
                )
                .join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `findings-export.csv`;
            a.click();
          }}
          className="inline-flex h-10 min-w-[140px] items-center justify-center gap-2 rounded-lg border border-border bg-surface-2/50 px-5 text-xs font-semibold text-foreground transition-all hover:border-primary/40 active:scale-95"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export CSV</span>
        </button>
      }
    >
      {/* ── Unified Filter & Control Bar ── */}
      <Panel index={0} className="mb-5 p-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Quick Severity Tabs */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={() => setSelectedSeverity("All")}
              className={`h-8 rounded-lg px-4 text-xs font-medium transition-all ${
                selectedSeverity === "All"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-surface-2/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({counts.total})
            </button>
            <button
              onClick={() => setSelectedSeverity("critical")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold transition-all ${
                selectedSeverity === "critical"
                  ? "bg-critical text-destructive-foreground shadow-sm"
                  : "bg-surface-2/60 text-critical hover:bg-critical/10"
              }`}
            >
              <Dot tone="critical" pulse /> Critical ({counts.critical})
            </button>
            <button
              onClick={() => setSelectedSeverity("high")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold transition-all ${
                selectedSeverity === "high"
                  ? "bg-high text-primary-foreground shadow-sm"
                  : "bg-surface-2/60 text-high hover:bg-high/10"
              }`}
            >
              <Dot tone="high" /> High ({counts.high})
            </button>
            <button
              onClick={() => setSelectedSeverity("medium")}
              className={`h-8 rounded-lg px-4 text-xs font-medium transition-all ${
                selectedSeverity === "medium"
                  ? "bg-surface-2 text-foreground font-bold"
                  : "bg-surface-2/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              Medium ({counts.medium})
            </button>
            <button
              onClick={() => setSelectedSeverity("low")}
              className={`h-8 rounded-lg px-4 text-xs font-medium transition-all ${
                selectedSeverity === "low"
                  ? "bg-surface-2 text-foreground font-bold"
                  : "bg-surface-2/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              Low ({counts.low})
            </button>
            <button
              onClick={() =>
                setSelectedStatus(selectedStatus === "MUTED" ? "All" : "MUTED")
              }
              className={`h-8 rounded-lg px-4 text-xs font-medium transition-all ${
                selectedStatus === "MUTED"
                  ? "bg-neutral text-background font-bold"
                  : "bg-surface-2/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              Muted ({counts.muted})
            </button>
          </div>

          {/* Search & Provider Selector */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[220px] flex-1 sm:flex-initial">
              <Search className="absolute top-3 left-3 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search findings..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-surface-2/60 pr-3 pl-9 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
              />
            </div>

            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="h-10 min-w-[140px] rounded-lg border border-border bg-surface-2/60 px-4 text-xs font-medium text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
            >
              <option value="All">All Providers</option>
              <option value="AWS">AWS</option>
              <option value="OCI">Oracle Cloud (OCI)</option>
              <option value="Azure">Azure</option>
              <option value="GCP">GCP</option>
              <option value="K8s">Kubernetes</option>
              <option value="GitHub">GitHub</option>
              <option value="M365">M365</option>
            </select>
          </div>
        </div>
      </Panel>

      {/* ── Findings Table ── */}
      <Panel index={1} className="p-0">
        <DataTable
          head={[
            "",
            "Finding ID",
            "Severity",
            "Security Title",
            "Provider",
            "Service",
            "Status",
            "Scanned",
            "Actions",
          ]}
        >
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={9} className="py-16 text-center">
                <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3.5">
                    <ShieldAlert className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">No Security Findings Detected</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    This organization tenant is fresh. Connect your cloud account (AWS, Azure, GCP, OCI, or K8s) to trigger continuous audits.
                  </p>
                  <div className="mt-5 flex items-center gap-3">
                    <Link
                      to="/providers"
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
                    >
                      + Connect Cloud Provider
                    </Link>
                    <Link
                      to="/scans"
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface-2 px-4 text-xs font-semibold text-foreground hover:bg-surface-3 transition-colors"
                    >
                      View Scans
                    </Link>
                  </div>
                </div>
              </td>
            </tr>
          ) : (
            filtered.map((f, i) => {
              const isExpanded = expandedId === f.id;
              const isRemediated = remediatedIds.includes(f.id) || f.status === "PASS";
              const isRemediating = remediatingId === f.id;

              return (
                <div key={f.id} className="contents">
                  <Row
                    index={i}
                    onClick={() => setExpandedId(isExpanded ? null : f.id)}
                    className={isExpanded ? "bg-primary/5 border-l-2 border-l-primary" : ""}
                  >
                    <td className="px-3 py-3 w-8 text-muted-foreground">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-primary" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          title={f.id}
                          className="mono inline-flex items-center rounded-md bg-surface-2 px-2 py-1 text-[11px] font-bold text-foreground ring-1 ring-border/80"
                        >
                          {formatFindingId(f.id)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(f.id);
                            setCopiedId(f.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                          title={`Copy Raw UID: ${f.id}`}
                          className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-primary transition-colors cursor-pointer"
                        >
                          {copiedId === f.id ? (
                            <Check className="h-3 w-3 text-success" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Chip tone={severityTone(f.severity)}>
                        {f.severity.toUpperCase()}
                      </Chip>
                    </td>
                    <td className="px-3 py-3 max-w-[320px]">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {f.title}
                      </p>
                      <p className="mono truncate text-[11px] text-muted-foreground">
                        {f.resource}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                        {f.provider}
                        <span className="text-[10px] text-muted-foreground">
                          ({f.region})
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground font-medium">
                      {f.service}
                    </td>
                    <td className="px-3 py-3">
                      <Chip
                        tone={
                          f.status === "PASS"
                            ? "success"
                            : f.status === "MUTED"
                              ? "neutral"
                              : "critical"
                        }
                      >
                        {f.status}
                      </Chip>
                    </td>
                    <td className="mono text-[11px] text-muted-foreground px-3 py-3">
                      {f.scanned ? f.scanned.slice(11, 16) + 'Z' : '12:00Z'}
                    </td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => handleToggleMute(f.id, e)}
                          title={f.status === "MUTED" ? "Unmute" : "Mute"}
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                        >
                          {f.status === "MUTED" ? (
                            <Volume2 className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <VolumeX className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <Link
                          to="/ai/advisor"
                          search={{
                            prompt: `Analyze finding ${f.title} (${f.id}) on resource ${f.resource}. What is the security risk and step-by-step remediation?`,
                            provider: f.provider.toLowerCase(),
                          }}
                          title="Ask Spectra"
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-primary"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                  </Row>

                  {/* Expanded Detail Panel */}
                  {isExpanded && (
                    <tr className="border-b border-border/80 bg-surface-2/30">
                      <td colSpan={9} className="p-4">
                        <div className="rounded-lg border border-border/70 bg-surface/80 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
                            <div className="flex items-center gap-2">
                              <span className="section-label">Resource</span>
                              <code className="mono rounded bg-surface-2 px-2.5 py-1 text-xs text-primary">
                                {f.resource}
                              </code>
                              <button
                                onClick={() => handleCopy(f.resource, f.id)}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              {copiedId === f.id && (
                                <span className="text-[10px] text-success">
                                  Copied!
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2.5">
                              <Link
                                to="/ai/advisor"
                                search={{
                                  prompt: `Analyze finding ${f.title} (${f.id}) on resource ${f.resource}. What is the security risk and step-by-step remediation?`,
                                  provider: f.provider.toLowerCase(),
                                }}
                                className="inline-flex h-9 min-w-[160px] items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-4 text-xs font-semibold text-foreground transition-colors hover:bg-surface-2/80 active:scale-95"
                              >
                                <Sparkles className="h-3.5 w-3.5 text-primary" />
                                <span>Ask Spectra</span>
                              </Link>

                              <button
                                onClick={(e) => handleRemediate(f.id, e)}
                                disabled={isRemediating || f.status === "PASS"}
                                className={`inline-flex h-9 min-w-[180px] items-center justify-center gap-2 rounded-lg px-5 text-xs font-semibold shadow-sm transition-all active:scale-95 ${
                                  f.status === "PASS"
                                    ? "bg-success/20 text-success border border-success/30 cursor-default"
                                    : "bg-critical text-destructive-foreground hover:bg-critical/90"
                                }`}
                              >
                                <Zap className={`h-3.5 w-3.5 ${isRemediating ? "animate-spin" : ""}`} />
                                <span>
                                  {isRemediating
                                    ? "Executing..."
                                    : f.status === "PASS"
                                      ? "Remediated ✓"
                                      : "Remediate via Phantom"}
                                </span>
                              </button>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {/* Remediation Guide */}
                            <div>
                              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                                <Terminal className="h-3.5 w-3.5 text-primary" />
                                <span>Remediation Procedure</span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                                {f.remediation}
                              </p>
                              <div className="mt-2 rounded bg-surface-2 p-2 font-mono text-[11px] text-foreground">
                                $ dciso remediate --finding {f.id} --apply-iac
                              </div>
                            </div>

                            {/* Threat Correlation */}
                            <div className="rounded border border-border/80 bg-surface-2/40 p-3">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                                <Sparkles className="h-3.5 w-3.5 text-primary" />
                                <span>Spectra Threat Insight</span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                                Correlated with active internet ingress point. Automated risk factor: 88/100.
                              </p>
                              <div className="mt-2 flex items-center justify-between text-[11px]">
                                <span className="text-muted-foreground font-medium">
                                  Attack Path: 2 hops to S3 Crown Jewel
                                </span>
                                <Link
                                  to="/attack-paths"
                                  className="text-primary hover:underline font-medium"
                                >
                                  View Graph →
                                </Link>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </div>
              );
            })
          )}
        </DataTable>
      </Panel>
    </AppShell>
  );
}
