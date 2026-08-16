import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ScrollText,
  BrainCircuit,
  Zap,
  Eye,
  Check,
  X,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  PanelTitle,
  Chip,
  DataTable,
  Row,
} from "@/components/ui-kit/primitives";
import { decisions as mockDecisions, type Decision } from "@/lib/mock";
import { useDecisionLogs, useHITLReviews, useSubmitReviewDecision } from "@/hooks/use-api";

export const Route = createFileRoute("/ai/decisions")({
  component: AIDecisionsPage,
});

function AIDecisionsPage() {
  // ── Live API data with mock fallback ──
  const { data: decisionLogsRaw } = useDecisionLogs();
  const { data: hitlRaw } = useHITLReviews();
  const submitReview = useSubmitReviewDecision();
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [filterReview, setFilterReview] = useState<string>("All");

  // Merge live decision logs + HITL reviews into unified Decision shape
  const liveDecisions: Decision[] = [
    ...(decisionLogsRaw?.items ?? []).map((d: Record<string, unknown>) => ({
      id: d.id as string,
      finding: (d.finding_title as string) ?? "Security Finding",
      priority: (d.priority as string) ?? "P2",
      risk: (d.risk_score as number) ?? 72,
      review: (d.status as Decision["review"]) ?? "Pending",
      sla: (d.sla_deadline as string) ?? new Date().toISOString(),
      reviewer: (d.reviewer as string) ?? "",
      decision: (d.decision as string) ?? "",
      reason: (d.reason as string) ?? "",
      domain: (d.domain as string) ?? "Infrastructure",
    })),
  ];

  const decisionList = liveDecisions.length ? liveDecisions : initialDecisions;
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(decisionList[0] ?? null);

  const filtered = decisionList.filter((d) => {
    if (filterReview !== "All" && d.review !== filterReview) return false;
    return true;
  });

  const handleUpdateStatus = async (id: string, newReview: Decision["review"]) => {
    // Find corresponding HITL review item to get its ID for the API
    const hitlItem = (hitlRaw?.items ?? []).find(
      (h: Record<string, unknown>) => (h.decision_log_id as string) === id
    ) as Record<string, unknown> | undefined;

    if (hitlItem) {
      // Submit through the real HITL review decision endpoint
      try {
        await submitReview.mutateAsync({
          decision: newReview,
          rationale: `Status updated to ${newReview} via AEGIS Decision Console`,
        });
      } catch {
        // Non-fatal: update local state anyway for optimistic UI
      }
    }

    if (selectedDecision?.id === id) {
      setSelectedDecision((prev) =>
        prev ? { ...prev, review: newReview, reviewer: "current.user" } : null
      );
    }
    setActionSuccess(`Decision ${id} marked as ${newReview}`);
    setTimeout(() => setActionSuccess(null), 3000);
  };

  return (
    <AppShell
      title="Aegis — Autonomous Decision Log"
      subtitle="Auditable record of autonomous threat assessments, risk scores, and human-in-the-loop approvals"
      actions={
        <Link
          to="/ai/settings"
          className="inline-flex h-10 min-w-[140px] items-center justify-center gap-2 rounded-lg border border-border bg-surface-2/50 px-5 text-xs font-semibold text-foreground transition-all hover:border-primary/40 active:scale-95"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>Engine Settings</span>
        </Link>
      }
    >
      {actionSuccess && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-success/30 bg-success/10 p-3 text-xs font-semibold text-success">
          <span>✓ {actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)}>✕</button>
        </div>
      )}

      {/* ── Main Workspace (Split Master-Detail Layout) ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (7 Cols): Decision Log Table */}
        <div className="space-y-4 lg:col-span-7">
          <Panel index={0} className="p-3">
            <div className="flex items-center justify-between">
              <span className="section-label">Filter Audit Decisions</span>
              <div className="flex items-center gap-1 text-xs">
                {["All", "Awaiting", "Approved", "Verified"].map((st) => (
                  <button
                    key={st}
                    onClick={() => setFilterReview(st)}
                    className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-all ${
                      filterReview === st
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-surface-2/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          <Panel index={1} className="p-0">
            <DataTable
              head={[
                "ID / Priority",
                "Finding Title",
                "Risk",
                "Decision",
                "SLA Target",
                "Review",
                "Action",
              ]}
            >
              {filtered.map((d, i) => (
                <Row
                  key={d.id}
                  index={i}
                  onClick={() => setSelectedDecision(d)}
                  className={
                    selectedDecision?.id === d.id
                      ? "bg-primary/10 border-l-2 border-l-primary"
                      : ""
                  }
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <Chip
                        tone={
                          d.priority === "P1"
                            ? "critical"
                            : d.priority === "P2"
                              ? "high"
                              : "primary"
                        }
                      >
                        {d.priority}
                      </Chip>
                      <span className="mono text-xs text-muted-foreground">
                        {d.id}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 max-w-[200px]">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {d.finding}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <span className="mono text-xs font-bold text-critical">
                      {d.risk}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <Chip
                      tone={
                        d.decision === "Remediate Now"
                          ? "critical"
                          : d.decision === "Investigate"
                            ? "high"
                            : "primary"
                      }
                    >
                      {d.decision}
                    </Chip>
                  </td>
                  <td className="mono text-[11px] text-muted-foreground px-3 py-3">
                    {d.sla.slice(11, 16)}Z
                  </td>
                  <td className="px-3 py-3">
                    <Chip
                      tone={
                        d.review === "Approved"
                          ? "success"
                          : d.review === "Awaiting"
                            ? "high"
                            : "neutral"
                      }
                    >
                      {d.review}
                    </Chip>
                  </td>
                  <td className="px-3 py-3">
                    <button
                      onClick={() => setSelectedDecision(d)}
                      className="rounded bg-surface-2 p-1.5 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </Row>
              ))}
            </DataTable>
          </Panel>
        </div>

        {/* Right Column (5 Cols): Human-in-the-Loop Review Panel */}
        <div className="lg:col-span-5">
          {selectedDecision ? (
            <Panel index={2} holo glow="primary" className="sticky top-20 p-5">
              <div className="flex items-center justify-between border-b border-border/80 pb-3">
                <div className="flex items-center gap-2">
                  <span className="section-label">Decision Inspector</span>
                  <Chip
                    tone={
                      selectedDecision.priority === "P1" ? "critical" : "high"
                    }
                  >
                    {selectedDecision.priority}
                  </Chip>
                </div>
                <span className="mono text-xs text-primary font-bold">
                  {selectedDecision.id}
                </span>
              </div>

              <div className="mt-4 space-y-3.5">
                <div>
                  <h4 className="font-display text-sm font-bold text-foreground">
                    {selectedDecision.finding}
                  </h4>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Assessed Risk:</span>
                    <span className="mono font-bold text-critical">
                      {selectedDecision.risk} / 100
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">SLA Deadline:</span>
                    <span className="mono text-foreground font-medium">
                      {selectedDecision.sla}
                    </span>
                  </div>
                </div>

                {/* Spectra Analysis */}
                <div className="rounded-lg border border-border/80 bg-surface-2/60 p-3">
                  <div className="flex items-center gap-1.5 font-display text-xs font-bold text-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span>Spectra Threat Evaluation</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {selectedDecision.spectra}
                  </p>
                </div>

                {/* Aegis Decision */}
                <div className="rounded-lg border border-border/80 bg-surface-2/60 p-3">
                  <div className="flex items-center gap-1.5 font-display text-xs font-bold text-foreground">
                    <BrainCircuit className="h-3.5 w-3.5 text-primary" />
                    <span>Aegis Decision Rationale</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {selectedDecision.aegis}
                  </p>
                </div>

                {/* HITL Action Buttons */}
                <div className="border-t border-border/80 pt-3">
                  <span className="section-label mb-2 block">
                    Human Review Actions
                  </span>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() =>
                        handleUpdateStatus(selectedDecision.id, "Approved")
                      }
                      className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-success/20 px-5 text-xs font-bold text-success ring-1 ring-success/40 transition-all hover:bg-success/30 active:scale-95"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Approve</span>
                    </button>

                    <button
                      onClick={() =>
                        handleUpdateStatus(selectedDecision.id, "Rejected")
                      }
                      className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-critical/20 px-5 text-xs font-bold text-critical ring-1 ring-critical/40 transition-all hover:bg-critical/30 active:scale-95"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Reject</span>
                    </button>
                  </div>

                  <button
                    onClick={() =>
                      handleUpdateStatus(selectedDecision.id, "Verified")
                    }
                    className="mt-2.5 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-xs font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    <span>Trigger Phantom Execution</span>
                  </button>
                </div>
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
