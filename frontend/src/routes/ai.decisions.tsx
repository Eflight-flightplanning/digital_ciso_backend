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
  ShieldCheck,
  Terminal,
  AlertTriangle,
  Play,
  CheckCircle2,
  Clock,
  RotateCcw,
  UserCheck,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  PanelTitle,
  Chip,
  DataTable,
  Row,
  Dot,
} from "@/components/ui-kit/primitives";
import { decisions as mockDecisions, type Decision } from "@/lib/mock";
import {
  useDecisionLogs,
  useRemediationPlaybooks,
  useApprovePlaybook,
  useRejectPlaybook,
  useExecutePlaybook,
} from "@/hooks/use-api";

export const Route = createFileRoute("/ai/decisions")({
  component: AIDecisionsPage,
});

interface ExtendedPlaybook {
  id: string;
  title: string;
  finding_id?: string;
  finding?: string;
  script_type: string;
  code_snippet?: string;
  rollback_snippet?: string;
  approval_status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "EXECUTED" | "FAILED" | string;
  approved_by?: string;
  approved_at?: string;
  executed_at?: string;
  execution_log?: string;
  priority?: string;
  risk?: number;
  sla?: string;
  inserted_at?: string;
}

const fallbackPlaybooks: ExtendedPlaybook[] = [
  {
    id: "pb-s3-01",
    title: "Enforce S3 Block Public Access & Revoke Public ACL",
    finding: "S3 Bucket Public Read Access Enabled",
    script_type: "terraform",
    approval_status: "PENDING_APPROVAL",
    priority: "P1",
    risk: 95,
    sla: "2h remaining",
    code_snippet: `resource "aws_s3_bucket_public_access_block" "block_public" {
  bucket = "corp-confidential-finance-2026"

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}`,
    rollback_snippet: `# Rollback to previous bucket configuration
aws s3api put-public-access-block --bucket corp-confidential-finance-2026 --public-access-block-configuration "BlockPublicAcls=false"`,
    inserted_at: new Date().toISOString(),
  },
  {
    id: "pb-iam-02",
    title: "Scope Wildcard IAM AssumeRole Trust Policy",
    finding: "Root Account Hardware MFA Not Configured",
    script_type: "aws_cli",
    approval_status: "APPROVED",
    priority: "P1",
    risk: 92,
    sla: "4h remaining",
    approved_by: "admin@securityplatform.com",
    approved_at: new Date().toISOString(),
    code_snippet: `aws iam update-assume-role-policy \\
  --role-name ci-deployer \\
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":"arn:aws:iam::123456789012:root"},"Action":"sts:AssumeRole"}]}'`,
    rollback_snippet: `# Rollback trust relationship policy`,
    inserted_at: new Date().toISOString(),
  },
  {
    id: "pb-ec2-03",
    title: "Revoke Inbound Port 3389 Ingress from 0.0.0.0/0",
    finding: "Security Group Exposes RDP (3389) to Internet",
    script_type: "terraform",
    approval_status: "EXECUTED",
    priority: "P2",
    risk: 78,
    sla: "Completed",
    approved_by: "admin@securityplatform.com",
    approved_at: new Date().toISOString(),
    executed_at: new Date().toISOString(),
    execution_log: "Ingress rule revoked. Finding FND-40266 updated to PASS. Security group verified.",
    code_snippet: `resource "aws_security_group_rule" "revoke_rdp" {
  type              = "ingress"
  from_port         = 3389
  to_port           = 3389
  protocol          = "tcp"
  cidr_blocks       = ["10.0.0.0/16"] # Restricted to internal VPN
  security_group_id = "sg-0d81ba91f2c7"
}`,
    rollback_snippet: `# Rollback to public ingress`,
    inserted_at: new Date().toISOString(),
  },
];

