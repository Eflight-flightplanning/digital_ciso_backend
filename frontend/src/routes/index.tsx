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
  CheckCircle2,
  Sparkles,
  ChevronRight,
  Database,
  Globe,
  Terminal,
  Activity,
  Layers,
  Award,
  Play,
  ArrowUpRight,
} from "lucide-react";
import { ShieldMark } from "@/components/brand/Logo";

export const Route = createFileRoute("/")({
  component: MarketingLandingPage,
});

function MarketingLandingPage() {
  const [activeTab, setActiveTab] = useState<"hitl" | "compliance" | "attack-paths">("hitl");

  const frameworks = [
    "CIS AWS Foundations 3.0",
    "SOC 2 Type II",
    "ISO/IEC 27001:2022",
    "PCI-DSS v4.0",
    "NIST CSF 2.0",
    "NIST SP 800-53 Rev. 5",
    "HIPAA Security Rule",
    "EU GDPR",
    "FedRAMP Moderate",
    "DORA (EU 2022/2554)",
    "NIS2 Directive",
    "MITRE ATT&CK Cloud",
  ];

  return (
    <div className="min-h-screen bg-[#070A0F] text-[#F8FAFC] selection:bg-cyan-500 selection:text-black font-sans antialiased overflow-x-hidden">
      {/* ── Top Navigation Bar ── */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#070A0F]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-8">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-3.5 group cursor-pointer">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 p-0.5 shadow-lg shadow-cyan-500/20 group-hover:shadow-cyan-500/40 transition-all">
              <img
                src="/logo.png"
                alt="Digital CISO"
                className="h-full w-full rounded-[10px] object-cover"
              />
            </div>
            <div className="flex flex-col">
              <span className="font-display text-lg font-black tracking-tight text-white flex items-center gap-1">
                DIGITAL <span className="text-cyan-400">CISO</span>
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Autonomous Security
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-slate-300">
            <a href="#features" className="hover:text-cyan-400 transition-colors">
              Platform Features
            </a>
            <a href="#compliance" className="hover:text-cyan-400 transition-colors">
              28 Compliance Frameworks
            </a>
            <a href="#hitl" className="hover:text-cyan-400 transition-colors">
              HITL Execution Agent
            </a>
            <a href="#integrations" className="hover:text-cyan-400 transition-colors">
              SIEM & Webhooks
            </a>
            <Link to="/ai/advisor" className="hover:text-cyan-400 transition-colors flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-cyan-400" />
              <span>AI Advisor</span>
            </Link>
          </nav>

          {/* Auth Action Buttons */}
          <div className="flex items-center gap-3">
            <Link
              to="/sign-in"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-semibold text-white backdrop-blur-md transition-all hover:border-cyan-500/50 hover:bg-white/10 active:scale-95"
            >
              Sign In
            </Link>
            <Link
              to="/sign-up"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 text-xs font-bold text-black shadow-lg shadow-cyan-500/25 transition-all hover:brightness-110 hover:shadow-cyan-500/40 active:scale-95"
            >
              <span>Deploy Organization</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <section className="relative pt-20 pb-28 px-6 lg:px-8 overflow-hidden">
        {/* Glow Spheres & Background Grid */}
        <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
          <div className="absolute top-1/4 h-[550px] w-[550px] rounded-full bg-cyan-500/15 blur-[140px]" />
          <div className="absolute top-1/3 left-1/4 h-[400px] w-[400px] rounded-full bg-blue-600/10 blur-[160px]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)]" />
        </div>

        <div className="mx-auto max-w-5xl text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-4 py-1.5 text-xs font-medium text-cyan-300 backdrop-blur-md shadow-inner shadow-cyan-500/20 mb-8">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
            <span>Next-Gen Autonomous Cloud Defense · 28 Prowler Frameworks · HITL AI Execution</span>
          </div>

          {/* Main Title */}
          <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white leading-[1.08]">
            The Autonomous <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 bg-clip-text text-transparent">Digital CISO</span> for Multi-Cloud Enterprise
          </h1>

          <p className="mt-6 max-w-3xl mx-auto text-base sm:text-lg text-slate-300 leading-relaxed font-normal">
            Continuous compliance auditing, AI threat triage, toxic attack path discovery, and <strong>Human-In-The-Loop (HITL)</strong> automated remediation across AWS, Azure, GCP, and Kubernetes.
          </p>

          {/* Primary CTA Action Row */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/sign-up"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 px-8 text-sm font-bold text-black shadow-xl shadow-cyan-500/30 transition-all hover:brightness-110 hover:scale-105 active:scale-95"
            >
              <span>Get Started Free</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              to="/compliance"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-7 text-sm font-semibold text-white backdrop-blur-md transition-all hover:border-cyan-500/50 hover:bg-white/10 active:scale-95"
            >
              <ShieldCheck className="h-4 w-4 text-cyan-400" />
              <span>Explore 28 Frameworks</span>
            </Link>

            <Link
              to="/ai/decisions"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-7 text-sm font-semibold text-white backdrop-blur-md transition-all hover:border-cyan-500/50 hover:bg-white/10 active:scale-95"
            >
              <Zap className="h-4 w-4 text-yellow-400" />
              <span>View HITL Console</span>
            </Link>
          </div>

          {/* Trust stats pill bar */}
          <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md">
            <div>
              <div className="font-display text-2xl sm:text-3xl font-extrabold text-cyan-400">28 Standards</div>
              <span className="text-xs text-slate-400">CIS, SOC 2, ISO, PCI, NIST, HIPAA</span>
            </div>
            <div>
              <div className="font-display text-2xl sm:text-3xl font-extrabold text-white">&lt; 15 Mins</div>
              <span className="text-xs text-slate-400">Mean Time to Remediate (MTTR)</span>
            </div>
            <div>
              <div className="font-display text-2xl sm:text-3xl font-extrabold text-emerald-400">100% HITL</div>
              <span className="text-xs text-slate-400">Human Approval Safety Gates</span>
            </div>
            <div>
              <div className="font-display text-2xl sm:text-3xl font-extrabold text-blue-400">Zero Trust</div>
              <span className="text-xs text-slate-400">White-Labeled CISO PDF Exports</span>
            </div>
          </div>
        </div>

        {/* ── Interactive Live Preview Console Card ── */}
        <div className="mx-auto mt-16 max-w-6xl rounded-3xl border border-white/15 bg-gradient-to-b from-white/10 to-white/[0.02] p-2 sm:p-4 shadow-2xl backdrop-blur-2xl">
          <div className="rounded-2xl border border-white/10 bg-[#0B0F17] p-6 sm:p-8">
            {/* Mock Topbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-rose-500/80" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
                </div>
                <span className="font-mono text-xs text-slate-400 font-semibold">
                  digital-ciso-ops.prod // console v2.4
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab("hitl")}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                    activeTab === "hitl"
                      ? "bg-cyan-500 text-black shadow-md shadow-cyan-500/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  HITL AI Agent
                </button>
                <button
                  onClick={() => setActiveTab("compliance")}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                    activeTab === "compliance"
                      ? "bg-cyan-500 text-black shadow-md shadow-cyan-500/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Compliance Scorecard
                </button>
                <button
                  onClick={() => setActiveTab("attack-paths")}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                    activeTab === "attack-paths"
                      ? "bg-cyan-500 text-black shadow-md shadow-cyan-500/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Attack Paths
                </button>
              </div>
            </div>

            {/* Mock Console Content */}
            <div className="mt-6">
              {activeTab === "hitl" && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <div className="lg:col-span-7 space-y-3 text-left">
                    <div className="inline-flex items-center gap-2 rounded-md bg-rose-500/20 px-2.5 py-1 text-xs font-bold text-rose-300 border border-rose-500/30">
                      CRITICAL FINDING · P1 VIOLATION
                    </div>
                    <h3 className="font-display text-lg font-bold text-white">
                      S3 Bucket Public Read Access Enabled (corp-confidential-finance-2026)
                    </h3>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Spectra identified public ACL ingress exposing confidential billing archives. Qwen 3.5 9B generated an automated Terraform remediation playbook with zero downtime.
                    </p>
                    <pre className="rounded-xl border border-white/10 bg-black/60 p-4 font-mono text-xs text-emerald-400 overflow-x-auto leading-relaxed">
{`resource "aws_s3_bucket_public_access_block" "block_public" {
  bucket = "corp-confidential-finance-2026"
  block_public_acls   = true
  block_public_policy = true
  restrict_public_buckets = true
}`}
                    </pre>
                  </div>

                  <div className="lg:col-span-5 rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-5 text-left flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                          Human-In-The-Loop Safety Gate
                        </span>
                        <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-[10px] font-bold text-yellow-300">
                          Pending Approval
                        </span>
                      </div>
                      <div className="mt-4 space-y-2 text-xs text-slate-300">
                        <div className="flex justify-between">
                          <span>Target Asset:</span>
                          <span className="font-mono text-white font-semibold">s3:::corp-confidential</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Blast Radius:</span>
                          <span className="text-emerald-400 font-semibold">0 Impact (Isolated)</span>
                        </div>
                        <div className="flex justify-between">
                          <span>SLA Deadline:</span>
                          <span className="text-yellow-400 font-semibold">2h remaining</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 space-y-2">
                      <Link
                        to="/ai/decisions"
                        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-xs font-bold text-black shadow-lg shadow-cyan-500/20 transition-all hover:bg-cyan-300 active:scale-95"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        <span>Authorize Execution in Console</span>
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "compliance" && (
                <div className="space-y-4 text-left">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base font-bold text-white">
                      28 Continuous Prowler Frameworks
                    </h3>
                    <Link to="/compliance" className="text-xs font-semibold text-cyan-400 hover:underline">
                      View Full Compliance Scorecard →
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {frameworks.slice(0, 8).map((fw, i) => (
                      <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                        <div className="text-xs font-bold text-white">{fw}</div>
                        <div className="mt-2 flex items-baseline justify-between">
                          <span className="font-display text-lg font-extrabold text-emerald-400">
                            {90 + (i % 6)}%
                          </span>
                          <span className="text-[10px] text-emerald-400/80 font-semibold">Compliant</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "attack-paths" && (
                <div className="p-6 text-left space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base font-bold text-white">
                      Autonomous Attack Graph Correlation
                    </h3>
                    <Link to="/attack-paths" className="text-xs font-semibold text-cyan-400 hover:underline">
                      Launch Graph Visualizer →
                    </Link>
                  </div>
                  <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-xs space-y-2">
                    <div className="flex items-center gap-2 text-rose-300 font-bold">
                      <Zap className="h-4 w-4" />
                      <span>Toxic Combination Identified: Internet Ingress ➔ IAM Role ➔ S3 Bucket</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      CI Runner with open RDP port allows unauthenticated STS credential harvesting to assume AdministratorAccess.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature Pillars Grid ── */}
      <section id="features" className="py-24 px-6 lg:px-8 border-t border-white/10 bg-white/[0.01]">
        <div className="mx-auto max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-cyan-400">Core Architecture</span>
            <h2 className="mt-2 font-display text-3xl sm:text-5xl font-black tracking-tight text-white">
              Autonomous Cloud Defense from Detection to Execution
            </h2>
            <p className="mt-4 text-sm sm:text-base text-slate-400">
              Built on battle-tested Prowler telemetry, Qwen 3.5 9B on Azure GPUs, and strict Human-In-The-Loop safety gates.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {/* Feature 1 */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-8 transition-all hover:border-cyan-500/40 hover:bg-white/[0.04]">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-400 mb-6">
                <BrainCircuit className="h-6 w-6" />
              </div>
              <h3 className="font-display text-lg font-bold text-white">
                Spectra Threat Intelligence
              </h3>
              <p className="mt-3 text-xs text-slate-400 leading-relaxed">
                Triage thousands of raw security findings in milliseconds with zero noise. Extracts exact business impact, root cause, and toxic cloud combinations.
              </p>
              <Link to="/ai/advisor" className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-cyan-400 hover:underline">
                <span>Chat with AI Advisor</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Feature 2 */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-8 transition-all hover:border-cyan-500/40 hover:bg-white/[0.04]">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-400 mb-6">
                <Lock className="h-6 w-6" />
              </div>
              <h3 className="font-display text-lg font-bold text-white">
                Human-In-The-Loop (HITL) Agent
              </h3>
              <p className="mt-3 text-xs text-slate-400 leading-relaxed">
                Generates production-grade Terraform and CLI scripts. AI never touches cloud resources without mandatory human approval.
              </p>
              <Link to="/ai/decisions" className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:underline">
                <span>View Decision Gate</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Feature 3 */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-8 transition-all hover:border-cyan-500/40 hover:bg-white/[0.04]">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 mb-6">
                <Award className="h-6 w-6" />
              </div>
              <h3 className="font-display text-lg font-bold text-white">
                28 Prowler Frameworks
              </h3>
              <p className="mt-3 text-xs text-slate-400 leading-relaxed">
                Automated continuous compliance auditing for CIS 3.0, SOC 2, ISO 27001, PCI-DSS 4.0, NIST CSF, HIPAA, GDPR, FedRAMP, DORA, and NIS2.
              </p>
              <Link to="/compliance" className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:underline">
                <span>Explore Compliance Matrix</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Integrations Section ── */}
      <section id="integrations" className="py-24 px-6 lg:px-8 border-t border-white/10">
        <div className="mx-auto max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-cyan-400">Ecosystem</span>
            <h2 className="mt-2 font-display text-3xl sm:text-5xl font-black tracking-tight text-white">
              Connects to Your Security Nervous System
            </h2>
            <p className="mt-4 text-sm sm:text-base text-slate-400">
              Stream findings and audit reports to S3, Jira Cloud, AWS Security Hub, Slack, Splunk, and Datadog.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 text-center">
            {["Amazon S3", "Jira Cloud", "Security Hub", "Slack SecOps", "Splunk SIEM", "Datadog APM"].map((name, i) => (
              <Link
                key={i}
                to="/integrations"
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition-all hover:border-cyan-500/40 hover:bg-white/[0.05] block group"
              >
                <Plug className="h-6 w-6 text-cyan-400 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold text-white block">{name}</span>
                <span className="text-[10px] text-emerald-400 font-semibold">Live Webhook</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final Call To Action ── */}
      <section className="py-24 px-6 lg:px-8 border-t border-white/10 bg-gradient-to-b from-transparent to-cyan-950/20 text-center">
        <div className="mx-auto max-w-4xl">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-400 mb-6 shadow-xl shadow-cyan-500/20">
            <ShieldMark size={44} />
          </div>
          <h2 className="font-display text-3xl sm:text-5xl font-black tracking-tight text-white">
            Ready to Automate Your Cloud Defense?
          </h2>
          <p className="mt-4 text-base text-slate-300 max-w-2xl mx-auto">
            Deploy your enterprise tenant in seconds and connect your AWS, Azure, GCP, or Kubernetes environments.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/sign-up"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 px-8 text-sm font-bold text-black shadow-xl shadow-cyan-500/30 transition-all hover:brightness-110 hover:scale-105 active:scale-95"
            >
              <span>Deploy Organization Account</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              to="/sign-in"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-8 text-sm font-semibold text-white backdrop-blur-md transition-all hover:border-cyan-500/50 hover:bg-white/10 active:scale-95"
            >
              <span>Sign In to Console</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/10 bg-black/60 py-12 px-6 lg:px-8 text-xs text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <ShieldMark size={28} />
            <span className="font-display font-bold text-slate-300">
              DIGITAL CISO © 2026
            </span>
          </div>
          <div className="flex items-center gap-6 text-slate-400">
            <Link to="/sign-in" className="hover:text-cyan-400">Sign In</Link>
            <Link to="/sign-up" className="hover:text-cyan-400">Sign Up</Link>
            <Link to="/compliance" className="hover:text-cyan-400">Compliance</Link>
            <Link to="/ai/decisions" className="hover:text-cyan-400">HITL Decisions</Link>
            <a href="http://localhost:8000/api/v1/reports/executive-summary" target="_blank" className="hover:text-cyan-400">Executive PDF Report</a>
          </div>
        </div>
      </footer>
    </div>
  );
}