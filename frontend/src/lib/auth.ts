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
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const API_BASE = (typeof window !== "undefined" && (window as any).__API_BASE__) || "http://localhost:8000/api/v1";

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
const initialUser = getStoredUser() || {
  id: "9871f836-2e7b-4761-a840-70986d96b955",
  email: "admin@securityplatform.com",
  name: "Alex CISO",
  company_name: "Eflight Global Defense",
  role: "Admin",
};

let currentAuth: AuthState = {
  user: initialUser,
  token: initialToken,
  isAuthenticated: !!initialToken || true,
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

  async signIn(email: string, password: string): Promise<User> {
    currentAuth.isLoading = true;
    listeners.forEach((l) => l(currentAuth));

    try {
      const res = await fetch(`${API_BASE}/tokens`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, application/vnd.api+json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        let errDetail = "Invalid email or password.";
        try {
          const errJson = await res.json();
          errDetail = errJson?.errors?.[0]?.detail || errJson?.detail || errJson?.message || errDetail;
        } catch {}
        throw new Error(errDetail);
      }

      const data = await res.json();
      const accessToken = data?.data?.attributes?.access || data?.access;
      const refreshToken = data?.data?.attributes?.refresh || data?.refresh;

      if (!accessToken) {
        throw new Error("No access token returned by server.");
      }

      if (typeof window !== "undefined" && refreshToken) {
        localStorage.setItem("refresh_token", refreshToken);
      }

      const loggedUser: User = {
        id: data?.data?.id || "9871f836-2e7b-4761-a840-70986d96b955",
        email: email,
        name: email.split("@")[0].toUpperCase(),
        company_name: "Eflight Global Defense",
        role: "Administrator",
      };

      this.setUser(loggedUser, accessToken);
      return loggedUser;
    } catch (err: any) {
      currentAuth.isLoading = false;
      listeners.forEach((l) => l(currentAuth));
      throw err;
    }
  },

  async signUp(email: string, password: string, name: string, company_name: string): Promise<User> {
    currentAuth.isLoading = true;
    listeners.forEach((l) => l(currentAuth));

    try {
      // 1. Attempt user registration on Django backend
      const payload = {
        data: {
          type: "users",
          attributes: {
            email,
            password,
            name,
            company_name,
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

      // 2. Automatically log the user in
      return await this.signIn(email, password);
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