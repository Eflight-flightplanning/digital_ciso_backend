import type { Result } from "./types";
import { SECTIONS, SEVERITIES } from "./types";
import { FlagBadges, ResultNotes, SeverityBadge, StatusChip } from "./status";

export interface Filters {
  status: string; // "" = all controls, or a status
  severity: string;
  section: string;
  level: string;
  text: string;
}

export const EMPTY_FILTERS: Filters = { status: "", severity: "", section: "", level: "", text: "" };

export function applyFilters(results: Result[], f: Filters) {
  const text = f.text.trim().toLowerCase();
  return results.filter((r) => {
    if (f.status && r.status !== f.status) return false;
    if (f.severity && r.severity !== f.severity) return false;
    if (f.section && r.section !== f.section) return false;
    if (f.level && r.level !== f.level) return false;
    if (text && !`${r.control_id} ${r.title} ${r.reason} ${r.section_name}`.toLowerCase().includes(text)) return false;
    return true;
  });
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-oc-ink-soft">{label}</span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterBar({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  const set = (k: keyof Filters) => (v: string) => setFilters({ ...filters, [k]: v });
  return (
    <div className="no-print grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.6fr)_auto] lg:items-end">
      <Select
        label="Status"
        value={filters.status}
        onChange={set("status")}
        options={[["", "All controls"], ["FAIL", "FAIL"], ["MANUAL", "MANUAL"], ["PASS", "PASS"]]}
      />
      <Select
        label="Severity"
        value={filters.severity}
        onChange={set("severity")}
        options={[["", "Any"], ...SEVERITIES.map((s) => [s, s[0].toUpperCase() + s.slice(1)] as [string, string])]}
      />
      <Select
        label="Section"
        value={filters.section}
        onChange={set("section")}
        options={[["", "Any"], ...Object.entries(SECTIONS).map(([k, v]) => [k, `${k}. ${v}`] as [string, string])]}
      />
      <Select label="Level" value={filters.level} onChange={set("level")} options={[["", "Any"], ["L1", "Level 1"], ["L2", "Level 2"]]} />
      <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
        <span className="text-xs font-medium text-oc-ink-soft">Search</span>
        <input className="field" type="search" placeholder="ID, title or reason" value={filters.text} onChange={(e) => set("text")(e.target.value)} />
      </label>
      <button type="button" className="self-end py-1.5 text-sm font-medium text-oc-ink-soft hover:text-oc-ink" onClick={() => setFilters(EMPTY_FILTERS)}>
        Clear
      </button>
    </div>
  );
}

function CompactNotes({ result }: { result: Result }) {
  const idp = ["2.1", "2.2"].includes(result.control_id) && /external identity provider/i.test(result.reason);
  const unverified = /Provisional|NOT assessed/.test(result.reason);
  if (result.not_assessed || (!idp && !unverified)) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {idp && <span className="badge" title="Sign-in is federated: the external identity provider is the control point">Federated sign-in</span>}
      {unverified && <span className="badge" title="Part of this control cannot be verified from the identity domain">Not verified from here</span>}
    </span>
  );
}

export function FindingsTable({ results, onOpen, compact = false }: { results: Result[]; onOpen?: (r: Result) => void; compact?: boolean }) {
  const rows = results;
  if (!rows.length) return <p className="py-8 text-center text-sm text-oc-ink-soft">No controls match these filters.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-oc-line text-xs font-medium text-oc-ink-soft">
            <th className="w-[130px] py-2 pr-3 font-medium">Status</th>
            <th className="w-[96px] py-2 pr-3 font-medium">Severity</th>
            <th className="min-w-[260px] py-2 pr-3 font-medium">Control</th>
            <th className="w-[48px] py-2 pr-3 font-medium">Level</th>
            <th className="py-2 font-medium">Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={`border-b border-oc-line align-top last:border-b-0 ${onOpen ? "cursor-pointer hover:bg-oc-bg-alt" : ""}`}
              onClick={onOpen ? () => onOpen(r) : undefined}
            >
              <td className="py-2.5 pr-3">
                <div className="flex flex-col items-start gap-1">
                  <StatusChip status={r.status} />
                  <FlagBadges result={r} />
                </div>
              </td>
              <td className="py-2.5 pr-3">
                <SeverityBadge severity={r.severity} />
              </td>
              <td className="py-2.5 pr-3">
                <div className="flex gap-2">
                  <span className="shrink-0 pt-px font-mono text-xs text-oc-ink-soft">{r.control_id}</span>
                  <div className="min-w-0">
                    {onOpen ? (
                      <button
                        type="button"
                        className="text-left font-medium text-oc-ink hover:underline"
                        onClick={(e) => (e.stopPropagation(), onOpen(r))}
                      >
                        <span className={compact ? "" : "line-clamp-2"}>{r.title}</span>
                      </button>
                    ) : (
                      <span className="font-medium">{r.title}</span>
                    )}
                    <span className="block text-xs text-oc-ink-soft">{r.section_name}</span>
                  </div>
                </div>
              </td>
              <td className="py-2.5 pr-3 text-xs text-oc-ink-soft" title={r.level === "L1" ? "CIS Level 1" : "CIS Level 2"}>
                {r.level}
              </td>
              <td className="py-2.5 text-oc-ink-soft [overflow-wrap:anywhere]">
                <span className={compact ? "" : "line-clamp-2"}>{r.reason}</span>
                {compact ? !r.not_assessed && <ResultNotes result={r} /> : <CompactNotes result={r} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
