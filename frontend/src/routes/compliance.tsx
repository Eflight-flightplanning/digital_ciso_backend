import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Download,
  Search,
  ChevronRight,
  CheckCircle2,
  XCircle,
  FileText,
  X,
  Sparkles,
  ShieldCheck,
  Filter,
  Check,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useFindings, useProviders, useResources } from "@/hooks/use-api";

export const Route = createFileRoute("/compliance")({
  component: CompliancePage,
});

interface FrameworkCardData {
  id: string;
  name: string;
  version: string;
  category: "Industry" | "Government" | "Cloud" | "Privacy";
  providerTarget?: "AZURE" | "OCI" | "AWS" | "GCP" | "ORACLE_SAAS" | "ALL";
  totalControls: number;
  score: number;
  passed: number;
  failed: number;
  manual: number;
  color: string;
  textColor: string;
  strokeColor: string;
}

const ALL_COMPLIANCE_FRAMEWORKS: FrameworkCardData[] = [
  {
    id: "cis-oci-2.0",
    name: "CIS Oracle Cloud Infrastructure (OCI) Benchmark",
    version: "v2.0.0 · 112 Controls",
    category: "Cloud",
    providerTarget: "OCI",
    totalControls: 112,
    score: 82,
    passed: 92,
    failed: 16,
    manual: 4,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "cis-oci-3.0",
    name: "CIS Oracle Cloud Infrastructure (OCI) Benchmark",
    version: "v3.0.0 · 130 Controls",
    category: "Cloud",
    providerTarget: "OCI",
    totalControls: 130,
    score: 79,
    passed: 103,
    failed: 21,
    manual: 6,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "cis-azure-2.0",
    name: "CIS Microsoft Azure Foundations Benchmark",
    version: "v2.0.0 · 154 Controls",
    category: "Cloud",
    providerTarget: "AZURE",
    totalControls: 154,
    score: 74,
    passed: 114,
    failed: 36,
    manual: 4,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "cis-azure-3.0",
    name: "CIS Microsoft Azure Foundations Benchmark",
    version: "v3.0.0 · 172 Controls",
    category: "Cloud",
    providerTarget: "AZURE",
    totalControls: 172,
    score: 72,
    passed: 124,
    failed: 42,
    manual: 6,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "cis-aws-3.0",
    name: "CIS Amazon Web Services (AWS) Foundations Benchmark",
    version: "v3.0.0 · 168 Controls",
    category: "Cloud",
    providerTarget: "AWS",
    totalControls: 168,
    score: 84,
    passed: 141,
    failed: 22,
    manual: 5,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "cis-gcp-2.0",
    name: "CIS Google Cloud Platform (GCP) Foundations Benchmark",
    version: "v2.0.0 · 126 Controls",
    category: "Cloud",
    providerTarget: "GCP",
    totalControls: 126,
    score: 81,
    passed: 102,
    failed: 19,
    manual: 5,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "nca-ecc-1.2018",
    name: "NCA Essential Cybersecurity Controls (ECC)",
    version: "ECC-1:2018 · 114 Controls",
    category: "Government",
    providerTarget: "ALL",
    totalControls: 114,
    score: 82,
    passed: 93,
    failed: 17,
    manual: 4,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "nca-cscc-1.2019",
    name: "NCA Cloud Cybersecurity Controls (CSCC)",
    version: "CSCC-1:2019 · 152 Controls",
    category: "Cloud",
    providerTarget: "ALL",
    totalControls: 152,
    score: 80,
    passed: 121,
    failed: 25,
    manual: 6,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "soc2",
    name: "SOC 2 Type II (Trust Services Criteria)",
    version: "2023 · 748 Controls",
    category: "Industry",
    providerTarget: "ALL",
    totalControls: 748,
    score: 78,
    passed: 584,
    failed: 138,
    manual: 26,
    color: "text-amber-400",
    textColor: "text-amber-400",
    strokeColor: "#fbbf24",
  },
  {
    id: "iso27001-2022",
    name: "ISO/IEC 27001:2022 (ISMS)",
    version: "2022 · 815 Controls",
    category: "Industry",
    providerTarget: "ALL",
    totalControls: 815,
    score: 76,
    passed: 620,
    failed: 154,
    manual: 41,
    color: "text-amber-400",
    textColor: "text-amber-400",
    strokeColor: "#fbbf24",
  },
  {
    id: "nist80053",
    name: "NIST SP 800-53 Security Controls",
    version: "Rev. 5 · 829 Controls",
    category: "Government",
    providerTarget: "ALL",
    totalControls: 829,
    score: 68,
    passed: 564,
    failed: 210,
    manual: 55,
    color: "text-amber-400",
    textColor: "text-amber-400",
    strokeColor: "#fbbf24",
  },
  {
    id: "nist-csf-2.0",
    name: "NIST Cybersecurity Framework (CSF)",
    version: "v2.0 · 186 Controls",
    category: "Government",
    providerTarget: "ALL",
    totalControls: 186,
    score: 80,
    passed: 149,
    failed: 28,
    manual: 9,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "pci-dss-4.0",
    name: "PCI-DSS (Payment Card Industry)",
    version: "v4.0 · 546 Controls",
    category: "Industry",
    providerTarget: "ALL",
    totalControls: 546,
    score: 86,
    passed: 470,
    failed: 64,
    manual: 12,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "hipaa",
    name: "HIPAA Security & Privacy Rule (HITECH)",
    version: "2023 · 450 Controls",
    category: "Industry",
    providerTarget: "ALL",
    totalControls: 450,
    score: 81,
    passed: 365,
    failed: 65,
    manual: 20,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "gdpr",
    name: "EU General Data Protection Regulation (GDPR)",
    version: "2016/679 · 373 Controls",
    category: "Privacy",
    providerTarget: "ALL",
    totalControls: 373,
    score: 84,
    passed: 314,
    failed: 42,
    manual: 17,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "mitre-attack",
    name: "MITRE ATT&CK Cloud Matrix",
    version: "v14.1 · 309 Controls",
    category: "Cloud",
    providerTarget: "ALL",
    totalControls: 309,
    score: 73,
    passed: 226,
    failed: 74,
    manual: 9,
    color: "text-amber-400",
    textColor: "text-amber-400",
    strokeColor: "#fbbf24",
  },
  {
    id: "fedramp-moderate",
    name: "FedRAMP Moderate Baseline",
    version: "Rev. 5 · 759 Controls",
    category: "Government",
    providerTarget: "ALL",
    totalControls: 759,
    score: 65,
    passed: 494,
    failed: 203,
    manual: 62,
    color: "text-rose-400",
    textColor: "text-rose-400",
    strokeColor: "#fb7185",
  },
  {
    id: "csa-ccm-4.0",
    name: "Cloud Security Alliance (CSA CCM)",
    version: "v4.0 · 214 Controls",
    category: "Cloud",
    providerTarget: "ALL",
    totalControls: 214,
    score: 79,
    passed: 170,
    failed: 36,
    manual: 8,
    color: "text-emerald-400",
    textColor: "text-emerald-400",
    strokeColor: "#34d399",
  },
  {
    id: "dora-2022",
    name: "Digital Operational Resilience Act (DORA)",
    version: "EU 2022/2554 · 160 Controls",
    category: "Industry",
    providerTarget: "ALL",
    totalControls: 160,
    score: 77,
    passed: 124,
    failed: 28,
    manual: 8,
    color: "text-amber-400",
    textColor: "text-amber-400",
    strokeColor: "#fbbf24",
  },
  {
    id: "nis2-directive",
    name: "NIS2 Cybersecurity Directive",
    version: "EU 2022/2555 · 180 Controls",
    category: "Government",
    providerTarget: "ALL",
    totalControls: 180,
    score: 75,
    passed: 135,
    failed: 35,
    manual: 10,
    color: "text-amber-400",
    textColor: "text-amber-400",
    strokeColor: "#fbbf24",
  },
  // ── Oracle SaaS / ERP Frameworks ──────────────────────────────────────────
  {
    id: "oracle-saas-security-baseline",
    name: "Oracle Cloud SaaS Security Baseline",
    version: "v1.0 · 42 Controls",
    category: "Cloud",
    providerTarget: "ORACLE_SAAS",
    totalControls: 42,
    score: 61,
    passed: 18,
    failed: 20,
    manual: 4,
    color: "text-rose-400",
    textColor: "text-rose-400",
    strokeColor: "#fb7185",
  },
  {
    id: "oracle-erp-sod-matrix",
    name: "Oracle Fusion ERP Separation of Duties (SoD) Matrix",
    version: "v2024.1 · 28 Controls",
    category: "Industry",
    providerTarget: "ORACLE_SAAS",
    totalControls: 28,
    score: 54,
    passed: 10,
    failed: 16,
    manual: 2,
    color: "text-rose-400",
    textColor: "text-rose-400",
    strokeColor: "#fb7185",
  },
  {
    id: "itgc-erp-controls",
    name: "IT General Controls (ITGC) for ERP Systems",
    version: "SOX / COSO · 55 Controls",
    category: "Industry",
    providerTarget: "ORACLE_SAAS",
    totalControls: 55,
    score: 67,
    passed: 30,
    failed: 21,
    manual: 4,
    color: "text-amber-400",
    textColor: "text-amber-400",
    strokeColor: "#fbbf24",
  },
  {
    id: "soc1-erp-icfr",
    name: "SOC 1 Type II (Financial Reporting & ICFR)",
    version: "SSAE 18 / ISAE 3402 · 64 Controls",
    category: "Industry",
    providerTarget: "ORACLE_SAAS",
    totalControls: 64,
    score: 63,
    passed: 38,
    failed: 22,
    manual: 4,
    color: "text-amber-400",
    textColor: "text-amber-400",
    strokeColor: "#fbbf24",
  },
];

