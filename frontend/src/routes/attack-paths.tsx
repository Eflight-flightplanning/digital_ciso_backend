import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  GitBranch,
  Sparkles,
  RefreshCw,
  Boxes,
  Waypoints,
  ShieldAlert,
  Server,
  FolderTree,
  Database,
  Globe,
  Key,
  Users,
  Shield,
  ZoomIn,
  ZoomOut,
  Maximize2,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  BrainCircuit,
  ArrowRight,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Chip } from "@/components/ui-kit/primitives";
import { useAttackPaths, useAttackPathsQueries, useRunAttackPathsQuery } from "@/hooks/use-api";

export const Route = createFileRoute("/attack-paths")({
  validateSearch: (search: Record<string, unknown>): {
    provider?: string;
    scan_id?: string;
    finding_id?: string;
    query_id?: string;
  } => ({
    provider: search.provider ? String(search.provider) : undefined,
    scan_id: search.scan_id ? String(search.scan_id) : undefined,
    finding_id: search.finding_id ? String(search.finding_id) : undefined,
    query_id: search.query_id ? String(search.query_id) : undefined,
  }),
  component: AttackPathsPage,
});

interface GraphNode {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}
interface GraphRelationship {
  id: string;
  label: string;
  source: string;
  target: string;
  properties: Record<string, unknown>;
}
interface GraphResult {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  total_nodes: number;
  truncated: boolean;
}

// Unified Professional Security Palette
const LABEL_DISPLAY_MAP: Record<string, { name: string; color: string; bg: string; icon: string }> = {
  ProwlerFinding: { name: "Security Finding", color: "#f43f5e", bg: "rgba(244, 63, 94, 0.15)", icon: "finding" },
  Finding: { name: "Security Finding", color: "#f43f5e", bg: "rgba(244, 63, 94, 0.15)", icon: "finding" },
  OCITenancy: { name: "OCI Tenancy", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.12)", icon: "tenancy" },
  OCICompartment: { name: "OCI Compartment", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.12)", icon: "compartment" },
  OCIComputeInstance: { name: "Compute Instance", color: "#22d3ee", bg: "rgba(34, 211, 238, 0.12)", icon: "compute" },
  OCIInstance: { name: "Compute Instance", color: "#22d3ee", bg: "rgba(34, 211, 238, 0.12)", icon: "compute" },
  OCIObjectStorageBucket: { name: "Storage Bucket", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)", icon: "storage" },
  OCIBucket: { name: "Storage Bucket", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)", icon: "storage" },
  OCIPolicy: { name: "IAM Policy", color: "#a78bfa", bg: "rgba(167, 139, 250, 0.12)", icon: "key" },
  OCIDynamicGroup: { name: "Dynamic Group", color: "#a78bfa", bg: "rgba(167, 139, 250, 0.12)", icon: "users" },
  OCIVcn: { name: "Virtual Cloud Network", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.12)", icon: "network" },
  AzureSubscription: { name: "Azure Subscription", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.12)", icon: "tenancy" },
  AzureResourceGroup: { name: "Resource Group", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.12)", icon: "compartment" },
  AzureVirtualMachine: { name: "Virtual Machine", color: "#22d3ee", bg: "rgba(34, 211, 238, 0.12)", icon: "compute" },
  AzureStorageAccount: { name: "Storage Account", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)", icon: "storage" },
  AzureKeyVault: { name: "Key Vault", color: "#a78bfa", bg: "rgba(167, 139, 250, 0.12)", icon: "key" },
  AzureAppService: { name: "App Service", color: "#22d3ee", bg: "rgba(34, 211, 238, 0.12)", icon: "compute" },
  AzureSqlDatabase: { name: "SQL Database", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)", icon: "storage" },
  AzureNetworkSecurityGroup: { name: "Network Security Group", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.12)", icon: "network" },
  AzureADUser: { name: "Entra ID User", color: "#a78bfa", bg: "rgba(167, 139, 250, 0.12)", icon: "users" },
  AzureADRole: { name: "Entra ID Role", color: "#a78bfa", bg: "rgba(167, 139, 250, 0.12)", icon: "key" },
  AzureADApplication: { name: "Entra App", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.12)", icon: "network" },
  AWSAccount: { name: "AWS Account", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.12)", icon: "tenancy" },
  OracleSaaSAccount: { name: "Oracle SaaS Account", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.12)", icon: "tenancy" },
  OracleSaaSUser: { name: "SaaS User", color: "#a78bfa", bg: "rgba(167, 139, 250, 0.12)", icon: "users" },
  OracleSaaSRole: { name: "SaaS Role", color: "#a78bfa", bg: "rgba(167, 139, 250, 0.12)", icon: "key" },
  OracleSaasPrivilege: { name: "SaaS Privilege", color: "#a78bfa", bg: "rgba(167, 139, 250, 0.12)", icon: "key" },
  Internet: { name: "Public Internet", color: "#f43f5e", bg: "rgba(244, 63, 94, 0.15)", icon: "internet" },
};

function getCleanLabel(rawLabel: string): string {
  if (!rawLabel) return "Resource";
  if (LABEL_DISPLAY_MAP[rawLabel]) return LABEL_DISPLAY_MAP[rawLabel].name;
  return rawLabel.replace(/^_+/, "").replace(/([A-Z])/g, " $1").trim();
}

function getLabelMeta(rawLabel: string) {
  return (
    LABEL_DISPLAY_MAP[rawLabel] || {
      name: getCleanLabel(rawLabel),
      color: "#38bdf8",
      bg: "rgba(56, 189, 248, 0.15)",
      icon: "resource",
    }
  );
}

function primaryLabel(node: GraphNode): string {
  const meaningful = (node.labels || []).filter(
    (l) =>
      !l.startsWith("_Tenant_") &&
      !l.startsWith("_Provider_") &&
      !l.startsWith("_ProviderResource") &&
      !l.startsWith("_OCIResource") &&
      !l.startsWith("_AWSResource") &&
      !l.startsWith("_AzureResource")
  );
  // Prefer specific typed labels over generic ones
  const priority = meaningful.filter((l) => !l.startsWith("_"));
  return priority[0] || meaningful[0] || node.labels?.[0] || "Resource";
}

