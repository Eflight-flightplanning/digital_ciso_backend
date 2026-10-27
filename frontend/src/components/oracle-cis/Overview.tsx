import type { ReactElement } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api } from "./api";
import { Legend, SectionChart, SeverityChart, StatusDonut } from "./charts";
import { DetailPanel } from "./DetailPanel";
import { EMPTY_FILTERS, FilterBar, FindingsTable, applyFilters, type Filters } from "./FindingsTable";
import { CountsSentence } from "./Banners";
import { ClipboardIcon, CrossIcon, TickIcon } from "./icons";
import { STATUS_VAR, fmtDate } from "./status";
import { useSession } from "./context";
import type { Result, Status } from "./types";

const TILES: { key: Status; label: string; icon: ReactElement }[] = [
  { key: "PASS", label: "PASS", icon: <TickIcon /> },
  { key: "FAIL", label: "FAIL", icon: <CrossIcon /> },
  { key: "MANUAL", label: "MANUAL", icon: <ClipboardIcon /> },
];

export default function Overview() {
  const { reveal, perms, go } = useSession();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [openId, setOpenId] = useState<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const runs = useQuery({
    queryKey: ["oracle-cis", "runs"],
    queryFn: api.runs,
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "running") ? 2000 : false),
  });
  const running = runs.data?.find((r) => r.status === "running") ?? null;
  const latest = useQuery({
    queryKey: ["oracle-cis", "latest", reveal],
    queryFn: () => api.latest(reveal),
    retry: (n, err) => !(err instanceof ApiError && err.status === 404) && n < 2,
  });

  // When a run finishes, reload the latest results.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) qc.invalidateQueries({ queryKey: ["oracle-cis", "latest"] });
    wasRunning.current = !!running;
  }, [running, qc]);

  const start = useMutation({
    mutationFn: api.startRun,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oracle-cis", "runs"] }),
  });

  const run = latest.data;
  const results = run?.results ?? [];
  const filtered = useMemo(() => applyFilters(results, filters), [results, filters]);
  const open: Result | undefined = results.find((r) => r.id === openId);
  const counts = run?.counts ?? {};

  const pickTile = (key: string) => {
    setFilters({ ...EMPTY_FILTERS, status: filters.status === key ? "" : key });
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-5">
        {/* Page header: title, tenant, last run, run button */}
        <section className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
          <div className="min-w-0">
            <h1 className="text-xl">CIS assessment overview</h1>
            <p className="mt-0.5 text-sm text-oc-ink-soft">
              Tenant <span className="text-oc-ink">{run?.tenant ?? running?.tenant ?? "-"}</span>
              {" · "}Last run {run ? `${fmtDate(run.finished_at ?? run.started_at)} by ${run.started_by ?? run.trigger}` : "never"}
              {" · "}CIS Oracle SaaS Cloud Applications Benchmark v1.0.0
              {run?.status === "failed" && <span className="ml-2 font-semibold text-oc-red">Run failed: {run.error}</span>}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={!!running || start.isPending || !perms.manage_scans}
              title={perms.manage_scans ? undefined : "Needs the manage scans permission"}
              onClick={() => start.mutate()}
            >
              {running ? "Assessment running..." : "Run assessment"}
            </button>
            {running && (
              <div className="w-[220px]" role="status" aria-live="polite">
                <div className="h-1.5 overflow-hidden rounded bg-oc-line">
                  <div
                    className="h-full bg-[var(--gold)] transition-all"
                    style={{ width: `${Math.round((100 * running.progress.done) / (running.progress.total || 1))}%` }}
                  />
                </div>
                <p className="mt-1 text-right text-xs text-oc-ink-soft">
                  {running.progress.done} of {running.progress.total} controls checked
                </p>
              </div>
            )}
            {start.error && <p className="text-sm font-semibold text-oc-red" role="alert">{(start.error as Error).message}</p>}
          </div>
        </section>

        {latest.isLoading && <p className="text-oc-ink-soft">Loading...</p>}
        {latest.error && !(latest.error instanceof ApiError && latest.error.status === 404) && (
          <p className="font-semibold text-oc-red">{(latest.error as Error).message}</p>
        )}
        {latest.error instanceof ApiError && latest.error.status === 404 && !running && (
          <div className="card p-8 text-center">
            <h2 className="text-base">No assessment yet</h2>
            <p className="mt-2 text-sm text-oc-ink-soft">
              Run the first assessment to see results. Check the{" "}
              <button type="button" className="text-link" onClick={() => go("connection")}>Connection</button> first.
            </p>
          </div>
        )}

        {run && (
          <>
            {/* Summary tiles */}
            <section className="grid grid-cols-3 gap-2.5">
              {TILES.map((t) => {
                const value = counts[t.key] ?? 0;
                const active = filters.status === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => pickTile(t.key)}
                    aria-pressed={active}
                    className={`card flex flex-col items-start gap-0.5 border-l-4 px-3 py-2.5 text-left hover:bg-oc-bg-alt ${active ? "ring-2 ring-[var(--gold)]" : ""}`}
                    style={{ borderLeftColor: STATUS_VAR[t.key] }}
                  >
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-oc-ink-soft">{t.icon}{t.label}</span>
                    <span className="font-display text-2xl text-oc-ink">{value}</span>
                  </button>
                );
              })}
            </section>

            <CountsSentence counts={counts} />

            {/* Charts */}
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
              <div className="card p-4">
                <h2 className="text-sm">Status</h2>
                <div className="mt-4"><StatusDonut counts={counts as Record<Status, number>} /></div>
              </div>
              <div className="card flex flex-col gap-4 p-4">
                <div>
                  <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-sm">By section</h2><Legend /></div>
                  <div className="mt-3"><SectionChart results={results} /></div>
                </div>
                <div>
                  <h3 className="text-sm">By severity</h3>
                  <p className="text-[11px] text-oc-ink-soft">Assessor-assigned severity (not defined by the CIS benchmark)</p>
                  <div className="mt-2"><SeverityChart results={results} /></div>
                </div>
              </div>
            </section>

            {/* Findings */}
            <section ref={tableRef} className="card scroll-mt-16 p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm">Findings</h2>
                <span className="text-sm text-oc-ink-soft">{filtered.length} shown</span>
              </div>
              <FilterBar filters={filters} setFilters={setFilters} />
              <div className="mt-4"><FindingsTable results={filtered} onOpen={(r) => setOpenId(r.id)} /></div>
            </section>

          </>
        )}
      </div>
      {open && <DetailPanel result={open} onClose={() => setOpenId(null)} />}
    </>
  );
}
