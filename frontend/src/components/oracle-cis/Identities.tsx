import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "./api";
import { CrossIcon, InfoIcon, WarnIcon } from "./icons";
import { fmtDate } from "./status";
import { useSession } from "./context";
import { IdentityBanners } from "./Banners";
import type { IdentityKind, IdentityRow, RemediationInfo } from "./types";

type Kind = IdentityKind;

const STATE_LABEL: Record<IdentityRow["state"], string> = {
  open: "Open",
  ticketed: "Ticket raised",
  staged: "Remediation staged",
  remediated: "Remediated",
};

function StateBadge({ row }: { row: IdentityRow }) {
  const failed = row.remediations[0]?.status === "failed";
  return (
    <span className={`badge ${row.state === "remediated" ? "!text-[var(--chip-pass-ink)]" : ""}`}>
      {failed ? "Remediation failed" : STATE_LABEL[row.state]}
    </span>
  );
}

function JiraCell({ row, configured }: { row: IdentityRow; configured: boolean }) {
  const qc = useQueryClient();
  const { perms } = useSession();
  const create = useMutation({ mutationFn: () => api.createTicket(row.id), onSuccess: () => qc.invalidateQueries({ queryKey: ["oracle-cis", "identities"] }) });
  const ticket = row.tickets[0];
  const refresh = useMutation({
    mutationFn: () => api.refreshTicket(ticket!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oracle-cis", "identities"] }),
  });

  if (ticket) {
    return (
      <div className="flex flex-col items-start gap-1">
        <a className="text-link font-mono text-xs" href={ticket.url} target="_blank" rel="noreferrer noopener">
          {ticket.key} →
        </a>
        <span className="badge">{ticket.status || "Unknown"}</span>
        <button type="button" className="text-xs font-semibold text-oc-ink-soft hover:text-oc-red" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
          {refresh.isPending ? "Refreshing..." : `Refresh${ticket.synced_at ? ` (${fmtDate(ticket.synced_at)})` : ""}`}
        </button>
        {refresh.error && <span className="text-xs text-oc-red">{(refresh.error as Error).message}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        className="btn-outline btn-small"
        disabled={!configured || !perms.manage_integrations || create.isPending}
        title={configured ? "Create a Jira ticket for this account" : "Set up Jira with a default project on the Integrations page"}
        onClick={() => create.mutate()}
      >
        {create.isPending ? "Creating..." : "Create Jira ticket"}
      </button>
      {create.error && <span className="max-w-[200px] text-xs text-oc-red">{(create.error as Error).message}</span>}
    </div>
  );
}

function RemediateDialog({ row, live, onClose }: { row: IdentityRow; live: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const roles: { code: string }[] = row.details.revocable_roles ?? [];
  const [action, setAction] = useState<"suspend_user" | "revoke_role">(row.kind === "ghost" && roles.length ? "revoke_role" : "suspend_user");
  const [roleCode, setRoleCode] = useState(roles[0]?.code ?? "");
  const [confirm, setConfirm] = useState("");
  const [result, setResult] = useState<RemediationInfo | null>(null);
  const word = action === "suspend_user" ? "SUSPEND" : "REVOKE";

  const run = useMutation({
    mutationFn: (execute: boolean) =>
      api.remediate(row.id, { action, role_code: action === "revoke_role" ? roleCode : undefined, execute, confirm: execute ? confirm : undefined }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["oracle-cis", "identities"] });
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="no-print fixed inset-0 z-40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="rem-title">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={onClose} />
      <div className="card-raised relative flex max-h-[90vh] w-full max-w-[620px] flex-col gap-4 overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">CIS {row.control_id} remediation</p>
            <h2 id="rem-title" className="mt-0.5 text-lg">{row.username}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded border border-oc-line p-2" aria-label="Close dialog"><CrossIcon /></button>
        </div>

        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1 font-semibold">Action</legend>
          <label className="flex items-start gap-2">
            <input type="radio" name="rem-action" checked={action === "suspend_user"} onChange={() => setAction("suspend_user")} className="mt-1" />
            <span><span className="font-semibold">Suspend account.</span> The user can no longer sign in; history and audit trail are kept.</span>
          </label>
          {row.kind === "ghost" && (
            <label className="flex items-start gap-2">
              <input type="radio" name="rem-action" checked={action === "revoke_role"} onChange={() => setAction("revoke_role")} className="mt-1" disabled={!roles.length} />
              <span><span className="font-semibold">Revoke a payroll / time-card role,</span> keeping the hiring role.</span>
            </label>
          )}
        </fieldset>
        {action === "revoke_role" && (
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Role to revoke
            <select className="field font-normal" value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>
              {roles.map((r) => <option key={r.code} value={r.code}>{r.code}</option>)}
            </select>
          </label>
        )}

        <div className={`flex gap-2 rounded border p-3 text-sm ${live ? "border-[var(--chip-fail-line)] bg-[var(--chip-fail-bg)] text-[var(--chip-fail-ink)]" : "border-oc-line bg-oc-bg-alt"}`}>
          {live ? <WarnIcon className="mt-0.5 shrink-0" /> : <InfoIcon className="mt-0.5 shrink-0" />}
          <span>
            {live
              ? "Live remediation is on: Execute sends the request to the Fusion pod immediately."
              : "Staged mode: the exact Fusion HCM REST request is recorded (and added to the Jira ticket) but not sent. Set ORACLE_CIS_REMEDIATION_LIVE=true on the server to allow execution."}
          </span>
        </div>

        {live && (
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Type {word} to confirm execution
            <input className="field font-normal" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </label>
        )}

        {run.error && <p className="text-sm font-semibold text-oc-red" role="alert">{(run.error as Error).message}</p>}
        {result && (
          <div className="rounded border border-oc-line p-3 text-sm">
            <p className="font-semibold">
              {result.status === "staged" ? "Staged (not sent)." : result.status === "executed" ? "Executed on the Fusion pod." : `Failed: ${result.error}`}
            </p>
            <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[11px] text-oc-ink-soft">
              {result.request.method} {result.request.endpoint}
              {result.request.payload ? `\n${JSON.stringify(result.request.payload, null, 2)}` : ""}
            </pre>
            {result.jira_comment_error && <p className="mt-1 text-xs text-oc-red">Jira comment failed: {result.jira_comment_error}</p>}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline" disabled={run.isPending || (action === "revoke_role" && !roleCode)} onClick={() => run.mutate(false)}>
            Stage request
          </button>
          {live && (
            <button type="button" className="btn-primary" disabled={run.isPending || confirm !== word} onClick={() => run.mutate(true)}>
              {run.isPending ? "Sending..." : "Execute on pod"}
            </button>
          )}
        </div>

        {row.remediations.length > 0 && (
          <div className="border-t border-oc-line pt-3 text-xs">
            <p className="eyebrow !text-[11px]">History</p>
            <ul className="mt-2 flex flex-col gap-1">
              {row.remediations.map((r) => (
                <li key={r.id}>
                  {fmtDate(r.created_at)} · {r.action === "suspend_user" ? "Suspend" : `Revoke ${r.role_code}`} · <span className="font-semibold">{r.status}</span>
                  {r.user ? ` · ${r.user}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Identities() {
  const { perms, identityKind: kind, showIdentities: setKind } = useSession();
  // This page exists to act on specific accounts: users who may remediate see real usernames; others stay masked.
  const reveal = perms.manage_providers;
  const [q, setQ] = useState("");
  const [minDays, setMinDays] = useState("");
  const [privileged, setPrivileged] = useState(false);
  const [page, setPage] = useState(1);
  const [openRow, setOpenRow] = useState<IdentityRow | null>(null);

  useEffect(() => setPage(1), [kind, q, minDays, privileged]);
  const query = useQuery({
    queryKey: ["oracle-cis", "identities", kind, q, minDays, privileged, page, reveal],
    queryFn: () => api.identities({ kind, q, min_days: minDays, privileged, page, page_size: 50, reveal }),
    placeholderData: keepPreviousData,
  });
  const d = query.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.page_size)) : 1;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-5">
      <div>
        <h1 className="text-xl">Identity risks: dormant, active and ghost-employee accounts</h1>
        <p className="mt-2 max-w-[760px] text-sm text-oc-ink-soft">
          Full account lists behind CIS 1.14 and 5.3.7 from the latest run{d?.run ? ` (#${d.run.id}, ${fmtDate(d.run.finished_at)})` : ""}. Raise a
          Jira ticket per account (the platform's Jira integration) and stage or execute the Fusion remediation.
        </p>
      </div>

      <IdentityBanners summary={d?.summary} onPick={setKind} />

      <div className="inline-flex w-fit flex-wrap gap-1 rounded-md border border-oc-line bg-oc-bg-alt p-1" role="tablist">
        {([
          ["dormant", "Dormant accounts", d?.counts.dormant],
          ["active", "Active users", d?.counts.active],
          ["ghost", "Potential ghost employees", d?.counts.ghost],
        ] as const).map(([k, label, n]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={`rounded px-3 py-1.5 text-sm font-medium ${kind === k ? "bg-oc-card text-oc-ink shadow-sm" : "text-oc-ink-soft hover:text-oc-ink"}`}
          >
            {label} <span className="ml-1 rounded bg-oc-bg-alt px-1.5 text-xs font-semibold tabular-nums">{n ?? "-"}</span>
          </button>
        ))}
      </div>

      {d && !d.jira_configured && (
        <p className="flex items-center gap-2 text-sm text-oc-ink-soft"><InfoIcon /> Jira is not configured: set up the Jira integration, with a default project, on the Integrations page to raise tickets.</p>
      )}

      <div className="no-print flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-oc-ink-soft">Search</span>
          <input className="field" type="search" placeholder={reveal ? "Username or role" : "Role"} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {kind === "dormant" && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-oc-ink-soft">Inactive for</span>
              <select className="field" value={minDays} onChange={(e) => setMinDays(e.target.value)}>
                <option value="">Any (≥ threshold)</option>
                <option value="180">180+ days</option>
                <option value="365">1+ year</option>
                <option value="730">2+ years</option>
              </select>
            </label>
          </>
        )}
        {kind !== "ghost" && (
          <label
            className="flex items-center gap-2 pb-2 text-sm"
            title="Only accounts that hold an identity domain administrator role (for example Identity Domain Administrator or Security Administrator)"
          >
            <input type="checkbox" checked={privileged} onChange={(e) => setPrivileged(e.target.checked)} /> Privileged only
            <span className="text-xs text-oc-ink-soft">(holds an identity domain administrator role)</span>
          </label>
        )}
      </div>

      <section className="card p-4">
        {query.isLoading && <p className="text-oc-ink-soft">Loading...</p>}
        {query.error && <p className="font-semibold text-oc-red">{(query.error as Error).message}</p>}
        {d && !d.run && <p className="text-sm text-oc-ink-soft">No run has stored identity lists yet. Run an assessment with the Fusion pod configured.</p>}
        {d && d.run && (
          <>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm">
                {kind === "dormant" ? "Dormant accounts (CIS 1.14)" : kind === "active" ? "Active users" : "Potential ghost employees (CIS 5.3.7)"}
              </h2>
              <span className="text-sm text-oc-ink-soft">{d.total.toLocaleString()} accounts</span>
            </div>
            <p className="mb-4 max-w-[820px] text-sm text-oc-ink-soft">
              {kind === "dormant"
                ? "Active accounts nobody has signed in to for 90 days or more. Unused accounts can be taken over without anyone noticing: suspend the ones no longer needed."
                : kind === "active"
                ? "Accounts that signed in within the last 90 days. Shown for completeness: these are in use and need no action unless they also appear in another finding."
                : "Users who can both hire a person and pay them (payroll or time-card approval). One person with both could create a fake employee and collect the pay. This is a risk, not proof of fraud: revoke one side of the access, or document why both are needed and have the payroll reviewed."}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-oc-line text-xs font-medium text-oc-ink-soft">
                    <th className="py-2 pr-3 font-medium">Account</th>
                    {kind !== "ghost" ? (
                      <>
                        <th className="py-2 pr-3 font-medium">Days inactive</th>
                        <th className="py-2 pr-3 font-medium">Last sign-in</th>
                        <th className="py-2 pr-3 font-medium">Person no.</th>
                      </>
                    ) : (
                      <>
                        <th className="py-2 pr-3 font-medium">Hiring roles</th>
                        <th className="py-2 pr-3 font-medium">Payroll / time-card roles</th>
                      </>
                    )}
                    <th className="py-2 pr-3 font-medium">State</th>
                    <th className="py-2 pr-3 font-medium">Jira</th>
                    <th className="py-2 font-medium">Remediation</th>
                  </tr>
                </thead>
                <tbody>
                  {d.results.map((row) => (
                    <tr key={row.id} className="border-b border-oc-line align-top">
                      <td className="py-3 pr-3">
                        <span className="font-semibold">{row.username}</span>
                        {row.details.privileged && <span className="badge ml-2">Privileged</span>}
                      </td>
                      {kind !== "ghost" ? (
                        <>
                          <td className="py-3 pr-3 font-display text-sm text-oc-ink">{row.details.days_inactive ?? "-"}</td>
                          <td className="py-3 pr-3 text-oc-ink-soft">{row.details.last_sign_in ?? "never"}</td>
                          <td className="py-3 pr-3 text-oc-ink-soft">{row.details.person_number ?? "-"}</td>
                        </>
                      ) : (
                        <>
                          <td className="py-3 pr-3 text-xs">{(row.details.hire_roles ?? []).join(", ")}</td>
                          <td className="py-3 pr-3 text-xs">{[...(row.details.payroll_roles ?? []), ...(row.details.timecard_roles ?? [])].join(", ")}</td>
                        </>
                      )}
                      <td className="py-3 pr-3"><StateBadge row={row} /></td>
                      <td className="py-3 pr-3"><JiraCell row={row} configured={d.jira_configured} /></td>
                      <td className="py-3">
                        <button
                          type="button"
                          className="btn-primary btn-small"
                          disabled={!row.can_remediate || !perms.manage_providers}
                          title={row.can_remediate ? "Suspend or revoke via Fusion HCM REST" : "No Fusion GUID for this account"}
                          onClick={() => setOpenRow(row)}
                        >
                          Remediate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!d.results.length && <p className="py-6 text-center text-sm text-oc-ink-soft">No accounts match.</p>}
            </div>
            {pages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <button type="button" className="btn-outline btn-small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                <span className="text-oc-ink-soft">Page {page} of {pages}</span>
                <button type="button" className="btn-outline btn-small" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            )}
          </>
        )}
      </section>
      {openRow && d && <RemediateDialog row={openRow} live={d.remediation_live} onClose={() => setOpenRow(null)} />}
    </div>
  );
}
