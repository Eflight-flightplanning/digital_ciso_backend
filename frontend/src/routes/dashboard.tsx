import { useState, useMemo, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Shield,
  Layers,
  Sparkles,
  Zap,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ArrowRight,
  GitBranch,
  Cloud,
  Check,
  Server,
  Database,
  Lock,
  Globe,
  Radio,
  Cpu,
  ShieldCheck,
  Ticket,
  ExternalLink,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { WorldThreatMap } from "@/components/dashboard/WorldThreatMap";
import {
  useFindings,
  useProviders,
  useResources,
  useScans,
  useRemediationMetrics,
  useRemediationExecutions,
  useCompliance,
  useAttackPaths,
} from "@/hooks/use-api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

/** Animates number from 0 -> target (Slowed down for majestic startup feel) */
function useCountUp(target: number, duration = 3800, enabled = true) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const t0 = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, enabled]);
  return value;
}

/* ── Interactive Pentagon Radar Chart Component with Startup Animation & Hover Info ── */
function RadarChart({
  data,
  hoveredIdx,
  setHoveredIdx,
}: {
  data: { label: string; value: number }[];
  hoveredIdx?: number | null;
  setHoveredIdx?: (idx: number | null) => void;
}) {
  const [internalHovered, setInternalHovered] = useState<number | null>(null);
  const activeHover = hoveredIdx !== undefined ? hoveredIdx : internalHovered;
  const setActiveHover = setHoveredIdx || setInternalHovered;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 120);
    return () => clearTimeout(t);
  }, []);

  const cx = 220;
  const cy = 155;
  const r = 124;
  const numSides = 5;

  const getVertex = (index: number, radiusScale: number) => {
    const angle = (index * 2 * Math.PI) / numSides - Math.PI / 2;
    const x = cx + radiusScale * Math.cos(angle);
    const y = cy + radiusScale * Math.sin(angle);
    return { x, y };
  };

  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  const getPolygonPoints = (scale: number) => {
    return Array.from({ length: numSides })
      .map((_, i) => {
        const pt = getVertex(i, r * scale);
        return `${pt.x},${pt.y}`;
      })
      .join(" ");
  };

  const dataPoints = data.map((d, i) => {
    const scale = Math.max(0.1, Math.min(1.0, d.value / 100));
    return getVertex(i, r * scale);
  });
  const dataPolygonStr = dataPoints.map((pt) => `${pt.x},${pt.y}`).join(" ");

  const labelPositions = [
    { name: data[0]?.label || "CIS Benchmark", x: 220, y: 18, anchor: "middle" },
    { name: data[1]?.label || "SOC 2", x: 350, y: 120, anchor: "start" },
    { name: data[2]?.label || "ISO 27001", x: 298, y: 275, anchor: "start" },
    { name: data[3]?.label || "NIST 800-53", x: 142, y: 275, anchor: "end" },
    { name: data[4]?.label || "PCI-DSS", x: 90, y: 120, anchor: "end" },
  ];

  return (
    <div className="relative flex items-center justify-center w-full">
      {/* Simple Clean Translucent Hover Tooltip — shows only the real posture value, no invented per-framework copy */}
      {activeHover !== null && activeHover !== undefined && data[activeHover] && (
        <div className="absolute top-0 right-0 z-20 max-w-[240px] rounded-xl border border-border/80 bg-surface/90 backdrop-blur-md p-2.5 shadow-lg pointer-events-none">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-xs text-foreground">
              {data[activeHover].label}
            </span>
            <span className="font-mono font-bold text-xs text-primary">
              {data[activeHover]?.value ?? 0}%
            </span>
          </div>
        </div>
      )}

      <svg className="w-full max-w-[465px] h-[290px] sm:h-[315px] overflow-visible select-none" viewBox="0 0 440 310">
        <defs>
          <linearGradient id="radarAreaGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.25" />
          </linearGradient>
          <filter id="radarGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Concentric Pentagon Grid Lines */}
        {gridLevels.map((lvl) => (
          <polygon
            key={lvl}
            points={getPolygonPoints(lvl)}
            fill="none"
            stroke="currentColor"
            className="text-border/70"
            strokeWidth="1"
            strokeDasharray={lvl < 1.0 ? "3 3" : "none"}
            opacity={0.7}
          />
        ))}

        {/* Axis Lines */}
        {Array.from({ length: numSides }).map((_, i) => {
          const pt = getVertex(i, r);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={pt.x}
              y2={pt.y}
              stroke="currentColor"
              className="text-border/70"
              strokeWidth="1"
              opacity={0.8}
            />
          );
        })}

        {/* Scale Numbers */}
        <text x="224" y="130" fill="currentColor" className="text-muted-foreground/80" fontSize="8" fontFamily="monospace">25</text>
        <text x="224" y="99" fill="currentColor" className="text-muted-foreground/80" fontSize="8" fontFamily="monospace">50</text>
        <text x="224" y="68" fill="currentColor" className="text-muted-foreground/80" fontSize="8" fontFamily="monospace">75</text>
        <text x="224" y="37" fill="currentColor" className="text-muted-foreground/80" fontSize="8" fontFamily="monospace">100</text>

        {/* Data Area Fill with 3x Slower Startup Animation */}
        <polygon
          points={dataPolygonStr}
          fill="url(#radarAreaGradient)"
          stroke="#06b6d4"
          strokeWidth="2.5"
          filter="url(#radarGlow)"
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            transform: mounted ? "scale(1)" : "scale(0.08)",
            opacity: mounted ? 1 : 0,
            transition: "transform 4.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 2.5s ease-out",
          }}
        />

        {/* Data Point Nodes */}
        {dataPoints.map((pt, i) => {
          const isHovered = activeHover === i;
          return (
            <g key={i} className="cursor-pointer">
              {/* Data Point Node Circle */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 6 : 4.5}
                fill="#06b6d4"
                stroke="currentColor"
                className="text-card"
                strokeWidth="1.5"
                style={{
                  transformOrigin: `${cx}px ${cy}px`,
                  transform: mounted ? "scale(1)" : "scale(0)",
                  opacity: mounted ? 1 : 0,
                  transition: `all 1.8s cubic-bezier(0.16, 1, 0.3, 1) ${1.8 + i * 0.25}s`,
                }}
              />

              {/* Generous Hit Zone for Easy Hover */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r="22"
                fill="transparent"
                onMouseEnter={() => setActiveHover(i)}
                onMouseLeave={() => setActiveHover(null)}
              />
            </g>
          );
        })}

        {/* Axis Labels */}
        {labelPositions.map((lbl, i) => (
          <text
            key={i}
            x={lbl.x}
            y={lbl.y}
            fill="currentColor"
            fontSize="11"
            fontWeight="600"
            textAnchor={lbl.anchor as any}
            className="select-none cursor-pointer text-foreground/85 hover:text-primary transition-colors"
            onMouseEnter={() => setActiveHover(i)}
            onMouseLeave={() => setActiveHover(null)}
            style={{
              opacity: mounted ? 1 : 0,
              transition: `opacity 2.2s ease ${1.2 + i * 0.15}s`,
            }}
          >
            {lbl.name}
          </text>
        ))}
      </svg>
    </div>
  );
}

