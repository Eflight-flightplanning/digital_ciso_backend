import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandLockup } from "@/components/oracle-cis/icons";
import { OracleCisTab } from "@/components/oracle-cis/OracleCisTab";
import { apiRequest, getAuthToken, refreshAccessToken, setAuthToken } from "@/lib/api-client";

/**
 * The CIS Oracle SaaS assessment full-screen, without the platform sidebar: opened in a new browser tab from the
 * Oracle SaaS page. Same sign-in guard as AppShell (the access token is restored from the refresh cookie).
 */
export const Route = createFileRoute("/oracle-saas-cis")({
  component: OracleSaasCisPage,
});

function useSessionGuard() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const deny = () => {
      setAuthToken(null);
      if (!cancelled) navigate({ to: "/sign-in" });
    };
    (async () => {
      const token = getAuthToken() || (await refreshAccessToken());
      if (!token) return deny();
      const res = await apiRequest<any>("/users/me", { method: "GET" });
      if (cancelled) return;
      const attrs = res?.data?.attributes ?? res?.attributes ?? res;
      if (!res?.data?.id && !attrs?.email) return deny();
      setReady(true);
    })().catch(deny);
    return () => {
      cancelled = true;
    };
  }, [navigate]);
  return ready;
}

/** The platform's theme (dark unless "light" was saved), with its own toggle since there is no AppShell here. */
function useTheme() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const isDark = (localStorage.getItem("theme") || localStorage.getItem("dciso-theme")) !== "light";
    setDark(isDark);
    document.documentElement.classList.toggle("light", !isDark);
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("light", !next);
    localStorage.setItem("theme", next ? "dark" : "light");
    localStorage.setItem("dciso-theme", next ? "dark" : "light");
  };
  return { dark, toggle };
}

function OracleSaasCisPage() {
  const ready = useSessionGuard();
  const { dark, toggle } = useTheme();
  if (!ready) return null;
  return (
    <div className="ocis min-h-screen">
      <header className="no-print flex items-center justify-between gap-3 border-b border-oc-line bg-oc-card px-4 py-2.5">
        <BrandLockup compact />
        <div className="flex items-center gap-2">
          <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-oc-ink-soft hover:text-oc-ink">
            <ArrowLeft className="h-4 w-4" /> Digital CISO platform
          </Link>
          <button
            type="button"
            onClick={toggle}
            className="rounded-md border border-oc-line p-1.5 text-oc-ink-soft hover:text-oc-ink"
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>
      <OracleCisTab fullPage />
    </div>
  );
}
