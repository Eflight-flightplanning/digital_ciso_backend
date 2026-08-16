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
  decisionLogs: () => ["decision-logs"] as const,
  hitlReviews: () => ["hitl-reviews"] as const,
  llmConfigs: () => ["tenant-llm-configs"] as const,
  integrations: () => ["integrations"] as const,
  apiKeys: () => ["api-keys"] as const,
  attackPaths: () => ["attack-paths-scans"] as const,
  currentUser: () => ["users", "me"] as const,
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
      const defaultDate = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
      const finalParams = {
        "filter[inserted_at.gte]": defaultDate,
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
    mutationFn: ({ question, provider }: { question: string; provider?: string }) =>
      api.post("/ai/advisor/query", { question, provider }, { jsonApi: false }),
  });
}

// ─── Decision Logs ────────────────────────────────────────────────────────

export function useDecisionLogs() {
  return useQuery({
    queryKey: qk.decisionLogs(),
    queryFn: async () => {
      const res = await api.get("/decision-logs");
      return { items: unwrapList(res), meta: unwrapMeta(res) };
    },
    staleTime: 30 * 1000,
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
    staleTime: 60 * 1000,
  });
}

export function useCreateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      provider,
      uid,
      alias,
    }: {
      provider: string;
      uid: string;
      alias: string;
    }) =>
      api.post("/providers", jsonApiBody("providers", { provider, uid, alias })),
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
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000, // auto-refresh for running scans
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

// ─── Resources ────────────────────────────────────────────────────────────

export function useResources(params?: Record<string, string>) {
  return useQuery({
    queryKey: qk.resources(params),
    queryFn: async () => {
      const defaultDate = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
      const finalParams = {
        "filter[updated_at.gte]": defaultDate,
        ...(params || {}),
      };
      const res = await api.get(`/resources${buildQuery(finalParams)}`);
      return { items: unwrapList(res), meta: unwrapMeta(res) };
    },
    staleTime: 2 * 60 * 1000,
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
      const qs = buildQuery(params);
      const res = await api.get(`/remediation-playbooks${qs}`);
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