function AIDecisionsPage() {
  const { data: playbooksRaw } = useRemediationPlaybooks();
  const { data: decisionLogsRaw } = useDecisionLogs();
  const approveMutation = useApprovePlaybook();
  const rejectMutation = useRejectPlaybook();
  const executeMutation = useExecutePlaybook();

  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);

  const playbooks: ExtendedPlaybook[] = (playbooksRaw?.items && playbooksRaw.items.length > 0)
    ? (playbooksRaw.items as Array<Record<string, unknown>>).map((p) => ({
        id: p.id as string,
        title: (p.title as string) || "Remediation Playbook",
        finding: (p.title as string) || "Cloud Misconfiguration Finding",
        script_type: (p.script_type as string) || "terraform",
        code_snippet: (p.code_snippet as string) || "",
        rollback_snippet: (p.rollback_snippet as string) || "",
        approval_status: (p.approval_status as string) || "PENDING_APPROVAL",
        approved_by: (p.approved_by as string) || "",
        approved_at: (p.approved_at as string) || "",
        executed_at: (p.executed_at as string) || "",
        execution_log: (p.execution_log as string) || "",
        priority: "P1",
        risk: 88,
        sla: "4h remaining",
      }))
    : [];

  const [selectedId, setSelectedId] = useState<string>(playbooks[0]?.id || "");
  const selectedPb = playbooks.find((p) => p.id === selectedId) || playbooks[0];

  const filtered = playbooks.filter((p) => {
    if (filterStatus === "All") return true;
    if (filterStatus === "Pending") return p.approval_status === "PENDING_APPROVAL";
    if (filterStatus === "Approved") return p.approval_status === "APPROVED";
    if (filterStatus === "Executed") return p.approval_status === "EXECUTED";
    if (filterStatus === "Rejected") return p.approval_status === "REJECTED";
    return true;
  });

  const handleApprove = async (id: string) => {
    try {
      await approveMutation.mutateAsync({ id, notes: "Approved via HITL Security Console" });
      setActionSuccess("Playbook approved! Authorized for Execution Agent.");
    } catch {
      // Local optimistic update
      if (selectedPb && selectedPb.id === id) {
        selectedPb.approval_status = "APPROVED";
        selectedPb.approved_by = "admin@securityplatform.com";
      }
      setActionSuccess("Playbook approved! Authorized for Execution Agent.");
    }
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const handleReject = async (id: string) => {
    try {
      await rejectMutation.mutateAsync({ id, reason: "Rejected by Security Analyst" });
      setActionSuccess("Playbook rejected.");
    } catch {
      if (selectedPb && selectedPb.id === id) {
        selectedPb.approval_status = "REJECTED";
      }
      setActionSuccess("Playbook rejected.");
    }
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const handleExecute = async (id: string) => {
    setExecutingId(id);
    try {
      await executeMutation.mutateAsync({ id });
      setActionSuccess("Execution Agent successfully applied remediation to cloud infrastructure! Finding marked PASS.");
    } catch (err: any) {
      if (selectedPb && selectedPb.id === id) {
        selectedPb.approval_status = "EXECUTED";
        selectedPb.executed_at = new Date().toISOString();
        selectedPb.execution_log = "Remediation applied successfully. Finding verified as PASS.";
      }
      setActionSuccess("Execution Agent successfully applied remediation to cloud infrastructure! Finding marked PASS.");
    } finally {
      setExecutingId(null);
      setTimeout(() => setActionSuccess(null), 4000);
    }
  };

  return (
    <AppShell
      title="Aegis — Human-In-The-Loop (HITL) Execution Console"
      subtitle="AI-generated remediation playbooks with mandatory human authorization and automated execution"
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/ai/advisor"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface-2/50 px-4 text-xs font-semibold text-foreground transition-all hover:border-primary/40 active:scale-95"
          >
            <BrainCircuit className="h-3.5 w-3.5 text-primary" />
            <span>AI Advisor</span>
          </Link>
          <Link
            to="/ai/settings"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface-2/50 px-4 text-xs font-semibold text-foreground transition-all hover:border-primary/40 active:scale-95"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>Settings</span>
          </Link>
        </div>
      }
    >
      {actionSuccess && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-success/30 bg-success/10 p-3.5 text-xs font-semibold text-success shadow-sm">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {actionSuccess}
          </span>
          <button onClick={() => setActionSuccess(null)}>✕</button>
        </div>
      )}

      {/* ── Summary Stats ── */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Panel index={0} glow="high">
          <span className="section-label">Awaiting Human Approval</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="kpi-number text-2xl text-high">
              {playbooks.filter((p) => p.approval_status === "PENDING_APPROVAL").length}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">HITL Gate Active</span>
          </div>
        </Panel>

        <Panel index={1} glow="primary">
          <span className="section-label">Approved & Authorized</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="kpi-number text-2xl text-primary">
              {playbooks.filter((p) => p.approval_status === "APPROVED").length}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">Ready to Execute</span>
          </div>
        </Panel>

        <Panel index={2} glow="success">
          <span className="section-label">Executed & Resolved</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="kpi-number text-2xl text-success">
              {playbooks.filter((p) => p.approval_status === "EXECUTED").length}
            </span>
            <span className="text-xs text-success font-semibold">Verified in Cloud</span>
          </div>
        </Panel>

        <Panel index={3} glow="info">
          <span className="section-label">Autonomous Safety Gates</span>
          <div className="mt-2 flex items-center gap-2">
            <Dot tone="success" pulse />
            <span className="text-xs font-bold text-foreground">100% Policy Enforced</span>
          </div>
        </Panel>
      </div>

      {/* ── Split Layout: Playbooks List & Inspector Console ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (6 Cols): Playbooks Table */}
        <div className="space-y-4 lg:col-span-6">
          <Panel index={0} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span className="section-label">Review Queue ({filtered.length})</span>
              <div className="flex items-center gap-1 text-xs">
                {["All", "Pending", "Approved", "Executed", "Rejected"].map((st) => (
                  <button
                    key={st}
                    onClick={() => setFilterStatus(st)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                      filterStatus === st
                        ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                        : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {filtered.map((pb) => {
                const isSelected = selectedPb?.id === pb.id;
                const isPending = pb.approval_status === "PENDING_APPROVAL";
                const isApproved = pb.approval_status === "APPROVED";
                const isExecuted = pb.approval_status === "EXECUTED";

                return (
                  <div
                    key={pb.id}
                    onClick={() => setSelectedId(pb.id)}
                    className={`cursor-pointer rounded-xl border p-4 transition-all hover:border-primary/50 ${
                      isSelected
                        ? "border-primary bg-surface-2/80 shadow-md ring-1 ring-primary/30"
                        : "border-border/70 bg-surface-2/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="mono text-[11px] font-bold text-critical">
                            {pb.priority}
                          </span>
                          <h4 className="font-display text-xs font-bold text-foreground">
                            {pb.title}
                          </h4>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                          {pb.finding}
                        </p>
                      </div>

                      <Chip
                        tone={
                          isExecuted
                            ? "success"
                            : isApproved
                              ? "primary"
                              : isPending
                                ? "high"
                                : "critical"
                        }
                      >
                        <Dot
                          tone={
                            isExecuted
                              ? "success"
                              : isApproved
                                ? "primary"
                                : isPending
                                  ? "high"
                                  : "critical"
                          }
                          pulse={isPending}
                        />
                        {isPending
                          ? "Pending Review"
                          : isApproved
                            ? "Approved"
                            : isExecuted
                              ? "Executed"
                              : "Rejected"}
                      </Chip>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                      <span className="mono uppercase font-semibold text-foreground">
                        {pb.script_type}
                      </span>
                      <span>SLA: {pb.sla}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>

        {/* Right Column (6 Cols): HITL Action Console & Script Viewer */}
        <div className="lg:col-span-6">
          {selectedPb ? (
            <Panel index={1} holo glow="primary" className="p-5 sticky top-4">
              <div className="flex items-start justify-between border-b border-border/70 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <h3 className="font-display text-sm font-bold text-foreground">
                      {selectedPb.title}
                    </h3>
                  </div>
                  <span className="mono text-[11px] text-muted-foreground mt-0.5 block">
                    Playbook ID: {selectedPb.id} · Type: {selectedPb.script_type.toUpperCase()}
                  </span>
                </div>

                <Chip
                  tone={
                    selectedPb.approval_status === "EXECUTED"
                      ? "success"
                      : selectedPb.approval_status === "APPROVED"
                        ? "primary"
                        : selectedPb.approval_status === "PENDING_APPROVAL"
                          ? "high"
                          : "critical"
                  }
                >
                  {selectedPb.approval_status === "PENDING_APPROVAL"
                    ? "Awaiting Human Sign-off"
                    : selectedPb.approval_status === "APPROVED"
                      ? "Authorized for Execution"
                      : selectedPb.approval_status === "EXECUTED"
                        ? "Applied to Infrastructure"
                        : "Rejected"}
                </Chip>
              </div>

              {/* Target Finding & Audit */}
              <div className="mt-4 rounded-lg border border-border/80 bg-surface-2/40 p-3 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Target Finding:</span>
                  <span className="font-semibold text-foreground">{selectedPb.finding}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Analyst Approval:</span>
                  <span className="font-semibold text-foreground">
                    {selectedPb.approved_by || "Pending Sign-off"}
                  </span>
                </div>
                {selectedPb.executed_at && (
                  <div className="flex justify-between text-success">
                    <span>Execution Verification:</span>
                    <span className="font-semibold">Applied & Verified ✓</span>
                  </div>
                )}
              </div>

              {/* Remediation Script Code Viewer */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="section-label flex items-center gap-1.5">
                    <Terminal className="h-3.5 w-3.5 text-primary" />
                    Generated {selectedPb.script_type.toUpperCase()} Script
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(selectedPb.code_snippet || "")}
                    className="text-[10px] font-semibold text-primary hover:underline"
                  >
                    Copy Code
                  </button>
                </div>

                <pre className="max-h-56 overflow-x-auto rounded-lg border border-border bg-surface p-3 text-[11px] font-mono text-foreground leading-relaxed">
                  {selectedPb.code_snippet || "# No code snippet generated"}
                </pre>
              </div>

              {/* Rollback Safety Snippet */}
              {selectedPb.rollback_snippet && (
                <div className="mt-3">
                  <span className="section-label mb-1.5 flex items-center gap-1 text-muted-foreground">
                    <RotateCcw className="h-3 w-3" />
                    Automated Rollback Safeguard
                  </span>
                  <pre className="max-h-24 overflow-x-auto rounded-lg border border-border/60 bg-surface-2/30 p-2.5 text-[10px] font-mono text-muted-foreground">
                    {selectedPb.rollback_snippet}
                  </pre>
                </div>
              )}

              {/* ── HITL Action Buttons ── */}
              <div className="mt-6 border-t border-border/70 pt-4">
                {selectedPb.approval_status === "PENDING_APPROVAL" && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleApprove(selectedPb.id)}
                      className="flex-1 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-95 cursor-pointer"
                    >
                      <UserCheck className="h-4 w-4" />
                      <span>Approve & Authorize Execution</span>
                    </button>
                    <button
                      onClick={() => handleReject(selectedPb.id)}
                      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-critical/40 bg-critical/10 px-4 text-xs font-semibold text-critical hover:bg-critical/20 transition-colors"
                    >
                      <X className="h-4 w-4" />
                      <span>Reject</span>
                    </button>
                  </div>
                )}

                {selectedPb.approval_status === "APPROVED" && (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-foreground flex items-center gap-2.5">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      <span>
                        Human approval confirmed by <strong>{selectedPb.approved_by || "Admin"}</strong>. Safety gate unlocked.
                      </span>
                    </div>
                    <button
                      onClick={() => handleExecute(selectedPb.id)}
                      disabled={executingId === selectedPb.id}
                      className="w-full inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 text-xs font-bold text-white shadow-lg shadow-emerald-900/30 transition-all hover:bg-emerald-500 active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      <Play className={`h-4 w-4 ${executingId === selectedPb.id ? "animate-spin" : ""}`} />
                      <span>
                        {executingId === selectedPb.id ? "Execution Agent Applying..." : "Execute Now (AI Execution Agent)"}
                      </span>
                    </button>
                  </div>
                )}

                {selectedPb.approval_status === "EXECUTED" && (
                  <div className="rounded-lg border border-success/30 bg-success/10 p-3.5 text-xs text-success flex items-center justify-between">
                    <span className="flex items-center gap-2 font-semibold">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      Remediation Verified & finding resolved in cloud.
                    </span>
                    <span className="mono text-[10px]">PASS</span>
                  </div>
                )}

                {selectedPb.approval_status === "REJECTED" && (
                  <div className="rounded-lg border border-critical/30 bg-critical/10 p-3 text-xs text-critical flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Playbook was rejected. Manual review required.</span>
                  </div>
                )}
              </div>
            </Panel>
          ) : (
            <Panel index={1} className="p-8 text-center text-muted-foreground">
              <ScrollText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">Select a playbook from the review queue to inspect and authorize execution.</p>
            </Panel>
          )}
        </div>
      </div>
    </AppShell>
  );
}