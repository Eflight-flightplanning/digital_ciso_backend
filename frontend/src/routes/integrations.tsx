import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Save,
  Eye,
  EyeOff,
  Link2,
  Sliders,
  Ticket,
  Key,
  Globe,
  User,
  FileText,
  Lock,
  Info,
  CheckCheck,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Panel, Dot } from "@/components/ui-kit/primitives";
import {
  useJiraConfig,
  useSaveJiraConfig,
  useTestJiraConnection,
  useJiraProjects,
} from "@/hooks/use-api";

export const Route = createFileRoute("/integrations")({
  component: IntegrationsPage,
});


const NOT_NEEDED = ["Jira Administrator", "Site Administrator", "Organization Admin", "User Management"];

// ─── Main Component ────────────────────────────────────────────────────────

function IntegrationsPage() {
  const { data: jiraConfig, isLoading: configLoading, refetch: refetchConfig } = useJiraConfig();
  const { data: projectsData, refetch: refetchProjects } = useJiraProjects();
  const saveMutation = useSaveJiraConfig();
  const testMutation = useTestJiraConnection();

  const [baseUrl, setBaseUrl] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [defaultProject, setDefaultProject] = useState("");
  const [defaultIssueType, setDefaultIssueType] = useState("Task");
  const [defaultPriority, setDefaultPriority] = useState("Medium");
  const [defaultLabels, setDefaultLabels] = useState("digital-ciso, security");

  const [testResult, setTestResult] = useState<{
    success: boolean;
    displayName?: string;
    message?: string;
  } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (jiraConfig) {
      setBaseUrl(jiraConfig.base_url || "");
      setEmail(jiraConfig.email || "");
      setDefaultProject(jiraConfig.default_project || "");
      setDefaultIssueType(jiraConfig.default_issue_type || "Task");
      setDefaultPriority(jiraConfig.default_priority || "Medium");
      if (Array.isArray(jiraConfig.default_labels)) {
        setDefaultLabels(jiraConfig.default_labels.join(", "));
      }
    }
  }, [jiraConfig]);

  const [showReconfigure, setShowReconfigure] = useState(false);

  const handleTestConnection = async () => {
    setTestResult(null);
    try {
      const res = await testMutation.mutateAsync({
        base_url: baseUrl,
        email,
        api_token: apiToken || undefined,
      });
      if (res.success) {
        setTestResult({
          success: true,
          displayName: res.display_name,
          message: `Authenticated as ${res.display_name} (${res.email_address || email}).`,
        });
        refetchProjects();
      } else {
        setTestResult({ success: false, message: res.error || "Connection failed. Please check credentials." });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.response?.data?.error || err?.message || "Failed to reach Jira API.",
      });
    }
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaveSuccess(false);
    const labelsArray = defaultLabels.split(",").map((l) => l.trim().toLowerCase()).filter(Boolean);
    try {
      await saveMutation.mutateAsync({
        base_url: baseUrl,
        email,
        api_token: apiToken || undefined,
        default_project: defaultProject,
        default_issue_type: defaultIssueType,
        default_priority: defaultPriority,
        default_labels: labelsArray,
      });
      setSaveSuccess(true);
      setApiToken("");
      setShowReconfigure(false);
      refetchConfig();
      refetchProjects();
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || err?.message || "Failed to save configuration.");
    }
  };

  const projects = projectsData?.items || [];
  const isConnected = Boolean(jiraConfig?.connected);

  return (
    <AppShell
      title="Integrations"
      subtitle="Connect Digital CISO to Jira Cloud for end-to-end security remediation orchestration"
      actions={
        <Link
          to="/ai/decisions"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface-2/60 px-3.5 text-xs font-semibold text-foreground hover:border-primary/50 transition-all shadow-sm"
        >
          <Ticket className="h-3.5 w-3.5 text-primary" />
          <span>Remediation Console</span>
        </Link>
      }
    >
      {/* ── Toast Banners ── */}
      {saveSuccess && (
        <div className="mb-5 flex items-center justify-between rounded-xl border border-success/30 bg-success/10 p-4 text-xs font-semibold text-success shadow-sm">
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0" />Configuration saved & credentials encrypted with AES-256 Fernet successfully!</span>
          <button onClick={() => setSaveSuccess(false)} className="cursor-pointer opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
      {saveError && (
        <div className="mb-5 flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs font-semibold text-destructive shadow-sm">
          <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{saveError}</span>
          <button onClick={() => setSaveError(null)} className="cursor-pointer opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
      {testResult && (
        <div className={`mb-5 flex items-center justify-between rounded-xl border p-4 text-xs font-semibold ${testResult.success ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
          <span className="flex items-center gap-2">
            {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {testResult.message}
          </span>
          <button onClick={() => setTestResult(null)} className="cursor-pointer opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ── Status Row ── */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Panel index={0} glow={isConnected ? "success" : "high"}>
          <span className="section-label">Jira Cloud Status</span>
          <div className="mt-2 flex items-center gap-2.5">
            <Dot tone={isConnected ? "success" : "high"} pulse={isConnected} />
            <span className="font-display text-lg font-bold text-foreground">
              {isConnected ? "Connected & Active" : "Not Connected"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isConnected ? "Ticket dispatch and bi-directional sync active" : "Enter credentials below to activate"}
          </p>
        </Panel>

        <Panel index={1} glow="info">
          <span className="section-label">Jira Projects Loaded</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="kpi-number text-2xl text-info font-black">{projects.length}</span>
            <span className="text-xs text-muted-foreground font-semibold">Available Projects</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Default Target: <span className="font-mono font-bold text-foreground">{defaultProject || "SEC"}</span>
          </p>
        </Panel>
      </div>

      {/* ── Main Config Grid ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">

        {/* LEFT: Active Account Card OR Credentials Form (7 cols) */}
        <div className="space-y-6 lg:col-span-7">

          {/* Condition 1: Active Jira Account Summary Card (when connected and not editing) */}
          {isConnected && !showReconfigure ? (
            <Panel index={0} className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2">
                      <span>Active Jira Cloud Account</span>
                      <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                        ONLINE
                      </span>
                    </h3>
                    <p className="text-xs text-muted-foreground">Authenticated via Atlassian REST API v3</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3.5 py-2 text-xs font-bold text-foreground hover:bg-surface-3 transition-colors cursor-pointer shadow-sm"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 text-primary ${testMutation.isPending ? "animate-spin" : ""}`} />
                    <span>Test Connection</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReconfigure(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer shadow-md"
                  >
                    <Sliders className="h-3.5 w-3.5" />
                    <span>Reconfigure Jira</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                <div className="rounded-xl border border-border/60 bg-surface-2/40 p-4 space-y-1.5">
                  <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Workspace URL</span>
                  <div className="font-mono font-bold text-foreground flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary shrink-0" />
                    <span className="truncate">{jiraConfig?.base_url || baseUrl}</span>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-surface-2/40 p-4 space-y-1.5">
                  <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Connected User</span>
                  <div className="font-bold text-foreground flex items-center gap-2">
                    <User className="h-4 w-4 text-primary shrink-0" />
                    <span className="truncate">{jiraConfig?.email || email}</span>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-surface-2/40 p-4 space-y-1.5">
                  <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Default Target Project</span>
                  <div className="font-bold text-foreground flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-mono text-primary font-bold">{defaultProject || "SEC"}</span>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-surface-2/40 p-4 space-y-1.5">
                  <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Credential Security</span>
                  <div className="font-bold text-foreground flex items-center gap-2">
                    <Lock className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="text-emerald-400">AES-256 Fernet Encrypted</span>
                  </div>
                </div>
              </div>
            </Panel>
          ) : (
            /* Condition 2: Credentials Form (when not connected or reconfiguring) */
            <Panel index={0} className="p-6">
              <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Link2 className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold text-foreground">
                      {isConnected ? "Reconfigure Jira Credentials" : "Connect Jira Cloud"}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">Atlassian REST API v3 · Basic Auth · AES-256 encrypted</p>
                  </div>
                </div>

                {isConnected && (
                  <button
                    type="button"
                    onClick={() => setShowReconfigure(false)}
                    className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {/* Base URL */}
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">
                    Jira Cloud Base URL <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://your-domain.atlassian.net"
                      className="w-full rounded-xl border border-border bg-surface-2 pl-9 pr-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">Your Atlassian Cloud workspace URL (e.g. <code className="font-mono">acme.atlassian.net</code>)</p>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">
                    Atlassian Account Email <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="secops@yourcompany.com"
                      className="w-full rounded-xl border border-border bg-surface-2 pl-9 pr-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* API Token */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-foreground">
                      Jira API Token <span className="text-destructive">*</span>
                    </label>
                    <a
                      href="https://id.atlassian.com/manage-profile/security/api-tokens"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                    >
                      <span>Generate API Token ↗</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type={showToken ? "text" : "password"}
                      value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                      placeholder={
                        jiraConfig?.has_api_token
                          ? "•••••••••••••••• (AES-256 Encrypted — leave blank to keep)"
                          : "Paste token from Atlassian API Tokens page"
                      }
                      className="w-full rounded-xl border border-border bg-surface-2 pl-9 pr-10 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
                    <Lock className="h-2.5 w-2.5 text-primary" />
                    Encrypted with AES-256 Fernet at rest
                  </p>
                </div>

                {/* Default Target Project */}
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">
                    Default Target Project
                  </label>
                  {projects.length > 0 ? (
                    <select
                      value={defaultProject || projects[0]?.key || "SEC"}
                      onChange={(e) => setDefaultProject(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-xs text-foreground font-mono font-medium focus:border-primary focus:outline-none transition-colors cursor-pointer"
                    >
                      {projects.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.key} — {p.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="relative">
                      <FileText className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        value={defaultProject}
                        onChange={(e) => setDefaultProject(e.target.value.toUpperCase())}
                        placeholder="e.g. SEC or IT"
                        className="w-full rounded-xl border border-border bg-surface-2 pl-9 pr-3.5 py-2.5 text-xs text-foreground font-mono uppercase placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors"
                      />
                    </div>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Remediation tickets will be automatically created under this Jira project by default.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-4 border-t border-border/60">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testMutation.isPending || !baseUrl || !email}
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-xs font-bold text-foreground hover:bg-surface-3 transition-colors active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 text-primary ${testMutation.isPending ? "animate-spin" : ""}`} />
                    <span>{testMutation.isPending ? "Testing..." : "Test Connection"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saveMutation.isPending || !baseUrl || !email}
                    className="ml-auto inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-md"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>{saveMutation.isPending ? "Saving..." : "Save Configuration"}</span>
                  </button>
                </div>
              </div>
            </Panel>
          )}
        </div>

        {/* RIGHT: What Gets Created (5 cols) */}
        <div className="space-y-6 lg:col-span-5">
          {/* What's in each Jira Ticket */}
          <Panel index={0} className="p-6">
            <h4 className="text-xs font-bold text-foreground mb-3 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-primary" />
              What's Inside Each Auto-Generated Ticket
            </h4>
            <div className="space-y-2 text-[11px]">
              {[
                { icon: "🛡️", label: "Executive Summary", detail: "Severity, risk score, affected provider" },
                { icon: "📦", label: "Affected Resource", detail: "Resource UID, name, region, cloud provider" },
                { icon: "⚖️", label: "Compliance Finding", detail: "Check ID, CIS / NCA ECC / SOC2 framework reference" },
                { icon: "⚠️", label: "Risk & Threat Analysis", detail: "AI exploitability reasoning and blast radius" },
                { icon: "🔧", label: "Remediation Playbook", detail: "Terraform HCL / Azure CLI / kubectl snippet" },
                { icon: "📊", label: "Telemetry Evidence", detail: "Raw scan status, API telemetry and audit context" },
                { icon: "✅", label: "Verification Steps", detail: "Step-by-step fix verification and rescan trigger" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-surface-2/30 px-3 py-2">
                  <span className="text-base">{item.icon}</span>
                  <div>
                    <div className="font-bold text-foreground">{item.label}</div>
                    <div className="text-muted-foreground">{item.detail}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">Delivered as Atlassian Document Format (ADF) — renders natively in Jira Cloud</p>
              <Link to="/ai/decisions" className="text-[11px] font-bold text-primary hover:underline">
                Open Console →
              </Link>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
