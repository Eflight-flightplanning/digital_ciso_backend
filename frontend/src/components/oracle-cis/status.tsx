import type { ReactElement } from "react";
import type { Result, Severity, Status } from "./types";
import { SEVERITY_LABEL } from "./types";
import { ClipboardIcon, CrossIcon, InfoIcon, TickIcon, WarnIcon } from "./icons";

const CHIP: Record<Status, { cls: string; icon: ReactElement; label: string }> = {
  PASS: { cls: "chip-PASS", icon: <TickIcon />, label: "PASS" },
  FAIL: { cls: "chip-FAIL", icon: <CrossIcon />, label: "FAIL" },
  MANUAL: { cls: "chip-MANUAL", icon: <ClipboardIcon />, label: "MANUAL" },
};

/** Pill-shaped status chip: always icon + word, never colour alone. */
export function StatusChip({ status }: { status: Status }) {
  const c = CHIP[status];
  return (
    <span className={`chip ${c.cls}`}>
      {c.icon}
      {c.label}
    </span>
  );
}

export const STATUS_VAR: Record<Status | "none", string> = {
  PASS: "var(--st-pass)",
  FAIL: "var(--st-fail)",
  MANUAL: "var(--st-manual)",
  none: "var(--st-none)",
};

const FLAG_LABEL: Record<string, string> = {
  provisional: "Provisional",
  partially_evidenced: "Partially evidenced",
  automated_check_failed: "Could not complete",
};

/** Badges beside the chip for each flag, plus "Overridden". */
export function FlagBadges({ result, showError = false }: { result: Result; showError?: boolean }) {
  const flags = result.flags.filter((f) => f in FLAG_LABEL);
  return (
    <span className="inline-flex flex-wrap gap-1">
      {result.not_assessed && (
        <span className="badge" title="Checked by the assessor with the audit procedure, not by this tool">Manual control</span>
      )}
      {flags.map((f) => (
        <span
          key={f}
          className="badge"
          title={f === "automated_check_failed" ? result.reason : undefined}
        >
          {f === "automated_check_failed" && <WarnIcon width={11} height={11} />}
          {FLAG_LABEL[f]}
          {f === "automated_check_failed" && showError && (
            <span className="font-normal font-mono">: {result.reason.replace(/^Automated check failed:\s*/, "")}</span>
          )}
        </span>
      ))}
    </span>
  );
}

const SEV_DOTS: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, informational: 0 };

export function SeverityBadge({ severity }: { severity: Severity }) {
  const n = SEV_DOTS[severity];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold capitalize text-oc-ink" title={SEVERITY_LABEL}>
      <span className="inline-flex gap-[2px]" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-2.5 w-1 rounded-sm" style={{ background: i < n ? "var(--ink)" : "var(--line)" }} />
        ))}
      </span>
      {severity}
    </span>
  );
}

export function LevelBadge({ level }: { level: string }) {
  return (
    <span className="badge" title={`CIS profile ${level === "L1" ? "Level 1" : "Level 2"}`}>
      {level === "L1" ? "Level 1" : "Level 2"}
    </span>
  );
}

/** Notes required under certain results. */
export function ResultNotes({ result }: { result: Result }) {
  const idp = ["2.1", "2.2"].includes(result.control_id) && /external identity provider/i.test(result.reason);
  const unverified = /Provisional|NOT assessed/.test(result.reason);
  if (!idp && !unverified) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      {idp && (
        <div className="flex gap-2 rounded border border-oc-line bg-oc-bg-alt p-2.5 text-sm text-oc-ink">
          <InfoIcon className="mt-0.5 shrink-0" />
          <span>
            Sign-in is federated to an external identity provider. Network restrictions there are the control point and
            must be checked in that provider.
          </span>
        </div>
      )}
      {unverified && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-oc-ink-soft">
          <WarnIcon width={12} height={12} /> Not verified from here
        </p>
      )}
    </div>
  );
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
