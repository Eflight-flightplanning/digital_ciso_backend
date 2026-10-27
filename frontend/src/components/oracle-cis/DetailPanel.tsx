import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "./api";
import type { Result } from "./types";
import { SEVERITY_LABEL } from "./types";
import { Evidence } from "./Evidence";
import { CrossIcon } from "./icons";
import { FlagBadges, LevelBadge, ResultNotes, SeverityBadge, StatusChip, fmtDate } from "./status";

export function DetailPanel({ result, onClose }: { result: Result; onClose: () => void }) {
  const controls = useQuery({ queryKey: ["oracle-cis", "controls"], queryFn: api.controls, staleTime: Infinity });
  const meta = controls.data?.controls.find((c) => c.CisId === result.control_id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="no-print fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-[760px] flex-col overflow-y-auto bg-oc-bg shadow-oc-raised">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-oc-line bg-oc-bg px-5 py-4">
          <div>
            <p className="eyebrow">CIS {result.control_id} · {result.section}. {result.section_name}</p>
            <h2 id="detail-title" className="mt-0.5 text-lg leading-snug">{result.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded border border-oc-line p-2" aria-label="Close panel">
            <CrossIcon />
          </button>
        </div>

        <div className="flex flex-col gap-6 px-5 py-5">
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={result.status} />
              <FlagBadges result={result} showError />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="inline-flex items-center gap-2">
                <SeverityBadge severity={result.severity} />
              </span>
              <LevelBadge level={result.level} />
              <span className="text-xs text-oc-ink-soft">Checked {fmtDate(result.checked_at)}</span>
            </div>
            <p className="text-[11px] text-oc-ink-soft">
              Severity: {result.evidence?.check_severity ? "from the OCI identity check's own rating" : SEVERITY_LABEL}. Level: CIS
              profile level from the benchmark.
            </p>
            <p className="text-sm leading-relaxed">{result.reason}</p>
            {Boolean(result.evidence?.engine || result.evidence?.source) && (
              <p className="text-xs text-oc-ink-soft">
                Evaluated by: <span className="font-semibold text-oc-ink">{String(result.evidence.engine ?? result.evidence.source)}</span>
                {result.evidence?.check_error ? ` (check error: ${String(result.evidence.check_error)})` : ""}
              </p>
            )}
            <ResultNotes result={result} />
          </section>

          {meta && !result.not_assessed && result.status !== "PASS" && (
            <section className="card flex flex-col gap-2 p-4">
              <h3 className="text-sm">How to fix</h3>
              <ol className="list-decimal pl-5 text-sm">
                {meta.Remediation.Steps.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
              <p className="text-xs text-oc-ink-soft">Re-run the assessment after the change; the status updates from the check itself.</p>
            </section>
          )}
          {result.not_assessed && meta && (
            <section className="card flex flex-col gap-2 p-4">
              <h3 className="text-sm">Manual control</h3>
              <p className="text-sm">The assessor checks this control with the audit procedure below. Needs: {meta.RequiredAccess.join("; ")}.</p>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h3 className="text-sm">Evidence</h3>
            <Evidence result={result} />
            <details className="rounded border border-oc-line">
              <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">Raw evidence JSON</summary>
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all border-t border-oc-line p-3 font-mono text-[11px]">
                {JSON.stringify(result.evidence, null, 2)}
              </pre>
            </details>
          </section>

          {meta && (
            <section className="flex flex-col gap-3 border-t border-oc-line pt-5 text-sm">
              <h3 className="text-sm">About this control</h3>
              <p>{meta.Description}</p>
              <p><span className="font-semibold">Risk: </span>{meta.Risk}</p>
              {meta.Notes && <p className="text-oc-ink-soft"><span className="font-semibold text-oc-ink">How this app checks it: </span>{meta.Notes}</p>}
              <p><span className="font-semibold">Access needed: </span>{meta.RequiredAccess.join("; ")}</p>
              <div>
                <p className="font-semibold">Audit procedure</p>
                <ol className="mt-1 list-decimal pl-5">{meta.AuditProcedure.map((s, i) => <li key={i}>{s}</li>)}</ol>
              </div>
              <div>
                <p className="font-semibold">Remediation</p>
                <ol className="mt-1 list-decimal pl-5">{meta.Remediation.Steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
              </div>
              <p><span className="font-semibold">Default: </span>{meta.DefaultValue}</p>
              {meta.CisControlsV8.length > 0 && <p><span className="font-semibold">CIS Controls v8: </span>{meta.CisControlsV8.join(", ")}</p>}
              {meta.References.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {meta.References.map((r) => (
                    <li key={r}>
                      <a className="text-link break-all" href={r} target="_blank" rel="noreferrer noopener">{r} →</a>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-oc-ink-soft">Check ID: <span className="font-mono">{meta.CheckID}</span> · Summarised from the CIS Oracle SaaS Cloud Applications Benchmark v1.0.0.</p>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
