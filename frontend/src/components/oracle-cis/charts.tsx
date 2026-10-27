import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Result, Status } from "./types";
import { SECTIONS, SEVERITIES, STATUSES } from "./types";
import { STATUS_VAR } from "./status";

type Row = Record<string, string | number>;

const tooltipStyle = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--line)",
    borderRadius: 4,
    color: "var(--ink)",
    fontSize: 12,
  },
  itemStyle: { color: "var(--ink)" },
  labelStyle: { color: "var(--ink)", fontWeight: 600 },
  cursor: { fill: "var(--bg-alt)" },
};

export function Legend({ counts }: { counts?: Record<string, number> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-oc-ink" aria-label="Legend">
      {STATUSES.map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_VAR[s] }} aria-hidden="true" />
          {s}
          {counts && <span className="font-semibold">{counts[s] ?? 0}</span>}
        </li>
      ))}
    </ul>
  );
}

export function StatusDonut({ counts }: { counts: Record<Status, number> }) {
  const total = STATUSES.reduce((n, s) => n + (counts[s] || 0), 0);
  const data = STATUSES.map((s) => ({ name: s, value: counts[s] || 0 })).filter((d) => d.value > 0);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-[200px] w-[200px]">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data.length ? data : [{ name: "none", value: 1 }]}
              dataKey="value"
              nameKey="name"
              innerRadius={66}
              outerRadius={94}
              stroke="var(--card)"
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
            >
              {(data.length ? data : [{ name: "none" }]).map((d) => (
                <Cell key={d.name} fill={STATUS_VAR[d.name as Status | "none"]} />
              ))}
            </Pie>
            {data.length > 0 && <Tooltip {...tooltipStyle} formatter={(v: number, n: string) => [`${v} control${v === 1 ? "" : "s"}`, n]} />}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl text-oc-ink">{total}</span>
          <span className="text-xs text-oc-ink-soft">controls with a result</span>
        </div>
      </div>
      <Legend counts={counts} />
    </div>
  );
}

function stackRows<K extends string>(results: Result[], keys: K[], keyOf: (r: Result) => K, labelOf: (k: K) => string) {
  return keys.map((k) => {
    const row: Row = { key: k, label: labelOf(k) };
    STATUSES.forEach((s) => (row[s] = 0));
    results
      .filter((r) => keyOf(r) === k)
      .forEach((r) => {
        row[r.status] = (row[r.status] as number) + 1;
      });
    return row;
  });
}

function StackedBars({ rows, height, yWidth }: { rows: Row[]; height: number; yWidth: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap={6}>
        <XAxis type="number" allowDecimals={false} hide />
        <YAxis
          type="category"
          dataKey="label"
          width={yWidth}
          tick={{ fill: "var(--ink)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          {...tooltipStyle}
          formatter={(v: number, n: string) => (v ? [v, n] : [null, null])}
        />
        {STATUSES.map((s) => (
          <Bar key={s} dataKey={s} stackId="a" fill={STATUS_VAR[s]} stroke="var(--card)" strokeWidth={2} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SectionChart({ results }: { results: Result[] }) {
  const rows = stackRows(results, Object.keys(SECTIONS), (r) => r.section, (k) => `${k}. ${SECTIONS[k]}`);
  return (
    <div>
      <StackedBars rows={rows} height={rows.length * 34} yWidth={210} />
    </div>
  );
}

export function SeverityChart({ results }: { results: Result[] }) {
  const assessed = results;
  const rows = stackRows(assessed, SEVERITIES, (r) => r.severity, (k) => k[0].toUpperCase() + k.slice(1)).filter(
    (r) => STATUSES.some((s) => (r[s] as number) > 0),
  );
  if (!rows.length) return <p className="text-sm text-oc-ink-soft">No assessed controls yet.</p>;
  return <StackedBars rows={rows} height={rows.length * 30} yWidth={100} />;
}
