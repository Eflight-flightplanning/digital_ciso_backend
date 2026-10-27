import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "./api";
import { useSession } from "./context";
import { CountsSentence } from "./Banners";
import { FindingsTable } from "./FindingsTable";
import { fmtDate } from "./status";
import { SEVERITY_LABEL } from "./types";

/** Prints only the report: the platform's sidebar and header are hidden while the print dialog is open. */
function printReport() {
  document.body.classList.add("ocis-printing");
  const done = () => {
    document.body.classList.remove("ocis-printing");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}

export default function Report() {
  const { reveal, reportRun } = useSession();
  const [downloadError, setDownloadError] = useState("");
  const run = useQuery({
    queryKey: reportRun ? ["oracle-cis", "run", reportRun, reveal] : ["oracle-cis", "latest", reveal],
    queryFn: () => (reportRun ? api.run(reportRun, reveal) : api.latest(reveal)),
  });
  const r = run.data;

  if (run.isLoading) return <p className="px-4 py-8 text-oc-ink-soft">Loading...</p>;
  if (run.error || !r) return <p className="px-4 py-8 font-semibold text-oc-red">{(run.error as Error)?.message ?? "No run."}</p>;

  const c = r.counts;
  const download = (fmt: "csv" | "json") => api.download(r.id, fmt, reveal).catch((e: Error) => setDownloadError(e.message));

  return (
    <div className="ocis-report mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-oc-ink-soft">Print-friendly report. The print dialog can save it as PDF; it always prints in the light theme.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline btn-small" onClick={() => download("csv")}>Export CSV</button>
          <button type="button" className="btn-outline btn-small" onClick={() => download("json")}>Export JSON</button>
          <button type="button" className="btn-primary btn-small" onClick={printReport}>Print / save as PDF</button>
        </div>
      </div>
      {downloadError && <p className="no-print text-sm font-semibold text-oc-red" role="alert">{downloadError}</p>}

      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-oc-line pb-4">
        <p className="text-lg font-semibold">Digital CISO</p>
        <div className="text-right text-sm">
          <p className="font-display text-xl">Oracle SaaS CIS Assessment: Identity Domain (IDCS) and Fusion</p>
          <p className="text-oc-ink-soft">CIS Oracle SaaS Cloud Applications Benchmark v1.0.0</p>
          <p className="text-oc-ink-soft">Tenant {r.tenant} · Run #{r.id} · {fmtDate(r.finished_at ?? r.started_at)}</p>
          {r.revealed && <p className="font-semibold text-oc-red">Contains unmasked usernames and IP addresses</p>}
        </div>
      </header>

      <section className="grid grid-cols-3 gap-3">
        {(["PASS", "FAIL", "MANUAL"] as const).map((k) => (
          <div key={k} className="card p-3">
            <p className="eyebrow !text-[11px]">{k}</p>
            <p className="font-display text-2xl text-oc-ink">{c[k] ?? 0}</p>
          </div>
        ))}
      </section>
      <CountsSentence counts={c} />
      <p className="text-xs text-oc-ink-soft">Severity: {SEVERITY_LABEL}.</p>

      <section>
        <h2 className="text-sm">All controls</h2>
        <div className="mt-3"><FindingsTable results={r.results} compact /></div>
      </section>
    </div>
  );
}