function nodeDisplayName(node: GraphNode): string {
  const p = node.properties || {};
  const isFinding = (node.labels || []).some((l) => l.toLowerCase().includes("finding"));
  if (isFinding) {
    const title = p.check_title ?? p.title ?? p.check_id ?? p.name;
    if (typeof title === "string" && title.trim()) return title;
    return "Security Finding";
  }
  const candidate = p.name ?? p.display_name ?? p.title ?? p.arn ?? p.ocid ?? p.id ?? p.bucket ?? p.instanceid;
  if (typeof candidate === "string" && candidate.trim()) {
    if (candidate.startsWith("ocid1.") || candidate.length > 36) {
      const parts = candidate.split(".");
      return parts[1] ? `OCI ${parts[1]}` : candidate.slice(-12);
    }
    return candidate;
  }
  return getCleanLabel(primaryLabel(node));
}

// Smart graph limiting — show unique assets + one representative finding per asset
function buildDisplayGraph(
  nodes: GraphNode[],
  relationships: GraphRelationship[]
): { displayNodes: GraphNode[]; displayRels: GraphRelationship[] } {
  const MAX_ASSET_NODES = 12;
  const MAX_FINDINGS_PER_ASSET = 2;

  const isFindingNode = (n: GraphNode) =>
    (n.labels || []).some((l) => l.toLowerCase().includes("finding"));

  const assetNodes = nodes.filter((n) => !isFindingNode(n));
  const findingNodes = nodes.filter((n) => isFindingNode(n));

  // Pick top assets (prefer non-internal label ones)
  const topAssets = assetNodes.slice(0, MAX_ASSET_NODES);
  const topAssetIds = new Set(topAssets.map((n) => n.id));

  // For each asset, pick at most MAX_FINDINGS_PER_ASSET findings
  const assetFindingCount: Record<string, number> = {};
  const chosenFindings: GraphNode[] = [];
  const chosenFindingIds = new Set<string>();

  for (const rel of relationships) {
    if (!rel.label.includes("FINDING")) continue;
    if (!topAssetIds.has(rel.source)) continue;
    const count = assetFindingCount[rel.source] || 0;
    if (count >= MAX_FINDINGS_PER_ASSET) continue;
    const fNode = findingNodes.find((n) => n.id === rel.target);
    if (!fNode) continue;
    if (chosenFindingIds.has(fNode.id)) {
      // Still count the relationship
      assetFindingCount[rel.source] = count + 1;
      continue;
    }
    chosenFindings.push(fNode);
    chosenFindingIds.add(fNode.id);
    assetFindingCount[rel.source] = count + 1;
  }

  const displayNodes = [...topAssets, ...chosenFindings];
  const displayNodeIds = new Set(displayNodes.map((n) => n.id));

  const displayRels = relationships.filter(
    (r) => displayNodeIds.has(r.source) && displayNodeIds.has(r.target)
  );

  return { displayNodes, displayRels };
}

