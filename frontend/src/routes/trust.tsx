import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShieldCheck,
  Lock,
  Database,
  Globe2,
  Server,
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  KeyRound,
  ExternalLink,
  ChevronRight,
  Shield,
  Layers,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/trust")({
  component: TrustPage,
});

export function TrustPage() {
  const pillars = [
    {
      title: "1. Authentication & Zero-Trust (Auth)",
      icon: Lock,
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
      description: "Strict Deny-by-Default architecture with enterprise-grade identity federation.",
      points: [
        "100% of API endpoints reject unauthenticated traffic with HTTP 401 Unauthorized by default.",
        "Federated enterprise SSO with Microsoft Entra ID (OIDC / SAML 2.0) and Okta.",
        "Delegated Phishing-Resistant MFA (FIDO2 / WebAuthn hardware keys).",
        "Short-lived RS256 cryptographically signed JWTs with asymmetric keys held in Azure Key Vault.",
        "Server-side RBAC enforcement on every handler; UI element hiding is never a security boundary.",
      ],
    },
    {
      title: "2. Cryptographic Multi-Tenancy (Tenancy)",
      icon: Database,
      color: "text-blue-400 bg-blue-500/10 border-blue-500/30",
      description: "Kernel-level database isolation with transaction-scoped Row-Level Security.",
      points: [
        "PostgreSQL Row-Level Security (RLS) policies physically block cross-tenant read/write queries.",
        "Tenant context (tenant_id) bound strictly to authenticated JWT claims; client overrides rejected.",
        "Atomic transactions execute with `SET LOCAL app.current_tenant = <tenant_id>`.",
        "Cloud credentials encrypted per-tenant using Fernet (AES-128-CBC + HMAC-SHA256).",
        "Optional physically dedicated Azure Container App & PostgreSQL instances for tier-1 banks.",
      ],
    },
    {
      title: "3. Sovereign Cloud & Data Residency (Residency)",
      icon: Globe2,
      color: "text-purple-400 bg-purple-500/10 border-purple-500/30",
      description: "In-region data processing and storage ensuring total regulatory sovereignty.",
      points: [
        "Hosted in dedicated enterprise regions: Azure UK South (London), West Europe (Amsterdam), Central India.",
        "Zero transatlantic telemetry routing; UK data stays in UK, EU data stays in EU.",
        "Compliant with UK DPA 2018, EU GDPR, RBI Cloud Guidelines, and local banking secrecy acts.",
        "Databases and inference engines reside in Private VNets with no public IP routes.",
        "Azure Front Door WAF edge termination with TLS 1.3 enforced.",
      ],
    },
    {
      title: "4. Zero-Knowledge Data Model (What's Stored)",
      icon: FileCheck2,
      color: "text-amber-400 bg-amber-500/10 border-amber-500/30",
      description: "We inspect configuration metadata only. We never access your business data.",
      points: [
        "What is stored: Cloud configuration metadata, check pass/fail logs, compliance scorecards.",
        "What is NEVER touched: Customer databases, production files, PII, financial transaction tables.",
        "Scans execute strictly via Least-Privilege Read-Only roles (Security Reader, Cloud Guard Viewer).",
        "Enterprise SIEM streaming: Native event export to Microsoft Sentinel, Splunk, Datadog & IBM QRadar.",
        "SCIM 2.0 & Human-in-the-Loop (HITL) gate: Remediations cannot run autonomously without human approval.",
        "Automated CI regression suite verifies zero unauthenticated API leakage on every commit.",
      ],
    },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-10">
        {/* Header Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/10 via-surface to-background p-8 sm:p-10">
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/20 px-3 py-1 text-xs font-semibold text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Enterprise Trust Center & Due Diligence Whitepaper</span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              How We Secure Digital CISO
            </h1>
            <p className="text-sm sm:text-base leading-relaxed text-muted-foreground">
              Built for tier-1 financial institutions, regulated enterprises, and national cloud workloads.
              Explore our architectural guarantees across authentication, multi-tenant isolation, regional data residency, and zero-knowledge telemetry.
            </p>
          </div>
        </div>

        {/* 4 Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pillars.map((pillar) => (
            <div
              key={pillar.title}
              className="flex flex-col justify-between rounded-xl border border-border/80 bg-surface/60 p-6 backdrop-blur-sm shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${pillar.color}`}>
                    <pillar.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-base font-bold text-foreground">{pillar.title}</h2>
                    <p className="text-xs text-muted-foreground">{pillar.description}</p>
                  </div>
                </div>

                <ul className="mt-4 space-y-2.5">
                  {pillar.points.map((pt, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Private AI Engine & Guardrails Card */}
        <div className="rounded-xl border border-border bg-surface/60 p-6 sm:p-8 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-foreground">Private Sovereign AI (vLLM Engine)</h3>
                <p className="text-xs text-muted-foreground">Zero customer data leaves your private cloud boundary</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 w-fit">
              <CheckCircle2 className="h-3.5 w-3.5" />
              100% Private In-VNet Model
            </span>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs">
            <div className="space-y-1.5">
              <span className="font-semibold text-foreground">No Public AI APIs</span>
              <p className="text-muted-foreground leading-relaxed">
                We never stream your findings or infrastructure architecture to OpenAI, Anthropic, or external public LLM endpoints.
              </p>
            </div>
            <div className="space-y-1.5">
              <span className="font-semibold text-foreground">Dedicated GPU Inference</span>
              <p className="text-muted-foreground leading-relaxed">
                Qwen 2.5 Security models run on self-hosted vLLM nodes in an isolated Azure Private Virtual Network with no external internet egress.
              </p>
            </div>
            <div className="space-y-1.5">
              <span className="font-semibold text-foreground">Zero Data Retention for Training</span>
              <p className="text-muted-foreground leading-relaxed">
                Weights are frozen; your operational telemetry is never stored, retained, or utilized for AI training.
              </p>
            </div>
          </div>
        </div>

        {/* Compliance & Due Diligence Gate CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 rounded-xl border border-primary/30 bg-primary/5 p-6 sm:p-8 text-center sm:text-left">
          <div className="space-y-1">
            <h4 className="font-display text-base font-bold text-foreground">Need a Formal Vendor Risk Assessment Packet?</h4>
            <p className="text-xs text-muted-foreground">
              Our Security Advisory team provides SOC 2 Type II reports, penetration testing executive summaries, and standard CAIQ questionnaires for banking due diligence.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/compliance"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground hover:bg-surface-2 transition-colors"
            >
              <FileCheck2 className="h-4 w-4" />
              <span>Compliance Matrix</span>
            </Link>
            <a
              href="mailto:security@digitalciso.ai?subject=Digital%20CISO%20Due%20Diligence%20Packet%20Request"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
            >
              <span>Request Vendor Packet</span>
              <ChevronRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