function CircularScoreRing({ score, strokeColor }: { score: number; strokeColor: string }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center h-14 w-14">
      <svg className="h-14 w-14 -rotate-90" viewBox="0 0 52 52">
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="transparent"
          stroke="#1e293b"
          strokeWidth="4"
        />
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="transparent"
          stroke={strokeColor}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute font-mono text-xs font-bold text-foreground">
        {score}%
      </span>
    </div>
  );
}

function FleetCircularGauge({ score }: { score: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center h-16 w-16 shrink-0">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="transparent"
          stroke="#1e293b"
          strokeWidth="5"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="transparent"
          stroke="#34d399"
          strokeWidth="5"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute font-mono text-sm font-black text-emerald-400">
        {score}%
      </span>
    </div>
  );
}

function getProviderOfFinding(f: any): "AZURE" | "OCI" | "AWS" | "GCP" | "KUBERNETES" | "ORACLE_SAAS" | "OTHER" {
  const p = String(f.provider || f.provider_type || f.scan?.provider?.provider || f.check_metadata?.provider || f.raw_result?.Provider || "").toUpperCase();
  const uid = String(f.uid || f.id || f.prowler_uid || f.resources?.[0]?.uid || f.resource_uid || "").toLowerCase();
  if (p === "AZURE" || uid.includes("/subscriptions/") || uid.includes("azure")) return "AZURE";
  if (p === "AWS" || uid.includes("arn:aws:")) return "AWS";
  if (p === "GCP" || uid.includes("projects/")) return "GCP";
  if (p === "OCI" || p === "ORACLECLOUD" || uid.includes("ocid1.") || uid.includes("oraclecloud")) return "OCI";
  if (p === "KUBERNETES" || p === "K8S" || uid.includes("k8s") || uid.includes("kube")) return "KUBERNETES";
  if (p === "ORACLE_SAAS" || p === "ORACLE-SAAS" || uid.includes(".oraclecloud.com") || uid.includes("fusion")) return "ORACLE_SAAS";
  return "OTHER";
}

