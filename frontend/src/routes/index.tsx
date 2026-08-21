import { useState, useEffect, useRef } from "react";
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

/* ═══════════════════════════════════════════════════════════════════════
   ANIMATION HOOKS
   ═══════════════════════════════════════════════════════════════════════ */

/** Triggers once when the element scrolls into the viewport */
function useInView(ref: React.RefObject<Element | null>, threshold = 0.15) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return inView;
}

/** Animates a number from 0 → target with ease-out cubic */
function useCountUp(target: number, duration: number, enabled: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const t0 = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, target, duration]);
  return value;
}

/** Rotating typewriter — types in, holds, deletes, cycles to next phrase */
const HERO_PHRASES = ["Continuous Compliance", "AI Threat Intelligence", "HITL Remediation"];

function useRotatingText(phrases: readonly string[], typeSpeed = 135, holdMs = 4500, deleteSpeed = 50) {
  const [text, setText] = useState("");
  const [idx, setIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (done || paused) return undefined;
    const phrase = phrases[idx];
    const isLastPhrase = idx === phrases.length - 1;
    if (!deleting) {
      if (text.length < phrase.length) {
        const t = setTimeout(() => setText(phrase.slice(0, text.length + 1)), typeSpeed);
        return () => clearTimeout(t);
      }
      // Last phrase fully typed — stop here
      if (isLastPhrase) {
        setDone(true);
        return undefined;
      }
      setPaused(true);
      const t = setTimeout(() => {
        setPaused(false);
        setDeleting(true);
      }, holdMs);
      return () => clearTimeout(t);
    }
    if (text.length > 0) {
      const t = setTimeout(() => setText(text.slice(0, -1)), deleteSpeed);
      return () => clearTimeout(t);
    }
    setDeleting(false);
    setIdx((i) => (i + 1) % phrases.length);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, deleting, paused, idx, done]);

  // Only show cursor while actively adding characters; remove it the moment the phrase is written completely
  const isTyping = !done && !paused && !deleting && text.length < phrases[idx].length;

  return { text, isTyping, done };
}

/* ═══════════════════════════════════════════════════════════════════════
   REUSABLE ANIMATED SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════ */

