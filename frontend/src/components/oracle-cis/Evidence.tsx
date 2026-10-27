import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Result } from "./types";
import { CrossIcon, TickIcon } from "./icons";
import { fmtDate } from "./status";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const human = (k: string) => k.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

function Cell({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <span className="text-oc-ink-soft">-</span>;
  if (typeof value === "boolean") return <YesNo ok={value} />;
  if (Array.isArray(value) && value.every((v) => typeof v !== "object")) return <>{value.join(", ") || "-"}</>;
  if (typeof value === "object") return <code className="font-mono text-[11px] break-all">{JSON.stringify(value)}</code>;
  return <>{String(value)}</>;
}

function YesNo({ ok, yes = "Yes", no = "No" }: { ok: boolean; yes?: string; no?: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-semibold">
      {ok ? <TickIcon /> : <CrossIcon />}
      {ok ? yes : no}
    </span>
  );
}

export function Table({ rows, columns }: { rows: Obj[]; columns?: string[] }) {
  if (!rows.length) return <p className="text-sm text-oc-ink-soft">None.</p>;
  const cols = columns ?? Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-oc-line text-oc-ink-soft">
            {cols.map((c) => (
              <th key={c} className="py-1.5 pr-3 font-bold">{human(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-oc-line align-top">
              {cols.map((c) => (
                <td key={c} className="py-1.5 pr-3"><Cell value={r[c]} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="eyebrow !text-[11px]">{title}</h4>
      {children}
    </section>
  );
}

/** Generic layout: scalars as key/value, arrays of objects as tables, lists as bullet lists. */
function Generic({ ev }: { ev: Obj }) {
  const scalars = Object.entries(ev).filter(([, v]) => !Array.isArray(v) && !isObj(v));
  const rest = Object.entries(ev).filter(([, v]) => Array.isArray(v) || isObj(v));
  return (
    <div className="flex flex-col gap-4">
      {scalars.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {scalars.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-oc-line py-1">
              <dt className="text-oc-ink-soft">{human(k)}</dt>
              <dd className="text-right font-semibold"><Cell value={v} /></dd>
            </div>
          ))}
        </dl>
      )}
      {rest.map(([k, v]) => (
        <Block key={k} title={human(k)}>
          {Array.isArray(v) && v.length > 0 && v.every(isObj) ? (
            <Table rows={v as Obj[]} />
          ) : Array.isArray(v) ? (
            v.length ? (
              <ul className="list-disc pl-5 text-sm">{v.map((x, i) => <li key={i}><Cell value={x} /></li>)}</ul>
            ) : (
              <p className="text-sm text-oc-ink-soft">None.</p>
            )
          ) : (
            <Generic ev={v as Obj} />
          )}
        </Block>
      ))}
    </div>
  );
}

function Perimeters21({ ev }: { ev: Obj }) {
  const perimeters = (ev.perimeters as Obj[]) ?? [];
  return (
    <div className="flex flex-col gap-4">
      <Block title="Network perimeters">
        <Table rows={perimeters.map((p) => ({ name: p.name, ranges: p.ranges }))} />
      </Block>
      <Block title="Sign-on rules referencing a perimeter">
        <Table rows={(ev.rules_referencing_perimeter as Obj[]) ?? []} columns={["policy", "rule", "effect", "perimeters"]} />
      </Block>
      <Block title="Wide-open ranges">
        {((ev.wide_open as Obj[]) ?? []).length ? <Table rows={ev.wide_open as Obj[]} /> : <p className="text-sm"><YesNo ok yes="None found" /></p>}
      </Block>
    </div>
  );
}

function Console22({ ev }: { ev: Obj }) {
  const groups = (ev.condition_groups as Obj[]) ?? [];
  return (
    <div className="flex flex-col gap-4">
      <Block title={`Console sign-on rules (${((ev.console_policies as string[]) ?? []).join(", ") || "no console policy found"})`}>
        <Table rows={(ev.console_rules as Obj[]) ?? []} columns={["name", "effect", "condition_group", "mentions_network"]} />
      </Block>
      <Block title="Perimeters defined">
        <p className="text-sm">{((ev.perimeters_defined as string[]) ?? []).join(", ") || "None"}</p>
      </Block>
      <Block title="Condition groups and conditions">
        {groups.length ? (
          groups.map((g, i) => (
            <div key={i} className="rounded border border-oc-line p-2 text-xs">
              <div className="font-semibold">{String(g.rule)} <span className="font-mono text-oc-ink-soft">{String(g.condition_group ?? "")}</span></div>
              <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] text-oc-ink-soft">{JSON.stringify(g.conditions, null, 2)}</pre>
            </div>
          ))
        ) : (
          <p className="text-sm text-oc-ink-soft">None.</p>
        )}
      </Block>
    </div>
  );
}

function Events31({ ev }: { ev: Obj }) {
  const lifecycle = (ev.lifecycle as Obj[]) ?? [];
  const counts = Object.entries((ev.event_counts as Record<string, number>) ?? {}).map(([name, count]) => ({ name, count }));
  const w = (ev.window as Obj) ?? {};
  return (
    <div className="flex flex-col gap-4">
      <Block title="Lifecycle checklist">
        <ul className="flex flex-col gap-1 text-sm">
          {lifecycle.map((s) => (
            <li key={String(s.key)} className="flex flex-wrap items-center gap-2">
              <YesNo ok={!!s.found} yes="Found" no="Missing" />
              <span>{String(s.label)}</span>
              <span className="text-xs text-oc-ink-soft">({Number(s.count)} events)</span>
              {!!s.found_only_in_older_history && <span className="badge">Found only in older history</span>}
            </li>
          ))}
        </ul>
      </Block>
      <Block title="Events by name">
        {counts.length ? (
          <ResponsiveContainer width="100%" height={Math.max(60, counts.length * 26)}>
            <BarChart data={counts} layout="vertical" margin={{ left: 0, right: 24 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={200} tick={{ fill: "var(--ink)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--ink)", fontSize: 12 }}
                cursor={{ fill: "var(--bg-alt)" }}
              />
              <Bar dataKey="count" fill="var(--ink-soft)" radius={[0, 4, 4, 0]} label={{ position: "right", fill: "var(--ink)", fontSize: 11 }} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-oc-ink-soft">No events in the window.</p>
        )}
      </Block>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {[
          ["Window", `${fmtDate(w.from as string)} to ${fmtDate(w.to as string)} (${w.days} days)`],
          ["Events sampled", `${ev.events_sampled}${w.truncated ? " (sample limit reached)" : ""}`],
          ["Events with an IP address", ev.pct_with_ip == null ? "-" : `${ev.pct_with_ip}%`],
          ["Excluded monitoring accounts", String(ev.excluded_actors ?? 0)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-oc-line py-1">
            <dt className="text-oc-ink-soft">{k}</dt>
            <dd className="text-right font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <Block title="Recent events (sample)">
        <Table rows={(ev.sample as Obj[]) ?? []} />
      </Block>
    </div>
  );
}

export function Evidence({ result }: { result: Result }) {
  const ev = result.evidence ?? {};
  if (!Object.keys(ev).length) return <p className="text-sm text-oc-ink-soft">No evidence recorded.</p>;
  if (result.flags.includes("automated_check_failed")) return <Generic ev={ev} />;
  if (result.control_id === "2.1") return <Perimeters21 ev={ev} />;
  if (result.control_id === "2.2") return <Console22 ev={ev} />;
  if (result.control_id === "3.1") return <Events31 ev={ev} />;
  return <Generic ev={ev} />;
}
