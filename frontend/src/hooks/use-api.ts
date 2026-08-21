/**
 * Digital CISO — API Query Hooks
 *
 * TanStack React Query hooks for all backend resources.
 * All data-fetching in the app goes through these hooks.
 *
 * Usage:
 *   const { data: findings, isLoading } = useFindings({ severity: 'critical' });
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, jsonApiBody, unwrapList, unwrapSingle, unwrapMeta } from "../lib/api-client";

// ─── Query key factory ─────────────────────────────────────────────────────

export const qk = {
  findings: (params?: Record<string, string>) => ["findings", params ?? {}] as const,
  finding: (id: string) => ["findings", id] as const,
  providers: () => ["providers"] as const,
  scans: (params?: Record<string, string>) => ["scans", params ?? {}] as const,
  compliance: (params?: Record<string, string>) => ["compliance", params ?? {}] as const,
  resources: (params?: Record<string, string>) => ["resources", params ?? {}] as const,
  users: () => ["users"] as const,
  roles: () => ["roles"] as const,
  overviews: () => ["overviews"] as const,
  tenants: () => ["tenants"] as const,
  decisionLogs: (params?: Record<string, string>) => ["decision-logs", params ?? {}] as const,
  securityDecisions: (params?: Record<string, string>) => ["ai-security-decisions", params ?? {}] as const,
  hitlReviews: () => ["hitl-reviews"] as const,
  llmConfigs: () => ["tenant-llm-configs"] as const,
  integrations: () => ["integrations"] as const,
  apiKeys: () => ["api-keys"] as const,
  attackPaths: () => ["attack-paths-scans"] as const,
  currentUser: () => ["users", "me"] as const,
  jiraConfig: () => ["jira-config"] as const,
  jiraProjects: () => ["jira-projects"] as const,
  jiraIssueTypes: (projectKey: string) => ["jira-issue-types", projectKey] as const,
  jiraAssignees: (projectKey: string, query?: string) => ["jira-assignees", projectKey, query ?? ""] as const,
  jiraPriorities: () => ["jira-priorities"] as const,
  remediationExecutions: (status?: string) => ["remediation-executions", status ?? "ALL"] as const,
  remediationExecution: (id: string) => ["remediation-executions", id] as const,
  remediationMetrics: () => ["remediation-metrics"] as const,
};

// ─── Query param builder ───────────────────────────────────────────────────

function buildQuery(params?: Record<string, string | undefined>): string {
  if (!params) return "";
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
    .join("&");
  return qs ? `?${qs}` : "";
}

// ─── Current User ──────────────────────────────────────────────────────────

export function useCurrentUser() {
  return useQuery({
    queryKey: qk.currentUser(),
    queryFn: () => api.get("/users/me").then(unwrapSingle),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

// ─── Overviews (Dashboard KPIs) ───────────────────────────────────────────

export function useOverview() {
  return useQuery({
    queryKey: qk.overviews(),
    queryFn: () => api.get("/overviews").then(unwrapList),
    staleTime: 60 * 1000,
  });
}

// ─── Compliance ────────────────────────────────────────────────────────────

export function useCompliance(params?: Record<string, string>) {
  return useQuery({
    queryKey: qk.compliance(params),
    queryFn: async () => {
      const res = await api.get(`/compliance-overviews${buildQuery(params)}`);
      return { items: unwrapList(res), meta: unwrapMeta(res) };
    },
    staleTime: 2 * 60 * 1000,
  });
}

// ─── Findings ─────────────────────────────────────────────────────────────

export function useFindings(params?: Record<string, string>) {
  return useQuery({
    queryKey: qk.findings(params),
    queryFn: async () => {
      const now = new Date();
      const lteDate = now.toISOString().split("T")[0];
      const gteDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const finalParams = {
        "page[size]": "500",
        "filter[inserted_at.gte]": gteDate,
        "filter[inserted_at.lte]": lteDate,
        ...(params || {}),
      };
      const res = await api.get(`/findings${buildQuery(finalParams)}`);
      return { items: unwrapList(res), meta: unwrapMeta(res) };
    },
    staleTime: 30 * 1000,
  });
}

export function useFinding(id: string) {
  return useQuery({
    queryKey: qk.finding(id),
    queryFn: () => api.get(`/findings/${id}`).then(unwrapSingle),
    enabled: !!id,
  });
}

// ─── Resources ────────────────────────────────────────────────────────────

export function useResources(params?: Record<string, string>) {
  return useQuery({
    queryKey: qk.resources(params),
    queryFn: async () => {
      const now = new Date();
      const lteDate = now.toISOString().split("T")[0];
      const gteDate = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const finalParams = {
        "page[size]": "500",
        "filter[updated_at.gte]": gteDate,
        "filter[updated_at.lte]": lteDate,
        ...(params || {}),
      };
      const res = await api.get(`/resources${buildQuery(finalParams)}`);
      return { items: unwrapList(res), meta: unwrapMeta(res) };
    },
    staleTime: 30 * 1000,
  });
}

// ─── AI: Analyze Finding ───────────────────────────────────────────────────

export function useAnalyzeFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId, forceReanalysis = false }: { findingId: string; forceReanalysis?: boolean }) =>
      api.post(`/ai/findings/${findingId}/analyze`, { force_reanalysis: forceReanalysis }, { jsonApi: false }),
    onSuccess: (_data, { findingId }) => {
      qc.invalidateQueries({ queryKey: qk.finding(findingId) });
    },
  });
}

// ─── AI: Playbook ─────────────────────────────────────────────────────────

export function useGeneratePlaybook() {
  return useMutation({
    mutationFn: ({ findingId, scriptType = "terraform" }: { findingId: string; scriptType?: string }) =>
      api.post(`/ai/findings/${findingId}/playbook`, { script_type: scriptType }, { jsonApi: false }),
  });
}

// ─── AI: Advisor chat ─────────────────────────────────────────────────────

export function useAIAdvisorQuery() {
  return useMutation({
    mutationFn: ({
      question,
      provider,
      history,
    }: {
      question: string;
      provider?: string;
      history?: Array<{ role: string; content: string }>;
    }) => api.post("/ai/advisor/query", { question, provider, history }, { jsonApi: false }),
  });
}

// ─── Decision Logs ────────────────────────────────────────────────────────

export function useDecisionLogs(params?: Record<string, string>) {
  return useQuery({
    queryKey: qk.decisionLogs(params),
    queryFn: async () => {
      const finalParams = {
        "page[size]": "500",
        ...(params || {}),
      };
      const res = await api.get(`/decision-logs${buildQuery(finalParams)}`);
      return { items: unwrapList(res), meta: unwrapMeta(res) };
    },
    staleTime: 30 * 1000,
  });
}

export function useSecurityDecisions(params?: Record<string, string>) {
  return useQuery({
    queryKey: qk.securityDecisions(params),
    queryFn: async () => {
      const finalParams = {
        "page[size]": "50",
        ...(params || {}),
      };
      const res = await api.get(`/ai/decisions${buildQuery(finalParams)}`, { jsonApi: false });
      return res as { data: Array<{ type: string; id: string; attributes: Record<string, unknown> }>; meta?: Record<string, unknown> };
    },
    staleTime: 30 * 1000,
  });
}

export function useCreateJiraTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      decisionId,
      projectKey,
      issueType,
    }: {
      decisionId: string;
      projectKey?: string;
      issueType?: string;
    }) => {
      return await api.post(
        `/ai/decisions/${decisionId}/jira-ticket`,
        { project_key: projectKey, issue_type: issueType },
        { jsonApi: false }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.securityDecisions() });
    },
  });
}

// ─── HITL Reviews ─────────────────────────────────────────────────────────

export function useHITLReviews() {
  return useQuery({
    queryKey: qk.hitlReviews(),
    queryFn: async () => {
      const res = await api.get("/hitl-reviews");
      return { items: unwrapList(res), meta: unwrapMeta(res) };
    },
    staleTime: 30 * 1000,
  });
}

export function useSubmitReviewDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      decision,
      rationale,
      internalNotes,
    }: {
      decision: string;
      rationale: string;
      internalNotes?: string;
    }) =>
      api.post(
        "/review-decisions",
        jsonApiBody("review-decisions", {
          decision,
          rationale,
          internal_notes: internalNotes ?? "",
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.decisionLogs() });
      qc.invalidateQueries({ queryKey: qk.hitlReviews() });
    },
  });
}

// ─── Tenant LLM Config ────────────────────────────────────────────────────

export function useLLMConfigs() {
  return useQuery({
    queryKey: qk.llmConfigs(),
    queryFn: async () => {
      const res = await api.get("/tenant-llm-configs");
      return { items: unwrapList(res), meta: unwrapMeta(res) };
    },
  });
}

// ─── Providers ────────────────────────────────────────────────────────────

export function useProviders() {
  return useQuery({
    queryKey: qk.providers(),
    queryFn: async () => {
      const res = await api.get("/providers");
      return { items: unwrapList(res), meta: unwrapMeta(res) };
    },
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useCreateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      provider,
      uid,
      alias,
      secret,
      secret_type = "static",
    }: {
      provider: string;
      uid: string;
      alias: string;
      secret?: Record<string, unknown>;
      secret_type?: string;
    }) =>
      api.post(
        "/providers",
        jsonApiBody("providers", {
          provider,
          uid,
          alias,
          ...(secret ? { secret, secret_type } : {}),
        })
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.providers() }),
  });
}

export function useDeleteProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/providers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.providers() });
      qc.invalidateQueries({ queryKey: qk.scans() });
    },
  });
}

export function useCreateProviderSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      providerId,
      secretType = "static",
      secret,
    }: {
      providerId: string;
      secretType?: string;
      secret: Record<string, unknown>;
    }) =>
      api.post(
        "/providers/secrets",
        jsonApiBody(
          "provider-secrets",
          {
            name: `secret-${providerId.slice(0, 8)}`,
            secret_type: secretType,
            secret,
          },
          {
            provider: { data: { type: "providers", id: providerId } },
          }
        )
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.providers() }),
  });
}

// ─── Scans ────────────────────────────────────────────────────────────────

export function useScans(params?: Record<string, string>) {
  return useQuery({
    queryKey: qk.scans(params),
    queryFn: async () => {
      const res = await api.get(`/scans${buildQuery(params)}`);
      return { items: unwrapList(res), meta: unwrapMeta(res) };
    },
    staleTime: 2 * 1000,
    refetchInterval: 4 * 1000, // fast live refresh for running scans
  });
}

export function useLaunchScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, name }: { providerId: string; name?: string; checks?: string[] }) =>
      api.post("/scans", {
        data: {
          type: "scans",
          attributes: {
            name: name || "Multi-Cloud Security Assessment",
          },
          relationships: {
            provider: {
              data: {
                type: "providers",
                id: providerId,
              },
            },
          },
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.scans() }),
  });
}

// ─── Users & Roles ────────────────────────────────────────────────────────

export function useUsers() {
  return useQuery({
    queryKey: qk.users(),
    queryFn: async () => {
      const res = await api.get("/users");
      return { items: unwrapList(res), meta: unwrapMeta(res) };
    },
    staleTime: 60 * 1000,
  });
}

export function useRoles() {
  return useQuery({
    queryKey: qk.roles(),
    queryFn: async () => {
      const res = await api.get("/roles");
      return { items: unwrapList(res), meta: unwrapMeta(res) };
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Integrations ─────────────────────────────────────────────────────────

export function useIntegrations() {
  return useQuery({
    queryKey: qk.integrations(),
    queryFn: async () => {
      const res = await api.get("/integrations");
      return { items: unwrapList(res), meta: unwrapMeta(res) };
    },
    staleTime: 60 * 1000,
  });
}

// ─── API Keys ─────────────────────────────────────────────────────────────

export function useAPIKeys() {
  return useQuery({
    queryKey: qk.apiKeys(),
    queryFn: async () => {
      const res = await api.get("/api-keys");
      return { items: unwrapList(res), meta: unwrapMeta(res) };
    },
    staleTime: 60 * 1000,
  });
}

// ─── Attack Paths ─────────────────────────────────────────────────────────

export function useAttackPaths() {
  return useQuery({
    queryKey: qk.attackPaths(),
    queryFn: async () => {
      const res = await api.get("/attack-paths-scans");
      return { items: unwrapList(res), meta: unwrapMeta(res) };
    },
    staleTime: 60 * 1000,
  });
}


// ─── Human-In-The-Loop (HITL) Playbooks & Execution ────────────────────────

export function useRemediationPlaybooks(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["remediation-playbooks", params ?? {}],
    queryFn: async () => {
      const finalParams = {
        "page[size]": "500",
        ...(params || {}),
      };
      const res = await api.get(`/remediation-playbooks${buildQuery(finalParams)}`);
      return { items: unwrapList(res), meta: unwrapMeta(res) };
    },
    staleTime: 10 * 1000,
  });
}

export function useApprovePlaybook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      return await api.post(`/remediation-playbooks/${id}/approve`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["remediation-playbooks"] });
      queryClient.invalidateQueries({ queryKey: qk.decisionLogs() });
    },
  });
}

export function useRejectPlaybook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      return await api.post(`/remediation-playbooks/${id}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["remediation-playbooks"] });
      queryClient.invalidateQueries({ queryKey: qk.decisionLogs() });
    },
  });
}

export function useExecutePlaybook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      return await api.post(`/remediation-playbooks/${id}/execute`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["remediation-playbooks"] });
      queryClient.invalidateQueries({ queryKey: qk.findings() });
      queryClient.invalidateQueries({ queryKey: qk.decisionLogs() });
    },
  });
}

// ─── Jira Cloud Integration & Remediation Orchestration ────────────────────

export interface JiraConfig {
  id?: string;
  connected: boolean;
  base_url: string;
  email: string;
  has_api_token: boolean;
  default_project: string;
  default_issue_type: string;
  default_priority: string;
  default_labels: string[];
  last_sync: string | null;
  connection_health: string;
}

export function useJiraConfig() {
  return useQuery({
    queryKey: qk.jiraConfig(),
    queryFn: async () => {
      const res = await api.get("/jira/config", { jsonApi: false });
      return res as JiraConfig;
    },
    staleTime: 30 * 1000,
  });
}

export function useSaveJiraConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      base_url: string;
      email: string;
      api_token?: string;
      default_project?: string;
      default_issue_type?: string;
      default_priority?: string;
      default_labels?: string[];
    }) => {
      return await api.post("/jira/config", payload, { jsonApi: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.jiraConfig() });
      queryClient.invalidateQueries({ queryKey: qk.integrations() });
    },
  });
}

export function useTestJiraConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload?: {
      base_url?: string;
      email?: string;
      api_token?: string;
    }) => {
      return await api.post("/jira/test-connection", payload ?? {}, { jsonApi: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.jiraConfig() });
    },
  });
}

export function useJiraProjects() {
  return useQuery({
    queryKey: qk.jiraProjects(),
    queryFn: async () => {
      const res = await api.get("/jira/projects", { jsonApi: false });
      return res as { items: Array<{ id: string; key: string; name: string; avatar_url?: string; lead?: string }>; count: number };
    },
    staleTime: 60 * 1000,
  });
}

export function useJiraIssueTypes(projectKey?: string) {
  return useQuery({
    queryKey: qk.jiraIssueTypes(projectKey ?? ""),
    queryFn: async () => {
      if (!projectKey) return { items: [], count: 0 };
      const res = await api.get(`/jira/projects/${encodeURIComponent(projectKey)}/issue-types`, { jsonApi: false });
      return res as { items: Array<{ id: string; name: string; description: string; subtask: boolean; icon_url?: string }>; count: number };
    },
    enabled: Boolean(projectKey),
    staleTime: 60 * 1000,
  });
}

export function useJiraAssignees(projectKey?: string, query: string = "") {
  return useQuery({
    queryKey: qk.jiraAssignees(projectKey ?? "", query),
    queryFn: async () => {
      if (!projectKey) return { items: [], count: 0 };
      const q = query ? `?query=${encodeURIComponent(query)}` : "";
      const res = await api.get(`/jira/projects/${encodeURIComponent(projectKey)}/assignees${q}`, { jsonApi: false });
      return res as { items: Array<{ account_id: string; display_name: string; email_address?: string; avatar_url?: string; active?: boolean }>; count: number };
    },
    enabled: Boolean(projectKey),
    staleTime: 30 * 1000,
  });
}

export function useJiraPriorities() {
  return useQuery({
    queryKey: qk.jiraPriorities(),
    queryFn: async () => {
      const res = await api.get("/jira/priorities", { jsonApi: false });
      return res as { items: Array<{ id: string; name: string; description?: string; icon_url?: string }>; count: number };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface RemediationExecutionRecord {
  id: string;
  finding_id?: string;
  decision?: string;
  playbook?: string;
  issue_key: string;
  issue_url: string;
  issue_id?: string;
  project_key: string;
  summary: string;
  description?: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | string;
  jira_status: string;
  jira_status_category: string;
  priority: string;
  assignee_name?: string;
  assignee_email?: string;
  assignee_account_id?: string;
  labels: string[];
  ai_payload?: Record<string, unknown>;
  timeline: Array<{
    stage: string;
    timestamp: string;
    title: string;
    description: string;
    actor: string;
    status: string;
  }>;
  error_message?: string;
  last_synced_at?: string;
  inserted_at: string;
  updated_at: string;
}

export function useRemediationExecutions(statusFilter?: string) {
  return useQuery({
    queryKey: qk.remediationExecutions(statusFilter),
    queryFn: async () => {
      const param = statusFilter && statusFilter !== "All" ? `?status=${encodeURIComponent(statusFilter.toUpperCase())}` : "";
      const res = await api.get(`/remediations/executions${param}`, { jsonApi: false });
      // Handles both JSON:API unwrapping and raw DRF response
      const list = Array.isArray(res) ? res : ((res as any)?.results || (res as any)?.items || (res as any)?.data || []);
      return list as RemediationExecutionRecord[];
    },
    staleTime: 15 * 1000,
  });
}

export function useRemediationExecution(id: string) {
  return useQuery({
    queryKey: qk.remediationExecution(id),
    queryFn: async () => {
      const res = await api.get(`/remediations/executions/${id}`, { jsonApi: false });
      return res as RemediationExecutionRecord;
    },
    enabled: Boolean(id),
    staleTime: 15 * 1000,
  });
}

export function useCreateJiraRemediationTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      finding_id?: string;
      decision_id?: string;
      playbook_id?: string;
      project_key: string;
      summary: string;
      issue_type?: string;
      priority?: string;
      assignee_account_id?: string;
      assignee_name?: string;
      assignee_email?: string;
      labels?: string[];
      finding_title?: string;
      check_id?: string;
      provider?: string;
      region?: string;
      resource_uid?: string;
      resource_name?: string;
      severity?: string;
      risk_score?: number;
      risk_summary?: string;
      compliance_rules?: any[];
      recommended_fix?: string;
      code_snippet?: string;
      cli_command?: string;
      console_steps?: string;
      ai_reasoning?: string;
      evidence?: string;
      validation_steps?: string[];
    }) => {
      return await api.post("/remediations/executions/create-ticket", payload, { jsonApi: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.remediationExecutions() });
      queryClient.invalidateQueries({ queryKey: qk.remediationMetrics() });
      queryClient.invalidateQueries({ queryKey: ["remediation-playbooks"] });
      queryClient.invalidateQueries({ queryKey: qk.securityDecisions() });
    },
  });
}

export function useSyncJiraExecutionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return await api.post(`/remediations/executions/${id}/sync`, {}, { jsonApi: false });
    },
    onSuccess: (data: any, id: string) => {
      queryClient.invalidateQueries({ queryKey: qk.remediationExecutions() });
      queryClient.invalidateQueries({ queryKey: qk.remediationExecution(id) });
      queryClient.invalidateQueries({ queryKey: qk.remediationMetrics() });
    },
  });
}

export interface RemediationMetrics {
  tickets_created: number;
  pending_approval: number;
  in_progress: number;
  resolved: number;
  failed: number;
  recent_activity: Array<{
    id: string;
    issue_key: string;
    summary: string;
    status: string;
    jira_status: string;
    assignee: string;
    priority: string;
    timestamp: string;
    issue_url?: string;
  }>;
}

export function useRemediationMetrics() {
  return useQuery({
    queryKey: qk.remediationMetrics(),
    queryFn: async () => {
      const res = await api.get("/remediations/metrics", { jsonApi: false });
      return res as RemediationMetrics;
    },
    staleTime: 15 * 1000,
  });
}