/** Typewriter for code blocks — types character-by-character with blinking cursor */
function TypewriterCode({
  code,
  speed = 16,
  active,
  className = "",
}: {
  code: string;
  speed?: number;
  active: boolean;
  className?: string;
}) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active) {
      setDisplayed("");
      setDone(false);
      return;
    }
    let i = 0;
    setDone(false);
    const timer = setInterval(() => {
      if (i < code.length) {
        i++;
        setDisplayed(code.slice(0, i));
      } else {
        setDone(true);
        clearInterval(timer);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [active, code, speed]);

  return (
    <pre className={className}>
      {displayed}
      {!done && active && (
        <span style={{ animation: "cursorBlink 1s step-end infinite" }}>█</span>
      )}
    </pre>
  );
}

/** 5-axis radar chart that grows from the center on load */
function AnimatedRadar({ visible, isDark }: { visible: boolean; isDark: boolean }) {
  const axes = [
    { label: "Compliance", value: 93 },
    { label: "Identity", value: 87 },
    { label: "Network", value: 91 },
    { label: "Data", value: 95 },
    { label: "Compute", value: 89 },
  ];
  const cx = 100,
    cy = 100,
    r = 68,
    n = 5;
  const vertex = (i: number, s: number) => {
    const a = (i * 2 * Math.PI) / n - Math.PI / 2;
    return { x: cx + r * s * Math.cos(a), y: cy + r * s * Math.sin(a) };
  };
  const poly = (s: number) =>
    Array.from({ length: n }, (_, i) => vertex(i, s))
      .map((p) => `${p.x},${p.y}`)
      .join(" ");
  const dataPoly = axes.map((a, i) => vertex(i, a.value / 100)).map((p) => `${p.x},${p.y}`).join(" ");

  const labelOffsets = [
    { dx: 0, dy: -14 },
    { dx: 16, dy: 0 },
    { dx: 10, dy: 14 },
    { dx: -10, dy: 14 },
    { dx: -16, dy: 0 },
  ];

  return (
    <svg viewBox="0 0 200 200" className="w-full max-w-[170px] mx-auto">
      {[0.25, 0.5, 0.75, 1.0].map((s) => (
        <polygon key={s} points={poly(s)} fill="none" stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.14)"} strokeWidth="0.75" />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const p = vertex(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.14)"} strokeWidth="0.75" />;
      })}
      <polygon
        points={dataPoly}
        fill={isDark ? "rgba(6,182,212,0.14)" : "rgba(6,182,212,0.18)"}
        stroke={isDark ? "#06b6d4" : "#0284c7"}
        strokeWidth="1.75"
        strokeLinejoin="round"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1)" : "scale(0.2)",
          transformOrigin: `${cx}px ${cy}px`,
          transition: "opacity 1s ease-out 0.3s, transform 1.2s cubic-bezier(0.16,1,0.3,1) 0.3s",
        }}
      />
      {axes.map((a, i) => {
        const p = vertex(i, a.value / 100);
        return (
          <circle
            key={`dot-${i}`}
            cx={p.x}
            cy={p.y}
            r="3.5"
            fill={isDark ? "#06b6d4" : "#0284c7"}
            style={{
              opacity: visible ? 1 : 0,
              transition: `opacity 0.4s ease ${0.9 + i * 0.08}s`,
            }}
          />
        );
      })}
      {axes.map((a, i) => {
        const p = vertex(i, 1);
        return (
          <text
            key={`label-${i}`}
            x={p.x + labelOffsets[i].dx}
            y={p.y + labelOffsets[i].dy}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={isDark ? "#94a3b8" : "#334155"}
            fontSize="7.5"
            fontWeight="700"
            style={{ opacity: visible ? 1 : 0, transition: `opacity 0.5s ease ${1.0 + i * 0.06}s` }}
          >
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}

/** Circular arc showing average compliance score */
function ComplianceArc({ score, visible, isDark }: { score: number; visible: boolean; isDark: boolean }) {
  const radius = 56;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-2 mb-10">
      <div className="relative">
        <svg width="130" height="130" viewBox="0 0 130 130">
          <circle cx="65" cy="65" r={radius} fill="none" stroke={isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0"} strokeWidth="5.5" />
          <circle
            cx="65"
            cy="65"
            r={radius}
            fill="none"
            stroke="url(#arcGrad)"
            strokeWidth="5.5"
            strokeLinecap="round"
            transform="rotate(-90 65 65)"
            strokeDasharray={circ}
            strokeDashoffset={visible ? offset : circ}
            style={{ transition: "stroke-dashoffset 1.8s cubic-bezier(0.16,1,0.3,1)" }}
          />
          <defs>
            <linearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black text-primary">{visible ? score : 0}%</span>
          <span className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-600"}`}>Avg Score</span>
        </div>
      </div>
      <span className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-700"}`}>Across 28+ Global Standards</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CSS KEYFRAMES (injected via style tag — zero external deps)
   ═══════════════════════════════════════════════════════════════════════ */

const ANIM_STYLES = `
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.7); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(16px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes marqueeScroll {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
@keyframes cursorBlink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0; }
}
@keyframes breathe {
  0%, 100% { transform: scale(1);   opacity: 0.5; }
  50%      { transform: scale(1.06); opacity: 0.9; }
}
@keyframes gentlePulse {
  0%, 100% { box-shadow: 0 0 20px rgba(6,182,212,0.25); }
  50%      { box-shadow: 0 0 35px rgba(6,182,212,0.45); }
}
@keyframes dotDrift {
  0%, 100% { transform: translate(0, 0); }
  50%      { transform: translate(3px, 2px); }
}
@keyframes tabIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Respect reduced-motion preferences */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;

/* ═══════════════════════════════════════════════════════════════════════
   STATIC DATA
   ═══════════════════════════════════════════════════════════════════════ */

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

const capabilities = [
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
];

const compliancePills = [
  "CIS AWS 3.0", "CIS Azure 2.1", "CIS GCP 2.0", "CIS OCI 2.0", "CIS Kubernetes 1.8",
  "SOC 2 Type II", "ISO 27001:2022", "PCI-DSS 4.0", "NIST CSF 2.0",
  "NIST 800-53 r5", "NIST 800-171", "HIPAA", "GDPR",
  "FedRAMP Moderate", "DORA", "NIS2", "MITRE ATT&CK",
  "AWS Well-Architected", "AWS Audit Manager", "OCI Best Practices", "ENS (Spain)", "FFIEC",
  "GxP 21 CFR Part 11", "CMMC 2.0", "KISA (Korea)", "RBI CSF (India)",
  "CSA CCM 4.0", "Cyber Essentials UK", "ACSC Essential 8", "MAS TRM (Singapore)",
];

const TERRAFORM_CODE = `resource "aws_s3_bucket_public_access_block" "enforce_block" {
  bucket                  = "corp-confidential-finance-2026"
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}`;

const MCP_JSON_CODE = `{
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
}`;

const mcpTools = [
  "ciso_get_findings — Query findings by severity, provider, status",
  "ciso_analyze_finding — AI root-cause analysis with risk scoring",
  "ciso_get_compliance_overview — 28 framework readiness scores",
  "remediation_generate_playbook — AI-generated Terraform/CLI scripts",
  "ciso_get_integrations — Connected SIEM & webhook channels",
];

/* ═══════════════════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

function MarketingLandingPage() {
  /* ── Theme ── */
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

  /* ── Console tab state ── */
  const [activeTab, setActiveTab] = useState<"hitl" | "compliance" | "attack-paths">("hitl");

  /* ── Scroll progress ── */
  const [scrollProgress, setScrollProgress] = useState(0);
  useEffect(() => {
    const handler = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(h > 0 ? window.scrollY / h : 0);
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  /* ── Section refs + IntersectionObserver triggers ── */
  const heroRef = useRef<HTMLDivElement>(null);
  const pipelineRef = useRef<HTMLDivElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const capsRef = useRef<HTMLDivElement>(null);
  const complianceRef = useRef<HTMLDivElement>(null);
  const mcpRef = useRef<HTMLDivElement>(null);

  const heroVisible = useInView(heroRef, 0.1);
  const pipelineVisible = useInView(pipelineRef, 0.12);
  const consoleVisible = useInView(consoleRef, 0.1);
  const capsVisible = useInView(capsRef, 0.08);
  const complianceVisible = useInView(complianceRef, 0.1);
  const mcpVisible = useInView(mcpRef, 0.15);

  /* ── Hero rotating typewriter ── */
  const { text: rotatingText, isTyping, done: typewriterDone } = useRotatingText(HERO_PHRASES);

  /* ── Hero metric count-ups (delayed after hero enters view) ── */
  const [heroMetricsReady, setHeroMetricsReady] = useState(false);
  useEffect(() => {
    if (heroVisible) {
      const t = setTimeout(() => setHeroMetricsReady(true), 800);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [heroVisible]);
  const metricControls = useCountUp(2847, 1400, heroMetricsReady);
  const metricFindings = useCountUp(14, 1000, heroMetricsReady);
  const metricScore = useCountUp(93, 1200, heroMetricsReady);

  /* ── Console scan progress ── */
  const [scanComplete, setScanComplete] = useState(false);
  useEffect(() => {
    if (consoleVisible && !scanComplete) {
      const t = setTimeout(() => setScanComplete(true), 1600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [consoleVisible, scanComplete]);

  /* ── Attack path node pulse loop ── */
  const [attackPhase, setAttackPhase] = useState(0);
  useEffect(() => {
    if (activeTab !== "attack-paths" || !scanComplete) return;
    const t = setInterval(() => setAttackPhase((p) => (p + 1) % 4), 850);
    return () => clearInterval(t);
  }, [activeTab, scanComplete]);

  /* ── Compliance arc count-up ── */
  const complianceScore = useCountUp(93, 1600, complianceVisible);

  return (
    <div
      className={`min-h-screen font-sans antialiased overflow-x-hidden transition-colors duration-300 ${
        isDark
          ? "bg-background text-foreground selection:bg-cyan-500 selection:text-black"
          : "bg-background text-foreground selection:bg-cyan-500 selection:text-black"
      }`}
    >
      {/* Inject keyframe animations */}
      <style dangerouslySetInnerHTML={{ __html: ANIM_STYLES }} />

      {/* ════════════════════════════════════════════════════════════════════
          HEADER — Floating Navbar with Scroll Progress
      ════════════════════════════════════════════════════════════════════ */}
      <header
        className={`sticky top-0 z-50 border-b backdrop-blur-xl transition-all duration-300 ${
          isDark
            ? "border-border bg-background/85 shadow-[0_4px_24px_rgba(0,0,0,0.6)]"
            : "border-border bg-background/90 shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
        }`}
      >
        <div className="mx-auto flex h-20 w-full max-w-[1720px] items-center justify-between px-6 sm:px-10 lg:px-14 xl:px-16">
          {/* Brand */}
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

          {/* Navigation */}
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
                className={`relative rounded-full px-4 py-2 text-[13.5px] font-semibold transition-all duration-200 ${
                  isDark
                    ? "text-slate-300 hover:bg-white/[0.08] hover:text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Auth & Theme */}
          <div className="flex items-center gap-3 shrink-0">
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

        {/* Scroll Progress Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px]">
          <div
            className="h-full bg-gradient-to-r from-cyan-500/80 to-blue-600/80"
            style={{ width: `${scrollProgress * 100}%`, transition: "width 80ms linear" }}
          />
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════════════
          HERO — Typewriter Headline + Animated Dashboard Panel
      ════════════════════════════════════════════════════════════════════ */}
      <section id="overview" className="relative isolate overflow-hidden pt-16 pb-24 sm:pt-20 sm:pb-32 px-6 lg:px-8">
        {/* Background effects */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className={`absolute -left-40 top-[-10%] h-[34rem] w-[34rem] rounded-full blur-[140px] ${isDark ? "bg-[#0A6EDD]/20" : "bg-[#0A6EDD]/15"}`} />
          <div className={`absolute -right-32 top-[15%] h-[30rem] w-[30rem] rounded-full blur-[140px] ${isDark ? "bg-cyan-500/15" : "bg-cyan-500/12"}`} />
          <div
            className={`absolute inset-0 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)] ${
              isDark
                ? "bg-[radial-gradient(circle,rgba(255,255,255,0.035)_1px,transparent_1px)]"
                : "bg-[radial-gradient(circle,rgba(15,23,42,0.06)_1px,transparent_1px)]"
            } bg-[size:24px_24px]`}
            style={{ animation: "dotDrift 8s ease-in-out infinite" }}
          />
        </div>

        <div ref={heroRef} className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
            {/* ── Left Column: Headline & CTAs ── */}
            <div className="flex flex-col items-start gap-7">
              {/* Badge Pill */}
              <div
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold backdrop-blur-md shadow-xs ${
                  isDark ? "border-primary/30 bg-primary/10 text-cyan-300" : "border-primary/40 bg-primary/10 text-cyan-900"
                }`}
                style={{ opacity: 0, animation: heroVisible ? "fadeUp 0.6s ease forwards" : "none" }}
              >
                <span className="rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 px-2.5 py-0.5 text-[0.65rem] font-black uppercase tracking-wider text-white shadow-xs">
                  Autonomous CISO
                </span>
                <span className={isDark ? "text-cyan-300" : "text-slate-800 font-semibold"}>Continuous Cloud Auditing · 28 Frameworks</span>
              </div>

              {/* Headline with rotating typewriter */}
              <h1
                className={`text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.08] ${isDark ? "text-white" : "text-slate-950"}`}
                style={{ opacity: 0, animation: heroVisible ? "fadeUp 0.6s ease 0.15s forwards" : "none" }}
              >
                Autonomous Cloud Security &{" "}
                <span className="bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 bg-clip-text text-transparent">
                  {rotatingText}
                  {isTyping && !typewriterDone && (
                    <span
                      className="inline-block w-[3px] h-[0.85em] align-middle ml-0.5 rounded-sm bg-cyan-500"
                      style={{ animation: "cursorBlink 1s step-end infinite" }}
                    />
                  )}
                </span>{" "}
                for Enterprise.
              </h1>

              {/* Subhead */}
              <p
                className={`text-lg font-medium leading-relaxed max-w-xl ${isDark ? "text-slate-300" : "text-slate-700 font-medium"}`}
                style={{ opacity: 0, animation: heroVisible ? "fadeUp 0.6s ease 0.3s forwards" : "none" }}
              >
                Continuous compliance auditing across <strong className={isDark ? "text-white" : "text-slate-950"}>28 global standards</strong>, instant AI threat triage, toxic attack path discovery, and{" "}
                <strong className={isDark ? "text-white" : "text-slate-950"}>Human-In-The-Loop (HITL)</strong> automated remediation across <strong className={isDark ? "text-white" : "text-slate-950"}>AWS, Azure, GCP, OCI & Kubernetes</strong>.
              </p>

              {/* CTAs */}
              <div
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 w-full sm:w-auto pt-2"
                style={{ opacity: 0, animation: heroVisible ? "fadeUp 0.6s ease 0.45s forwards" : "none" }}
              >
                <Link
                  to="/sign-up"
                  className="inline-flex h-13 items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 px-8 text-base font-bold text-white shadow-[0_0_24px_rgba(6,182,212,0.45)] transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                  style={{ animation: "gentlePulse 3s ease-in-out infinite 2s" }}
                >
                  <span>Deploy Organization Account</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <Link
                  to="/sign-in"
                  className={`inline-flex h-13 items-center justify-center gap-2 rounded-full border px-8 text-base font-semibold transition-all duration-200 hover:-translate-y-0.5 active:scale-95 ${
                    isDark
                      ? "border-white/25 bg-white/5 text-white backdrop-blur-sm hover:bg-white/12 hover:border-white/40"
                      : "border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50 hover:border-slate-400"
                  }`}
                >
                  <Play className="h-4 w-4 text-cyan-500 fill-cyan-500" />
                  <span>Explore Live Console</span>
                </Link>
              </div>

              {/* Cloud Coverage */}
              <div
                className="pt-2 flex flex-wrap items-center gap-6 text-xs font-semibold"
                style={{ opacity: 0, animation: heroVisible ? "fadeUp 0.6s ease 0.6s forwards" : "none" }}
              >
                <span className={`uppercase tracking-widest text-[10px] ${isDark ? "text-slate-500 font-bold" : "text-slate-600 font-extrabold"}`}>Cloud Coverage:</span>
                <span className={`flex items-center gap-1.5 ${isDark ? "text-slate-300" : "text-slate-800 font-bold"}`}><Cloud className="h-4 w-4 text-[#FF9900]" /> AWS</span>
                <span className={`flex items-center gap-1.5 ${isDark ? "text-slate-300" : "text-slate-800 font-bold"}`}><Cloud className="h-4 w-4 text-[#0078D4]" /> Azure</span>
                <span className={`flex items-center gap-1.5 ${isDark ? "text-slate-300" : "text-slate-800 font-bold"}`}><Cloud className="h-4 w-4 text-[#4285F4]" /> GCP</span>
                <span className={`flex items-center gap-1.5 ${isDark ? "text-slate-300" : "text-slate-800 font-bold"}`}><Cloud className="h-4 w-4 text-[#C74634]" /> OCI</span>
                <span className={`flex items-center gap-1.5 ${isDark ? "text-slate-300" : "text-slate-800 font-bold"}`}><Server className="h-4 w-4 text-[#326CE5]" /> Kubernetes</span>
              </div>
            </div>

            {/* ── Right Column: Animated Security Dashboard Panel ── */}
            <div
              className="relative"
              style={{ opacity: 0, animation: heroVisible ? "fadeUp 0.7s ease 0.2s forwards" : "none" }}
            >
              <div
                className={`relative overflow-hidden rounded-3xl p-6 sm:p-8 transition-all ${
                  isDark
                    ? "border border-white/15 bg-white/[0.04] backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
                    : "border border-slate-200/90 bg-white/95 backdrop-blur-2xl shadow-[0_20px_50px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/5"
                }`}
              >
                {/* Panel Header */}
                <div className={`flex items-center justify-between border-b pb-4 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-white" : "text-slate-950"}`}>
                      Live Security Posture
                    </span>
                  </div>
                  <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold ${isDark ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-300 text-emerald-700"}`}>
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    Production
                  </span>
                </div>

                {/* Radar Chart + Metrics Row */}
                <div className="mt-5 flex flex-col items-center">
                  <AnimatedRadar visible={heroVisible} isDark={isDark} />

                  <div className="mt-4 w-full grid grid-cols-3 gap-3">
                    {[
                      { label: "Controls Verified", value: metricControls.toLocaleString(), color: "text-primary" },
                      { label: "Critical Findings", value: String(metricFindings), color: isDark ? "text-rose-400" : "text-rose-600" },
                      { label: "Avg Score", value: `${metricScore}%`, color: isDark ? "text-emerald-400" : "text-emerald-600" },
                    ].map((m, i) => (
                      <div
                        key={m.label}
                        className={`text-center rounded-xl p-2.5 ${isDark ? "bg-white/[0.03] border border-white/5" : "bg-slate-50 border border-slate-200/80 shadow-2xs"}`}
                        style={{
                          opacity: 0,
                          animation: heroMetricsReady ? `fadeUp 0.4s ease ${i * 80}ms forwards` : "none",
                        }}
                      >
                        <div className={`text-lg font-black ${m.color}`}>{m.value}</div>
                        <div className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-600 font-bold"}`}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Architecture Cards */}
                <div className="mt-5 space-y-3">
                  {[
                    {
                      icon: Award,
                      title: "28+ Global Compliance Frameworks",
                      desc: "CIS (AWS/Azure/GCP/OCI/K8s), SOC 2, ISO 27001, PCI-DSS, NIST & HIPAA",
                    },
                    {
                      icon: BrainCircuit,
                      title: "Spectra AI Threat Triage & Attack Paths",
                      desc: "Instant multi-cloud blast radius calculation and toxic privilege escalation mapping",
                    },
                    {
                      icon: Lock,
                      title: "Human-In-The-Loop (HITL) Execution",
                      desc: "AI writes Terraform fixes; nothing touches cloud without analyst approval",
                    },
                  ].map((card, i) => {
                    const CardIcon = card.icon;
                    return (
                      <div
                        key={card.title}
                        className={`group rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-0.5 ${
                          isDark ? "border-white/10 bg-white/[0.02] hover:border-primary/40" : "border-slate-200 bg-slate-50/70 hover:bg-white hover:border-primary shadow-2xs"
                        }`}
                        style={{
                          opacity: 0,
                          animation: heroMetricsReady ? `slideInRight 0.45s ease ${i * 80 + 200}ms forwards` : "none",
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 text-cyan-500 ring-1 ring-cyan-500/30">
                            <CardIcon className="h-4 w-4" />
                          </div>
                          <div>
                            <div className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-950"}`}>{card.title}</div>
                            <div className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600 font-medium"}`}>{card.desc}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Trust Footer */}
                <div className={`mt-5 pt-4 border-t flex flex-wrap items-center justify-between gap-3 text-xs ${isDark ? "border-white/10 text-slate-400" : "border-slate-200 text-slate-700 font-semibold"}`}>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    Zero-Agent Cloud Connect
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    Continuous Audit Trails
                  </span>
                  <span className="flex items-center gap-1.5">
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
          MARQUEE — Real Scrolling Integration Ticker (Two Rows)
      ════════════════════════════════════════════════════════════════════ */}
      <section id="integrations" className={`border-y py-8 overflow-hidden ${isDark ? "border-white/[0.08] bg-white/[0.02]" : "border-slate-200 bg-slate-50/80"}`}>
        <div className="mx-auto max-w-7xl px-6 mb-5 text-center">
          <p className={`text-xs font-bold uppercase tracking-[0.2em] ${isDark ? "text-slate-400" : "text-slate-600 font-extrabold"}`}>
            Bi-directional telemetry streaming with enterprise SIEM & cloud infrastructure
          </p>
        </div>

        {/* Row 1 — scrolls left */}
        <div className="relative w-full overflow-hidden mb-3">
          <div className="flex w-max gap-4 px-2" style={{ animation: "marqueeScroll 50s linear infinite" }}>
            {marqueePartners.concat(marqueePartners).map((partner, i) => (
              <div
                key={`r1-${i}`}
                className={`flex items-center gap-2.5 rounded-full border px-4 py-2 text-xs font-semibold whitespace-nowrap shadow-xs transition-all duration-200 hover:scale-105 ${
                  isDark
                    ? "border-white/10 bg-white/[0.04] text-slate-300 hover:border-primary/40"
                    : "border-slate-200 bg-white text-slate-800 hover:border-primary shadow-xs"
                }`}
              >
                <span className="font-extrabold text-primary">{partner.icon}</span>
                <span>{partner.name}</span>
                <span className={`text-[10px] font-mono ${isDark ? "text-slate-400" : "text-slate-500 font-medium"}`}>({partner.category})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Row 2 — scrolls right (reverse) */}
        <div className="relative w-full overflow-hidden">
          <div className="flex w-max gap-4 px-2" style={{ animation: "marqueeScroll 55s linear infinite reverse" }}>
            {[...marqueePartners].reverse().concat([...marqueePartners].reverse()).map((partner, i) => (
              <div
                key={`r2-${i}`}
                className={`flex items-center gap-2.5 rounded-full border px-4 py-2 text-xs font-semibold whitespace-nowrap shadow-xs transition-all duration-200 hover:scale-105 ${
                  isDark
                    ? "border-white/10 bg-white/[0.04] text-slate-300 hover:border-primary/40"
                    : "border-slate-200 bg-white text-slate-800 hover:border-primary shadow-xs"
                }`}
              >
                <span className="font-extrabold text-primary">{partner.icon}</span>
                <span>{partner.name}</span>
                <span className={`text-[10px] font-mono ${isDark ? "text-slate-400" : "text-slate-500 font-medium"}`}>({partner.category})</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          HOW IT WORKS — Animated Pipeline with Connecting Line
      ════════════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className={`py-24 px-6 lg:px-8 border-b ${isDark ? "border-white/[0.06]" : "border-slate-200 bg-white"}`}>
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
            <div
              className="max-w-2xl"
              style={{ opacity: 0, animation: pipelineVisible ? "fadeUp 0.5s ease forwards" : "none" }}
            >
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
                  : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100 shadow-xs"
              }`}
              style={{ opacity: 0, animation: pipelineVisible ? "fadeUp 0.5s ease 0.1s forwards" : "none" }}
            >
              <span>View 28 Framework Scorecards</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div ref={pipelineRef} className="relative">
            {/* Connecting line — desktop only */}
            <div className="hidden lg:block absolute top-[3.5rem] left-[12%] right-[12%] h-[2px] z-0">
              <div
                className={`h-full rounded-full ${isDark ? "bg-gradient-to-r from-cyan-500/30 via-cyan-400/50 to-blue-500/30" : "bg-gradient-to-r from-cyan-500/40 via-blue-500/50 to-cyan-500/40"}`}
                style={{
                  width: pipelineVisible ? "100%" : "0%",
                  transition: "width 1.5s cubic-bezier(0.16,1,0.3,1)",
                }}
              />
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 relative z-10">
              {howItWorks.map((item, i) => {
                const Icon = item.icon;
                return (
                  <div
                    key={i}
                    className={`group relative overflow-hidden rounded-2xl border p-7 transition-all duration-300 hover:-translate-y-1 ${
                      isDark
                        ? "border-white/[0.08] bg-background hover:border-primary/50 hover:shadow-[0_12px_30px_-10px_rgba(6,182,212,0.25)]"
                        : "border-slate-200 bg-white hover:border-primary hover:shadow-[0_12px_30px_-10px_rgba(6,182,212,0.2)] shadow-xs"
                    }`}
                    style={{
                      opacity: 0,
                      animation: pipelineVisible ? `fadeUp 0.5s ease ${300 + i * 150}ms forwards` : "none",
                    }}
                  >
                    <span className={`absolute top-6 right-6 font-mono text-2xl font-black transition-colors ${isDark ? "text-slate-500/30 group-hover:text-primary/60" : "text-slate-300 group-hover:text-primary/70"}`}>
                      {item.step}
                    </span>
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 text-cyan-500 mb-6 ring-1 ring-cyan-500/30 group-hover:scale-110 transition-transform duration-300">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className={`text-base font-bold leading-snug ${isDark ? "text-white" : "text-slate-950"}`}>
                      {item.title}
                    </h3>
                    <p className={`mt-3 text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600 font-medium"}`}>
                      {item.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          INTERACTIVE CONSOLE — Scan Progress + Tab Transitions
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
            ref={consoleRef}
            className={`rounded-3xl border p-2 sm:p-3 shadow-2xl transition-all ${
              isDark
                ? "border-white/15 bg-gradient-to-b from-white/10 to-white/[0.02]"
                : "border-slate-300/80 bg-gradient-to-b from-slate-200/90 to-slate-100/80 shadow-[0_20px_50px_rgba(15,23,42,0.06)]"
            }`}
          >
            <div className={`rounded-2xl border p-6 sm:p-8 ${isDark ? "border-white/10 bg-[#0B0F17]" : "border-slate-200 bg-white"}`}>
              {/* Chrome + Tabs */}
              <div className={`flex flex-wrap items-center justify-between gap-4 border-b pb-5 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-rose-500" />
                    <span className="h-3 w-3 rounded-full bg-amber-500" />
                    <span className="h-3 w-3 rounded-full bg-emerald-500" />
                  </div>
                  <span className={`font-mono text-xs font-bold ${isDark ? "text-slate-400" : "text-slate-600"}`}>
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

              {/* Scan Progress Bar */}
              <div className="mt-5">
                <div className={`h-1 rounded-full overflow-hidden mb-3 ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`}>
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600"
                    style={{
                      width: consoleVisible ? "100%" : "0%",
                      transition: "width 1.4s cubic-bezier(0.16,1,0.3,1)",
                    }}
                  />
                </div>
                <div className="flex items-center gap-2 text-xs font-mono mb-5 h-4">
                  {scanComplete ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <span className={`font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>Scan complete · 2,847 controls verified across 5 providers</span>
                    </>
                  ) : consoleVisible ? (
                    <>
                      <span className="h-3 w-3 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
                      <span className={isDark ? "text-cyan-400" : "text-cyan-700 font-semibold"}>Spectra scanning infrastructure...</span>
                    </>
                  ) : null}
                </div>
              </div>

              {/* Tab Content — animated on tab switch */}
              <div
                key={activeTab}
                style={{
                  opacity: scanComplete ? 1 : 0,
                  transition: "opacity 0.3s ease",
                  animation: scanComplete ? "tabIn 0.35s ease" : "none",
                }}
              >
                {activeTab === "hitl" && (
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    <div className="lg:col-span-7 space-y-4">
                      <div className="inline-flex items-center gap-2 rounded-full bg-rose-500/15 border border-rose-500/30 px-3 py-1 text-xs font-bold text-rose-500">
                        <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                        CRITICAL FINDING · S3 Public Access Exposure
                      </div>
                      <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-950"}`}>
                        AI-Generated Terraform Remediation Playbook
                      </h3>
                      <p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700 font-medium"}`}>
                        Spectra discovered open public ACL exposing confidential financial audits on{" "}
                        <code className="font-mono text-cyan-500 font-bold">s3:::corp-confidential-finance-2026</code>.
                      </p>
                      <TypewriterCode
                        code={TERRAFORM_CODE}
                        speed={16}
                        active={scanComplete && activeTab === "hitl"}
                        className="rounded-2xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-cyan-300 leading-relaxed overflow-x-auto shadow-inner"
                      />
                    </div>

                    <div className={`lg:col-span-5 rounded-2xl border p-6 flex flex-col justify-between ${isDark ? "border-primary/30 bg-primary/5" : "border-primary/30 bg-cyan-50/60"}`}>
                      <div>
                        <div className="flex items-center justify-between border-b border-primary/20 pb-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-primary">
                            Human-In-The-Loop Gate
                          </span>
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${isDark ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-amber-100 text-amber-800 border-amber-300"}`}>
                            Pending Approval
                          </span>
                        </div>
                        <div className="mt-4 space-y-2.5 text-xs">
                          <div className="flex justify-between">
                            <span className={isDark ? "text-slate-400" : "text-slate-600 font-medium"}>Target Resource:</span>
                            <span className={`font-mono font-bold ${isDark ? "text-slate-200" : "text-slate-900"}`}>s3:::corp-confidential</span>
                          </div>
                          <div className="flex justify-between">
                            <span className={isDark ? "text-slate-400" : "text-slate-600 font-medium"}>Blast Radius:</span>
                            <span className={`font-bold ${isDark ? "text-cyan-400" : "text-cyan-700"}`}>0 Impact (Isolated)</span>
                          </div>
                          <div className="flex justify-between">
                            <span className={isDark ? "text-slate-400" : "text-slate-600 font-medium"}>Rollback Safeguard:</span>
                            <span className={`font-bold ${isDark ? "text-cyan-400" : "text-cyan-700"}`}>Automated Rollback Ready</span>
                          </div>
                          <div className="flex justify-between">
                            <span className={isDark ? "text-slate-400" : "text-slate-600 font-medium"}>SLA Deadline:</span>
                            <span className={`font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>2h 14m remaining</span>
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
                        style={{
                          opacity: 0,
                          animation: scanComplete ? `fadeUp 0.4s ease ${i * 50}ms forwards` : "none",
                        }}
                      >
                        <div className={`text-xs font-bold leading-tight ${isDark ? "text-white" : "text-slate-950"}`}>{fw.name}</div>
                        <div className="mt-3 flex items-baseline justify-between">
                          <span className="text-2xl font-black text-primary">{fw.score}%</span>
                          <span className={`text-[10px] font-bold ${isDark ? "text-cyan-400" : "text-cyan-700"}`}>Compliant</span>
                        </div>
                        <div className={`mt-2 text-[10px] ${isDark ? "text-slate-400" : "text-slate-600 font-medium"}`}>
                          {fw.passed} of {fw.total} controls verified
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === "attack-paths" && (
                  <div className="space-y-4">
                    <div className={`rounded-2xl border p-5 ${isDark ? "border-rose-500/30 bg-rose-950/20" : "border-rose-200 bg-rose-50/80"}`}>
                      <div className={`flex items-center gap-2 font-bold text-xs mb-4 ${isDark ? "text-rose-400" : "text-rose-700"}`}>
                        <Zap className="h-4 w-4" />
                        <span>Toxic Combination Identified: Internet Ingress ➔ IAM Role ➔ S3 Bucket</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                        {[
                          { label: "0.0.0.0/0 (Internet)", color: isDark ? "bg-rose-500/20 border-rose-500/40 text-rose-300" : "bg-rose-100 border-rose-300 text-rose-800 font-bold" },
                          { label: "CI Runner (RDP 3389)", color: isDark ? "bg-amber-500/20 border-amber-500/40 text-amber-300" : "bg-amber-100 border-amber-300 text-amber-800 font-bold" },
                          { label: "ci-deployer IAM Role", color: isDark ? "bg-amber-500/20 border-amber-500/40 text-amber-300" : "bg-amber-100 border-amber-300 text-amber-800 font-bold" },
                          { label: "s3:::prod-billing-exports", color: isDark ? "bg-rose-500/20 border-rose-500/40 text-rose-300" : "bg-rose-100 border-rose-300 text-rose-800 font-bold" },
                        ].map((node, ni) => (
                          <span key={ni} className="contents">
                            {ni > 0 && <span className={`font-bold transition-all duration-300 ${isDark ? "text-slate-400" : "text-slate-600"} ${attackPhase === ni ? "text-cyan-500 scale-125" : ""}`}>➔</span>}
                            <span
                              className={`rounded-full border px-3 py-1 transition-all duration-300 ${node.color} ${
                                attackPhase === ni ? "ring-2 ring-cyan-400/60 scale-105 shadow-[0_0_12px_rgba(6,182,212,0.3)]" : ""
                              }`}
                            >
                              {node.label}
                            </span>
                          </span>
                        ))}
                      </div>
                      <p className={`mt-4 text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700 font-medium"}`}>
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
          CORE CAPABILITIES — Staggered Fade-Up Grid
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
                  : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100 shadow-xs"
              }`}
            >
              <span>Consult AI Advisor</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div ref={capsRef} className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((cap, i) => {
              const Icon = cap.icon;
              return (
                <div
                  key={i}
                  className={`group relative overflow-hidden rounded-2xl border p-7 transition-all duration-300 hover:-translate-y-1 ${
                    isDark
                      ? "border-white/[0.08] bg-white/[0.02] hover:border-primary/50 hover:shadow-[0_12px_30px_-10px_rgba(6,182,212,0.25)]"
                      : "border-slate-200 bg-white hover:border-primary hover:shadow-[0_12px_30px_-10px_rgba(6,182,212,0.2)] shadow-xs"
                  }`}
                  style={{
                    opacity: 0,
                    animation: capsVisible ? `fadeUp 0.5s ease ${i * 80}ms forwards` : "none",
                  }}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 text-cyan-500 mb-6 ring-1 ring-cyan-500/30 group-hover:scale-110 transition-transform duration-300">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-950"}`}>{cap.title}</h3>
                  <p className={`mt-3 text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600 font-medium"}`}>{cap.desc}</p>
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
          COMPLIANCE GALAXY — Arc + Staggered Pills
      ════════════════════════════════════════════════════════════════════ */}
      <section id="compliance" className={`py-20 px-6 lg:px-8 border-b text-center ${isDark ? "border-white/[0.06] bg-white/[0.01]" : "border-slate-200 bg-slate-50/70"}`}>
        <div ref={complianceRef} className="mx-auto max-w-7xl">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Compliance Matrix</span>
          <h2 className={`mt-3 text-3xl font-extrabold tracking-tight ${isDark ? "text-white" : "text-slate-950"}`}>
            Continuous Auditing Across 28+ Global Standards
          </h2>

          {/* Animated compliance arc */}
          <div className="mt-10">
            <ComplianceArc score={complianceScore} visible={complianceVisible} isDark={isDark} />
          </div>

          {/* Framework pills with stagger */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-5xl mx-auto">
            {compliancePills.map((fw, i) => (
              <span
                key={fw}
                className={`rounded-full border px-4 py-2 text-xs font-bold transition-all hover:scale-105 ${
                  isDark
                    ? "border-white/10 bg-white/5 text-slate-300 hover:border-primary hover:text-primary"
                    : "border-slate-300/80 bg-white text-slate-800 hover:border-primary hover:text-primary hover:bg-cyan-50/50 shadow-2xs"
                }`}
                style={{
                  opacity: 0,
                  animation: complianceVisible ? `scaleIn 0.4s ease ${i * 30}ms forwards` : "none",
                }}
              >
                {fw}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          MCP / DEVELOPER API — Typewriter JSON + Staggered Tool List
      ════════════════════════════════════════════════════════════════════ */}
      <section id="mcp" className={`py-24 px-6 lg:px-8 border-b ${isDark ? "border-white/[0.06]" : "border-slate-200 bg-white"}`}>
        <div ref={mcpRef} className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 items-center">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Open Protocol API</span>
              <h2 className={`mt-3 text-3xl font-extrabold tracking-tight ${isDark ? "text-white" : "text-slate-950"}`}>
                Model Context Protocol (MCP) Gateway
              </h2>
              <p className={`mt-4 text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600 font-medium"}`}>
                Expose 10 live security tools to private enterprise AI agents, IDE plugins (Cursor, VS Code), and custom SecOps pipelines. Compatible with JSON-RPC 2.0 and JWT token authorization.
              </p>
              <div className="mt-6 space-y-2.5 text-xs font-mono">
                {mcpTools.map((tool, i) => (
                  <div
                    key={tool}
                    className="flex items-start gap-2.5"
                    style={{
                      opacity: 0,
                      animation: mcpVisible ? `fadeUp 0.4s ease ${i * 80}ms forwards` : "none",
                    }}
                  >
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
              <TypewriterCode
                code={MCP_JSON_CODE}
                speed={18}
                active={mcpVisible}
                className="font-mono text-xs text-cyan-300 leading-relaxed overflow-x-auto"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          FINAL CTA — Breathing Glow
      ════════════════════════════════════════════════════════════════════ */}
      <section className={`py-24 px-6 lg:px-8 text-center relative overflow-hidden ${isDark ? "bg-gradient-to-b from-transparent to-cyan-500/10" : "bg-gradient-to-b from-slate-50 via-cyan-50/30 to-blue-50/40"}`}>
        {/* Breathing radial glow */}
        {isDark ? (
          <div
            className="absolute inset-0 -z-10 pointer-events-none"
            style={{
              background: "radial-gradient(circle at 50% 40%, rgba(6,182,212,0.1) 0%, transparent 55%)",
              animation: "breathe 5s ease-in-out infinite",
            }}
          />
        ) : (
          <div
            className="absolute inset-0 -z-10 pointer-events-none"
            style={{
              background: "radial-gradient(circle at 50% 40%, rgba(6,182,212,0.08) 0%, transparent 60%)",
              animation: "breathe 5s ease-in-out infinite",
            }}
          />
        )}

        <div className="mx-auto max-w-4xl flex flex-col items-center">
          <div style={{ animation: "breathe 6s ease-in-out infinite" }}>
            <ShieldMark size={56} />
          </div>
          <h2 className={`mt-6 text-3xl sm:text-5xl font-black tracking-tight ${isDark ? "text-white" : "text-slate-950"}`}>
            Ready to Automate Your Multi-Cloud Security?
          </h2>
          <p className={`mt-4 text-base max-w-2xl leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700 font-medium"}`}>
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
                  : "border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50"
              }`}
            >
              <span>Sign In to Console</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════════════════════════════════ */}
      <footer className={`border-t py-12 px-6 sm:px-10 lg:px-14 xl:px-16 ${isDark ? "border-border bg-black/60" : "border-border bg-white"}`}>
        <div className="mx-auto flex w-full max-w-[1720px] flex-col sm:flex-row items-center justify-between gap-6 text-xs">
          <div className="flex items-center gap-3">
            <ShieldMark size={28} />
            <div className="flex flex-col">
              <span className={`font-black text-sm ${isDark ? "text-white" : "text-slate-900"}`}>DIGITAL CISO</span>
              <span className={`text-[10px] uppercase tracking-widest ${isDark ? "text-slate-500 font-bold" : "text-slate-500 font-semibold"}`}>© 2026 Digital CISO. All rights reserved.</span>
            </div>
          </div>

          <div className={`flex items-center gap-6 font-bold ${isDark ? "text-slate-400" : "text-slate-600"}`}>
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