/* ── Neo4j Multi-Cloud Attack Path Graph Status ── */
// Renders real scan state from `/attack-paths-scans` — no fabricated topology or node data.
// Full graph exploration (real Cypher queries, real nodes/relationships) lives on /attack-paths.
function Neo4jAttackGraphCard({
  scans,
  scansLoading,
  selectedProviderObj,
}: {
  scans: Array<Record<string, any>>;
  scansLoading: boolean;
  selectedProviderObj?: any;
}) {
  const relevantScan = selectedProviderObj
    ? scans.find((s) => String(s.provider) === String(selectedProviderObj.id))
    : undefined;
  const readyCount = scans.filter((s) => s.graph_data_ready).length;

  return (
    <div className="rounded-2xl border border-border/80 bg-surface/80 p-6 backdrop-blur-sm shadow-md h-full flex flex-col justify-between space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <GitBranch className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2">
              Attack Graph
              <span
                className={`mono text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                  readyCount > 0
                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                    : "text-muted-foreground bg-surface-2 border-border"
                }`}
              >
                {readyCount} of {scans.length} graphs ready
              </span>
            </h3>
            <p className="text-[11px] text-muted-foreground">Real Neo4j resource graph, built from your latest scans</p>
          </div>
        </div>

        <Link to="/attack-paths" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline shrink-0">
          <span>Explore Graph →</span>
        </Link>
      </div>

      <div className="rounded-xl border border-border/70 bg-surface-2/40 p-4 min-h-[140px] flex flex-col justify-center">
        {scansLoading ? (
          <p className="text-xs text-muted-foreground text-center">Loading scan status…</p>
        ) : scans.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center">
            No Attack Paths scans yet — run one from a provider to build its resource graph.
          </p>
        ) : (
          <div className="space-y-2">
            {(relevantScan ? [relevantScan] : scans).slice(0, 4).map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-surface/60 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${s.graph_data_ready ? "bg-emerald-400" : "bg-amber-400"}`} />
                  <span className="font-semibold text-foreground uppercase shrink-0">{s.provider_type}</span>
                  <span className="text-muted-foreground truncate">{s.provider_alias || s.provider_uid}</span>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground shrink-0">{s.state}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border/40 pt-3 text-xs text-muted-foreground">
        <span className="font-mono text-[11px]">{readyCount} provider{readyCount === 1 ? "" : "s"} queryable</span>
        <Link to="/attack-paths" className="text-primary font-semibold hover:underline text-[11px]">
          Launch Cypher Graph Analysis &rarr;
        </Link>
      </div>
    </div>
  );
}

/* ── Asset Volume Tab View ── */
function AssetVolumeView({
  totalAssets,
  azureAssets,
  awsAssets,
  gcpAssets,
  ociAssets,
  oracleSaasAssets = 0,
  resources = [],
  findings = [],
}: {
  totalAssets: number;
  azureAssets: number;
  awsAssets: number;
  gcpAssets: number;
  ociAssets: number;
  oracleSaasAssets?: number;
  resources?: any[];
  findings?: any[];
}) {
  const safeTotal = Math.max(1, totalAssets);
  const azPct = Math.round((azureAssets / safeTotal) * 100);
  const awsPct = Math.round((awsAssets / safeTotal) * 100);
  const gcpPct = Math.round((gcpAssets / safeTotal) * 100);
  const ociPct = Math.round((ociAssets / safeTotal) * 100);
  const saasPct = Math.round((oracleSaasAssets / safeTotal) * 100);

  // Shared bucketing so a resource and a finding for the same real service (e.g. "keyvault")
  // land in the same group — this is what lets us compute a real health status per group below.
  const classifyServiceKey = (serviceStr: string): string => {
    const s = serviceStr.toLowerCase();
    if (s.includes("defender") || s.includes("security") || s.includes("pricing")) return "defender";
    if (s.includes("iam") || s.includes("role") || s.includes("authorization") || s.includes("identity")) return "iam";
    if (s.includes("network") || s.includes("nsg") || s.includes("vnet") || s.includes("subnet") || s.includes("watcher")) return "network";
    if (s.includes("keyvault") || s.includes("vault") || s.includes("secret")) return "keyvault";
    if (s.includes("app") || s.includes("web") || s.includes("site")) return "app";
    if (s.includes("vm") || s.includes("compute") || s.includes("virtualmachine") || s.includes("disk")) return "compute";
    if (s.includes("policy")) return "policy";
    if (s.includes("storage") || s.includes("blob") || s.includes("bucket")) return "storage";
    return "other";
  };

  // Real per-group fail count, derived from the same findings shown elsewhere on the
  // dashboard — a group only shows "Audited" (healthy) when it genuinely has zero real
  // FAIL findings, instead of that label being hardcoded regardless of actual status.
  const failCountByKey = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of findings) {
      if (String(f.status || "").toUpperCase() !== "FAIL") continue;
      const s = String(f.check_metadata?.servicename || f.service || "").toLowerCase();
      const key = classifyServiceKey(s);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [findings]);

  const services = useMemo(() => {
    if (!resources || resources.length === 0) {
      return [];
    }

    const map = new Map<string, { name: string; icon: any; count: number; provider: string; key: string }>();

    for (const r of resources) {
      const s = String(r.service || r.service_name || r.type || "").toLowerCase();
      const key = classifyServiceKey(s);
      let name = "Discovered Cloud Assets";
      let prov = String(r.provider || r.provider_type || "Azure").toUpperCase();
      let icon = Server;

      if (key === "defender") {
        name = "Defender for Cloud & Security Posture";
        prov = "Microsoft Defender";
        icon = ShieldCheck;
      } else if (key === "iam") {
        name = "Entra ID & Identity Role Assignments";
        prov = prov.includes("OCI") || prov.includes("ORACLE") ? "OCI Identity" : "Azure IAM / Entra ID";
        icon = Lock;
      } else if (key === "network") {
        name = "Network Security Groups & VNets";
        prov = "Azure Virtual Network";
        icon = Globe;
      } else if (key === "keyvault") {
        name = "Key Vaults & Cryptographic Secrets";
        prov = "Azure Key Vault";
        icon = Lock;
      } else if (key === "app") {
        name = "App Services & Cloud Workloads";
        prov = "Azure App Service";
        icon = Globe;
      } else if (key === "compute") {
        name = "Virtual Machines & Disks";
        prov = "Azure Compute";
        icon = Server;
      } else if (key === "policy") {
        name = "OCI Tenancy IAM Policies";
        prov = "Oracle Cloud IAM";
        icon = Lock;
      } else if (key === "storage") {
        name = "Storage Accounts & Object Stores";
        prov = "Cloud Storage";
        icon = Database;
      }

      if (!map.has(key)) {
        map.set(key, { name, icon, count: 0, provider: prov, key });
      }
      map.get(key)!.count += 1;
    }

    return Array.from(map.values())
      .map((entry) => {
        const fails = failCountByKey.get(entry.key) || 0;
        return {
          ...entry,
          health: fails > 0 ? `${fails} Failing` : "Audited",
          healthy: fails === 0,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [resources]);

  return (
    <div className="space-y-4 py-3">
      {/* Cloud Distribution Bar */}
      <div className="rounded-xl border border-border/60 bg-surface-2/40 p-4">
        <div className="flex items-center justify-between text-xs font-semibold text-foreground mb-2">
          <span>Multi-Cloud Asset Distribution</span>
          <span className="font-mono text-primary">{totalAssets.toLocaleString()} Total Discovered Assets</span>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-3">
          {azureAssets > 0 && <div style={{ width: `${azPct}%` }} className="bg-sky-400" title={`Azure (${azPct}%)`} />}
          {awsAssets > 0 && <div style={{ width: `${awsPct}%` }} className="bg-amber-400" title={`AWS (${awsPct}%)`} />}
          {gcpAssets > 0 && <div style={{ width: `${gcpPct}%` }} className="bg-emerald-400" title={`GCP (${gcpPct}%)`} />}
          {ociAssets > 0 && <div style={{ width: `${ociPct}%` }} className="bg-rose-400" title={`OCI (${ociPct}%)`} />}
          {oracleSaasAssets > 0 && <div style={{ width: `${saasPct}%` }} className="bg-red-500" title={`Oracle SaaS (${saasPct}%)`} />}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-400" /> Microsoft Azure ({azureAssets} · {azPct}%)</span>
          {ociAssets > 0 && (
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-400" /> Oracle Cloud ({ociAssets} · {ociPct}%)</span>
          )}
          {oracleSaasAssets > 0 && (
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> Oracle SaaS ({oracleSaasAssets} · {saasPct}%)</span>
          )}
          {awsAssets > 0 ? (
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> AWS ({awsAssets} · {awsPct}%)</span>
          ) : (
            <span className="flex items-center gap-1.5 text-muted-foreground/60"><span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> AWS (0)</span>
          )}
          {gcpAssets > 0 ? (
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Google Cloud ({gcpAssets} · {gcpPct}%)</span>
          ) : (
            <span className="flex items-center gap-1.5 text-muted-foreground/60"><span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> Google Cloud (0)</span>
          )}
        </div>
      </div>

      {/* Services Grid */}
      {services.length === 0 && (
        <div className="rounded-xl border border-border/60 bg-surface-2/30 p-6 text-center text-xs text-muted-foreground">
          No resources discovered yet for this selection. Run a scan to populate the asset inventory.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {services.map((svc, i) => {
          const Icon = svc.icon;
          return (
            <div key={i} className="flex items-center justify-between rounded-xl border border-border bg-surface-2/30 p-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">{svc.name}</div>
                  <div className="text-[10px] text-muted-foreground">{svc.provider}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono font-bold text-foreground">{svc.count}</div>
                <div className={`text-[10px] font-semibold ${svc.healthy ? "text-emerald-400" : "text-rose-400"}`}>{svc.health}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Risk Pipeline Sankey Flow Component ── */
function RiskPipelineView({ findings, providers }: { findings: any[]; providers: any[] }) {
  const pipelineData = useMemo(() => {
    const rawList = Array.isArray(findings) ? findings : [];
    const totalFindings = rawList.length;

    const failCount = rawList.filter((f) => String(f.status || "").toUpperCase() === "FAIL").length;
    const passCount = rawList.filter((f) => String(f.status || "").toUpperCase() === "PASS").length;

    // Severity Breakdown
    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;
    let info = 0;

    const providerMap = new Map<string, { name: string; count: number; fail: number; critical: number; high: number; medium: number; low: number }>();
    const serviceWatchlistMap = new Map<string, number>();

    for (const f of rawList) {
      const sev = String(f.severity || f.check_metadata?.severity || "medium").toLowerCase();
      const status = String(f.status || "").toUpperCase();

      if (sev === "critical") critical += 1;
      else if (sev === "high") high += 1;
      else if (sev === "medium") medium += 1;
      else if (sev === "low") low += 1;
      else info += 1;

      // Deduce Provider Name & Canonical Label
      let rawProv = String(f.provider || f.provider_type || f.check_metadata?.provider || "").toUpperCase();
      const uid = String(f.uid || f.resource_uid || "").toLowerCase();

      if (!rawProv || rawProv === "UNKNOWN") {
        if (uid.includes("/subscriptions/")) rawProv = "AZURE";
        else if (uid.includes("saas") || uid.includes("hcm") || uid.includes("fusion") || uid.includes("oracle_saas")) rawProv = "ORACLE_SAAS";
        else if (uid.includes("ocid1.") || uid.includes("oraclecloud")) rawProv = "OCI";
        else rawProv = "AZURE";
      }

      let provLabel = "Microsoft Azure";
      let canonicalKey = "AZURE";

      if (rawProv.includes("SAAS") || rawProv.includes("FUSION") || rawProv.includes("HCM") || rawProv.includes("ERP")) {
        provLabel = "Oracle SaaS (HCM/ERP)";
        canonicalKey = "ORACLE_SAAS";
      } else if (rawProv.includes("OCI") || rawProv.includes("ORACLECLOUD") || rawProv.includes("ORACLE_CLOUD")) {
        provLabel = "Oracle Cloud (OCI)";
        canonicalKey = "OCI";
      } else if (rawProv.includes("AZURE")) {
        provLabel = "Microsoft Azure";
        canonicalKey = "AZURE";
      } else if (rawProv.includes("AWS")) {
        provLabel = "Amazon Web Services";
        canonicalKey = "AWS";
      } else if (rawProv.includes("GCP")) {
        provLabel = "Google Cloud Platform";
        canonicalKey = "GCP";
      } else if (rawProv.includes("ORACLE")) {
        provLabel = "Oracle SaaS (HCM/ERP)";
        canonicalKey = "ORACLE_SAAS";
      }

      if (!providerMap.has(canonicalKey)) {
        providerMap.set(canonicalKey, { name: provLabel, count: 0, fail: 0, critical: 0, high: 0, medium: 0, low: 0 });
      }
      const pEntry = providerMap.get(canonicalKey)!;
      pEntry.count += 1;
      if (status === "FAIL") pEntry.fail += 1;
      if (sev === "critical") pEntry.critical += 1;
      if (sev === "high") pEntry.high += 1;
      if (sev === "medium") pEntry.medium += 1;
      if (sev === "low") pEntry.low += 1;

      // Extract Service for Watchlist
      const svc = String(f.check_metadata?.servicename || f.service || "iam").toLowerCase();
      if (status === "FAIL") {
        serviceWatchlistMap.set(svc, (serviceWatchlistMap.get(svc) || 0) + 1);
      }
    }

    const activeProviders = Array.from(providerMap.values());
    const watchlist = Array.from(serviceWatchlistMap.entries())
      .map(([service, count]) => ({ service, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalFindings,
      failCount: totalFindings > 0 ? failCount : 0,
      passCount: totalFindings > 0 ? passCount : 0,
      critical,
      high,
      medium,
      low,
      info,
      providers: activeProviders,
      watchlist,
    };
  }, [findings, providers]);

  const safeTotal = Math.max(1, pipelineData.totalFindings);

  // Real proportional layout for the Sankey flow bands and severity nodes — each band's
  // thickness (and each node's height) is computed from its real share of total severity
  // findings, instead of fixed pixel values that don't reflect the actual data. A minimum
  // height keeps every row readable, but only a nonzero real count ever draws a flow band.
  const bandLayout = useMemo(() => {
    const order: Array<{ key: "critical" | "high" | "medium" | "low"; count: number; gradient: string; label: string; stroke: string; text: string }> = [
      { key: "critical", count: pipelineData.critical, gradient: "url(#flowBandCritical)", label: "Critical", stroke: "#f43f5e", text: "#f43f5e" },
      { key: "high", count: pipelineData.high, gradient: "url(#flowBandHigh)", label: "High", stroke: "#ea580c", text: "#ea580c" },
      { key: "medium", count: pipelineData.medium, gradient: "url(#flowBandMedium)", label: "Medium", stroke: "#eab308", text: "#eab308" },
      { key: "low", count: pipelineData.low, gradient: "url(#flowBandLow)", label: "Low", stroke: "#38bdf8", text: "#38bdf8" },
    ];
    const severityTotal = Math.max(1, pipelineData.critical + pipelineData.high + pipelineData.medium + pipelineData.low);
    const top = 10;
    const bottom = 216;
    const available = bottom - top;
    const MIN_H = 14;
    // First pass: raw proportional heights, floored at MIN_H so every row stays readable.
    const raw = order.map((o) => Math.max(MIN_H, (o.count / severityTotal) * available));
    const rawSum = raw.reduce((a, b) => a + b, 0);
    // Scale back down to fit the available space if the floor pushed the total over it.
    const scale = rawSum > available ? available / rawSum : 1;
    let cursor = top;
    return order.map((o, i) => {
      const height = raw[i] * scale;
      const startY = cursor;
      cursor += height;
      return { ...o, startY, height, endY: startY + height };
    });
  }, [pipelineData]);

  return (
    <div className="space-y-4 py-3">
      {/* Top Banner KPI Cards - 100% Real Live Telemetry */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-surface-2/30 p-3 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground">Total Findings</span>
          <div className="font-mono text-xl font-bold text-foreground mt-1">
            {pipelineData.totalFindings.toLocaleString()}
          </div>
          <span className="text-[10px] text-muted-foreground">Evaluated Security Checks</span>
        </div>

        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-rose-400">Fail Findings</span>
          <div className="font-mono text-xl font-bold text-rose-400 mt-1">
            {pipelineData.failCount.toLocaleString()}
          </div>
          <span className="text-[10px] text-rose-300 font-mono">Action Required</span>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-emerald-400">Pass Findings</span>
          <div className="font-mono text-xl font-bold text-emerald-400 mt-1">
            {pipelineData.passCount.toLocaleString()}
          </div>
          <span className="text-[10px] text-emerald-300 font-mono">
            {pipelineData.totalFindings > 0 ? Math.round((pipelineData.passCount / safeTotal) * 100) : 0}% Verified
          </span>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-amber-400">High Risk Surface</span>
          <div className="font-mono text-xl font-bold text-amber-400 mt-1">
            {pipelineData.critical + pipelineData.high}
          </div>
          <span className="text-[10px] text-amber-300 font-mono">Critical & High Vulnerabilities</span>
        </div>
      </div>

      {/* Main Sankey Flow Graph & Watchlist Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-stretch">
        {/* Left 3 Columns: Interactive SVG Sankey Flow Graph */}
        <div className="lg:col-span-3 rounded-2xl border border-cyan-900/40 bg-[#070d19] p-4 flex flex-col justify-between shadow-xl min-h-[300px]">
          <div className="flex items-center justify-between text-xs font-semibold text-foreground mb-2 border-b border-border/60 pb-2">
            <span className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-amber-400" />
              <span>Multi-Cloud Risk Pipeline (Severity Flow)</span>
            </span>
            <span className="font-mono text-[11px] text-cyan-300">
              Live Flow Bands: Connected Providers &rarr; Database Severities
            </span>
          </div>

          <div className="relative w-full h-[240px]">
            <svg viewBox="0 0 680 230" className="w-full h-full select-none">
              <defs>
                <linearGradient id="flowBandCritical" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#e11d48" stopOpacity="0.9" />
                </linearGradient>

                <linearGradient id="flowBandHigh" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#d97706" stopOpacity="0.75" />
                  <stop offset="100%" stopColor="#ea580c" stopOpacity="0.85" />
                </linearGradient>

                <linearGradient id="flowBandMedium" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#eab308" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#ca8a04" stopOpacity="0.8" />
                </linearGradient>

                <linearGradient id="flowBandLow" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#0284c7" stopOpacity="0.75" />
                </linearGradient>
              </defs>

              {/* Dynamic Flow Bands (Bezier Curve Ribbons) — thickness is each severity's
                  real proportional share of total findings; a band only appears at all
                  when that severity has at least one real finding. */}
              <g>
                {bandLayout.filter((b) => b.count > 0).map((b) => {
                  const swoosh = 6;
                  return (
                    <path
                      key={b.key}
                      d={`M 150 ${b.startY} C 310 ${b.startY}, 370 ${b.startY - swoosh}, 520 ${b.startY - swoosh} L 520 ${b.endY - swoosh} C 370 ${b.endY - swoosh}, 310 ${b.endY}, 150 ${b.endY} Z`}
                      fill={b.gradient}
                      className="transition-opacity hover:opacity-95 cursor-pointer"
                    />
                  );
                })}
              </g>

              {/* Left Column: Cloud Provider Nodes */}
              <g transform="translate(10, 15)">
                {pipelineData.providers.length > 0 ? (
                  pipelineData.providers.slice(0, 3).map((p, idx) => (
                    <g key={idx} transform={`translate(0, ${idx * 65})`}>
                      <rect x="0" y="0" width="140" height="55" rx="8" fill="#1e293b" stroke="#f59e0b" strokeWidth="2" />
                      <text x="12" y="24" fill="#ffffff" fontSize="11" fontWeight="bold" fontFamily="sans-serif">
                        {p.name.slice(0, 20)}
                      </text>
                      <text x="12" y="42" fill="#cbd5e1" fontSize="10" fontFamily="monospace">
                        {p.count} Findings ({p.fail} Fail)
                      </text>
                    </g>
                  ))
                ) : (
                  <g>
                    <rect x="0" y="0" width="140" height="150" rx="8" fill="#1e293b" stroke="#f59e0b" strokeWidth="2" />
                    <text x="12" y="45" fill="#ffffff" fontSize="12" fontWeight="bold">
                      Oracle SaaS
                    </text>
                    <text x="12" y="65" fill="#cbd5e1" fontSize="11" fontFamily="monospace">
                      {pipelineData.totalFindings} Findings
                    </text>
                  </g>
                )}
              </g>

              {/* Right Column: Severity Nodes — box height matches each severity's real
                  proportional share (same layout the flow bands use), so a category with
                  more real findings visibly takes up more space than one with fewer. */}
              <g transform="translate(520, 10)">
                {bandLayout.map((b) => (
                  <g key={b.key}>
                    <rect x="0" y={b.startY - 10} width="140" height={b.height} rx="6" fill="#1e293b" stroke={b.stroke} strokeWidth={b.key === "low" ? 1.5 : 2} />
                    <text x="12" y={b.startY - 10 + b.height / 2 + 4} fill={b.text} fontSize={b.height > 40 ? "12" : "10.5"} fontWeight="bold" fontFamily="monospace">
                      {b.label} ({b.count})
                    </text>
                  </g>
                ))}
              </g>
            </svg>
          </div>
        </div>

        {/* Right Column: Service Watchlist matching screenshot */}
        <div className="lg:col-span-1 rounded-2xl border border-border bg-surface-2/30 p-4 flex flex-col justify-between shadow-md">
          <div>
            <div className="text-xs font-bold text-foreground mb-3 flex items-center justify-between border-b border-border/60 pb-2">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Service Watchlist
              </span>
              <span className="mono text-[10px] text-rose-400 font-bold">Risk Items</span>
            </div>

            <div className="space-y-2.5">
              {pipelineData.watchlist.length > 0 ? (
                pipelineData.watchlist.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-xl bg-surface-2/60 px-3 py-2 text-xs border border-border/40">
                    <span className="font-mono font-bold text-foreground uppercase text-[11px] truncate">
                      {item.service}
                    </span>
                    <span className="mono font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 text-[11px]">
                      {item.count}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground italic py-4 text-center">
                  No active failing services detected
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-2 border-t border-border/40 text-[10px] text-muted-foreground text-center">
            Updated in real-time from continuous cloud assessment scans
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Speedometer Semi-Circle Gauge Component with Smooth Startup Animation ── */
function ThreatMapView({ findings }: { findings: any[] }) {
  const threatAnalysis = useMemo(() => {
    const regionMap = new Map<string, { name: string; code: string; total: number; fail: number; critical: number; high: number; provider: string }>();
    const mitreMap = new Map<string, number>();
    const topThreatsList: any[] = [];

    if (findings && findings.length > 0) {
      for (const f of findings) {
        let regCode = String(f.region || f.resource_regions?.[0] || f.check_metadata?.region || "").toLowerCase().trim();
        if (!regCode || regCode === "none") regCode = "global";

        let regName = regCode;
        let prov = String(f.provider || f.provider_type || f.check_metadata?.provider || "").toUpperCase();
        if (regCode === "centralindia" || regCode === "central india") {
          regName = "Central India (Azure)";
          prov = "Azure";
        } else if (regCode === "uk-london-1") {
          regName = "UK London (Oracle Cloud)";
          prov = "Oracle Cloud";
        } else if (regCode === "global") {
          regName = "Global Multi-Cloud IAM & Edge";
          prov = "Multi-Cloud";
        } else if (regCode === "us-east-1" || regCode === "eastus") {
          regName = "US East (Azure / AWS)";
          prov = prov.includes("AZURE") ? "Azure" : "AWS";
        }

        if (!regionMap.has(regCode)) {
          regionMap.set(regCode, { name: regName, code: regCode, total: 0, fail: 0, critical: 0, high: 0, provider: prov });
        }
        const entry = regionMap.get(regCode)!;
        entry.total += 1;

        if (f.status === "FAIL") {
          entry.fail += 1;
          const sev = String(f.severity || f.check_metadata?.severity || "").toLowerCase();
          if (sev === "critical") entry.critical += 1;
          if (sev === "high") entry.high += 1;

          const title = f.check_metadata?.checktitle || f.check_metadata?.check_title || f.check_id || "Cloud Vulnerability";
          const service = (f.check_metadata?.servicename || f.service || "Cloud Service").toUpperCase();
          const remediation = f.check_metadata?.remediation?.recommendation?.text || f.risk || "Remediation policy pending";

          if (topThreatsList.length < 5) {
            topThreatsList.push({
              id: f.id || f.uid,
              title,
              service,
              severity: sev || "high",
              region: regCode,
              remediation: String(remediation).slice(0, 100) + "...",
            });
          }

          const mitreList = f.check_metadata?.compliance?.["MITRE-ATTACK"] || [];
          if (Array.isArray(mitreList)) {
            for (const tech of mitreList) {
              mitreMap.set(String(tech), (mitreMap.get(String(tech)) || 0) + 1);
            }
          }
        }
      }
    }

    const regionsList = Array.from(regionMap.values()).map((reg) => {
      const score = reg.total > 0 ? Math.round(((reg.total - reg.fail) / reg.total) * 100) : 100;
      const risk = reg.fail > 20 ? "Critical Exposure" : reg.fail > 5 ? "Elevated Threat" : reg.fail > 0 ? "Guarded" : "Optimal";
      const color = score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-rose-400";
      const dot = score >= 80 ? "bg-emerald-400" : score >= 60 ? "bg-amber-400" : "bg-rose-400";
      return { ...reg, score, risk, color, dot };
    }).sort((a, b) => b.fail - a.fail);

    const mitreTechniques = Array.from(mitreMap.entries()).map(([tech, count]) => ({
      tech,
      count,
    })).sort((a, b) => b.count - a.count).slice(0, 4);

    return {
      regions: regionsList,
      mitreTechniques,
      topThreats: topThreatsList,
    };
  }, [findings]);

  return (
    <div className="space-y-4 py-3">
      {/* Interactive SVG World Threat Map Component */}
      <WorldThreatMap regions={threatAnalysis.regions} />

      {/* Header Banner */}
      <div className="rounded-xl border border-border/60 bg-surface-2/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground mb-0.5">
            <Radio className="h-3.5 w-3.5 text-rose-500 animate-pulse" />
            <span>Cloud Perimeter Threat Map & MITRE ATT&CK Exposure Matrix</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Live threat vectors and vulnerability distribution fetched directly from backend database scans
          </p>
        </div>
        {threatAnalysis.mitreTechniques.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {threatAnalysis.mitreTechniques.map((m, idx) => (
              <span key={idx} className="mono text-[10px] font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded-md whitespace-nowrap">
                MITRE {m.tech} ({m.count})
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Regional Exposure Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {threatAnalysis.regions.map((reg, i) => (
          <div key={i} className="flex flex-col justify-between rounded-xl border border-border bg-surface-2/30 p-3.5 text-xs">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${reg.dot}`} />
                  {reg.name}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground">{reg.code} &bull; {reg.provider}</div>
              </div>
              <span className={`font-mono text-xs font-bold ${reg.color}`}>
                {reg.score}% Posture Health
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-[11px]">
              <span className="text-muted-foreground">
                Active Violations: <strong className="text-rose-400 font-mono font-bold">{reg.fail}</strong> <span className="text-muted-foreground/70">/ {reg.total}</span>
              </span>
              <span className="rounded bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 font-bold text-rose-400 text-[10px]">
                {reg.risk}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Real Live Database Threat Feed Table */}
      {threatAnalysis.topThreats.length > 0 && (
        <div className="rounded-xl border border-border bg-surface-2/20 p-3.5">
          <div className="text-xs font-bold text-foreground mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-rose-400" />
              Active Database Threat Inventory ({threatAnalysis.topThreats.length})
            </span>
            <Link to="/findings" className="text-[11px] text-primary hover:underline font-semibold">
              View All Findings &rarr;
            </Link>
          </div>

          <div className="divide-y divide-border/60">
            {threatAnalysis.topThreats.map((t: any, idx: number) => (
              <div key={idx} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-foreground truncate">{t.title}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{t.remediation}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="mono text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20 uppercase">
                    {t.service}
                  </span>
                  <span className={`mono text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                    t.severity === "critical"
                      ? "text-rose-400 bg-rose-500/10 border border-rose-500/30"
                      : "text-amber-400 bg-amber-500/10 border border-amber-500/30"
                  }`}>
                    {t.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Speedometer Semi-Circle Gauge Component with Smooth Startup Animation ── */
function SpeedometerGauge({ score }: { score: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 120);
    return () => clearTimeout(t);
  }, []);

  const duration = 4000; // 4.0s slow smooth count-up
  const animatedScore = useCountUp(score, duration, mounted);

  const cx = 90;
  const cy = 80;
  const needleLength = 48;

  // Needle rotates from 0deg (pointing left at score 0) to (score / 100) * 180 deg
  const rotationDeg = mounted ? (score / 100) * 180 : 0;

  return (
    <div className="relative flex flex-col items-center justify-center pt-2">
      <svg className="w-[180px] h-[95px] overflow-visible" viewBox="0 0 180 95">
        <defs>
          <linearGradient id="speedoGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>

        {/* Background Track Arc */}
        <path
          d="M 20 80 A 70 70 0 0 1 160 80"
          fill="none"
          stroke="currentColor"
          className="text-border/80"
          strokeWidth="14"
          strokeLinecap="round"
        />

        {/* Full Gradient Speedometer Arc */}
        <path
          d="M 20 80 A 70 70 0 0 1 160 80"
          fill="none"
          stroke="url(#speedoGradient)"
          strokeWidth="14"
          strokeLinecap="round"
        />

        {/* Needle with Smooth CSS Transform Rotation (4s duration) */}
        <g
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            transform: `rotate(${rotationDeg}deg)`,
            transition: "transform 4s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Main needle pointing left at 0deg (toward 20, 80) */}
          <line
            x1={cx}
            y1={cy}
            x2={cx - needleLength}
            y2={cy}
            stroke="#06b6d4"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </g>

        {/* Center Hub */}
        <circle cx={cx} cy={cy} r="6" fill="currentColor" className="text-surface-2" stroke="#06b6d4" strokeWidth="2.5" />
      </svg>

      <div className="text-center -mt-2">
        <div className="font-mono text-2xl font-black text-foreground">
          {animatedScore}
        </div>
        <div className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
          Threat Score
        </div>
      </div>
    </div>
  );
}

/* ── Donut Chart Component with Startup Animation & Guaranteed Visibility ── */
function FindingsDonutChart({
  passCount,
  failCount,
  mutedCount,
}: {
  passCount: number;
  failCount: number;
  mutedCount: number;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 200);
    return () => clearTimeout(t);
  }, []);

  const isZero = passCount === 0 && failCount === 0 && mutedCount === 0;
  const total = Math.max(1, passCount + failCount + mutedCount);
  const passPct = (passCount / total) * 100;
  const failPct = (failCount / total) * 100;
  const mutedPct = (mutedCount / total) * 100;

  const animatedPct = useCountUp(Math.round(passPct), 4500, mounted);

  const radius = 38;
  const circ = 2 * Math.PI * radius;

  const passDash = mounted ? (passPct / 100) * circ : 0;
  const failDash = mounted ? (failPct / 100) * circ : 0;
  const mutedDash = mounted ? (mutedPct / 100) * circ : 0;

  return (
    <div className="relative flex items-center justify-center h-28 w-28 shrink-0">
      <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100">
        {/* Background Track Circle */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-border/60"
          strokeWidth="10"
        />

        {/* Pass Segment (4.5s transition) */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#10b981"
          strokeWidth="10"
          strokeDasharray={`${passDash} ${circ}`}
          strokeDashoffset="0"
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 4.5s cubic-bezier(0.16, 1, 0.3, 1)" }}
        />

        {/* Fail Segment (4.5s transition) */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#f43f5e"
          strokeWidth="10"
          strokeDasharray={`${failDash} ${circ}`}
          strokeDashoffset={-passDash}
          style={{ transition: "all 4.5s cubic-bezier(0.16, 1, 0.3, 1)" }}
        />

        {/* Muted Segment (4.5s transition) */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-slate-400"
          strokeWidth="10"
          strokeDasharray={`${mutedDash} ${circ}`}
          strokeDashoffset={-(passDash + failDash)}
          style={{ transition: "all 4.5s cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="font-mono text-xs font-bold text-foreground">
          {isZero ? "—" : `${animatedPct}%`}
        </div>
        <div className="text-[8px] font-bold text-muted-foreground uppercase">{isZero ? "No Data" : "Passing"}</div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: findingsRaw, isLoading: findingsLoading, refetch: refetchFindings } = useFindings();
  const { data: providersRaw, isLoading: providersLoading, refetch: refetchProviders } = useProviders();
  const { data: resourcesRaw } = useResources();
  const { data: remediationMetrics } = useRemediationMetrics();
  const { data: executionsRaw } = useRemediationExecutions();
  const { data: scansData, refetch: refetchScans } = useScans();
  const { data: attackPathsData, isLoading: attackPathsLoading } = useAttackPaths();

  const [selectedProviderId, setSelectedProviderId] = useState<string>("ALL");
  const [activeTab, setActiveTab] = useState<"risk" | "radar" | "asset">("risk");
  const [syncing, setSyncing] = useState(false);
  const [radarHoverIdx, setRadarHoverIdx] = useState<number | null>(null);

  const handleSyncState = async () => {
    setSyncing(true);
    await Promise.all([
      refetchFindings(),
      refetchProviders ? refetchProviders() : Promise.resolve(),
      refetchScans()
    ]);
    setTimeout(() => setSyncing(false), 600);
  };

  // Real Database Telemetry Computations
  const rawFindings = findingsRaw?.items ?? [];
  const providers = (providersRaw?.items as Array<Record<string, unknown>>) ?? [];
  const resources = resourcesRaw?.items ?? [];

  // Filter by selected provider if not ALL
  const filteredFindings = useMemo(() => {
    if (selectedProviderId === "ALL") return rawFindings;
    const selectedProvider = providers.find((p) => String(p.id) === String(selectedProviderId));
    const selectedType = String(selectedProvider?.provider || selectedProvider?.provider_type || "").toLowerCase();

    return rawFindings.filter((f: any) => {
      // 1. Direct provider_id UUID matching
      const fProvId = String(f.provider_id || f.provider?.id || f.scan?.provider_id || f.scan?.provider?.id || "");
      if (fProvId && fProvId === String(selectedProviderId)) return true;

      // 2. Provider type string matching & Resource UIDs
      const fType = String(f.scan?.provider?.provider || f.provider || f.provider_type || f.check_metadata?.provider || f.raw_result?.Provider || "").toLowerCase();
      const resUid = String(f.resources?.[0]?.uid || f.resource_uid || f.uid || f.check_id || "").toLowerCase();

      // Oracle SaaS (Fusion ERP/HCM)
      if (selectedType.includes("saas") || selectedType === "oracle_saas" || selectedType === "oracle_fusion_saas") {
        return fType.includes("saas") || fType.includes("fusion") || resUid.includes("erp_") || resUid.includes("fusion") || resUid.includes("oracle_saas");
      }

      // OCI (Oracle Cloud Infrastructure)
      if (selectedType === "oci" || selectedType === "oraclecloud" || selectedType === "oracle_cloud") {
        return (fType === "oci" || fType === "oraclecloud" || resUid.includes("ocid1.")) && !fType.includes("saas") && !resUid.includes("erp_") && !resUid.includes("fusion");
      }

      // Azure
      if (selectedType.includes("azure")) {
        return fType.includes("azure") || resUid.includes("/subscriptions/") || resUid.includes("azure");
      }

      // AWS
      if (selectedType.includes("aws")) {
        return fType.includes("aws") || resUid.includes("arn:aws:");
      }

      // GCP
      if (selectedType.includes("gcp")) {
        return fType.includes("gcp") || resUid.includes("projects/");
      }

      return fType === selectedType || fType.includes(selectedType);
    });
  }, [rawFindings, selectedProviderId, providers]);

  const selectedProviderObj = useMemo(() => {
    if (selectedProviderId === "ALL") return null;
    return providers.find((p) => (p.id as string) === selectedProviderId);
  }, [providers, selectedProviderId]);

  const providersCount = providers.length;
  const onlineCount = providers.filter((p: any) => p.connection?.connected === true).length;
  const connectedProviderTypes = useMemo(
    () => Array.from(new Set(providers.map((p: any) => String(p.provider || "").toLowerCase()).filter(Boolean))),
    [providers]
  );
  const attackPathsScans = (attackPathsData?.items as Array<Record<string, any>>) ?? [];
  const readyAttackPathsCount = attackPathsScans.filter((s: any) => s.graph_data_ready).length;

  // Real per-framework compliance data (same endpoint /compliance uses) — needed both for
  // the evaluated-framework KPI below and for the Radar Posture chart's real per-framework scores.
  const complianceOverviewParams = useMemo(() => {
    if (connectedProviderTypes.length === 0) return undefined;
    const params: Record<string, string> = {};
    if (selectedProviderObj) {
      params["filter[provider_type]"] = String(selectedProviderObj.provider || "").toLowerCase();
    } else {
      params["filter[provider_type__in]"] = connectedProviderTypes.join(",");
    }
    return params;
  }, [connectedProviderTypes, selectedProviderObj]);
  const { data: dashboardComplianceData } = useCompliance(complianceOverviewParams);
  const realComplianceFrameworks = useMemo(() => {
    const items = (dashboardComplianceData?.items as Array<Record<string, any>>) ?? [];
    return items.map((item) => {
      const passed = Number(item.requirements_passed) || 0;
      const failed = Number(item.requirements_failed) || 0;
      const total = Number(item.total_requirements) || 0;
      const evaluated = Math.max(1, passed + failed);
      return {
        name: String(item.framework || item.id || ""),
        score: total > 0 ? Math.round((passed / evaluated) * 100) : 0,
      };
    });
  }, [dashboardComplianceData]);

  // Real live numbers from database findings
  const realPass = filteredFindings.filter((f: any) => f.status === "PASS").length;
  const realFail = filteredFindings.filter((f: any) => f.status === "FAIL").length;
  const realMuted = filteredFindings.filter((f: any) => f.status === "MUTED").length;
  const realCritical = filteredFindings.filter((f: any) => f.severity === "critical").length;
  const realHigh = filteredFindings.filter((f: any) => f.severity === "high").length;
  const realMedium = filteredFindings.filter((f: any) => f.severity === "medium").length;
  const realLow = filteredFindings.filter((f: any) => f.severity === "low").length;

  const totalFindingsCount = filteredFindings.length;
  const totalOpenFail = realFail;
  const totalPassCount = realPass;
  const totalMutedCount = realMuted;

  // Posture Score calculation directly from live findings
  const postureScore = totalFindingsCount > 0
    ? Math.round((totalPassCount / totalFindingsCount) * 100)
    : 0;

  // Dynamic Threat Score calculation directly from live exploitability & failed vulnerabilities
  const threatScore = totalFindingsCount > 0
    ? Math.min(100, Math.max(0, Math.round(100 - postureScore + (realCritical > 0 ? 8 : 0))))
    : 0;

  const threatRiskLevel = threatScore >= 70 ? "Critical Risk" : threatScore >= 45 ? "High Risk" : threatScore >= 25 ? "Moderate" : "Low Risk";

  // Dynamic framework radar labels depending on selected cloud provider
  const radarLabels = useMemo(() => {
    if (!selectedProviderObj) {
      return ["NCA ECC", "CIS Benchmark", "SOC 2", "ISO 27001", "PCI-DSS"];
    }
    const provStr = String(selectedProviderObj.provider || selectedProviderObj.provider_type || "").toUpperCase();
    if (provStr.includes("SAAS") || provStr.includes("FUSION")) {
      return ["Oracle SoD", "HCM Security", "BIP Export", "FSM Roles", "SOX 404"];
    } else if (provStr.includes("AZURE")) {
      return ["CIS Azure", "SOC 2", "ISO 27001", "NIST 800-53", "PCI-DSS"];
    } else if (provStr.includes("OCI") || provStr.includes("ORACLE")) {
      return ["CIS OCI", "NCA ECC", "SOC 2", "ISO 27001", "HIPAA"];
    } else {
      return ["CIS Benchmark", "NCA ECC", "SOC 2", "ISO 27001", "PCI-DSS"];
    }
  }, [selectedProviderObj]);

  // Radar chart data metrics — each axis gets its own real per-framework compliance score
  // (matched against realComplianceFrameworks by name), not a single repeated overall number.
  // An axis whose framework has no real compliance data yet honestly shows 0 rather than
  // borrowing the unrelated overall posture score.
  const radarData = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    return radarLabels.map((lbl) => {
      const normLabel = norm(lbl);
      const match = realComplianceFrameworks.find((fw) => {
        const normName = norm(fw.name);
        return normName.length > 0 && (normLabel.includes(normName) || normName.includes(normLabel));
      });
      return { label: lbl, value: match ? match.score : 0 };
    });
  }, [radarLabels, realComplianceFrameworks]);

  // Dynamically filter resources by selected provider
  const filteredResources = useMemo(() => {
    if (!resources || resources.length === 0) return [];
    if (selectedProviderId === "ALL") return resources;

    const provObj = providers.find((p) => String(p.id) === selectedProviderId);
    if (!provObj) return resources;
    const pType = String(provObj.provider || provObj.provider_type || "").toUpperCase();

    return resources.filter((r: any) => {
      if (r.provider_id && String(r.provider_id) === selectedProviderId) return true;
      const rProv = String(r.provider || r.provider_type || "").toUpperCase();
      if (rProv && (rProv === pType || (pType === "ORACLECLOUD" && rProv === "OCI"))) return true;
      const uid = String(r.uid || r.id || "").toLowerCase();
      if (pType.includes("AZURE") && (uid.includes("subscriptions/") || uid.includes("azure"))) return true;
      if (pType.includes("SAAS") && (uid.includes("oraclecloud.com") || uid.includes("fusion"))) return true;
      if ((pType.includes("OCI") || pType.includes("ORACLE")) && uid.includes("ocid1.")) return true;
      return false;
    });
  }, [resources, selectedProviderId, providers]);

  // Dynamically count resources per cloud provider from filtered DB telemetry
  const azureAssets = filteredResources.filter((r: any) => {
    const p = String(r.provider || r.provider_type || "").toUpperCase();
    const uid = String(r.uid || r.id || "");
    return p === "AZURE" || uid.includes("/subscriptions/") || uid.includes("prowler-azure-");
  }).length;

  const awsAssets = filteredResources.filter((r: any) => {
    const p = String(r.provider || r.provider_type || "").toUpperCase();
    return p === "AWS" || String(r.uid || "").includes("arn:aws:");
  }).length;

  const gcpAssets = filteredResources.filter((r: any) => {
    const p = String(r.provider || r.provider_type || "").toUpperCase();
    return p === "GCP" || String(r.uid || "").includes("projects/");
  }).length;

  const ociAssets = filteredResources.filter((r: any) => {
    const p = String(r.provider || r.provider_type || "").toUpperCase();
    return p === "OCI" || p === "ORACLECLOUD" || String(r.uid || "").includes("ocid1.");
  }).length;

  const oracleSaasAssets = filteredResources.filter((r: any) => {
    const p = String(r.provider || r.provider_type || "").toUpperCase();
    return p === "ORACLE_SAAS" || p === "ORACLE-SAAS" || String(r.uid || "").includes(".identity.oraclecloud.com");
  }).length;

  const totalDiscoveredAssets = filteredResources.length;

  // Real evaluated-framework count from the compliance backend (fetched above, alongside
  // the Radar Posture's real per-framework scores), instead of a findings-count stand-in.
  const evaluatedFrameworkCount = (dashboardComplianceData?.items as Array<unknown> | undefined)?.length ?? 0;

  // Startup Animation Trigger
  const [dashboardReady, setDashboardReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDashboardReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  // Animated KPI numbers
  const animPosture = useCountUp(postureScore, 4200, dashboardReady);
  const animClouds = useCountUp(providersCount, 3200, dashboardReady);
  const animCompliance = useCountUp(evaluatedFrameworkCount, 3600, dashboardReady);
  const animOpenFail = useCountUp(totalOpenFail, 4500, dashboardReady);

  // Animated Radar Breakdown Scores
  const animCis = useCountUp(radarData[0].value, 4000, dashboardReady);
  const animSoc2 = useCountUp(radarData[1].value, 4000, dashboardReady);
  const animIso = useCountUp(radarData[2].value, 4000, dashboardReady);
  const animNist = useCountUp(radarData[3].value, 4000, dashboardReady);
  const animPci = useCountUp(radarData[4].value, 4000, dashboardReady);

  // Animated Triage Counts
  const animPassCount = useCountUp(totalPassCount, 4200, dashboardReady);
  const animFailCount = useCountUp(totalOpenFail, 4200, dashboardReady);
  const animMutedCount = useCountUp(totalMutedCount, 3200, dashboardReady);

  return (
    <AppShell>
      <div className="space-y-6 pb-12">
        {/* ── Page Header ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Security Command Center
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              Multi-cloud posture monitoring, threat correlation, and automated triage
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Environment Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center gap-2 rounded-xl bg-surface-2 border border-border/80 px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-surface-3 transition-colors cursor-pointer shadow-sm">
                  <Cloud className="h-3.5 w-3.5 text-primary" />
                  <span>
                    {selectedProviderObj
                      ? `${selectedProviderObj.alias} (${((selectedProviderObj.provider as string) || "Cloud").toUpperCase()})`
                      : `All Cloud Environments (${providersCount})`}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 bg-surface border-border shadow-xl">
                <DropdownMenuLabel className="text-xs text-muted-foreground font-semibold">
                  Select Environment
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setSelectedProviderId("ALL")}
                  className="flex items-center justify-between text-xs cursor-pointer py-2"
                >
                  <span className="font-semibold">All Cloud Environments ({providersCount})</span>
                  {selectedProviderId === "ALL" && <Check className="h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {providers.map((p) => {
                  const pId = p.id as string;
                  const isSel = selectedProviderId === pId;
                  return (
                    <DropdownMenuItem
                      key={pId}
                      onClick={() => setSelectedProviderId(pId)}
                      className="flex items-center justify-between text-xs cursor-pointer py-2"
                    >
                      <div>
                        <div className="font-semibold text-foreground">{p.alias as string}</div>
                        <div className="text-[10px] text-muted-foreground uppercase">{p.provider as string}</div>
                      </div>
                      {isSel && <Check className="h-3.5 w-3.5 text-primary" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sync State Button */}
            <button
              onClick={handleSyncState}
              className="inline-flex items-center gap-1.5 rounded-xl bg-surface-2 border border-border/80 px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-surface-3 transition-colors active:scale-95 cursor-pointer shadow-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-primary ${syncing ? "animate-spin" : ""}`} />
              <span>Sync State</span>
            </button>

            {/* Launch Scan Button */}
            <Link
              to="/scans"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition-all active:scale-95"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Launch Scan</span>
            </Link>
          </div>
        </div>

        {/* ── Top 4 KPI Metrics Row with Startup Count-ups ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Security Posture */}
          <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/80 p-5 backdrop-blur-sm shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Security Posture
              </span>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="my-3 flex items-baseline gap-3">
              <span className="font-mono text-3xl font-black text-foreground">
                {animPosture}%
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {providersCount} cloud accounts actively guarded
            </div>
          </div>

          {/* Card 2: Connected Clouds */}
          <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/80 p-5 backdrop-blur-sm shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Connected Clouds
              </span>
              <Layers className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="my-3 flex items-center justify-between">
              <span className="font-mono text-3xl font-black text-foreground">
                {animClouds}
              </span>
              <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold">
                {connectedProviderTypes.slice(0, 3).map((t) => (
                  <span key={t} className="rounded bg-surface-2 px-1.5 py-0.5 text-foreground/80 uppercase">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{onlineCount} of {providersCount} online</span>
              <Link to="/providers" className="text-primary font-semibold hover:underline">
                Manage →
              </Link>
            </div>
          </div>

          {/* Card 3: Compliance Standards */}
          <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/80 p-5 backdrop-blur-sm shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Compliance Standards
              </span>
              <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div className="my-3 flex items-center justify-between">
              <span className="font-mono text-3xl font-black text-foreground">{animCompliance}</span>
              {/* Mini Sparkline */}
              <svg className="h-6 w-20" viewBox="0 0 80 24" fill="none">
                <path
                  d="M 2 20 Q 20 8, 40 14 T 78 4"
                  stroke="#34d399"
                  strokeWidth="2.5"
                  fill="none"
                />
              </svg>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{evaluatedFrameworkCount === 1 ? "1 framework evaluated" : `${evaluatedFrameworkCount} frameworks evaluated`}</span>
              <Link to="/compliance" className="text-primary font-semibold hover:underline">
                Audit →
              </Link>
            </div>
          </div>

          {/* Card 4: Open Findings (Exact Real Database Metrics with Animated Count-up) */}
          <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/80 p-5 backdrop-blur-sm shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Open Findings
              </span>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="my-3 flex items-baseline justify-between">
              <span className="font-mono text-3xl font-black text-foreground">
                {animOpenFail.toLocaleString()}
              </span>
              <span className="inline-flex items-center rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-400 border border-rose-500/20">
                {realCritical > 0 ? `${realCritical} Critical` : realHigh > 0 ? `${realHigh} High Risk` : "0 Open"}
              </span>
            </div>
            {/* Multi-color Stacked Severity Bar — real percentages, 0% stays 0% instead of a fake minimum width */}
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                style={{
                  width: dashboardReady && totalOpenFail > 0 ? `${(realCritical / totalOpenFail) * 100}%` : "0%",
                  transition: "width 3.8s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
                className="bg-rose-500"
                title="Critical"
              />
              <div
                style={{
                  width: dashboardReady && totalOpenFail > 0 ? `${(realHigh / totalOpenFail) * 100}%` : "0%",
                  transition: "width 4.1s cubic-bezier(0.16, 1, 0.3, 1) 0.2s",
                }}
                className="bg-orange-400"
                title="High"
              />
              <div
                style={{
                  width: dashboardReady && totalOpenFail > 0 ? `${(realMedium / totalOpenFail) * 100}%` : "0%",
                  transition: "width 4.4s cubic-bezier(0.16, 1, 0.3, 1) 0.4s",
                }}
                className="bg-amber-400"
                title="Medium"
              />
              <div
                style={{
                  width: dashboardReady && totalOpenFail > 0 ? `${(realLow / totalOpenFail) * 100}%` : "0%",
                  transition: "width 4.8s cubic-bezier(0.16, 1, 0.3, 1) 0.6s",
                }}
                className="bg-sky-400"
                title="Low"
              />
            </div>
          </div>
        </div>

        {/* ── Main Content Section 1: Security Posture & Real-time Telemetry (3-Column Grid) ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* ── Left 2 Columns: Radar / Asset / Threat Card ── */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-border/80 bg-surface/80 p-5 sm:p-6 backdrop-blur-sm shadow-md h-full flex flex-col justify-between">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3.5 shrink-0">
                <div>
                  <h3 className="font-display text-base font-bold text-foreground">
                    {activeTab === "risk" && "Risk Pipeline & Severity Flow"}
                    {activeTab === "radar" && "Security Posture Radar"}
                    {activeTab === "asset" && "Multi-Cloud Asset Volume Topology"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {activeTab === "risk" && "Flow bands connecting cloud accounts to finding severity levels"}
                    {activeTab === "radar" && "Top 5 Compliance Standards continuous assessment coverage"}
                    {activeTab === "asset" && "Real-time discovered resource inventory across connected clouds"}
                  </p>
                </div>

                <div className="flex items-center rounded-xl border border-border bg-surface-2/40 p-1 text-xs">
                  <button
                    onClick={() => setActiveTab("risk")}
                    className={`rounded-lg px-3 py-1 font-semibold transition-all cursor-pointer ${
                      activeTab === "risk"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Risk Pipeline
                  </button>
                  <button
                    onClick={() => setActiveTab("radar")}
                    className={`rounded-lg px-3 py-1 font-semibold transition-all cursor-pointer ${
                      activeTab === "radar"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Radar Posture
                  </button>
                  <button
                    onClick={() => setActiveTab("asset")}
                    className={`rounded-lg px-3 py-1 font-semibold transition-all cursor-pointer ${
                      activeTab === "asset"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Asset Volume
                  </button>
                </div>
              </div>

              {/* Tab 1: Risk Pipeline View (Sankey Flow Chart) */}
              {activeTab === "risk" && (
                <div className="flex-1 flex flex-col justify-between pt-2">
                  <RiskPipelineView findings={filteredFindings} providers={providers} />
                </div>
              )}

              {/* Tab 2: Pentagon Radar Chart with Expanded Scale & Bottom-Aligned Benchmarks */}
              {activeTab === "radar" && (
                <div className="flex-1 flex flex-col justify-between pt-2">
                  <div className="flex-1 flex items-center justify-center my-auto">
                    <RadarChart
                      data={radarData}
                      hoveredIdx={radarHoverIdx}
                      setHoveredIdx={setRadarHoverIdx}
                    />
                  </div>
                  <div className="mt-auto grid grid-cols-2 sm:grid-cols-5 gap-2.5 rounded-xl border border-border/60 bg-surface-2/40 p-3 text-center text-xs">
                    {radarData.map((d, i) => (
                      <div
                        key={i}
                        onMouseEnter={() => setRadarHoverIdx(i)}
                        onMouseLeave={() => setRadarHoverIdx(null)}
                        className={`rounded-lg p-1.5 transition-colors cursor-pointer ${
                          radarHoverIdx === i ? "bg-surface-3" : "hover:bg-surface-2/80"
                        }`}
                      >
                        <div className="text-muted-foreground text-[11px] truncate">{d.label}</div>
                        <div className="font-mono text-sm font-bold text-foreground mt-0.5">{d.value}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab 3: Asset Volume View */}
              {activeTab === "asset" && (
                <div className="flex-1 flex flex-col justify-between pt-2">
                  <AssetVolumeView
                    totalAssets={totalDiscoveredAssets}
                    azureAssets={azureAssets}
                    awsAssets={awsAssets}
                    gcpAssets={gcpAssets}
                    ociAssets={ociAssets}
                    oracleSaasAssets={oracleSaasAssets}
                    resources={filteredResources}
                    findings={filteredFindings}
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── Right Column (1/3): Threat Index, Triage & Attack Path ── */}
          <div className="flex flex-col justify-between gap-5">
            {/* Threat Index Card */}
            <div className="rounded-2xl border border-border/80 bg-surface/80 p-5 backdrop-blur-sm shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-sm font-bold text-foreground">
                    Threat Index
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Composite exploitability
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                  threatScore >= 60
                    ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    : threatScore >= 30
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                }`}>
                  {threatRiskLevel}
                </span>
              </div>

              <SpeedometerGauge score={threatScore} />
            </div>

            {/* Findings Triage Card (Exact Database Counts) */}
            <div className="rounded-2xl border border-border/80 bg-surface/80 p-5 backdrop-blur-sm shadow-sm">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div>
                  <h3 className="font-display text-sm font-bold text-foreground">
                    Findings Triage
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Resolution breakdown
                  </p>
                </div>
                <Link
                  to="/findings"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Explore →
                </Link>
              </div>

              <div className="mt-4 flex items-center justify-between gap-4">
                <FindingsDonutChart
                  passCount={totalPassCount}
                  failCount={totalOpenFail}
                  mutedCount={totalMutedCount}
                />

                <div className="space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      Pass:
                    </span>
                    <span className="font-bold text-foreground">
                      {animPassCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                      Fail:
                    </span>
                    <span className="font-bold text-foreground">
                      {animFailCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="h-2 w-2 rounded-full bg-slate-400" />
                      Muted:
                    </span>
                    <span className="font-bold text-foreground">
                      {animMutedCount}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Toxic Attack Path Detected Card */}
            <Link
              to="/attack-paths"
              className="group flex items-center justify-between rounded-2xl border border-border/80 bg-surface/80 p-4 backdrop-blur-sm hover:border-primary/50 transition-all hover:bg-surface shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
                  <GitBranch className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="font-display text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                    {readyAttackPathsCount > 0 ? "Explore Attack Graph" : "Attack Graph Not Ready"}
                  </h4>
                  <p className="text-[10px] text-muted-foreground">
                    {readyAttackPathsCount > 0 ? "Real resource graph available" : "Run a scan to build the graph"}
                  </p>
                </div>
              </div>

              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-muted-foreground border border-border">
                {readyAttackPathsCount} ready
              </span>
            </Link>
          </div>
        </div>

        {/* ── Main Content Section 2: Neo4j Attack Path Graph & AI Decision Core ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Neo4j Multi-Cloud Attack Path Graph Status (2 Columns) */}
          <div className="lg:col-span-2">
            <Neo4jAttackGraphCard
              scans={attackPathsScans}
              scansLoading={attackPathsLoading}
              selectedProviderObj={selectedProviderObj}
            />
          </div>

          {/* Spectra & Aegis Decision Core (1 Column) */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl border border-border/80 bg-surface/80 p-6 backdrop-blur-sm shadow-md h-full flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-display text-sm font-bold text-foreground">
                        Spectra & Aegis Core
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        Autonomous reasoning agent
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
                  Ask the AI advisor for remediation guidance grounded in your real findings and scan history.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="rounded-xl border border-border/60 bg-surface-2/40 p-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground">Open Findings</div>
                    <div className="font-bold text-foreground mt-0.5">{totalOpenFail.toLocaleString()}</div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-surface-2/40 p-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground">Cloud Accounts</div>
                    <div className="font-bold text-primary mt-0.5">{providersCount}</div>
                  </div>
                </div>
              </div>

              <Link
                to="/ai/advisor"
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-surface-2 border border-border px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-surface-3 hover:border-primary/50 transition-all shadow-sm"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span>Launch AI Security Advisor →</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
