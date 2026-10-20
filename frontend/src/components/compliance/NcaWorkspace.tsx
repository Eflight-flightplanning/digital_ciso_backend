import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Play, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Chip, Panel, PanelTitle } from "@/components/ui-kit/primitives";
import { ncaDownload, ncaFetch, ncaPost, ncaUpload, qs } from "@/lib/nca-api";


type Status = "PASS" | "FAIL" | "MANUAL" | "NOT_APPLICABLE" | "ERROR";
const STATUSES: Status[] = ["FAIL", "ERROR", "MANUAL", "PASS", "NOT_APPLICABLE"];
const STATUS_TONE: Record<string, string> = {
  PASS: "success",
  FAIL: "critical",
  MANUAL: "primary",
  NOT_APPLICABLE: "neutral",
  ERROR: "high",
};
export const BASIS_LABEL: Record<string, string> = {
  manual: "Manual control",
  automated: "Automated",
  no_resources: "Resources not found",
  error: "Not evaluated",
};
export const REASON_TEXT: Record<string, string> = {
  NO_RESOURCES: "Resources not found — nothing of this type exists in the tenancy",
  API_ERROR: "OCI API error — not evaluated",
  PERMISSION_DENIED: "Permission denied — not evaluated",
  NOT_EXECUTED: "Check was not executed",
  UNSUPPORTED: "Check unsupported by this engine",
  NO_AUTOMATED_CHECK: "Manual control — no OCI API check; evidence + review required",
  PARTIAL_AUTOMATION: "Passed on automated OCI checks (covers the technical part of the control)",
  MANUAL_REVIEW_PENDING: "Evidence submitted — awaiting reviewer",
  MANUAL_REJECTED: "Evidence rejected by reviewer",
  MANUAL_APPROVED: "Evidence approved by reviewer",
  MANUAL_NOT_APPLICABLE: "Marked not applicable by reviewer",
};
const FW_LABEL: Record<string, string> = {
  "nca_ecc_2.2024": "NCA ECC 2:2024",
  "nca_ecc_1.2018": "NCA ECC 1:2018",
  "nca_ccc_2.2024": "NCA CCC 2:2024",
};

const StatusChip = ({ s }: { s: string }) => <Chip tone={STATUS_TONE[s] ?? "neutral"}>{s.replace("_", " ")}</Chip>;
const sel = "rounded-lg border border-border/80 bg-surface-2 px-2.5 py-1.5 text-xs text-foreground";
const btn =
  "inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/50 disabled:opacity-40";
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface-2/60 px-3 py-2 text-center">
      <div className="text-lg font-bold" style={tone ? { color: `var(--color-${tone})` } : undefined}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

