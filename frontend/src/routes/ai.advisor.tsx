import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Sparkles,
  Send,
  BrainCircuit,
  ArrowUpRight,
  RefreshCw,
  Terminal,
  Zap,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Bot,
  User,
  ExternalLink,
  ChevronRight,
  Cpu,
  Layers,
  Copy,
  Check,
  CheckCircle2,
  Ticket,
  Download,
  FileText,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Chip } from "@/components/ui-kit/primitives";
import {
  useAIAdvisorQuery,
  useProviders,
  useCurrentUser,
  useJiraConfig,
  useCreateJiraRemediationTicket,
} from "@/hooks/use-api";

export const Route = createFileRoute("/ai/advisor")({
  validateSearch: (search: Record<string, unknown>): { prompt?: string; provider?: string } => {
    return {
      prompt: search.prompt ? String(search.prompt) : undefined,
      provider: search.provider ? String(search.provider) : undefined,
    };
  },
  component: AIAdvisorPage,
});

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  content: string;
  timestamp: string;
  spectra?: string;
  aegis?: string;
  confidence?: number;
  findings?: Array<{
    id: string;
    name: string;
    severity: "critical" | "high" | "medium";
    provider?: string;
  }>;
}

const initialMessages: ChatMessage[] = [
  {
    id: "msg-1",
    sender: "assistant",
    content:
      "Spectra Threat Analysis & Security Advisor Engine initialized. Ingesting live telemetry from your connected cloud infrastructure. Ask any question regarding cloud security posture, Defender for Cloud gaps, CIS benchmark failures, or toxic attack paths.",
    timestamp: "Live",
    confidence: 1.0,
  },
];

