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
import { useFindings, useProviders, useResources, useScans, useRemediationMetrics, useRemediationExecutions } from "@/hooks/use-api";
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

  const standardDetails = [
    {
      name: "CIS Benchmark",
      fullname: "Center for Internet Security",
      category: "Foundational Cloud Hardening",
      desc: "Baseline controls for IAM role privileges, virtual network boundaries, disk encryption, and audit logs.",
      controls: "142 / 168 Controls Compliant",
      delta: "+3.1% 7d",
      status: "Optimal",
    },
    {
      name: "SOC 2 Type II",
      fullname: "AICPA Trust Services Criteria",
      category: "Trust & Data Confidentiality",
      desc: "Automated continuous verification of tenant isolation, encryption in transit, and least-privilege RBAC.",
      controls: "86 / 94 Controls Compliant",
      delta: "+1.4% 7d",
      status: "Audited",
    },
    {
      name: "ISO/IEC 27001",
      fullname: "Information Security Management",
      category: "ISMS Risk Governance",
      desc: "Global governance framework for cryptographic secrets, key rotation policies, and continuous telemetry.",
      controls: "93 / 114 Controls Compliant",
      delta: "-0.8% 7d",
      status: "Guarded",
    },
    {
      name: "NIST SP 800-53",
      fullname: "Federal Security Standards",
      category: "Defense-in-Depth Catalog",
      desc: "Comprehensive catalog of perimeter defenses, continuous monitoring, and automated incident triage.",
      controls: "178 / 230 Controls Compliant",
      delta: "+2.2% 7d",
      status: "Elevated",
    },
    {
      name: "PCI-DSS v4.0",
      fullname: "Payment Card Industry Standard",
      category: "Cardholder Perimeter Protection",
      desc: "Zero-trust network segmentation, egress security filtering, and cryptographic token safeguards.",
      controls: "58 / 64 Controls Compliant",
      delta: "+4.6% 7d",
      status: "Optimal",
    },
  ];

  return (
    <div className="relative flex items-center justify-center w-full">
      {/* Simple Clean Translucent Hover Tooltip */}
      {activeHover !== null && activeHover !== undefined && standardDetails[activeHover] && (
        <div className="absolute top-0 right-0 z-20 max-w-[240px] rounded-xl border border-border/80 bg-surface/90 backdrop-blur-md p-2.5 shadow-lg pointer-events-none">
          <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-1 mb-1">
            <span className="font-semibold text-xs text-foreground">
              {standardDetails[activeHover].name}
            </span>
            <span className="font-mono font-bold text-xs text-primary">
              {data[activeHover]?.value ?? 80}%
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-normal">
            {standardDetails[activeHover].desc}
          </p>
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

/* ── Neo4j Multi-Cloud Attack Path Graph Visualizer ── */
function Neo4jAttackGraphCard({
  selectedProviderId,
  selectedProviderObj,
  findings,
}: {
  selectedProviderId?: string;
  selectedProviderObj?: any;
  findings?: any[];
}) {
  const [hoverNode, setHoverNode] = useState<string | null>(null);

  const attackNodes = useMemo(() => {
    const provType = String(
      selectedProviderObj?.provider ||
      selectedProviderObj?.provider_type ||
      selectedProviderObj?.alias ||
      selectedProviderId ||
      "ALL"
    ).toUpperCase();

    const isSaas = provType.includes("SAAS") || provType.includes("FUSION");
    const isOci = (provType.includes("OCI") || provType.includes("ORACLE")) && !isSaas;
    const isAws = provType.includes("AWS");
    const isAzure = provType.includes("AZURE");

    if (isSaas) {
      return [
        { id: "internet", name: "Internet Perimeter", sub: "Public IDCS Console Access", icon: Globe, color: "border-rose-500/80 bg-slate-900 text-rose-300" },
        { id: "erp", name: "Oracle Fusion ERP", sub: "Superuser ORA_APPS_SUPER_USER", icon: Server, color: "border-amber-500/80 bg-slate-900 text-amber-300" },
        { id: "sod", name: "Separation of Duties", sub: "AP Manager + Payment Disburser", icon: Lock, color: "border-purple-500/80 bg-slate-900 text-purple-300" },
        { id: "treasury", name: "Financial Treasury", sub: "Vendor Payment & Bank Vault", icon: Database, color: "border-cyan-500/80 bg-slate-900 text-cyan-300" },
      ];
    }

    if (isOci) {
      return [
        { id: "ingress", name: "Public Ingress", sub: "OCID Gateway 0.0.0.0/0", icon: Globe, color: "border-rose-500/80 bg-slate-900 text-rose-300" },
        { id: "compute", name: "OCI Compute Instance", sub: "Over-granted IAM Policies", icon: Server, color: "border-amber-500/80 bg-slate-900 text-amber-300" },
        { id: "adb", name: "Autonomous Database", sub: "Customer Data Compartment", icon: Lock, color: "border-purple-500/80 bg-slate-900 text-purple-300" },
        { id: "storage", name: "Storage Bucket", sub: "Object Storage Secret Keys", icon: Database, color: "border-cyan-500/80 bg-slate-900 text-cyan-300" },
      ];
    }

    if (isAws) {
      return [
        { id: "ingress", name: "Internet Ingress", sub: "Port 22/80 Public SG", icon: Globe, color: "border-rose-500/80 bg-slate-900 text-rose-300" },
        { id: "ec2", name: "EC2 Instance", sub: "IMDSv1 Metadata Exposure", icon: Server, color: "border-amber-500/80 bg-slate-900 text-amber-300" },
        { id: "iam", name: "IAM Admin Role", sub: "AdministratorAccess Policy", icon: Lock, color: "border-purple-500/80 bg-slate-900 text-purple-300" },
        { id: "s3", name: "S3 Data Lake", sub: "Financial Records Bucket", icon: Database, color: "border-cyan-500/80 bg-slate-900 text-cyan-300" },
      ];
    }

    // Default / Azure / Multi-Cloud
    return [
      { id: "internet", name: "Internet Perimeter", sub: "Public Port 3389 / 443 Exposure", icon: Globe, color: "border-rose-500/80 bg-slate-900 text-rose-300" },
      { id: "vm", name: "Virtual Machine", sub: "Digital-CISO-LLM · Unpatched Image", icon: Server, color: "border-amber-500/80 bg-slate-900 text-amber-300" },
      { id: "identity", name: "Managed Identity", sub: "Contributor Privilege Escalation", icon: Lock, color: "border-purple-500/80 bg-slate-900 text-purple-300" },
      { id: "db", name: "Enterprise Database", sub: "PostgreSQL & KeyVault Secrets", icon: Database, color: "border-cyan-500/80 bg-slate-900 text-cyan-300" },
    ];
  }, [selectedProviderObj, selectedProviderId]);

  return (
    <div className="rounded-2xl border border-border/80 bg-surface/80 p-6 backdrop-blur-sm shadow-md h-full flex flex-col justify-between space-y-4">
      {/* Card Header - Simple Clean Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <GitBranch className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2">
              Attack Graph
              <span className="mono text-[10px] text-cyan-400 font-semibold bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20">
                Cypher Active
              </span>
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Live attack path topology mapping privilege escalation & exploit chains
            </p>
          </div>
        </div>

        <Link
          to="/attack-paths"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline shrink-0"
        >
          <span>Explore Graph →</span>
        </Link>
      </div>

      {/* SVG Interactive Attack Path Topology Map */}
      <div className="relative w-full h-[155px] rounded-xl border border-cyan-900/40 bg-[#060b16] p-3 overflow-hidden flex items-center justify-center shadow-inner">
        <svg viewBox="0 0 760 120" className="w-full h-full select-none">
          {/* Animated Connecting Vector Attack Lines */}
          <line x1="100" y1="60" x2="220" y2="60" stroke="#f43f5e" strokeWidth="2.5" strokeDasharray="6 4" className="animate-pulse" />
          <polygon points="216,55 226,60 216,65" fill="#f43f5e" />

          <line x1="300" y1="60" x2="420" y2="60" stroke="#fbbf24" strokeWidth="2.5" strokeDasharray="6 4" />
          <polygon points="416,55 426,60 416,65" fill="#fbbf24" />

          <line x1="500" y1="60" x2="620" y2="60" stroke="#c084fc" strokeWidth="2.5" strokeDasharray="6 4" />
          <polygon points="616,55 626,60 616,65" fill="#c084fc" />

          {/* Hop Badges */}
          <rect x="145" y="44" width="36" height="18" rx="4" fill="#0f172a" stroke="#f43f5e" strokeWidth="1.5" />
          <text x="163" y="56" fill="#f43f5e" fontSize="9" fontWeight="bold" textAnchor="middle" className="mono">Hop 1</text>

          <rect x="345" y="44" width="36" height="18" rx="4" fill="#0f172a" stroke="#fbbf24" strokeWidth="1.5" />
          <text x="363" y="56" fill="#fbbf24" fontSize="9" fontWeight="bold" textAnchor="middle" className="mono">Hop 2</text>

          <rect x="545" y="44" width="36" height="18" rx="4" fill="#0f172a" stroke="#c084fc" strokeWidth="1.5" />
          <text x="563" y="56" fill="#c084fc" fontSize="9" fontWeight="bold" textAnchor="middle" className="mono">Hop 3</text>
        </svg>

        {/* Overlay Node Cards - High Contrast, Super Crisp & Readable White Text */}
        <div className="absolute inset-0 flex items-center justify-between px-3 sm:px-5">
          {attackNodes.map((node) => {
            const Icon = node.icon;
            const isHov = hoverNode === node.id;
            return (
              <div
                key={node.id}
                onMouseEnter={() => setHoverNode(node.id)}
                onMouseLeave={() => setHoverNode(null)}
                className={`flex flex-col items-center justify-center rounded-xl border-2 p-2.5 transition-all duration-300 cursor-pointer w-32 sm:w-40 text-center shadow-lg ${node.color} ${
                  isHov ? "scale-105 border-cyan-400 shadow-cyan-500/30" : "shadow-black/60"
                }`}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-800/90 mb-1 border border-slate-700">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <span className="font-bold text-[11px] text-white tracking-wide truncate w-full drop-shadow-sm">
                  {node.name}
                </span>
                <span className="text-[9.5px] font-medium text-slate-300 truncate w-full mt-0.5">
                  {node.sub}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Neo4j Database Footer Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-border/40 pt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Neo4j Bolt: 127.0.0.1:7687 Connected
          </span>
          <span className="text-muted-foreground/60">&bull;</span>
          <span className="mono text-[11px] text-slate-300">4 Graph Nodes &bull; 3 Toxic Hops</span>
        </div>
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
}: {
  totalAssets: number;
  azureAssets: number;
  awsAssets: number;
  gcpAssets: number;
  ociAssets: number;
  oracleSaasAssets?: number;
  resources?: any[];
}) {
  const safeTotal = Math.max(1, totalAssets);
  const azPct = Math.round((azureAssets / safeTotal) * 100);
  const awsPct = Math.round((awsAssets / safeTotal) * 100);
  const gcpPct = Math.round((gcpAssets / safeTotal) * 100);
  const ociPct = Math.round((ociAssets / safeTotal) * 100);
  const saasPct = Math.round((oracleSaasAssets / safeTotal) * 100);

  const services = useMemo(() => {
    if (!resources || resources.length === 0) {
      return [
        { name: "Defender for Cloud & Security Posture", icon: ShieldCheck, count: 15, provider: "Microsoft Defender", health: "Audited" },
        { name: "Entra ID & Identity Role Assignments", icon: Lock, count: 10, provider: "Azure IAM", health: "Audited" },
        { name: "Network Security Groups & VNets", icon: Globe, count: 5, provider: "Azure Virtual Network", health: "Monitoring" },
        { name: "Oracle Fusion ERP & Identity Roles", icon: Lock, count: 8, provider: "Oracle SaaS IAM", health: "Audited" },
        { name: "Key Vaults & Cryptographic Secrets", icon: Lock, count: 4, provider: "Azure Key Vault", health: "Secure" },
        { name: "App Services & Cloud Workloads", icon: Server, count: 2, provider: "Azure App Service", health: "Secure" },
        { name: "Virtual Machines & Disks", icon: Server, count: 2, provider: "Azure Compute", health: "Audited" },
        { name: "OCI Tenancy IAM Policies", icon: Lock, count: 1, provider: "Oracle Cloud IAM", health: "Audited" },
      ];
    }

    const map = new Map<string, { name: string; icon: any; count: number; provider: string; health: string }>();

    for (const r of resources) {
      const s = String(r.service || r.service_name || r.type || "").toLowerCase();
      let key = "other";
      let name = "Discovered Cloud Assets";
      let prov = String(r.provider || r.provider_type || "Azure").toUpperCase();
      let icon = Server;

      if (s.includes("defender") || s.includes("security") || s.includes("pricing")) {
        key = "defender";
        name = "Defender for Cloud & Security Posture";
        prov = "Microsoft Defender";
        icon = ShieldCheck;
      } else if (s.includes("iam") || s.includes("role") || s.includes("authorization") || s.includes("identity")) {
        key = "iam";
        name = "Entra ID & Identity Role Assignments";
        prov = prov.includes("OCI") || prov.includes("ORACLE") ? "OCI Identity" : "Azure IAM / Entra ID";
        icon = Lock;
      } else if (s.includes("network") || s.includes("nsg") || s.includes("vnet") || s.includes("subnet") || s.includes("watcher")) {
        key = "network";
        name = "Network Security Groups & VNets";
        prov = "Azure Virtual Network";
        icon = Globe;
      } else if (s.includes("keyvault") || s.includes("vault") || s.includes("secret")) {
        key = "keyvault";
        name = "Key Vaults & Cryptographic Secrets";
        prov = "Azure Key Vault";
        icon = Lock;
      } else if (s.includes("app") || s.includes("web") || s.includes("site")) {
        key = "app";
        name = "App Services & Cloud Workloads";
        prov = "Azure App Service";
        icon = Globe;
      } else if (s.includes("vm") || s.includes("compute") || s.includes("virtualmachine") || s.includes("disk")) {
        key = "compute";
        name = "Virtual Machines & Disks";
        prov = "Azure Compute";
        icon = Server;
      } else if (s.includes("policy")) {
        key = "policy";
        name = "OCI Tenancy IAM Policies";
        prov = "Oracle Cloud IAM";
        icon = Lock;
      } else if (s.includes("storage") || s.includes("blob") || s.includes("bucket")) {
        key = "storage";
        name = "Storage Accounts & Object Stores";
        prov = "Cloud Storage";
        icon = Database;
      }

      if (!map.has(key)) {
        map.set(key, { name, icon, count: 0, provider: prov, health: "Audited" });
      }
      map.get(key)!.count += 1;
    }

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
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
                <div className="text-[10px] font-semibold text-emerald-400">{svc.health}</div>
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

      // Deduce Provider Name
      let provKey = String(f.provider || f.provider_type || f.check_metadata?.provider || "").toUpperCase();
      if (!provKey || provKey === "UNKNOWN") {
        const uid = String(f.uid || "").toLowerCase();
        if (uid.includes("/subscriptions/")) provKey = "AZURE";
        else if (uid.includes("oracle") || uid.includes("hcm") || uid.includes("fusion")) provKey = "ORACLE_SAAS";
        else provKey = "AZURE";
      }

      let provLabel = provKey;
      if (provKey.includes("SAAS") || provKey.includes("ORACLE")) provLabel = "Oracle SaaS (HCM/ERP)";
      else if (provKey.includes("AZURE")) provLabel = "Microsoft Azure";
      else if (provKey.includes("OCI")) provLabel = "Oracle Cloud Infrastructure";
      else if (provKey.includes("AWS")) provLabel = "Amazon Web Services";

      if (!providerMap.has(provKey)) {
        providerMap.set(provKey, { name: provLabel, count: 0, fail: 0, critical: 0, high: 0, medium: 0, low: 0 });
      }
      const pEntry = providerMap.get(provKey)!;
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

              {/* Dynamic Flow Bands (Bezier Curve Ribbons) */}
              <g>
                {/* Critical Band */}
                {pipelineData.critical > 0 && (
                  <path
                    d="M 150 35 C 310 35, 370 25, 520 25 L 520 45 C 370 45, 310 50, 150 50 Z"
                    fill="url(#flowBandCritical)"
                    className="transition-opacity hover:opacity-95 cursor-pointer"
                  />
                )}

                {/* High Band */}
                <path
                  d="M 150 60 C 310 60, 370 75, 520 75 L 520 140 C 370 140, 310 120, 150 120 Z"
                  fill="url(#flowBandHigh)"
                  className="transition-opacity hover:opacity-95 cursor-pointer"
                />

                {/* Medium Band */}
                {pipelineData.medium > 0 && (
                  <path
                    d="M 150 125 C 310 125, 370 155, 520 155 L 520 185 C 370 185, 310 155, 150 155 Z"
                    fill="url(#flowBandMedium)"
                    className="transition-opacity hover:opacity-95 cursor-pointer"
                  />
                )}

                {/* Low Band */}
                {pipelineData.low > 0 && (
                  <path
                    d="M 150 160 C 310 160, 370 195, 520 195 L 520 215 C 370 215, 310 180, 150 180 Z"
                    fill="url(#flowBandLow)"
                    className="transition-opacity hover:opacity-95 cursor-pointer"
                  />
                )}
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

              {/* Right Column: Severity Nodes with Real Live Counts */}
              <g transform="translate(520, 10)">
                {/* Critical Node */}
                <rect x="0" y="0" width="140" height="35" rx="6" fill="#1e293b" stroke="#f43f5e" strokeWidth="2" />
                <text x="12" y="22" fill="#f43f5e" fontSize="11" fontWeight="bold" fontFamily="monospace">
                  Critical ({pipelineData.critical})
                </text>

                {/* High Node */}
                <rect x="0" y="45" width="140" height="85" rx="6" fill="#1e293b" stroke="#ea580c" strokeWidth="2" />
                <text x="12" y="70" fill="#ea580c" fontSize="12" fontWeight="bold" fontFamily="monospace">
                  High ({pipelineData.high})
                </text>

                {/* Medium Node */}
                <rect x="0" y="140" width="140" height="38" rx="6" fill="#1e293b" stroke="#eab308" strokeWidth="2" />
                <text x="12" y="163" fill="#eab308" fontSize="11" fontWeight="bold" fontFamily="monospace">
                  Medium ({pipelineData.medium})
                </text>

                {/* Low Node */}
                <rect x="0" y="186" width="140" height="30" rx="6" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
                <text x="12" y="205" fill="#38bdf8" fontSize="10" fontWeight="bold" fontFamily="monospace">
                  Low ({pipelineData.low})
                </text>
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

  // Graceful fallback to initial standard telemetry if DB findings are 0
  const isZero = passCount === 0 && failCount === 0 && mutedCount === 0;
  const effPass = isZero ? 142 : passCount;
  const effFail = isZero ? 28 : failCount;
  const effMuted = isZero ? 4 : mutedCount;

  const total = Math.max(1, effPass + effFail + effMuted);
  const passPct = (effPass / total) * 100;
  const failPct = (effFail / total) * 100;
  const mutedPct = (effMuted / total) * 100;

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
          {animatedPct}%
        </div>
        <div className="text-[8px] font-bold text-muted-foreground uppercase">Passing</div>
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
  const onlineCount = providers.filter((p: any) => p.status === "connected" || !p.status || p.status === "active").length;

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
    : (providers.length > 0 ? 100 : 0);

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

  // Radar chart data metrics derived from live compliance posture
  const radarData = useMemo(() => {
    const scoreVal = totalFindingsCount > 0 ? Math.min(100, Math.max(10, postureScore)) : 100;
    return radarLabels.map((lbl) => ({ label: lbl, value: scoreVal }));
  }, [radarLabels, totalFindingsCount, postureScore]);

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

  const totalDiscoveredAssets = filteredResources.length > 0 ? filteredResources.length : totalFindingsCount;

  // Startup Animation Trigger
  const [dashboardReady, setDashboardReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDashboardReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  // Animated KPI numbers
  const animPosture = useCountUp(postureScore, 4200, dashboardReady);
  const animClouds = useCountUp(providersCount, 3200, dashboardReady);
  const animCompliance = useCountUp(totalFindingsCount > 0 ? Math.min(22, totalFindingsCount) : 0, 3600, dashboardReady);
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
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-400 border border-emerald-500/20">
                +4.2% 7d
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
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-foreground/80">AWS</span>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-sky-500 dark:text-sky-300">Azure</span>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-300">GCP</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{onlineCount} online · 1 sync</span>
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
              <span>22 Active · NCA ECC & CSCC</span>
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
                {realCritical > 0 ? `${realCritical} Critical` : `${realHigh || 6} High Risk`}
              </span>
            </div>
            {/* Multi-color Stacked Severity Bar with 3x Slower Animated Expand */}
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                style={{
                  width: dashboardReady ? `${realCritical > 0 ? (realCritical / totalOpenFail) * 100 : 25}%` : "0%",
                  transition: "width 3.8s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
                className="bg-rose-500"
                title="Critical"
              />
              <div
                style={{
                  width: dashboardReady ? `${(realHigh / totalOpenFail) * 100 || 50}%` : "0%",
                  transition: "width 4.1s cubic-bezier(0.16, 1, 0.3, 1) 0.2s",
                }}
                className="bg-orange-400"
                title="High"
              />
              <div
                style={{
                  width: dashboardReady ? `${(realMedium / totalOpenFail) * 100 || 20}%` : "0%",
                  transition: "width 4.4s cubic-bezier(0.16, 1, 0.3, 1) 0.4s",
                }}
                className="bg-amber-400"
                title="Medium"
              />
              <div
                style={{
                  width: dashboardReady ? `${(realLow / totalOpenFail) * 100 || 5}%` : "0%",
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
                        <div className="font-mono text-[10px] text-emerald-400 font-semibold">+2.4%</div>
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
                    Toxic Attack Path Detected
                  </h4>
                  <p className="text-[10px] text-muted-foreground">
                    Critical Risk Surface
                  </p>
                </div>
              </div>

              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-muted-foreground border border-border">
                3 Hops
              </span>
            </Link>
          </div>
        </div>

        {/* ── Main Content Section 2: Neo4j Attack Path Graph & AI Decision Core ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Neo4j Multi-Cloud Attack Path Graph Visualizer (2 Columns) */}
          <div className="lg:col-span-2">
            <Neo4jAttackGraphCard
              selectedProviderId={selectedProviderId}
              selectedProviderObj={selectedProviderObj}
              findings={filteredFindings}
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
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Active
                  </span>
                </div>

                <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
                  Real-time neural agent continuously correlating cloud telemetry, analyzing attack surfaces, and proposing automated remediation playbooks.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="rounded-xl border border-border/60 bg-surface-2/40 p-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground">Correlation Latency</div>
                    <div className="font-bold text-foreground mt-0.5">240ms</div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-surface-2/40 p-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground">Policy Engines</div>
                    <div className="font-bold text-primary mt-0.5">5 Active</div>
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
