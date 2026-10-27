/**
 * CIS Oracle SaaS assessment API client (/api/v1/oracle-cis).
 * Like nca-api, failures are thrown, never turned into empty data, so an unreachable API is never shown as "no findings".
 */
import { getAuthToken, refreshAccessToken } from "@/lib/api-client";
import type { ConnectionsView, ControlMeta, Health, IdentityPage, JiraTicketInfo, RemediationInfo, RunDetail, RunSummary } from "./types";

const BASE = (import.meta.env.VITE_API_BASE_URL || "/api/v1") + "/oracle-cis";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function raw(path: string, init: RequestInit = {}): Promise<Response> {
  const doFetch = (token: string | null) => {
    const headers = new Headers(init.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return fetch(`${BASE}${path}`, { ...init, headers, credentials: "include" });
  };
  let res = await doFetch(getAuthToken());
  if (res.status === 401) {
    const fresh = await refreshAccessToken();
    if (fresh) res = await doFetch(fresh);
  }
  return res;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await raw(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      (data && (data.detail || data.errors?.[0]?.detail || Object.values(data).flat().join(" "))) || `Request failed (${res.status})`;
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data as T;
}

const q = (reveal: boolean) => (reveal ? "?reveal=true" : "");

export const api = {
  latest: (reveal: boolean) => request<RunDetail>("GET", `/runs/latest${q(reveal)}`),
  run: (id: number, reveal: boolean) => request<RunDetail>("GET", `/runs/${id}${q(reveal)}`),
  runs: () => request<RunSummary[]>("GET", "/runs"),
  startRun: () => request<{ id: number }>("POST", "/runs", {}),
  compare: (a: number, b: number) =>
    request<{ changed: { control_id: string; title: string; severity: string; a: string | null; b: string | null }[] }>(
      "GET",
      `/runs/compare?a=${a}&b=${b}`,
    ),
  connections: () => request<ConnectionsView>("GET", "/connection"),
  saveConnections: (body: Record<string, string | boolean>) => request<ConnectionsView>("PUT", "/connection", body),
  testConnection: (target: "idcs" | "fusion") => request<{ ok: boolean; message: string }>("POST", "/connection/test", { target }),
  controls: () => request<{ severity_label: string; controls: ControlMeta[] }>("GET", "/controls"),
  health: (reveal: boolean) => request<Health>("GET", `/health${q(reveal)}`),
  identities: (params: Record<string, string | number | boolean | undefined>) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && v !== false && qs.set(k, String(v)));
    return request<IdentityPage>("GET", `/identities?${qs}`);
  },
  remediate: (id: number, body: { action: string; role_code?: string; execute?: boolean; confirm?: string }) =>
    request<RemediationInfo>("POST", `/identities/${id}/remediate`, body),
  createTicket: (id: number, priority?: string) => request<JiraTicketInfo>("POST", `/identities/${id}/jira`, { priority }),
  refreshTicket: (id: number) => request<JiraTicketInfo>("POST", `/jira/${id}/refresh`, {}),

  /** Authenticated download of a run export (the API needs the Bearer token, so a plain link would not work). */
  async download(id: number, fmt: "csv" | "json", reveal: boolean) {
    const res = await raw(`/runs/${id}/export.${fmt}${q(reveal)}`);
    if (!res.ok) throw new ApiError(res.status, `Export failed (${res.status})`);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `cis-oracle-saas-run-${id}.${fmt}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