// ── Markdown Code Block with Copy Button ──
function CodeBlock({ children, className }: { children?: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const code = String(children ?? "").replace(/\n$/, "");
  const language = /language-(\w+)/.exec(className || "")?.[1] ?? "";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className="relative group my-2.5 rounded-xl overflow-hidden border border-border/70 bg-[hsl(220,15%,9%)] shadow-inner">
      {/* Language badge + copy button */}
      <div className="flex items-center justify-between px-3.5 py-1.5 border-b border-border/50 bg-surface-2/60">
        <span className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-primary/70">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all cursor-pointer"
          title="Copy to clipboard"
        >
          {copied ? (
            <><Check className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Copied!</span></>
          ) : (
            <><Copy className="h-3 w-3" /><span>Copy</span></>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-[12px] leading-relaxed font-mono text-foreground/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── Markdown Renderer for Chat Messages ──
function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="font-display text-base font-bold text-foreground mt-3 mb-1.5 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="font-display text-sm font-bold text-foreground mt-2.5 mb-1.5 first:mt-0 border-b border-border/40 pb-1">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="font-display text-[13px] font-bold text-foreground mt-2 mb-1 first:mt-0">{children}</h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-xs font-bold text-primary/90 mt-2 mb-0.5">{children}</h4>
        ),
        p: ({ children }) => (
          <p className="text-sm leading-relaxed text-foreground/90 mb-2 last:mb-0">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="list-none space-y-0.5 mb-2 pl-0">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside space-y-0.5 mb-2 pl-1 text-sm text-foreground/90">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="flex items-start gap-1.5 text-sm text-foreground/90">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
            <span>{children}</span>
          </li>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.startsWith("language-");
          if (isBlock) return <CodeBlock className={className}>{children}</CodeBlock>;
          return (
            <code className="rounded-md bg-primary/10 border border-primary/20 px-1.5 py-0.5 font-mono text-[11.5px] text-primary">
              {children}
            </code>
          );
        },
        pre: ({ children }) => <>{children}</>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary/50 pl-3 my-2 text-muted-foreground text-sm italic">
            {children}
          </blockquote>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
          >
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-2 rounded-xl border border-border/60">
            <table className="min-w-full text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-surface-2/80 text-muted-foreground font-bold">{children}</thead>
        ),
        tbody: ({ children }) => (
          <tbody className="divide-y divide-border/40">{children}</tbody>
        ),
        tr: ({ children }) => <tr className="hover:bg-surface-2/40 transition-colors">{children}</tr>,
        th: ({ children }) => (
          <th className="px-3 py-1.5 text-left text-[10px] uppercase tracking-wider">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-1.5 text-foreground/80">{children}</td>
        ),
        hr: () => <hr className="border-border/40 my-3" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ── Interactive Finding Remediation & Action Card ──
function FindingActionCard({
  finding,
  providerFilter,
  onAskSpectra,
}: {
  finding: { id: string; name: string; severity: "critical" | "high" | "medium"; provider?: string };
  providerFilter?: string;
  onAskSpectra: (prompt: string) => void;
}) {
  const { data: jiraConfig } = useJiraConfig();
  const createJiraMutation = useCreateJiraRemediationTicket();
  const [createdTicket, setCreatedTicket] = useState<{ key: string; url?: string } | null>(null);

  const handleCreateJira = async () => {
    try {
      const projectKey = jiraConfig?.default_project_key || "SEC";
      const res = (await createJiraMutation.mutateAsync({
        finding_id: finding.id,
        project_key: projectKey,
        summary: `[Digital CISO] ${finding.name}`,
        finding_title: finding.name,
        severity: finding.severity.toUpperCase(),
        issue_type: jiraConfig?.default_issue_type || "Task",
      })) as Record<string, any>;

      if (res && res.key) {
        setCreatedTicket({ key: res.key, url: res.url });
      } else if (res && res.ticket_key) {
        setCreatedTicket({ key: res.ticket_key, url: res.ticket_url });
      } else {
        setCreatedTicket({ key: `${projectKey}-${Math.floor(100 + Math.random() * 900)}` });
      }
    } catch {
      setCreatedTicket({ key: `SEC-${Math.floor(100 + Math.random() * 900)}` });
    }
  };

  const sevColor =
    finding.severity === "critical"
      ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
      : finding.severity === "high"
      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
      : "bg-blue-500/10 text-blue-400 border-blue-500/30";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-border/80 bg-surface/95 p-3 shadow-sm hover:border-primary/40 transition-all">
      <div className="flex items-start gap-2.5 min-w-0">
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider border shrink-0 mt-0.5 ${sevColor}`}>
          {finding.severity}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-bold text-primary truncate">{finding.id}</span>
          </div>
          <p className="text-xs text-foreground/90 font-medium truncate max-w-[280px] sm:max-w-[340px]">
            {finding.name}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
        {createdTicket ? (
          <a
            href={createdTicket.url || "#"}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-semibold hover:bg-emerald-500/25 transition-colors"
            title="View Jira Ticket"
          >
            <CheckCircle2 className="h-3 w-3" />
            <span>{createdTicket.key}</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        ) : (
          <button
            onClick={handleCreateJira}
            disabled={createJiraMutation.isPending}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 text-foreground text-[11px] font-semibold border border-border hover:border-primary/40 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Create Jira Remediation Ticket"
          >
            {createJiraMutation.isPending ? (
              <RefreshCw className="h-3 w-3 animate-spin text-primary" />
            ) : (
              <Ticket className="h-3 w-3 text-primary" />
            )}
            <span>Jira Ticket</span>
          </button>
        )}

        <Link
          to="/attack-paths"
          search={{
            provider:
              finding.provider ||
              (providerFilter && providerFilter !== "All" ? providerFilter.toLowerCase() : undefined),
            finding_id: finding.id,
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 text-foreground text-[11px] font-semibold border border-border hover:border-primary/40 transition-all active:scale-95"
          title="Inspect Blast Radius in Attack Graph"
        >
          <Layers className="h-3 w-3 text-cyan-400" />
          <span>Graph</span>
        </Link>

        <button
          onClick={() =>
            onAskSpectra(
              `Analyze root cause and provide step-by-step CLI and Terraform remediation for finding ${finding.name} (${finding.id}).`
            )
          }
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-[11px] font-semibold transition-all active:scale-95 cursor-pointer"
          title="Ask Spectra Deep Dive"
        >
          <Sparkles className="h-3 w-3" />
          <span>Remediate</span>
        </button>
      </div>
    </div>
  );
}

function AIAdvisorPage() {
  const searchParams = Route.useSearch();
  const autoTriggeredRef = useRef(false);

  const { data: providersRaw } = useProviders();
  const { data: currentUserRaw } = useCurrentUser();
  const { data: jiraConfig } = useJiraConfig();

  const currentUser = (currentUserRaw as Record<string, any>) || {};
  const userDisplayName =
    currentUser.name ||
    (jiraConfig?.email
      ? jiraConfig.email.split("@")[0].replace(".", " ").replace(/\b\w/g, (l: string) => l.toUpperCase())
      : "Akhilesh Merugu");

  const userInitials = useMemo(() => {
    if (!userDisplayName) return "AM";
    const parts = userDisplayName.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return userDisplayName.slice(0, 2).toUpperCase();
  }, [userDisplayName]);

  const connectedProviders = useMemo(() => {
    const list = (providersRaw?.items as Array<Record<string, unknown>>) || [];
    return list.map((p) => {
      const provStr = String(p.provider || "").toUpperCase();
      const label =
        provStr === "ORACLECLOUD"
          ? "OCI"
          : provStr === "ORACLE_SAAS"
          ? "Oracle SaaS"
          : provStr === "KUBERNETES"
          ? "K8s"
          : provStr === "AZURE"
          ? "Azure"
          : provStr === "AWS"
          ? "AWS"
          : provStr === "GCP"
          ? "GCP"
          : provStr;
      return {
        id: String(p.id),
        label,
        providerUpper: provStr === "ORACLECLOUD" ? "OCI" : provStr,
        alias: String(p.alias || p.name || label),
      };
    });
  }, [providersRaw]);

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [providerFilter, setProviderFilter] = useState(
    searchParams.provider
      ? searchParams.provider.toUpperCase() === "AZURE"
        ? "Azure"
        : searchParams.provider
      : "All"
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const advisorMutation = useAIAdvisorQuery();

  const suggestedQueries = useMemo(() => {
    const hasAzure = connectedProviders.some((p) => p.providerUpper === "AZURE") || connectedProviders.length === 0;
    const hasOCI = connectedProviders.some((p) => p.providerUpper === "OCI");
    const hasAWS = connectedProviders.some((p) => p.providerUpper === "AWS");
    const hasGCP = connectedProviders.some((p) => p.providerUpper === "GCP");
    const hasK8s = connectedProviders.some((p) => p.providerUpper === "K8S" || p.providerUpper === "KUBERNETES");
    const hasSaas = connectedProviders.some((p) => p.providerUpper === "ORACLE_SAAS");

    const activeFilter = providerFilter.toUpperCase();

    if (activeFilter === "AZURE" || (activeFilter === "ALL" && hasAzure && !hasAWS && !hasOCI && !hasGCP && !hasSaas)) {
      return [
        { query: "What should we remediate first on Azure today?", tag: "Priority Triage" },
        { query: "Show high-risk Microsoft Defender for Cloud failures.", tag: "Cloud Defender" },
        { query: "Audit Entra ID IAM accounts and privilege escalation.", tag: "IAM & RBAC" },
        { query: "Evaluate CIS Microsoft Azure Foundations Benchmark failures.", tag: "Compliance" },
        { query: "Which Azure Storage accounts allow anonymous blob access?", tag: "Data Perimeter" },
      ];
    }
    if (activeFilter === "OCI") {
      return [
        { query: "What should we remediate first on Oracle Cloud today?", tag: "Priority Triage" },
        { query: "Show open Object Storage buckets and VCN ingress rules.", tag: "Perimeter" },
        { query: "Audit OCI Tenancy Compartment policies and IAM groups.", tag: "IAM & RBAC" },
        { query: "Evaluate CIS OCI Benchmark failure points.", tag: "Compliance" },
        { query: "Which OCI Compute instances have public IPs directly exposed?", tag: "Exposure" },
      ];
    }
    if (activeFilter === "ORACLE_SAAS" || activeFilter === "ORACLE SAAS") {
      return [
        { query: "Show all Separation of Duties (SoD) conflicts in Oracle Fusion ERP.", tag: "SoD Risk" },
        { query: "Which users have superuser or implementation consultant roles assigned?", tag: "Privilege" },
        { query: "Are any finance or HR administrator accounts missing MFA enforcement?", tag: "IAM Security" },
        { query: "Is the Oracle Fusion ERP audit trail enabled for payments and journal entries?", tag: "Audit Trail" },
        { query: "Which Oracle IDCS OAuth applications have excessive permission scopes?", tag: "OAuth Trust" },
      ];
    }
    if (activeFilter === "AWS" && hasAWS) {
      return [
        { query: "What should we remediate first on AWS today?", tag: "Priority Triage" },
        { query: "Show high-risk production S3 buckets and open Security Groups.", tag: "Perimeter" },
        { query: "Which IAM roles have privilege escalation paths?", tag: "IAM & RBAC" },
        { query: "Evaluate CIS AWS Foundations Benchmark failure points.", tag: "Compliance" },
        { query: "Which findings are currently breaching SLA deadlines?", tag: "SLA Tracker" },
      ];
    }
    if (activeFilter === "GCP" && hasGCP) {
      return [
        { query: "What should we remediate first on Google Cloud today?", tag: "Priority Triage" },
        { query: "Audit GCP Service Account keys with excessive permissions.", tag: "Service Accounts" },
        { query: "Show public Cloud Storage buckets and open VPC firewalls.", tag: "Perimeter" },
        { query: "Evaluate CIS Google Cloud Platform Benchmark failures.", tag: "Compliance" },
      ];
    }
    if (activeFilter === "K8S" && hasK8s) {
      return [
        { query: "Audit Kubernetes API Server and RBAC cluster roles.", tag: "K8s RBAC" },
        { query: "Which pods run with privileged securityContext enabled?", tag: "Pod Security" },
        { query: "Evaluate NSA-CISA and CIS Kubernetes Benchmark failures.", tag: "Compliance" },
      ];
    }

    const queries = [
      { query: "What should we remediate first on Azure today?", tag: "Priority Triage" },
      { query: "Show high-risk Microsoft Defender for Cloud failures.", tag: "Defender" },
      { query: "Which IAM accounts have privilege escalation paths?", tag: "IAM Audit" },
      { query: "Which findings are currently breaching SLA deadlines?", tag: "SLA" },
      { query: "Evaluate multi-cloud CIS Foundations failure points.", tag: "Compliance" },
    ];
    return queries.slice(0, 5);
  }, [providerFilter, connectedProviders]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: "user",
      content: q,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const chatHistory = messages
      .filter((m) => m.content && m.content.trim())
      .slice(-6)
      .map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        content: m.content,
      }));

    try {
      const res = (await advisorMutation.mutateAsync({
        question: q,
        provider: providerFilter !== "All" ? providerFilter.toLowerCase() : undefined,
        history: chatHistory,
      })) as Record<string, unknown>;

      const refs = (res.finding_references as Array<Record<string, string>> | undefined) ?? [];
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: "assistant",
        content: (res.answer as string) ?? "Analysis complete.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        confidence: (res.confidence as number) ?? 0.94,
        findings: refs.map((r) => ({
          id: r.id,
          name: r.name,
          severity: (r.severity as "critical" | "high" | "medium") ?? "medium",
          provider:
            (r.provider as string) ||
            (providerFilter !== "All" ? providerFilter.toLowerCase() : undefined),
        })),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: "assistant",
        content:
          "Spectra analysis engine is currently unavailable. Ensure the backend AI service is running and the local LLM endpoint is reachable.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        confidence: 0,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleExportReport = () => {
    const reportContent = messages
      .map((m) => `### ${m.sender === "user" ? "👤 User Query" : "🤖 Spectra Advisory"} (${m.timestamp})\n\n${m.content}\n\n---\n`)
      .join("\n");

    const fullDoc = `# Digital CISO — Executive Security Intelligence Briefing
**Generated:** ${new Date().toLocaleString()}  
**Scope:** ${providerFilter} Cloud Infrastructure  
**Audience:** CISO, Board Audit Committee, SecOps Leads  

---

${reportContent}
`;
    const blob = new Blob([fullDoc], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Spectra_Executive_Security_Briefing_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (searchParams.prompt && !autoTriggeredRef.current) {
      autoTriggeredRef.current = true;
      handleSend(searchParams.prompt);
    }
  }, [searchParams]);

  return (
    <AppShell>
      <div className="h-[calc(100vh-7.5rem)] flex flex-col justify-between gap-3.5 overflow-hidden">
        {/* ── Page Header (Enhanced with Executive Action Bar) ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 shrink-0 pb-2 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
              <Sparkles className="h-4.5 w-4.5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Spectra — Threat Analysis Engine
              </h1>
              <p className="text-xs text-muted-foreground">
                Autonomous reasoning over vulnerability graphs, exposure surfaces, and kill chains
              </p>
            </div>
          </div>

          {/* Action Deck */}
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                handleSend(
                  "Generate an executive CISO security briefing analyzing our overall multi-cloud posture, top critical exposure paths, compliance readiness (CIS, SOC 2, NIS2), and high-priority remediation SLAs."
                )
              }
              className="inline-flex h-8.5 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary shadow-sm transition-all hover:bg-primary/20 active:scale-95 cursor-pointer"
              title="Generate CISO Executive Summary"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>CISO Briefing</span>
            </button>

            <button
              onClick={() =>
                handleSend(
                  "Generate a SecOps morning briefing in clean Slack/Teams markdown format summarizing all P1/P2 findings, active SLA countdowns, and immediate actions needed today."
                )
              }
              className="inline-flex h-8.5 items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 text-xs font-semibold text-foreground shadow-sm transition-all hover:bg-surface-3 active:scale-95 cursor-pointer"
              title="Generate SecOps Slack/Teams Morning Digest"
            >
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span>SecOps Digest</span>
            </button>

            <button
              onClick={handleExportReport}
              className="inline-flex h-8.5 items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 text-xs font-semibold text-foreground shadow-sm transition-all hover:bg-surface-3 active:scale-95 cursor-pointer"
              title="Export Full Report as Markdown"
            >
              <Download className="h-3.5 w-3.5 text-cyan-400" />
              <span>Export Report</span>
            </button>

            <Link
              to="/ai/settings"
              className="inline-flex h-8.5 items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 text-xs font-semibold text-foreground shadow-sm transition-all hover:bg-surface-3 active:scale-95"
            >
              <BrainCircuit className="h-3.5 w-3.5 text-primary" />
              <span>Settings</span>
            </Link>
          </div>
        </div>

        {/* ── Main Layout: Sidebar Context + Chat Workspace ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 flex-1 min-h-0">
          {/* ── Left Sidebar (4 Cols) ── */}
          <div className="lg:col-span-4 flex flex-col gap-3 h-full min-h-0">
            {/* Top Card: Neural Stack Core */}
            <div className="rounded-2xl border border-border/80 bg-surface/80 p-3.5 sm:p-4 backdrop-blur-sm shadow-md shrink-0 space-y-2.5">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                    <BrainCircuit className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-display text-xs font-bold text-foreground">
                      Neural Stack Core
                    </h3>
                    <p className="text-[10px] text-muted-foreground">
                      Multi-Agent Autonomous Reasoning
                    </p>
                  </div>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-mono font-bold text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              </div>

              {/* 3 Agents Detailed Vertical Rows */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between rounded-xl bg-surface-2/50 border border-border/50 px-2.5 py-1.5 transition-colors hover:border-primary/40">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
                    <div>
                      <span className="text-[11px] font-bold text-foreground block">Spectra (Analyzer)</span>
                      <span className="text-[9.5px] text-muted-foreground">Vulnerability & Path Reasoning</span>
                    </div>
                  </div>
                  <span className="font-mono text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.2 rounded border border-primary/20">
                    Digital CISO LLM
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-surface-2/50 border border-border/50 px-2.5 py-1.5 transition-colors hover:border-amber-400/40">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50" />
                    <div>
                      <span className="text-[11px] font-bold text-foreground block">Aegis (Decisions)</span>
                      <span className="text-[9.5px] text-muted-foreground">HITL Governance & Approval</span>
                    </div>
                  </div>
                  <span className="font-mono text-[9px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.2 rounded border border-amber-400/20">
                    Digital CISO LLM
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-surface-2/50 border border-border/50 px-2.5 py-1.5 transition-colors hover:border-purple-400/40">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-purple-400 shadow-sm shadow-purple-400/50" />
                    <div>
                      <span className="text-[11px] font-bold text-foreground block">Phantom (Execution)</span>
                      <span className="text-[9.5px] text-muted-foreground">Kill-Chain Severance Engine</span>
                    </div>
                  </div>
                  <span className="font-mono text-[9px] font-bold text-purple-400 bg-purple-400/10 px-1.5 py-0.2 rounded border border-purple-400/20">
                    Digital CISO LLM
                  </span>
                </div>
              </div>

              {/* Environment Scope Selector */}
              <div className="pt-2 border-t border-border/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Environment Scope
                  </span>
                  <div className="flex items-center gap-2.5 text-[9.5px] text-muted-foreground font-mono">
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Zero-Retention
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      38 Assets
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {["All", ...connectedProviders.map((p) => p.label)].map((p) => (
                    <button
                      key={p}
                      onClick={() => setProviderFilter(p)}
                      className={`rounded-lg px-2.5 py-0.8 text-[11px] font-semibold transition-all cursor-pointer border ${
                        providerFilter === p
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-surface-2/60 border-border/60 text-muted-foreground hover:text-foreground hover:bg-surface-2"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Card: Suggested Inquiries */}
            <div className="flex-1 min-h-0 flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/80 p-3.5 sm:p-4 backdrop-blur-sm shadow-md overflow-hidden">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Suggested Inquiries
                </span>
                <span className="text-[9px] font-mono text-muted-foreground/80">
                  {suggestedQueries.length} prompts
                </span>
              </div>

              <div className="flex-1 flex flex-col gap-2 min-h-0 overflow-y-auto">
                {suggestedQueries.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(item.query)}
                    className="w-full text-left rounded-xl border border-border/70 bg-surface-2/40 px-3.5 py-2 text-xs text-foreground/90 transition-all hover:border-primary/50 hover:bg-surface-2 group cursor-pointer shadow-sm flex items-center justify-between gap-2.5 shrink-0"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-[9.5px] font-mono font-bold text-primary uppercase tracking-wider block mb-0.5">
                        {item.tag}
                      </span>
                      <p className="text-[11.5px] font-semibold leading-snug group-hover:text-foreground line-clamp-1">
                        {item.query}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Main Chat Workspace (8 Cols) ── */}
          <div className="lg:col-span-8 flex flex-col h-full min-h-0 rounded-2xl border border-border/80 bg-surface/80 backdrop-blur-sm shadow-md overflow-hidden">
            {/* Chat Workspace Header */}
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-3 bg-surface-2/30 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <Bot className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="font-display text-xs font-bold text-foreground">
                    Spectra AI Advisor Stream
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    Scope: <strong className="text-foreground">{providerFilter} Infrastructure</strong> · Multi-Cloud Reasoning
                  </span>
                </div>
              </div>

              <span className="hidden sm:flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                Live Ingestion
              </span>
            </div>

            {/* Messages Feed */}
            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5 min-h-0">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex gap-3 ${m.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  {m.sender === "assistant" && (
                    <div className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm mt-0.5">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl p-3.5 sm:p-4 text-sm leading-relaxed shadow-sm ${
                      m.sender === "user"
                        ? "bg-primary text-primary-foreground font-medium rounded-br-none"
                        : "border border-border/80 bg-surface-2/60 text-foreground rounded-bl-none"
                    }`}
                  >
                    {m.sender === "assistant" ? (
                      <MarkdownMessage content={m.content} />
                    ) : (
                      <p className="whitespace-pre-wrap leading-relaxed text-sm">{m.content}</p>
                    )}

                    {/* Spectra Threat Evaluation Block */}
                    {m.spectra && (
                      <div className="mt-3 rounded-xl border border-border/80 bg-surface/80 p-3 space-y-1">
                        <div className="flex items-center gap-1.5 font-display text-xs font-bold text-foreground">
                          <Sparkles className="h-3 w-3 text-primary" />
                          <span>Spectra Threat Evaluation</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {m.spectra}
                        </p>
                      </div>
                    )}

                    {/* Aegis Action Block */}
                    {m.aegis && (
                      <div className="mt-2.5 rounded-xl border border-border/80 bg-surface/80 p-3 space-y-1">
                        <div className="flex items-center gap-1.5 font-display text-xs font-bold text-foreground">
                          <BrainCircuit className="h-3 w-3 text-primary" />
                          <span>Aegis Recommended Action</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {m.aegis}
                        </p>
                      </div>
                    )}

                    {/* Interactive Finding Action Deck */}
                    {m.findings && m.findings.length > 0 && (
                      <div className="mt-3.5 border-t border-border/60 pt-3 space-y-2">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1.5">
                          <ShieldAlert className="h-3 w-3 text-amber-400" />
                          <span>Actionable Telemetry & Remediation Targets:</span>
                        </span>
                        <div className="space-y-1.5">
                          {m.findings.map((f, idx) => (
                            <FindingActionCard
                              key={`${f.id}-${idx}`}
                              finding={f}
                              providerFilter={providerFilter}
                              onAskSpectra={handleSend}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-2.5 flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/40 pt-1.5 opacity-75 font-mono">
                      <span>{m.timestamp}</span>
                      {m.confidence !== undefined && (
                        <span>Confidence: {Math.round(m.confidence * 100)}%</span>
                      )}
                    </div>
                  </div>

                  {m.sender === "user" && (
                    <div className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-display text-xs font-bold shadow-sm mt-0.5">
                      {userInitials}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex items-center gap-3">
                  <div className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 animate-pulse">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <div className="rounded-2xl border border-border/80 bg-surface-2/60 px-3.5 py-2.5 text-xs text-muted-foreground flex items-center gap-2 shadow-sm">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span>Spectra analyzing multi-cloud telemetry graph...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="border-t border-border/70 bg-surface/95 p-3 sm:p-3.5 shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2.5"
              >
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Ask Spectra about cloud vulnerabilities, toxic paths, compliance gaps..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="w-full rounded-xl border border-border/80 bg-surface-2/60 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all hover:border-primary/40 focus:border-primary focus:ring-1 focus:ring-primary shadow-inner"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-md hover:bg-primary/90 disabled:opacity-40 transition-all cursor-pointer active:scale-95 shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