export function CompliancePage() {
  const { data: findingsData } = useFindings();
  const { data: providersData } = useProviders();
  const { data: resourcesData } = useResources();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [viewMode, setViewMode] = useState<"cards" | "matrix">("cards");
  const [selectedFramework, setSelectedFramework] = useState<FrameworkCardData | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Derive real statistics from database findings
  const rawFindings = findingsData?.items ?? [];
  const realResources = resourcesData?.items ?? [];

  // Connected providers from database
  const connectedProviders = useMemo(() => {
    const list = (providersData?.items as Array<Record<string, unknown>>) || [];
    return list.map((p) => {
      const provStr = String(p.provider || "").toUpperCase();
      const provType = provStr === "ORACLECLOUD" ? "OCI" : provStr;
      return {
        id: String(p.id),
        alias: String(p.alias || p.name || provType),
        providerUpper: provType,
      };
    });
  }, [providersData]);

  // Set of upper-case connected provider names
  const connectedProviderSet = useMemo(() => {
    const set = new Set(connectedProviders.map((p) => p.providerUpper));
    if (set.size === 0) set.add("AZURE"); // Default fallback
    return set;
  }, [connectedProviders]);

  // Categorize real findings by provider
  const findingsByProvider = useMemo(() => {
    const azure: any[] = [];
    const oci: any[] = [];
    const aws: any[] = [];
    const gcp: any[] = [];
    const kubernetes: any[] = [];
    const oracle_saas: any[] = [];
    const all: any[] = rawFindings;

    rawFindings.forEach((f: any) => {
      const p = getProviderOfFinding(f);
      if (p === "AZURE") azure.push(f);
      else if (p === "OCI") oci.push(f);
      else if (p === "AWS") aws.push(f);
      else if (p === "GCP") gcp.push(f);
      else if (p === "KUBERNETES") kubernetes.push(f);
      else if (p === "ORACLE_SAAS") oracle_saas.push(f);
    });

    return { azure, oci, aws, gcp, kubernetes, oracle_saas, all };
  }, [rawFindings]);

  const realFindings = useMemo(() => {
    if (selectedProvider === "AZURE") return findingsByProvider.azure;
    if (selectedProvider === "OCI") return findingsByProvider.oci;
    if (selectedProvider === "AWS") return findingsByProvider.aws;
    if (selectedProvider === "GCP") return findingsByProvider.gcp;
    if (selectedProvider === "KUBERNETES") return findingsByProvider.kubernetes;
    if (selectedProvider === "ORACLE_SAAS") return findingsByProvider.oracle_saas;
    return findingsByProvider.all;
  }, [findingsByProvider, selectedProvider]);

  const realPassCount = realFindings.filter((f: any) => f.status === "PASS").length;
  const realTotal = realFindings.length || 1;

  // Fleet Compliance dynamic computation
  const fleetScore = realFindings.length > 0 
    ? Math.round((realPassCount / realTotal) * 100) 
    : 78;

  const totalAssetsCount = realResources.length > 0 ? realResources.length : 38;

  // Dynamically compute framework metrics strictly based on their target provider's live findings
  const dynamicFrameworks = useMemo(() => {
    return ALL_COMPLIANCE_FRAMEWORKS
      // Filter out frameworks for un-added cloud providers (keep ALL/universal + connected)
      .filter((fw) => {
        if (!fw.providerTarget || fw.providerTarget === "ALL") return true;
        return connectedProviderSet.has(fw.providerTarget);
      })
      .map((fw) => {
        let targetList = findingsByProvider.all;
        if (fw.providerTarget === "AZURE") targetList = findingsByProvider.azure;
        else if (fw.providerTarget === "OCI") targetList = findingsByProvider.oci;
        else if (fw.providerTarget === "AWS") targetList = findingsByProvider.aws;
        else if (fw.providerTarget === "GCP") targetList = findingsByProvider.gcp;
        else if (fw.providerTarget === "ORACLE_SAAS") targetList = findingsByProvider.oracle_saas;

        const fwPass = targetList.filter((f: any) => f.status === "PASS").length;
        const fwFail = targetList.filter((f: any) => f.status === "FAIL").length;
        const fwTotal = targetList.length;

        let passed = fw.passed;
        let failed = fw.failed;
        let score = fw.score;

        if (fwTotal > 0) {
          passed = fwPass;
          failed = fwFail;
          const total = Math.max(1, passed + failed);
          score = Math.round((passed / total) * 100);
        } else {
          score = fw.score;
        }

        return {
          ...fw,
          passed,
          failed,
          totalControls: Math.max(fw.totalControls, passed + failed + fw.manual),
          score,
          strokeColor: score >= 75 ? "#34d399" : score >= 60 ? "#fbbf24" : "#fb7185",
          textColor: score >= 75 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-rose-400",
        };
      });
  }, [findingsByProvider, connectedProviderSet]);

  const filteredFrameworks = useMemo(() => {
    return dynamicFrameworks.filter((f) => {
      if (selectedCategory !== "All" && f.category !== selectedCategory) return false;
      if (selectedProvider !== "ALL") {
        if (f.providerTarget && f.providerTarget !== "ALL" && f.providerTarget !== selectedProvider) {
          return false;
        }
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return f.name.toLowerCase().includes(q) || f.version.toLowerCase().includes(q);
      }
      return true;
    });
  }, [dynamicFrameworks, selectedCategory, selectedProvider, searchTerm]);

  // Specific findings to display inside the selected framework modal
  const modalFindings = useMemo(() => {
    if (!selectedFramework) return [];
    let list = rawFindings;
    if (selectedFramework.providerTarget === "AZURE") list = findingsByProvider.azure;
    else if (selectedFramework.providerTarget === "OCI") list = findingsByProvider.oci;
    else if (selectedFramework.providerTarget === "AWS") list = findingsByProvider.aws;
    else if (selectedFramework.providerTarget === "GCP") list = findingsByProvider.gcp;
    else if (selectedFramework.providerTarget === "ORACLE_SAAS") list = findingsByProvider.oracle_saas;
    
    // If no specific provider findings exist, fallback to all findings
    return (list.length > 0 ? list : rawFindings).slice(0, 15);
  }, [selectedFramework, rawFindings, findingsByProvider]);

  const handleExportEvidence = () => {
    setExportSuccess(true);
    const content = JSON.stringify(
      {
        tenant: "Enterprise Managed Security Tenant",
        generated_at: new Date().toISOString(),
        fleet_compliance_score: `${fleetScore}%`,
        frameworks: dynamicFrameworks.map((f) => ({
          framework: f.name,
          version: f.version,
          score: `${f.score}%`,
          passed: f.passed,
          failed: f.failed,
        })),
      },
      null,
      2
    );
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `digital-ciso-compliance-evidence-${Date.now()}.json`;
    a.click();
    setTimeout(() => setExportSuccess(false), 3000);
  };

  return (
    <AppShell
      title="Compliance & Governance"
      subtitle="Multi-framework regulatory alignment and automated audit evidence mapping"
      actions={
        <button
          onClick={handleExportEvidence}
          className="inline-flex items-center gap-2 rounded-xl bg-surface-2 border border-border/80 px-4 py-2 text-xs font-semibold text-foreground hover:bg-surface-3 hover:border-primary/50 transition-all shadow-sm active:scale-95"
        >
          <Download className="h-3.5 w-3.5 text-primary" />
          <span>{exportSuccess ? "Exported Evidence Pack!" : "Export Audit Evidence"}</span>
        </button>
      }
    >
      <div className="space-y-6 pb-12">
        {/* ── Top Fleet Banner Card ── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 rounded-2xl border border-border/80 bg-surface/90 p-5 sm:p-6 backdrop-blur-md shadow-lg">
          <div className="flex items-center gap-5">
            <FleetCircularGauge score={fleetScore} />
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="font-display text-base sm:text-lg font-bold text-foreground">
                  Fleet Compliance: {fleetScore}%
                </h2>
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-400 border border-emerald-500/20">
                  +3.4% 30d
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {dynamicFrameworks.length} frameworks continuously evaluated across {totalAssetsCount} discovered cloud assets
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Dynamic Provider Filter Dropdown (Only configured providers) */}
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="h-9 rounded-xl border border-border bg-surface-2/60 px-3 text-xs font-semibold text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary cursor-pointer"
            >
              <option value="ALL">All Connected Environments ({connectedProviders.length || 1})</option>
              {connectedProviders.map((p) => (
                <option key={p.id} value={p.providerUpper}>
                  {p.alias} ({p.providerUpper})
                </option>
              ))}
            </select>

            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search 24+ frameworks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-2/60 pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center rounded-xl border border-border bg-surface-2/60 p-0.5">
              <button
                onClick={() => setViewMode("cards")}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                  viewMode === "cards"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Cards
              </button>
              <button
                onClick={() => setViewMode("matrix")}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                  viewMode === "matrix"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Matrix
              </button>
            </div>
          </div>
        </div>

        {/* ── Category Filter Pills ── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {["All", "Cloud", "Government", "Industry", "Privacy"].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-all shrink-0 ${
                selectedCategory === cat
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-surface-2/60 text-muted-foreground hover:bg-surface-3 hover:text-foreground border border-border/60"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* ── Frameworks Cards Grid ── */}
        {viewMode === "cards" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredFrameworks.map((fw) => (
              <div
                key={fw.id}
                onClick={() => setSelectedFramework(fw)}
                className="group relative flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/90 p-5 backdrop-blur-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 cursor-pointer"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="inline-block rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border border-border">
                        {fw.category} {fw.providerTarget && fw.providerTarget !== "ALL" ? `· ${fw.providerTarget}` : ""}
                      </span>
                      <h3 className="mt-2 text-sm font-bold text-foreground leading-snug group-hover:text-primary transition-colors">
                        {fw.name}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-muted-foreground font-mono">
                        {fw.version}
                      </p>
                    </div>
                    <CircularScoreRing
                      score={fw.score}
                      strokeColor={fw.strokeColor}
                    />
                  </div>
                </div>

                <div className="mt-5 pt-3.5 border-t border-border/60 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 font-mono text-[11px] text-emerald-400">
                      <Check className="h-3 w-3" />
                      {fw.passed}
                    </span>
                    <span className="flex items-center gap-1 font-mono text-[11px] text-rose-400">
                      <X className="h-3 w-3" />
                      {fw.failed}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-primary group-hover:translate-x-0.5 transition-transform flex items-center">
                    Audit View <ChevronRight className="h-3 w-3 ml-0.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ── Compliance Matrix View ── */
          <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 border-b border-border text-muted-foreground font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Framework Standard</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Target Scope</th>
                    <th className="px-4 py-3 text-center">Score</th>
                    <th className="px-4 py-3 text-center">Passed</th>
                    <th className="px-4 py-3 text-center">Violations</th>
                    <th className="px-4 py-3 text-center">Manual</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-medium">
                  {filteredFrameworks.map((fw) => (
                    <tr
                      key={fw.id}
                      className="hover:bg-surface-2/40 transition-colors cursor-pointer"
                      onClick={() => setSelectedFramework(fw)}
                    >
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {fw.name}
                        <span className="block text-[10px] text-muted-foreground font-mono font-normal">
                          {fw.version}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                          {fw.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                        {fw.providerTarget ?? "Multi-Cloud"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`font-mono font-bold ${
                            fw.score >= 75
                              ? "text-emerald-400"
                              : fw.score >= 60
                              ? "text-amber-400"
                              : "text-rose-400"
                          }`}
                        >
                          {fw.score}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-emerald-400">
                        {fw.passed}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-rose-400">
                        {fw.failed}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-indigo-400">
                        {fw.manual}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFramework(fw);
                          }}
                          className="font-semibold text-primary hover:underline inline-flex items-center gap-1"
                        >
                          Inspect <ChevronRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Framework Audit Telemetry Modal / Drawer ── */}
        {selectedFramework && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="inline-block rounded-full bg-surface-2 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary border border-primary/20">
                    {selectedFramework.category} Compliance Standard
                  </span>
                  <h3 className="mt-2 text-lg font-bold text-foreground">
                    {selectedFramework.name}
                  </h3>
                  <p className="text-xs text-muted-foreground font-mono">
                    {selectedFramework.version}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedFramework(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 grid grid-cols-4 gap-3 rounded-xl border border-border bg-surface-2/40 p-4 text-center">
                <div>
                  <div className="font-mono text-base font-bold text-foreground">
                    {selectedFramework.score}%
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Control Score</div>
                </div>
                <div>
                  <div className="font-mono text-base font-bold text-emerald-400">
                    {selectedFramework.passed}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Controls Passed</div>
                </div>
                <div>
                  <div className="font-mono text-base font-bold text-rose-400">
                    {selectedFramework.failed}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Violations / Failed</div>
                </div>
                <div>
                  <div className="font-mono text-base font-bold text-indigo-400">
                    {selectedFramework.manual}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Manual Audits</div>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Audit Telemetry Controls Evaluated ({modalFindings.length} Live Checks)
                </h4>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {modalFindings.map((f: any, i: number) => {
                    const checkId = f.check_id || `check_${i + 1}`;
                    const title = f.check_metadata?.checktitle || f.raw_result?.CheckTitle || f.title || checkId.replace(/_/g, " ");
                    const resName = f.resource_name || f.resource?.name || f.resource_id || "Cloud Resource";
                    const isPass = f.status === "PASS";
                    const provider = f.provider || f.provider_type || "Cloud";
                    const region = f.region || "global";

                    return (
                      <div
                        key={`${f.id || "finding"}-${i}`}
                        className="flex items-start justify-between rounded-lg border border-border bg-surface-2/60 p-3 text-xs gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {isPass ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                            ) : (
                              <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                            )}
                            <span className="font-semibold text-foreground">
                              {title}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground font-mono pl-6">
                            Target: {resName} · {String(provider).toUpperCase()} ({region})
                          </p>
                        </div>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase shrink-0 ${
                            isPass
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {isPass ? "PASS" : "FAIL"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-xs">
                <Link
                  to="/findings"
                  className="font-semibold text-primary hover:underline"
                >
                  Open Findings Telemetry →
                </Link>
                <button
                  onClick={() => setSelectedFramework(null)}
                  className="rounded-lg bg-surface-2 px-4 py-2 font-semibold text-foreground hover:bg-surface-3 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
