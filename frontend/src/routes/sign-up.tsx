import { useState, useEffect, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Lock,
  Mail,
  ArrowRight,
  ArrowLeft,
  Building,
  User,
  AlertCircle,
  Eye,
  EyeOff,
  Sun,
  Moon,
  ShieldCheck,
  CheckCircle2,
  Cloud,
  Check,
  Sparkles,
  Layers,
  FileCheck2,
  Zap,
} from "lucide-react";
import { ShieldMark } from "@/components/brand/Logo";
import { authStore } from "@/lib/auth";

export const Route = createFileRoute("/sign-up")({
  component: SignUpPage,
});

interface CloudOption {
  id: string;
  name: string;
  tagline: string;
  badge: string;
  accent: string;
  iconBg: string;
}

const CLOUD_OPTIONS: CloudOption[] = [
  {
    id: "azure",
    name: "Microsoft Azure",
    tagline: "Entra ID, Virtual Machines, Blob Storage, NSGs & Subscriptions",
    badge: "Enterprise Hyper-scaler",
    accent: "from-blue-500/20 to-cyan-500/10 border-blue-500/40 text-blue-400",
    iconBg: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  {
    id: "oraclecloud",
    name: "Oracle Cloud (OCI)",
    tagline: "Compartments, Autonomous DB, VCNs, IAM Policies & Object Storage",
    badge: "Enterprise High-Perf",
    accent: "from-red-500/20 to-amber-500/10 border-red-500/40 text-red-400",
    iconBg: "bg-red-500/15 text-red-400 border-red-500/30",
  },
  {
    id: "aws",
    name: "Amazon Web Services (AWS)",
    tagline: "IAM Roles, S3 Buckets, EC2, CloudTrail, VPCs & Security Groups",
    badge: "Global Hyper-scaler",
    accent: "from-amber-500/20 to-orange-500/10 border-amber-500/40 text-amber-400",
    iconBg: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  {
    id: "kubernetes",
    name: "Kubernetes (K8s)",
    tagline: "Cluster Security, Pod Security Admission, RBAC & Node Auditing",
    badge: "Cloud-Native",
    accent: "from-indigo-500/20 to-blue-500/10 border-indigo-500/40 text-indigo-400",
    iconBg: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  },
  {
    id: "oracle_saas",
    name: "Oracle Fusion SaaS",
    tagline: "ERP/HCM Dormant Users, SoD Conflict Matrices & Identity Governance",
    badge: "Business Applications",
    accent: "from-emerald-500/20 to-teal-500/10 border-emerald-500/40 text-emerald-400",
    iconBg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  {
    id: "gcp",
    name: "Google Cloud Platform",
    tagline: "GKE Clusters, Cloud Storage, BigQuery & Organization IAM",
    badge: "Hyper-scaler",
    accent: "from-green-500/20 to-emerald-500/10 border-green-500/40 text-green-400",
    iconBg: "bg-green-500/15 text-green-400 border-green-500/30",
  },
];

interface FrameworkOption {
  id: string;
  name: string;
  category: string;
  provider: string; // "azure" | "oraclecloud" | "aws" | "kubernetes" | "universal"
  description: string;
}

const FRAMEWORK_OPTIONS: FrameworkOption[] = [
  // Azure specific
  {
    id: "cis_2.0_azure",
    name: "CIS Microsoft Azure Foundations Benchmark v2.0",
    category: "Cloud Benchmark",
    provider: "azure",
    description: "Prescriptive security configuration baseline for Entra ID, storage, logging and network.",
  },
  {
    id: "nca_ecc_2.2024_azure",
    name: "NCA Essential Cybersecurity Controls (ECC 2.2024) - Azure",
    category: "Government & Regulatory",
    provider: "azure",
    description: "Saudi National Cybersecurity Authority mandatory baseline controls mapped to Azure.",
  },
  {
    id: "nca_cscc_1.2023_azure",
    name: "NCA Critical Systems Controls (CSCC 1.2023)",
    category: "Government & Regulatory",
    provider: "azure",
    description: "Rigorous cybersecurity controls for critical infrastructure and mission-critical cloud workloads.",
  },
  // OCI specific
  {
    id: "cis_2.0_oraclecloud",
    name: "CIS Oracle Cloud Infrastructure (OCI) Benchmark v2.0",
    category: "Cloud Benchmark",
    provider: "oraclecloud",
    description: "Identity, compartments, Object Storage, VCN security lists and audit log retention.",
  },
  {
    id: "nca_ecc_2.2024_oraclecloud",
    name: "NCA Essential Cybersecurity Controls (ECC 2.2024) - OCI",
    category: "Government & Regulatory",
    provider: "oraclecloud",
    description: "NCA baseline cybersecurity requirements verified across Oracle Cloud tenancies.",
  },
  // AWS specific
  {
    id: "cis_3.0_aws",
    name: "CIS Amazon Web Services Benchmark v3.0",
    category: "Cloud Benchmark",
    provider: "aws",
    description: "Benchmark for IAM password policy, multi-factor auth, CloudTrail trails and VPC peering.",
  },
  {
    id: "nca_ecc_2.2024_aws",
    name: "NCA Essential Cybersecurity Controls (ECC 2.2024) - AWS",
    category: "Government & Regulatory",
    provider: "aws",
    description: "National cybersecurity compliance requirements applied across AWS accounts and VPCs.",
  },
  // Kubernetes specific
  {
    id: "cis_1.8_kubernetes",
    name: "CIS Kubernetes Benchmark v1.8",
    category: "Cloud Benchmark",
    provider: "kubernetes",
    description: "Security standards for API server, controller manager, kubelet, and etcd data protection.",
  },
  // Universal
  {
    id: "soc2_type2",
    name: "SOC 2 Type II Security & Confidentiality",
    category: "Industry Standard",
    provider: "universal",
    description: "Trust Services Criteria evaluation across multi-cloud infrastructure and access controls.",
  },
  {
    id: "iso_27001_2022",
    name: "ISO/IEC 27001:2022 ISMS Baseline",
    category: "International Standard",
    provider: "universal",
    description: "International standard for information security management systems in enterprise cloud.",
  },
  {
    id: "pci_dss_4.0",
    name: "PCI-DSS v4.0 Payment Card Industry",
    category: "Industry Standard",
    provider: "universal",
    description: "Data security requirements for processing, storing, or transmitting sensitive cardholder data.",
  },
];

function SignUpPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Step 1: Account
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Step 2: Cloud selection (default: Azure + OCI)
  const [selectedClouds, setSelectedClouds] = useState<string[]>(["azure", "oraclecloud"]);

  // Step 3: Compliance frameworks (default to CIS + NCA for selected)
  const [selectedCompliances, setSelectedCompliances] = useState<string[]>([
    "cis_2.0_azure",
    "nca_ecc_2.2024_azure",
    "cis_2.0_oraclecloud",
    "soc2_type2",
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── Theme State ── */
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem("dciso-theme");
    const dark = saved !== "light";
    setIsDark(dark);
    document.documentElement.classList.toggle("light", !dark);
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("light", !next);
      localStorage.setItem("dciso-theme", next ? "dark" : "light");
      return next;
    });
  };

  // Dynamically filter compliance frameworks based on chosen clouds + universal
  const eligibleFrameworks = useMemo(() => {
    return FRAMEWORK_OPTIONS.filter(
      (f) => f.provider === "universal" || selectedClouds.includes(f.provider)
    );
  }, [selectedClouds]);

  // Keep selected compliances in sync when clouds change
  const toggleCloud = (cloudId: string) => {
    setSelectedClouds((prev) => {
      const next = prev.includes(cloudId)
        ? prev.filter((c) => c !== cloudId)
        : [...prev, cloudId];

      // Auto-toggle relevant default compliances
      if (!prev.includes(cloudId)) {
        const defaultsForCloud = FRAMEWORK_OPTIONS.filter((f) => f.provider === cloudId).map((f) => f.id);
        setSelectedCompliances((curr) => Array.from(new Set([...curr, ...defaultsForCloud])));
      }
      return next;
    });
  };

  const toggleCompliance = (frameworkId: string) => {
    setSelectedCompliances((prev) =>
      prev.includes(frameworkId)
        ? prev.filter((id) => id !== frameworkId)
        : [...prev, frameworkId]
    );
  };

  const applyPreset = (preset: "azure" | "oci" | "azure_oci" | "all") => {
    if (preset === "azure") {
      setSelectedClouds(["azure"]);
      setSelectedCompliances(["cis_2.0_azure", "nca_ecc_2.2024_azure", "soc2_type2"]);
    } else if (preset === "oci") {
      setSelectedClouds(["oraclecloud"]);
      setSelectedCompliances(["cis_2.0_oraclecloud", "nca_ecc_2.2024_oraclecloud", "soc2_type2"]);
    } else if (preset === "azure_oci") {
      setSelectedClouds(["azure", "oraclecloud"]);
      setSelectedCompliances([
        "cis_2.0_azure",
        "nca_ecc_2.2024_azure",
        "cis_2.0_oraclecloud",
        "nca_ecc_2.2024_oraclecloud",
        "soc2_type2",
      ]);
    } else {
      setSelectedClouds(["azure", "oraclecloud", "aws", "kubernetes"]);
      setSelectedCompliances([
        "cis_2.0_azure",
        "cis_2.0_oraclecloud",
        "cis_3.0_aws",
        "cis_1.8_kubernetes",
        "soc2_type2",
        "iso_27001_2022",
      ]);
    }
  };

  const handleNextFromStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Please fill out all required account fields.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    setCurrentStep(2);
  };

  const handleNextFromStep2 = () => {
    setError(null);
    if (selectedClouds.length === 0) {
      setError("Please select at least 1 cloud provider environment for your tenant.");
      return;
    }
    setCurrentStep(3);
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      if (selectedCompliances.length === 0) {
        setError("Please select at least 1 compliance framework.");
        setLoading(false);
        return;
      }

      const orgName = org.trim() || `${name.split(" ")[0]}'s Organization`;
      await authStore.signUp(
        email,
        password,
        name,
        orgName,
        selectedClouds,
        selectedCompliances
      );
      if (typeof window !== "undefined") {
        localStorage.setItem(
          "dciso_new_company_provisioning",
          JSON.stringify({
            companyName: orgName,
            timestamp: Date.now(),
          })
        );
      }
      navigate({ to: "/dashboard" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      setError(msg);
      setLoading(false);
    }
  };

  const passwordStrength = Math.min(
    100,
    (password.length > 8 ? 40 : 10) +
      (/[A-Z]/.test(password) ? 20 : 0) +
      (/[0-9]/.test(password) ? 20 : 0) +
      (/[^A-Za-z0-9]/.test(password) ? 20 : 0)
  );

  return (
    <div
      className={`relative flex min-h-screen flex-col justify-between font-sans antialiased overflow-hidden transition-colors duration-300 ${
        isDark ? "bg-background text-foreground" : "bg-background text-foreground"
      }`}
    >
      {/* ── Background Gradients & Ambient Dot Drift ── */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className={`absolute -left-40 top-[-10%] h-[34rem] w-[34rem] rounded-full blur-[140px] ${isDark ? "bg-[#0A6EDD]/20" : "bg-[#0A6EDD]/15"}`} />
        <div className={`absolute -right-32 top-[15%] h-[30rem] w-[30rem] rounded-full blur-[140px] ${isDark ? "bg-cyan-500/15" : "bg-cyan-500/12"}`} />
        <div
          className={`absolute inset-0 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)] ${
            isDark
              ? "bg-[radial-gradient(circle,rgba(255,255,255,0.035)_1px,transparent_1px)]"
              : "bg-[radial-gradient(circle,rgba(15,23,42,0.06)_1px,transparent_1px)]"
          } bg-[size:24px_24px]`}
        />
      </div>

      {/* ── Top Utility Bar: Back Link & Theme Switcher ── */}
      <header className="relative z-10 mx-auto flex w-full max-w-[1400px] items-center justify-between p-6 sm:px-10">
        <Link
          to="/"
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition-all hover:-translate-y-0.5 active:scale-95 ${
            isDark
              ? "border-white/15 bg-white/[0.04] text-slate-300 hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
              : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 shadow-xs"
          }`}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Overview</span>
        </Link>

        <div className="flex items-center gap-3">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            Tenant Modularity Setup
          </span>
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-200 active:scale-95 cursor-pointer ${
              isDark
                ? "border-white/15 bg-white/[0.05] text-amber-300 hover:bg-white/10"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 shadow-xs"
            }`}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* ── Main Registration Card ── */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-6">
        <div className="w-full max-w-[680px]">
          {/* Brand Header */}
          <div className="mb-5 text-center">
            <Link to="/" className="inline-flex items-center justify-center transition-transform hover:scale-105">
              <ShieldMark size={44} />
            </Link>
            <h1 className={`mt-2.5 text-2xl font-black tracking-tight leading-none ${isDark ? "text-white" : "text-slate-950"}`}>
              DIGITAL <span className="text-primary font-black">CISO</span>
            </h1>
            <p className="mt-1 text-xs font-bold text-primary tracking-wide">
              Modular Security & Multi-Cloud Posture Pod
            </p>
          </div>

          {/* Stepper Progress Bar */}
          <div className="mb-4 flex items-center justify-between px-2">
            {[
              { num: 1, label: "Account Details", icon: User },
              { num: 2, label: "Select Clouds", icon: Cloud },
              { num: 3, label: "Compliance Scope", icon: FileCheck2 },
            ].map((step, idx) => {
              const Icon = step.icon;
              const isCurrent = currentStep === step.num;
              const isDone = currentStep > step.num;
              return (
                <div key={step.num} className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black transition-all ${
                      isDone
                        ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                        : isCurrent
                        ? "bg-cyan-500 text-white ring-4 ring-cyan-500/20 shadow-md shadow-cyan-500/30"
                        : isDark
                        ? "bg-white/10 text-slate-400 border border-white/10"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span
                    className={`hidden sm:inline text-xs font-bold ${
                      isCurrent
                        ? isDark ? "text-cyan-400" : "text-cyan-700"
                        : isDone
                        ? isDark ? "text-slate-300" : "text-slate-700"
                        : isDark ? "text-slate-500" : "text-slate-400"
                    }`}
                  >
                    {step.label}
                  </span>
                  {idx < 2 && (
                    <div
                      className={`mx-2 hidden sm:block h-[2px] w-12 rounded-full ${
                        currentStep > step.num ? "bg-emerald-500" : isDark ? "bg-white/10" : "bg-slate-200"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Glass Card */}
          <div
            className={`overflow-hidden rounded-3xl p-6 sm:p-8 transition-all ${
              isDark
                ? "border border-white/15 bg-white/[0.04] backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
                : "border border-slate-200/90 bg-white/95 backdrop-blur-2xl shadow-[0_20px_50px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/5"
            }`}
          >
            {/* Error Message */}
            {error && (
              <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-500">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* ══════════════ STEP 1: ACCOUNT DETAILS ══════════════ */}
            {currentStep === 1 && (
              <div>
                <div className={`border-b pb-4 mb-4 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                  <div className="flex items-center justify-between">
                    <h2 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-950"}`}>
                      Step 1 of 3: Organization & Administrator
                    </h2>
                    <span className="text-[11px] font-bold text-cyan-400">Step 1</span>
                  </div>
                  <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                    Create your security officer profile. In the next step, select only your cloud providers.
                  </p>
                </div>

                <form onSubmit={handleNextFromStep1} className="space-y-3.5 text-xs">
                  <div>
                    <label className={`mb-1.5 block font-bold uppercase tracking-wider text-[11px] ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                      Full Name *
                    </label>
                    <div className="relative">
                      <User className={`absolute top-3 left-3.5 h-4 w-4 ${isDark ? "text-slate-500" : "text-slate-400"}`} />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Alex Morgan"
                        className={`h-11 w-full rounded-xl border pr-3.5 pl-10 text-xs font-medium outline-none transition-all ${
                          isDark
                            ? "border-white/10 bg-white/[0.03] text-white placeholder-slate-500 focus:border-cyan-500 focus:bg-white/[0.06] focus:ring-2 focus:ring-cyan-500/20"
                            : "border-slate-300 bg-slate-50/70 text-slate-900 placeholder-slate-400 focus:border-cyan-600 focus:bg-white focus:ring-2 focus:ring-cyan-500/20"
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={`mb-1.5 block font-bold uppercase tracking-wider text-[11px] ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                      Corporate Email *
                    </label>
                    <div className="relative">
                      <Mail className={`absolute top-3 left-3.5 h-4 w-4 ${isDark ? "text-slate-500" : "text-slate-400"}`} />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="alex@acmecorp.com"
                        className={`h-11 w-full rounded-xl border pr-3.5 pl-10 text-xs font-medium outline-none transition-all ${
                          isDark
                            ? "border-white/10 bg-white/[0.03] text-white placeholder-slate-500 focus:border-cyan-500 focus:bg-white/[0.06] focus:ring-2 focus:ring-cyan-500/20"
                            : "border-slate-300 bg-slate-50/70 text-slate-900 placeholder-slate-400 focus:border-cyan-600 focus:bg-white focus:ring-2 focus:ring-cyan-500/20"
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={`mb-1.5 block font-bold uppercase tracking-wider text-[11px] ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                      Organization / Tenant Name
                    </label>
                    <div className="relative">
                      <Building className={`absolute top-3 left-3.5 h-4 w-4 ${isDark ? "text-slate-500" : "text-slate-400"}`} />
                      <input
                        type="text"
                        value={org}
                        onChange={(e) => setOrg(e.target.value)}
                        placeholder="Acme Aerospace & Defense"
                        className={`h-11 w-full rounded-xl border pr-3.5 pl-10 text-xs font-medium outline-none transition-all ${
                          isDark
                            ? "border-white/10 bg-white/[0.03] text-white placeholder-slate-500 focus:border-cyan-500 focus:bg-white/[0.06] focus:ring-2 focus:ring-cyan-500/20"
                            : "border-slate-300 bg-slate-50/70 text-slate-900 placeholder-slate-400 focus:border-cyan-600 focus:bg-white focus:ring-2 focus:ring-cyan-500/20"
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className={`font-bold uppercase tracking-wider text-[11px] ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                        Admin Password *
                      </label>
                      {password && (
                        <span className={`text-[10px] font-bold ${passwordStrength > 60 ? "text-emerald-400" : "text-amber-400"}`}>
                          {passwordStrength > 80 ? "Strong" : passwordStrength > 50 ? "Moderate" : "Weak"}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className={`absolute top-3 left-3.5 h-4 w-4 ${isDark ? "text-slate-500" : "text-slate-400"}`} />
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        className={`h-11 w-full rounded-xl border pr-10 pl-10 text-xs font-medium outline-none transition-all ${
                          isDark
                            ? "border-white/10 bg-white/[0.03] text-white placeholder-slate-500 focus:border-cyan-500 focus:bg-white/[0.06] focus:ring-2 focus:ring-cyan-500/20"
                            : "border-slate-300 bg-slate-50/70 text-slate-900 placeholder-slate-400 focus:border-cyan-600 focus:bg-white focus:ring-2 focus:ring-cyan-500/20"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className={`absolute top-3 right-3 text-slate-500 hover:text-slate-300`}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0A6EDD] to-cyan-500 font-bold text-white shadow-lg shadow-cyan-500/20 transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer"
                  >
                    <span>Next: Select Cloud Providers</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
              </div>
            )}

            {/* ══════════════ STEP 2: CLOUD MODULARITY ══════════════ */}
            {currentStep === 2 && (
              <div>
                <div className={`border-b pb-4 mb-4 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-950"}`}>
                        Step 2 of 3: Cloud Provider Selection
                      </h2>
                      <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                        Select only the cloud infrastructure you use (e.g. only Azure, only OCI, or multi-cloud).
                      </p>
                    </div>
                    <span className="rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 px-2.5 py-0.5 text-xs font-black">
                      {selectedClouds.length} Selected
                    </span>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="mb-4">
                  <span className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Quick Presets
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => applyPreset("azure")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        selectedClouds.length === 1 && selectedClouds[0] === "azure"
                          ? "bg-blue-500/20 border-blue-500 text-blue-400"
                          : isDark ? "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10" : "bg-slate-100 border-slate-200 text-slate-700"
                      }`}
                    >
                      Only Azure
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("oci")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        selectedClouds.length === 1 && selectedClouds[0] === "oraclecloud"
                          ? "bg-red-500/20 border-red-500 text-red-400"
                          : isDark ? "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10" : "bg-slate-100 border-slate-200 text-slate-700"
                      }`}
                    >
                      Only OCI
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("azure_oci")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        selectedClouds.length === 2 && selectedClouds.includes("azure") && selectedClouds.includes("oraclecloud")
                          ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                          : isDark ? "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10" : "bg-slate-100 border-slate-200 text-slate-700"
                      }`}
                    >
                      Azure + OCI (Dual)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("all")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        selectedClouds.length > 2
                          ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                          : isDark ? "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10" : "bg-slate-100 border-slate-200 text-slate-700"
                      }`}
                    >
                      Full Multi-Cloud
                    </button>
                  </div>
                </div>

                {/* Cloud Provider Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[340px] overflow-y-auto pr-1">
                  {CLOUD_OPTIONS.map((cloud) => {
                    const isSelected = selectedClouds.includes(cloud.id);
                    return (
                      <div
                        key={cloud.id}
                        onClick={() => toggleCloud(cloud.id)}
                        className={`relative rounded-2xl border p-3.5 cursor-pointer transition-all ${
                          isSelected
                            ? isDark
                              ? "bg-white/[0.08] border-cyan-500 ring-2 ring-cyan-500/20 shadow-md"
                              : "bg-cyan-50/70 border-cyan-600 ring-2 ring-cyan-500/20 shadow-sm"
                            : isDark
                            ? "bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]"
                            : "bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-slate-100/70"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-xl border font-black text-xs ${cloud.iconBg}`}>
                              {cloud.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className={`text-xs font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                                {cloud.name}
                              </div>
                              <span className="text-[10px] font-semibold text-slate-400">
                                {cloud.badge}
                              </span>
                            </div>
                          </div>
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded-full border transition-all ${
                              isSelected
                                ? "bg-cyan-500 border-cyan-500 text-white"
                                : isDark ? "border-white/20" : "border-slate-300"
                            }`}
                          >
                            {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                          </div>
                        </div>
                        <p className={`mt-2 text-[11px] leading-relaxed line-clamp-2 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                          {cloud.tagline}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className={`flex h-11 items-center gap-2 rounded-xl border px-5 text-xs font-bold transition-all ${
                      isDark ? "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10" : "border-slate-300 bg-slate-100 text-slate-700"
                    }`}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Back</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleNextFromStep2}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0A6EDD] to-cyan-500 font-bold text-white shadow-lg shadow-cyan-500/20 transition-all hover:brightness-110 cursor-pointer"
                  >
                    <span>Next: Choose Compliances ({selectedClouds.length} Clouds)</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ══════════════ STEP 3: COMPLIANCE SELECTION ══════════════ */}
            {currentStep === 3 && (
              <div>
                <div className={`border-b pb-4 mb-4 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-950"}`}>
                        Step 3 of 3: Compliance Frameworks
                      </h2>
                      <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                        Only frameworks matching your active clouds ({selectedClouds.join(", ").toUpperCase()}) are enabled.
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-black">
                      {selectedCompliances.length} Selected
                    </span>
                  </div>
                </div>

                {/* Frameworks List */}
                <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                  {eligibleFrameworks.map((fw) => {
                    const isSelected = selectedCompliances.includes(fw.id);
                    return (
                      <div
                        key={fw.id}
                        onClick={() => toggleCompliance(fw.id)}
                        className={`flex items-start justify-between rounded-xl border p-3 cursor-pointer transition-all ${
                          isSelected
                            ? isDark
                              ? "bg-cyan-500/[0.08] border-cyan-500/60 ring-1 ring-cyan-500/20"
                              : "bg-cyan-50 border-cyan-500 ring-1 ring-cyan-500/20"
                            : isDark
                            ? "bg-white/[0.02] border-white/10 hover:bg-white/[0.04]"
                            : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        <div className="pr-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                              {fw.name}
                            </span>
                            <span className={`text-[10px] font-bold rounded-md px-1.5 py-0.5 uppercase ${
                              fw.provider === "universal"
                                ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                                : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                            }`}>
                              {fw.provider === "universal" ? "Multi-Cloud" : fw.provider}
                            </span>
                          </div>
                          <p className={`mt-1 text-[11px] leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                            {fw.description}
                          </p>
                        </div>
                        <div
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all ${
                            isSelected
                              ? "bg-cyan-500 border-cyan-500 text-white"
                              : isDark ? "border-white/20" : "border-slate-300"
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className={`flex h-11 items-center gap-2 rounded-xl border px-5 text-xs font-bold transition-all ${
                      isDark ? "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10" : "border-slate-300 bg-slate-100 text-slate-700"
                    }`}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Back</span>
                  </button>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleFinalSubmit}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 font-bold text-white shadow-lg shadow-emerald-500/20 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        <span>Deploy Custom Security Pod</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Login Link */}
            <div className={`mt-5 border-t pt-4 text-center text-xs ${isDark ? "border-white/10 text-slate-400" : "border-slate-200 text-slate-600"}`}>
              Already have an account?{" "}
              <Link to="/sign-in" className="font-bold text-cyan-400 hover:underline">
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 mx-auto w-full max-w-[1400px] p-6 text-center text-[11px] text-slate-500">
        Digital CISO Autonomous Security Copilot • Per-Tenant Custom Cloud & Compliance Isolation
      </footer>
    </div>
  );
}
