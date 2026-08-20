import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Boxes,
  Search,
  ShieldAlert,
  Server,
  Layers,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  DataTable,
  Row,
  Chip,
} from "@/components/ui-kit/primitives";
import { useResources } from "@/hooks/use-api";

export const Route = createFileRoute("/resources")({
  component: ResourcesPage,
});

function ResourcesPage() {
  const { data: apiResources, isLoading } = useResources();

  const resourceList = (apiResources?.items && apiResources.items.length > 0)
    ? (apiResources.items as Array<Record<string, any>>).map((r) => {
        const uid = String(r.uid || r.name || r.id || "res-0000");
        let prov = String(r.provider || r.provider_type || "").toUpperCase();
        if (!prov) {
          if (uid.includes("/subscriptions/") || uid.includes("prowler-azure-")) prov = "AZURE";
          else if (uid.includes("arn:aws:")) prov = "AWS";
          else if (uid.includes("ocid1.")) prov = "OCI";
          else if (uid.includes("projects/")) prov = "GCP";
          else prov = "AZURE";
        }

        return {
          uid,
          name: String(r.name || uid.split("/").pop() || "cloud-resource"),
          type: String(r.type || r.resource_type || r.service_name || "Cloud Service"),
          provider: prov,
          region: String(r.region || "centralindia"),
          tags: typeof r.tags === "object" && r.tags !== null ? Object.keys(r.tags).length : (Number(r.tag_count) || 0),
          failedFindings: Number(r.failed_findings_count || 0),
        };
      })
    : [];

  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("All");

  const filtered = resourceList.filter((r) => {
    if (providerFilter !== "All" && r.provider.toUpperCase() !== providerFilter.toUpperCase()) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.uid.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
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
            {["All", "Azure", "AWS", "GCP", "OCI"].map((prov) => (
              <button
                key={prov}
                onClick={() => setProviderFilter(prov)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-all ${
                  providerFilter === prov
                    ? "bg-primary text-primary-foreground shadow-sm font-bold"
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
            "Resource UID / Name",
            "Resource Type",
            "Provider",
            "Region",
            "Config Tags",
            "Violations",
            "Action",
          ]}
        >
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={7} className="p-12 text-center text-muted-foreground">
                <Boxes className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-semibold text-foreground">
                  {isLoading ? "Ingesting live resource inventory..." : "No Discovered Cloud Resources"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Connect your Azure subscription to discover cloud compute, storage, network, and database assets.
                </p>
              </td>
            </tr>
          ) : (
            filtered.map((r, i) => (
              <Row key={`${r.uid}-${i}`} index={i}>
                <td className="mono px-4 py-3 text-xs font-semibold text-foreground max-w-[280px] truncate" title={r.uid}>
                  {r.name}
                  <span className="block text-[10px] text-muted-foreground font-mono truncate">{r.uid}</span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground font-medium">
                  {r.type}
                </td>
                <td className="px-4 py-3">
                  <Chip tone={r.provider === "AZURE" ? "primary" : "neutral"}>
                    {r.provider}
                  </Chip>
                </td>
                <td className="mono text-[11px] text-muted-foreground px-4 py-3">
                  {r.region}
                </td>
                <td className="mono text-[11px] text-muted-foreground px-4 py-3">
                  {r.tags} Tags
                </td>
                <td className="px-4 py-3">
                  {r.failedFindings > 0 ? (
                    <Chip tone="critical">
                      {r.failedFindings} Failing
                    </Chip>
                  ) : (
                    <Chip tone="success">
                      0 Violations
                    </Chip>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link
                    to="/findings"
                    className="inline-flex h-7 items-center justify-center rounded bg-surface-2 px-3 text-[11px] font-semibold text-foreground hover:bg-surface-2/80 transition-colors"
                  >
                    View Findings
                  </Link>
                </td>
              </Row>
            ))
          )}
        </DataTable>
      </Panel>
    </AppShell>
  );
}
