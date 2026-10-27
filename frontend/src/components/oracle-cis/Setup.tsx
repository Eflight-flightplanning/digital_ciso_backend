import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { CrossIcon, DashIcon, TickIcon } from "./icons";
import { useSession } from "./context";

export default function Settings() {
  const { reveal, go } = useSession();
  const health = useQuery({ queryKey: ["oracle-cis", "health", reveal], queryFn: () => api.health(reveal) });
  const h = health.data;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-5">
      <div>
        <h1 className="text-xl">Configuration</h1>
        <p className="mt-2 max-w-[720px] text-sm text-oc-ink-soft">
          Read-only overview. Change the identity domain and Fusion pod details on the{" "}
          <button type="button" className="text-link" onClick={() => go("connection")}>Connection</button> page.
        </p>
      </div>
      {health.error && <p className="font-semibold text-oc-red">{(health.error as Error).message}</p>}
      {h && (
        <>
          <section className="card p-4">
            <h2 className="text-sm">Identity domain connection</h2>
            <p className="mt-1 text-sm text-oc-ink-soft">Tenant: <span className="font-semibold text-oc-ink">{h.tenant}</span></p>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {Object.entries(h.idcs).map(([name, ok]) => (
                <li key={name} className="flex items-center gap-2">
                  <span className={`chip ${ok ? "chip-PASS" : "chip-FAIL"}`}>
                    {ok ? <TickIcon /> : <CrossIcon />}
                    {ok ? "Configured" : "Missing"}
                  </span>
                  <span className="font-mono">{name}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-4">
            <h2 className="text-sm">Fusion pod (dormant accounts)</h2>
            <p className="mt-1 text-sm text-oc-ink-soft">
              Used by 1.13 and 1.14 to run the Fusion Inactive Users Report (ESS), and by 4.1.3, 4.3, 5.1.2 and 5.3.7 for role
              assignments. Without it, 1.13 and 1.14 use the identity domain's last sign-in date.
            </p>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {Object.entries(h.fusion).map(([name, ok]) => (
                <li key={name} className="flex items-center gap-2">
                  <span className={`chip ${ok ? "chip-PASS" : "chip-NA"}`}>
                    {ok ? <TickIcon /> : <DashIcon />}
                    {ok ? "Configured" : "Not set"}
                  </span>
                  <span className="font-mono">{name}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-4">
            <h2 className="text-sm">Password policy and MFA checks (1.1 and 1.2)</h2>
            <p className="mt-1 text-sm text-oc-ink-soft">
              Runs this platform's Prowler OCI identity checks for MFA, password length and password expiry on the identity
              domain data; CIS history and lockout are added on top. If Prowler is unavailable, the built-in checks (same rules) are used.
            </p>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {Object.entries(h.check_engine).map(([name, ok]) => (
                <li key={name} className="flex items-center gap-2">
                  <span className={`chip ${ok ? "chip-PASS" : "chip-NA"}`}>
                    {ok ? <TickIcon /> : <DashIcon />}
                    {ok ? "Configured" : "Not set"}
                  </span>
                  <span className="font-mono">{name}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-4">
            <h2 className="text-sm">Jira and remediation (Identity risks)</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {Object.entries(h.jira).map(([name, ok]) => (
                <li key={name} className="flex items-center gap-2">
                  <span className={`chip ${ok ? "chip-PASS" : "chip-NA"}`}>
                    {ok ? <TickIcon /> : <DashIcon />}
                    {ok ? "Configured" : "Not set"}
                  </span>
                  <span className="font-mono">{name}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              Remediation mode:{" "}
              <span className="font-semibold">
                {h.remediation_live ? "live (requests are sent to the Fusion pod after typed confirmation)" : "staged (requests are recorded, not sent)"}
              </span>
              . Change with ORACLE_CIS_REMEDIATION_LIVE in the server environment.
            </p>
          </section>

          <section className="card p-4">
            <h2 className="text-sm">Your permissions</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {[
                ["manage_scans", "Run assessments"],
                ["manage_providers", "Change the connection, reveal usernames, remediate accounts"],
                ["manage_integrations", "Raise Jira tickets"],
              ].map(([key, label]) => {
                const ok = h.permissions[key as keyof typeof h.permissions];
                return (
                  <li key={key} className="flex items-center gap-2">
                    <span className={`chip ${ok ? "chip-PASS" : "chip-NA"}`}>
                      {ok ? <TickIcon /> : <DashIcon />}
                      {ok ? "Allowed" : "Not allowed"}
                    </span>
                    <span>{label}</span>
                    <span className="font-mono text-xs text-oc-ink-soft">{key}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card p-4">
            <h2 className="text-sm">Excluded monitoring accounts</h2>
            <p className="mt-1 text-sm text-oc-ink-soft">EXCLUDE_ACTORS: left out of sign-in event and dormancy findings.</p>
            {h.excluded_actors.length ? (
              <ul className="mt-3 flex flex-wrap gap-2">{h.excluded_actors.map((a) => <li key={a} className="badge font-mono">{a}</li>)}</ul>
            ) : (
              <p className="mt-3 text-sm">None configured.</p>
            )}
          </section>

          <section className="card p-4">
            <h2 className="text-sm">Assessment settings</h2>
            <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
              {Object.entries(h.settings).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-oc-line py-1.5">
                  <dt className="font-mono text-xs text-oc-ink-soft">{k}</dt>
                  <dd className="font-semibold">{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card p-4">
            <h2 className="text-sm">Checks</h2>
            <p className="mt-2 text-sm">
              {h.checks.total} CIS recommendations: {h.checks.automated} fully automated, {h.checks.partial} partly automated,{" "}
              {h.checks.manual_only} manual controls (checked by the assessor).
            </p>
            <p className="mt-2 text-xs text-oc-ink-soft">Severity: {h.severity_label}. Edit backend/oracle_cis/severity.json to change it.</p>
          </section>
        </>
      )}
    </div>
  );
}
