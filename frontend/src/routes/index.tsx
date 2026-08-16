import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShieldCheck,
  Zap,
  ArrowRight,
  BrainCircuit,
  Lock,
  FileText,
  Plug,
  Sparkles,
  Sun,
  Moon,
  ChevronRight,
  Terminal,
  Award,
  Scan,
  Bot,
  UserCheck,
  Cloud,
  Server,
  Network,
  Code2,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: MarketingLandingPage,
});

/* ── Inline SVG Logo Mark ── */
function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M24 4L8 12v11c0 10.5 6.8 18.2 16 21 9.2-2.8 16-10.5 16-21V12L24 4Z"
        fill="url(#lg)"
        fillOpacity="0.12"
        stroke="url(#lg)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Lock body */}
      <rect x="18" y="22" width="12" height="10" rx="2" fill="url(#lg)" fillOpacity="0.25" stroke="url(#lg)" strokeWidth="1.4" />
      {/* Lock shackle */}
      <path d="M20 22v-3a4 4 0 0 1 8 0v3" stroke="url(#lg)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      {/* Keyhole */}
      <circle cx="24" cy="27" r="1.5" fill="url(#lg)" />
      <path d="M24 28.5V30" stroke="url(#lg)" strokeWidth="1.2" strokeLinecap="round" />
      {/* Network nodes */}
      <circle cx="12" cy="20" r="1.4" fill="url(#lg)" opacity="0.6" />
      <circle cx="36" cy="20" r="1.4" fill="url(#lg)" opacity="0.6" />
      <circle cx="15" cy="34" r="1.4" fill="url(#lg)" opacity="0.6" />
      <circle cx="33" cy="34" r="1.4" fill="url(#lg)" opacity="0.6" />
      <line x1="14" y1="20.5" x2="18" y2="24" stroke="url(#lg)" strokeWidth="0.8" opacity="0.4" />
      <line x1="34" y1="20.5" x2="30" y2="24" stroke="url(#lg)" strokeWidth="0.8" opacity="0.4" />
      <defs>
        <linearGradient id="lg" x1="8" y1="4" x2="40" y2="44">
          <stop offset="0%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function MarketingLandingPage() {
  const [activeTab, setActiveTab] = useState<"hitl" | "compliance" | "attack-paths">("hitl");
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("dciso-landing-theme");
    if (saved === "light") {
      setIsDark(false);
    } else if (saved === "dark") {
      setIsDark(true);
    } else {
      // Default to dark or check system preference
      setIsDark(true);
    }
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem("dciso-landing-theme", next ? "dark" : "light");
      return next;
    });
  };

  const frameworks = [
    { name: "CIS AWS Foundations 3.0", score: 91 },
    { name: "SOC 2 Type II", score: 94 },
    { name: "ISO/IEC 27001:2022", score: 90 },
    { name: "PCI-DSS v4.0", score: 95 },
    { name: "NIST CSF 2.0", score: 89 },
    { name: "CIS OCI 2.0", score: 92 },
    { name: "HIPAA Security Rule", score: 94 },
    { name: "MITRE ATT&CK Cloud", score: 92 },
  ];

  const howItWorks = [
    { step: "01", icon: Scan, title: "Connect & Scan", desc: "Connect AWS, Azure, GCP, OCI, or Kubernetes in one click. Prowler continuously audits against 28+ compliance frameworks." },
    { step: "02", icon: BrainCircuit, title: "AI Triage & Analysis", desc: "Spectra AI triages thousands of raw findings in seconds. Extracts root cause, business impact, and toxic attack combinations." },
    { step: "03", icon: UserCheck, title: "Human Authorization", desc: "AI generates production-grade remediation scripts. Nothing executes without explicit human sign-off through the HITL safety gate." },
    { step: "04", icon: Bot, title: "Autonomous Execution", desc: "Once approved, the Execution Agent applies the fix to your cloud infrastructure and verifies the finding is resolved." },
  ];

  return (
    <div className={`min-h-screen font-sans antialiased overflow-x-hidden transition-colors duration-300 ${isDark ? "bg-[#060910] text-[#F1F5F9] selection:bg-cyan-500 selection:text-black" : "bg-[#F8FAFC] text-[#0F172A] selection:bg-cyan-600 selection:text-white"}`}>

      {/* ════════════════════════════════════════════════════════════════════
          NAVIGATION
      ════════════════════════════════════════════════════════════════════ */}
      <header className={`sticky top-0 z-50 border-b backdrop-blur-2xl transition-colors duration-300 ${isDark ? "border-white/[0.06] bg-[#060910]/85" : "border-slate-200 bg-white/90 shadow-xs"}`}>
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-6 lg:px-8">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-3 group">
            <LogoMark size={36} />
            <div className="flex flex-col">
              <span className={`text-[15px] font-extrabold tracking-tight leading-none ${isDark ? "text-white" : "text-slate-950"}`}>
                Digital <span className={isDark ? "text-cyan-400" : "text-cyan-600"}>CISO</span>
              </span>
              <span className={`text-[9px] font-semibold uppercase tracking-[0.18em] leading-none mt-0.5 ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                Autonomous Security Platform
              </span>
            </div>
          </Link>

          {/* Nav Links */}
          <nav className="hidden lg:flex items-center gap-7 text-[13px] font-medium">
            {["How It Works", "Capabilities", "Compliance", "Integrations", "MCP / API"].map((label) => {
              const anchor = `#${label.toLowerCase().replace(/ \/ /g, "-").replace(/ /g, "-")}`;
              return (
                <a
                  key={label}
                  href={anchor}
                  className={`transition-colors font-semibold ${isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-950"}`}
                >
                  {label}
                </a>
              );
            })}
          </nav>

          {/* Auth & Theme Toggle Buttons */}
          <div className="flex items-center gap-2.5">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle light and dark mode"
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-all active:scale-95 cursor-pointer ${isDark ? "border-white/10 bg-white/[0.04] text-slate-300 hover:text-white hover:bg-white/[0.08]" : "border-slate-300 bg-slate-100 text-slate-700 hover:text-slate-950 hover:bg-slate-200"}`}
            >
              {isDark ? <Sun className="h-4 w-4 text-amber-300" /> : <Moon className="h-4 w-4 text-slate-700" />}
            </button>

            <Link
              to="/sign-in"
              className={`hidden sm:inline-flex h-9 items-center justify-center rounded-lg border px-4 text-[13px] font-semibold transition-all active:scale-[0.97] ${isDark ? "border-white/10 bg-white/[0.04] text-white hover:border-white/20 hover:bg-white/[0.08]" : "border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-100 shadow-xs"}`}
            >
              Sign In
            </Link>

            <Link
              to="/sign-up"
              className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-4.5 text-[13px] font-bold shadow-md transition-all active:scale-[0.97] ${isDark ? "bg-cyan-500 text-[#060910] shadow-cyan-500/20 hover:bg-cyan-400" : "bg-cyan-600 text-white shadow-cyan-600/25 hover:bg-cyan-700"}`}
            >
              <span>Get Started</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════════════
          HERO
      ════════════════════════════════════════════════════════════════════ */}
      <section className="relative pt-20 pb-28 px-6 lg:px-8 overflow-hidden">
        {/* Background effects */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className={`absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[800px] rounded-full blur-[160px] ${isDark ? "bg-cyan-500/[0.07]" : "bg-cyan-200/40"}`} />
          <div className={`absolute top-1/3 right-0 h-[400px] w-[400px] rounded-full blur-[140px] ${isDark ? "bg-blue-600/[0.05]" : "bg-blue-200/30"}`} />
          {isDark && (
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_30%,#000_60%,transparent_100%)]" />
          )}
        </div>

        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[12px] font-medium backdrop-blur-md mb-8 ${isDark ? "border-cyan-500/25 bg-cyan-950/40 text-cyan-300" : "border-cyan-200 bg-cyan-50 text-cyan-800 shadow-xs"}`}>
            <span className={`h-2 w-2 rounded-full animate-pulse ${isDark ? "bg-cyan-400" : "bg-cyan-600"}`} />
            <span className="font-semibold">Autonomous Multi-Cloud Defense · Powered by AI</span>
          </div>

          <h1 className={`text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight leading-[1.1] ${isDark ? "text-white" : "text-slate-950"}`}>
            Your AI-Powered{" "}
            <span className={`bg-gradient-to-r bg-clip-text text-transparent ${isDark ? "from-cyan-400 via-teal-300 to-blue-400" : "from-cyan-600 via-teal-600 to-blue-600"}`}>
              Chief Information Security Officer
            </span>
          </h1>

          <p className={`mt-5 max-w-2xl mx-auto text-[15px] sm:text-base leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600 font-medium"}`}>
            Continuous compliance auditing across 28+ security frameworks for AWS, Azure, GCP, OCI, and Kubernetes. Autonomous threat triage, toxic attack path discovery, and AI-generated remediation with mandatory human approval gates.
          </p>

          {/* CTA Row */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3.5">
            <Link
              to="/sign-up"
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-7 text-sm font-bold shadow-lg transition-all active:scale-[0.97] ${isDark ? "bg-cyan-500 text-[#060910] shadow-cyan-500/25 hover:bg-cyan-400" : "bg-cyan-600 text-white shadow-cyan-600/30 hover:bg-cyan-700"}`}
            >
              <span>Start Free Trial</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/sign-in"
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-6 text-sm font-semibold transition-all active:scale-[0.97] ${isDark ? "border-white/10 bg-white/[0.04] text-white hover:border-white/20 hover:bg-white/[0.08]" : "border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-100 shadow-xs"}`}
            >
              <span>Sign In to Console</span>
            </Link>
          </div>

          {/* Cloud Providers Trust Bar */}
          <div className="mt-16 flex flex-col items-center gap-4">
            <span className={`text-[11px] font-bold uppercase tracking-widest ${isDark ? "text-slate-500" : "text-slate-500"}`}>
              Securing enterprise infrastructure across
            </span>
            <div className="flex flex-wrap items-center justify-center gap-8">
              <div className={`flex items-center gap-2 text-sm font-semibold ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                <Cloud className="h-5 w-5 text-[#FF9900]" />
                <span>AWS</span>
              </div>
              <div className={`flex items-center gap-2 text-sm font-semibold ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                <Cloud className="h-5 w-5 text-[#0078D4]" />
                <span>Azure</span>
              </div>
              <div className={`flex items-center gap-2 text-sm font-semibold ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                <Cloud className="h-5 w-5 text-[#4285F4]" />
                <span>Google Cloud</span>
              </div>
              <div className={`flex items-center gap-2 text-sm font-semibold ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                <Cloud className="h-5 w-5 text-[#C74634]" />
                <span>Oracle Cloud (OCI)</span>
              </div>
              <div className={`flex items-center gap-2 text-sm font-semibold ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                <Server className="h-5 w-5 text-[#326CE5]" />
                <span>Kubernetes</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Metric Stats Row ── */}
        <div className={`mx-auto mt-16 max-w-5xl grid grid-cols-2 gap-px sm:grid-cols-4 rounded-2xl border overflow-hidden ${isDark ? "border-white/[0.08] bg-white/[0.02]" : "border-slate-200 bg-white shadow-md"}`}>
          {[
            { value: "28", label: "Compliance Standards", sub: "Prowler-powered continuous audits" },
            { value: "5", label: "Cloud Platforms", sub: "AWS · Azure · GCP · OCI · K8s" },
            { value: "100%", label: "Human Approval Gates", sub: "Zero autonomous execution risk" },
            { value: "10", label: "MCP Tools Exposed", sub: "Open Model Context Protocol API" },
          ].map((stat, i) => (
            <div key={i} className={`px-6 py-5 text-center border-r border-b last:border-r-0 sm:[&:nth-child(4)]:border-r-0 sm:[&:nth-child(n+3)]:border-b-0 ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
              <div className={`text-2xl sm:text-3xl font-extrabold ${isDark ? "text-white" : "text-slate-950"}`}>{stat.value}</div>
              <div className={`text-[12px] font-bold mt-1 ${isDark ? "text-slate-300" : "text-slate-800"}`}>{stat.label}</div>
              <div className={`text-[11px] mt-0.5 ${isDark ? "text-slate-500" : "text-slate-500"}`}>{stat.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          HOW IT WORKS (4-step flow)
      ════════════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className={`py-24 px-6 lg:px-8 border-t ${isDark ? "border-white/[0.06] bg-white/[0.01]" : "border-slate-200 bg-slate-50/70"}`}>
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isDark ? "text-cyan-400" : "text-cyan-600"}`}>How It Works</span>
            <h2 className={`mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight ${isDark ? "text-white" : "text-slate-950"}`}>
              From Detection to Remediation in Minutes
            </h2>
            <p className={`mt-3 text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600 font-medium"}`}>
              A fully autonomous multi-cloud security pipeline with a mandatory human approval gate before any cloud infrastructure modification.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {howItWorks.map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={i}
                  className={`relative rounded-2xl border p-6 transition-all ${isDark ? "border-white/[0.06] bg-white/[0.02] hover:border-cyan-500/30 hover:bg-white/[0.04]" : "border-slate-200 bg-white hover:border-cyan-500/40 hover:shadow-md shadow-xs"}`}
                >
                  <span className={`absolute top-4 right-4 text-[12px] font-extrabold font-mono ${isDark ? "text-cyan-500/40" : "text-cyan-600"}`}>
                    {item.step}
                  </span>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl mb-4 ${isDark ? "bg-cyan-500/15 text-cyan-400" : "bg-cyan-100 text-cyan-700"}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-950"}`}>{item.title}</h3>
                  <p className={`mt-2 text-[13px] leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          INTERACTIVE CONSOLE PREVIEW
      ════════════════════════════════════════════════════════════════════ */}
      <section className={`py-24 px-6 lg:px-8 border-t ${isDark ? "border-white/[0.06]" : "border-slate-200 bg-white"}`}>
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isDark ? "text-cyan-400" : "text-cyan-600"}`}>Live Console Preview</span>
            <h2 className={`mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight ${isDark ? "text-white" : "text-slate-950"}`}>
              See Autonomous Operations in Action
            </h2>
          </div>

          <div className={`rounded-2xl border p-1.5 shadow-2xl ${isDark ? "border-white/[0.08] bg-[#0A0E18]" : "border-slate-300 bg-slate-100"}`}>
            <div className={`rounded-xl border p-6 ${isDark ? "border-white/[0.06] bg-[#0C1020]" : "border-slate-200 bg-white shadow-xs"}`}>
              {/* Window chrome */}
              <div className={`flex items-center justify-between border-b pb-4 ${isDark ? "border-white/[0.06]" : "border-slate-200"}`}>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                    <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </div>
                  <span className={`font-mono text-[11px] font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    digital-ciso.production // console v2.4
                  </span>
                </div>

                <div className={`flex items-center gap-1 rounded-lg border p-0.5 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-200 bg-slate-100"}`}>
                  {(["hitl", "compliance", "attack-paths"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition-all cursor-pointer ${
                        activeTab === tab
                          ? isDark
                            ? "bg-cyan-500 text-[#060910] shadow-sm"
                            : "bg-cyan-600 text-white shadow-xs"
                          : isDark
                            ? "text-slate-400 hover:text-white"
                            : "text-slate-600 hover:text-slate-950"
                      }`}
                    >
                      {tab === "hitl" ? "HITL Execution" : tab === "compliance" ? "Compliance Scorecards" : "Attack Graph"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              <div className="mt-6 min-h-[280px]">
                {activeTab === "hitl" && (
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
                    <div className="lg:col-span-3 space-y-3">
                      <div className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-bold ${isDark ? "bg-red-500/15 border-red-500/25 text-red-300" : "bg-red-50 border-red-200 text-red-700"}`}>
                        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        CRITICAL FINDING · S3 Public Access Exposure
                      </div>
                      <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-950"}`}>
                        AI Generated Terraform Remediation Playbook
                      </h3>
                      <p className={`text-[13px] leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600 font-medium"}`}>
                        Spectra detected public ACL on <code className={`px-1.5 py-0.5 rounded text-[12px] font-mono ${isDark ? "bg-cyan-500/10 text-cyan-300" : "bg-cyan-100 text-cyan-800"}`}>corp-confidential-finance</code> bucket. Auto-generated zero-downtime fix requires human sign-off.
                      </p>
                      <pre className={`rounded-xl border p-4 font-mono text-[12px] leading-relaxed overflow-x-auto ${isDark ? "border-white/[0.06] bg-black/50 text-emerald-400" : "border-slate-800 bg-slate-950 text-emerald-400"}`}>
{`resource "aws_s3_bucket_public_access_block" "enforce" {
  bucket                  = "corp-confidential-finance"
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}`}
                      </pre>
                    </div>

                    <div className={`lg:col-span-2 rounded-xl border p-5 flex flex-col justify-between ${isDark ? "border-cyan-500/20 bg-cyan-950/20" : "border-cyan-200 bg-cyan-50/80"}`}>
                      <div>
                        <div className={`text-[11px] font-extrabold uppercase tracking-widest mb-4 ${isDark ? "text-cyan-400" : "text-cyan-800"}`}>
                          Human-In-The-Loop Safety Gate
                        </div>
                        <div className="space-y-3 text-[13px]">
                          {[
                            ["Approval Status", "Awaiting Sign-off", isDark ? "text-amber-300" : "text-amber-700"],
                            ["Blast Radius", "0 services impacted", isDark ? "text-emerald-400" : "text-emerald-700"],
                            ["Rollback Plan", "Auto-rollback configured", isDark ? "text-emerald-400" : "text-emerald-700"],
                            ["SLA Deadline", "2h 14m remaining", isDark ? "text-amber-300" : "text-amber-700"],
                          ].map(([label, value, color]) => (
                            <div key={label} className="flex justify-between">
                              <span className={isDark ? "text-slate-400" : "text-slate-600 font-medium"}>{label}</span>
                              <span className={`font-bold ${color}`}>{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className={`mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-lg border text-[12px] font-bold ${isDark ? "bg-cyan-500/20 border-cyan-500/30 text-cyan-300" : "bg-cyan-600 border-cyan-700 text-white"}`}>
                        <Lock className="h-3.5 w-3.5" />
                        <span>Requires Authorized Sign-off</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "compliance" && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {frameworks.map((fw, i) => (
                      <div key={i} className={`rounded-xl border p-4 transition-colors ${isDark ? "border-white/[0.06] bg-white/[0.02] hover:border-cyan-500/30" : "border-slate-200 bg-white hover:border-cyan-500/40 shadow-xs"}`}>
                        <div className={`text-[13px] font-bold leading-tight ${isDark ? "text-white" : "text-slate-950"}`}>{fw.name}</div>
                        <div className="mt-3 flex items-end justify-between">
                          <span className={`text-2xl font-extrabold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>{fw.score}%</span>
                          <span className={`text-[11px] font-bold ${isDark ? "text-emerald-400/80" : "text-emerald-700"}`}>Passing</span>
                        </div>
                        <div className={`mt-2 h-1.5 w-full rounded-full overflow-hidden ${isDark ? "bg-white/[0.08]" : "bg-slate-200"}`}>
                          <div className={`h-full rounded-full ${isDark ? "bg-emerald-500/80" : "bg-emerald-500"}`} style={{ width: `${fw.score}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === "attack-paths" && (
                  <div className="space-y-4">
                    <div className={`rounded-xl border p-5 ${isDark ? "border-red-500/20 bg-red-950/20" : "border-red-200 bg-red-50"}`}>
                      <div className={`flex items-center gap-2 text-[13px] font-bold mb-3 ${isDark ? "text-red-300" : "text-red-800"}`}>
                        <Zap className="h-4 w-4" />
                        <span>Toxic Combination Detected (3-Hop Ingress Path)</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[12px]">
                        {[
                          { label: "Internet (0.0.0.0/0)", color: isDark ? "bg-red-500/20 text-red-300 border-red-500/30" : "bg-red-100 text-red-800 border-red-300" },
                          { label: "→", color: isDark ? "text-slate-500" : "text-slate-400 font-bold" },
                          { label: "CI Runner (Port 3389)", color: isDark ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-amber-100 text-amber-800 border-amber-300" },
                          { label: "→", color: isDark ? "text-slate-500" : "text-slate-400 font-bold" },
                          { label: "ci-deployer IAM Role", color: isDark ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-amber-100 text-amber-800 border-amber-300" },
                          { label: "→", color: isDark ? "text-slate-500" : "text-slate-400 font-bold" },
                          { label: "S3 Billing Bucket (Crown Jewel)", color: isDark ? "bg-red-500/20 text-red-300 border-red-500/30" : "bg-red-100 text-red-800 border-red-300" },
                        ].map((node, i) =>
                          node.label === "→" ? (
                            <span key={i} className={node.color}>→</span>
                          ) : (
                            <span key={i} className={`rounded-md border px-2.5 py-1 font-semibold ${node.color}`}>
                              {node.label}
                            </span>
                          )
                        )}
                      </div>
                      <p className={`mt-3 text-[12px] leading-relaxed ${isDark ? "text-slate-400" : "text-slate-700 font-medium"}`}>
                        Unauthenticated ingress via open RDP allows lateral movement through over-permissioned IAM role to access production billing data. Digital CISO recommends immediate security group lockdown and trust policy scoping.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          CORE CAPABILITIES
      ════════════════════════════════════════════════════════════════════ */}
      <section id="capabilities" className={`py-24 px-6 lg:px-8 border-t ${isDark ? "border-white/[0.06] bg-white/[0.01]" : "border-slate-200 bg-slate-50/70"}`}>
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isDark ? "text-cyan-400" : "text-cyan-600"}`}>Core Capabilities</span>
            <h2 className={`mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight ${isDark ? "text-white" : "text-slate-950"}`}>
              Everything a Modern Security Team Needs
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {[
              {
                icon: BrainCircuit,
                color: isDark ? "bg-cyan-500/10 text-cyan-400" : "bg-cyan-100 text-cyan-700",
                title: "Spectra — AI Threat Triage",
                desc: "Triages thousands of raw cloud findings in seconds. Extracts root cause analysis, business impact scores, and prioritized remediation paths.",
                link: "/ai/advisor",
                linkLabel: "Explore AI Advisor",
              },
              {
                icon: Lock,
                color: isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-100 text-blue-700",
                title: "HITL Execution Agent",
                desc: "Generates Terraform, AWS CLI, and Ansible remediation scripts. Enforces mandatory human authorization before any infrastructure modification.",
                link: "/ai/decisions",
                linkLabel: "View HITL Console",
              },
              {
                icon: Award,
                color: isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-100 text-emerald-700",
                title: "28 Prowler Compliance Frameworks",
                desc: "Continuous auditing for CIS (AWS, Azure, GCP, OCI, K8s), SOC 2, ISO 27001, PCI-DSS, NIST, HIPAA, GDPR, FedRAMP, DORA, NIS2, and MITRE ATT&CK.",
                link: "/compliance",
                linkLabel: "View Compliance Matrix",
              },
              {
                icon: Network,
                color: isDark ? "bg-red-500/10 text-red-400" : "bg-red-100 text-red-700",
                title: "Attack Path Analysis",
                desc: "Maps toxic cloud permission chains from internet-facing entry points to crown jewel assets. Identifies blast radius and kill-chain severity.",
                link: "/attack-paths",
                linkLabel: "View Attack Graphs",
              },
              {
                icon: FileText,
                color: isDark ? "bg-purple-500/10 text-purple-400" : "bg-purple-100 text-purple-700",
                title: "White-Labeled CISO Reports",
                desc: "One-click executive PDF/HTML reports with custom branding. Board-ready compliance summaries with actionable risk heatmaps.",
                link: "/reports",
                linkLabel: "Generate Reports",
              },
              {
                icon: Plug,
                color: isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-100 text-amber-700",
                title: "SIEM & Webhook Integrations",
                desc: "Real-time streaming to Amazon S3, Jira Cloud, AWS Security Hub, Slack, Splunk Enterprise, and Datadog Cloud Security.",
                link: "/integrations",
                linkLabel: "View Integrations",
              },
            ].map((cap, i) => {
              const Icon = cap.icon;
              return (
                <div
                  key={i}
                  className={`rounded-2xl border p-6 transition-all ${isDark ? "border-white/[0.06] bg-white/[0.015] hover:border-cyan-500/30 hover:bg-white/[0.03]" : "border-slate-200 bg-white hover:border-cyan-500/40 hover:shadow-md shadow-xs"}`}
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl mb-4 ${cap.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-950"}`}>{cap.title}</h3>
                  <p className={`mt-2 text-[13px] leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600 font-medium"}`}>{cap.desc}</p>
                  <Link
                    to={cap.link}
                    className={`mt-4 inline-flex items-center gap-1 text-[12px] font-bold transition-colors ${isDark ? "text-cyan-400 hover:text-cyan-300" : "text-cyan-600 hover:text-cyan-800"}`}
                  >
                    <span>{cap.linkLabel}</span>
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          COMPLIANCE FRAMEWORKS (scrolling badges)
      ════════════════════════════════════════════════════════════════════ */}
      <section id="compliance" className={`py-20 px-6 lg:px-8 border-t ${isDark ? "border-white/[0.06]" : "border-slate-200 bg-white"}`}>
        <div className="mx-auto max-w-6xl text-center">
          <span className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isDark ? "text-cyan-400" : "text-cyan-600"}`}>Compliance Coverage</span>
          <h2 className={`mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight ${isDark ? "text-white" : "text-slate-950"}`}>
            Continuous Auditing Across 28+ Security Standards
          </h2>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2.5">
            {[
              "CIS AWS 3.0", "CIS Azure 2.1", "CIS GCP 2.0", "CIS OCI 2.0", "CIS Kubernetes 1.8",
              "SOC 2 Type II", "ISO 27001:2022", "PCI-DSS 4.0", "NIST CSF 2.0",
              "NIST 800-53 r5", "NIST 800-171", "HIPAA", "GDPR",
              "FedRAMP Moderate", "DORA", "NIS2", "MITRE ATT&CK",
              "AWS Well-Architected", "AWS Audit Manager", "OCI Best Practices", "ENS (Spain)", "FFIEC",
              "GxP 21 CFR Part 11", "CMMC 2.0", "KISA (Korea)", "RBI CSF (India)",
              "CSA CCM 4.0", "Cyber Essentials UK", "ACSC Essential 8", "MAS TRM (Singapore)",
            ].map((fw) => (
              <span
                key={fw}
                className={`rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${isDark ? "border-white/[0.08] bg-white/[0.03] text-slate-300 hover:border-cyan-500/40 hover:text-white" : "border-slate-300 bg-slate-100 text-slate-700 hover:border-cyan-500 hover:text-slate-950 shadow-2xs"}`}
              >
                {fw}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          INTEGRATIONS
      ════════════════════════════════════════════════════════════════════ */}
      <section id="integrations" className={`py-24 px-6 lg:px-8 border-t ${isDark ? "border-white/[0.06] bg-white/[0.01]" : "border-slate-200 bg-slate-50/70"}`}>
        <div className="mx-auto max-w-5xl">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isDark ? "text-cyan-400" : "text-cyan-600"}`}>Ecosystem</span>
            <h2 className={`mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight ${isDark ? "text-white" : "text-slate-950"}`}>
              Connects to Your Security Stack
            </h2>
            <p className={`mt-3 text-sm ${isDark ? "text-slate-400" : "text-slate-600 font-medium"}`}>
              Stream audit findings and compliance snapshots to your existing SIEM, ticketing, and observability tools.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { name: "Amazon S3", sub: "Data Pipeline" },
              { name: "Jira Cloud", sub: "Ticketing" },
              { name: "Security Hub", sub: "AWS SIEM" },
              { name: "Slack", sub: "Notifications" },
              { name: "Splunk", sub: "Enterprise SIEM" },
              { name: "Datadog", sub: "Observability" },
            ].map((item, i) => (
              <div
                key={i}
                className={`rounded-xl border p-4 text-center transition-all ${isDark ? "border-white/[0.06] bg-white/[0.02] hover:border-cyan-500/30" : "border-slate-200 bg-white hover:border-cyan-500/40 hover:shadow-md shadow-xs"}`}
              >
                <Plug className={`h-5 w-5 mx-auto mb-2 ${isDark ? "text-cyan-400" : "text-cyan-600"}`} />
                <span className={`text-[13px] font-bold block ${isDark ? "text-white" : "text-slate-950"}`}>{item.name}</span>
                <span className={`text-[11px] ${isDark ? "text-slate-500" : "text-slate-500"}`}>{item.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          MCP / API Section
      ════════════════════════════════════════════════════════════════════ */}
      <section id="mcp---api" className={`py-24 px-6 lg:px-8 border-t ${isDark ? "border-white/[0.06]" : "border-slate-200 bg-white"}`}>
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 items-center">
            <div>
              <span className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isDark ? "text-cyan-400" : "text-cyan-600"}`}>Developer API</span>
              <h2 className={`mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight ${isDark ? "text-white" : "text-slate-950"}`}>
                Model Context Protocol (MCP) Gateway
              </h2>
              <p className={`mt-3 text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600 font-medium"}`}>
                Expose 10 security tools to any AI client — Claude Desktop, Cursor, VS Code, LangChain, or OpenAI Agents. Full JSON-RPC 2.0 compatible endpoint with JWT authentication.
              </p>
              <div className="mt-6 space-y-2.5">
                {[
                  "prowler_get_findings — Query findings by severity, provider, status",
                  "ciso_analyze_finding — AI root-cause analysis with risk scoring",
                  "ciso_get_compliance_overview — 28 framework readiness scores",
                  "remediation_generate_playbook — AI-generated Terraform/CLI scripts",
                  "ciso_get_integrations — Connected SIEM & webhook channels",
                ].map((tool) => (
                  <div key={tool} className="flex items-start gap-2 text-[12px]">
                    <Code2 className={`h-4 w-4 mt-0.5 shrink-0 ${isDark ? "text-cyan-400" : "text-cyan-600"}`} />
                    <span className={`font-mono font-medium ${isDark ? "text-slate-300" : "text-slate-800"}`}>{tool}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={`rounded-xl border p-5 shadow-lg ${isDark ? "border-white/[0.08] bg-[#0C1020]" : "border-slate-800 bg-slate-950 text-white"}`}>
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="h-4 w-4 text-slate-400" />
                <span className="font-mono text-[11px] text-slate-400">POST /api/v1/mcp</span>
              </div>
              <pre className="font-mono text-[12px] text-cyan-300 leading-relaxed overflow-x-auto">
{`{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "prowler_get_findings",
    "arguments": {
      "severity": "critical",
      "status": "FAIL",
      "limit": 5
    }
  }
}`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          FINAL CTA
      ════════════════════════════════════════════════════════════════════ */}
      <section className={`py-24 px-6 lg:px-8 border-t text-center ${isDark ? "border-white/[0.06] bg-gradient-to-b from-transparent to-cyan-950/20" : "border-slate-200 bg-slate-50"}`}>
        <div className="mx-auto max-w-3xl">
          <div className="flex justify-center mb-6">
            <LogoMark size={48} />
          </div>
          <h2 className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${isDark ? "text-white" : "text-slate-950"}`}>
            Ready to Automate Your Cloud Defense?
          </h2>
          <p className={`mt-4 text-sm max-w-xl mx-auto leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600 font-medium"}`}>
            Deploy your enterprise tenant in 60 seconds. Connect AWS, Azure, GCP, OCI, or Kubernetes and begin continuous compliance auditing immediately.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
            <Link
              to="/sign-up"
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-7 text-sm font-bold shadow-lg transition-all active:scale-[0.97] ${isDark ? "bg-cyan-500 text-[#060910] shadow-cyan-500/25 hover:bg-cyan-400" : "bg-cyan-600 text-white shadow-cyan-600/30 hover:bg-cyan-700"}`}
            >
              <span>Deploy Organization</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/sign-in"
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-6 text-sm font-semibold transition-all active:scale-[0.97] ${isDark ? "border-white/10 bg-white/[0.04] text-white hover:border-white/20 hover:bg-white/[0.08]" : "border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-100 shadow-xs"}`}
            >
              <span>Sign In to Console</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════════════════════════════════ */}
      <footer className={`border-t py-10 px-6 lg:px-8 ${isDark ? "border-white/[0.06] bg-black/40" : "border-slate-200 bg-white"}`}>
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-4 text-[13px]">
          <div className="flex items-center gap-2.5">
            <LogoMark size={24} />
            <span className={`font-bold ${isDark ? "text-slate-300" : "text-slate-800"}`}>Digital CISO © 2026</span>
          </div>
          <div className="flex items-center gap-6 font-semibold">
            <Link to="/sign-in" className={`transition-colors ${isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-950"}`}>Console Login</Link>
            <Link to="/sign-up" className={`transition-colors ${isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-950"}`}>Register</Link>
            <a href="#compliance" className={`transition-colors ${isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-950"}`}>Compliance</a>
            <a href="#mcp---api" className={`transition-colors ${isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-950"}`}>API Docs</a>
          </div>
        </div>
      </footer>
    </div>
  );
}