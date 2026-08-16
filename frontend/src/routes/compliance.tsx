import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShieldCheck,
  Download,
  Search,
  Zap,
  ChevronRight,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  Chip,
} from "@/components/ui-kit/primitives";
import { useCompliance, useProviders } from "@/hooks/use-api";

export const Route = createFileRoute("/compliance")({
  component: CompliancePage,
});

interface FrameworkDef {
  id: string;
  name: string;
  version: string;
  provider: "AWS" | "OCI" | "AZURE" | "GCP" | "KUBERNETES" | "SAAS" | "MULTI-CLOUD";
  description: string;
  totalControls: number;
}

const SUPPORTED_FRAMEWORKS: FrameworkDef[] = [
  // AWS Frameworks
  {
    id: "cis-aws-3.0",
    name: "CIS AWS Foundations Benchmark",
    version: "v3.0.0",
    provider: "AWS",
    description: "Prescriptive technical guidance for securing Amazon Web Services accounts.",
    totalControls: 142,
  },
  {
    id: "aws-well-architected",
    name: "AWS Well-Architected Security Pillar",
    version: "v2026",
    provider: "AWS",
    description: "Cloud-native architectural best practices for security and operational excellence.",
    totalControls: 88,
  },

  // OCI (Oracle Cloud Infrastructure) Frameworks
  {
    id: "cis-oci-2.0",
    name: "CIS Oracle Cloud Infrastructure Benchmark",
    version: "v2.0.0",
    provider: "OCI",
    description: "Security baselines for OCI Tenancies, Compartments, IAM, VCN & Object Storage.",
    totalControls: 118,
  },
  {
    id: "oci-security-best-practices",
    name: "OCI Enterprise Security Best Practices",
    version: "v2.4.0",
    provider: "OCI",
    description: "Oracle Cloud Infrastructure Defense-in-Depth audit for enterprise workloads.",
    totalControls: 74,
  },

  // Azure Frameworks
  {
    id: "cis-azure-2.1",
    name: "CIS Microsoft Azure Foundations",
    version: "v2.1.0",
    provider: "AZURE",
    description: "Security benchmarks for Microsoft Entra ID, Storage Accounts, NSGs & Key Vaults.",
    totalControls: 126,
  },
  {
    id: "asb-v3",
    name: "Azure Security Benchmark (ASB)",
    version: "v3.0.0",
    provider: "AZURE",
    description: "Microsoft cloud security guidance aligning with NIST SP 800-53 and CIS controls.",
    totalControls: 96,
  },

  // GCP Frameworks
  {
    id: "cis-gcp-2.0",
    name: "CIS Google Cloud Platform Benchmark",
    version: "v2.0.0",
    provider: "GCP",
    description: "Security configuration baseline for Google Cloud Projects, IAM & Storage.",
    totalControls: 110,
  },

  // Kubernetes Frameworks
  {
    id: "cis-k8s-1.8",
    name: "CIS Kubernetes Benchmark",
    version: "v1.8.0",
    provider: "KUBERNETES",
    description: "Hardening guide for Kubernetes API Server, etcd, Kubelet and worker nodes.",
    totalControls: 124,
  },
  {
    id: "nsa-cisa-k8s",
    name: "NSA-CISA Kubernetes Hardening Guidance",
    version: "v2.0",
    provider: "KUBERNETES",
    description: "National Security Agency recommendations to secure containerized architectures.",
    totalControls: 65,
  },

  // Multi-Cloud Regulatory Standards
  {
    id: "soc2-type2",
    name: "SOC 2 Type II (Trust Services Criteria)",
    version: "2024 TSC",
    provider: "MULTI-CLOUD",
    description: "Security, Availability, Processing Integrity, Confidentiality and Privacy controls.",
    totalControls: 168,
  },
  {
    id: "iso-27001-2022",
    name: "ISO/IEC 27001:2022 ISMS",
    version: "Annex A (93 Controls)",
    provider: "MULTI-CLOUD",
    description: "International Information Security Management Standard for multi-cloud estates.",
    totalControls: 93,
  },
  {
    id: "pci-dss-4.0",
    name: "PCI-DSS Payment Card Security",
    version: "v4.0.1",
    provider: "MULTI-CLOUD",
    description: "Rigorous standards for cardholder data environments across AWS, Azure, GCP & OCI.",
    totalControls: 240,
  },
  {
    id: "nist-800-53",
    name: "NIST SP 800-53 Rev 5",
    version: "Rev 5 (Moderate/High)",
    provider: "MULTI-CLOUD",
    description: "Federal Information Security Modernization Act (FISMA) compliance controls.",
    totalControls: 280,
  },
  {
    id: "hipaa-security",
    name: "HIPAA Security Rule (45 CFR § 164.312)",
    version: "HITECH Omnibus",
    provider: "MULTI-CLOUD",
    description: "Administrative, Physical and Technical safeguards for Electronic Protected Health Info.",
    totalControls: 78,
  },
  {
    id: "cis-m365",
    name: "CIS Microsoft 365 & SaaS Foundations",
    version: "v2.0.0",
    provider: "SAAS",
    description: "Security controls for Microsoft Exchange, SharePoint, Teams and GitHub Enterprise.",
    totalControls: 84,
  },
];

