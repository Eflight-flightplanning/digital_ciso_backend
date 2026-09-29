import { useState, useEffect } from "react";
import { ShieldCheck, Database, Lock, Cloud, Cpu, CheckCircle2, Terminal, ArrowRight } from "lucide-react";
import { ShieldMark } from "@/components/brand/Logo";

interface StepItem {
  id: string;
  label: string;
  detail: string;
  icon: typeof ShieldCheck;
  threshold: number; // percentage where this step activates
}

const STEPS: StepItem[] = [
  {
    id: "tenant_isolation",
    label: "Tenant Partition & Namespace Isolation",
    detail: "Allocating dedicated tenant schema with cryptographic tenant ID",
    icon: Database,
    threshold: 15,
  },
  {
    id: "rls_security",
    label: "PostgreSQL Row-Level Security (RLS)",
    detail: "Enforcing zero-leakage data isolation policies across database tables",
    icon: Lock,
    threshold: 38,
  },
  {
    id: "cloud_subscriptions",
    label: "Cloud Modular Subscriptions & OIDC Trust",
    detail: "Configuring multi-cloud connectors and ephemeral read-only IAM scopes",
    icon: Cloud,
    threshold: 62,
  },
  {
    id: "compliance_frameworks",
    label: "Compliance Baselines & Security Guardrails",
    detail: "Activating CIS benchmarks, NCA ECC/CSCC, and ISO 27001 control matrices",
    icon: ShieldCheck,
    threshold: 85,
  },
  {
    id: "ai_telemetry",
    label: "Spectra AI Engine & Neo4j Threat Graph",
    detail: "Readying agentless assurance graph and continuous telemetry monitors",
    icon: Cpu,
    threshold: 98,
  },
];

const LOG_MESSAGES = [
  "[SYS_INIT] Initializing multi-tenant security envelope...",
  "[DB_RLS] Applying RowLevelSecurityConstraint on tenant partition...",
  "[OIDC_TRUST] Negotiating federated identity and zero-trust key pairs...",
  "[MODULES] Initializing modular cloud subscriptions...",
  "[COMPLIANCE] Compiling CIS, NCA, and MITRE ATT&CK security controls...",
  "[GRAPH_CORE] Neo4j cypher query engine online...",
  "[AI_SPECTRA] Telemetry synthesis neural pipeline standing by...",
  "[COMPLETE] Tenant workspace verification passed with zero errors.",
];

interface CompanyProvisioningLoaderProps {
  companyName: string;
  onComplete: () => void;
  durationMs?: number; // default ~4500ms
}

