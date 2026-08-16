import { useState } from "react";
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
  ChevronRight,
  Terminal,
  Award,
  ArrowUpRight,
  Scan,
  Bot,
  UserCheck,
  Cpu,
  Globe,
  Cloud,
  Server,
  Network,
  Code2,
  BookOpen,
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
          <stop offset="0%" stopColor="#67E8F9" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function MarketingLandingPage() {
  const [activeTab, setActiveTab] = useState<"hitl" | "compliance" | "attack-paths">("hitl");

  const frameworks = [
    { name: "CIS AWS Foundations 3.0", score: 91 },
    { name: "SOC 2 Type II", score: 94 },
    { name: "ISO/IEC 27001:2022", score: 90 },
    { name: "PCI-DSS v4.0", score: 95 },
    { name: "NIST CSF 2.0", score: 89 },
    { name: "NIST SP 800-53 Rev. 5", score: 87 },
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
    <div className="min-h-screen bg-[#060910] text-[#F1F5F9] selection:bg-cyan-500 selection:text-black font-sans antialiased overflow-x-hidden">

      {/* ════════════════════════════════════════════════════════════════════
          NAVIGATION
      ════════════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#060910]/85 backdrop-blur-2xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-6 lg:px-8">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-3 group">
            <LogoMark size={36} />
            <div className="flex flex-col">
              <span className="text-[15px] font-extrabold tracking-tight text-white leading-none">
                Digital <span className="text-cyan-400">CISO</span>
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500 leading-none mt-0.5">
                Autonomous Security Platform
              </span>
            </div>
          </Link>

          {/* Nav Links */}
          <nav className="hidden lg:flex items-center gap-7 text-[13px] font-medium text-slate-400">
            <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
            <a href="#capabilities" className="hover:text-white transition-colors">Capabilities</a>
            <a href="#compliance" className="hover:text-white transition-colors">Compliance</a>
            <a href="#integrations" className="hover:text-white transition-colors">Integrations</a>
            <a href="#api" className="hover:text-white transition-colors">MCP / API</a>
          </nav>

          {/* Auth Buttons */}
          <div className="flex items-center gap-3">
            <Link
              to="/sign-in"
              className="hidden sm:inline-flex h-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 text-[13px] font-semibold text-white transition-all hover:border-white/20 hover:bg-white/[0.08] active:scale-[0.97]"
            >
              Sign In
            </Link>
            <Link
              to="/sign-up"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-cyan-500 px-4.5 text-[13px] font-bold text-[#060910] shadow-md shadow-cyan-500/20 transition-all hover:bg-cyan-400 active:scale-[0.97]"
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
      <section className="relative pt-24 pb-32 px-6 lg:px-8 overflow-hidden">
        {/* Background effects */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-cyan-500/[0.07] blur-[160px]" />
          <div className="absolute top-1/3 right-0 h-[400px] w-[400px] rounded-full bg-blue-600/[0.05] blur-[140px]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_30%,#000_60%,transparent_100%)]" />
        </div>

        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-950/30 px-4 py-1.5 text-[12px] font-medium text-cyan-300 backdrop-blur-md mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>Autonomous Multi-Cloud Defense · Powered by AI</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight text-white leading-[1.1]">
            Your AI-Powered{" "}
            <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Chief Information Security Officer
            </span>
          </h1>

          <p className="mt-5 max-w-2xl mx-auto text-[15px] sm:text-base text-slate-400 leading-relaxed">
            Continuous compliance auditing across 28+ security frameworks for AWS, Azure, GCP, OCI, and Kubernetes. Autonomous threat triage,
            toxic attack path discovery, and AI-generated remediation with mandatory human approval gates.
          </p>

          {/* CTA Row */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3.5">
            <Link
              to="/sign-up"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-7 text-sm font-bold text-[#060910] shadow-lg shadow-cyan-500/25 transition-all hover:bg-cyan-400 hover:shadow-cyan-400/30 active:scale-[0.97]"
            >
              <span>Start Free Trial</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/sign-in"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-6 text-sm font-semibold text-white transition-all hover:border-white/20 hover:bg-white/[0.08] active:scale-[0.97]"
            >
              <span>Sign In to Console</span>
            </Link>
          </div>

          {/* Cloud Providers Trust Bar */}
          <div className="mt-16 flex flex-col items-center gap-4">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-600">
              Securing infrastructure across
            </span>
            <div className="flex flex-wrap items-center justify-center gap-8 text-slate-500">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                <Cloud className="h-5 w-5 text-[#FF9900]" />
                <span>AWS</span>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                <Cloud className="h-5 w-5 text-[#0078D4]" />
                <span>Azure</span>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                <Cloud className="h-5 w-5 text-[#4285F4]" />
                <span>Google Cloud</span>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                <Cloud className="h-5 w-5 text-[#C74634]" />
                <span>Oracle Cloud (OCI)</span>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                <Server className="h-5 w-5 text-[#326CE5]" />
                <span>Kubernetes</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Metric Stats Row ── */}
        <div className="mx-auto mt-16 max-w-5xl grid grid-cols-2 gap-px sm:grid-cols-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          {[
            { value: "28", label: "Compliance Standards", sub: "Prowler-powered" },
            { value: "5", label: "Cloud Platforms", sub: "AWS · Azure · GCP · OCI · K8s" },
            { value: "100%", label: "Human Approval Gates", sub: "Zero autonomous risk" },
            { value: "10", label: "MCP Tools Exposed", sub: "Open protocol API" },
          ].map((stat, i) => (
            <div key={i} className="px-6 py-5 text-center border-r border-b border-white/[0.04] last:border-r-0 sm:[&:nth-child(4)]:border-r-0 sm:[&:nth-child(n+3)]:border-b-0">
              <div className="text-xl sm:text-2xl font-extrabold text-white">{stat.value}</div>
              <div className="text-[11px] font-semibold text-slate-400 mt-0.5">{stat.label}</div>
              <div className="text-[10px] text-slate-600 mt-0.5">{stat.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          HOW IT WORKS (4-step flow)
      ════════════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="py-24 px-6 lg:px-8 border-t border-white/[0.04]">
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400">How It Works</span>
            {/* Powered by Prowler */}
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              From Detection to Remediation in Minutes
            </h2>
            <p className="mt-3 text-sm text-slate-400">
              A fully autonomous pipeline with a mandatory human approval gate before any cloud infrastructure change.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {howItWorks.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="relative rounded-2xl border border-white/[0.06] bg-white/[0.015] p-6 transition-all hover:border-cyan-500/30 hover:bg-white/[0.03]">
                  <span className="absolute top-4 right-4 text-[11px] font-bold text-cyan-500/40 font-mono">
                    {item.step}
                  </span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 mb-4">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-bold text-white">{item.title}</h3>
                  <p className="mt-2 text-[12px] text-slate-400 leading-relaxed">{item.desc}</p>
                  {i < howItWorks.length - 1 && (
                    <ChevronRight className="hidden lg:block absolute -right-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-white/10" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          INTERACTIVE CONSOLE PREVIEW
      ════════════════════════════════════════════════════════════════════ */}
      <section className="py-24 px-6 lg:px-8 border-t border-white/[0.04] bg-white/[0.01]">
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400">Live Preview</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              See the Console in Action
            </h2>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0A0E18] p-1.5 shadow-2xl">
            <div className="rounded-xl border border-white/[0.06] bg-[#0C1020] p-6">
              {/* Window chrome */}
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
                  </div>
                  <span className="font-mono text-[11px] text-slate-500">
                    digital-ciso.console
                  </span>
                </div>

                <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
                  {(["hitl", "compliance", "attack-paths"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition-all ${
                        activeTab === tab
                          ? "bg-cyan-500 text-[#060910] shadow-sm"
                          : "text-slate-500 hover:text-white"
                      }`}
                    >
                      {tab === "hitl" ? "HITL Execution" : tab === "compliance" ? "Compliance" : "Attack Paths"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              <div className="mt-5 min-h-[280px]">
                {activeTab === "hitl" && (
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
                    <div className="lg:col-span-3 space-y-3">
                      <div className="inline-flex items-center gap-1.5 rounded-md bg-red-500/15 border border-red-500/20 px-2.5 py-1 text-[11px] font-bold text-red-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                        CRITICAL · S3 Public Access Violation
                      </div>
                      <h3 className="text-base font-bold text-white">
                        AI Generated Terraform Remediation Playbook
                      </h3>
                      <p className="text-[12px] text-slate-400 leading-relaxed">
                        Spectra detected public ACL on <code className="text-cyan-300 bg-cyan-500/10 px-1 py-0.5 rounded text-[11px]">corp-confidential-finance</code> bucket.
                        Auto-generated zero-downtime fix requires human sign-off.
                      </p>
                      <pre className="rounded-xl border border-white/[0.06] bg-black/40 p-4 font-mono text-[11px] text-emerald-400 leading-relaxed overflow-x-auto">
{`resource "aws_s3_bucket_public_access_block" "enforce" {
  bucket                  = "corp-confidential-finance"
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}`}
                      </pre>
                    </div>

                    <div className="lg:col-span-2 rounded-xl border border-cyan-500/20 bg-cyan-950/15 p-5 flex flex-col justify-between">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 mb-4">
                          Human-In-The-Loop Gate
                        </div>
                        <div className="space-y-2.5 text-[12px]">
                          {[
                            ["Status", "Awaiting Human Approval", "text-yellow-400"],
                            ["Blast Radius", "0 services impacted", "text-emerald-400"],
                            ["Rollback", "Auto-rollback configured", "text-emerald-400"],
                            ["SLA", "2h 14m remaining", "text-yellow-400"],
                          ].map(([label, value, color]) => (
                            <div key={label} className="flex justify-between">
                              <span className="text-slate-500">{label}</span>
                              <span className={`font-semibold ${color}`}>{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-[12px] font-bold text-cyan-300">
                        <Lock className="h-3.5 w-3.5" />
                        <span>Requires Authorized Sign-off</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "compliance" && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {frameworks.map((fw, i) => (
                      <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:border-cyan-500/20 transition-colors">
                        <div className="text-[12px] font-semibold text-white leading-tight">{fw.name}</div>
                        <div className="mt-3 flex items-end justify-between">
                          <span className="text-2xl font-extrabold text-emerald-400">{fw.score}%</span>
                          <span className="text-[10px] text-emerald-400/70 font-semibold">Passing</span>
                        </div>
                        <div className="mt-2 h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500/60" style={{ width: `${fw.score}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === "attack-paths" && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-red-500/20 bg-red-950/10 p-5">
                      <div className="flex items-center gap-2 text-[13px] font-bold text-red-300 mb-3">
                        <Zap className="h-4 w-4" />
                        <span>Toxic Combination Detected</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[12px]">
                        {[
                          { label: "Internet (0.0.0.0/0)", color: "bg-red-500/20 text-red-300 border-red-500/30" },
                          { label: "→", color: "text-slate-600" },
                          { label: "CI Runner (Port 3389)", color: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
                          { label: "→", color: "text-slate-600" },
                          { label: "ci-deployer IAM Role", color: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
                          { label: "→", color: "text-slate-600" },
                          { label: "S3 Billing Bucket (Crown Jewel)", color: "bg-red-500/20 text-red-300 border-red-500/30" },
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
                      <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
                        Unauthenticated ingress via open RDP allows lateral movement through over-permissioned IAM role to access production billing data.
                        Digital CISO recommends immediate security group lockdown and trust policy scoping.
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
      <section id="capabilities" className="py-24 px-6 lg:px-8 border-t border-white/[0.04]">
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400">Core Capabilities</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Everything a Modern Security Team Needs
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {[
              {
                icon: BrainCircuit,
                color: "bg-cyan-500/10 text-cyan-400",
                title: "Spectra — AI Threat Triage",
                desc: "Triages thousands of raw cloud findings in seconds. Extracts root cause analysis, business impact scores, and prioritized remediation paths.",
                link: "/ai/advisor",
                linkLabel: "Explore AI Advisor",
              },
              {
                icon: Lock,
                color: "bg-blue-500/10 text-blue-400",
                title: "HITL Execution Agent",
                desc: "Generates Terraform, AWS CLI, and Ansible remediation scripts. Enforces mandatory human authorization before any infrastructure modification.",
                link: "/ai/decisions",
                linkLabel: "View HITL Console",
              },
              {
                icon: Award,
                color: "bg-emerald-500/10 text-emerald-400",
                title: "28 Prowler Compliance Frameworks",
                desc: "Continuous auditing for CIS (AWS, Azure, GCP, OCI, K8s), SOC 2, ISO 27001, PCI-DSS, NIST, HIPAA, GDPR, FedRAMP, DORA, NIS2, and MITRE ATT&CK.",
                link: "/compliance",
                linkLabel: "View Compliance Matrix",
              },
              {
                icon: Network,
                color: "bg-red-500/10 text-red-400",
                title: "Attack Path Analysis",
                desc: "Maps toxic cloud permission chains from internet-facing entry points to crown jewel assets. Identifies blast radius and kill-chain severity.",
                link: "/attack-paths",
                linkLabel: "View Attack Graphs",
              },
              {
                icon: FileText,
                color: "bg-purple-500/10 text-purple-400",
                title: "White-Labeled CISO Reports",
                desc: "One-click executive PDF/HTML reports with custom branding. Board-ready compliance summaries with actionable risk heatmaps.",
                link: "/reports",
                linkLabel: "Generate Reports",
              },
              {
                icon: Plug,
                color: "bg-amber-500/10 text-amber-400",
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
                  className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-6 transition-all hover:border-cyan-500/20 hover:bg-white/[0.025]"
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${cap.color} mb-4`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-bold text-white">{cap.title}</h3>
                  <p className="mt-2 text-[12px] text-slate-400 leading-relaxed">{cap.desc}</p>
                  <Link
                    to={cap.link}
                    className="mt-4 inline-flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors"
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
      <section id="compliance" className="py-20 px-6 lg:px-8 border-t border-white/[0.04] bg-white/[0.01]">
        <div className="mx-auto max-w-6xl text-center">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400">Compliance Coverage</span>
          <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Continuous Auditing Across 28 Security Standards
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
                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-white"
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
      <section id="integrations" className="py-24 px-6 lg:px-8 border-t border-white/[0.04]">
        <div className="mx-auto max-w-5xl">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400">Ecosystem</span>
            <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Connects to Your Security Stack
            </h2>
            <p className="mt-3 text-sm text-slate-400">
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
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center transition-all hover:border-cyan-500/25 hover:bg-white/[0.04]"
              >
                <Plug className="h-5 w-5 text-cyan-400 mx-auto mb-2" />
                <span className="text-[12px] font-bold text-white block">{item.name}</span>
                <span className="text-[10px] text-slate-500">{item.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          MCP / API Section
      ════════════════════════════════════════════════════════════════════ */}
      <section id="api" className="py-24 px-6 lg:px-8 border-t border-white/[0.04] bg-white/[0.01]">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 items-center">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400">Developer API</span>
              <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Model Context Protocol (MCP) Gateway
              </h2>
              <p className="mt-3 text-sm text-slate-400 leading-relaxed">
                Expose 10 security tools to any AI client — Claude Desktop, Cursor, VS Code, LangChain, or OpenAI Agents.
                Full JSON-RPC 2.0 compatible endpoint with JWT authentication.
              </p>
              <div className="mt-6 space-y-2">
                {[
                  "prowler_get_findings — Query security findings by severity, provider, status",
                  "ciso_analyze_finding — AI root-cause analysis with risk scoring",
                  "ciso_get_compliance_overview — 28 framework readiness scores",
                  "remediation_generate_playbook — AI-generated Terraform/CLI scripts",
                  "ciso_get_integrations — Connected SIEM & webhook channels",
                ].map((tool) => (
                  <div key={tool} className="flex items-start gap-2 text-[12px]">
                    <Code2 className="h-3.5 w-3.5 text-cyan-400 mt-0.5 shrink-0" />
                    <span className="text-slate-300 font-mono">{tool}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#0C1020] p-5">
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="h-4 w-4 text-slate-500" />
                <span className="font-mono text-[11px] text-slate-500">POST /api/v1/mcp</span>
              </div>
              <pre className="font-mono text-[11px] text-cyan-300 leading-relaxed overflow-x-auto">
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
      <section className="py-24 px-6 lg:px-8 border-t border-white/[0.04] text-center">
        <div className="mx-auto max-w-3xl">
          <LogoMark size={48} />
          <h2 className="mt-6 text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Ready to Automate Your Cloud Security?
          </h2>
          <p className="mt-4 text-sm text-slate-400 max-w-xl mx-auto">
            Deploy your enterprise tenant in 60 seconds. Connect AWS, Azure, GCP, or Kubernetes and start scanning immediately.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
            <Link
              to="/sign-up"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-7 text-sm font-bold text-[#060910] shadow-lg shadow-cyan-500/25 transition-all hover:bg-cyan-400 active:scale-[0.97]"
            >
              <span>Deploy Organization</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/sign-in"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-6 text-sm font-semibold text-white transition-all hover:border-white/20 hover:bg-white/[0.08] active:scale-[0.97]"
            >
              Sign In to Console
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-white/[0.06] py-10 px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-4 text-[12px] text-slate-600">
          <div className="flex items-center gap-2.5">
            <LogoMark size={22} />
            <span className="font-semibold text-slate-400">Digital CISO © 2026</span>
          </div>
          <div className="flex items-center gap-5 text-slate-500">
            <Link to="/sign-in" className="hover:text-white transition-colors">Console Login</Link>
            <Link to="/sign-up" className="hover:text-white transition-colors">Register</Link>
            <a href="#compliance" className="hover:text-white transition-colors">Compliance</a>
            <a href="#api" className="hover:text-white transition-colors">API Docs</a>
          </div>
        </div>
      </footer>
    </div>
  );
}