export function NcaWorkspace({ initialFramework = "nca_ecc_2.2024", onBack }: { initialFramework?: string; onBack?: () => void }) {
  const qc = useQueryClient();
  const [framework, setFramework] = useState<string>(initialFramework);
  const [tab, setTab] = useState<"controls" | "subcontrols" | "checks" | "findings" | "remediation" | "audit">("controls");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("");
  const [severity, setSeverity] = useState("");
  const [selected, setSelected] = useState<{ fw: string; id: string } | null>(null);
  const [exportMsg, setExportMsg] = useState("");

  const latest = useQuery({
    queryKey: ["nca", "latest"],
    queryFn: () => ncaFetch("/assessments/latest"),
    refetchInterval: (q) => (q.state.data?.running ? 4000 : false),
  });
  const a = latest.data?.latest;
  const running = latest.data?.running;
  const aid = a?.id as string | undefined;

  const frameworks = useQuery({ queryKey: ["nca", "frameworks"], queryFn: () => ncaFetch("/frameworks") });

  const controls = useQuery({
    enabled: !!aid && tab === "controls",
    queryKey: ["nca", aid, "controls", framework, statusFilter, search, section],
    queryFn: () =>
      ncaFetch(`/assessments/${aid}/controls${qs({ framework, status: statusFilter, q: search, section, limit: 500 })}`),
  });
  const subcontrols = useQuery({
    enabled: !!aid && tab === "subcontrols",
    queryKey: ["nca", aid, "subcontrols", statusFilter, search],
    queryFn: () => ncaFetch(`/assessments/${aid}/subcontrols${qs({ status: statusFilter, q: search, limit: 200 })}`),
  });
  const checks = useQuery({
    enabled: !!aid && tab === "checks",
    queryKey: ["nca", aid, "checks", framework, statusFilter, severity],
    queryFn: () => ncaFetch(`/assessments/${aid}/checks${qs({ framework, status: statusFilter, severity, limit: 500 })}`),
  });
  const findings = useQuery({
    enabled: !!aid && tab === "findings",
    queryKey: ["nca", aid, "findings", statusFilter],
    queryFn: () => ncaFetch(`/assessments/${aid}/findings${qs({ status: statusFilter, limit: 300 })}`),
  });
  const remediations = useQuery({
    enabled: tab === "remediation",
    queryKey: ["nca", "remediations"],
    queryFn: () => ncaFetch("/remediations"),
  });
  const audit = useQuery({ enabled: tab === "audit", queryKey: ["nca", "audit"], queryFn: () => ncaFetch("/audit-log") });

  const run = useMutation({
    mutationFn: () => ncaPost("/assessments", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nca"] }),
  });

  const fwSummary = a?.summary?.by_framework?.[framework];
  const sections = useMemo(() => {
    const set = new Set<string>();
    (controls.data?.results ?? []).forEach((c: any) => set.add(c.section));
    return Array.from(set);
  }, [controls.data]);

  const doExport = async (f: string) => {
    if (!aid) return;
    try {
      setExportMsg("");
      await ncaDownload(`/assessments/${aid}/report${qs({ fmt: f, framework })}`, `nca-${framework}.${f}`);
    } catch (e: any) {
      setExportMsg(e.message);
    }
  };

  return (
    <div className="space-y-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {onBack && (
            <button className={btn} onClick={onBack}>
              <ArrowLeft className="h-3.5 w-3.5" /> All frameworks
            </button>
          )}
          <div>
            <h2 className="font-display text-base font-bold text-foreground">NCA ECC &amp; CCC — OCI assessment</h2>
            <p className="text-xs text-muted-foreground">Read-only checks of your Oracle Cloud Infrastructure tenancy</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className={btn} onClick={() => run.mutate()} disabled={run.isPending || !!running}>
            <Play className="h-3.5 w-3.5 text-primary" />
            {running ? `Running… ${Math.round(running.progress)}%` : "Run read-only assessment"}
          </button>
          <button className={btn} onClick={() => latest.refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {run.isError && <div className="mb-3 rounded-lg border border-critical/40 bg-critical/10 p-3 text-xs">{(run.error as Error).message}</div>}
      {latest.isError && (
        <div className="mb-3 rounded-lg border border-critical/40 bg-critical/10 p-3 text-xs">
          Could not reach the assessment API: {(latest.error as Error).message}. Results below (if any) are not live.
        </div>
      )}
      {!a && !latest.isLoading && !latest.isError && (
        <Panel>
          <p className="text-sm">
            No completed assessment yet. Press <b>Run read-only assessment</b> — it only reads configuration from OCI and
            takes a few minutes.
          </p>
        </Panel>
      )}

      {a && (
        <>
          <Panel className="mb-4">
            <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
              <div>
                <div className="font-semibold text-foreground">Tenancy</div>
                {a.tenancy_name} <span className="break-all opacity-60">({a.tenancy_ocid?.slice(-12)})</span>
              </div>
              <div>
                <div className="font-semibold text-foreground">Scope</div>
                {a.regions?.length} region(s): {a.regions?.join(", ")} · {a.compartment_count} compartments
              </div>
              <div>
                <div className="font-semibold text-foreground">Executed</div>
                {fmt(a.started_at)} → {fmt(a.finished_at)}
              </div>
              <div>
                <div className="font-semibold text-foreground">Mode</div>
                <Chip tone="success">{a.mode}</Chip> engine {a.engine_version}
              </div>
            </div>
          </Panel>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            {(frameworks.data?.frameworks ?? []).map((f: any) => (
              <button
                key={f.key}
                onClick={() => setFramework(f.key)}
                className={`${btn} ${framework === f.key ? "border-primary text-primary" : ""}`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {FW_LABEL[f.key] ?? f.name} · {f.control_count}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              {["csv", "json", "md", "html"].map((f) => (
                <button key={f} className={btn} onClick={() => doExport(f)}>
                  <Download className="h-3.5 w-3.5" />
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {exportMsg && <div className="mb-2 text-xs text-critical">{exportMsg}</div>}

          {fwSummary && (
            <div className="mb-4 grid gap-4 lg:grid-cols-3">
              <Panel>
                <PanelTitle title="Control results" hint={`${fwSummary.controls.total} controls`} />
                <div className="grid grid-cols-5 gap-2">
                  <Stat label="Pass" value={fwSummary.controls.PASS} tone="success" />
                  <Stat label="Fail" value={fwSummary.controls.FAIL} tone="critical" />
                  <Stat label="Manual" value={fwSummary.controls.MANUAL} tone="primary" />
                  <Stat label="No resources" value={fwSummary.controls.NOT_APPLICABLE} />
                  <Stat label="Error" value={fwSummary.controls.ERROR} tone="high" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Control pass rate (PASS ÷ PASS+FAIL):{" "}
                  <b>{fwSummary.controls.pass_rate_pct == null ? "n/a" : `${fwSummary.controls.pass_rate_pct}%`}</b>
                </p>
              </Panel>
              <Panel>
                <PanelTitle title="Check results" hint={`${fwSummary.checks.total} checks (mapped to this framework)`} />
                <div className="grid grid-cols-5 gap-2">
                  <Stat label="Pass" value={fwSummary.checks.PASS} tone="success" />
                  <Stat label="Fail" value={fwSummary.checks.FAIL} tone="critical" />
                  <Stat label="Manual" value={fwSummary.checks.MANUAL} tone="primary" />
                  <Stat label="No res." value={fwSummary.checks.NOT_APPLICABLE} />
                  <Stat label="Error" value={fwSummary.checks.ERROR} tone="high" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Check pass rate:{" "}
                  <b>{fwSummary.checks.pass_rate_pct == null ? "n/a" : `${fwSummary.checks.pass_rate_pct}%`}</b>
                </p>
              </Panel>
              <Panel>
                <PanelTitle title="Assessment coverage" hint="Independent of pass rate" />
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Controls with a verdict" value={`${fwSummary.coverage.assessment_coverage_pct}%`} />
                  <Stat label="Automatically evaluated" value={`${fwSummary.coverage.automated_coverage_pct}%`} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Manual: {fwSummary.manual_breakdown?.manual_control ?? 0} governance controls · {fwSummary.manual_breakdown?.automated_awaiting_evidence ?? 0} automated
                  but need evidence · {fwSummary.manual_breakdown?.awaiting_review ?? 0} awaiting review · {fwSummary.controls.NOT_APPLICABLE} resources not
                  found · {fwSummary.coverage.controls_not_evaluable_errors} not evaluable.
                </p>
              </Panel>
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {(["controls", "subcontrols", "checks", "findings", "remediation", "audit"] as const).map((t) => (
              <button key={t} className={`${btn} ${tab === t ? "border-primary text-primary" : ""}`} onClick={() => setTab(t)}>
                {t === "subcontrols" ? "ECC sub-controls (workbook)" : t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
            <span className="mx-2 h-4 w-px bg-border" />
            {tab !== "remediation" && tab !== "audit" && (
              <select className={sel} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
            {tab === "controls" && (
              <>
                <select className={sel} value={section} onChange={(e) => setSection(e.target.value)}>
                  <option value="">All sections</option>
                  {sections.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <input className={sel} placeholder="Search controls…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </>
            )}
            {tab === "checks" && (
              <select className={sel} value={severity} onChange={(e) => setSeverity(e.target.value)}>
                <option value="">All severities</option>
                {["critical", "high", "medium", "low"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            )}
          </div>

          {tab === "controls" && (
            <Panel className="overflow-x-auto">
              <QueryState q={controls} />
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="p-2">Control</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th>Automated</th>
                    <th>Manual</th>
                    <th>Checks</th>
                  </tr>
                </thead>
                <tbody>
                  {(controls.data?.results ?? []).map((c: any) => (
                    <tr
                      key={c.framework + c.control_id}
                      className="cursor-pointer border-t border-border/40 hover:bg-surface-2/60"
                      onClick={() => setSelected({ fw: c.framework, id: c.control_id })}
                    >
                      <td className="p-2">
                        <b>{c.control_id}</b> {c.name.replace(/^[\d-T]+\s*/, "")}
                        <div className="text-[10px] text-muted-foreground">{c.section}</div>
                      </td>
                      <td>
                        <StatusChip s={c.status} />
                        <div className="text-[10px] text-muted-foreground">{BASIS_LABEL[c.basis] ?? ""}</div>
                      </td>
                      <td className="max-w-[260px] text-muted-foreground">{REASON_TEXT[c.reason] ?? c.reason}</td>
                      <td>{c.automated_result ? <StatusChip s={c.automated_result} /> : "—"}</td>
                      <td>{c.manual_state || "—"}</td>
                      <td>{c.checks.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[10px] text-muted-foreground">{controls.data?.count ?? 0} controls shown</p>
            </Panel>
          )}

          {tab === "subcontrols" && (
            <Panel className="overflow-x-auto">
              <QueryState q={subcontrols} />
              <p className="mb-2 text-xs text-muted-foreground">
                Rows of the ECC-2:2024 Cloud API Automation Mapping workbook, evaluated against OCI. Rows without an implemented
                OCI check stay MANUAL; rows whose checks cover only part of the condition cannot pass automatically.
                {a.summary?.workbook_subcontrols &&
                  ` ${a.summary.workbook_subcontrols.PASS} pass · ${a.summary.workbook_subcontrols.FAIL} fail · ${a.summary.workbook_subcontrols.MANUAL} manual · ${a.summary.workbook_subcontrols.ERROR} error of ${a.summary.workbook_subcontrols.total} rows; automated coverage ${a.summary.workbook_subcontrols.automated_coverage_pct}%.`}
              </p>
              <input className={`${sel} mb-2`} placeholder="Search sub-controls…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="p-2">Sub-control</th>
                    <th>Status</th>
                    <th>Workbook level</th>
                    <th>Pass / fail condition</th>
                    <th>OCI checks</th>
                  </tr>
                </thead>
                <tbody>
                  {(subcontrols.data?.results ?? []).map((r: any) => (
                    <tr key={r.row_id} className="border-t border-border/40 align-top">
                      <td className="p-2">
                        <b>{r.sub_control}</b> {r.api_check}
                        <div className="text-[10px] text-muted-foreground">{r.category}</div>
                      </td>
                      <td>
                        <StatusChip s={r.status} />
                        <div className="text-[10px] text-muted-foreground">{REASON_TEXT[r.reason] ?? r.reason}</div>
                      </td>
                      <td>
                        {r.workbook_automation}
                        {r.mapping_coverage && <div className="text-[10px] text-muted-foreground">mapping: {r.mapping_coverage}</div>}
                      </td>
                      <td className="max-w-[300px] text-muted-foreground">
                        <div>✓ {r.pass_condition}</div>
                        <div>✗ {r.fail_condition}</div>
                      </td>
                      <td>
                        {r.checks.length === 0 ? "—" : r.checks.map((k: any) => (
                          <div key={k.check_id}>
                            <StatusChip s={k.status} /> <span className="text-[10px]">{k.check_id}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          {tab === "checks" && (
            <Panel className="overflow-x-auto">
              <QueryState q={checks} />
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="p-2">Check</th>
                    <th>Status</th>
                    <th>Severity</th>
                    <th>Pass/Fail</th>
                    <th>Detail</th>
                    <th>Remediation</th>
                  </tr>
                </thead>
                <tbody>
                  {(checks.data?.results ?? []).map((c: any) => (
                    <tr key={c.check_id} className="border-t border-border/40 align-top">
                      <td className="p-2">
                        <b>{c.check_id}</b>
                        <div className="text-[10px] text-muted-foreground">
                          {c.title} · {c.source}
                        </div>
                      </td>
                      <td>
                        <StatusChip s={c.status} />
                      </td>
                      <td>
                        <Chip tone={c.severity}>{c.severity}</Chip>
                      </td>
                      <td>
                        {c.counts?.PASS ?? 0}/{c.counts?.FAIL ?? 0}
                      </td>
                      <td className="max-w-[320px] text-muted-foreground">
                        {c.reason && <div>{REASON_TEXT[c.reason] ?? c.reason}</div>}
                        {c.message}
                        {(c.errors ?? []).slice(0, 2).map((e: any, i: number) => (
                          <div key={i} className="text-high">
                            {e.kind}: {String(e.message).slice(0, 160)}
                          </div>
                        ))}
                      </td>
                      <td>{c.remediation?.automated ? <Chip tone="success">automated</Chip> : <Chip>manual</Chip>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          {tab === "findings" && <FindingsTable q={findings} aid={aid!} onDone={() => qc.invalidateQueries({ queryKey: ["nca"] })} />}

          {tab === "remediation" && (
            <Panel className="overflow-x-auto">
              <QueryState q={remediations} />
              <p className="mb-2 text-xs text-muted-foreground">
                Remediation never runs during an assessment. Each change needs a dry-run, an explicit confirmation phrase and a
                written justification, and is verified and audit-logged afterwards.
              </p>
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="p-2">When</th>
                    <th>Mode</th>
                    <th>Status</th>
                    <th>Resource</th>
                    <th>Change / evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {(remediations.data?.results ?? []).map((r: any) => (
                    <tr key={r.id} className="border-t border-border/40 align-top">
                      <td className="p-2">{fmt(r.created_at)}</td>
                      <td>{r.mode}</td>
                      <td>
                        <Chip tone={r.status === "succeeded" ? "success" : r.status === "planned" ? "primary" : "high"}>{r.status}</Chip>
                      </td>
                      <td>
                        {r.resource_name}
                        <div className="text-[10px] text-muted-foreground">{r.check_id}</div>
                      </td>
                      <td className="max-w-[420px] text-muted-foreground">
                        {r.action}
                        <pre className="whitespace-pre-wrap text-[10px]">
                          {JSON.stringify({ before: r.before, after: r.after, verification: r.verification }, null, 1)}
                        </pre>
                        {r.error && <div className="text-high">{r.error}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          {tab === "audit" && (
            <Panel className="overflow-x-auto">
              <QueryState q={audit} />
              <table className="w-full text-left text-xs">
                <tbody>
                  {(audit.data?.results ?? []).map((l: any) => (
                    <tr key={l.id} className="border-t border-border/40">
                      <td className="p-2">{fmt(l.created_at)}</td>
                      <td>{l.actor}</td>
                      <td>
                        <b>{l.action}</b>
                      </td>
                      <td className="text-muted-foreground">{l.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </>
      )}

      {selected && <ControlDrawer fw={selected.fw} id={selected.id} onClose={() => setSelected(null)} />}
    </div>
  );
}

function QueryState({ q }: { q: { isLoading: boolean; isError: boolean; error: unknown } }) {
  if (q.isLoading) return <p className="p-2 text-xs text-muted-foreground">Loading…</p>;
  if (q.isError) return <p className="p-2 text-xs text-critical">Failed to load: {(q.error as Error).message}</p>;
  return null;
}

function FindingsTable({ q, aid, onDone }: { q: any; aid: string; onDone: () => void }) {
  const [active, setActive] = useState<any>(null);
  return (
    <Panel className="overflow-x-auto">
      <QueryState q={q} />
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="p-2">Resource</th>
            <th>Check</th>
            <th>Status</th>
            <th>Region</th>
            <th>Detail</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(q.data?.results ?? []).map((f: any) => (
            <tr key={f.id} className="border-t border-border/40 align-top">
              <td className="p-2">
                {f.resource_name || f.resource_id}
                <div className="text-[10px] text-muted-foreground">{f.resource_type}</div>
              </td>
              <td>{f.check_id}</td>
              <td>
                <StatusChip s={f.status} />
              </td>
              <td>{f.region}</td>
              <td className="max-w-[320px] text-muted-foreground">{f.status_extended}</td>
              <td>
                {f.remediation?.automated && (
                  <button className={btn} onClick={() => setActive(f)}>
                    Remediate…
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-muted-foreground">
        {q.data?.count ?? 0} findings · assessment {aid.slice(0, 8)}
      </p>
      {active && <RemediationDialog finding={active} onClose={() => { setActive(null); onDone(); }} />}
    </Panel>
  );
}

function RemediationDialog({ finding, onClose }: { finding: any; onClose: () => void }) {
  const [plan, setPlan] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [phrase, setPhrase] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const dry = async () => {
    setErr("");
    try {
      setPlan(await ncaPost("/remediations/dry-run", { finding_id: finding.id }));
    } catch (e: any) {
      setErr(e.message);
    }
  };
  const exec = async () => {
    setErr("");
    try {
      setResult(
        await ncaPost("/remediations/execute", { finding_id: finding.id, dry_run_id: plan.id, confirmation: phrase, reason }),
      );
    } catch (e: any) {
      setErr(e.message);
    }
  };
  return (
    <Modal onClose={onClose} title={`Remediate ${finding.resource_name}`}>
      <p className="text-xs text-muted-foreground">
        {finding.remediation.action} — risk <b>{finding.remediation.risk}</b>. Rollback: {finding.remediation.rollback}
      </p>
      <button className={`${btn} mt-3`} onClick={dry}>
        1. Dry-run (no changes to OCI)
      </button>
      {plan && (
        <div className="mt-3 text-xs">
          <pre className="rounded bg-surface-2 p-2">{JSON.stringify(plan.plan?.changes ?? plan.error, null, 1)}</pre>
          {plan.status === "planned" && !result && (
            <>
              <p className="mt-2">
                2. To execute type: <code className="select-all">{plan.plan.confirmation_phrase}</code>
              </p>
              <input className={`${sel} mt-1 w-full`} value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="Confirmation phrase" />
              <textarea className={`${sel} mt-2 w-full`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Justification / change ticket (min 10 chars)" />
              <button className={`${btn} mt-2`} onClick={exec} disabled={!phrase || reason.length < 10}>
                Execute (modifies OCI)
              </button>
            </>
          )}
        </div>
      )}
      {result && <pre className="mt-3 rounded bg-surface-2 p-2 text-[11px]">{JSON.stringify({ status: result.status, before: result.before, after: result.after, verification: result.verification }, null, 1)}</pre>}
      {err && <p className="mt-2 text-xs text-critical">{err}</p>}
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl border border-border bg-background p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold">{title}</h3>
          <button onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ControlDrawer({ fw, id, onClose }: { fw: string; id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const d = useQuery({ queryKey: ["nca", "control", fw, id], queryFn: () => ncaFetch(`/controls/${fw}/${id}`) });
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [comment, setComment] = useState("");
  const [rvComment, setRvComment] = useState("");
  const [err, setErr] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["nca"] });
  };
  const guard = async (fn: () => Promise<unknown>) => {
    setErr("");
    try {
      await fn();
      refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  const c = d.data?.control;
  const r = d.data?.result;
  return (
    <Modal onClose={onClose} title={`${FW_LABEL[fw] ?? fw} — ${id}`}>
      <QueryState q={d} />
      {c && (
        <div className="space-y-3 text-xs">
          <div>
            <b>{c.control_id}</b> <span className="text-muted-foreground">{c.parent_id ? `(part of ${c.parent_id})` : ""}</span>
            <p className="mt-1">{c.description}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{c.subsection || c.section}</p>
            {r && (
              <div className="mt-1">
                <StatusChip s={r.status} /> <span className="text-muted-foreground">{REASON_TEXT[r.reason] ?? r.reason}</span>
              </div>
            )}
            {c.checks.length === 0 && c.manual_label && <p className="mt-1 text-muted-foreground">Manual: {c.manual_label}</p>}
          </div>
          {(c.workbook_detail ?? []).map((w: any, i: number) => (
            <div key={i} className="rounded border border-border/50 p-2">
              <b>{w.api_check}</b>
              {w.pass_condition && <p className="text-muted-foreground">✓ Pass: {w.pass_condition}</p>}
              {w.fail_condition && <p className="text-muted-foreground">✗ Fail: {w.fail_condition}</p>}
              {w.oci_api && <p className="text-[10px] text-muted-foreground">OCI source: {w.oci_api}</p>}
              {w.notes && <p className="text-[10px] text-muted-foreground">{w.notes}</p>}
            </div>
          ))}
          <section>
            <h4 className="font-semibold">Mapped OCI checks</h4>
            {c.checks.length === 0 && <p className="text-muted-foreground">No OCI API check exists for this item.</p>}
            {c.supplement_rationale && <p className="text-[10px] text-muted-foreground">Platform-added mapping: {c.supplement_rationale}</p>}
            {(r?.checks ?? []).map((k: any) => (
              <div key={k.check_id} className="mt-1 rounded border border-border/50 p-2">
                <StatusChip s={k.status} /> <b>{k.check_id}</b> <span className="text-[10px] text-muted-foreground">({k.source})</span>
                <div className="text-muted-foreground">{k.message || REASON_TEXT[k.reason] || k.title}</div>
                {k.status === "FAIL" && (k.remediation_text || k.remediation_cli) && (
                  <details className="mt-1">
                    <summary className="cursor-pointer">Remediation guidance</summary>
                    <p>{k.remediation_text}</p>
                    {k.remediation_cli && <pre className="whitespace-pre-wrap rounded bg-surface-2 p-1">{k.remediation_cli}</pre>}
                    {k.remediation_manual && <pre className="whitespace-pre-wrap rounded bg-surface-2 p-1">{k.remediation_manual}</pre>}
                  </details>
                )}
              </div>
            ))}
          </section>
          {err && <p className="text-critical">{err}</p>}
        </div>
      )}
    </Modal>
  );
}


/** Latest NCA assessment summary, used by the Compliance page to render the NCA framework cards. */
export function useNcaOverview() {
  return useQuery({
    queryKey: ["nca", "latest"],
    queryFn: () => ncaFetch("/assessments/latest").catch(() => null),
    refetchInterval: (q) => (q.state.data?.running ? 4000 : false),
  });
}

export const NCA_FRAMEWORK_LABEL = FW_LABEL;
