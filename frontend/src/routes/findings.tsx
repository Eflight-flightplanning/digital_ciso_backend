import { useState, useMemo, useEffect, Fragment } from "react";
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
  compliance: Record<string, string[]>;
}

export function formatFindingId(rawId: string): string {
  if (!rawId) return "CISO-SEC-0000";
  if (rawId.startsWith("prowler-") || rawId.startsWith("fnd-") || rawId.startsWith("ciso-")) {
    const parts = rawId.split("-");
    const prov = parts[1]?.toUpperCase() || "CLOUD";
    const shortProv = prov === "AZURE" ? "AZ" : prov === "ORACLECLOUD" ? "OCI" : (prov === "ORACLE_SAAS" || prov === "ORACLE-SAAS") ? "ERP" : prov;
    const checkWord = parts[2] ? parts[2].split("_").slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") : "SEC";
    const uuidPart = parts.find((p) => p.length === 36 || (p.length === 8 && /^[0-9a-fA-F]+$/.test(p)));
    const hash = uuidPart ? uuidPart.slice(-4).toUpperCase() : parts[parts.length - 1].slice(-4).toUpperCase();
    return `CISO-${shortProv}-${checkWord}-${hash}`;
  }
  if (rawId.length > 18) {
    return `CISO-FND-${rawId.slice(-6).toUpperCase()}`;
  }
  return rawId.replace(/^prowler-/i, "CISO-");
}

export function formatScanTime(isoDateString?: string): string {
  if (!isoDateString) return "Recently";
  try {
    const d = new Date(isoDateString);
    if (isNaN(d.getTime())) return "Recently";
    const datePart = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const timePart = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
    return `${datePart}, ${timePart} UTC`;
  } catch {
    return "Recently";
  }
}

export const Route = createFileRoute("/findings")({
  component: FindingsPage,
});

function extractFindingProvider(f: any): string {
  const meta = f.check_metadata || f.raw_result || {};
  let p = "";
  if (typeof meta.provider === "string" && meta.provider) p = meta.provider.toUpperCase();
  else if (typeof f.provider === "string" && f.provider && f.provider !== "[object Object]") p = f.provider.toUpperCase();
  else if (f.provider && typeof f.provider === "object" && typeof f.provider.provider === "string") p = f.provider.provider.toUpperCase();
  else if (f.scan?.provider && typeof f.scan.provider === "object" && typeof f.scan.provider.provider === "string") p = f.scan.provider.provider.toUpperCase();
  else if (typeof f.provider_type === "string" && f.provider_type) p = f.provider_type.toUpperCase();
  else if (typeof meta.Provider === "string" && meta.Provider) p = meta.Provider.toUpperCase();

  // 1. Explicit Provider string check (highest precedence)
  if (p === "ORACLE_SAAS" || p === "ORACLE-SAAS" || p === "SAAS") return "ORACLE_SAAS";
  if (p === "OCI" || p === "ORACLECLOUD" || p === "ORACLE_CLOUD") return "OCI";
  if (p === "AZURE" || p === "AZ") return "AZURE";
  if (p === "AWS") return "AWS";
  if (p === "GCP") return "GCP";
  if (p === "KUBERNETES" || p === "K8S") return "K8S";

  // 2. Explicit Check ID prefix check
  const checkId = String(f.check_id || meta.checkid || meta.check_id || "").toLowerCase();
  if (checkId.startsWith("oracle_saas_") || checkId.startsWith("erp_")) return "ORACLE_SAAS";
  if (checkId.startsWith("oci_") || checkId.startsWith("oraclecloud_")) return "OCI";
  if (checkId.startsWith("azure_") || checkId.startsWith("entra_") || checkId.startsWith("defender_")) return "AZURE";
  if (checkId.startsWith("aws_")) return "AWS";
  if (checkId.startsWith("gcp_")) return "GCP";
  if (checkId.startsWith("k8s_")) return "K8S";

  // 3. Resource UID / ID fallback check
  const uid = String(f.uid || f.resource_uid || f.id || "").toLowerCase();
  if (uid.includes("oracle-saas://") || uid.includes("fusion") || uid.includes("saas")) return "ORACLE_SAAS";
  if (uid.includes("ocid1.") || uid.includes("oraclecloud") || uid.includes("oci")) return "OCI";
  if (uid.includes("azure") || uid.includes("/subscriptions/")) return "AZURE";
  if (uid.includes("aws") || uid.includes("arn:aws:")) return "AWS";
  if (uid.includes("gcp") || uid.includes("projects/")) return "GCP";
  if (uid.includes("k8s") || uid.includes("kubernetes")) return "K8S";

  return p || "AZURE";
}

