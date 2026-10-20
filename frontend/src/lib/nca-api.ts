/**
 * NCA ECC / CCC assessment API client.
 * Unlike api-client.apiRequest this never converts failures into empty data: errors are surfaced to the
 * UI so an unreachable API is never displayed as "no findings".
 */
import { getAuthToken, refreshAccessToken } from "@/lib/api-client";

const BASE = (import.meta.env.VITE_API_BASE_URL || "/api/v1") + "/nca";

export class NcaApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function raw(path: string, init: RequestInit = {}): Promise<Response> {
  const doFetch = (token: string | null) => {
    const headers = new Headers(init.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/json");
    if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(`${BASE}${path}`, { ...init, headers, credentials: "include" });
  };
  let res = await doFetch(getAuthToken());
  if (res.status === 401) {
    const fresh = await refreshAccessToken();
    if (fresh) res = await doFetch(fresh);
  }
  return res;
}

export async function ncaFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await raw(path, init);
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    throw new NcaApiError(body?.detail || body?.errors?.[0]?.detail || `HTTP ${res.status}`, res.status);
  }
  return body as T;
}

export const ncaPost = <T = any>(path: string, body: unknown) =>
  ncaFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

export async function ncaUpload<T = any>(path: string, form: FormData): Promise<T> {
  return ncaFetch<T>(path, { method: "POST", body: form });
}

/** Authenticated file download (reports / evidence). */
export async function ncaDownload(path: string, filename: string): Promise<void> {
  const res = await raw(path);
  if (!res.ok) throw new NcaApiError(`Download failed (HTTP ${res.status})`, res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const qs = (params: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : "";
};
