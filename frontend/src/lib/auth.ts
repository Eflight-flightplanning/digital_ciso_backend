/**
 * Digital CISO — Live Authentication Client
 *
 * Integrated directly with Django SimpleJWT tokens & User API.
 *
 * Token storage model (nothing auth-related is ever written to localStorage):
 *   - access token  -> JS memory only (lost on reload, ~15 min lifetime)
 *   - refresh token -> HttpOnly + SameSite=Strict cookie set by the API; JS cannot read it
 * On page load, init() silently exchanges the cookie for a fresh access token.
 */

export interface User {
  id: string;
  email: string;
  name?: string;
  company_name?: string;
  role?: string;
  tenant_id?: string;
  date_joined?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** True once the initial cookie-based session restore has finished (success or not). */
  isInitialized: boolean;
}

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== "undefined" && (window as any).__API_BASE__) ||
  "/api/v1";

const COOKIE_MODE_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, application/vnd.api+json",
  // Opts in to the HttpOnly-cookie refresh flow (refresh token stays out of JSON bodies).
  "X-Auth-Mode": "cookie",
};

let currentAuth: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,
};

const listeners = new Set<(state: AuthState) => void>();

function emit() {
  listeners.forEach((l) => l(currentAuth));
}

function decodeJwt(token: string): Record<string, any> {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(window.atob(base64));
  } catch {
    return {};
  }
}

async function fetchProfile(token: string, fallbackEmail?: string): Promise<User> {
  const claims = decodeJwt(token);
  let attrs: any = {};
  let id: string | undefined;
  try {
    const res = await fetch(`${API_BASE}/users/me`, {
      headers: {
        Accept: "application/vnd.api+json, application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    if (res.ok) {
      const json = await res.json();
      attrs = json?.data?.attributes || json || {};
      id = json?.data?.id;
    }
  } catch {
    /* best-effort: ignore */
  }
  const email: string = attrs.email || fallbackEmail || "";
  return {
    id: id || claims.sub || claims.user_id || "",
    email,
    name: attrs.name || (email ? email.split("@")[0] : undefined),
    company_name: attrs.company_name,
    role: claims.roles?.[0],
    tenant_id: claims.tenant_id,
    date_joined: attrs.date_joined,
  };
}

function extractError(errJson: any, fallback: string): string {
  return (
    errJson?.errors?.[0]?.detail ||
    errJson?.errors?.otp?.[0] ||
    errJson?.non_field_errors?.[0] ||
    (Array.isArray(errJson?.email) ? errJson.email[0] : null) ||
    (Array.isArray(errJson?.password) ? errJson.password[0] : null) ||
    (Array.isArray(errJson?.otp) ? errJson.otp[0] : null) ||
    errJson?.detail ||
    errJson?.message ||
    fallback
  );
}

let initPromise: Promise<boolean> | null = null;
let refreshPromise: Promise<string | null> | null = null;

export const authStore = {
  getState(): AuthState {
    return currentAuth;
  },

  subscribe(listener: (state: AuthState) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** In-memory session only. Never persisted. */
  setUser(user: User | null, token: string | null = null) {
    currentAuth = {
      user,
      token,
      isAuthenticated: !!user && !!token,
      isLoading: false,
      isInitialized: true,
    };
    emit();
  },

  /**
   * Restore the session from the HttpOnly refresh cookie. Safe to call from many
   * places; the network round-trip happens once. Resolves true when signed in.
   */
  init(): Promise<boolean> {
    if (typeof window === "undefined") return Promise.resolve(false);
    if (currentAuth.isInitialized) return Promise.resolve(currentAuth.isAuthenticated);
    if (!initPromise) {
      initPromise = (async () => {
        const token = await this.refresh();
        if (!token) {
          this.setUser(null, null);
          return false;
        }
        this.setUser(await fetchProfile(token), token);
        return true;
      })().finally(() => {
        initPromise = null;
      });
    }
    return initPromise;
  },

  /** Exchange the refresh cookie for a new access token (single-flight). */
  refresh(): Promise<string | null> {
    if (typeof window === "undefined") return Promise.resolve(null);
    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          const res = await fetch(`${API_BASE}/tokens/refresh`, {
            method: "POST",
            headers: COOKIE_MODE_HEADERS,
            credentials: "include",
            body: "{}",
          });
          if (!res.ok) return null;
          const data = await res.json();
          const token: string | undefined = (data?.data?.attributes || data?.attributes || data)
            ?.access;
          if (!token) return null;
          currentAuth = { ...currentAuth, token, isAuthenticated: !!currentAuth.user };
          emit();
          return token;
        } catch {
          return null;
        }
      })().finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  },

  async signIn(
    email: string,
    password: string,
    otp?: string,
    providedName?: string,
    providedCompany?: string
  ): Promise<{ user?: User; mfa_required?: boolean; message?: string }> {
    currentAuth = { ...currentAuth, isLoading: true };
    emit();

    try {
      const res = await fetch(`${API_BASE}/tokens`, {
        method: "POST",
        headers: COOKIE_MODE_HEADERS,
        credentials: "include",
        body: JSON.stringify({ email, password, otp: otp || "" }),
      });

      if (!res.ok) {
        let errJson: any = {};
        try {
          errJson = await res.json();
        } catch {
    /* best-effort: ignore */
  }
        throw new Error(extractError(errJson, "Invalid email or password."));
      }

      const data = await res.json();
      const attributes = data?.data?.attributes || data?.attributes || data;

      if (attributes?.mfa_required) {
        currentAuth = { ...currentAuth, isLoading: false };
        emit();
        return {
          mfa_required: true,
          message: attributes.message || `Verification code sent to ${email}.`,
        };
      }

      const accessToken: string | undefined = attributes?.access;
      if (!accessToken) {
        throw new Error("No access token returned by server.");
      }

      const user = await fetchProfile(accessToken, email);
      if (providedName) user.name = user.name || providedName;
      if (providedCompany) user.company_name = user.company_name || providedCompany;

      this.setUser(user, accessToken);
      return { user };
    } catch (err: any) {
      currentAuth = { ...currentAuth, isLoading: false };
      emit();
      throw err;
    }
  },

  async signUp(
    email: string,
    password: string,
    name: string,
    company_name: string
  ): Promise<User> {
    currentAuth = { ...currentAuth, isLoading: true };
    emit();

    // Clear any existing session before registration
    await this.signOut();

    try {
      const payload = {
        data: {
          type: "users",
          attributes: { email, password, name, company_name },
        },
      };

      const res = await fetch(`${API_BASE}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/vnd.api+json",
          Accept: "application/vnd.api+json, application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errJson: any = {};
        try {
          errJson = await res.json();
        } catch {
    /* best-effort: ignore */
  }
        throw new Error(
          extractError(errJson, "Registration failed. Please check your details.")
        );
      }

      // Automatically log the newly registered user into their own isolated tenant
      return (await this.signIn(email, password, undefined, name, company_name)).user!;
    } catch (err: any) {
      currentAuth = { ...currentAuth, isLoading: false };
      emit();
      throw err;
    }
  },

  /** Revoke the refresh token server-side (blacklist + clear cookie) and drop in-memory state. */
  async signOut() {
    this.setUser(null, null);
    if (typeof window === "undefined") return;
    try {
      await fetch(`${API_BASE}/tokens/logout`, {
        method: "POST",
        headers: COOKIE_MODE_HEADERS,
        credentials: "include",
        body: "{}",
      });
    } catch {
    /* best-effort: ignore */
  }
  },

  logout() {
    return this.signOut();
  },
};
