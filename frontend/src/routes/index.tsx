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
  Sun,
  Moon,
  Terminal,
  Award,
  Scan,
  Bot,
  UserCheck,
  Cloud,
  Server,
  Network,
  Code2,
  CheckCircle2,
  Play,
} from "lucide-react";
import { ShieldMark } from "@/components/brand/Logo";

export const Route = createFileRoute("/")({
  component: MarketingLandingPage,
});

function MarketingLandingPage() {
  const [activeTab, setActiveTab] = useState<"hitl" | "compliance" | "attack-paths">("hitl");
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("dciso-theme");
    const isDarkTheme = saved !== "light";
    setIsDark(isDarkTheme);
    document.documentElement.classList.toggle("light", !isDarkTheme);
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("light", !next);
      localStorage.setItem("dciso-theme", next ? "dark" : "light");
      return next;
    });
  };

  const frameworks = [
    { name: "NCA ECC-1:2018 (Saudi KSA)", score: 93, passed: 106, total: 114 },
    { name: "CIS AWS Foundations 3.0", score: 91, passed: 156, total: 171 },
    { name: "SOC 2 Type II (Security)", score: 94, passed: 98, total: 104 },
    { name: "ISO/IEC 27001:2022", score: 90, passed: 118, total: 131 },
    { name: "PCI-DSS v4.0", score: 95, passed: 145, total: 152 },
    { name: "NIST CSF 2.0", score: 89, passed: 108, total: 122 },
    { name: "CIS OCI Benchmark 2.0", score: 92, passed: 84, total: 91 },
    { name: "MITRE ATT&CK Cloud", score: 92, passed: 68, total: 74 },
  ];

  const howItWorks = [
    {
      step: "01",
      icon: Scan,
      title: "Zero-Agent Multi-Cloud Scan",
      desc: "Connect AWS, Azure, GCP, OCI, or Kubernetes via read-only IAM roles in under 2 minutes. Initiates continuous discovery across 28+ standards.",
    },
    {
      step: "02",
      icon: BrainCircuit,
      title: "Spectra AI Triage & Impact",
      desc: "Spectra engine evaluates toxic combinations, IAM privilege escalation vectors, and root-cause blast radius with zero alert fatigue.",
    },
    {
      step: "03",
      icon: UserCheck,
      title: "Human-In-The-Loop Safety Gate",
      desc: "AI produces production-ready Terraform, CLI, and Ansible remediation playbooks. Strictly locked until an authorized analyst approves.",
    },
    {
      step: "04",
      icon: Bot,
      title: "Autonomous Execution & Sign-off",
      desc: "Execution Agent applies the approved fix, verifies the finding is resolved in cloud runtime, and writes an immutable cryptographic audit record.",
    },
  ];

  const marqueePartners = [
    { name: "Amazon Web Services", category: "Cloud Provider", icon: "AWS" },
    { name: "Microsoft Azure", category: "Cloud Provider", icon: "Azure" },
    { name: "Google Cloud Platform", category: "Cloud Provider", icon: "GCP" },
    { name: "Oracle Cloud (OCI)", category: "Cloud Provider", icon: "OCI" },
    { name: "Kubernetes CNCF", category: "Container Engine", icon: "K8s" },
    { name: "Amazon S3 Data Lake", category: "Pipeline Sync", icon: "S3" },
    { name: "Jira Cloud SecOps", category: "Bi-directional Sync", icon: "Jira" },
    { name: "AWS Security Hub", category: "ASFF Stream", icon: "SecHub" },
    { name: "Slack Critical Alerts", category: "Real-time Webhook", icon: "Slack" },
    { name: "Splunk Enterprise SIEM", category: "HEC Stream", icon: "Splunk" },
    { name: "Datadog Cloud Security", category: "Observability APM", icon: "Datadog" },
  ];

  return (
    <div
      className={`min-h-screen font-sans antialiased overflow-x-hidden transition-colors duration-300 ${
        isDark
          ? "bg-background text-foreground selection:bg-cyan-500 selection:text-black"
          : "bg-background text-foreground selection:bg-cyan-500 selection:text-black"
      }`}
    >
      {/* ════════════════════════════════════════════════════════════════════
          HEADER (Clean Enterprise Floating Navbar)
      ════════════════════════════════════════════════════════════════════ */}
      <header
        className={`sticky top-0 z-50 border-b backdrop-blur-xl transition-all duration-300 ${
          isDark
            ? "border-border bg-background/85 shadow-[0_4px_24px_rgba(0,0,0,0.6)]"
            : "border-border bg-background/90 shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
        }`}
      >
        <div className="mx-auto flex h-20 w-full max-w-[1720px] items-center justify-between px-6 sm:px-10 lg:px-14 xl:px-16">
          {/* Brand Logo & Clean Meaningful Subtitle */}
          <Link to="/" className="flex items-center gap-3.5 group cursor-pointer shrink-0">
            <div className="transition-transform duration-300 group-hover:scale-105">
              <ShieldMark size={42} />
            </div>
            <div className="flex flex-col">
              <span className={`text-lg font-black tracking-tight leading-none ${isDark ? "text-white" : "text-slate-950"}`}>
                DIGITAL <span className="text-primary font-black">CISO</span>
              </span>
              <span className="text-[11px] font-bold tracking-wide text-primary leading-none mt-1">
                AI Cloud Security
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-2 xl:gap-3">
            {[
              { label: "Overview", href: "#overview" },
              { label: "How It Works", href: "#how-it-works" },
              { label: "Capabilities", href: "#capabilities" },
              { label: "Compliance (28)", href: "#compliance" },
              { label: "Integrations", href: "#integrations" },
              { label: "Developer API", href: "#mcp" },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={`rounded-full px-4 py-2 text-[13.5px] font-semibold transition-all duration-200 ${
                  isDark
                    ? "text-slate-300 hover:bg-white/[0.08] hover:text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Auth & Theme Toggle Actions */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Theme Switcher Button */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-200 active:scale-95 cursor-pointer ${
                isDark
                  ? "border-white/15 bg-white/[0.05] text-amber-300 hover:bg-white/10"
                  : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 shadow-xs"
              }`}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <Link
              to="/sign-in"
              className={`hidden sm:inline-flex h-10 items-center justify-center rounded-full border px-5 text-[13px] font-bold transition-all duration-200 active:scale-95 ${
                isDark
                  ? "border-white/20 bg-white/[0.04] text-white hover:border-white/30 hover:bg-white/[0.08]"
                  : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100 shadow-xs"
              }`}
            >
              Sign In
            </Link>

            <Link
              to="/sign-up"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 px-6 text-[13px] font-bold text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer"
            >
              <span>Start Free Trial</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════════════
          HERO SECTION (2-Column Architecture with Enterprise Marketing Visual)
      ════════════════════════════════════════════════════════════════════ */}
      <section id="overview" className="relative isolate overflow-hidden pt-16 pb-24 sm:pt-20 sm:pb-32 px-6 lg:px-8">
        {/* Background Gradients & Obsidian Cyan/Blue Grid Blur */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className={`absolute -left-40 top-[-10%] h-[34rem] w-[34rem] rounded-full blur-[140px] ${isDark ? "bg-[#0A6EDD]/20" : "bg-[#0A6EDD]/15"}`} />
          <div className={`absolute -right-32 top-[15%] h-[30rem] w-[30rem] rounded-full blur-[140px] ${isDark ? "bg-cyan-500/15" : "bg-cyan-500/10"}`} />
          {isDark && (
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff04_1px,transparent_1px),linear-gradient(to_bottom,#ffffff04_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)]" />
          )}
        </div>

        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
            {/* Left Column: Headline, Subtext & CTAs */}
            <div className="flex flex-col items-start gap-7">
              {/* Badge Pill */}
              <div className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold backdrop-blur-md shadow-xs ${isDark ? 'border-primary/30 bg-primary/10 text-cyan-300' : 'border-primary/30 bg-primary/10 text-cyan-800'}`}>
                <span className="rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 px-2.5 py-0.5 text-[0.65rem] font-black uppercase tracking-wider text-white">
                  Autonomous CISO
                </span>
                <span>Continuous Cloud Auditing · 28 Frameworks</span>
              </div>

              {/* High-Impact Executive Headline */}
              <h1 className={`text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.08] ${isDark ? "text-white" : "text-slate-950"}`}>
                Autonomous Cloud Security &{" "}
                <span className="bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 bg-clip-text text-transparent">
                  Continuous Compliance
                </span>{" "}
                for Enterprise.
              </h1>

              {/* Subhead */}
              <p className={`text-lg font-medium leading-relaxed max-w-xl ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                Continuous compliance auditing across <strong>28 global standards</strong>, instant AI threat triage, toxic attack path discovery, and <strong>Human-In-The-Loop (HITL)</strong> automated remediation across <strong>AWS, Azure, GCP, OCI & Kubernetes</strong>.
              </p>

              {/* Primary Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 w-full sm:w-auto pt-2">
                <Link
                  to="/sign-up"
                  className="inline-flex h-13 items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 px-8 text-base font-bold text-white shadow-[0_0_24px_rgba(6,182,212,0.45)] transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                >
                  <span>Deploy Organization Account</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <Link
                  to="/sign-in"
                  className={`inline-flex h-13 items-center justify-center gap-2 rounded-full border px-8 text-base font-semibold transition-all duration-200 hover:-translate-y-0.5 active:scale-95 ${
                    isDark
                      ? "border-white/25 bg-white/5 text-white backdrop-blur-sm hover:bg-white/12 hover:border-white/40"
                      : "border-slate-300 bg-white text-slate-800 shadow-soft hover:bg-slate-100 hover:border-slate-400"
                  }`}
                >
                  <Play className="h-4 w-4 text-cyan-400 fill-cyan-400" />
                  <span>Explore Live Console</span>
                </Link>
              </div>

              {/* Multi-Cloud Trust Indicator */}
              <div className="pt-2 flex flex-wrap items-center gap-6 text-xs font-semibold text-slate-400">
                <span className="uppercase tracking-widest text-[10px] text-slate-500 font-bold">Cloud Coverage:</span>
                <span className={`flex items-center gap-1.5 ${isDark ? "text-slate-300" : "text-slate-800"}`}><Cloud className="h-4 w-4 text-[#FF9900]" /> AWS</span>
                <span className={`flex items-center gap-1.5 ${isDark ? "text-slate-300" : "text-slate-800"}`}><Cloud className="h-4 w-4 text-[#0078D4]" /> Azure</span>
                <span className={`flex items-center gap-1.5 ${isDark ? "text-slate-300" : "text-slate-800"}`}><Cloud className="h-4 w-4 text-[#4285F4]" /> GCP</span>
                <span className={`flex items-center gap-1.5 ${isDark ? "text-slate-300" : "text-slate-800"}`}><Cloud className="h-4 w-4 text-[#C74634]" /> OCI</span>
                <span className={`flex items-center gap-1.5 ${isDark ? "text-slate-300" : "text-slate-800"}`}><Server className="h-4 w-4 text-[#326CE5]" /> Kubernetes</span>
              </div>
            </div>

            {/* Right Column: Clean Marketing Presentation Showcase */}
            <div className="relative">
              <div
                className={`relative overflow-hidden rounded-3xl p-6 sm:p-8 transition-all ${
                  isDark
                    ? "border border-white/15 bg-white/[0.04] backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
                    : "border border-slate-200 bg-white/95 backdrop-blur-2xl shadow-[0_20px_40px_rgba(0,0,0,0.06)]"
                }`}
              >
                {/* Showcase Header */}
                <div className={`flex items-center justify-between border-b pb-4 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-950'}`}>
                      Autonomous Security Nervous System
                    </span>
                  </div>
                  <span className="flex items-center gap-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 text-[11px] font-bold text-cyan-400">
                    <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                    Continuous Guard
                  </span>
                </div>

                {/* 3 Core Architecture Cards */}
                <div className="mt-5 space-y-3.5">
                  {/* Card 1: 28 Frameworks */}
                  <div className={`group rounded-2xl border p-4 transition-all ${isDark ? 'border-white/10 bg-white/[0.02] hover:border-primary/40' : 'border-slate-200 bg-slate-50/80 hover:border-primary shadow-xs'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 text-cyan-400 ring-1 ring-cyan-500/30">
                          <Award className="h-4 w-4" />
                        </div>
                        <div>
                          <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                            28+ Global Compliance Frameworks
                          </div>
                          <div className="text-xs text-slate-400">
                            CIS (AWS/Azure/GCP/OCI/K8s), SOC 2, ISO 27001, PCI-DSS, NIST & HIPAA
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Spectra AI */}
                  <div className={`group rounded-2xl border p-4 transition-all ${isDark ? 'border-white/10 bg-white/[0.02] hover:border-cyan-500/40' : 'border-slate-200 bg-slate-50/80 hover:border-cyan-500 shadow-xs'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 text-cyan-400 ring-1 ring-cyan-500/30">
                          <BrainCircuit className="h-4 w-4" />
                        </div>
                        <div>
                          <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                            Spectra AI Threat Triage & Attack Paths
                          </div>
                          <div className="text-xs text-slate-400">
                            Instant multi-cloud blast radius calculation and toxic privilege escalation mapping
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: HITL Safety Gate */}
                  <div className={`group rounded-2xl border p-4 transition-all ${isDark ? 'border-white/10 bg-white/[0.02] hover:border-primary/40' : 'border-slate-200 bg-slate-50/80 hover:border-primary shadow-xs'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-indigo-600/20 text-cyan-400 ring-1 ring-cyan-500/30">
                          <Lock className="h-4 w-4" />
                        </div>
                        <div>
                          <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                            Human-In-The-Loop (HITL) Execution
                          </div>
                          <div className="text-xs text-slate-400">
                            AI writes Terraform fixes; nothing touches cloud without analyst approval
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Showcase Footer Trust Badge */}
                <div className={`mt-5 pt-4 border-t flex flex-wrap items-center justify-between gap-3 text-xs ${isDark ? 'border-white/10 text-slate-400' : 'border-slate-200 text-slate-600'}`}>
                  <span className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    Zero-Agent Cloud Connect
                  </span>
                  <span className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    Continuous Audit Trails
                  </span>
                  <span className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    Model Context Protocol
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          MARQUEE LOGO TICKER (Ecosystem & Connected SIEM Nervous System)
      ════════════════════════════════════════════════════════════════════ */}
      <section className={`border-y py-8 overflow-hidden ${isDark ? "border-white/[0.08] bg-white/[0.02]" : "border-slate-200 bg-slate-50/70"}`}>
        <div className="mx-auto max-w-7xl px-6 mb-4 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
            Bi-directional telemetry streaming with enterprise SIEM & cloud infrastructure
          </p>
        </div>

        <div className="relative w-full overflow-hidden flex items-center">
          <div className="flex w-max animate-pulse gap-6 px-4">
            {marqueePartners.concat(marqueePartners).map((partner, i) => (
              <div
                key={i}
                className={`flex items-center gap-2.5 rounded-full border px-4 py-2 text-xs font-semibold whitespace-nowrap shadow-xs ${
                  isDark
                    ? "border-white/10 bg-white/[0.04] text-slate-300"
                    : "border-slate-200 bg-white text-slate-800"
                }`}
              >
                <span className="font-extrabold text-primary">{partner.icon}</span>
                <span>{partner.name}</span>
                <span className="text-[10px] text-slate-400 font-mono">({partner.category})</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          HOW IT WORKS (Step-by-Step Architecture Pipeline)
      ════════════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className={`py-24 px-6 lg:px-8 border-b ${isDark ? "border-white/[0.06]" : "border-slate-200 bg-white"}`}>
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
            <div className="max-w-2xl">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                <span className="h-px w-6 bg-primary" />
                Operating Model
              </span>
              <h2 className={`mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight ${isDark ? "text-white" : "text-slate-950"}`}>
                Four stages. Zero friction. Continuous assurance.
              </h2>
            </div>
            <Link
              to="/compliance"
              className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-xs font-bold transition-all hover:-translate-y-0.5 ${
                isDark
                  ? "border-white/20 bg-white/5 text-white hover:bg-white/10"
                  : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100"
              }`}
            >
              <span>View 28 Framework Scorecards</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {howItWorks.map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={i}
                  className={`group relative overflow-hidden rounded-2xl border p-7 transition-all duration-300 hover:-translate-y-1 ${
                    isDark
                      ? "border-white/[0.08] bg-white/[0.02] hover:border-primary/50 hover:shadow-[0_12px_30px_-10px_rgba(6,182,212,0.25)]"
                      : "border-slate-200 bg-white hover:border-primary hover:shadow-[0_12px_30px_-10px_rgba(6,182,212,0.3)] shadow-xs"
                  }`}
                >
                  <span className="absolute top-6 right-6 font-mono text-2xl font-black text-slate-500/30 group-hover:text-primary transition-colors">
                    {item.step}
                  </span>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 text-cyan-400 mb-6 ring-1 ring-cyan-500/30">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className={`text-base font-bold leading-snug ${isDark ? "text-white" : "text-slate-950"}`}>
                    {item.title}
                  </h3>
                  <p className={`mt-3 text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                    {item.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          INTERACTIVE LIVE CONSOLE PREVIEW
      ════════════════════════════════════════════════════════════════════ */}
      <section className={`py-24 px-6 lg:px-8 border-b ${isDark ? "border-white/[0.06] bg-[#0A0D15]/50" : "border-slate-200 bg-slate-50/70"}`}>
        <div className="mx-auto max-w-7xl">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Command Interface</span>
            <h2 className={`mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight ${isDark ? "text-white" : "text-slate-950"}`}>
              Experience the Autonomous CISO Console
            </h2>
          </div>

          <div
            className={`rounded-3xl border p-2 sm:p-3 shadow-2xl transition-all ${
              isDark
                ? "border-white/15 bg-gradient-to-b from-white/10 to-white/[0.02]"
                : "border-slate-300 bg-gradient-to-b from-slate-200 to-slate-100"
            }`}
          >
            <div className={`rounded-2xl border p-6 sm:p-8 ${isDark ? "border-white/10 bg-[#0B0F17]" : "border-slate-200 bg-white"}`}>
              {/* Console Window Chrome */}
              <div className={`flex flex-wrap items-center justify-between gap-4 border-b pb-5 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-rose-500" />
                    <span className="h-3 w-3 rounded-full bg-amber-500" />
                    <span className="h-3 w-3 rounded-full bg-emerald-500" />
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-400">
                    digital-ciso-ops.prod // command_gate_v2.4
                  </span>
                </div>

                <div className={`flex items-center gap-1 rounded-full border p-1 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-100"}`}>
                  {(["hitl", "compliance", "attack-paths"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                        activeTab === tab
                          ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.35)]"
                          : isDark
                            ? "text-slate-400 hover:text-white"
                            : "text-slate-600 hover:text-slate-950"
                      }`}
                    >
                      {tab === "hitl" ? "HITL AI Remediation" : tab === "compliance" ? "Compliance Scorecard (28)" : "Attack Path Graph"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              <div className="mt-6">
                {activeTab === "hitl" && (
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    <div className="lg:col-span-7 space-y-4">
                      <div className="inline-flex items-center gap-2 rounded-full bg-rose-500/15 border border-rose-500/30 px-3 py-1 text-xs font-bold text-rose-400">
                        <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                        CRITICAL FINDING · S3 Public Access Exposure
                      </div>
                      <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-950"}`}>
                        AI-Generated Terraform Remediation Playbook
                      </h3>
                      <p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600 font-medium"}`}>
                        Spectra discovered open public ACL exposing confidential financial audits on <code className="font-mono text-cyan-400">s3:::corp-confidential-finance-2026</code>.
                      </p>
                      <pre className="rounded-2xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-cyan-300 leading-relaxed overflow-x-auto shadow-inner">
{`resource "aws_s3_bucket_public_access_block" "enforce_block" {
  bucket                  = "corp-confidential-finance-2026"
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}`}
                      </pre>
                    </div>

                    <div className={`lg:col-span-5 rounded-2xl border p-6 flex flex-col justify-between ${isDark ? "border-primary/30 bg-primary/5" : "border-primary/30 bg-cyan-50/50"}`}>
                      <div>
                        <div className="flex items-center justify-between border-b border-primary/20 pb-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-primary">
                            Human-In-The-Loop Gate
                          </span>
                          <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/30">
                            Pending Approval
                          </span>
                        </div>
                        <div className="mt-4 space-y-2.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Target Resource:</span>
                            <span className="font-mono font-bold text-slate-200">s3:::corp-confidential</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Blast Radius:</span>
                            <span className="font-bold text-cyan-400">0 Impact (Isolated)</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Rollback Safeguard:</span>
                            <span className="font-bold text-cyan-400">Automated Rollback Ready</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">SLA Deadline:</span>
                            <span className="font-bold text-amber-400">2h 14m remaining</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-6">
                        <Link
                          to="/ai/decisions"
                          className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 px-4 text-xs font-bold text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all active:scale-95 cursor-pointer"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          <span>Authorize Execution in Console</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "compliance" && (
                  <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
                    {frameworks.map((fw, i) => (
                      <div
                        key={i}
                        className={`rounded-2xl border p-4 transition-all ${
                          isDark
                            ? "border-white/10 bg-white/5 hover:border-primary/40"
                            : "border-slate-200 bg-white hover:border-primary shadow-xs"
                        }`}
                      >
                        <div className={`text-xs font-bold leading-tight ${isDark ? "text-white" : "text-slate-950"}`}>{fw.name}</div>
                        <div className="mt-3 flex items-baseline justify-between">
                          <span className="text-2xl font-black text-primary">{fw.score}%</span>
                          <span className="text-[10px] font-bold text-cyan-400">Compliant</span>
                        </div>
                        <div className="mt-2 text-[10px] text-slate-400">
                          {fw.passed} of {fw.total} controls verified
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === "attack-paths" && (
                  <div className="space-y-4">
                    <div className={`rounded-2xl border p-5 ${isDark ? "border-rose-500/30 bg-rose-950/20" : "border-rose-200 bg-rose-50"}`}>
                      <div className="flex items-center gap-2 text-rose-400 font-bold text-xs mb-3">
                        <Zap className="h-4 w-4" />
                        <span>Toxic Combination Identified: Internet Ingress ➔ IAM Role ➔ S3 Bucket</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                        <span className="rounded-full bg-rose-500/20 border border-rose-500/40 px-3 py-1 text-rose-300">0.0.0.0/0 (Internet)</span>
                        <span className="text-slate-400 font-bold">➔</span>
                        <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-3 py-1 text-amber-300">CI Runner (RDP 3389)</span>
                        <span className="text-slate-400 font-bold">➔</span>
                        <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-3 py-1 text-amber-300">ci-deployer IAM Role</span>
                        <span className="text-slate-400 font-bold">➔</span>
                        <span className="rounded-full bg-rose-500/20 border border-rose-500/40 px-3 py-1 text-rose-300">s3:::prod-billing-exports</span>
                      </div>
                      <p className={`mt-3 text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700 font-medium"}`}>
                        AEGIS recommends severing the edge: revoke TCP 3389 ingress on sg-0d81ba91f2c7 and scope sts:AssumeRole policy.
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
          CORE CAPABILITIES (Spotlight Grid)
      ════════════════════════════════════════════════════════════════════ */}
      <section id="capabilities" className={`py-24 px-6 lg:px-8 border-b ${isDark ? "border-white/[0.06]" : "border-slate-200 bg-white"}`}>
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
            <div className="max-w-2xl">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                <span className="h-px w-6 bg-primary" />
                Full Capabilities
              </span>
              <h2 className={`mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight ${isDark ? "text-white" : "text-slate-950"}`}>
                Six unified pillars. One accountable platform.
              </h2>
            </div>
            <Link
              to="/ai/advisor"
              className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-xs font-bold transition-all hover:-translate-y-0.5 ${
                isDark
                  ? "border-white/20 bg-white/5 text-white hover:bg-white/10"
                  : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100"
              }`}
            >
              <span>Consult AI Advisor</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: BrainCircuit,
                title: "Spectra — AI Threat Intelligence",
                desc: "Triages thousands of raw cloud findings in seconds. Extracts root cause analysis, business impact scores, and prioritized remediation paths.",
                link: "/ai/advisor",
                linkLabel: "Consult Spectra Advisor",
              },
              {
                icon: Lock,
                title: "Human-In-The-Loop (HITL) Agent",
                desc: "Generates Terraform, AWS CLI, and Ansible remediation scripts. Enforces mandatory human authorization before any infrastructure modification.",
                link: "/ai/decisions",
                linkLabel: "Inspect Decision Gate",
              },
              {
                icon: Award,
                title: "28 Continuous Compliance Standards",
                desc: "Continuous auditing for CIS (AWS, Azure, GCP, OCI, K8s), SOC 2, ISO 27001, PCI-DSS, NIST, HIPAA, GDPR, FedRAMP, DORA, and NIS2.",
                link: "/compliance",
                linkLabel: "View Compliance Scorecard",
              },
              {
                icon: Network,
                title: "Attack Path & Toxic Graph Analysis",
                desc: "Maps toxic cloud permission chains from internet-facing entry points to crown jewel assets. Identifies blast radius and kill-chain severity.",
                link: "/attack-paths",
                linkLabel: "Launch Attack Visualizer",
              },
              {
                icon: FileText,
                title: "White-Labeled Executive PDF Reports",
                desc: "One-click executive PDF/HTML reports with custom branding. Board-ready compliance summaries with actionable risk heatmaps.",
                link: "/reports",
                linkLabel: "Generate Board Reports",
              },
              {
                icon: Plug,
                title: "SIEM & Webhook Nervous System",
                desc: "Real-time streaming to Amazon S3, Jira Cloud, AWS Security Hub, Slack, Splunk Enterprise, and Datadog Cloud Security.",
                link: "/integrations",
                linkLabel: "Configure Webhooks",
              },
            ].map((cap, i) => {
              const Icon = cap.icon;
              return (
                <div
                  key={i}
                  className={`group relative overflow-hidden rounded-2xl border p-7 transition-all duration-300 hover:-translate-y-1 ${
                    isDark
                      ? "border-white/[0.08] bg-white/[0.02] hover:border-primary/50 hover:shadow-[0_12px_30px_-10px_rgba(6,182,212,0.25)]"
                      : "border-slate-200 bg-white hover:border-primary hover:shadow-[0_12px_30px_-10px_rgba(6,182,212,0.3)] shadow-xs"
                  }`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 text-cyan-400 mb-6 ring-1 ring-cyan-500/30">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-950"}`}>{cap.title}</h3>
                  <p className={`mt-3 text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>{cap.desc}</p>
                  <Link
                    to={cap.link}
                    className="mt-6 inline-flex items-center gap-1.5 text-xs font-bold text-primary transition-all group-hover:translate-x-1"
                  >
                    <span>{cap.linkLabel}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          COMPLIANCE COVERAGE (28 Standards Pills)
      ════════════════════════════════════════════════════════════════════ */}
      <section id="compliance" className={`py-20 px-6 lg:px-8 border-b text-center ${isDark ? "border-white/[0.06] bg-white/[0.01]" : "border-slate-200 bg-slate-50/70"}`}>
        <div className="mx-auto max-w-7xl">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Compliance Matrix</span>
          <h2 className={`mt-3 text-3xl font-extrabold tracking-tight ${isDark ? "text-white" : "text-slate-950"}`}>
            Continuous Auditing Across 28+ Global Standards
          </h2>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2.5 max-w-5xl mx-auto">
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
                className={`rounded-full border px-4 py-2 text-xs font-bold transition-all hover:scale-105 ${
                  isDark
                    ? "border-white/10 bg-white/5 text-slate-300 hover:border-primary hover:text-primary"
                    : "border-slate-300 bg-white text-slate-800 hover:border-primary hover:text-primary shadow-xs"
                }`}
              >
                {fw}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          DEVELOPER MCP / API GATEWAY SECTION
      ════════════════════════════════════════════════════════════════════ */}
      <section id="mcp" className={`py-24 px-6 lg:px-8 border-b ${isDark ? "border-white/[0.06]" : "border-slate-200 bg-white"}`}>
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 items-center">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Open Protocol API</span>
              <h2 className={`mt-3 text-3xl font-extrabold tracking-tight ${isDark ? "text-white" : "text-slate-950"}`}>
                Model Context Protocol (MCP) Gateway
              </h2>
              <p className={`mt-4 text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                Expose 10 live security tools to private enterprise AI agents, IDE plugins (Cursor, VS Code), and custom SecOps pipelines. Compatible with JSON-RPC 2.0 and JWT token authorization.
              </p>
              <div className="mt-6 space-y-2.5 text-xs font-mono">
                {[
                  "ciso_get_findings — Query findings by severity, provider, status",
                  "ciso_analyze_finding — AI root-cause analysis with risk scoring",
                  "ciso_get_compliance_overview — 28 framework readiness scores",
                  "remediation_generate_playbook — AI-generated Terraform/CLI scripts",
                  "ciso_get_integrations — Connected SIEM & webhook channels",
                ].map((tool) => (
                  <div key={tool} className="flex items-start gap-2.5">
                    <Code2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span className={isDark ? "text-slate-300" : "text-slate-800 font-semibold"}>{tool}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="h-4 w-4 text-slate-400" />
                <span className="font-mono text-xs font-bold text-slate-400">POST /api/v1/mcp</span>
              </div>
              <pre className="font-mono text-xs text-cyan-300 leading-relaxed overflow-x-auto">
{`{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "ciso_get_findings",
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
          FINAL CTA (Conversion Section)
      ════════════════════════════════════════════════════════════════════ */}
      <section className={`py-24 px-6 lg:px-8 text-center relative overflow-hidden ${isDark ? "bg-gradient-to-b from-transparent to-cyan-500/10" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-4xl flex flex-col items-center">
          <ShieldMark size={56} />
          <h2 className={`mt-6 text-3xl sm:text-5xl font-black tracking-tight ${isDark ? "text-white" : "text-slate-950"}`}>
            Ready to Automate Your Multi-Cloud Security?
          </h2>
          <p className={`mt-4 text-base max-w-2xl leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600 font-medium"}`}>
            Deploy your enterprise organization account in seconds. Connect AWS, Azure, GCP, OCI, or Kubernetes and start continuous compliance auditing immediately.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/sign-up"
              className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 px-8 text-base font-bold text-white shadow-[0_0_24px_rgba(6,182,212,0.45)] transition-all hover:-translate-y-0.5 active:scale-95 cursor-pointer"
            >
              <span>Deploy Organization Account</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              to="/sign-in"
              className={`inline-flex h-13 items-center justify-center gap-2 rounded-full border px-8 text-base font-semibold transition-all hover:-translate-y-0.5 active:scale-95 ${
                isDark
                  ? "border-white/20 bg-white/5 text-white hover:bg-white/10"
                  : "border-slate-300 bg-white text-slate-800 shadow-soft hover:bg-slate-100"
              }`}
            >
              <span>Sign In to Console</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          FOOTER (Clean Minimalist Footer)
      ════════════════════════════════════════════════════════════════════ */}
      <footer className={`border-t py-12 px-6 sm:px-10 lg:px-14 xl:px-16 ${isDark ? "border-border bg-black/60" : "border-border bg-white"}`}>
        <div className="mx-auto flex w-full max-w-[1720px] flex-col sm:flex-row items-center justify-between gap-6 text-xs">
          <div className="flex items-center gap-3">
            <ShieldMark size={28} />
            <div className="flex flex-col">
              <span className={`font-black text-sm ${isDark ? "text-white" : "text-slate-900"}`}>DIGITAL CISO</span>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">© 2026 Digital CISO. All rights reserved.</span>
            </div>
          </div>

          <div className="flex items-center gap-6 font-bold text-slate-400">
            <Link to="/sign-in" className="hover:text-primary transition-colors">Console Sign In</Link>
            <Link to="/sign-up" className="hover:text-primary transition-colors">Register</Link>
            <a href="#compliance" className="hover:text-primary transition-colors">28 Standards</a>
            <a href="#mcp" className="hover:text-primary transition-colors">MCP Protocol</a>
            <a href={`${import.meta.env.VITE_API_BASE_URL || "/api/v1"}/reports/executive-summary`} target="_blank" className="hover:text-primary transition-colors">Executive PDF</a>
          </div>
        </div>
      </footer>
    </div>
  );
}