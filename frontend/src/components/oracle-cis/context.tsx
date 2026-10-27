import { createContext, useContext, useState, type ReactNode } from "react";
import type { Health, IdentityKind } from "./types";

export type Page = "overview" | "identities" | "history" | "report" | "connection" | "setup";

interface SessionValue {
  /** Platform RBAC as reported by the API: manage_scans, manage_providers, manage_integrations. */
  perms: Health["permissions"];
  reveal: boolean;
  setReveal: (v: boolean) => void;
  page: Page;
  reportRun: number | null;
  go: (page: Page, reportRun?: number | null) => void;
  /** Which list Identity risks shows (dormant, active, ghost); the banners set it. */
  identityKind: IdentityKind;
  showIdentities: (kind: IdentityKind) => void;
}

const NO_PERMS: Health["permissions"] = { manage_scans: false, manage_providers: false, manage_integrations: false };
const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ perms, children }: { perms?: Health["permissions"]; children: ReactNode }) {
  const [reveal, setReveal] = useState(false);
  const [page, setPage] = useState<Page>("overview");
  const [reportRun, setReportRun] = useState<number | null>(null);
  const [identityKind, setIdentityKind] = useState<IdentityKind>("dormant");
  const p = perms ?? NO_PERMS;

  return (
    <SessionContext.Provider
      value={{
        perms: p,
        reveal: reveal && p.manage_providers,
        setReveal,
        page,
        reportRun,
        go: (next, run = null) => {
          setPage(next);
          setReportRun(run);
        },
        identityKind,
        showIdentities: (kind) => {
          setIdentityKind(kind);
          setPage("identities");
        },
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
