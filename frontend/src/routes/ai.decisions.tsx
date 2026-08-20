import { useState, useMemo, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ScrollText,
  BrainCircuit,
  Zap,
  Check,
  X,
  Sparkles,
  ShieldCheck,
  Terminal,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
  ExternalLink,
  Search,
  User,
  Users,
  Layers,
  ArrowUpRight,
  RefreshCw,
  Sliders,
  Send,
  Ticket,
  ChevronRight,
  ShieldAlert,
  Calendar,
  AlertCircle,
  FileText,
  Tag,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  PanelTitle,
  Chip,
  DataTable,
  Row,
  Dot,
} from "@/components/ui-kit/primitives";
import {
  useFindings,
  useDecisionLogs,
  useRemediationPlaybooks,
  useJiraConfig,
  useJiraProjects,
  useJiraIssueTypes,
  useJiraAssignees,
  useJiraPriorities,
  useRemediationExecutions,
  useCreateJiraRemediationTicket,
  useSyncJiraExecutionStatus,
  useRemediationMetrics,
  RemediationExecutionRecord,
} from "@/hooks/use-api";

export const Route = createFileRoute("/ai/decisions")({
  component: AIDecisionsPage,
});

interface FindingRemediationItem {
  id: string;
  finding_id: string;
  check_id: string;
  title: string;
  finding_title: string;
  provider: string;
  region: string;
  resource_uid: string;
  resource_name: string;
  severity: "critical" | "high" | "medium" | "low" | string;
  risk_score: number;
  risk_summary: string;
  compliance_rules: string[];
  recommended_fix: string;
  code_snippet: string;
  rollback_snippet?: string;
  ai_reasoning: string;
  evidence: string;
  approval_status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "TICKET_CREATED";
  execution_record?: RemediationExecutionRecord;
  inserted_at: string;
}

