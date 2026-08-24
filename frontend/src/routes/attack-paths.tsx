import { useState, useEffect, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  GitBranch,
  Zap,
  Sparkles,
  Server,
  Key,
  Database,
  Globe,
  Play,
  RotateCcw,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Chip } from "@/components/ui-kit/primitives";

export const Route = createFileRoute("/attack-paths")({
  component: AttackPathsPage,
});

interface AttackNode {
  id: string;
  label: string;
  sublabel: string;
  kind: "entry" | "compute" | "identity" | "crown";
  x: number;
  y: number;
  provider: "Azure" | "AWS" | "GCP" | "OCI" | "Oracle SaaS" | string;
  region: string;
  resourceName: string;
  resourceType: string;
  exposure: string;
  findingId: string;
  findingTitle: string;
  stepNumber: number;
  stepDescription: string;
  mitreId: string;
  mitreTactic: string;
  cvss: number;
  remediationStep: string;
}

interface AttackPathScenario {
  id: string;
  name: string;
  cloud: "Azure" | "AWS" | "GCP" | "OCI" | "Oracle SaaS" | string;
  severity: "Critical" | "High" | "Medium";
  hops: number;
  blastRadius: number;
  entryZone: string;
  targetZone: string;
  nodes: AttackNode[];
  edges: { from: string; to: string; critical: boolean; label: string }[];
}

import { useFindings } from "@/hooks/use-api";

function matchesProvider(f: any, targetProvider: string): boolean {
  const p = (f.provider || "").toLowerCase();
  const checkId = (f.check_id || "").toLowerCase();

  if (targetProvider === "Azure") {
    return p === "azure" || p === "az" || p.startsWith("azure");
  }
  if (targetProvider === "AWS") {
    return p === "aws" || p.startsWith("aws");
  }
  if (targetProvider === "OCI") {
    return (p === "oci" || p === "oraclecloud" || p === "oracle_cloud" || p.includes("oraclecloud")) && !p.includes("saas") && !checkId.includes("oracle_saas");
  }
  if (targetProvider === "Oracle SaaS") {
    return (p === "oracle_saas" || p === "oracle-saas" || p === "saas" || checkId.includes("oracle_saas") || checkId.includes("erp")) && !p.includes("oraclecloud");
  }
  return false;
}