function CompliancePage() {
  const { data: apiCompliance } = useCompliance();
  const { data: apiProviders } = useProviders();

  // Connected cloud providers list
  const connectedProviders = useMemo(() => {
    if (apiProviders?.items && apiProviders.items.length > 0) {
      return (apiProviders.items as Array<Record<string, unknown>>).map((p) =>
        ((p.provider as string) || (p.provider_type as string) || "AWS").toUpperCase()
      );
    }
    return [];
  }, [apiProviders]);

  const [selectedProviderFilter, setSelectedProviderFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"cards" | "matrix">("cards");
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null);

  // Live API compliance data map
  const liveComplianceMap = useMemo(() => {
    const map = new Map<string, { passRate: number; passed: number; failed: number; total: number }>();
    if (apiCompliance?.items && apiCompliance.items.length > 0) {
      for (const item of apiCompliance.items as Array<Record<string, unknown>>) {
        const id = ((item.id as string) || (item.framework_id as string) || "").toLowerCase();
        if (id) {
          map.set(id, {
            passRate: (item.pass_rate as number) || 0,
            passed: (item.pass_requirements as number) || (item.passed as number) || 0,
            failed: (item.fail_requirements as number) || (item.failed as number) || 0,
            total: (item.total_requirements as number) || (item.total as number) || 0,
          });
        }
      }
    }
    return map;
  }, [apiCompliance]);

  // Filter frameworks based on provider filter and search query
  const displayedFrameworks = useMemo(() => {
    return SUPPORTED_FRAMEWORKS.filter((fw) => {
      // Provider filter
      if (selectedProviderFilter === "ALL_SCANNED") {
        if (connectedProviders.length > 0) {
          const matchesScanned =
            connectedProviders.includes(fw.provider) ||
            (fw.provider === "OCI" && connectedProviders.includes("ORACLECLOUD")) ||
            fw.provider === "MULTI-CLOUD";
          if (!matchesScanned) return false;
        }
      } else if (selectedProviderFilter !== "ALL") {
        if (fw.provider !== selectedProviderFilter && fw.provider !== "MULTI-CLOUD") {
          return false;
        }
      }

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          fw.name.toLowerCase().includes(q) ||
          fw.version.toLowerCase().includes(q) ||
          fw.description.toLowerCase().includes(q) ||
          fw.provider.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [selectedProviderFilter, connectedProviders, search]);

  const hasScannedData = liveComplianceMap.size > 0;

  return (
    <AppShell
      title="Compliance & Regulatory Assurance"
      subtitle="Continuous multi-cloud audit evidence, CIS Benchmarks, SOC 2, ISO 27001, OCI & NIST mapping"
      actions={
        <div className="flex items-center gap-3">
          <Link
            to="/scans"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>Run Compliance Scan</span>
          </Link>
          <button
            onClick={() => {
              const exportData = displayedFrameworks.map((f) => ({
                framework: f.name,
                version: f.version,
                provider: f.provider,
                total_controls: f.totalControls,
                compliance_rate: liveComplianceMap.get(f.id.toLowerCase())?.passRate
                  ? `${Math.round(liveComplianceMap.get(f.id.toLowerCase())!.passRate * 100)}%`
                  : "Pending Scan",
              }));
              const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `compliance-audit-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
            }}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface-2/50 px-4 text-xs font-semibold text-foreground transition-all hover:border-primary/40 active:scale-95"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Evidence</span>
          </button>
        </div>
      }
    >
      {/* ── Filter Toolbar & Provider Scoping ── */}
      <Panel index={0} className="mb-6 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Cloud Provider Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground mr-1 uppercase tracking-wider">
              Cloud Filter:
            </span>
            {[
              { id: "ALL", label: "All Frameworks (15+)" },
              ...(connectedProviders.length > 0
                ? [{ id: "ALL_SCANNED", label: `Scanned Clouds (${connectedProviders.join(", ")})` }]
                : []),
              { id: "AWS", label: "AWS" },
              { id: "OCI", label: "Oracle Cloud (OCI)" },
              { id: "AZURE", label: "Azure" },
              { id: "GCP", label: "GCP" },
              { id: "KUBERNETES", label: "Kubernetes" },
              { id: "MULTI-CLOUD", label: "Global Standards (SOC 2, ISO, PCI)" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProviderFilter(p.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  selectedProviderFilter === p.id
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "border border-border bg-surface-2 text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Search & View Switcher */}
          <div className="flex items-center gap-3">
            <div className="relative min-w-[200px] flex-1 sm:flex-initial">
              <Search className="absolute top-3 left-3 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search frameworks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-surface-2/60 pr-3 pl-9 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
              />
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2/40 p-1 text-xs">
              <button
                onClick={() => setActiveTab("cards")}
                className={`h-7 rounded-md px-3 text-xs font-semibold transition-all ${
                  activeTab === "cards"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Cards ({displayedFrameworks.length})
              </button>
              <button
                onClick={() => setActiveTab("matrix")}
                className={`h-7 rounded-md px-3 text-xs font-semibold transition-all ${
                  activeTab === "matrix"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Matrix View
              </button>
            </div>
          </div>
        </div>
      </Panel>

      {/* ── Status Banner: Fresh vs Audited ── */}
      {!hasScannedData && (
        <Panel index={1} className="mb-6 p-5 bg-surface-2/30 border-primary/20">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground">
                  Continuous Compliance Engine Ready
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Frameworks are pre-mapped for your multi-cloud environment. Run a scan to evaluate live passing controls.
                </p>
              </div>
            </div>
            <Link
              to="/scans"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-4 text-xs font-bold text-primary hover:bg-primary/20 transition-all shrink-0"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Launch Scan Now</span>
            </Link>
          </div>
        </Panel>
      )}

      {/* ── Framework Cards Grid ── */}
      {activeTab === "cards" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayedFrameworks.map((fw, i) => {
            const liveData = liveComplianceMap.get(fw.id.toLowerCase());
            const hasData = !!liveData && liveData.total > 0;
            const pct = hasData ? Math.round(liveData.passRate * 100) : null;

            return (
              <Panel
                key={fw.id}
                index={i}
                className="flex flex-col justify-between p-5 transition-all hover:border-primary/50"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="mono rounded bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-primary">
                          {fw.provider}
                        </span>
                        <span className="mono text-[10px] text-muted-foreground font-semibold">
                          {fw.version}
                        </span>
                      </div>
                      <h3 className="mt-2 font-display text-sm font-bold text-foreground leading-snug">
                        {fw.name}
                      </h3>
                    </div>

                    {pct !== null ? (
                      <Chip tone={pct >= 80 ? "success" : pct >= 50 ? "warning" : "critical"}>
                        {pct}%
                      </Chip>
                    ) : (
                      <span className="rounded bg-surface-2 px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                        Ready to Audit
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {fw.description}
                  </p>

                  <div className="mt-4 space-y-2 rounded-lg border border-border/80 bg-surface-2/40 p-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Mapped Controls:</span>
                      <span className="mono font-semibold text-foreground">{fw.totalControls} Controls</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Compliance Status:</span>
                      <span className="font-semibold text-foreground">
                        {hasData ? (pct! >= 80 ? "Compliant" : "Needs Review") : "Pending Assessment"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                  <button
                    onClick={() => setSelectedFramework(fw.id)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    <span>Audit Breakdown</span>
                    <ChevronRight className="h-3 w-3" />
                  </button>
                  <Link
                    to="/findings"
                    className="text-xs text-muted-foreground hover:text-foreground font-medium"
                  >
                    View Findings →
                  </Link>
                </div>
              </Panel>
            );
          })}
        </div>
      ) : (
        /* ── Matrix View ── */
        <Panel index={2} className="overflow-x-auto p-0">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-surface-2/60 text-muted-foreground font-semibold">
              <tr>
                <th className="px-4 py-3">Framework Name</th>
                <th className="px-4 py-3">Cloud Provider</th>
                <th className="px-4 py-3">Benchmark Version</th>
                <th className="px-4 py-3">Total Controls</th>
                <th className="px-4 py-3">Audit State</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {displayedFrameworks.map((fw) => (
                <tr key={fw.id} className="hover:bg-surface-2/40 transition-colors">
                  <td className="px-4 py-3.5 font-bold text-foreground">{fw.name}</td>
                  <td className="px-4 py-3.5">
                    <span className="mono font-semibold text-primary">{fw.provider}</span>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-muted-foreground">{fw.version}</td>
                  <td className="px-4 py-3.5 font-mono font-semibold">{fw.totalControls}</td>
                  <td className="px-4 py-3.5">
                    <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground font-medium">
                      Ready to Audit
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      onClick={() => setSelectedFramework(fw.id)}
                      className="text-primary hover:underline font-semibold text-xs"
                    >
                      Audit Details →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* ── Framework Audit Detail Modal ── */}
      {selectedFramework && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-xl rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            {(() => {
              const fw = SUPPORTED_FRAMEWORKS.find((f) => f.id === selectedFramework);
              if (!fw) return null;
              const liveData = liveComplianceMap.get(fw.id.toLowerCase());
              const pct = liveData?.passRate ? Math.round(liveData.passRate * 100) : 0;

              return (
                <div>
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="mono rounded bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-primary">
                          {fw.provider}
                        </span>
                        <span className="mono text-[10px] text-muted-foreground font-semibold">
                          {fw.version}
                        </span>
                      </div>
                      <h3 className="font-display text-sm font-bold text-foreground mt-1">
                        {fw.name}
                      </h3>
                    </div>
                    <button
                      onClick={() => setSelectedFramework(null)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2"
                    >
                      ✕
                    </button>
                  </div>

                  <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                    {fw.description}
                  </p>

                  <div className="mt-4 space-y-2.5 max-h-[300px] overflow-y-auto pr-1 text-xs">
                    <div className="rounded-lg border border-border/80 bg-surface-2/40 p-3">
                      <div className="flex items-center justify-between font-semibold text-foreground">
                        <span>Identity, IAM & Access Control</span>
                        <Chip tone="success">Pre-Mapped</Chip>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        MFA enforcement, credential rotation, least-privilege IAM policies, and root account isolation.
                      </p>
                    </div>

                    <div className="rounded-lg border border-border/80 bg-surface-2/40 p-3">
                      <div className="flex items-center justify-between font-semibold text-foreground">
                        <span>Storage & Data Protection at Rest</span>
                        <Chip tone="info">Pre-Mapped</Chip>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Customer-managed KMS encryption, public access block enforcement, object versioning & lifecycle rules.
                      </p>
                    </div>

                    <div className="rounded-lg border border-border/80 bg-surface-2/40 p-3">
                      <div className="flex items-center justify-between font-semibold text-foreground">
                        <span>Logging, Audit Trails & Network Perimeter</span>
                        <Chip tone="info">Pre-Mapped</Chip>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        VPC Flow Logs, CloudTrail / Audit Service multi-region logging, security list ingress restrictions.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-end gap-3 border-t border-border pt-3">
                    <button
                      onClick={() => setSelectedFramework(null)}
                      className="h-9 rounded-lg border border-border bg-surface-2 px-5 text-xs font-semibold text-foreground hover:bg-surface-2/80"
                    >
                      Close
                    </button>
                    <Link
                      to="/scans"
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      <span>Run Framework Audit</span>
                    </Link>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </AppShell>
  );
}
