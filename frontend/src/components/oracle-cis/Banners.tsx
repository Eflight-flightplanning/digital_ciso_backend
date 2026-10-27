import type { ReactNode } from "react";
import type { Counts, IdentityKind, IdentitySummary } from "./types";

function Banner({
  label, value, badge, badgeTone, caption, action, onClick,
}: {
  label: string; value: number | null | undefined; badge: string; badgeTone: "pass" | "fail" | "manual" | "na";
  caption: ReactNode; action?: string; onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`card flex flex-col gap-2 p-4 text-left ${onClick ? "hover:bg-oc-bg-alt" : ""}`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-oc-ink-soft">{label}</span>
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-display text-3xl text-oc-ink">{value == null ? "-" : value.toLocaleString()}</span>
        <span className={`chip chip-${badgeTone === "pass" ? "PASS" : badgeTone === "fail" ? "FAIL" : badgeTone === "manual" ? "MANUAL" : "NA"}`}>
          {badge}
        </span>
      </span>
      <span className="flex items-end justify-between gap-2 text-xs text-oc-ink-soft">
        <span>{caption}</span>
        {action && onClick && <span className="whitespace-nowrap font-semibold text-oc-red">{action} →</span>}
      </span>
    </Tag>
  );
}

/** Account banners from the latest run: monitored, dormant, active, ghost employees, IT superusers. */
export function IdentityBanners({ summary, onPick }: { summary?: IdentitySummary; onPick?: (kind: IdentityKind) => void }) {
  if (!summary) return null;
  const days = summary.threshold_days ?? 90;
  const fromFusion = /Fusion/i.test(summary.source ?? "");
  const pick = (k: IdentityKind) => (onPick ? () => onPick(k) : undefined);
  return (
    <section className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Banner
          label="Monitored users"
          value={summary.monitored}
          badge={fromFusion ? "Fusion pod" : "Identity domain"}
          badgeTone="manual"
          caption="Active accounts evaluated for sign-in activity"
        />
        <Banner
          label={`Dormant users (≥${days} days)`}
          value={summary.dormant}
          badge="CIS 1.14"
          badgeTone={summary.dormant ? "fail" : "pass"}
          caption={`${summary.dormant_privileged} privileged`}
          action="Review"
          onClick={pick("dormant")}
        />
        <Banner
          label="Active users"
          value={summary.active}
          badge={`< ${days} days`}
          badgeTone="pass"
          caption="Signed in within the threshold"
          action="View"
          onClick={pick("active")}
        />
        <Banner
          label="Potential ghost employees"
          value={summary.ghost}
          badge="CIS 5.3.7"
          badgeTone={summary.ghost == null ? "na" : summary.ghost ? "fail" : "pass"}
          caption={summary.ghost == null ? "Waiting for the Fusion pod connection" : "Can hire and pay (payroll / time cards)"}
          action={summary.ghost == null ? undefined : "Inspect"}
          onClick={summary.ghost == null ? undefined : pick("ghost")}
        />
        <Banner
          label="IT superusers"
          value={summary.superusers}
          badge="CIS 4.3"
          badgeTone={summary.superusers == null ? "na" : "manual"}
          caption={summary.superusers == null ? "Waiting for the Fusion pod connection" : "Accounts holding IT superuser roles"}
        />
      </div>
      <p className="text-xs text-oc-ink-soft">
        Source: {summary.source ?? "not available"}.
        {!fromFusion && summary.fusion_error ? " The Fusion pod could not be read, so the identity domain's last sign-in date was used." : ""}
      </p>
    </section>
  );
}

/** "13 controls are tested by this tool: ... 31 manual controls are checked by the assessor." */
export function CountsSentence({ counts }: { counts: Partial<Counts> }) {
  const pass = counts.PASS ?? 0;
  const fail = counts.FAIL ?? 0;
  const notCompleted = counts.not_completed ?? 0;
  const manual = counts.manual_controls ?? 0;
  const tested = counts.tested ?? (counts.total ?? 0) - manual;
  const partly = Math.max(0, (counts.MANUAL ?? 0) - manual - notCompleted);
  return (
    <p className="text-sm">
      <span className="font-semibold">{tested} controls are tested by this tool:</span> {pass} PASS, {fail} FAIL
      {notCompleted > 0 && <>, {notCompleted} could not complete (waiting for the Fusion pod connection; shown as MANUAL)</>}
      {partly > 0 && <>, {partly} partly evidenced (MANUAL, the assessor confirms the rest)</>}.{" "}
      <span className="text-oc-ink-soft">{manual} manual controls are checked by the assessor with the audit procedure.</span>
    </p>
  );
}