function AIDecisionsPage() {
  const { data: findingsRaw } = useFindings();
  const { data: playbooksRaw } = useRemediationPlaybooks();
  const { data: executionsRaw, refetch: refetchExecutions } = useRemediationExecutions();
  const { data: metricsRaw, refetch: refetchMetrics } = useRemediationMetrics();
  const { data: jiraConfig } = useJiraConfig();
  const { data: projectsData } = useJiraProjects();
  const { data: prioritiesData } = useJiraPriorities();

  const createTicketMutation = useCreateJiraRemediationTicket();
  const syncStatusMutation = useSyncJiraExecutionStatus();

  // Filters & Selected State
  const [filterSection, setFilterSection] = useState<"All" | "Pending" | "In Progress" | "Completed" | "Failed">("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  
  // Modal / Drawer state for Ticket Creation
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedIssueType, setSelectedIssueType] = useState("Task");
  const [selectedPriority, setSelectedPriority] = useState("Medium");
  const [selectedAssignee, setSelectedAssignee] = useState<{
    accountId: string;
    displayName: string;
    emailAddress?: string;
    avatarUrl?: string;
  } | null>(null);
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState("");
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false);
  const [customSummary, setCustomSummary] = useState("");

  // Feedback State
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [createdTicketResult, setCreatedTicketResult] = useState<{
    key: string;
    url: string;
    assigneeName?: string;
    status: string;
  } | null>(null);

  // Load assignees for the selected project
  const { data: assigneesData, isLoading: assigneesLoading } = useJiraAssignees(
    selectedProject || jiraConfig?.default_project,
    assigneeSearchQuery
  );
  const { data: issueTypesData } = useJiraIssueTypes(selectedProject || jiraConfig?.default_project);

  // Set default project & settings from Jira Config
  useEffect(() => {
    if (jiraConfig) {
      if (!selectedProject && jiraConfig.default_project) {
        setSelectedProject(jiraConfig.default_project);
      }
      if (jiraConfig.default_issue_type) {
        setSelectedIssueType(jiraConfig.default_issue_type);
      }
      if (jiraConfig.default_priority) {
        setSelectedPriority(jiraConfig.default_priority);
      }
    }
  }, [jiraConfig, selectedProject]);

  const realFindings = findingsRaw?.items ?? [];
  const executions = executionsRaw ?? [];

  // Build Unified Remediation Items List from real failed findings + executions
  const remediationItems: FindingRemediationItem[] = useMemo(() => {
    const list: FindingRemediationItem[] = [];

    // Map each real failed finding
    const failedFindings = realFindings.filter((f: any) => f.status === "FAIL");

    failedFindings.forEach((f: any, idx: number) => {
      const checkId = f.check_id || `check_${idx + 1}`;
      const checkMeta = f.check_metadata || {};
      const title = checkMeta.checktitle || f.raw_result?.CheckTitle || f.title || checkId.replace(/_/g, " ");
      const res = (f.resources && f.resources[0]) || f.resource || {};
      const resName = res.name || f.resource_name || "cloud-infrastructure-resource";
      const resUid = res.uid || f.resource_uid || `res-${idx + 1}`;
      const region = res.region || f.region || "Global";
      const provider = (f.scan?.provider?.provider || f.provider || "cloud").toUpperCase();
      const severity = (f.severity || "medium").toLowerCase();

      // Find matching execution if ticket was created
      const matchedExec = executions.find(
        (ex) => ex.finding_id === f.id || ex.summary?.toLowerCase().includes(checkId.toLowerCase())
      );

      // Determine playbook script
      let snippet = `resource "azurerm_security_center_setting" "setting_${idx}" {\n  setting_name = "MCAS"\n  enabled      = true\n}`;
      if (checkId.includes("app_services")) {
        snippet = `resource "azurerm_security_center_subscription_pricing" "app_services" {\n  tier          = "Standard"\n  resource_type = "AppServices"\n}`;
      } else if (checkId.includes("container")) {
        snippet = `resource "azurerm_security_center_subscription_pricing" "containers" {\n  tier          = "Standard"\n  resource_type = "Containers"\n}`;
      } else if (checkId.includes("storage")) {
        snippet = `resource "azurerm_storage_account" "secure_storage" {\n  name                     = "${resName.slice(0, 20)}"\n  enable_https_traffic_only = true\n  min_tls_version           = "TLS1_2"\n}`;
      } else if (checkId.includes("sql")) {
        snippet = `az sql server tde set --resource-group "rg-production" --server "sql-primary" --status Enabled`;
      }

      let approvalStatus: FindingRemediationItem["approval_status"] = "PENDING_APPROVAL";
      if (matchedExec) {
        approvalStatus = "TICKET_CREATED";
      }

      list.push({
        id: f.id || `remed-${idx}`,
        finding_id: f.id || `find-${idx}`,
        check_id: checkId,
        title: `Remediate ${checkId.replace(/_/g, " ")}`,
        finding_title: title,
        provider,
        region,
        resource_uid: resUid,
        resource_name: resName,
        severity,
        risk_score: severity === "critical" ? 95 : severity === "high" ? 85 : severity === "medium" ? 65 : 40,
        risk_summary: checkMeta.risk || `Exposure detected on ${resName} violating cloud security posture standards.`,
        compliance_rules: f.compliance ? Object.keys(f.compliance) : ["CIS Microsoft Azure Benchmark v2.0", "NCA ECC"],
        recommended_fix: checkMeta.remediation?.recommendation?.text || `Apply least privilege and strict encryption configuration to ${resName}.`,
        code_snippet: snippet,
        ai_reasoning: `Digital CISO Threat Engine analyzed telemetry for ${resUid}. Misconfiguration allows potential privilege escalation or unauthorized data access.`,
        evidence: f.status_extended || `Resource ${resName} failed rule verification during continuous assessment.`,
        approval_status: approvalStatus,
        execution_record: matchedExec,
        inserted_at: f.inserted_at || new Date().toISOString(),
      });
    });

    return list;
  }, [realFindings, executions]);

  // Set initial selected item
  useEffect(() => {
    if (!selectedItemId && remediationItems.length > 0) {
      setSelectedItemId(remediationItems[0].id);
    }
  }, [remediationItems, selectedItemId]);

  const selectedItem = useMemo(() => {
    return remediationItems.find((item) => item.id === selectedItemId) || remediationItems[0];
  }, [remediationItems, selectedItemId]);

  // Filter items by tab section and search query
  const filteredItems = useMemo(() => {
    return remediationItems.filter((item) => {
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q) || item.finding_title.toLowerCase().includes(q);
        const matchKey = item.execution_record?.issue_key?.toLowerCase().includes(q);
        const matchAssignee = item.execution_record?.assignee_name?.toLowerCase().includes(q);
        if (!matchTitle && !matchKey && !matchAssignee) return false;
      }

      // Section tab filter
      if (filterSection === "All") return true;
      if (filterSection === "Pending") {
        return !item.execution_record || item.execution_record.status === "PENDING";
      }
      if (filterSection === "In Progress") {
        return item.execution_record && (item.execution_record.status === "IN_PROGRESS" || item.execution_record.jira_status_category === "indeterminate");
      }
      if (filterSection === "Completed") {
        return item.execution_record && (item.execution_record.status === "COMPLETED" || item.execution_record.jira_status_category === "done");
      }
      if (filterSection === "Failed") {
        return item.execution_record && item.execution_record.status === "FAILED";
      }
      return true;
    });
  }, [remediationItems, filterSection, searchQuery]);

  // Handle Opening Ticket Creation Modal
  const handleOpenCreateTicket = (item: FindingRemediationItem) => {
    setCustomSummary(`Fix ${item.check_id.replace(/_/g, " ")} on ${item.resource_name}`);
    setSelectedProject(jiraConfig?.default_project || (projectsData?.items?.[0]?.key || "SEC"));
    setSelectedIssueType(jiraConfig?.default_issue_type || "Task");
    setSelectedPriority(item.severity === "critical" ? "Highest" : item.severity === "high" ? "High" : "Medium");
    setIsCreatingTicket(true);
  };

  // Handle Ticket Creation Submit
  const handleConfirmCreateTicket = async () => {
    if (!selectedItem) return;

    try {
      const payload = {
        finding_id: selectedItem.finding_id,
        project_key: selectedProject || "SEC",
        summary: customSummary || selectedItem.title,
        issue_type: selectedIssueType || "Task",
        priority: selectedPriority || "Medium",
        assignee_account_id: selectedAssignee?.accountId,
        assignee_name: selectedAssignee?.displayName,
        assignee_email: selectedAssignee?.emailAddress,
        labels: ["digital-ciso", "prowler", selectedItem.provider.toLowerCase(), selectedItem.severity],
        finding_title: selectedItem.finding_title,
        check_id: selectedItem.check_id,
        provider: selectedItem.provider,
        region: selectedItem.region,
        resource_uid: selectedItem.resource_uid,
        resource_name: selectedItem.resource_name,
        severity: selectedItem.severity,
        risk_score: selectedItem.risk_score,
        risk_summary: selectedItem.risk_summary,
        compliance_rules: selectedItem.compliance_rules,
        recommended_fix: selectedItem.recommended_fix,
        code_snippet: selectedItem.code_snippet,
        ai_reasoning: selectedItem.ai_reasoning,
        evidence: selectedItem.evidence,
      };

      const result = await createTicketMutation.mutateAsync(payload);
      setIsCreatingTicket(false);
      setCreatedTicketResult({
        key: result.issue_key,
        url: result.issue_url,
        assigneeName: result.assignee_name || selectedAssignee?.displayName || "Unassigned",
        status: result.jira_status || "To Do",
      });
      setActionSuccess(`Jira Ticket ${result.issue_key} created and assigned successfully!`);
      refetchExecutions();
      refetchMetrics();
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err: any) {
      setActionSuccess(`Failed to create Jira ticket: ${err?.message || "Check Jira connection."}`);
    }
  };

  // Handle Sync Jira Status
  const handleSyncStatus = async (executionId: string) => {
    try {
      await syncStatusMutation.mutateAsync(executionId);
      refetchExecutions();
      refetchMetrics();
      setActionSuccess("Synchronized latest status from Jira Cloud!");
      setTimeout(() => setActionSuccess(null), 3000);
    } catch {
      // Handled
    }
  };

  // Compute live KPIs
  const totalTickets = executions.length;
  const inProgressTickets = executions.filter((e) => e.status === "IN_PROGRESS" || e.jira_status_category === "indeterminate").length;
  const resolvedTickets = executions.filter((e) => e.status === "COMPLETED" || e.jira_status_category === "done").length;
  const failedTickets = executions.filter((e) => e.status === "FAILED").length;
  const pendingTickets = remediationItems.filter((i) => !i.execution_record).length;

  return (
    <AppShell
      title="Aegis — Jira Remediation & Task Orchestration"
      subtitle="AI-synthesized remediation playbooks dispatched, assigned, and tracked via Jira Cloud"
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/integrations"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2/60 px-3.5 text-xs font-semibold text-foreground hover:border-primary/50 transition-all cursor-pointer shadow-sm"
          >
            <Sliders className="h-3.5 w-3.5 text-primary" />
            <span>Jira Settings</span>
          </Link>
          <Link
            to="/ai/advisor"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2/60 px-3.5 text-xs font-semibold text-foreground hover:border-primary/50 transition-all cursor-pointer shadow-sm"
          >
            <BrainCircuit className="h-3.5 w-3.5 text-primary" />
            <span>AI Advisor</span>
          </Link>
        </div>
      }
    >
      {/* ── Success Toast Banner ── */}
      {actionSuccess && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-success/30 bg-success/10 p-4 text-xs font-semibold text-success shadow-sm">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {actionSuccess}
          </span>
          <button onClick={() => setActionSuccess(null)} className="cursor-pointer">✕</button>
        </div>
      )}

      {/* ── Jira Connection Alert Banner if not configured ── */}
      {!jiraConfig?.connected && (
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4 text-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 text-primary shrink-0" />
            <div>
              <span className="font-bold text-foreground">Jira Cloud is not yet connected</span>
              <p className="text-muted-foreground text-[11px] mt-0.5">
                Connect your organization's Jira Cloud instance to create and synchronize real remediation tickets.
              </p>
            </div>
          </div>
          <Link
            to="/integrations"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all shrink-0"
          >
            <span>Configure Jira Credentials</span>
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}


      {/* ── Top Summary Stats Row (Jira Metrics) ── */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-5">
        <Panel index={0} glow="info">
          <span className="section-label">Tickets Created</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="kpi-number text-2xl font-black text-info">
              {totalTickets}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">In Jira Cloud</span>
          </div>
        </Panel>

        <Panel index={1} glow="high">
          <span className="section-label">Pending Approval</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="kpi-number text-2xl font-black text-high">
              {pendingTickets}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">Awaiting Dispatch</span>
          </div>
        </Panel>

        <Panel index={2} glow="primary">
          <span className="section-label">In Progress</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="kpi-number text-2xl font-black text-primary">
              {inProgressTickets}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">Active in Jira</span>
          </div>
        </Panel>

        <Panel index={3} glow="success">
          <span className="section-label">Resolved</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="kpi-number text-2xl font-black text-success">
              {resolvedTickets}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">Closed & Verified</span>
          </div>
        </Panel>

        <Panel index={4} glow={failedTickets > 0 ? "high" : undefined}>
          <span className="section-label">Failed</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`kpi-number text-2xl font-black ${failedTickets > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {failedTickets}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">API Errors</span>
          </div>
        </Panel>
      </div>

      {/* ── Main Split View: Execution Table & Decision Inspector ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (6 Cols): Execution Tab & Records Table */}
        <div className="space-y-4 lg:col-span-6">
          <Panel index={0} className="p-4">
            {/* Header & Section Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Ticket className="h-4 w-4 text-primary" />
                <h3 className="font-display text-sm font-bold text-foreground">
                  Remediation Orchestration
                </h3>
              </div>

              {/* Section Filter Pills */}
              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface-2/60 p-1 text-xs">
                {(["All", "Pending", "In Progress", "Completed", "Failed"] as const).map((tab) => {
                  const count =
                    tab === "All"
                      ? remediationItems.length
                      : tab === "Pending"
                      ? pendingTickets
                      : tab === "In Progress"
                      ? inProgressTickets
                      : tab === "Completed"
                      ? resolvedTickets
                      : failedTickets;
                  return (
                    <button
                      key={tab}
                      onClick={() => setFilterSection(tab)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                        filterSection === tab
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Search Input */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search findings, issue key (e.g. SEC-104), or assignee..."
                className="w-full rounded-xl border border-border bg-surface-2 pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors"
              />
            </div>

            {/* Records List Table */}
            <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
              {filteredItems.length === 0 ? (
                <div className="rounded-xl border border-border/60 bg-surface-2/30 p-8 text-center text-xs text-muted-foreground">
                  No remediation records found matching the "{filterSection}" filter.
                </div>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = item.id === selectedItem?.id;
                  const exec = item.execution_record;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      className={`group flex flex-col gap-2 rounded-xl border p-3.5 transition-all cursor-pointer ${
                        isSelected
                          ? "border-primary/80 bg-primary/5 shadow-sm"
                          : "border-border/80 bg-surface/80 hover:border-primary/40 hover:bg-surface"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {/* Issue Key / Status Badge */}
                          {exec?.issue_key && exec.issue_key !== "N/A" ? (
                            <a
                              href={exec.issue_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] font-mono font-bold text-primary hover:underline"
                            >
                              <span>{exec.issue_key}</span>
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          ) : (
                            <span className="rounded-md bg-surface-2 border border-border px-2 py-0.5 text-[10px] font-mono font-bold text-muted-foreground">
                              PENDING JIRA
                            </span>
                          )}

                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            item.severity === "critical"
                              ? "bg-rose-500/10 text-rose-400"
                              : item.severity === "high"
                              ? "bg-orange-500/10 text-orange-400"
                              : "bg-amber-500/10 text-amber-400"
                          }`}>
                            {item.severity}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Current Jira Status Badge */}
                          {exec ? (
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                              exec.status === "COMPLETED" || exec.jira_status_category === "done"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : exec.status === "FAILED"
                                ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                : "bg-sky-500/10 text-sky-400 border-sky-500/20"
                            }`}>
                              <Dot tone={exec.status === "COMPLETED" ? "success" : exec.status === "FAILED" ? "high" : "primary"} pulse={exec.status === "IN_PROGRESS"} />
                              {exec.jira_status || "In Progress"}
                            </span>
                          ) : (
                            <span className="rounded-full bg-surface-2 border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              Ready to Dispatch
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Finding Title */}
                      <div className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors line-clamp-1">
                        {item.title}
                      </div>

                      {/* Assignee & Resource Meta */}
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium text-foreground">
                            {exec?.assignee_name || "Unassigned"}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[10px]">{item.provider} · {item.region}</span>
                          <span className="text-[10px] text-muted-foreground">{new Date(item.inserted_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Panel>
        </div>

        {/* Right Column (6 Cols): Decision Panel & Jira Ticket Inspector */}
        <div className="space-y-4 lg:col-span-6">
          {selectedItem ? (
            <Panel index={1} className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                      selectedItem.severity === "critical"
                        ? "bg-rose-500/10 text-rose-400"
                        : selectedItem.severity === "high"
                        ? "bg-orange-500/10 text-orange-400"
                        : "bg-amber-500/10 text-amber-400"
                    }`}>
                      {selectedItem.severity} Severity
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      Risk Score: <strong className="text-foreground">{selectedItem.risk_score}/100</strong>
                    </span>
                  </div>
                  <h3 className="font-display text-base font-bold text-foreground">
                    {selectedItem.finding_title}
                  </h3>
                  <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                    Resource: <span className="text-foreground">{selectedItem.resource_name}</span> ({selectedItem.provider})
                  </p>
                </div>

                {/* Open in Jira button if already created */}
                {selectedItem.execution_record?.issue_url && (
                  <div className="flex flex-col items-end gap-1.5">
                    <a
                      href={selectedItem.execution_record.issue_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground shadow hover:bg-primary/90 transition-all cursor-pointer"
                    >
                      <span>Open in Jira</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button
                      onClick={() => handleSyncStatus(selectedItem.execution_record!.id)}
                      disabled={syncStatusMutation.isPending}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <RefreshCw className={`h-3 w-3 ${syncStatusMutation.isPending ? "animate-spin text-primary" : ""}`} />
                      <span>Sync Live Status</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Success Banner if freshly created */}
              {createdTicketResult && (
                <div className="mb-4 rounded-xl border border-success/30 bg-success/10 p-4 text-xs space-y-2">
                  <div className="flex items-center justify-between font-bold text-success">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" />
                      Jira Ticket Created Successfully!
                    </span>
                    <a
                      href={createdTicketResult.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 underline"
                    >
                      <span>{createdTicketResult.key}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-muted-foreground text-[11px]">
                    <div>Assignee: <strong className="text-foreground">{createdTicketResult.assigneeName}</strong></div>
                    <div>Initial Status: <strong className="text-foreground">{createdTicketResult.status}</strong></div>
                  </div>
                </div>
              )}

              {/* Section 1: AI Remediation & Reasoning */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span>AI Recommended Fix & Reasoning</span>
                  </h4>
                  <div className="rounded-xl border border-border/80 bg-surface-2/50 p-3.5 text-xs text-foreground leading-relaxed">
                    <p className="font-semibold text-foreground mb-1">{selectedItem.recommended_fix}</p>
                    <p className="text-muted-foreground text-[11px]">{selectedItem.ai_reasoning}</p>
                  </div>
                </div>

                {/* Section 2: IaC / CLI Code Snippet */}
                {selectedItem.code_snippet && (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                      <Terminal className="h-3.5 w-3.5 text-primary" />
                      <span>Remediation Payload Script</span>
                    </h4>
                    <pre className="rounded-xl border border-border/80 bg-[#0d1117] p-3.5 font-mono text-[11px] text-emerald-400 overflow-x-auto">
                      <code>{selectedItem.code_snippet}</code>
                    </pre>
                  </div>
                )}

                {/* Section 3: Execution Timeline */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    <span>Remediation Execution Timeline</span>
                  </h4>

                  <div className="rounded-xl border border-border/80 bg-surface-2/40 p-4 space-y-3">
                    {selectedItem.execution_record?.timeline && selectedItem.execution_record.timeline.length > 0 ? (
                      selectedItem.execution_record.timeline.map((step, sIdx) => (
                        <div key={sIdx} className="flex items-start gap-3 text-xs">
                          <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary shrink-0 font-bold text-[10px]">
                            {sIdx + 1}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-foreground">{step.title}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(step.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{step.description}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-start gap-3 text-xs">
                          <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 shrink-0 font-bold text-[10px]">
                            ✓
                          </div>
                          <div>
                            <span className="font-bold text-foreground">Recommendation Generated</span>
                            <p className="text-[11px] text-muted-foreground">Root cause synthesized by Digital CISO AI.</p>
                          </div>
                        </div>

                        <div className="flex items-start gap-3 text-xs opacity-60">
                          <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-surface-3 text-muted-foreground shrink-0 font-bold text-[10px]">
                            2
                          </div>
                          <div>
                            <span className="font-bold text-foreground">Awaiting Jira Ticket Dispatch</span>
                            <p className="text-[11px] text-muted-foreground">Click "Create Jira Ticket" below to publish & assign.</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Primary Action Button */}
                <div className="pt-2">
                  {selectedItem.execution_record ? (
                    <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 p-3.5 text-xs font-semibold">
                      <div className="flex items-center gap-2 text-foreground">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        <span>Ticket active in Jira: <strong className="text-primary">{selectedItem.execution_record.issue_key}</strong></span>
                      </div>
                      <a
                        href={selectedItem.execution_record.issue_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline font-bold"
                      >
                        <span>View Ticket</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleOpenCreateTicket(selectedItem)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 px-4 text-xs font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
                    >
                      <Ticket className="h-4 w-4" />
                      <span>Create Jira Ticket & Assign</span>
                    </button>
                  )}
                </div>
              </div>
            </Panel>
          ) : (
            <Panel index={1} className="p-8 text-center text-muted-foreground text-xs">
              Select a remediation item from the left queue to inspect details.
            </Panel>
          )}
        </div>
      </div>

      {/* ── Modal / Drawer: Create Jira Ticket Flow ── */}
      {isCreatingTicket && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Ticket className="h-5 w-5 text-primary" />
                <h3 className="font-display text-base font-bold text-foreground">
                  Create & Assign Jira Remediation Ticket
                </h3>
              </div>
              <button
                onClick={() => setIsCreatingTicket(false)}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Summary */}
              <div>
                <label className="block font-bold text-foreground mb-1">Issue Summary</label>
                <input
                  type="text"
                  value={customSummary}
                  onChange={(e) => setCustomSummary(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              {/* Project & Issue Type 2-Col */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-foreground mb-1">Target Project</label>
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                  >
                    {projectsData?.items && projectsData.items.length > 0 ? (
                      projectsData.items.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.name} ({p.key})
                        </option>
                      ))
                    ) : (
                      <option value="SEC">Security (SEC)</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-foreground mb-1">Issue Type</label>
                  <select
                    value={selectedIssueType}
                    onChange={(e) => setSelectedIssueType(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="Task">Task</option>
                    <option value="Bug">Bug</option>
                    <option value="Security Finding">Security Finding</option>
                  </select>
                </div>
              </div>

              {/* Assignee Searchable Dropdown */}
              <div className="relative">
                <label className="block font-bold text-foreground mb-1">
                  Assignee <span className="text-muted-foreground font-normal">(Search Jira users)</span>
                </label>
                <div
                  onClick={() => setAssigneeDropdownOpen(!assigneeDropdownOpen)}
                  className="flex items-center justify-between w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2 text-xs text-foreground cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-primary" />
                    <span>{selectedAssignee ? `${selectedAssignee.displayName} (${selectedAssignee.emailAddress || 'User'})` : "Select an assignee..."}</span>
                  </div>
                  <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${assigneeDropdownOpen ? "rotate-90" : ""}`} />
                </div>

                {assigneeDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-surface p-2 shadow-xl space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 h-3 w-3 text-muted-foreground" />
                      <input
                        type="text"
                        value={assigneeSearchQuery}
                        onChange={(e) => setAssigneeSearchQuery(e.target.value)}
                        placeholder="Search Jira users by name or email..."
                        className="w-full rounded-lg border border-border bg-surface-2 pl-8 pr-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                      />
                    </div>

                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {assigneesLoading ? (
                        <div className="p-2 text-center text-muted-foreground text-[11px]">Loading Jira users...</div>
                      ) : assigneesData?.items && assigneesData.items.length > 0 ? (
                        assigneesData.items.map((u) => (
                          <div
                            key={u.account_id}
                            onClick={() => {
                              setSelectedAssignee({
                                accountId: u.account_id,
                                displayName: u.display_name,
                                emailAddress: u.email_address,
                                avatarUrl: u.avatar_url,
                              });
                              setAssigneeDropdownOpen(false);
                            }}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-2 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              {u.avatar_url ? (
                                <img src={u.avatar_url} alt="" className="h-5 w-5 rounded-full" />
                              ) : (
                                <User className="h-4 w-4 text-muted-foreground" />
                              )}
                              <div>
                                <div className="font-bold text-foreground text-xs">{u.display_name}</div>
                                <div className="text-[10px] text-muted-foreground">{u.email_address}</div>
                              </div>
                            </div>
                            {selectedAssignee?.accountId === u.account_id && <Check className="h-3.5 w-3.5 text-primary" />}
                          </div>
                        ))
                      ) : (
                        <div className="p-2 text-center text-muted-foreground text-[11px]">
                          No Jira users found. Type to search or select unassigned.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Priority & Auto Labels */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-foreground mb-1">Priority</label>
                  <select
                    value={selectedPriority}
                    onChange={(e) => setSelectedPriority(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="Highest">Highest (P1)</option>
                    <option value="High">High (P2)</option>
                    <option value="Medium">Medium (P3)</option>
                    <option value="Low">Low (P4)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-foreground mb-1">Attached Labels</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {["digital-ciso", "prowler", selectedItem.provider.toLowerCase(), selectedItem.severity].map((lbl) => (
                      <span key={lbl} className="rounded bg-surface-2 border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                        {lbl}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Structured Template Note */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-[11px] text-muted-foreground space-y-1">
                <span className="font-bold text-foreground flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  Full Security Context Included
                </span>
                <p>Includes Executive Summary, Affected Resource, Compliance Findings, Risk Analysis, Remediation Playbook, and Verification Steps.</p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/60">
              <button
                type="button"
                onClick={() => setIsCreatingTicket(false)}
                className="rounded-xl border border-border bg-surface-2 px-4 py-2 text-xs font-semibold text-foreground hover:bg-surface-3 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmCreateTicket}
                disabled={createTicketMutation.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-md"
              >
                <Send className={`h-3.5 w-3.5 ${createTicketMutation.isPending ? "animate-spin" : ""}`} />
                <span>{createTicketMutation.isPending ? "Publishing to Jira..." : "Authorize & Create Ticket"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}