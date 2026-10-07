/**
 * Digital CISO — Centralized API Client
 *
 * Connects the TanStack Start frontend to the Django 5.1 backend API.
 * Supports SimpleJWT bearer auth (in-memory access token + HttpOnly refresh cookie), dual JSON/JSON:API unwrapping, and automatic headers.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

import { authStore } from "@/lib/auth";

/** Access token lives in memory only (see lib/auth.ts); the refresh token is an HttpOnly cookie. */
export function getAuthToken(): string | null {
  return authStore.getState().token;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Restore the session from the refresh cookie after a page reload before the first call.
  await authStore.init();
  const token = getAuthToken();
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${API_BASE}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type")) {
    const isJsonApi = typeof options.body === "string" && options.body.includes('"data":{');
    headers.set(
      "Content-Type",
      isJsonApi ? "application/vnd.api+json" : "application/json"
    );
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/vnd.api+json, application/json, */*");
  }
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (err: any) {
    const isGet = (options.method || "GET").toUpperCase() === "GET";
    if (isGet) {
      return { data: [], items: [], meta: {} } as unknown as T;
    }
    throw new Error(err?.message || "Network connection failed");
  }

  // Automatic token refresh on 401 Unauthorized (refresh token travels as an HttpOnly cookie)
  if (response.status === 401 && !headers.has("X-Retried")) {
    const freshToken = await authStore.refresh();
    if (freshToken) {
      headers.set("Authorization", `Bearer ${freshToken}`);
      headers.set("X-Retried", "1");
      try {
        response = await fetch(url, { ...options, headers });
      } catch {
        // Fall through to the error handling below
      }
    }

    if (response.status === 401) {
      await authStore.signOut();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/sign-in")) {
        window.location.href = "/sign-in";
      }
      return { data: [], items: [], meta: {} } as unknown as T;
    }
  }

  if (!response.ok) {
    // For GET queries, fail gracefully with empty data
    const isGet = (options.method || "GET").toUpperCase() === "GET";
    if (isGet) {
      return { data: [], items: [], meta: {} } as unknown as T;
    }

    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      errorData = { detail: response.statusText };
    }

    const errorMessage =
      errorData?.errors?.[0]?.detail ||
      errorData?.detail ||
      errorData?.message ||
      `HTTP Error ${response.status}: ${response.statusText}`;

    throw new Error(errorMessage);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("text/html")) {
    return (await response.text()) as unknown as T;
  }

  return await response.json();
}

export const api = {
  get: <T = any>(endpoint: string, options?: RequestInit & Record<string, any>) =>
    apiRequest<T>(endpoint, { ...options, method: "GET" }),
  post: <T = any>(endpoint: string, body?: any, options?: RequestInit & Record<string, any>) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T = any>(endpoint: string, body?: any, options?: RequestInit & Record<string, any>) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),
  put: <T = any>(endpoint: string, body?: any, options?: RequestInit & Record<string, any>) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T = any>(endpoint: string, options?: RequestInit & Record<string, any>) =>
    apiRequest<T>(endpoint, { ...options, method: "DELETE" }),
};

export function jsonApiBody(type: string, attributes: Record<string, any>, relationships?: Record<string, any>, id?: string) {
  return {
    data: {
      type,
      ...(id ? { id } : {}),
      attributes,
      ...(relationships ? { relationships } : {}),
    },
  };
}

export function unwrapList<T = any>(res: any): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (res.data && Array.isArray(res.data)) {
    return res.data.map((item: any) => {
      const rels: Record<string, any> = {};
      if (item.relationships) {
        for (const [key, val] of Object.entries(item.relationships as Record<string, any>)) {
          if (val && val.data) {
            rels[`${key}_id`] = val.data.id;
            rels[`${key}_type`] = val.data.type;
          }
        }
      }
      return {
        id: item.id,
        ...item.attributes,
        ...rels,
        ...item,
      };
    });
  }
  if (res.results && Array.isArray(res.results)) return res.results;
  return [];
}

export function unwrapSingle<T = any>(res: any): T {
  if (!res) return {} as T;
  if (res.data && res.data.attributes) {
    const rels: Record<string, any> = {};
    if (res.data.relationships) {
      for (const [key, val] of Object.entries(res.data.relationships as Record<string, any>)) {
        if (val && val.data) {
          rels[`${key}_id`] = val.data.id;
          rels[`${key}_type`] = val.data.type;
        }
      }
    }
    return {
      id: res.data.id,
      ...res.data.attributes,
      ...rels,
      ...res.data,
    } as T;
  }
  return res as T;
}

export function unwrapMeta(res: any): Record<string, any> {
  return res?.meta || {};
}

// ─────────────────────────────────────────────────────────────
// Tenant Modularity & Subscriptions Client
// ─────────────────────────────────────────────────────────────

export interface CloudSubscription {
  id: string;
  provider_type: string;
  is_active: boolean;
  inserted_at?: string;
  updated_at?: string;
}

export interface ComplianceSubscription {
  id: string;
  framework_id: string;
  framework_name: string;
  provider_type?: string | null;
  is_active: boolean;
  inserted_at?: string;
  updated_at?: string;
}

export interface AvailableCloud {
  id: string;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  category: string;
  popular?: boolean;
  is_subscribed?: boolean;
}

export interface AvailableCompliance {
  id: string;
  name: string;
  provider: string;
  providerName: string;
  category: string;
  version: string;
  description: string;
  is_subscribed?: boolean;
}

export interface SubscriptionChangeRequest {
  id: string;
  request_type: "add_cloud" | "remove_cloud" | "add_compliance" | "remove_compliance";
  target_value: string;
  target_display_name?: string;
  status: "pending" | "approved" | "rejected";
  requested_by?: string;
  requested_by_email?: string;
  reviewed_by?: string;
  reviewed_by_email?: string;
  reviewed_at?: string;
  review_notes?: string;
  inserted_at: string;
}

export const subscriptionsApi = {
  getClouds: () => api.get<{ data: CloudSubscription[] }>("/subscriptions/clouds"),
  getCompliances: () => api.get<{ data: ComplianceSubscription[] }>("/subscriptions/compliances"),
  getAvailableClouds: () => api.get<{ data: AvailableCloud[] }>("/subscriptions/available-clouds"),
  getAvailableCompliances: (provider?: string) =>
    api.get<{ data: AvailableCompliance[] }>(
      provider
        ? `/subscriptions/available-compliances?provider=${encodeURIComponent(provider)}`
        : "/subscriptions/available-compliances"
    ),
  saveOnboarding: (data: { cloud_providers: string[]; compliance_frameworks: string[] }) =>
    api.post("/subscriptions/onboarding", data),
  getChangeRequests: () =>
    api.get<any>("/subscriptions/change-requests"),
  createChangeRequest: (data: {
    request_type: string;
    target_value: string;
    target_display_name?: string;
  }) => api.post("/subscriptions/change-requests", data),
  reviewChangeRequest: (
    id: string,
    data: { status: "approved" | "rejected"; review_notes?: string }
  ) => api.patch(`/subscriptions/change-requests/${id}/review`, data),
};
