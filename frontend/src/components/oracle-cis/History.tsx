import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "./api";
import { Legend } from "./charts";
import { STATUS_VAR, StatusChip, fmtDate } from "./status";
import { useSession } from "./context";
import { STATUSES, type Status } from "./types";

function StatusOrNot({ value }: { value: string | null }) {
  if (value === null) return <span className="text-oc-ink-soft">not in run</span>;
  return <StatusChip status={value as Status} />;
}

export default function History() {
  const { reveal, go } = useSession();
  const [downloadError, setDownloadError] = useState("");
  const download = (id: number, fmt: "csv" | "json") =>
    api.download(id, fmt, reveal).catch((e: Error) => setDownloadError(e.message));
  const runs = useQuery({ queryKey: ["oracle-cis", "runs"], queryFn: api.runs });
  const list = runs.data ?? [];
  const finished = list.filter((r) => r.status === "finished");
  const [a, setA] = useState<number | "">("");
  const [b, setB] = useState<number | "">("");
  const compare = useQuery({
    queryKey: ["oracle-cis", "compare", a, b],
    queryFn: () => api.compare(Number(a), Number(b)),
    enabled: a !== "" && b !== "" && a !== b,
  });

  const trend = [...finished].reverse().map((r) => ({
    label: new Date(r.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ` #${r.id}`,
    ...Object.fromEntries(STATUSES.map((s) => [s, r.counts[s] ?? 0])),
  }));

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-5">
      <div>
        <h1 className="text-xl">Past assessments</h1>
      </div>

      <section className="card p-4">
        <h2 className="text-sm">Status counts over time</h2>
        {trend.length < 2 ? (
          <p className="mt-3 text-sm text-oc-ink-soft">The trend appears after two finished runs.</p>
        ) : (
          <>
            <div className="mt-3"><Legend /></div>
            <div className="mt-3 h-[260px]">
              <ResponsiveContainer>
                <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "var(--ink-soft)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "var(--ink-soft)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--ink)", fontSize: 12 }} />
                  {STATUSES.map((s) => (
                    <Line key={s} type="monotone" dataKey={s} stroke={STATUS_VAR[s]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "var(--card)" }} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>

      <section className="card p-4">
        <h2 className="text-sm">Compare two runs</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {[["Earlier run (A)", a, setA], ["Later run (B)", b, setB]].map(([label, value, set]) => (
            <label key={label as string} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-oc-ink-soft">{label as string}</span>
              <select className="field" value={value as number | ""} onChange={(e) => (set as (v: number | "") => void)(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Choose a run</option>
                {finished.map((r) => (
                  <option key={r.id} value={r.id}>#{r.id} · {fmtDate(r.started_at)}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {compare.data && (
          <div className="mt-4 overflow-x-auto">
            {compare.data.changed.length === 0 ? (
              <p className="text-sm text-oc-ink-soft">No control changed status between these runs.</p>
            ) : (
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-oc-line text-xs font-medium text-oc-ink-soft">
                    <th className="py-2 pr-3">ID</th><th className="py-2 pr-3">Title</th><th className="py-2 pr-3">Run A</th><th className="py-2">Run B</th>
                  </tr>
                </thead>
                <tbody>
                  {compare.data.changed.map((c) => (
                    <tr key={c.control_id} className="border-b border-oc-line">
                      <td className="py-2 pr-3 font-mono text-xs">{c.control_id}</td>
                      <td className="py-2 pr-3">{c.title}</td>
                      <td className="py-2 pr-3"><StatusOrNot value={c.a} /></td>
                      <td className="py-2"><StatusOrNot value={c.b} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="text-sm">Runs</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-oc-line text-xs font-medium text-oc-ink-soft">
                <th className="py-2 pr-3">Run</th><th className="py-2 pr-3">Started</th><th className="py-2 pr-3">State</th><th className="py-2 pr-3">By</th>
                <th className="py-2 pr-3">PASS</th><th className="py-2 pr-3">FAIL</th><th className="py-2 pr-3">MANUAL</th><th className="py-2">Open</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-b border-oc-line">
                  <td className="py-2 pr-3 font-mono text-xs">#{r.id}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(r.started_at)}</td>
                  <td className="py-2 pr-3">{r.status}{r.error && <span className="block text-xs text-oc-red">{r.error}</span>}</td>
                  <td className="py-2 pr-3">{r.started_by ?? r.trigger}</td>
                  {(["PASS", "FAIL", "MANUAL"] as const).map((k) => (
                    <td key={k} className="py-2 pr-3">{r.counts[k] ?? 0}</td>
                  ))}
                  <td className="py-2 whitespace-nowrap">
                    <button type="button" className="text-link" onClick={() => go("report", r.id)}>Report</button>
                    {" · "}
                    <button type="button" className="text-link" onClick={() => download(r.id, "csv")}>CSV</button>
                    {" · "}
                    <button type="button" className="text-link" onClick={() => download(r.id, "json")}>JSON</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && <p className="py-4 text-sm text-oc-ink-soft">No runs yet.</p>}
          {downloadError && <p className="py-2 text-sm font-semibold text-oc-red" role="alert">{downloadError}</p>}
        </div>
      </section>
    </div>
  );
}
