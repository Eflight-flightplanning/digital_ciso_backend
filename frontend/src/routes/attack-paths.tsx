import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  GitBranch,
  Zap,
  Sparkles,
  Server,
  Key,
  Database,
  Globe,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  PanelTitle,
  Chip,
} from "@/components/ui-kit/primitives";
import { useAttackPaths, useFindings } from "@/hooks/use-api";

export const Route = createFileRoute("/attack-paths")({
  component: AttackPathsPage,
});

interface AttackNode {
  id: string;
  label: string;
  kind: "entry" | "compute" | "identity" | "crown";
  x: number;
  y: number;
  provider: string;
  resourceName: string;
  exposure: string;
  findingId: string;
  findingTitle: string;
  stepNumber: number;
  stepDescription: string;
}

const azureAttackNodes: AttackNode[] = [
  {
    id: "internet",
    label: "Internet (Adversary)",
    kind: "entry",
    x: 15,
    y: 50,
    provider: "Global",
    resourceName: "0.0.0.0/0 (Public Internet)",
    exposure: "Public Ingress Point",
    findingId: "AZ-NSG-5163E1",
    findingTitle: "Public Network Ingress on Central India Subnet",
    stepNumber: 1,
    stepDescription: "Adversary probes public IP range targeting exposed ports in Central India region.",
  },
  {
    id: "vm-runner",
    label: "Azure VM (Digital-CISO-LLM)",
    kind: "compute",
    x: 42,
    y: 35,
    provider: "Azure",
    resourceName: "Digital-CISO-LLM (Central India)",
    exposure: "Public IP / NSG Ingress",
    findingId: "AZ-VM-45CC00",
    findingTitle: "VM Trusted Launch and Secure Boot unconfigured",
    stepNumber: 2,
    stepDescription: "Compromises VM execution environment lacking Trusted Launch & vTPM integrity.",
  },
  {
    id: "identity",
    label: "Entra ID Managed Identity",
    kind: "identity",
    x: 65,
    y: 65,
    provider: "Azure",
    resourceName: "id-centralindia-ciso (Contributor)",
    exposure: "Subscription Contributor Role",
    findingId: "AZ-IAM-2A3B4C",
    findingTitle: "Excessive IAM Role Permissions on Subscription",
    stepNumber: 3,
    stepDescription: "Harvests Azure Instance Metadata Service (IMDS) token for Contributor role.",
  },
  {
    id: "storage-db",
    label: "Azure SQL & Production Storage",
    kind: "crown",
    x: 88,
    y: 50,
    provider: "Azure",
    resourceName: "rg-production (Azure SQL / Cosmos DB)",
    exposure: "Crown Jewel (Customer Telemetry)",
    findingId: "AZ-SQL-12E3F4",
    findingTitle: "Defender for Azure SQL Databases disabled",
    stepNumber: 4,
    stepDescription: "Accesses production databases lacking Microsoft Defender Threat Protection & TDE.",
  },
];

const azureAttackEdges = [
  { from: "internet", to: "vm-runner", critical: true },
  { from: "vm-runner", to: "identity", critical: true },
  { from: "identity", to: "storage-db", critical: true },
];

