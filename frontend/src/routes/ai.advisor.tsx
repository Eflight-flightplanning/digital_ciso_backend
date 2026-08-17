import { useState, useRef, useEffect, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Sparkles,
  Send,
  BrainCircuit,
  ArrowUpRight,
  RefreshCw,
  Terminal,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  Chip,
  Dot,
} from "@/components/ui-kit/primitives";
import { useAIAdvisorQuery } from "@/hooks/use-api";

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
  findings?: Array<{ id: string; name: string; severity: "critical" | "high" | "medium" }>;
}

const initialMessages: ChatMessage[] = [
  {
    id: "msg-1",
    sender: "assistant",
    content:
      "Spectra Threat Analysis & Security Advisor Engine initialized. Ingesting live telemetry from your connected Microsoft Azure subscription (eflight-azure). Ask any question regarding cloud security posture, Defender for Cloud gaps, CIS benchmark failures, or toxic attack paths.",
    timestamp: "Live",
    confidence: 1.0,
  },
];

function AIAdvisorPage() {
  const searchParams = Route.useSearch();
  const autoTriggeredRef = useRef(false);

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [providerFilter, setProviderFilter] = useState(searchParams.provider ? searchParams.provider.toUpperCase() === "AZURE" ? "Azure" : searchParams.provider : "All");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const advisorMutation = useAIAdvisorQuery();

  const suggestedQueries = useMemo(() => {
    switch (providerFilter.toUpperCase()) {
      case "AZURE":
        return [
          "What should we remediate first on Azure today?",
          "Show high-risk Microsoft Defender for Cloud failures.",
          "Audit Entra ID IAM accounts and privilege escalation.",
          "Evaluate CIS Microsoft Azure Foundations Benchmark failures.",
          "Which Azure Storage accounts allow anonymous blob access?",
        ];
      case "OCI":
        return [
          "What should we remediate first on Oracle Cloud today?",
          "Show open Object Storage buckets and VCN ingress rules.",
          "Audit OCI Tenancy Compartment policies and IAM groups.",
          "Evaluate CIS OCI Benchmark failure points.",
          "Which OCI Compute instances have public IPs directly exposed?",
        ];
      case "GCP":
        return [
          "What should we remediate first on Google Cloud today?",
          "Audit GCP Service Account keys with excessive permissions.",
          "Show public Cloud Storage buckets and open VPC firewalls.",
          "Evaluate CIS Google Cloud Platform Benchmark failures.",
          "Which GCP IAM service accounts have Admin privileges?",
        ];
      case "AWS":
        return [
          "What should we remediate first on AWS today?",
          "Show high-risk production S3 buckets and open Security Groups.",
          "Which IAM roles have privilege escalation paths?",
          "Evaluate CIS AWS Foundations Benchmark failure points.",
          "Which findings are currently breaching SLA deadlines?",
        ];
      case "K8S":
        return [
          "Audit Kubernetes API Server and RBAC cluster roles.",
          "Which pods run with privileged securityContext enabled?",
          "Evaluate NSA-CISA and CIS Kubernetes Benchmark failures.",
          "Are any worker nodes running with insecure Kubelet ports?",
        ];
      default:
        return [
          "What should we remediate first across our clouds today?",
          "Show high-risk Azure, AWS, and OCI misconfigurations.",
          "Which IAM roles have privilege escalation paths?",
          "Evaluate multi-cloud CIS Foundations failure points.",
          "Which findings are currently breaching SLA deadlines?",
        ];
    }
  }, [providerFilter]);

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

    try {
      const res = await advisorMutation.mutateAsync({
        question: q,
        provider: providerFilter !== "All" ? providerFilter.toLowerCase() : undefined,
      }) as Record<string, unknown>;

      // Map backend AdvisorOutput → ChatMessage
      const refs = (res.finding_references as Array<Record<string, string>> | undefined) ?? [];
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: "assistant",
        content: (res.answer as string) ?? "Analysis complete.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        confidence: (res.confidence as number) ?? 0.85,
        findings: refs.map((r) => ({
          id: r.id,
          name: r.name,
          severity: (r.severity as "critical" | "high" | "medium") ?? "medium",
        })),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: "assistant",
        content: "Spectra analysis engine is currently unavailable. Ensure the backend AI service is running and the vLLM endpoint is reachable.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        confidence: 0,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searchParams.prompt && !autoTriggeredRef.current) {
      autoTriggeredRef.current = true;
      handleSend(searchParams.prompt);
    }
  }, [searchParams]);

  return (
    <AppShell
      title="Spectra — Threat Analysis Engine"
      subtitle="Autonomous reasoning over vulnerability graphs, exposure surfaces, and kill chains"
      actions={
        <Link
          to="/ai/settings"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2/50 px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:border-primary/40 active:scale-95"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>Model Settings</span>
        </Link>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* ── Left Sidebar Context ── */}
        <div className="space-y-4 lg:col-span-1">
          <Panel index={0} className="p-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-foreground">
                <BrainCircuit className="h-4 w-4" />
              </div>
              <div>
                <h4 className="font-display text-xs font-bold text-foreground">
                  Neural Stack
                </h4>
                <p className="text-[10px] text-muted-foreground">
                  Multi-Agent Reasoning
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-2 border-t border-border/60 pt-3 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Analyzer:</span>
                <span className="font-semibold text-foreground">Spectra (Local)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Decisions:</span>
                <span className="font-semibold text-foreground">Aegis (Local)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Execution:</span>
                <span className="font-semibold text-foreground">Phantom (Claude)</span>
              </div>
            </div>
          </Panel>

          {/* Provider Filter */}
          <Panel index={1} className="p-3">
            <span className="section-label mb-2 block">Environment Scope</span>
            <div className="flex flex-wrap gap-1">
              {["All", "AWS", "OCI", "Azure", "GCP", "K8s"].map((p) => (
                <button
                  key={p}
                  onClick={() => setProviderFilter(p)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all ${
                    providerFilter === p
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-surface-2/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </Panel>

          {/* Suggested Queries */}
          <Panel index={2} className="p-4">
            <span className="section-label mb-2 block">Suggested Inquiries</span>
            <div className="space-y-1.5">
              {suggestedQueries.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(q)}
                  className="w-full text-left rounded-lg border border-border/60 bg-surface-2/40 p-2 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {q}
                </button>
              ))}
            </div>
          </Panel>
        </div>

        {/* ── Main Chat Window ── */}
        <Panel index={3} className="flex h-[calc(100vh-14rem)] min-h-[500px] flex-col p-0 lg:col-span-3">
          {/* Messages Feed */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 ${m.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.sender === "assistant" && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-foreground ring-1 ring-border">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-xl p-3.5 text-xs leading-relaxed ${
                    m.sender === "user"
                      ? "bg-primary text-primary-foreground font-medium"
                      : "border border-border/80 bg-surface-2/50 text-foreground"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>

                  {/* Spectra Block */}
                  {m.spectra && (
                    <div className="mt-2.5 rounded-lg border border-border/80 bg-surface-2/60 p-3">
                      <div className="flex items-center gap-1.5 font-display text-[11px] font-bold text-foreground">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        <span>Spectra Threat Evaluation</span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                        {m.spectra}
                      </p>
                    </div>
                  )}

                  {/* Aegis Block */}
                  {m.aegis && (
                    <div className="mt-2 rounded-lg border border-border/80 bg-surface-2/60 p-3">
                      <div className="flex items-center gap-1.5 font-display text-[11px] font-bold text-foreground">
                        <BrainCircuit className="h-3.5 w-3.5 text-primary" />
                        <span>Aegis Recommended Action</span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                        {m.aegis}
                      </p>
                    </div>
                  )}

                  {/* Referenced Violations */}
                  {m.findings && m.findings.length > 0 && (
                    <div className="mt-2.5 border-t border-border/60 pt-2">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Referenced Items:
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {m.findings.map((f) => (
                          <Link
                            key={f.id}
                            to="/findings"
                            className="inline-flex items-center gap-1 rounded bg-surface px-2 py-0.5 text-[10px] font-medium text-foreground hover:text-primary transition-colors"
                          >
                            <span className="mono">{f.id}</span>
                            <span className="truncate max-w-[140px] text-muted-foreground">
                              {f.name}
                            </span>
                            <ArrowUpRight className="h-2.5 w-2.5" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-2 flex items-center justify-between text-[9px] text-muted-foreground opacity-60">
                    <span>{m.timestamp}</span>
                    {m.confidence && (
                      <span>Confidence: {Math.round(m.confidence * 100)}%</span>
                    )}
                  </div>
                </div>

                {m.sender === "user" && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 font-display text-[11px] font-bold text-foreground ring-1 ring-border">
                    NH
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-foreground animate-pulse">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div className="rounded-xl border border-border bg-surface-2/50 p-2.5 text-xs text-muted-foreground flex items-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span>Spectra analyzing telemetry graph...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-border bg-surface/80 p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="Ask Spectra about cloud vulnerabilities, toxic paths, compliance gaps..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-surface-2/60 px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="inline-flex items-center justify-center rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
