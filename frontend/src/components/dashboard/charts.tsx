import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Area,
  AreaChart,
} from "recharts";
import { Counter } from "@/components/ui-kit/primitives";

const tooltipStyle = {
  background: "color-mix(in oklab, var(--color-popover) 92%, transparent)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  backdropFilter: "blur(12px)",
} as const;

/* -------- Semi-circular threat gauge -------- */
export function ThreatGauge({ value = 64 }: { value?: number }) {
  const [angle, setAngle] = useState(-90);
  useEffect(() => {
    const id = setTimeout(() => setAngle(-90 + (value / 100) * 180), 60);
    return () => clearTimeout(id);
  }, [value]);
  const R = 72;
  const cx = 110;
  const cy = 104;
  const arc = (from: number, to: number, color: string) => {
    const p = (a: number) => [cx + R * Math.cos((a * Math.PI) / 180), cy + R * Math.sin((a * Math.PI) / 180)];
    const [x1, y1] = p(from);
    const [x2, y2] = p(to);
    return <path d={`M${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2}`} stroke={color} strokeWidth={22} fill="none" strokeLinecap="round" />;
  };
  return (
    <div className="flex flex-col items-center justify-center py-0.5">
      <svg viewBox="0 0 220 122" className="w-full max-w-[210px]">
        {arc(180, 238, "var(--color-success)")}
        {arc(242, 298, "var(--color-high)")}
        {arc(302, 360, "var(--color-critical)")}
        <line
          x1={cx}
          y1={cy}
          x2={cx}
          y2={cy - R + 8}
          stroke="var(--color-primary)"
          strokeWidth={4.5}
          strokeLinecap="round"
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            transform: `rotate(${angle}deg)`,
            transition: "transform 1.3s cubic-bezier(0.22,1,0.36,1)",
            filter: "drop-shadow(0 0 6px var(--color-primary))",
          }}
        />
        <circle cx={cx} cy={cy} r={8} fill="var(--color-primary)" />
        <circle cx={cx} cy={cy} r={3.5} fill="var(--color-background)" />
      </svg>
      <div className="-mt-3 text-center">
        <div className="kpi-number text-2xl font-bold text-foreground">
          <Counter value={value} />
        </div>
        <div className="section-label text-[9px] tracking-wider text-muted-foreground uppercase">Threat Score</div>
      </div>
    </div>
  );
}

/* -------- Donut: findings by status -------- */
export function StatusDonut({ pass = 30, fail = 53, muted = 0 }: { pass?: number; fail?: number; muted?: number }) {
  const data = [
    { name: "Pass", value: pass, key: "success" },
    { name: "Fail", value: fail, key: "critical" },
    { name: "Muted", value: muted, key: "neutral" },
  ];

  return (
    <div className="flex items-center justify-between gap-3 px-1 py-1">
      <div className="relative flex shrink-0 items-center justify-center">
        <PieChart width={130} height={130}>
          <Pie
            data={data}
            dataKey="value"
            innerRadius={42}
            outerRadius={58}
            paddingAngle={4}
            stroke="none"
            animationDuration={1100}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={`var(--color-${d.key})`} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </div>
    </div>
  );
}