function buildScenariosFromFindings(findings: any[]): AttackPathScenario[] {
  if (!findings || findings.length === 0) return [];

  const providers = ["Azure", "AWS", "OCI", "Oracle SaaS"];
  const scenariosList: AttackPathScenario[] = [];

  providers.forEach((providerName) => {
    const provKey = providerName.toLowerCase().replace(" ", "_");
    const provFindings = findings.filter((f: any) => matchesProvider(f, providerName));

    if (provFindings.length === 0) return;

    const failedFindings = provFindings.filter((f: any) => f.status === "FAIL" || f.status === "FAILING");
    const targetFindings = failedFindings.length > 0 ? failedFindings : provFindings;

    const nodes: AttackNode[] = [
      {
        id: `${provKey}-node-1`,
        label: "Public Perimeter",
        sublabel: "Adversary Ingress Point",
        kind: "entry",
        x: 100,
        y: 220,
        provider: providerName as any,
        region: targetFindings[0]?.region || "Global",
        resourceName: targetFindings[0]?.resource || "Public Ingress Perimeter",
        resourceType: "Network Gateway",
        exposure: "Unrestricted Network Ingress",
        findingId: targetFindings[0]?.id ? String(targetFindings[0].id).slice(0, 12) : "FINDING-001",
        findingTitle: targetFindings[0]?.title || "Unrestricted Public Access",
        stepNumber: 1,
        stepDescription: "Adversary probes public IP range targeting exposed perimeter resources.",
        mitreId: "T1190",
        mitreTactic: "Initial Access",
        cvss: 9.0,
        remediationStep: "Enforce network access group restrictions & perimeter WAF rules.",
      },
      {
        id: `${provKey}-node-2`,
        label: targetFindings[1]?.service ? `${targetFindings[1].service.toUpperCase()} Compute` : `${providerName} Compute Resource`,
        sublabel: "Pivot Instance",
        kind: "compute",
        x: 350,
        y: 130,
        provider: providerName as any,
        region: targetFindings[1]?.region || "Primary Region",
        resourceName: targetFindings[1]?.resource || "Compute Pivot Instance",
        resourceType: targetFindings[1]?.service || "Virtual Machine",
        exposure: "Unmanaged Execution Environment",
        findingId: targetFindings[1]?.id ? String(targetFindings[1].id).slice(0, 12) : "FINDING-002",
        findingTitle: targetFindings[1]?.title || "Insecure Host Configuration",
        stepNumber: 2,
        stepDescription: "Compromises execution environment and harvests local instance credentials.",
        mitreId: "T1078",
        mitreTactic: "Execution",
        cvss: 8.5,
        remediationStep: "Enable hardened boot attestation and isolate management plane.",
      },
      {
        id: `${provKey}-node-3`,
        label: "IAM Principal / Role",
        sublabel: "Privilege Escalation",
        kind: "identity",
        x: 590,
        y: 310,
        provider: providerName as any,
        region: "IAM Global",
        resourceName: targetFindings[2]?.resource || "Identity Service Principal",
        resourceType: "IAM Policy / Role",
        exposure: "Excessive Administrative Privileges",
        findingId: targetFindings[2]?.id ? String(targetFindings[2].id).slice(0, 12) : "FINDING-003",
        findingTitle: targetFindings[2]?.title || "Excessive IAM Role Permissions",
        stepNumber: 3,
        stepDescription: "Escalates privileges using overprivileged IAM role assignment.",
        mitreId: "T1552",
        mitreTactic: "Privilege Escalation",
        cvss: 9.3,
        remediationStep: "Apply Least Privilege RBAC: scope permissions strictly to required resources.",
      },
      {
        id: `${provKey}-node-4`,
        label: "Target Storage & Database",
        sublabel: "Crown Jewel Data Target",
        kind: "crown",
        x: 840,
        y: 190,
        provider: providerName as any,
        region: targetFindings[3]?.region || "Primary Region",
        resourceName: targetFindings[3]?.resource || "Crown Jewel Data Store",
        resourceType: targetFindings[3]?.service || "Database / Object Store",
        exposure: "Sensitive Data Storage",
        findingId: targetFindings[3]?.id ? String(targetFindings[3].id).slice(0, 12) : "FINDING-004",
        findingTitle: targetFindings[3]?.title || "Unencrypted Data Target",
        stepNumber: 4,
        stepDescription: "Direct administrative query access to production data store.",
        mitreId: "T1530",
        mitreTactic: "Exfiltration",
        cvss: 9.8,
        remediationStep: "Enable KMS customer-managed key encryption & threat detection monitoring.",
      },
    ];

    scenariosList.push({
      id: `${provKey}-live-path`,
      name: `${providerName} Toxic Path: ${nodes[0].label} → ${nodes[1].label} → ${nodes[3].label}`,
      cloud: providerName,
      severity: "Critical",
      hops: 3,
      blastRadius: targetFindings.length * 8 + 12,
      entryZone: `Public Perimeter (${nodes[0].region})`,
      targetZone: `${nodes[3].label} (${nodes[3].resourceName})`,
      nodes,
      edges: [
        { from: `${provKey}-node-1`, to: `${provKey}-node-2`, critical: true, label: "Ingress Infiltration" },
        { from: `${provKey}-node-2`, to: `${provKey}-node-3`, critical: true, label: "Credential Harvest" },
        { from: `${provKey}-node-3`, to: `${provKey}-node-4`, critical: true, label: "Privilege Abuse" },
      ],
    });
  });

  return scenariosList;
}

