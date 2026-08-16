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
import {
  findingsByStatus,
  severityDistribution,
  resourceInventory,
  severityOverTime,
  radarFrameworks,
  complianceTrend,
  threatDots,
} from "@/lib/mock";

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
export function StatusDonut() {
  const statusItems = [
    { name: "Pass", value: 8421, colorClass: "bg-success", textClass: "text-success" },
    { name: "Fail", value: 1247, colorClass: "bg-critical", textClass: "text-critical" },
    { name: "Muted", value: 312, colorClass: "bg-neutral", textClass: "text-muted-foreground" },
  ];

  return (
    <div className="flex items-center justify-between gap-3 px-1 py-1">
      {/* Donut with Center Percentage */}
      <div className="relative flex shrink-0 items-center justify-center">
        <PieChart width={130} height={130}>
          <Pie
            data={findingsByStatus}
            dataKey="value"
            innerRadius={42}
            outerRadius={58}
            paddingAngle={4}
            stroke="none"
            animationDuration={1100}
          >
            {findingsByStatus.map((d) => (
              <Cell key={d.name} fill={`var(--color-${d.key})`} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="font-display text-xs font-bold text-foreground">84.4%</span>
          <span className="text-[8px] uppercase tracking-wider text-muted-foreground">Passing</span>
        </div>
      </div>

      {/* Clean Structured Status Pills */}
      <div className="flex-1 space-y-1.5">
        {statusItems.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between rounded-lg border border-border/50 bg-surface-2/30 px-2.5 py-1 text-xs"
          >
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${item.colorClass}`} />
              <span className="font-medium text-foreground text-[11px]">{item.name}</span>
            </div>
            <span className={`mono text-[11px] font-bold ${item.textClass}`}>
              <Counter value={item.value} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------- Severity distribution -------- */
const sevColors = ["critical", "high", "high", "primary", "neutral"];
export function SeverityBars() {
  return (
    <ResponsiveContainer width="100%" height={196}>
      <BarChart data={severityDistribution} layout="vertical" margin={{ left: 8, right: 16 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={72} tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "var(--color-primary)", fillOpacity: 0.06 }} contentStyle={tooltipStyle} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} animationDuration={1100} barSize={14}>
          {severityDistribution.map((_, i) => (
            <Cell key={i} fill={`var(--color-${sevColors[i]})`} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* -------- Resource inventory -------- */
export function ResourceBars() {
  return (
    <ResponsiveContainer width="100%" height={360}>
      <BarChart data={resourceInventory} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeOpacity={0.6} />
        <XAxis dataKey="service" tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
        <Tooltip cursor={{ fill: "var(--color-primary)", fillOpacity: 0.06 }} contentStyle={tooltipStyle} />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="var(--color-primary)" fillOpacity={0.75} animationDuration={1200} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* -------- Severity over time -------- */
export function SeverityTrend() {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={severityOverTime}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeOpacity={0.6} />
        <XAxis dataKey="day" tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="critical" stroke="var(--color-critical)" strokeWidth={2} dot={false} animationDuration={1400} />
        <Line type="monotone" dataKey="high" stroke="var(--color-high)" strokeWidth={2} dot={false} animationDuration={1600} />
        <Line type="monotone" dataKey="medium" stroke="var(--color-info)" strokeWidth={2} dot={false} animationDuration={1800} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* -------- Compliance sparkline -------- */
export function Sparkline() {
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={complianceTrend}>
        <defs>
          <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="p" stroke="var(--color-success)" strokeWidth={1.6} fill="url(#spark)" animationDuration={1400} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* -------- MANDATORY: Security radar -------- */
export function SecurityRadar() {
  const data = radarFrameworks.map((f) => ({ subject: f.framework, pass: f.pass, full: 100 }));
  return (
    <ResponsiveContainer width="100%" height={310}>
      <RadarChart data={data} outerRadius="80%">
        <defs>
          <linearGradient id="radarFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--color-info)" stopOpacity={0.42} />
          </linearGradient>
        </defs>
        <PolarGrid stroke="var(--color-border)" strokeOpacity={0.8} />
        <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--color-muted-foreground)", fontSize: 11, fontWeight: 500 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }} stroke="var(--color-border)" strokeOpacity={0.6} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, _n, p) => {
            const meta = radarFrameworks.find((f) => f.framework === p.payload.subject);
            return [`${v}% pass · ${meta?.fail} fail · ${meta?.trend}`, p.payload.subject];
          }}
        />
        <Radar
          dataKey="pass"
          stroke="var(--color-primary)"
          strokeWidth={2.2}
          fill="url(#radarFill)"
          animationDuration={1600}
          animationEasing="ease-out"
          style={{ filter: "drop-shadow(0 0 10px color-mix(in oklab, var(--color-primary) 45%, transparent))" }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/* -------- Attack surface heatmap & world SOC map -------- */
export function AttackSurfaceMap() {
  const regions = [
    { name: "US-East (AWS Prod)", x: 25, y: 35, sev: "critical", count: "4 Hotspots", ip: "52.94.76.1" },
    { name: "US-West (GCP Core)", x: 18, y: 42, sev: "high", count: "2 Hotspots", ip: "35.192.0.4" },
    { name: "EU-West (Azure EMEA)", x: 50, y: 30, sev: "high", count: "3 Hotspots", ip: "20.50.2.14" },
    { name: "EU-Central (AWS Frankfurt)", x: 55, y: 36, sev: "medium", count: "1 Hotspot", ip: "18.194.0.1" },
    { name: "AP-East (AWS Tokyo)", x: 82, y: 42, sev: "critical", count: "5 Hotspots", ip: "54.238.0.8" },
    { name: "AP-South (K8s Cluster)", x: 70, y: 55, sev: "high", count: "2 Hotspots", ip: "13.232.0.9" },
    { name: "SA-East (Azure LatAm)", x: 34, y: 72, sev: "medium", count: "1 Hotspot", ip: "191.233.0.2" },
  ];

  return (
    <div className="relative h-[330px] w-full overflow-hidden rounded-xl border border-border/70 bg-surface-2/15 p-2">
      {/* Background SVG Grid & World Continents Silhouette */}
      <svg
        viewBox="0 0 1000 500"
        className="absolute inset-0 h-full w-full opacity-60"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern id="soc-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--color-border)" strokeWidth="0.8" strokeOpacity="0.4" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#soc-grid)" />

        {/* Simplified Vector Continents */}
        <g fill="var(--color-surface-2)" stroke="var(--color-border)" strokeWidth="1" strokeOpacity="0.8">
          {/* North America */}
          <path d="M 120 80 Q 220 60 280 100 Q 300 160 260 220 Q 200 240 180 200 Q 140 180 120 80 Z" opacity="0.6" />
          {/* South America */}
          <path d="M 280 260 Q 360 280 340 380 Q 300 440 270 380 Q 250 300 280 260 Z" opacity="0.6" />
          {/* Europe */}
          <path d="M 460 100 Q 560 90 580 150 Q 540 200 480 180 Q 450 140 460 100 Z" opacity="0.6" />
          {/* Africa */}
          <path d="M 480 200 Q 580 210 560 340 Q 510 400 470 320 Q 450 240 480 200 Z" opacity="0.6" />
          {/* Asia */}
          <path d="M 590 80 Q 840 90 860 220 Q 760 280 660 240 Q 600 180 590 80 Z" opacity="0.6" />
          {/* Australia */}
          <path d="M 760 320 Q 850 330 830 400 Q 770 410 750 360 Z" opacity="0.6" />
        </g>

        {/* Dynamic Flight / Ingestion Connection Arcs */}
        <g stroke="var(--color-primary)" strokeWidth="1.2" strokeDasharray="3 3" strokeOpacity="0.5">
          <path d="M 250 175 Q 375 100 500 150" fill="none" />
          <path d="M 500 150 Q 660 100 820 210" fill="none" />
          <path d="M 250 175 Q 295 260 340 360" fill="none" />
          <path d="M 500 150 Q 600 220 700 275" fill="none" />
          <path d="M 700 275 Q 760 240 820 210" fill="none" />
        </g>
      </svg>

      {/* Interactive Region Hotspot Pills with HTML Overlays (Guarantees Sharp Typography) */}
      <div className="absolute inset-0">
        {regions.map((r, i) => {
          const isCrit = r.sev === "critical";
          const isHigh = r.sev === "high";
          return (
            <div
              key={i}
              className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
              style={{ left: `${r.x}%`, top: `${r.y}%` }}
            >
              {/* Radar Ping Ripple */}
              <div className="relative flex items-center justify-center">
                <span
                  className={`absolute h-7 w-7 rounded-full opacity-75 ${
                    isCrit ? "bg-critical" : isHigh ? "bg-high" : "bg-primary"
                  }`}
                  style={{ animation: `pulse-ring ${2 + i * 0.2}s ease-in-out infinite` }}
                />
                <span
                  className={`relative h-2.5 w-2.5 rounded-full ring-2 ring-background ${
                    isCrit ? "bg-critical" : isHigh ? "bg-high" : "bg-primary"
                  }`}
                />
              </div>

              {/* Crisp Badge Label */}
              <div className="mt-1.5 flex flex-col items-center">
                <div className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-surface/90 px-2 py-0.5 text-[10px] font-semibold text-foreground shadow-md backdrop-blur-md transition-transform group-hover:scale-105">
                  <span>{r.name}</span>
                  <span
                    className={`rounded px-1 text-[9px] font-bold ${
                      isCrit
                        ? "bg-critical/20 text-critical"
                        : isHigh
                          ? "bg-high/20 text-high"
                          : "bg-primary/20 text-primary"
                    }`}
                  >
                    {r.count}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating HUD Badges */}
      <div className="absolute top-2.5 left-2.5 flex items-center gap-2 rounded-lg border border-border/70 bg-surface/90 px-3 py-1 text-[11px] font-semibold text-foreground shadow-sm backdrop-blur-md">
        <span className="h-2 w-2 rounded-full bg-success" />
        <span>Live Threat Ingestion Surface</span>
      </div>

      <div className="absolute bottom-2.5 right-2.5 flex items-center gap-3 rounded-lg border border-border/70 bg-surface/90 px-3 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur-md">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-critical" /> 9 Critical
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-high" /> 7 High
        </span>
        <span className="mono font-semibold text-foreground">7 Cloud Regions</span>
      </div>
    </div>
  );
}