function AttackPathsPage() {
  const [selectedNode, setSelectedNode] = useState<string>("vm-runner");
  const [remediated, setRemediated] = useState(false);
  const [remediating, setRemediating] = useState(false);

  const activeNode = azureAttackNodes.find((n) => n.id === selectedNode) || azureAttackNodes[1];

  const handleBreakChain = () => {
    setRemediating(true);
    setTimeout(() => {
      setRemediating(false);
      setRemediated(true);
    }, 1400);
  };

  return (
    <AppShell
      title="Attack Paths & Toxic Combinations"
      subtitle="Multi-cloud IAM trust exploitation, internet ingress mapping, and automated kill-chain severing"
      actions={
        <button
          onClick={handleBreakChain}
          disabled={remediating || remediated}
          className={`inline-flex h-10 min-w-[190px] items-center justify-center gap-2 rounded-lg px-6 text-xs font-semibold shadow-sm transition-all active:scale-95 ${
            remediated
              ? "bg-success/20 text-success border border-success/30 cursor-default"
              : "bg-critical text-destructive-foreground hover:bg-critical/90"
          }`}
        >
          <Zap className={`h-3.5 w-3.5 ${remediating ? "animate-spin" : ""}`} />
          <span>
            {remediating
              ? "Phantom Severing Path..."
              : remediated
                ? "Kill Chain Broken ✓"
                : "Break Kill Chain (Phantom)"}
          </span>
        </button>
      }
    >
      {/* ── Main Layout: Topology Graph + Interactive Inspector ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (7 Cols): Attack Graph Canvas */}
        <Panel index={0} holo glow="primary" className="p-5 lg:col-span-7 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
              <div>
                <h3 className="font-display text-sm font-bold text-foreground flex items-center gap-2">
                  <span>Azure Topology Attack Graph</span>
                  <Chip tone={remediated ? "success" : "critical"}>
                    {remediated ? "0 Active Paths" : "1 Toxic Path (Central India)"}
                  </Chip>
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Click any node to inspect exposure surface, IAM permissions, and blast radius
                </p>
              </div>

              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-critical animate-pulse" />
                  Critical Hop
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-info" />
                  Crown Jewel
                </span>
              </div>
            </div>

            <div className="relative mt-3 h-[420px] w-full overflow-hidden rounded-lg border border-border bg-surface-2/30">
              <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none">
                {/* Draw Edges */}
                {azureAttackEdges.map((edge, i) => {
                  const fromNode = azureAttackNodes.find((n) => n.id === edge.from)!;
                  const toNode = azureAttackNodes.find((n) => n.id === edge.to)!;
                  const isCritical = edge.critical && !remediated;

                  return (
                    <g key={i}>
                      <line
                        x1={fromNode?.x ?? 20}
                        y1={fromNode?.y ?? 20}
                        x2={toNode?.x ?? 50}
                        y2={toNode?.y ?? 50}
                        stroke={
                          isCritical
                            ? "var(--color-critical)"
                            : "var(--color-border)"
                        }
                        strokeWidth={isCritical ? 0.9 : 0.4}
                        strokeDasharray={isCritical ? "2 1" : "none"}
                      />
                    </g>
                  );
                })}

                {/* Draw Nodes */}
                {azureAttackNodes.map((node) => {
                  const isSelected = selectedNode === node.id;
                  const isCrown = node.kind === "crown";
                  const isEntry = node.kind === "entry";

                  return (
                    <g
                      key={node.id}
                      onClick={() => setSelectedNode(node.id)}
                      className="cursor-pointer transition-transform duration-200 hover:scale-110"
                      transform={`translate(${node?.x ?? 50}, ${node?.y ?? 50})`}
                    >
                      {isSelected && (
                        <circle
                          r={4.5}
                          fill="none"
                          stroke="var(--color-primary)"
                          strokeWidth={0.4}
                          style={{ animation: "pulse-ring 1.8s ease-in-out infinite" }}
                        />
                      )}
                      <circle
                        r={3}
                        fill={
                          isCrown
                            ? "var(--color-info)"
                            : isEntry
                              ? "var(--color-critical)"
                              : "var(--color-surface)"
                        }
                        stroke={
                          isSelected
                            ? "var(--color-primary)"
                            : isCrown
                              ? "var(--color-info)"
                              : "var(--color-border)"
                        }
                        strokeWidth={isSelected ? 0.8 : 0.4}
                      />
                      <text
                        y={-4.5}
                        textAnchor="middle"
                        fill="var(--color-foreground)"
                        fontSize="2.8"
                        fontFamily="var(--font-mono)"
                        fontWeight={isSelected ? "bold" : "normal"}
                      >
                        {node.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t border-border/60 pt-3">
            <span>Shortest path: 3 hops (Internet → Central India VM → Production Storage)</span>
            <span>Blast radius: {remediated ? "0 assets" : "38 Azure assets (eflight-azure)"}</span>
          </div>
        </Panel>

        {/* Right Column (5 Cols): Selected Node Inspector & Kill Chain */}
        <div className="space-y-6 lg:col-span-5">
          {/* Node Inspector */}
          <Panel index={1} className="p-5">
            <PanelTitle
              title="Azure Asset & Risk Inspector"
              hint="Detailed graph node telemetry"
            />

            <div className="mt-3 rounded-lg border border-border/80 bg-surface-2/40 p-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-foreground">
                  {activeNode.kind === "crown" ? (
                    <Database className="h-4 w-4" />
                  ) : activeNode.kind === "entry" ? (
                    <Globe className="h-4 w-4" />
                  ) : activeNode.kind === "identity" ? (
                    <Key className="h-4 w-4" />
                  ) : (
                    <Server className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <h4 className="font-display text-sm font-bold text-foreground">
                    {activeNode.label}
                  </h4>
                  <span className="mono text-[10px] text-muted-foreground uppercase">
                    Class: {activeNode.kind} · {activeNode.provider}
                  </span>
                </div>
              </div>

              <div className="mt-3 space-y-2 border-t border-border/60 pt-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Resource Target:</span>
                  <code className="mono font-semibold text-foreground truncate max-w-[200px]">
                    {activeNode.resourceName}
                  </code>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Exposure Surface:</span>
                  <Chip
                    tone={
                      activeNode.kind === "entry" || activeNode.kind === "compute"
                        ? "critical"
                        : "high"
                    }
                  >
                    {activeNode.exposure}
                  </Chip>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Associated Finding:</span>
                  <Link
                    to="/findings"
                    className="text-primary hover:underline mono font-medium"
                  >
                    {activeNode.findingId}
                  </Link>
                </div>
              </div>
            </div>

            {/* Kill Chain Sequence */}
            <div className="mt-4">
              <span className="section-label mb-2 block">Kill Chain Propagation (MITRE ATT&CK)</span>
              <div className="space-y-2 text-xs">
                {azureAttackNodes.map((node) => (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNode(node.id)}
                    className={`cursor-pointer rounded border p-2.5 transition-all ${
                      selectedNode === node.id
                        ? "border-primary bg-surface-2/80 shadow-sm"
                        : "border-border/80 bg-surface-2/30 hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`mono text-[10px] font-bold ${
                        node.kind === "crown" ? "text-info" : node.kind === "entry" ? "text-critical" : "text-high"
                      }`}>
                        {node.stepNumber}. {node.label}
                      </span>
                      <span className="mono text-[9px] text-muted-foreground">{node.findingId}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground mt-0.5 block leading-relaxed">
                      {node.stepDescription}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <Link
              to="/ai/advisor"
              search={{
                prompt: `Analyze toxic attack path involving ${activeNode.label} (${activeNode.resourceName}). What is the blast radius and remediation playbook?`,
                provider: "azure",
              }}
              className="mt-4 flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-5 text-xs font-semibold text-foreground hover:bg-surface-2/80 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>Generate Spectra Remediation Plan</span>
            </Link>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
