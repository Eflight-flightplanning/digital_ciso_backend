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
import { findings as initialFindings, type Finding } from "@/lib/mock";
import { useFindings, useAnalyzeFinding } from "@/hooks/use-api";

export const Route = createFileRoute("/findings")({
  component: FindingsPage,
});

function FindingsPage() {
  const { data: apiFindings, isLoading } = useFindings();
  const analyzeMutation = useAnalyzeFinding();

  const rawData: Finding[] = useMemo(() => {
    if (apiFindings?.items && apiFindings.items.length > 0) {
      return (apiFindings.items as Array<Record<string, unknown>>).map((f) => ({
        id: (f.uid as string) || (f.id as string) || "FND-00000",
        title: (f.check_title as string) || (f.title as string) || "Cloud Misconfiguration Finding",
        severity: ((f.severity as string) || "medium").toLowerCase() as Finding["severity"],
        status: (f.status as string) || "FAIL",
        provider: ((f.provider as string) || (f.provider_type as string) || "AWS").toUpperCase(),
        region: (f.region as string) || "global",
        service: (f.service as string) || (f.service_name as string) || "Core",
        resource: (f.resource_name as string) || (f.resource_id as string) || "cloud-resource",
        scanned: (f.first_seen_at as string) || (f.updated_at as string) || new Date().toISOString(),
        remediation: (f.remediation_text as string) || (f.remediation as string) || "Follow cloud security best practices to resolve this misconfiguration.",
      }));
    }
    return initialFindings;
  }, [apiFindings]);

  const [data, setData] = useState<Finding[]>(rawData);

  // Sync with API updates if received
  useEffect(() => {
    if (apiFindings?.items && apiFindings.items.length > 0) {
      setData(rawData);
    }
  }, [rawData, apiFindings]);

  const [search, setSearch] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("All");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("All");
  const [selectedStatus, setSelectedStatus] = useState<string>("All");
  const [expandedId, setExpandedId] = useState<string | null>("FND-40281");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [remediatingId, setRemediatingId] = useState<string | null>(null);
  const [remediatedIds, setRemediatedIds] = useState<string[]>([]);
  const [analysisStatus, setAnalysisStatus] = useState<Record<string, string>>({});

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
      if (selectedProvider !== "All" && item.provider !== selectedProvider) {
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
    setData((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: item.status === "MUTED" ? "FAIL" : "MUTED",
            }
          : item
      )
    );
  };

  const handleRemediate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRemediatingId(id);
    setTimeout(() => {
      setRemediatingId(null);
      setRemediatedIds((prev) => [...prev, id]);
      setData((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: "PASS" } : item
        )
      );
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
              <td colSpan={9} className="py-12 text-center text-xs text-muted-foreground">
                No findings matching current filters.
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
                    <td className="mono px-3 py-3 text-xs font-semibold text-foreground">
                      {f.id}
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
                          search={{ prompt: `Analyze finding ${f.id}: ${f.title}` }}
                          title="Ask Spectra"
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
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
                                className="inline-flex h-9 min-w-[160px] items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-4 text-xs font-semibold text-foreground transition-colors hover:bg-surface-2/80 active:scale-95"
                              >
                                <Sparkles className="h-3.5 w-3.5 text-primary" />
                                <span>Analyze with Spectra</span>
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
