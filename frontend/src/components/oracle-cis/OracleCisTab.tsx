/**
 * "CIS Assessment" tab of the Oracle SaaS page: the CIS Oracle SaaS Cloud Applications Benchmark v1.0.0 assessment
 * (identity domain + Fusion pod), in the standalone Oracle SaaS CIS dashboard's theme.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import Connection from "./Connection";
import { SessionProvider, useSession, type Page } from "./context";
import History from "./History";
import { ArrowIcon, LockIcon } from "./icons";
import Identities from "./Identities";
import Overview from "./Overview";
import Report from "./Report";
import Setup from "./Setup";

const NAV: { page: Page; label: string }[] = [
  { page: "overview", label: "Overview" },
  { page: "identities", label: "Identity risks" },
  { page: "history", label: "History" },
  { page: "report", label: "Report" },
  { page: "connection", label: "Connection" },
  { page: "setup", label: "Settings" },
];

function RevealToggle() {
  const { perms, reveal, setReveal } = useSession();
  if (!perms.manage_providers) return null;
  const toggle = () => {
    if (!reveal && !window.confirm("Show real usernames and IP addresses on screen and in exports? Make sure nobody else can see your screen.")) return;
    setReveal(!reveal);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={reveal}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
        reveal ? "border-[var(--chip-fail-line)] bg-[var(--chip-fail-bg)] text-[var(--chip-fail-ink)]" : "border-oc-line text-oc-ink-soft hover:text-oc-ink"
      }`}
      title="Reveal sensitive values (needs the manage providers permission)"
    >
      <LockIcon />
      {reveal ? "Sensitive values shown" : "Reveal sensitive values"}
    </button>
  );
}

function Body({ fullPage }: { fullPage: boolean }) {
  const { page, go } = useSession();
  return (
    <>
      <div className="no-print border-b border-oc-line bg-oc-card">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4">
          <nav className="flex flex-1 flex-wrap items-stretch gap-1 self-stretch" aria-label="CIS assessment">
            {NAV.map((n) => (
              <button
                key={n.page}
                type="button"
                onClick={() => go(n.page)}
                aria-current={page === n.page ? "page" : undefined}
                className={`flex items-center border-b-2 px-2.5 py-2.5 text-sm font-medium ${
                  page === n.page ? "border-[var(--oc-red)] text-oc-ink" : "border-transparent text-oc-ink-soft hover:text-oc-ink"
                }`}
              >
                {n.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2 py-2">
            <RevealToggle />
            {!fullPage && (
              <a
                href="/oracle-saas-cis"
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 rounded-md border border-oc-line px-2.5 py-1.5 text-xs font-medium text-oc-ink-soft hover:text-oc-ink"
                title="Open this dashboard full-screen in a new browser tab"
              >
                Open in new tab <ArrowIcon width={12} height={12} />
              </a>
            )}
          </div>
        </div>
      </div>
      {page === "overview" && <Overview />}
      {page === "identities" && <Identities />}
      {page === "history" && <History />}
      {page === "report" && <Report />}
      {page === "connection" && <Connection />}
      {page === "setup" && <Setup />}
    </>
  );
}

export function OracleCisTab({ fullPage = false }: { fullPage?: boolean }) {
  // Health also reports what the signed-in user may do (platform RBAC).
  const health = useQuery({ queryKey: ["oracle-cis", "health", false], queryFn: () => api.health(false), staleTime: 60_000 });
  return (
    <div className={fullPage ? "ocis" : "ocis overflow-hidden rounded-md border border-oc-line"}>
      <SessionProvider perms={health.data?.permissions}>
        <Body fullPage={fullPage} />
      </SessionProvider>
    </div>
  );
}