export function CompanyProvisioningLoader({
  companyName,
  onComplete,
  durationMs = 4500,
}: CompanyProvisioningLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [currentLogIndex, setCurrentLogIndex] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);

  useEffect(() => {
    const startTime = performance.now();
    let animFrame: number;

    const updateProgress = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const rawPct = Math.min((elapsed / durationMs) * 100, 100);

      // Nonlinear easing for authentic feel: quick start, deliberate middle, smooth finish
      let easedPct = rawPct;
      if (rawPct < 30) {
        easedPct = rawPct * 1.1;
      } else if (rawPct < 80) {
        easedPct = 33 + (rawPct - 30) * 0.9;
      } else {
        easedPct = 78 + (rawPct - 80) * 1.1;
      }
      easedPct = Math.min(Math.round(easedPct), 100);
      setProgress(easedPct);

      // Advance logs based on progress
      const logIdx = Math.min(
        Math.floor((easedPct / 100) * LOG_MESSAGES.length),
        LOG_MESSAGES.length - 1
      );
      setCurrentLogIndex(logIdx);

      if (rawPct < 100) {
        animFrame = requestAnimationFrame(updateProgress);
      } else {
        setIsFinishing(true);
        setTimeout(() => {
          onComplete();
        }, 700);
      }
    };

    animFrame = requestAnimationFrame(updateProgress);
    return () => cancelAnimationFrame(animFrame);
  }, [durationMs, onComplete]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col justify-between bg-[#080B11] text-slate-100 font-sans antialiased overflow-hidden transition-opacity duration-700 ${
        isFinishing ? "opacity-0 pointer-events-none scale-[1.02]" : "opacity-100 scale-100"
      }`}
    >
      {/* ── Ambient Radial Glows & Grid ── */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/4 -translate-x-1/2 -translate-y-1/2 h-[38rem] w-[38rem] rounded-full bg-cyan-500/15 blur-[160px]" />
        <div className="absolute right-10 bottom-10 h-[28rem] w-[28rem] rounded-full bg-[#0052CC]/15 blur-[150px]" />
        <div
          className="absolute inset-0 [mask-image:radial-gradient(ellipse_70%_70%_at_50%_45%,#000_65%,transparent_100%)] bg-[radial-gradient(circle,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:28px_28px]"
        />
      </div>

      {/* ── Top Header Bar ── */}
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <ShieldMark size={32} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-black tracking-wider text-white">DIGITAL CISO</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-bold text-cyan-400">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                TENANT PROVISIONING
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Enterprise Security Architecture Initialization</p>
          </div>
        </div>

        <button
          onClick={onComplete}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
        >
          <span>Skip initialization</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </header>

      {/* ── Main Provisioning Centerstage ── */}
      <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-4">
        {/* Pulsing Shield Centerpiece */}
        <div className="relative mb-6 flex items-center justify-center">
          {/* Animated concentric pulse rings */}
          <div className="absolute h-28 w-28 rounded-full border border-cyan-500/30 animate-ping opacity-40 duration-1000" />
          <div className="absolute h-36 w-36 rounded-full border border-blue-500/20 animate-pulse" />
          
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-cyan-500/40 p-4 shadow-[0_0_40px_rgba(6,182,212,0.3)]">
            <ShieldMark size={48} />
          </div>
        </div>

        {/* Company Title */}
        <div className="text-center mb-6">
          <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-cyan-400">
            Setting Up Organization Environment
          </span>
          <h1 className="mt-1 text-2xl sm:text-3xl font-black text-white tracking-tight">
            {companyName || "Enterprise Workspace"}
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Provisioning isolated multi-cloud assurance space and zero-trust policies
          </p>
        </div>

        {/* ── Progress Bar Card ── */}
        <div className="w-full rounded-2xl border border-white/10 bg-slate-950/70 p-5 backdrop-blur-xl shadow-2xl">
          <div className="flex items-center justify-between text-xs mb-2.5">
            <span className="font-mono text-slate-300 font-medium">
              {progress < 100 ? "Configuring security boundaries..." : "Workspace ready!"}
            </span>
            <span className="font-mono font-bold text-cyan-400 text-sm">
              {progress}%
            </span>
          </div>

          {/* Progress track */}
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-800/80 border border-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-400 to-emerald-400 shadow-[0_0_15px_rgba(6,182,212,0.8)] transition-all duration-150 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* ── Step-by-Step Checklist ── */}
          <div className="mt-5 space-y-2.5">
            {STEPS.map((step) => {
              const Icon = step.icon;
              const isCompleted = progress >= step.threshold;
              const isCurrent = !isCompleted && progress >= step.threshold - 20;

              return (
                <div
                  key={step.id}
                  className={`flex items-start gap-3 rounded-lg px-3 py-2 transition-all ${
                    isCompleted
                      ? "bg-white/[0.03] border border-white/5"
                      : isCurrent
                      ? "bg-cyan-500/[0.08] border border-cyan-500/20"
                      : "opacity-40"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 transition-transform scale-110" />
                    ) : isCurrent ? (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full border border-cyan-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
                      </span>
                    ) : (
                      <Icon className="h-4 w-4 text-slate-500" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-semibold ${
                          isCompleted ? "text-slate-200" : isCurrent ? "text-cyan-300" : "text-slate-400"
                        }`}
                      >
                        {step.label}
                      </span>
                      {isCompleted && (
                        <span className="font-mono text-[10px] text-emerald-400 font-semibold">
                          DONE
                        </span>
                      )}
                      {isCurrent && (
                        <span className="font-mono text-[10px] text-cyan-400 animate-pulse font-semibold">
                          PROCESSING
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">{step.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* ── Bottom Telemetry Log Terminal Ticker ── */}
      <footer className="relative z-10 mx-auto w-full max-w-4xl px-6 py-4">
        <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-black/50 px-4 py-2.5 font-mono text-[11px] text-slate-400 backdrop-blur-md">
          <Terminal className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
          <span className="truncate text-slate-300">
            {LOG_MESSAGES[currentLogIndex]}
          </span>
          <span className="ml-auto shrink-0 font-bold text-cyan-400/80">
            [SEC_OK]
          </span>
        </div>
      </footer>
    </div>
  );
}
