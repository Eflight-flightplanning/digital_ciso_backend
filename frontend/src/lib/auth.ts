/**
 * Digital CISO — Live Authentication Client
 *
 * Integrated directly with Django SimpleJWT tokens & User API.
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
}

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== "undefined" && (window as any).__API_BASE__) ||
  "/api/v1";

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("auth_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const initialToken = getStoredToken();
const initialUser = getStoredUser();

let currentAuth: AuthState = {
  user: initialUser,
  token: initialToken,
  isAuthenticated: !!initialToken && !!initialUser,
  isLoading: false,
};

const listeners = new Set<(state: AuthState) => void>();

export const authStore = {
  getState(): AuthState {
    return currentAuth;
  },

  subscribe(listener: (state: AuthState) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  setUser(user: User | null, token: string | null = null) {
    currentAuth = {
      user,
      token,
      isAuthenticated: !!user && !!token,
      isLoading: false,
    };
    if (typeof window !== "undefined") {
      if (token) {
        localStorage.setItem("access_token", token);
      } else {
        localStorage.removeItem("access_token");
      }
      if (user) {
        localStorage.setItem("auth_user", JSON.stringify(user));
      } else {
        localStorage.removeItem("auth_user");
      }
    }
    listeners.forEach((l) => l(currentAuth));
  },

  async signIn(
    email: string,
    password: string,
    otp?: string,
    providedName?: string,
    providedCompany?: string
  ): Promise<{ user?: User; mfa_required?: boolean; message?: string }> {
    currentAuth.isLoading = true;
    listeners.forEach((l) => l(currentAuth));

    try {
      const res = await fetch(`${API_BASE}/tokens`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, application/vnd.api+json",
        },
        body: JSON.stringify({ email, password, otp: otp || "" }),
      });

      if (!res.ok) {
        let errDetail = "Invalid email or password.";
        try {
          const errJson = await res.json();
          errDetail =
            errJson?.errors?.[0]?.detail ||
            errJson?.errors?.otp?.[0] ||
            errJson?.non_field_errors?.[0] ||
            (Array.isArray(errJson?.email) ? errJson.email[0] : null) ||
            (Array.isArray(errJson?.password) ? errJson.password[0] : null) ||
            (Array.isArray(errJson?.otp) ? errJson.otp[0] : null) ||
            errJson?.detail ||
            errJson?.message ||
            errDetail;
        } catch {}
        throw new Error(errDetail);
      }

      const data = await res.json();
      const attributes = data?.data?.attributes || data;

      if (attributes?.mfa_required) {
        currentAuth.isLoading = false;
        listeners.forEach((l) => l(currentAuth));
        return {
          mfa_required: true,
          message: attributes.message || `Verification code sent to ${email}.`,
        };
      }

      const accessToken = attributes?.access;
      const refreshToken = attributes?.refresh;

      if (!accessToken) {
        throw new Error("No access token returned by server.");
      }

      if (typeof window !== "undefined" && refreshToken) {
        localStorage.setItem("refresh_token", refreshToken);
      }

      let tokenPayload: any = {};
      try {
        const base64Url = accessToken.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        tokenPayload = JSON.parse(window.atob(base64));
      } catch {}

      const cleanName =
        providedName ||
        tokenPayload?.name ||
        email.split("@")[0].replace(/[^a-zA-Z0-9]/g, " ");

      const user: User = {
        id: tokenPayload?.user_id || "usr_dev_101",
        name: cleanName,
        email: email,
        company_name: providedCompany || tokenPayload?.company_name || "Enterprise Security Pod",
        role: (tokenPayload?.roles && tokenPayload?.roles[0]) || "Security Administrator",
        tenant_id: tokenPayload?.tenant_id || "3e59acc5-3bdd-499e-8fd1-3e53b0a6ca47",
        date_joined: new Date().toISOString(),
      };

      this.setUser(user, accessToken);

      if (typeof window !== "undefined") {
        const initKey = `dciso_company_initialized_${user.id}`;
        const hasInitialized = localStorage.getItem(initKey);
        const existingProvisioning = localStorage.getItem("dciso_new_company_provisioning");
        if (!hasInitialized && !existingProvisioning) {
          localStorage.setItem(
            "dciso_new_company_provisioning",
            JSON.stringify({
              companyName: user.company_name || user.name || "Enterprise Workspace",
              timestamp: Date.now(),
            })
          );
        }
      }

      return { user };
    } catch (err: any) {
      currentAuth.isLoading = false;
      listeners.forEach((l) => l(currentAuth));
      throw err;
    }
  },

  async signUp(
    email: string,
    password: string,
    name: string,
    company_name: string,
    cloud_providers?: string[],
    compliance_frameworks?: string[]
  ): Promise<User> {
    currentAuth.isLoading = true;
    listeners.forEach((l) => l(currentAuth));

    // Clear any existing session before registration
    this.logout();

    try {
      // 1. Create User in Backend API with initial subscriptions
      const payload = {
        data: {
          type: "users",
          attributes: {
            email,
            password,
            name,
            company_name,
            ...(cloud_providers && cloud_providers.length > 0 ? { cloud_providers } : {}),
            ...(compliance_frameworks && compliance_frameworks.length > 0 ? { compliance_frameworks } : {}),
          },
        },
      };

      const res = await fetch(`${API_BASE}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/vnd.api+json",
          "Accept": "application/vnd.api+json, application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errDetail = "Registration failed. Please check your details.";
        try {
          const errJson = await res.json();
          if (Array.isArray(errJson?.errors) && errJson.errors.length > 0) {
            const first = errJson.errors[0];
            errDetail = first?.detail || first?.title || JSON.stringify(first);
          } else if (errJson?.errors && typeof errJson.errors === "object") {
            const values = Object.values(errJson.errors).flat();
            if (values.length > 0) errDetail = String(values[0]);
          } else if (errJson?.detail) {
            errDetail = errJson.detail;
          } else if (errJson?.message) {
            errDetail = errJson.message;
          } else if (errJson?.email) {
            errDetail = Array.isArray(errJson.email) ? errJson.email[0] : String(errJson.email);
          } else if (errJson?.password) {
            errDetail = Array.isArray(errJson.password) ? errJson.password[0] : String(errJson.password);
          }
        } catch {}
        throw new Error(errDetail);
      }

      // 2. Automatically log the newly registered user into their own isolated tenant
      if (typeof window !== "undefined") {
        localStorage.setItem(
          "dciso_new_company_provisioning",
          JSON.stringify({
            companyName: company_name || `${name.split(" ")[0]}'s Organization`,
            timestamp: Date.now(),
          })
        );
      }
      return (await this.signIn(email, password, undefined, name, company_name)).user!;
    } catch (err: any) {
      currentAuth.isLoading = false;
      listeners.forEach((l) => l(currentAuth));
      throw err;
    }
  },

  logout() {
    this.setUser(null, null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("auth_user");
    }
  },

  signOut() {
    this.logout();
  },
};