function AttackPathsPage() {
  const { data: findingsRaw, isLoading } = useFindings();
  const findings = useMemo(() => {
    if (!findingsRaw) return [];
    if (Array.isArray(findingsRaw)) return findingsRaw;
    if (Array.isArray((findingsRaw as any).items)) return (findingsRaw as any).items;
    if (Array.isArray((findingsRaw as any).data)) return (findingsRaw as any).data;
    return [];
  }, [findingsRaw]);

  const liveScenarios = useMemo(() => buildScenariosFromFindings(findings), [findings]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("");

  useEffect(() => {
    if (liveScenarios.length > 0 && (!selectedScenarioId || !liveScenarios.some(s => s.id === selectedScenarioId))) {
      setSelectedScenarioId(liveScenarios[0].id);
    }
  }, [liveScenarios, selectedScenarioId]);

  const scenario = liveScenarios.find((s) => s.id === selectedScenarioId) || liveScenarios[0];
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [remediated, setRemediated] = useState(false);
  const [remediating, setRemediating] = useState(false);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    if (scenario?.nodes && scenario.nodes.length > 1) {
      setSelectedNodeId(scenario.nodes[1].id);
      setRemediated(false);
    }
  }, [selectedScenarioId, scenario]);

  const activeNode = scenario?.nodes?.find((n) => n.id === selectedNodeId) || scenario?.nodes?.[0];

  // Simulation loop
  useEffect(() => {
    if (!simulating || !scenario?.nodes) return;
    const interval = setInterval(() => {
      setSelectedNodeId((prevId) => {
        if (!scenario?.nodes || scenario.nodes.length === 0) return prevId;
        const currentIndex = scenario.nodes.findIndex((n) => n.id === prevId);
        const nextIndex = (currentIndex + 1) % scenario.nodes.length;
        return scenario.nodes[nextIndex]?.id || prevId;
      });
    }, 2400);
    return () => clearInterval(interval);
  }, [simulating, scenario?.nodes]);

  const handleBreakChain = () => {
    setRemediating(true);
    setSimulating(false);
    setTimeout(() => {
      setRemediating(false);
      setRemediated(true);
    }, 1600);
  };

  const handleReset = () => {
    setRemediated(false);
    setSimulating(false);
    if (scenario?.nodes?.[1]) {
      setSelectedNodeId(scenario.nodes[1].id);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 pb-12">
        {/* ── Page Header ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-sm">
                <GitBranch className="h-5 w-5" />
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Attack Paths & Toxic Combinations
              </h1>
            </div>
            <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground">
              Multi-cloud IAM trust exploitation, internet ingress mapping, and automated kill-chain severing
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSimulating(!simulating)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold transition-all cursor-pointer shadow-sm ${
                simulating
                  ? "bg-primary text-primary-foreground border-primary shadow-primary/20"
                  : "bg-surface-2 border-border text-foreground hover:bg-surface-3"
              }`}
            >
              <Play className={`h-3.5 w-3.5 ${simulating ? "animate-pulse fill-current" : ""}`} />
              <span>{simulating ? "Pause Simulation" : "Simulate Attack"}</span>
            </button>

            <button
              onClick={handleBreakChain}
              disabled={remediating || remediated}
              className={`inline-flex h-9 min-w-[190px] items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer ${
                remediated
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default"
                  : "bg-rose-600 text-white hover:bg-rose-500 shadow-rose-600/20"
              }`}
            >
              <Zap className={`h-3.5 w-3.5 ${remediating ? "animate-spin" : ""}`} />
              <span>
                {remediating
                  ? "Severing Kill Chain..."
                  : remediated
                  ? "Kill Chain Broken ✓"
                  : "Break Kill Chain (Phantom)"}
              </span>
            </button>

            {remediated && (
              <button
                onClick={handleReset}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                title="Reset scenario state"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ── Attack Path Selector Tabs ── */}
        {isLoading ? (
          <div className="rounded-xl border border-border/60 bg-surface-2/40 p-4 text-xs text-muted-foreground animate-pulse flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary animate-spin" />
            Analyzing real-time provider finding topologies & attack vectors...
          </div>
        ) : liveScenarios.length === 0 ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-6 text-center shadow-sm">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 mb-3">
              <GitBranch className="h-6 w-6" />
            </div>
            <h3 className="font-display text-base font-bold text-foreground">
              Zero Toxic Attack Paths Detected
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              No exploitable multi-hop attack vectors or toxic combinations were identified across your active cloud provider accounts. Run an assessment rescan to update topology metrics.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-3">
            {liveScenarios.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedScenarioId(s.id)}
                className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer border ${
                  selectedScenarioId === s.id
                    ? "bg-surface border-primary/50 text-foreground shadow-sm shadow-primary/10"
                    : "bg-surface-2/40 border-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${
                  s.severity === "Critical" ? "bg-rose-500" : "bg-amber-400"
                }`} />
                <span className="font-bold">{s.cloud} Attack Path:</span>
                <span className="truncate max-w-[280px] font-normal">{s.name}</span>
                <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-mono font-bold ${
                  s.severity === "Critical" ? "bg-rose-500/10 text-rose-400" : "bg-amber-400/10 text-amber-400"
                }`}>
                  {s.hops} Hops
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ── Main Content Grid: Interactive Topology Graph + Detailed Inspector ── */}
        {scenario && activeNode && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* ── Left Column (7 Cols): Topology Attack Graph Canvas ── */}
          <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/80 p-5 sm:p-6 backdrop-blur-sm shadow-md">
            <div>
              {/* Canvas Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3.5">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-sm font-bold text-foreground">
                      {scenario.cloud} Attack Vector Topology
                    </h3>
                    <Chip tone={remediated ? "success" : "critical"}>
                      {remediated ? "0 Active Paths · Severed" : `1 Critical Path (${scenario.nodes[1]?.region || "Global"})`}
                    </Chip>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Click any node to inspect exposure surface, IAM permissions, and blast radius
                  </p>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-medium">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                    Critical Ingress
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    IAM Pivot
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-purple-400" />
                    Crown Jewel
                  </span>
                </div>
              </div>

              {/* High-Resolution Interactive SVG Canvas */}
              <div className="relative mt-4 w-full h-[400px] sm:h-[440px] rounded-xl border border-border/70 bg-surface-2/50 overflow-hidden select-none">
                <svg
                  viewBox="0 0 940 440"
                  className="h-full w-full"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    {/* Cyber Grid Pattern */}
                    <pattern id="cyberGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <circle cx="20" cy="20" r="1" fill="currentColor" className="text-border/40" />
                    </pattern>

                    {/* Gradient for Attack Vector Path */}
                    <linearGradient id="attackPathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#ef4444" />
                      <stop offset="40%" stopColor="#f59e0b" />
                      <stop offset="70%" stopColor="#06b6d4" />
                      <stop offset="100%" stopColor="#a855f7" />
                    </linearGradient>

                    {/* Glow Filter */}
                    <filter id="pathGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3.5" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>

                    <filter id="nodeGlow" x="-30%" y="-30%" width="160%" height="160%">
                      <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#06b6d4" floodOpacity="0.4" />
                    </filter>
                  </defs>

                  {/* Grid Background */}
                  <rect width="100%" height="100%" fill="url(#cyberGrid)" />

                  {/* Zone Backdrop Areas */}
                  <rect x="30" y="30" width="220" height="380" rx="12" fill="currentColor" className="text-surface/30" stroke="currentColor" strokeDasharray="4 4" strokeWidth="0.8" opacity="0.3" />
                  <text x="45" y="55" fill="currentColor" className="text-muted-foreground/60 text-[10px] font-mono uppercase tracking-wider">Perimeter Zone</text>

                  <rect x="270" y="30" width="400" height="380" rx="12" fill="currentColor" className="text-surface/30" stroke="currentColor" strokeDasharray="4 4" strokeWidth="0.8" opacity="0.3" />
                  <text x="285" y="55" fill="currentColor" className="text-muted-foreground/60 text-[10px] font-mono uppercase tracking-wider">Internal VNet & IAM Boundary</text>

                  <rect x="690" y="30" width="220" height="380" rx="12" fill="currentColor" className="text-surface/30" stroke="currentColor" strokeDasharray="4 4" strokeWidth="0.8" opacity="0.3" />
                  <text x="705" y="55" fill="currentColor" className="text-muted-foreground/60 text-[10px] font-mono uppercase tracking-wider">Crown Jewel Vault</text>

                  {/* Draw Curved Attack Paths with Animated Flow */}
                  {scenario.edges.map((edge, i) => {
                    const fromNode = scenario.nodes.find((n) => n.id === edge.from)!;
                    const toNode = scenario.nodes.find((n) => n.id === edge.to)!;
                    const isSevered = remediated && i === 1; // Sever the link between VM and Managed Identity

                    // Smooth Bezier Curve
                    const dx = toNode.x - fromNode.x;
                    const c1x = fromNode.x + dx * 0.45;
                    const c1y = fromNode.y;
                    const c2x = fromNode.x + dx * 0.55;
                    const c2y = toNode.y;
                    const pathData = `M ${fromNode.x} ${fromNode.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${toNode.x} ${toNode.y}`;

                    return (
                      <g key={i}>
                        {/* Background Base Track */}
                        <path
                          d={pathData}
                          fill="none"
                          stroke={isSevered ? "#10b981" : "#ef4444"}
                          strokeWidth={isSevered ? "2" : "3.5"}
                          strokeOpacity={isSevered ? "0.2" : "0.3"}
                        />

                        {/* Animated Glowing Laser Vector */}
                        {!isSevered && (
                          <path
                            d={pathData}
                            fill="none"
                            stroke="url(#attackPathGradient)"
                            strokeWidth="2.5"
                            strokeDasharray="8 6"
                            className="animate-pulse"
                            filter="url(#pathGlow)"
                          />
                        )}

                        {/* Edge Hover Tag */}
                        <rect
                          x={(fromNode.x + toNode.x) / 2 - 45}
                          y={(fromNode.y + toNode.y) / 2 - 10}
                          width="90"
                          height="18"
                          rx="9"
                          fill="currentColor"
                          className="text-surface"
                          stroke="currentColor"
                          strokeWidth="0.8"
                          opacity="0.85"
                        />
                        <text
                          x={(fromNode.x + toNode.x) / 2}
                          y={(fromNode.y + toNode.y) / 2 + 2.5}
                          fill="currentColor"
                          className={isSevered ? "text-emerald-400 font-mono text-[9px] font-bold" : "text-muted-foreground font-mono text-[9px] font-semibold"}
                          textAnchor="middle"
                        >
                          {isSevered ? "SEVERED" : edge.label}
                        </text>

                        {/* Severed Barrier Shield Icon Badge */}
                        {isSevered && (
                          <g transform={`translate(${(fromNode.x + toNode.x) / 2 - 12}, ${(fromNode.y + toNode.y) / 2 - 28})`}>
                            <circle cx="12" cy="12" r="14" fill="#10b981" fillOpacity="0.2" stroke="#10b981" strokeWidth="1.5" />
                            <text x="12" y="16" textAnchor="middle" fill="#10b981" fontSize="11" fontWeight="bold">✓</text>
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {/* Draw Nodes */}
                  {scenario.nodes.map((node) => {
                    const isSelected = selectedNodeId === node.id;
                    const isCrown = node.kind === "crown";
                    const isEntry = node.kind === "entry";
                    const isIdentity = node.kind === "identity";

                    return (
                      <g
                        key={node.id}
                        onClick={() => {
                          setSelectedNodeId(node.id);
                        }}
                        className="cursor-pointer transition-all duration-300"
                        transform={`translate(${node.x}, ${node.y})`}
                      >
                        {/* Halo Pulse for Selected Node */}
                        {isSelected && (
                          <circle
                            r="32"
                            fill="none"
                            stroke="#06b6d4"
                            strokeWidth="1.5"
                            strokeDasharray="4 4"
                            className="animate-spin"
                            style={{ animationDuration: "8s" }}
                          />
                        )}

                        {/* Outer Glow Circle */}
                        <circle
                          r={isSelected ? "26" : "22"}
                          fill="currentColor"
                          className="text-surface"
                          stroke={
                            isSelected
                              ? "#06b6d4"
                              : isEntry
                              ? "#ef4444"
                              : isIdentity
                              ? "#f59e0b"
                              : isCrown
                              ? "#a855f7"
                              : "#38bdf8"
                          }
                          strokeWidth={isSelected ? "3" : "2"}
                          filter={isSelected ? "url(#nodeGlow)" : undefined}
                        />

                        {/* Step Number Tag Pill */}
                        <rect
                          x="-14"
                          y="-32"
                          width="28"
                          height="14"
                          rx="7"
                          fill={
                            isEntry
                              ? "#ef4444"
                              : isIdentity
                              ? "#f59e0b"
                              : isCrown
                              ? "#a855f7"
                              : "#06b6d4"
                          }
                        />
                        <text
                          x="0"
                          y="-22"
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="8.5"
                          fontWeight="bold"
                          fontFamily="sans-serif"
                        >
                          Step {node.stepNumber}
                        </text>

                        {/* Center Icon Shape Representation */}
                        {isEntry && (
                          <g transform="translate(-8, -8)">
                            <circle cx="8" cy="8" r="6" fill="none" stroke="#ef4444" strokeWidth="1.5" />
                            <path d="M 8 2 A 6 6 0 0 1 8 14" fill="none" stroke="#ef4444" strokeWidth="1.2" />
                          </g>
                        )}
                        {node.kind === "compute" && (
                          <g transform="translate(-8, -8)">
                            <rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="#38bdf8" strokeWidth="1.5" />
                            <circle cx="5" cy="8" r="1" fill="#38bdf8" />
                          </g>
                        )}
                        {isIdentity && (
                          <g transform="translate(-8, -8)">
                            <circle cx="6" cy="6" r="4" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
                            <path d="M 9 9 L 14 14 M 12 12 L 14 10" stroke="#f59e0b" strokeWidth="1.5" />
                          </g>
                        )}
                        {isCrown && (
                          <g transform="translate(-8, -8)">
                            <ellipse cx="8" cy="4" rx="6" ry="2.5" fill="none" stroke="#a855f7" strokeWidth="1.5" />
                            <path d="M 2 4 V 12 A 6 2.5 0 0 0 14 12 V 4" fill="none" stroke="#a855f7" strokeWidth="1.5" />
                          </g>
                        )}

                        {/* High-Legibility Title & Subtitle Badge */}
                        <g transform="translate(0, 36)">
                          <rect
                            x="-85"
                            y="-4"
                            width="170"
                            height="34"
                            rx="8"
                            fill="currentColor"
                            className="text-surface/90"
                            stroke="currentColor"
                            strokeWidth="0.8"
                            opacity="0.95"
                          />
                          <text
                            x="0"
                            y="10"
                            textAnchor="middle"
                            fill="currentColor"
                            fontSize="11"
                            fontWeight={isSelected ? "700" : "600"}
                            className="text-foreground"
                          >
                            {node.label}
                          </text>
                          <text
                            x="0"
                            y="22"
                            textAnchor="middle"
                            fill="currentColor"
                            fontSize="8.5"
                            className="text-muted-foreground font-mono"
                          >
                            {node.sublabel}
                          </text>
                        </g>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Bottom Summary Telemetry */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground border-t border-border/60 pt-3.5">
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span className="text-foreground font-bold">Vector Chain:</span>
                <span>{scenario.entryZone}</span>
                <ArrowRight className="h-3 w-3 text-primary inline" />
                <span>{scenario.nodes[1].label}</span>
                <ArrowRight className="h-3 w-3 text-primary inline" />
                <span className="text-purple-400 font-bold">{scenario.targetZone}</span>
              </div>

              <div className="flex items-center gap-4 font-mono text-[11px]">
                <span>
                  Blast Radius:{" "}
                  <strong className={remediated ? "text-emerald-400" : "text-rose-400"}>
                    {remediated ? "0 assets" : `${scenario.blastRadius} Cloud Assets`}
                  </strong>
                </span>
                <span className="rounded-md bg-surface-2 px-2 py-0.5 text-foreground font-semibold border border-border">
                  CVSS: {activeNode.cvss}
                </span>
              </div>
            </div>
          </div>

          {/* ── Right Column (5 Cols): Selected Node Telemetry & Kill Chain Inspector ── */}
          <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/80 p-5 sm:p-6 backdrop-blur-sm shadow-md">
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border/60 pb-3.5">
                <div>
                  <h3 className="font-display text-sm font-bold text-foreground">
                    Node Telemetry & Risk Inspector
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Exploit mechanics and remediation for hop {activeNode.stepNumber} of {scenario.nodes?.length || 0}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-foreground">
                    CVSS {activeNode.cvss}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-mono font-bold border ${
                    activeNode.kind === "crown"
                      ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                      : activeNode.kind === "entry"
                      ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      : activeNode.kind === "identity"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : "bg-sky-500/10 text-sky-400 border-sky-500/20"
                  }`}>
                    {activeNode.kind.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Minimal Step Progression Track */}
              <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-border/70 bg-surface-2/40 p-1.5">
                {scenario.nodes.map((node) => {
                  const isCurrent = selectedNodeId === node.id;
                  return (
                    <button
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-center transition-all cursor-pointer ${
                        isCurrent
                          ? "bg-surface border border-primary/50 text-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                      }`}
                    >
                      <span className="text-[9px] font-mono font-bold opacity-70">Hop {node.stepNumber}</span>
                      <span className="text-[11px] font-semibold truncate max-w-full">
                        {node.kind === "entry" ? "Ingress" : node.kind === "compute" ? "Compute" : node.kind === "identity" ? "Identity" : "Storage"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Active Node Overview */}
              <div className="rounded-xl border border-border/70 bg-surface-2/40 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface border border-border text-foreground shadow-sm">
                    {activeNode.kind === "crown" ? (
                      <Database className="h-5 w-5 text-purple-400" />
                    ) : activeNode.kind === "entry" ? (
                      <Globe className="h-5 w-5 text-rose-400" />
                    ) : activeNode.kind === "identity" ? (
                      <Key className="h-5 w-5 text-amber-400" />
                    ) : (
                      <Server className="h-5 w-5 text-sky-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-display text-sm font-bold text-foreground truncate">
                      {activeNode.label}
                    </h4>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {activeNode.provider} · {activeNode.region} · {activeNode.resourceType}
                    </span>
                  </div>
                </div>

                {/* 2x2 Telemetry Grid */}
                <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-border/50 text-xs">
                  <div className="rounded-lg bg-surface/60 border border-border/40 p-2.5">
                    <span className="text-[10px] text-muted-foreground block font-medium">Resource Target</span>
                    <span className="font-mono text-[11px] font-semibold text-foreground truncate block mt-0.5">
                      {activeNode.resourceName}
                    </span>
                  </div>

                  <div className="rounded-lg bg-surface/60 border border-border/40 p-2.5">
                    <span className="text-[10px] text-muted-foreground block font-medium">Exposure Surface</span>
                    <span className="font-mono text-[11px] font-semibold text-rose-400 truncate block mt-0.5">
                      {activeNode.exposure}
                    </span>
                  </div>

                  <div className="rounded-lg bg-surface/60 border border-border/40 p-2.5">
                    <span className="text-[10px] text-muted-foreground block font-medium">Associated Finding</span>
                    <Link
                      to="/findings"
                      className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-primary hover:underline mt-0.5"
                    >
                      <span>{activeNode.findingId}</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </Link>
                  </div>

                  <div className="rounded-lg bg-surface/60 border border-border/40 p-2.5">
                    <span className="text-[10px] text-muted-foreground block font-medium">MITRE ATT&CK TTP</span>
                    <span className="font-mono text-[11px] font-semibold text-foreground truncate block mt-0.5">
                      {activeNode.mitreId} ({activeNode.mitreTactic})
                    </span>
                  </div>
                </div>

                {/* Exploit Mechanism Description */}
                <div className="pt-2 border-t border-border/50">
                  <span className="text-[10px] text-muted-foreground block font-medium mb-1">Exploit Path Details</span>
                  <p className="text-[11px] text-foreground/90 leading-relaxed">
                    {activeNode.stepDescription}
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom Spectra Remediation Action */}
            <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold text-foreground">Spectra Autonomous Playbook</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {activeNode.remediationStep}
              </p>
              <Link
                to="/ai/advisor"
                search={{
                  prompt: `Analyze toxic attack path involving ${activeNode.label} (${activeNode.resourceName}). What is the blast radius and exact remediation playbook?`,
                  provider: scenario.cloud.toLowerCase(),
                }}
                className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs py-2 shadow-sm hover:opacity-90 transition-opacity"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Execute Automated Spectra Playbook →</span>
              </Link>
            </div>
          </div>
        </div>
        )}
      </div>
    </AppShell>
  );
}