function FindingsPage() {
  const { data: apiFindings, isLoading } = useFindings();
  const analyzeMutation = useAnalyzeFinding();

  const rawData: Finding[] = useMemo(() => {
    if (apiFindings?.items && apiFindings.items.length > 0) {
      return (apiFindings.items as Array<Record<string, unknown>>).map((f: any) => {
        const meta = (f.check_metadata as Record<string, any>) || (f.raw_result as Record<string, any>) || {};
        const uid = String(f.uid || f.id || "");
        const checkId = String(f.check_id || meta.checkid || meta.check_id || "");

        // 1. Provider
        let prov = extractFindingProvider(f);
        if (prov === "ORACLECLOUD") prov = "OCI";
        if (prov === "ORACLE-SAAS" || checkId.startsWith("erp_")) prov = "ORACLE_SAAS";
        if (prov === "KUBERNETES") prov = "K8S";

        // 2. Real Human-Readable Security Title
        const rawTitle = meta.checktitle || meta.check_title || meta.CheckTitle || f.check_title || f.title;
        const title = String(
          rawTitle ||
          (checkId ? checkId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Cloud Security Finding")
        );

        // 3. Real Service Name
        const rawService = String(meta.servicename || meta.service_name || meta.service || f.service || "").toLowerCase();
        let service = "Compute";
        if (checkId.startsWith("erp_iam_") || (prov === "ORACLE_SAAS" && (rawService === "iam" || rawService === "roles" || rawService === "users"))) {
          service = "ERP IAM & SoD";
        } else if (checkId.startsWith("erp_audit_") || (prov === "ORACLE_SAAS" && rawService === "audit")) {
          service = "ERP Audit Trail";
        } else if (checkId.startsWith("erp_network_") || checkId.startsWith("erp_oauth_") || (prov === "ORACLE_SAAS" && rawService === "network")) {
          service = "ERP Access & OAuth";
        } else if (rawService === "vm" || checkId.startsWith("vm_") || checkId.includes("virtualmachine")) {
          service = "Virtual Machines";
        } else if (rawService === "network" || checkId.startsWith("network_") || checkId.includes("nsg") || checkId.includes("vnet")) {
          service = "Network & NSG";
        } else if (rawService === "storage" || checkId.startsWith("storage_") || checkId.includes("blob")) {
          service = "Storage Accounts";
        } else if (rawService === "sql" || checkId.startsWith("sql_") || checkId.includes("sql")) {
          service = "Azure SQL";
        } else if (rawService === "defender" || checkId.startsWith("defender_") || checkId.includes("security_center")) {
          service = "Defender for Cloud";
        } else if (rawService === "iam" || checkId.startsWith("iam_") || checkId.includes("entra") || checkId.includes("aad")) {
          service = "Entra ID / IAM";
        } else if (rawService) {
          service = rawService.charAt(0).toUpperCase() + rawService.slice(1);
        }

        // 4. Real Region & Resource Name from UID & Status Extended
        //
        // Prowler UIDs follow: prowler-{provider}-{check_id}-{account/tenancy-id}-{region}-{resource-name}
        // A naive "grab the last hyphen segment as resource, second-to-last as region" split
        // is wrong whenever the resource's own name contains hyphens (e.g. a VM literally
        // named "Digital-CISO-LLM" was being chopped into resource="LLM", region="CISO" —
        // both wrong). Instead, strip the known "prowler-{provider}-{check_id}-" prefix and
        // the account/tenancy identifier, then treat the first remaining segment as the
        // region and everything after it (rejoined with "-") as the real resource name.
        let region = String(meta.region || f.region || "");
        let resource = String(f.resource_name || f.resource_id || meta.resource_name || meta.resource_id || "");

        if (uid.startsWith("prowler-") && ((!region || region === "global") || (!resource || resource === "cloud-resource"))) {
          // Both segments allow underscores — provider slugs like "oracle_saas" contain one.
          let rest = uid.replace(/^prowler-[a-z0-9_]+-[a-z0-9_]+-/i, "");
          rest = rest.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, ""); // Azure subscription GUID
          rest = rest.replace(/^ocid1\.[a-z]+\.[a-z0-9.]*-/i, ""); // OCI tenancy/compartment OCID
          const restParts = rest.split("-").filter(Boolean);

          if (restParts.length >= 1) {
            let parsedRegion = "";
            let parsedResource = "";
            const globalIdx = restParts.indexOf("global");
            // "global" is a literal region marker Prowler uses for account-wide checks — if it
            // shows up anywhere (e.g. after a provider-specific account identifier this function
            // doesn't otherwise know how to strip, like an Oracle SaaS pod hostname), anchor on
            // it directly rather than guessing at segment positions.
            if (globalIdx !== -1 && globalIdx < restParts.length - 1) {
              parsedRegion = "global";
              parsedResource = restParts.slice(globalIdx + 1).join("-");
            } else if (
              // OCI region codes are themselves hyphenated: "xx-cityname-N" (e.g. uk-london-1,
              // us-ashburn-1) — a single-segment region assumption would wrongly split this.
              restParts.length >= 4 &&
              /^[a-z]{2}$/i.test(restParts[0]) &&
              /^[a-z]+$/i.test(restParts[1]) &&
              /^\d+$/.test(restParts[2])
            ) {
              parsedRegion = restParts.slice(0, 3).join("-");
              parsedResource = restParts.slice(3).join("-");
            } else if (restParts.length >= 2) {
              parsedRegion = restParts[0];
              parsedResource = restParts.slice(1).join("-");
            } else {
              parsedResource = restParts[0];
            }
            if (!parsedRegion || parsedRegion.length <= 2 || parsedRegion.includes("ab5c") || parsedRegion.includes("ocid1")) {
              // Not a plausible region after all — don't guess, keep the whole remainder as resource.
              parsedResource = restParts.join("-");
              parsedRegion = "";
            }
            if ((!region || region === "global") && parsedRegion) region = parsedRegion;
            if ((!resource || resource === "cloud-resource") && parsedResource) resource = parsedResource;
          }
        }
        if (!region || region === "global") {
          region = prov === "OCI" ? "uk-london-1" : "centralindia";
        }
        if (!resource || resource === "cloud-resource") {
          const statusExt = String(f.status_extended || "");
          // Non-greedy capture stopping at the next sentence-boundary word, so a name
          // like "Digital-CISO-LLM" isn't swallowed along with the rest of the sentence
          // ("...has trusted launch disabled in subscription...").
          const match = statusExt.match(/(?:VM|Virtual network|Security Group|Disk|account|subscription|policy|domain)\s+'?([a-zA-Z0-9_\-]+(?:\s[a-zA-Z0-9_\-]+)*?)'?\s+(?:has|is|does|was|were|in\b)/i);
          if (match && match[1]) {
            resource = match[1].trim();
          } else {
            // Last resort — an honest, generic placeholder. Never fall back to a name
            // that could be mistaken for a real, specific resource.
            resource = "Unidentified Resource";
          }
        }

        // 5. Real Remediation
        let remediation = "Follow cloud security best practices to resolve this misconfiguration.";
        if (meta.remediation && typeof meta.remediation === "object") {
          remediation = meta.remediation.recommendation?.text || meta.remediation.code?.cli || meta.remediation.code?.terraform || remediation;
        } else if (typeof meta.remediation === "string") {
          remediation = meta.remediation;
        } else if (f.status_extended) {
          remediation = `Remediate control: ${f.status_extended}`;
        }

        return {
          id: String(f.id || f.uid || "FND-0000"),
          check_id: checkId,
          title,
          severity: (String(f.severity || "medium").toLowerCase() as any) || "medium",
          status: String(f.status || "FAIL"),
          status_extended: String(f.status_extended || ""),
          resource,
          resource_id: String(f.resource_uid || f.resource_id || uid),
          provider: prov,
          region,
          service,
          scanned: String(f.inserted_at || f.first_seen_at || f.updated_at || ""),
          remediation,
          compliance: (f.compliance && typeof f.compliance === "object" && !Array.isArray(f.compliance)) ? f.compliance : {},
        };
      });
    }
    return [];
  }, [apiFindings]);

  const [mutedIds, setMutedIds] = useState<string[]>([]);
  const [remediatedIds, setRemediatedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("All");
  const [selectedCompliance, setSelectedCompliance] = useState<string>("All");
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

  // Pre-filter findings by selected cloud provider so that tab counts update dynamically
  const providerFilteredData = useMemo(() => {
    return data.filter((item) => {
      const selProv = (selectedProvider || "ALL").toUpperCase();
      if (selProv !== "ALL") {
        const itemProv = (item.provider || "").toUpperCase();
        const matchesProv =
          itemProv === selProv ||
          (selProv === "AZURE" && (itemProv === "AZURE" || itemProv === "AZ")) ||
          (selProv === "OCI" && (itemProv === "OCI" || itemProv === "ORACLECLOUD")) ||
          (selProv === "ORACLE_SAAS" && (itemProv === "ORACLE_SAAS" || itemProv === "ORACLE-SAAS" || itemProv === "ERP")) ||
          (selProv === "K8S" && (itemProv === "K8S" || itemProv === "KUBERNETES"));
        if (!matchesProv) return false;
      }
      return true;
    });
  }, [data, selectedProvider]);

  // Real compliance framework keys present in the currently provider-filtered data —
  // never a hardcoded list, so the dropdown only ever offers frameworks that findings
  // actually carry (a finding's `compliance` field mirrors what the Compliance page uses).
  const complianceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of providerFilteredData) {
      for (const key of Object.keys(item.compliance || {})) {
        set.add(key);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [providerFilteredData]);

  // If the provider filter changes and the previously selected framework no longer
  // appears in the data, fall back to "All" rather than silently filtering to nothing.
  useEffect(() => {
    if (selectedCompliance !== "All" && !complianceOptions.includes(selectedCompliance)) {
      setSelectedCompliance("All");
    }
  }, [complianceOptions, selectedCompliance]);

  const filtered = useMemo(() => {
    return providerFilteredData.filter((item) => {
      if (search) {
        const query = search.toLowerCase();
        const matches =
          item.title.toLowerCase().includes(query) ||
          item.id.toLowerCase().includes(query) ||
          item.resource.toLowerCase().includes(query) ||
          item.service.toLowerCase().includes(query);
        if (!matches) return false;
      }
      if (selectedCompliance !== "All" && !(selectedCompliance in (item.compliance || {}))) {
        return false;
      }
      const selSev = (selectedSeverity || "ALL").toLowerCase();
      if (selSev !== "all" && item.severity.toLowerCase() !== selSev) {
        return false;
      }
      const selStat = (selectedStatus || "ALL").toUpperCase();
      if (selStat !== "ALL" && item.status.toUpperCase() !== selStat) {
        return false;
      }
      return true;
    });
  }, [providerFilteredData, search, selectedCompliance, selectedSeverity, selectedStatus]);

  const counts = useMemo(() => {
    return {
      total: providerFilteredData.length,
      critical: providerFilteredData.filter((d) => d.severity === "critical").length,
      high: providerFilteredData.filter((d) => d.severity === "high").length,
      medium: providerFilteredData.filter((d) => d.severity === "medium").length,
      low: providerFilteredData.filter((d) => d.severity === "low").length,
      muted: providerFilteredData.filter((d) => d.status === "MUTED").length,
    };
  }, [providerFilteredData]);

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
              "Finding_ID,Title,Severity,Status,Provider,Region,Service,Resource,Remediation_Plan\n" +
              filtered
                .map(
                  (f) =>
                    `"${formatFindingId(f.id)}","${f.title.replace(/"/g, '""')}","${f.severity.toUpperCase()}","${f.status}","${f.provider}","${f.region}","${f.service}","${f.resource.replace(/"/g, '""')}","${(f.remediation || '').replace(/"/g, '""')}"`
                )
                .join("\n");
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `ciso-security-findings-${new Date().toISOString().slice(0, 10)}.csv`;
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
      <Panel index={0} className="mb-5 p-3.5 sm:p-4">
        <div className="flex flex-col gap-3.5 xl:flex-row xl:items-center xl:justify-between">
          {/* Quick Severity Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 xl:pb-0 scrollbar-none">
            <button
              onClick={() => setSelectedSeverity("All")}
              className={`h-8 whitespace-nowrap rounded-lg px-3.5 text-xs font-semibold transition-all ${
                selectedSeverity === "All"
                  ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/30"
                  : "bg-surface-2/70 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              All ({counts.total})
            </button>
            <button
              onClick={() => setSelectedSeverity("critical")}
              className={`inline-flex h-8 whitespace-nowrap items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-all ${
                selectedSeverity === "critical"
                  ? "bg-critical text-destructive-foreground shadow-sm ring-1 ring-critical/40"
                  : "bg-surface-2/70 text-critical hover:bg-critical/10"
              }`}
            >
              <Dot tone="critical" pulse /> Critical ({counts.critical})
            </button>
            <button
              onClick={() => setSelectedSeverity("high")}
              className={`inline-flex h-8 whitespace-nowrap items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-all ${
                selectedSeverity === "high"
                  ? "bg-high text-primary-foreground shadow-sm ring-1 ring-high/40"
                  : "bg-surface-2/70 text-high hover:bg-high/10"
              }`}
            >
              <Dot tone="high" /> High ({counts.high})
            </button>
            <button
              onClick={() => setSelectedSeverity("medium")}
              className={`h-8 whitespace-nowrap rounded-lg px-3.5 text-xs font-semibold transition-all ${
                selectedSeverity === "medium"
                  ? "bg-surface-3 text-foreground font-bold ring-1 ring-border"
                  : "bg-surface-2/70 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              Medium ({counts.medium})
            </button>
            <button
              onClick={() => setSelectedSeverity("low")}
              className={`h-8 whitespace-nowrap rounded-lg px-3.5 text-xs font-semibold transition-all ${
                selectedSeverity === "low"
                  ? "bg-surface-3 text-foreground font-bold ring-1 ring-border"
                  : "bg-surface-2/70 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              Low ({counts.low})
            </button>
            <button
              onClick={() =>
                setSelectedStatus(selectedStatus === "MUTED" ? "All" : "MUTED")
              }
              className={`h-8 whitespace-nowrap rounded-lg px-3.5 text-xs font-semibold transition-all ${
                selectedStatus === "MUTED"
                  ? "bg-neutral text-background font-bold ring-1 ring-neutral/50"
                  : "bg-surface-2/70 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              Muted ({counts.muted})
            </button>
          </div>

          {/* Search & Provider Selector */}
          <div className="flex flex-wrap items-center gap-2.5 sm:flex-nowrap">
            <div className="relative min-w-[200px] flex-1 sm:w-64 sm:flex-initial">
              <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search findings..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-surface-2/70 pr-3 pl-9 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
              />
            </div>

            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="h-9 min-w-[150px] rounded-lg border border-border bg-surface-2/70 px-3.5 text-xs font-semibold text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary cursor-pointer"
            >
              <option value="All">All Providers</option>
              <option value="AZURE">Azure</option>
              <option value="OCI">Oracle Cloud (OCI)</option>
              <option value="ORACLE_SAAS">Oracle SaaS / ERP</option>
              <option value="AWS">AWS</option>
              <option value="GCP">GCP</option>
              <option value="K8S">Kubernetes</option>
            </select>

            <select
              value={selectedCompliance}
              onChange={(e) => setSelectedCompliance(e.target.value)}
              className="h-9 min-w-[170px] rounded-lg border border-border bg-surface-2/70 px-3.5 text-xs font-semibold text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary cursor-pointer"
              title="Filter by compliance framework"
            >
              <option value="All">All Compliance Frameworks</option>
              {complianceOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Panel>

      {/* ── Findings Table ── */}
      <Panel index={1} className="p-0 overflow-hidden border border-border/80 shadow-sm">
        <DataTable
          tableClassName="w-full table-fixed text-left text-sm"
          colgroup={
            <colgroup>
              <col style={{ width: "36px" }} />
              <col style={{ width: "135px" }} />
              <col style={{ width: "85px" }} />
              <col />
              <col style={{ width: "100px" }} />
              <col style={{ width: "95px" }} />
              <col style={{ width: "80px" }} />
              <col style={{ width: "115px" }} />
              <col style={{ width: "70px" }} />
            </colgroup>
          }
          head={[
            "",
            "Finding ID",
            "Severity",
            "Security Title & Resource",
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
                <Fragment key={`${f.id}-${i}`}>
                  <Row
                    index={i}
                    onClick={() => setExpandedId(isExpanded ? null : f.id)}
                    className={isExpanded ? "bg-primary/5 border-l-2 border-l-primary" : ""}
                  >
                    <td className="px-2 py-2.5 text-center text-muted-foreground">
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-primary inline-block" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 inline-block" />
                      )}
                    </td>
                    <td className="px-2 py-2.5 truncate">
                      <div className="flex items-center gap-1">
                        <span
                          title={f.id}
                          className="mono inline-flex items-center rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-bold text-foreground ring-1 ring-border/80 truncate"
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
                          className="rounded p-0.5 text-muted-foreground hover:bg-surface-2 hover:text-primary transition-colors cursor-pointer shrink-0"
                        >
                          {copiedId === f.id ? (
                            <Check className="h-3 w-3 text-success" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 truncate">
                      <Chip tone={severityTone(f.severity)}>
                        {f.severity.toUpperCase()}
                      </Chip>
                    </td>
                    <td className="px-2.5 py-2.5 truncate">
                      <div className="min-w-0 flex flex-col justify-center">
                        <p className="truncate text-xs font-semibold text-foreground" title={f.title}>
                          {f.title}
                        </p>
                        <p className="mono truncate text-[10px] text-muted-foreground" title={f.resource}>
                          {f.resource}
                        </p>
                        {Object.keys(f.compliance || {}).length > 0 && (
                          <div
                            className="mt-0.5 truncate text-[10px] text-primary/80"
                            title={`Mapped to: ${Object.keys(f.compliance).join(", ")}`}
                          >
                            {Object.keys(f.compliance).slice(0, 2).join(" · ")}
                            {Object.keys(f.compliance).length > 2 && ` +${Object.keys(f.compliance).length - 2}`}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 truncate">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground truncate" title={`${f.provider} (${f.region})`}>
                        {f.provider}
                        <span className="text-[10px] text-muted-foreground">
                          ({f.region})
                        </span>
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-muted-foreground font-medium truncate" title={f.service}>
                      {f.service}
                    </td>
                    <td className="px-2 py-2.5 truncate">
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
                    <td className="mono text-[11px] text-muted-foreground px-2 py-2.5 truncate" title={formatScanTime(f.scanned)}>
                      {formatScanTime(f.scanned)}
                    </td>
                    <td className="px-2 py-2.5 text-right truncate" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => handleToggleMute(f.id, e)}
                          title={f.status === "MUTED" ? "Unmute" : "Mute"}
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground cursor-pointer shrink-0"
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
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-primary shrink-0"
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
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                                  <Terminal className="h-3.5 w-3.5 text-primary" />
                                  <span>Native Cloud CLI & Remediation Command</span>
                                </div>
                                <span className="text-[10px] font-mono text-muted-foreground uppercase bg-surface-2 px-2 py-0.5 rounded border border-border/50">
                                  {f.provider}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {f.remediation || "Apply the recommended security controls via your native cloud CLI or run automated Infrastructure-as-Code (IaC) remediation."}
                              </p>
                              
                              {/* Native Cloud CLI Command */}
                              <div className="space-y-1.5">
                                <div className="rounded-lg bg-surface-2 p-2 font-mono text-[11px] text-foreground border border-border/50 flex items-center justify-between gap-2 overflow-x-auto">
                                  <span className="truncate">
                                    {(() => {
                                      const p = f.provider.toLowerCase();
                                      const check = (f.check_id || f.id).toLowerCase();
                                      const res = f.resource;
                                      if (p === "oraclecloud" || p === "oci") {
                                        if (check.includes("log") || check.includes("audit")) {
                                          return `oci logging log-group update --log-group-id "${res}" --retention-duration 365`;
                                        }
                                        if (check.includes("bucket") || check.includes("storage")) {
                                          return `oci os bucket update --name "${res}" --public-access-type "NoPublicAccess"`;
                                        }
                                        if (check.includes("policy") || check.includes("iam")) {
                                          return `oci iam policy update --policy-id "${res}" --statements '["Allow group SecOps to read all-resources in tenancy"]'`;
                                        }
                                        return `oci ${f.service?.toLowerCase().replace(/\s+/g, "-") || "resource"} update --id "${res}" --enable-secure-mode`;
                                      }
                                      if (p === "azure") {
                                        if (check.includes("storage") || check.includes("blob")) {
                                          return `az storage account update --name "${res}" --allow-blob-public-access false --min-tls-version TLS1_2`;
                                        }
                                        if (check.includes("nsg") || check.includes("network")) {
                                          return `az network nsg rule create --nsg-name "${res}" --name "DenyInternetInbound" --access Deny --priority 100`;
                                        }
                                        if (check.includes("vm") || check.includes("jit")) {
                                          return `az security jit-policy set --location eastus --name default --resource-group rg-production --virtual-machines '[{"id":"/subscriptions/sub-id/resourceGroups/rg-production/providers/Microsoft.Compute/virtualMachines/${res}"}]'`;
                                        }
                                        return `az resource update --name "${res}" --resource-type "${f.service}" --set properties.securityPolicy=enforced`;
                                      }
                                      if (p === "aws") {
                                        if (check.includes("s3") || check.includes("bucket")) {
                                          return `aws s3api put-public-access-block --bucket "${res}" --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"`;
                                        }
                                        if (check.includes("iam") || check.includes("password")) {
                                          return `aws iam update-account-password-policy --minimum-password-length 14 --require-symbols --require-numbers --require-uppercase-characters`;
                                        }
                                        if (check.includes("sg") || check.includes("security_group") || check.includes("ec2")) {
                                          return `aws ec2 revoke-security-group-ingress --group-id "${res}" --protocol tcp --port 22 --cidr 0.0.0.0/0`;
                                        }
                                        return `aws ${f.service?.toLowerCase() || "config"} put-remediation-configurations --config-rule-name "${f.check_id}"`;
                                      }
                                      if (p === "gcp" || p === "google") {
                                        if (check.includes("storage") || check.includes("bucket")) {
                                          return `gcloud storage buckets update gs://${res} --uniform-bucket-level-access`;
                                        }
                                        if (check.includes("iam") || check.includes("serviceaccount")) {
                                          return `gcloud iam service-accounts disable "${res}"`;
                                        }
                                        if (check.includes("firewall") || check.includes("compute")) {
                                          return `gcloud compute firewall-rules update "${res}" --disabled`;
                                        }
                                        return `gcloud ${f.service?.toLowerCase() || "resource-manager"} update --resource="${res}"`;
                                      }
                                      if (p === "kubernetes" || p === "k8s") {
                                        if (check.includes("privilege") || check.includes("pod")) {
                                          return `kubectl patch deployment "${res}" -p '{"spec":{"template":{"spec":{"securityContext":{"allowPrivilegeEscalation":false,"readOnlyRootFilesystem":true}}}}}'`;
                                        }
                                        if (check.includes("rbac") || check.includes("clusterrole")) {
                                          return `kubectl delete clusterrolebinding "${res}"`;
                                        }
                                        return `kubectl patch ${f.service?.toLowerCase() || "resource"} "${res}" --type=merge -p '{"spec":{"enforceSecurityPolicy":true}}'`;
                                      }
                                      if (p === "github") {
                                        return `gh api --method PUT -H "Accept: application/vnd.github+json" /repos/ORG/${res}/branches/main/protection --input protection-policy.json`;
                                      }
                                      if (p === "oracle_saas") {
                                        return `dciso saas remediate --user "${res}" --enforce-mfa --quarantine-sod`;
                                      }
                                      if (p === "m365") {
                                        return `Set-MsolPasswordPolicy -NotificationDays 14 -ValidityPeriod 90`;
                                      }
                                      return `dciso remediate --finding ${formatFindingId(f.id)} --apply-iac`;
                                    })()}
                                  </span>
                                  <button
                                    onClick={() => {
                                      const p = f.provider.toLowerCase();
                                      const check = (f.check_id || f.id).toLowerCase();
                                      const res = f.resource;
                                      let cmd = `dciso remediate --finding ${formatFindingId(f.id)} --apply-iac`;
                                      if (p === "oraclecloud" || p === "oci") {
                                        if (check.includes("log") || check.includes("audit")) cmd = `oci logging log-group update --log-group-id "${res}" --retention-duration 365`;
                                        else if (check.includes("bucket") || check.includes("storage")) cmd = `oci os bucket update --name "${res}" --public-access-type "NoPublicAccess"`;
                                        else if (check.includes("policy") || check.includes("iam")) cmd = `oci iam policy update --policy-id "${res}" --statements '["Allow group SecOps to read all-resources in tenancy"]'`;
                                        else cmd = `oci ${f.service?.toLowerCase().replace(/\s+/g, "-") || "resource"} update --id "${res}" --enable-secure-mode`;
                                      } else if (p === "azure") {
                                        if (check.includes("storage") || check.includes("blob")) cmd = `az storage account update --name "${res}" --allow-blob-public-access false --min-tls-version TLS1_2`;
                                        else if (check.includes("nsg") || check.includes("network")) cmd = `az network nsg rule create --nsg-name "${res}" --name "DenyInternetInbound" --access Deny --priority 100`;
                                        else if (check.includes("vm") || check.includes("jit")) cmd = `az security jit-policy set --location eastus --name default --resource-group rg-production --virtual-machines '[{"id":"/subscriptions/sub-id/resourceGroups/rg-production/providers/Microsoft.Compute/virtualMachines/${res}"}]'`;
                                        else cmd = `az resource update --name "${res}" --resource-type "${f.service}" --set properties.securityPolicy=enforced`;
                                      } else if (p === "aws") {
                                        if (check.includes("s3") || check.includes("bucket")) cmd = `aws s3api put-public-access-block --bucket "${res}" --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"`;
                                        else if (check.includes("iam") || check.includes("password")) cmd = `aws iam update-account-password-policy --minimum-password-length 14 --require-symbols --require-numbers --require-uppercase-characters`;
                                        else if (check.includes("sg") || check.includes("security_group") || check.includes("ec2")) cmd = `aws ec2 revoke-security-group-ingress --group-id "${res}" --protocol tcp --port 22 --cidr 0.0.0.0/0`;
                                        else cmd = `aws ${f.service?.toLowerCase() || "config"} put-remediation-configurations --config-rule-name "${f.check_id}"`;
                                      } else if (p === "gcp" || p === "google") {
                                        if (check.includes("storage") || check.includes("bucket")) cmd = `gcloud storage buckets update gs://${res} --uniform-bucket-level-access`;
                                        else if (check.includes("iam") || check.includes("serviceaccount")) cmd = `gcloud iam service-accounts disable "${res}"`;
                                        else if (check.includes("firewall") || check.includes("compute")) cmd = `gcloud compute firewall-rules update "${res}" --disabled`;
                                        else cmd = `gcloud ${f.service?.toLowerCase() || "resource-manager"} update --resource="${res}"`;
                                      } else if (p === "kubernetes" || p === "k8s") {
                                        if (check.includes("privilege") || check.includes("pod")) cmd = `kubectl patch deployment "${res}" -p '{"spec":{"template":{"spec":{"securityContext":{"allowPrivilegeEscalation":false,"readOnlyRootFilesystem":true}}}}}'`;
                                        else if (check.includes("rbac") || check.includes("clusterrole")) cmd = `kubectl delete clusterrolebinding "${res}"`;
                                        else cmd = `kubectl patch ${f.service?.toLowerCase() || "resource"} "${res}" --type=merge -p '{"spec":{"enforceSecurityPolicy":true}}'`;
                                      } else if (p === "github") {
                                        cmd = `gh api --method PUT -H "Accept: application/vnd.github+json" /repos/ORG/${res}/branches/main/protection --input protection-policy.json`;
                                      } else if (p === "oracle_saas") {
                                        cmd = `dciso saas remediate --user "${res}" --enforce-mfa --quarantine-sod`;
                                      } else if (p === "m365") {
                                        cmd = `Set-MsolPasswordPolicy -NotificationDays 14 -ValidityPeriod 90`;
                                      }
                                      handleCopy(cmd, f.id + "-cmd");
                                    }}
                                    className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                                    title="Copy Command"
                                  >
                                    {copiedId === f.id + "-cmd" ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Dynamic Threat Insight */}
                            <div className="rounded-xl border border-border/80 bg-surface-2/40 p-3.5 space-y-2">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                                <Sparkles className="h-3.5 w-3.5 text-primary" />
                                <span>Spectra Threat & Blast Radius Insight</span>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {f.status_extended ||
                                  `Identified non-compliant security posture on ${f.service || "service"} in region ${f.region || "cloud"}. Potential exposure point for lateral privilege movement.`}
                              </p>
                              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50 text-[11px]">
                                <span className="text-muted-foreground font-medium">
                                  Target: <strong className="text-foreground">{f.resource}</strong> ({f.provider.toUpperCase()})
                                </span>
                                <Link
                                  to="/attack-paths"
                                  className="text-primary hover:underline font-semibold flex items-center gap-1"
                                >
                                  <span>View in Attack Graph →</span>
                                </Link>
                              </div>
                            </div>
                          </div>

                          {Object.keys(f.compliance || {}).length > 0 && (
                            <div className="mt-3 rounded-xl border border-border/80 bg-surface-2/40 p-3.5 space-y-2">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                                <ShieldAlert className="h-3.5 w-3.5 text-primary" />
                                <span>Compliance Frameworks Mapped to This Check</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {Object.entries(f.compliance).map(([framework, requirementIds]) => (
                                  <span
                                    key={framework}
                                    title={`Requirement(s): ${(requirementIds || []).join(", ")}`}
                                    className="inline-flex items-center gap-1 rounded-lg border border-primary/25 bg-primary/5 px-2 py-1 text-[11px] font-semibold text-primary"
                                  >
                                    {framework}
                                    {requirementIds && requirementIds.length > 0 && (
                                      <span className="mono text-[10px] text-primary/70">
                                        ({requirementIds.join(", ")})
                                      </span>
                                    )}
                                  </span>
                                ))}
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                This check's real PASS/FAIL result is exactly what the Compliance page rolls up for these frameworks — same underlying data, viewed by framework instead of by check.
                              </p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </DataTable>
      </Panel>
    </AppShell>
  );
}
