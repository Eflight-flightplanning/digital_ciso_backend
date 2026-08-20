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
  const [defaultLabels, setDefaultLabels] = useState("digital-ciso, prowler, security");

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
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
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

        <Panel index={1} glow="primary">
          <span className="section-label">Connection Health</span>
          <div className="mt-2">
            <span className="font-display text-lg font-bold text-foreground">
              {jiraConfig?.connection_health || (isConnected ? "Healthy" : "Not Configured")}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Last checked: {jiraConfig?.last_sync ? new Date(jiraConfig.last_sync).toLocaleString() : "Never"}
          </p>
        </Panel>

        <Panel index={2} glow="info">
          <span className="section-label">Jira Projects Loaded</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="kpi-number text-2xl text-info font-black">{projects.length}</span>
            <span className="text-xs text-muted-foreground font-semibold">Available</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Default: <span className="font-mono font-bold text-foreground">{defaultProject || "Not set"}</span>
          </p>
        </Panel>
      </div>

      {/* ── Main Config Grid ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">

        {/* LEFT: Credentials Form (7 cols) */}
        <div className="space-y-6 lg:col-span-7">

          {/* Step Guide Header */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <h4 className="text-xs font-bold text-foreground mb-3 flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5 text-primary" />
              Setup Guide — 3 Steps to Connect
            </h4>
            <div className="flex flex-col sm:flex-row gap-3 text-[11px]">
              <div className="flex items-start gap-2 flex-1">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">1</span>
                <div>
                  <div className="font-bold text-foreground">Log into Atlassian</div>
                  <div className="text-muted-foreground">Go to id.atlassian.com → Security → API Tokens</div>
                </div>
              </div>
              <div className="flex items-start gap-2 flex-1">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">2</span>
                <div>
                  <div className="font-bold text-foreground">Create API Token</div>
                  <div className="text-muted-foreground">Label it "Digital CISO Remediation" and copy the token</div>
                </div>
              </div>
              <div className="flex items-start gap-2 flex-1">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">3</span>
                <div>
                  <div className="font-bold text-foreground">Paste & Save Below</div>
                  <div className="text-muted-foreground">Enter URL, email, token → Test Connection → Save</div>
                </div>
              </div>
            </div>
          </div>

          {/* Credentials Panel */}
          <Panel index={0} className="p-6">
            <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Link2 className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-foreground">Jira Cloud Connection</h3>
                  <p className="text-[11px] text-muted-foreground">Atlassian REST API v3 · Basic Auth · AES-256 encrypted credentials</p>
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold border ${isConnected ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}`}>
                {isConnected ? "CONNECTED" : "SETUP REQUIRED"}
              </span>
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
                <p className="mt-1 text-[11px] text-muted-foreground">Use a dedicated service account with <code className="font-mono">BROWSE_PROJECTS</code>, <code className="font-mono">CREATE_ISSUES</code>, and <code className="font-mono">ASSIGN_ISSUES</code> permissions</p>
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
                  Encrypted with AES-256 Fernet at rest · never sent back to clients in plaintext
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

          {/* API Token Permission Guidance */}
          <Panel index={1} className="p-5">
            <h4 className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              API Token Permissions — How It Works
            </h4>

            {/* Key callout: no scopes */}
            <div className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-[11px]">
              <p className="font-bold text-amber-400 mb-0.5">⚠️ Atlassian API Tokens do not have selectable scopes</p>
              <p className="text-muted-foreground leading-relaxed">
                Classic API Tokens (from <span className="font-mono">id.atlassian.com</span>) automatically inherit
                <span className="font-semibold text-foreground"> all permissions of the Atlassian user account</span> they belong to.
                There is no scope selection screen for API tokens.
              </p>
            </div>

            {/* What actually needs to be configured */}
            <p className="text-[11px] font-bold text-foreground mb-2">
              What your Jira Admin needs to configure:
            </p>
            <div className="space-y-2 mb-3">
              {[
                { step: "1", label: "Add the service account to the Jira project", path: "Project Settings → People → Add member" },
                { step: "2", label: "Assign it the Developer or Member role", path: "Grants: Browse + Create + Assign Issues" },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-surface-2/30 px-3 py-2 text-[11px]">
                  <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground mt-0.5">{item.step}</span>
                  <div>
                    <div className="font-semibold text-foreground">{item.label}</div>
                    <div className="text-muted-foreground font-mono">{item.path}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2.5 border-t border-border/40">
              <p className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                <Info className="h-3 w-3" />
                NOT required — safe for enterprise InfoSec review:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {NOT_NEEDED.map((item) => (
                  <span key={item} className="rounded-lg border border-destructive/20 bg-destructive/5 px-2 py-0.5 text-[10px] font-semibold text-destructive/70 line-through">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </Panel>
        </div>

        {/* RIGHT: Default Settings + What Gets Created (5 cols) */}
        <div className="space-y-6 lg:col-span-5">
          {/* Default Ticket Settings */}
          <Panel index={0} className="p-6">
            <div className="flex items-center gap-3 border-b border-border/60 pb-4 mb-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-info/10 text-info">
                <Sliders className="h-4.5 w-4.5" />
              </div>
              <div>
                <h3 className="font-display text-sm font-bold text-foreground">Default Ticket Settings</h3>
                <p className="text-[11px] text-muted-foreground">Pre-populated when generating remediation tickets</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">Default Target Project</label>
                {projects.length > 0 ? (
                  <select
                    value={defaultProject}
                    onChange={(e) => setDefaultProject(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-xs text-foreground focus:border-primary focus:outline-none transition-colors"
                  >
                    <option value="">Select a project...</option>
                    {projects.map((p) => (
                      <option key={p.key} value={p.key}>{p.name} ({p.key})</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={defaultProject}
                    onChange={(e) => setDefaultProject(e.target.value)}
                    placeholder="e.g. SEC or DEVOPS"
                    className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors"
                  />
                )}
                {!isConnected && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Connect Jira to load projects automatically</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">Issue Type</label>
                  <select value={defaultIssueType} onChange={(e) => setDefaultIssueType(e.target.value)} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-xs text-foreground focus:border-primary focus:outline-none transition-colors">
                    <option value="Task">Task</option>
                    <option value="Bug">Bug</option>
                    <option value="Story">Story</option>
                    <option value="Security Finding">Security Finding</option>
                    <option value="Vulnerability">Vulnerability</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">Default Priority</label>
                  <select value={defaultPriority} onChange={(e) => setDefaultPriority(e.target.value)} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-xs text-foreground focus:border-primary focus:outline-none transition-colors">
                    <option value="Highest">Highest (P1)</option>
                    <option value="High">High (P2)</option>
                    <option value="Medium">Medium (P3)</option>
                    <option value="Low">Low (P4)</option>
                    <option value="Lowest">Lowest (P5)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1">Default Labels</label>
                <input
                  type="text"
                  value={defaultLabels}
                  onChange={(e) => setDefaultLabels(e.target.value)}
                  placeholder="digital-ciso, prowler, security"
                  className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Comma-separated. Automatically combined with provider and severity labels.</p>
              </div>
            </div>
          </Panel>

          {/* What's in each Jira Ticket */}
          <Panel index={1} className="p-5">
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
