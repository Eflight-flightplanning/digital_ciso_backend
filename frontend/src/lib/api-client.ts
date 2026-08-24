/**
 * Digital CISO — Centralized API Client
 *
 * Connects the TanStack Start frontend to the Django 5.1 backend API.
 * Supports SimpleJWT bearer auth, dual JSON/JSON:API unwrapping, and automatic headers.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem("access_token", token);
  } else {
    localStorage.removeItem("access_token");
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
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

  // Automatic token refresh on 401 Unauthorized
  if (response.status === 401 && !(options as any)._isRetry) {
    const storedRefresh = typeof window !== "undefined" ? localStorage.getItem("refresh_token") : null;
    if (storedRefresh) {
      try {
        const tokenRes = await fetch(`${API_BASE}/tokens/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json, application/vnd.api+json" },
          body: JSON.stringify({ refresh: storedRefresh }),
        });
        if (tokenRes.ok) {
          const tokenJson = await tokenRes.json();
          const freshToken = tokenJson?.attributes?.access || tokenJson?.data?.attributes?.access || tokenJson?.access;
          if (freshToken) {
            setAuthToken(freshToken);
            headers.set("Authorization", `Bearer ${freshToken}`);
            response = await fetch(url, {
              ...options,
              headers,
              // @ts-ignore
              _isRetry: true,
            });
          }
        }
      } catch {
        // Fall through to redirect handler
      }
    }

    if (!response.ok && typeof window !== "undefined" && !window.location.pathname.startsWith("/sign-in")) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.href = "/sign-in";
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