// Clean Tiered DAG layout for attack kill-chain
function layoutGraph(
  nodes: GraphNode[],
  relationships: GraphRelationship[]
): Record<string, { x: number; y: number }> {
  const n = nodes.length;
  if (n === 0) return {};
  const positions: Record<string, { x: number; y: number }> = {};

  if (n === 1) {
    positions[nodes[0].id] = { x: 470, y: 230 };
    return positions;
  }

  // Assign tiers based on node type (left = ingress/root, right = data/findings)
  const getTier = (node: GraphNode): number => {
    const l = primaryLabel(node).toLowerCase();
    if (l.includes("internet") || l.includes("attacker")) return 0;
    if (l.includes("tenancy") || l.includes("subscription") || l.includes("account")) return 1;
    if (l.includes("compartment") || l.includes("resourcegroup") || l.includes("network") || l.includes("vcn")) return 2;
    if (
      l.includes("compute") ||
      l.includes("vm") ||
      l.includes("appservice") ||
      l.includes("instance") ||
      l.includes("user")
    )
      return 3;
    if (l.includes("policy") || l.includes("dynamicgroup") || l.includes("keyvault") || l.includes("role")) return 4;
    if (
      l.includes("bucket") ||
      l.includes("storage") ||
      l.includes("database") ||
      l.includes("sqldb") ||
      l.includes("privilege")
    )
      return 5;
    if (l.includes("finding")) return 6;
    return 3;
  };

  const tierBuckets: Record<number, GraphNode[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  nodes.forEach((node) => {
    const tier = getTier(node);
    tierBuckets[tier].push(node);
  });

  const activeTiers = Object.keys(tierBuckets)
    .map(Number)
    .filter((t) => tierBuckets[t].length > 0)
    .sort((a, b) => a - b);

  const canvasW = 900;
  const canvasH = 440;
  const numTiers = Math.max(activeTiers.length, 1);
  const tierStepX = Math.min(180, (canvasW - 160) / Math.max(numTiers - 1, 1));
  const startX = 80;

  activeTiers.forEach((tier, tierIdx) => {
    const tierNodes = tierBuckets[tier];
    const x = startX + tierIdx * tierStepX;
    const count = tierNodes.length;
    const stepY = count > 1 ? (canvasH - 100) / (count - 1) : 0;

    tierNodes.forEach((node, nodeIdx) => {
      const y = count > 1 ? 50 + nodeIdx * stepY : canvasH / 2;
      positions[node.id] = { x, y };
    });
  });

  return positions;
}

function AttackPathsPage() {
  const searchParams = Route.useSearch();
  const { data: scansData, isLoading: scansLoading } = useAttackPaths();
  const scans = (scansData?.items as Array<Record<string, any>>) ?? [];

  const [selectedScanId, setSelectedScanId] = useState<string>("");
  useEffect(() => {
    if (scans.length === 0) return;

    // 1. Direct scan_id match from query param
    if (searchParams.scan_id && scans.some((s) => s.id === searchParams.scan_id)) {
      setSelectedScanId(searchParams.scan_id);
      return;
    }

    // 2. Provider match from query param (e.g. ?provider=oci or ?provider=oraclecloud)
    if (searchParams.provider) {
      const p = searchParams.provider.trim().toLowerCase();
      const matched = scans.find((s) => {
        const st = (s.provider_type || s.provider?.provider || s.provider || "").toLowerCase();
        if (p === "oci" || p === "oraclecloud" || p === "oracle cloud" || p === "oracle") {
          return st === "oraclecloud" || st === "oci";
        }
        if (p === "oracle_saas" || p === "oracle-saas" || p === "fusion" || p === "saas" || p === "oracle saas" || p === "oracale saas") {
          return st === "oracle_saas";
        }
        if (p === "azure" || p === "az") {
          return st === "azure";
        }
        if (p === "aws" || p === "amazon") {
          return st === "aws";
        }
        return st === p;
      });
      if (matched) {
        setSelectedScanId(matched.id);
        return;
      }
    }

    // 3. Fallback: retain current selection if valid, or default to first ready scan
    if (!selectedScanId || !scans.some((s) => s.id === selectedScanId)) {
      const ready = scans.find((s) => s.graph_data_ready);
      setSelectedScanId(ready ? ready.id : scans[0].id);
    }
  }, [scans, searchParams.scan_id, searchParams.provider, selectedScanId]);

  const selectedScan = scans.find((s) => s.id === selectedScanId);

  const { data: queriesData, isLoading: queriesLoading } = useAttackPathsQueries(
    selectedScan?.graph_data_ready ? selectedScan.id : undefined
  );
  const queries = (queriesData as Array<Record<string, any>>) ?? [];

  const [selectedQueryId, setSelectedQueryId] = useState<string>("");
  useEffect(() => {
    if (queries.length > 0) {
      if (searchParams.query_id && queries.some((q) => q.id === searchParams.query_id)) {
        setSelectedQueryId(searchParams.query_id);
      } else if (!selectedQueryId || !queries.some((q) => q.id === selectedQueryId)) {
        setSelectedQueryId(queries[0].id);
      }
    } else if (queries.length === 0) {
      setSelectedQueryId("");
    }
  }, [queries, selectedQueryId, searchParams.query_id]);

  const runQuery = useRunAttackPathsQuery();
  const [graph, setGraph] = useState<GraphResult | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Pan + zoom state — SVG viewBox manipulation instead of CSS scale
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const VB_W = 940;
  const VB_H = 460;
  const viewBox = `${panX} ${panY} ${VB_W / zoom} ${VB_H / zoom}`;

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.max(0.4, Math.min(3, z + delta)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = (e.clientX - lastMouse.current.x) / zoom;
    const dy = (e.clientY - lastMouse.current.y) / zoom;
    setPanX((p) => p - dx);
    setPanY((p) => p - dy);
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => { isDragging.current = false; };

  const resetView = () => { setZoom(1); setPanX(0); setPanY(0); };

  const executeQuery = () => {
    if (!selectedScan?.id || !selectedQueryId) return;
    setGraphError(null);
    runQuery.mutate(
      { scanId: selectedScan.id, queryId: selectedQueryId },
      {
        onSuccess: (result: any) => {
          setGraph(result as GraphResult);
          setSelectedNodeId(result?.nodes?.[0]?.id || "");
        },
        onError: (err: any) => {
          setGraph({ nodes: [], relationships: [], total_nodes: 0, truncated: false });
          setSelectedNodeId("");
          const msg = String(err?.message || "");
          setGraphError(msg.toLowerCase().includes("not found") ? null : msg || "Query failed");
        },
      }
    );
  };

  useEffect(() => {
    if (selectedScan?.id && selectedQueryId) {
      executeQuery();
    } else {
      setGraph(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScan?.id, selectedQueryId]);

  const allNodes = graph?.nodes ?? [];
  const allRelationships = graph?.relationships ?? [];

  // Smart display graph — limit nodes for readability
  const { displayNodes: nodes, displayRels: relationships } = useMemo(
    () => buildDisplayGraph(allNodes, allRelationships),
    [allNodes, allRelationships]
  );

  // Auto-select first node when graph loads
  useEffect(() => {
    if (nodes.length > 0 && !nodes.find((n) => n.id === selectedNodeId)) {
      setSelectedNodeId(nodes[0].id);
      setPanX(0);
      setPanY(0);
      setZoom(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  const positions = useMemo(() => layoutGraph(nodes, relationships), [nodes, relationships]);
  const activeNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];
  const activeQuery = queries.find((q) => q.id === selectedQueryId);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Counts for summary
  const totalAssets = allNodes.filter((n) => !(n.labels || []).some((l) => l.toLowerCase().includes("finding"))).length;
  const totalFindings = allNodes.filter((n) => (n.labels || []).some((l) => l.toLowerCase().includes("finding"))).length;

  // Node Icon Picker
  const renderNodeIcon = (label: string, isFinding: boolean) => {
    if (isFinding) return <ShieldAlert className="h-5 w-5 text-rose-400" />;
    const l = label.toLowerCase();
    if (l.includes("tenancy") || l.includes("subscription") || l.includes("account")) return <Shield className="h-5 w-5 text-sky-400" />;
    if (l.includes("compartment") || l.includes("resourcegroup")) return <FolderTree className="h-5 w-5 text-sky-400" />;
    if (l.includes("compute") || l.includes("instance") || l.includes("vm") || l.includes("appservice")) return <Server className="h-5 w-5 text-cyan-400" />;
    if (l.includes("storage") || l.includes("bucket") || l.includes("database")) return <Database className="h-5 w-5 text-amber-400" />;
    if (l.includes("policy") || l.includes("role") || l.includes("key") || l.includes("vault")) return <Key className="h-5 w-5 text-violet-400" />;
    if (l.includes("user") || l.includes("group")) return <Users className="h-5 w-5 text-violet-400" />;
    if (l.includes("internet")) return <Globe className="h-5 w-5 text-rose-400" />;
    return <Boxes className="h-5 w-5 text-sky-400" />;
  };

  // Build AI Spectre prompt for a selected node
  const buildSpectrePrompt = (node: GraphNode) => {
    const label = getLabelMeta(primaryLabel(node)).name;
    const name = nodeDisplayName(node);
    const isFinding = (node.labels || []).some((l) => l.toLowerCase().includes("finding"));
    const checkId = node.properties?.check_id ?? node.properties?.uid ?? "";
    const severity = node.properties?.severity ?? "unknown";
    const provider = selectedScan?.provider_type ?? "cloud";

    if (isFinding) {
      return `Spectre, I need a real attack path analysis for a security finding from my ${provider} cloud scan.

Finding: "${name}"
Check ID: ${checkId}
Severity: ${severity}

Please provide:
1. A clear, step-by-step explanation of how an attacker would exploit this specific finding
2. The exact blast radius — what data or systems are at risk if this is exploited
3. Concrete remediation steps with commands or console instructions
4. How this finding fits into a broader kill chain in our ${provider} environment`;
    }

    return `Spectre, analyze this cloud resource from my ${provider} attack path graph and explain its security risk:

Resource Type: ${label}
Resource Name: "${name}"
Cloud Provider: ${provider}

Please provide:
1. What role this resource plays in an attack kill chain
2. Most common ways attackers target or abuse this type of resource
3. What an attacker could do if they compromised this specific resource
4. The top 3 security controls we should verify for this resource type`;
  };

  return (
    <AppShell>
      <div className="space-y-6 pb-12">
        {/* ── Header ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-sm">
                <GitBranch className="h-5 w-5" />
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Attack Paths & Topology Graph
              </h1>
            </div>
            <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground">
              Interactive multi-cloud security topology — real discovered assets and live security findings
            </p>
          </div>

          <button
            onClick={executeQuery}
            disabled={!selectedScan?.id || !selectedQueryId || runQuery.isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-4 text-xs font-semibold text-foreground hover:bg-surface-3 transition-all cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${runQuery.isPending ? "animate-spin" : ""}`} />
            <span>Re-run Query</span>
          </button>
        </div>

        {/* ── Provider Tabs ── */}
        {scansLoading ? (
          <div className="rounded-xl border border-border/60 bg-surface-2/40 p-4 text-xs text-muted-foreground animate-pulse flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary animate-spin" />
            Loading Attack Paths scans…
          </div>
        ) : scans.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-surface/70 p-6 text-center shadow-sm">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground border border-border mb-3">
              <GitBranch className="h-6 w-6" />
            </div>
            <h3 className="font-display text-base font-bold text-foreground">No Attack Paths Scans Found</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              Run a scan for your connected Oracle OCI, Azure, or AWS provider to build the resource graph.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-3">
            {scans
              .filter((s) => s.provider_type !== "oracle_saas")
              .map((s) => {
              const isSelected = selectedScanId === s.id;
              const providerLabel =
                s.provider_type === "oraclecloud"
                  ? "Oracle OCI"
                  : s.provider_type === "azure"
                    ? "Microsoft Azure"
                    : s.provider_type === "aws"
                      ? "Amazon AWS"
                      : s.provider_type;

              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedScanId(s.id)}
                  className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer border ${
                    isSelected
                      ? "bg-surface border-primary text-foreground shadow-md shadow-primary/10 ring-1 ring-primary/30"
                      : "bg-surface-2/50 border-border/50 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${s.graph_data_ready ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-400 animate-pulse"}`} />
                  <span className="font-bold">{providerLabel}</span>
                  <span className="truncate max-w-[160px] font-normal text-[11px] text-muted-foreground">
                    ({s.provider_alias || s.provider_uid})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {selectedScan && !selectedScan.graph_data_ready && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-950/10 p-6 text-center shadow-sm">
            <h3 className="font-display text-base font-bold text-foreground">Graph Ingestion In Progress</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              This provider's Attack Paths graph is syncing (state: {selectedScan.state || "scheduled"}). Queries will activate once ingestion reaches 100%.
            </p>
          </div>
        )}

        {selectedScan?.graph_data_ready && (
          <>
            {/* ── Query Selector Bar ── */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border/80 bg-surface/80 p-3.5 shadow-sm">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <Waypoints className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-bold text-muted-foreground shrink-0">Attack Vector:</span>
                <select
                  value={selectedQueryId}
                  onChange={(e) => setSelectedQueryId(e.target.value)}
                  disabled={queriesLoading || queries.length === 0}
                  className="h-9 flex-1 min-w-0 rounded-lg border border-border bg-surface-2 px-3 text-xs font-semibold text-foreground outline-none hover:border-primary/40 focus:border-primary cursor-pointer disabled:opacity-50"
                >
                  {queries.length === 0 && <option value="">No queries available for this provider</option>}
                  {queries.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.name}
                    </option>
                  ))}
                </select>
              </div>
              {activeQuery?.short_description && (
                <div className="text-[11px] text-muted-foreground sm:max-w-md sm:text-right bg-surface-2/60 px-3 py-1.5 rounded-lg border border-border/50">
                  {activeQuery.short_description}
                </div>
              )}
            </div>

            {graphError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-950/10 p-4 text-xs text-rose-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{graphError}</span>
              </div>
            )}

            {/* ── Main Canvas & Inspector ── */}
            {runQuery.isPending ? (
              <div className="rounded-2xl border border-border/60 bg-surface-2/40 p-16 text-center text-xs text-muted-foreground animate-pulse flex flex-col items-center justify-center gap-3">
                <Sparkles className="h-6 w-6 text-primary animate-spin" />
                <span className="font-semibold text-foreground">Executing Cypher graph traversal…</span>
                <span className="text-[11px]">Querying real nodes, relationships, and security controls</span>
              </div>
            ) : allNodes.length === 0 ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-8 text-center shadow-sm">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 mb-3">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="font-display text-base font-bold text-foreground">No Vulnerabilities Found for This Vector</h3>
                <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                  No matching attack pattern was discovered in your real cloud graph for this query. Select a different attack vector above to explore other resource paths.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Stats Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Cloud Assets", value: totalAssets, color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/20" },
                    { label: "Security Findings", value: totalFindings, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
                    { label: "Graph Edges", value: allRelationships.length, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
                    { label: "Graph Nodes (Total)", value: allNodes.length, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
                  ].map((stat) => (
                    <div key={stat.label} className={`rounded-xl border p-3.5 ${stat.bg}`}>
                      <p className={`text-2xl font-bold font-display ${stat.color}`}>{stat.value}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{stat.label}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                  {/* ── Left: Interactive Graph Canvas ── */}
                  <div className="lg:col-span-7 flex flex-col rounded-2xl border border-border/80 bg-surface/90 p-5 sm:p-6 backdrop-blur-md shadow-lg relative overflow-hidden">
                    {/* Canvas Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3.5 mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display text-sm font-bold text-foreground">Kill-Chain Topology Canvas</h3>
                          <Chip tone={allNodes.length > nodes.length ? "medium" : "success"}>
                            {nodes.length} Nodes · {relationships.length} Edges
                            {allNodes.length > nodes.length && ` (${allNodes.length} total)`}
                          </Chip>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Click any node to inspect it and get AI threat analysis
                        </p>
                      </div>

                      {/* Zoom Controls */}
                      <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-lg border border-border/60">
                        <button
                          onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}
                          className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-surface transition-colors cursor-pointer"
                          title="Zoom Out"
                        >
                          <ZoomOut className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-[10px] font-mono font-semibold px-1 text-muted-foreground">{Math.round(zoom * 100)}%</span>
                        <button
                          onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
                          className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-surface transition-colors cursor-pointer"
                          title="Zoom In"
                        >
                          <ZoomIn className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={resetView}
                          className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-surface transition-colors cursor-pointer"
                          title="Reset View"
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* SVG Graph Canvas — pan by dragging, zoom by scroll wheel or buttons */}
                    <div
                      className="relative w-full h-[480px] sm:h-[520px] rounded-xl border border-border/70 overflow-hidden select-none shadow-inner"
                      style={{ background: "var(--graph-bg, #f1f5f9)" }}
                    >
                      {/* Pan hint */}
                      <div className="absolute top-2 right-3 z-10 flex items-center gap-1.5 text-[10px] text-muted-foreground bg-surface/80 backdrop-blur-sm px-2 py-1 rounded-md border border-border/40 pointer-events-none">
                        <span>Drag to pan · Scroll to zoom</span>
                      </div>

                      <svg
                        ref={svgRef}
                        viewBox={viewBox}
                        className="h-full w-full"
                        style={{ cursor: isDragging.current ? "grabbing" : "grab" }}
                        preserveAspectRatio="xMidYMid meet"
                        onWheel={handleWheel}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                      >
                        <defs>
                          {/* Universal dot grid — works on both light and dark backgrounds */}
                          <pattern id="graphDots" width="24" height="24" patternUnits="userSpaceOnUse">
                            <circle cx="12" cy="12" r="1.2" fill="currentColor" opacity="0.18" />
                          </pattern>

                          {/* Arrowheads */}
                          <marker id="arrowRed" markerWidth="8" markerHeight="8" refX="24" refY="4" orient="auto">
                            <polygon points="0 0, 8 4, 0 8" fill="#dc2626" />
                          </marker>
                          <marker id="arrowBlue" markerWidth="8" markerHeight="8" refX="24" refY="4" orient="auto">
                            <polygon points="0 0, 8 4, 0 8" fill="#2563eb" />
                          </marker>

                          {/* Filters */}
                          <filter id="findingGlow" x="-60%" y="-60%" width="220%" height="220%">
                            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#dc2626" floodOpacity="0.5" />
                          </filter>
                          <filter id="selectedGlow" x="-60%" y="-60%" width="220%" height="220%">
                            <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor="#2563eb" floodOpacity="0.6" />
                          </filter>
                          <filter id="nodeShadow" x="-30%" y="-30%" width="160%" height="160%">
                            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.15" />
                          </filter>
                        </defs>

                        {/* Background */}
                        <rect x={panX - 2000} y={panY - 2000} width="8000" height="8000" fill="#f8fafc" className="dark:hidden" />
                        <rect x={panX - 2000} y={panY - 2000} width="8000" height="8000" fill="#0f172a" className="hidden dark:block" />
                        <rect x={panX - 2000} y={panY - 2000} width="8000" height="8000" fill="url(#graphDots)" />

                        {/* Edges */}
                        {relationships.map((rel) => {
                          const from = positions[rel.source];
                          const to = positions[rel.target];
                          if (!from || !to) return null;
                          const isFindingRel = rel.label.includes("FINDING");
                          const midX = (from.x + to.x) / 2;
                          const midY = (from.y + to.y) / 2;
                          const dx = to.x - from.x;
                          const dy = to.y - from.y;
                          const curveOffset = Math.min(Math.abs(dy) * 0.25 + 20, 50);
                          const cpx = midX + (dy > 0 ? curveOffset * 0.4 : -curveOffset * 0.4);
                          const cpy = midY - curveOffset;

                          return (
                            <g key={rel.id}>
                              {/* Wider invisible hit area for hover */}
                              <path
                                d={`M ${from.x} ${from.y} Q ${cpx} ${cpy} ${to.x} ${to.y}`}
                                fill="none" stroke="transparent" strokeWidth="12"
                              />
                              <path
                                d={`M ${from.x} ${from.y} Q ${cpx} ${cpy} ${to.x} ${to.y}`}
                                fill="none"
                                stroke={isFindingRel ? "#dc2626" : "#2563eb"}
                                strokeWidth={isFindingRel ? "2.5" : "2"}
                                strokeDasharray={isFindingRel ? "7 4" : undefined}
                                strokeOpacity="0.85"
                                markerEnd={isFindingRel ? "url(#arrowRed)" : "url(#arrowBlue)"}
                              />
                              {/* Edge label only for longer edges */}
                              {(Math.abs(dx) + Math.abs(dy)) > 100 && (
                                <g transform={`translate(${cpx}, ${cpy - 4})`}>
                                  <rect x="-34" y="-9" width="68" height="18" rx="9"
                                    fill={isFindingRel ? "#fef2f2" : "#eff6ff"}
                                    stroke={isFindingRel ? "#fca5a5" : "#93c5fd"}
                                    strokeWidth="1"
                                  />
                                  <text x="0" y="4" textAnchor="middle"
                                    fill={isFindingRel ? "#991b1b" : "#1d4ed8"}
                                    fontFamily="ui-monospace,monospace" fontSize="7" fontWeight="700"
                                  >
                                    {rel.label.replace(/_/g, " ").slice(0, 13)}
                                  </text>
                                </g>
                              )}
                            </g>
                          );
                        })}

                        {/* Nodes */}
                        {nodes.map((node) => {
                          const pos = positions[node.id];
                          if (!pos) return null;
                          const rawLabel = primaryLabel(node);
                          const meta = getLabelMeta(rawLabel);
                          const isFinding = (node.labels || []).some((l) => l.toLowerCase().includes("finding"));
                          const isSelected = selectedNodeId === node.id;
                          const name = nodeDisplayName(node);
                          const r = isFinding ? 20 : 24;

                          // Use darker stroke colors for better visibility on light bg
                          const strokeColor = isFinding ? "#dc2626" : meta.color;

                          return (
                            <g
                              key={node.id}
                              onClick={(e) => { e.stopPropagation(); setSelectedNodeId(node.id); }}
                              style={{ cursor: "pointer" }}
                              transform={`translate(${pos.x}, ${pos.y})`}
                            >
                              {/* Selection pulse ring */}
                              {isSelected && (
                                <circle r={r + 10} fill="none"
                                  stroke="#2563eb" strokeWidth="2"
                                  strokeDasharray="6 4" opacity="0.7"
                                />
                              )}

                              {/* Node body — high-contrast dark fill with vivid colored border */}
                              <circle r={r}
                                fill="#090d16"
                                stroke={isSelected ? "#00e5ff" : strokeColor}
                                strokeWidth={isSelected ? "3.5" : "2.5"}
                                filter={isFinding ? "url(#findingGlow)" : isSelected ? "url(#selectedGlow)" : "url(#nodeShadow)"}
                              />

                              {/* Inner accent ring */}
                              <circle r={r - 6}
                                fill={meta.bg}
                                stroke={strokeColor}
                                strokeWidth="1"
                                opacity="0.6"
                              />

                              {/* Finding exclamation badge */}
                              {isFinding && (
                                <g transform={`translate(${r - 4}, ${-(r - 4)})`}>
                                  <circle r="7" fill="#dc2626" />
                                  <text y="4" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="900">!</text>
                                </g>
                              )}

                              {/* Label card */}
                              <g transform={`translate(0, ${r + 14})`}>
                                {/* Card background */}
                                <rect x="-72" y="-7" width="144" height="38" rx="8"
                                  fill="#090d16"
                                  stroke={isSelected ? "#00e5ff" : strokeColor}
                                  strokeWidth={isSelected ? "2" : "1.2"}
                                  filter="url(#nodeShadow)"
                                />
                                {/* Resource name — High Visibility White */}
                                <text x="0" y="8" textAnchor="middle"
                                  fill="#ffffff"
                                  fontSize="10" fontWeight={isSelected ? "800" : "700"}
                                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                                >
                                  {name.length > 19 ? `${name.slice(0, 17)}…` : name}
                                </text>
                                {/* Type label — Bright vivid colored subtitle */}
                                <text x="0" y="23" textAnchor="middle"
                                  fill={meta.color || "#38bdf8"}
                                  fontSize="8.5" fontWeight="700"
                                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                                >
                                  {meta.name}
                                </text>
                              </g>
                            </g>
                          );
                        })}
                      </svg>
                    </div>

                    {/* Legend */}
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground bg-surface-2/50 p-2.5 rounded-xl border border-border/50">
                      <span className="font-bold text-foreground">Legend:</span>
                      <span className="flex items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400">
                        <span className="h-3 w-3 rounded-full bg-blue-600 dark:bg-blue-400" /> Infrastructure
                      </span>
                      <span className="flex items-center gap-1.5 font-semibold text-violet-600 dark:text-violet-400">
                        <span className="h-3 w-3 rounded-full bg-violet-600 dark:bg-violet-400" /> Identity
                      </span>
                      <span className="flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400">
                        <span className="h-3 w-3 rounded-full bg-amber-500" /> Data / Storage
                      </span>
                      <span className="flex items-center gap-1.5 font-semibold text-red-600 dark:text-red-400">
                        <span className="h-3 w-3 rounded-full bg-red-600" /> Security Finding
                      </span>
                      <span className="ml-auto flex items-center gap-1.5 text-muted-foreground">
                        <span className="inline-block w-5 border-t-2 border-blue-500" /> Structural
                      </span>
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="inline-block w-5 border-t-2 border-dashed border-red-500" /> Violation
                      </span>
                    </div>
                  </div>

                  {/* ── Right: Node Inspector ── */}
                  <div className="lg:col-span-5 flex flex-col gap-4 rounded-2xl border border-border/80 bg-surface/90 p-5 sm:p-6 backdrop-blur-md shadow-lg">
                    {activeNode ? (
                      <>
                        {/* Inspector Header */}
                        <div className="flex items-center justify-between border-b border-border/60 pb-3.5">
                          <div>
                            <h3 className="font-display text-sm font-bold text-foreground">Node Inspector</h3>
                            <p className="text-[11px] text-muted-foreground">Resource details & security context</p>
                          </div>
                          <span
                            className="rounded-full px-3 py-1 text-[11px] font-semibold border flex items-center gap-1.5"
                            style={{
                              color: getLabelMeta(primaryLabel(activeNode)).color,
                              borderColor: `${getLabelMeta(primaryLabel(activeNode)).color}40`,
                              backgroundColor: getLabelMeta(primaryLabel(activeNode)).bg,
                            }}
                          >
                            {renderNodeIcon(
                              primaryLabel(activeNode),
                              (activeNode.labels || []).some((l) => l.toLowerCase().includes("finding"))
                            )}
                            <span>{getLabelMeta(primaryLabel(activeNode)).name}</span>
                          </span>
                        </div>

                        {/* Resource Name + ID */}
                        <div className="rounded-xl border border-border/80 bg-surface-2/60 p-4 space-y-2.5 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <h4 className="font-display text-base font-bold text-foreground break-words">
                                {nodeDisplayName(activeNode)}
                              </h4>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="font-mono text-[10px] text-muted-foreground truncate">
                                  ID: {activeNode.id}
                                </span>
                                <button
                                  onClick={() => handleCopy(activeNode.id, "nodeId")}
                                  className="text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
                                  title="Copy Node ID"
                                >
                                  {copiedKey === "nodeId" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Properties */}
                          <div className="pt-2 border-t border-border/60 space-y-1.5 max-h-44 overflow-y-auto pr-1">
                            {Object.entries(activeNode.properties || {})
                              .filter(([k]) => !k.startsWith("_") && k !== "lastupdated")
                              .slice(0, 10)
                              .map(([k, v]) => {
                                const strVal = typeof v === "object" ? JSON.stringify(v) : String(v);
                                const isFail = k.toLowerCase() === "status" && strVal.toUpperCase() === "FAIL";
                                const isPass = k.toLowerCase() === "status" && strVal.toUpperCase() === "PASS";
                                const isHigh =
                                  k.toLowerCase() === "severity" &&
                                  ["critical", "high"].includes(strVal.toLowerCase());

                                return (
                                  <div
                                    key={k}
                                    className="flex items-start justify-between gap-3 text-xs bg-surface/60 px-2.5 py-1.5 rounded-lg border border-border/40"
                                  >
                                    <span className="text-muted-foreground font-semibold shrink-0 capitalize">
                                      {k.replace(/_/g, " ")}:
                                    </span>
                                    {isFail ? (
                                      <span className="rounded bg-rose-500/20 text-rose-400 font-bold px-2 py-0.5 text-[10px]">FAILED</span>
                                    ) : isPass ? (
                                      <span className="rounded bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 text-[10px]">PASSED</span>
                                    ) : isHigh ? (
                                      <span className="rounded bg-amber-500/20 text-amber-400 font-bold px-2 py-0.5 text-[10px] uppercase">
                                        {strVal}
                                      </span>
                                    ) : (
                                      <span className="font-mono text-foreground text-right break-all text-[11px] font-medium">
                                        {strVal.length > 60 ? `${strVal.slice(0, 58)}…` : strVal}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        </div>

                        {/* ── How An Attacker Targets This Node (Attack Kill-Chain Narrative) ── */}
                        <div className="rounded-xl border border-rose-500/30 bg-gradient-to-b from-rose-950/20 via-surface to-surface-2 p-4 space-y-3 shadow-sm">
                          <div className="flex items-center gap-2 border-b border-border/60 pb-2.5">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/20 text-rose-400">
                              <ShieldAlert className="h-4 w-4" />
                            </div>
                            <div>
                              <span className="text-xs font-bold text-foreground block">How An Attacker Targets This Node</span>
                              <span className="text-[10px] text-muted-foreground">Real-world attack scenario & kill-chain trajectory</span>
                            </div>
                          </div>

                          {(() => {
                            const lbl = primaryLabel(activeNode).toLowerCase();
                            const isFinding = (activeNode.labels || []).some((l) => l.toLowerCase().includes("finding"));
                            const name = nodeDisplayName(activeNode);
                            const provider = selectedScan?.provider_type ?? "cloud";

                            if (isFinding) {
                              return (
                                <div className="space-y-2 text-xs">
                                  <p className="text-muted-foreground text-[11.5px] leading-relaxed">
                                    <span className="font-bold text-rose-400">Step 1 — Reconnaissance:</span> Automated scanners or attackers identify this security check failure (<strong className="text-foreground">{name}</strong>) as an active defense gap.
                                  </p>
                                  <p className="text-muted-foreground text-[11.5px] leading-relaxed">
                                    <span className="font-bold text-amber-400">Step 2 — Exploitation:</span> The misconfiguration allows the attacker to bypass access controls, tamper with audit trails, or gain unauthorized visibility into downstream data stores.
                                  </p>
                                </div>
                              );
                            }

                            if (lbl.includes("tenancy") || lbl.includes("subscription") || lbl.includes("account")) {
                              return (
                                <div className="space-y-2 text-xs">
                                  <p className="text-muted-foreground text-[11.5px] leading-relaxed">
                                    <span className="font-bold text-rose-400">Step 1 — Ingress Compromise:</span> An adversary targets root credentials or leaked service principal keys governing <strong className="text-foreground">{name}</strong>.
                                  </p>
                                  <p className="text-muted-foreground text-[11.5px] leading-relaxed">
                                    <span className="font-bold text-amber-400">Step 2 — Full Tenant Blast Radius:</span> Root-level compromise grants direct visibility and administrative control over all nested compartments, virtual networks, compute fleets, and databases.
                                  </p>
                                </div>
                              );
                            }

                            if (lbl.includes("compartment") || lbl.includes("resourcegroup")) {
                              return (
                                <div className="space-y-2 text-xs">
                                  <p className="text-muted-foreground text-[11.5px] leading-relaxed">
                                    <span className="font-bold text-rose-400">Step 1 — Boundary Entry:</span> An attacker exploits a workload inside <strong className="text-foreground">{name}</strong> via a vulnerable application, API key, or container.
                                  </p>
                                  <p className="text-muted-foreground text-[11.5px] leading-relaxed">
                                    <span className="font-bold text-amber-400">Step 2 — Lateral Movement:</span> Connected <code className="bg-surface-3 px-1 py-0.5 rounded font-mono text-[10.5px] text-rose-400">HAS_FINDING</code> edges represent vulnerabilities that can be chained to escalate privileges to neighbor resources.
                                  </p>
                                </div>
                              );
                            }

                            if (lbl.includes("compute") || lbl.includes("vm") || lbl.includes("appservice") || lbl.includes("instance")) {
                              return (
                                <div className="space-y-2 text-xs">
                                  <p className="text-muted-foreground text-[11.5px] leading-relaxed">
                                    <span className="font-bold text-rose-400">Step 1 — Foothold:</span> Attacker scans for open ports or unpatched vulnerabilities on <strong className="text-foreground">{name}</strong> to execute remote code.
                                  </p>
                                  <p className="text-muted-foreground text-[11.5px] leading-relaxed">
                                    <span className="font-bold text-amber-400">Step 2 — Credential Theft:</span> From within the host, the attacker queries instance metadata endpoints (<code className="font-mono bg-surface-3 px-1 rounded text-[10.5px]">169.254.169.254</code>) to steal cloud managed identity tokens.
                                  </p>
                                </div>
                              );
                            }

                            if (lbl.includes("storage") || lbl.includes("bucket") || lbl.includes("database")) {
                              return (
                                <div className="space-y-2 text-xs">
                                  <p className="text-muted-foreground text-[11.5px] leading-relaxed">
                                    <span className="font-bold text-rose-400">Step 1 — Exposure:</span> Attacker identifies public read/write permissions or missing customer-managed encryption on <strong className="text-foreground">{name}</strong>.
                                  </p>
                                  <p className="text-muted-foreground text-[11.5px] leading-relaxed">
                                    <span className="font-bold text-amber-400">Step 2 — Exfiltration:</span> Sensitive datasets, backups, and credentials are exfiltrated directly across public endpoints.
                                  </p>
                                </div>
                              );
                            }

                            return (
                              <p className="text-xs text-muted-foreground text-[11.5px] leading-relaxed">
                                This {provider} resource forms a critical junction in your cloud topology. Red edges indicate active control failures that an attacker can chain together for lateral traversal.
                              </p>
                            );
                          })()}
                        </div>

                        {/* ── Remediation & Fix Guide ── */}
                        <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950/20 via-surface to-surface-2 p-4 space-y-3 shadow-sm">
                          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                                <CheckCircle2 className="h-4 w-4" />
                              </div>
                              <div>
                                <span className="text-xs font-bold text-foreground block">Actionable Remediation</span>
                                <span className="text-[10px] text-muted-foreground">Fix guide & least-privilege security controls</span>
                              </div>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              RECOMMENDED FIX
                            </span>
                          </div>

                          {(() => {
                            const lbl = primaryLabel(activeNode).toLowerCase();
                            const isFinding = (activeNode.labels || []).some((l) => l.toLowerCase().includes("finding"));
                            const checkId = String(activeNode.properties?.check_id || "");
                            const name = nodeDisplayName(activeNode);
                            const provider = selectedScan?.provider_type ?? "cloud";

                            if (isFinding || checkId) {
                              return (
                                <div className="space-y-2.5 text-xs">
                                  <div className="rounded-lg bg-surface-2/80 p-2.5 border border-border/60 font-mono text-[11px] text-emerald-400 flex items-center justify-between">
                                    <span className="truncate">Check ID: {checkId || "Security Finding"}</span>
                                    <button
                                      onClick={() => handleCopy(checkId || name, "remCheckId")}
                                      className="text-muted-foreground hover:text-foreground cursor-pointer p-1"
                                      title="Copy ID"
                                    >
                                      {copiedKey === "remCheckId" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                    </button>
                                  </div>
                                  <div className="space-y-1.5 text-muted-foreground text-[11.5px] leading-relaxed">
                                    <p><strong>1. Immediate Action:</strong> Apply strict least-privilege role assignment and disable unauthenticated network access.</p>
                                    <p><strong>2. IaC / Terraform:</strong> Audit your Terraform/Bicep manifests to set <code className="bg-surface-3 px-1 py-0.5 rounded font-mono text-[10.5px]">enable_https_traffic_only = true</code> and restrict firewall CIDRs.</p>
                                    <p><strong>3. Verification:</strong> Re-run the security scan to verify the check changes to PASSED.</p>
                                  </div>
                                </div>
                              );
                            }

                            if (lbl.includes("tenancy") || lbl.includes("subscription")) {
                              return (
                                <div className="space-y-2 text-xs text-muted-foreground text-[11.5px] leading-relaxed">
                                  <p><strong>Root Boundary Protection:</strong></p>
                                  <ul className="list-disc pl-4 space-y-1">
                                    <li>Enforce Multi-Factor Authentication (MFA) on all Root/Tenant administrators.</li>
                                    <li>Rotate credential keys and decommission unmanaged service principals.</li>
                                    <li>Enable continuous audit logging (Azure Activity Log / OCI Audit) with export to SIEM.</li>
                                  </ul>
                                </div>
                              );
                            }

                            if (lbl.includes("compartment") || lbl.includes("resourcegroup")) {
                              return (
                                <div className="space-y-2 text-xs text-muted-foreground text-[11.5px] leading-relaxed">
                                  <p><strong>Compartment / Resource Group Hardening:</strong></p>
                                  <ul className="list-disc pl-4 space-y-1">
                                    <li>Isolate production workloads into dedicated compartments with restrictive dynamic group policies.</li>
                                    <li>Audit IAM policy statements granting <code className="bg-surface-3 px-1 py-0.5 rounded font-mono text-[10.5px]">manage all-resources</code>.</li>
                                    <li>Resolve active red findings inside this compartment to eliminate lateral movement vectors.</li>
                                  </ul>
                                </div>
                              );
                            }

                            return (
                              <div className="space-y-2 text-xs text-muted-foreground text-[11.5px] leading-relaxed">
                                <p><strong>Resource Hardening:</strong></p>
                                <ul className="list-disc pl-4 space-y-1">
                                  <li>Ensure encryption at rest with customer-managed keys (KMS/Vault).</li>
                                  <li>Place resources inside private subnets behind application gateways or load balancers.</li>
                                  <li>Disable unnecessary ports and verify TLS 1.2+ configuration.</li>
                                </ul>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Spectre AI Threat Analysis CTA */}
                        <div className="rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-950/20 via-surface to-surface-2 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/20 text-violet-400">
                              <BrainCircuit className="h-4 w-4" />
                            </div>
                            <div>
                              <span className="text-xs font-bold text-foreground block">Ask Spectre AI Copilot</span>
                              <span className="text-[10px] text-muted-foreground">Deep threat modeling, blast radius & CLI scripts</span>
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Spectre will analyze <strong className="text-foreground">{nodeDisplayName(activeNode)}</strong> in real time and generate exact remediation commands for your cloud environment.
                          </p>
                          <Link
                            to="/ai/advisor"
                            search={{
                              prompt: buildSpectrePrompt(activeNode),
                              provider: String(selectedScan?.provider_type || ""),
                            }}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs py-2.5 shadow-md transition-all cursor-pointer"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>Ask Spectre for Remediation Commands →</span>
                          </Link>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">Select a node to inspect its attributes.</p>
                    )}
                  </div>
                </div>

                {/* ── Attack Path Narrative from Query ── */}
                {activeQuery && (
                  <div className="rounded-2xl border border-border/80 bg-surface/90 p-6 backdrop-blur-md shadow-lg space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
                          <Waypoints className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-display text-base font-bold text-foreground">{activeQuery.name}</h3>
                          <p className="text-xs text-muted-foreground">
                            {totalAssets} cloud assets · {totalFindings} active security findings
                          </p>
                        </div>
                      </div>
                      <Link
                        to="/ai/advisor"
                        search={{
                          prompt: `Spectre, I'm looking at the "${activeQuery.name}" attack path query in my ${selectedScan?.provider_type || "cloud"} environment. We found ${totalAssets} cloud assets and ${totalFindings} security findings. The query description says: "${activeQuery.description}"\n\nPlease:\n1. Explain in plain English what this attack path means for our environment\n2. Walk through the most likely attack scenario step by step\n3. Give us the top 3 immediate actions to reduce our risk for this specific attack vector`,
                          provider: String(selectedScan?.provider_type || ""),
                        }}
                        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/10 text-violet-400 font-semibold text-xs px-4 py-2 hover:bg-violet-500/20 transition-all"
                      >
                        <BrainCircuit className="h-3.5 w-3.5" />
                        <span>Get Full AI Analysis</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      {/* What this path shows */}
                      <div className="rounded-xl border border-sky-500/20 bg-sky-950/10 p-4 space-y-2.5">
                        <div className="flex items-center gap-2 text-sky-400 font-bold text-xs">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500/20 text-[11px] font-bold">1</span>
                          <span>What This Path Shows</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {activeQuery.description ||
                            "This graph illustrates the structural relationship between cloud container boundaries (Tenancies, Compartments, Resource Groups) and the resources inside them."}
                        </p>
                      </div>

                      {/* Blast Radius */}
                      <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4 space-y-2.5">
                        <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold">2</span>
                          <span>Blast Radius & Risk</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          <strong className="text-rose-400">{totalFindings} active violations</strong> detected across{" "}
                          <strong className="text-foreground">{totalAssets} cloud assets</strong>. Each red{" "}
                          <code className="text-[10px] bg-surface-2 px-1 rounded font-mono">HAS_FINDING</code> edge represents
                          a real security control failure that could be chained into a lateral movement or privilege escalation path.
                        </p>
                      </div>

                      {/* Ask Spectre for full analysis */}
                      <div className="rounded-xl border border-violet-500/20 bg-violet-950/10 p-4 space-y-2.5">
                        <div className="flex items-center gap-2 text-violet-400 font-bold text-xs">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/20 text-[11px] font-bold">3</span>
                          <span>Spectre AI Guidance</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Click <strong className="text-violet-400">"Get Full AI Analysis"</strong> above or click any node to ask Spectre for a real-time, dynamic threat narrative — attack scenario, blast radius, and exact remediation steps tailored to your environment.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
