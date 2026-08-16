import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Boxes,
  Search,
  ShieldAlert,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  DataTable,
  Row,
  Chip,
} from "@/components/ui-kit/primitives";
import { resources as initialResources } from "@/lib/mock";
import { useResources } from "@/hooks/use-api";

export const Route = createFileRoute("/resources")({
  component: ResourcesPage,
});

function ResourcesPage() {
  const { data: apiResources, isLoading } = useResources();

  const resourceList = (apiResources?.items && apiResources.items.length > 0)
    ? (apiResources.items as Array<Record<string, unknown>>).map((r) => ({
        uid: (r.uid as string) || (r.name as string) || (r.id as string) || "res-0000",
        type: (r.type as string) || (r.resource_type as string) || "Cloud Service",
        provider: ((r.provider as string) || (r.provider_type as string) || "AWS").toUpperCase(),
        region: (r.region as string) || "global",
        tags: typeof r.tags === "object" && r.tags !== null ? Object.keys(r.tags).length : ((r.tag_count as number) || 4),
        failedFindings: (r.failed_findings_count as number) || 0,
      }))
    : initialResources;

  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("All");

  const filtered = resourceList.filter((r) => {
    if (providerFilter !== "All" && r.provider !== providerFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.uid.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        r.region.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <AppShell
      title="Cloud Asset Catalog & Inventory"
      subtitle="Complete multi-cloud topology, identity mappings, and infrastructure configuration catalog"
    >
      {/* ── Toolbar & Table in Single Clean Surface ── */}
      <Panel index={0} className="p-0">
        <div className="p-4 border-b border-border/80 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2/40 p-1 text-xs">
            {["All", "AWS", "Azure", "GCP", "K8s", "GitHub"].map((prov) => (
              <button
                key={prov}
                onClick={() => setProviderFilter(prov)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-all ${
                  providerFilter === prov
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {prov}
              </button>
            ))}
          </div>

          <div className="relative min-w-[220px]">
            <Search className="absolute top-2 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search assets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2/60 py-1.5 pr-3 pl-8 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
            />
          </div>
        </div>

        <DataTable
          head={[
            "Resource UID / ARN",
            "Resource Type",
            "Provider",
            "Region",
            "Tag Count",
            "Posture Health",
            "Actions",
          ]}
        >
          {filtered.map((r, i) => (
            <Row key={r.uid} index={i}>
              <td className="mono px-4 py-3 text-xs font-semibold text-foreground">
                {r.uid}
              </td>
              <td className="px-4 py-3 text-xs text-foreground font-medium">
                {r.type}
              </td>
              <td className="px-4 py-3 text-xs font-semibold text-foreground">
                {r.provider}
              </td>
              <td className="mono text-[11px] text-muted-foreground px-4 py-3">
                {r.region}
              </td>
              <td className="mono text-xs px-4 py-3 text-muted-foreground">
                {r.tags} tags
              </td>
              <td className="px-4 py-3">
                <Chip
                  tone={
                    r.uid.includes("billing") || r.uid.includes("ci")
                      ? "critical"
                      : "success"
                  }
                >
                  {r.uid.includes("billing") || r.uid.includes("ci")
                    ? "At Risk"
                    : "Protected"}
                </Chip>
              </td>
              <td className="px-4 py-3">
                <Link
                  to="/findings"
                  className="inline-flex items-center gap-1 rounded bg-surface-2 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-primary/20 hover:text-primary transition-colors"
                >
                  <ShieldAlert className="h-3 w-3" />
                  <span>Inspect</span>
                </Link>
              </td>
            </Row>
          ))}
        </DataTable>
      </Panel>
    </AppShell>
  );
}
