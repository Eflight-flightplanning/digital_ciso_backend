import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ---------------- Animated counter ---------------- */
export function Counter({
  value = 0,
  decimals = 0,
  duration = 1200,
  className,
  suffix = "",
  prefix = "",
}: {
  value?: number;
  decimals?: number;
  duration?: number;
  className?: string;
  suffix?: string;
  prefix?: string;
}) {
  const numVal = typeof value === "number" && !isNaN(value) ? value : 0;
  const [display, setDisplay] = useState(numVal);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    const val = typeof value === "number" && !isNaN(value) ? value : 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(val * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  const safeDisplay = typeof display === "number" && !isNaN(display) ? display : 0;

  return (
    <span className={className}>
      {prefix}
      {safeDisplay.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

/* ---------------- Glass card ---------------- */
export function Panel({
  children,
  className,
  index = 0,
  glow,
  holo = false,
}: {
  children: ReactNode;
  className?: string;
  index?: number;
  glow?: "primary" | "critical" | "high" | "success" | "info";
  holo?: boolean;
}) {
  return (
    <div
      className={cn(
        "glass-card hover-lift enter-stagger p-4",
        holo && "holo-border",
        className,
      )}
      style={
        {
          animationDelay: `${index * 50}ms`,
          ...(glow ? { ["--glow-primary" as string]: `0 0 26px color-mix(in oklab, var(--color-${glow}) 28%, transparent)` } : {}),
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

export function PanelTitle({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h3 className="font-display text-sm font-bold text-foreground">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

/* ---------------- Chips & pills ---------------- */
const toneClass: Record<string, string> = {
  critical: "text-critical border-critical/35 bg-critical/10",
  high: "text-high border-high/35 bg-high/10",
  medium: "text-high border-high/25 bg-high/8",
  low: "text-primary border-primary/30 bg-primary/10",
  info: "text-neutral border-neutral/35 bg-neutral/10",
  success: "text-success border-success/35 bg-success/10",
  primary: "text-primary border-primary/35 bg-primary/10",
  neutral: "text-neutral border-neutral/30 bg-neutral/10",
  violet: "text-info border-info/35 bg-info/10",
};

export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof toneClass | string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        toneClass[tone] ?? toneClass['neutral'],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "success", pulse = false }: { tone?: string; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      {pulse && (
        <span
          className="absolute inset-0 rounded-full"
          style={{ background: `var(--color-${tone})`, animation: "pulse-ring 1.8s ease-in-out infinite" }}
        />
      )}
      <span className="relative h-2 w-2 rounded-full" style={{ background: `var(--color-${tone})` }} />
    </span>
  );
}

export function severityTone(s: string) {
  const key = s.toLowerCase();
  if (key === "critical") return "critical";
  if (key === "high") return "high";
  if (key === "medium") return "medium";
  if (key === "low") return "low";
  return "info";
}

/* ---------------- Progress ring ---------------- */
export function Ring({
  value,
  size = 84,
  stroke = 7,
  tone,
  label,
  sub,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: string;
  label?: string;
  sub?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = tone ?? (value >= 80 ? "success" : value >= 60 ? "high" : "critical");
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setProgress(value));
    return () => cancelAnimationFrame(id);
  }, [value]);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="stroke-border" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          stroke={`var(--color-${color})`}
          strokeDasharray={c}
          strokeDashoffset={c - (c * progress) / 100}
          style={{
            transition: "stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)",
            filter: `drop-shadow(0 0 6px color-mix(in oklab, var(--color-${color}) 45%, transparent))`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="kpi-number text-lg" style={{ color: `var(--color-${color})` }}>
          <Counter value={value} suffix={label ?? "%"} />
        </span>
        {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

/* ---------------- Staggered table row ---------------- */
export function Row({ children, index = 0, className, onClick }: { children: ReactNode; index?: number; className?: string; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "border-b border-border/60 transition-colors last:border-0 hover:bg-primary/5",
        onClick && "cursor-pointer",
        className,
      )}
      style={{ animation: `row-rise 320ms cubic-bezier(0.22,1,0.36,1) both`, animationDelay: `${index * 30}ms` }}
    >
      {children}
    </tr>
  );
}

export function DataTable({ head, children, className }: { head: string[]; children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            {head.map((h) => (
              <th key={h} className="section-label px-3 py-2.5 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
