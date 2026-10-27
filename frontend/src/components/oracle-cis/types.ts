export type Status = "PASS" | "FAIL" | "MANUAL";
export type Severity = "critical" | "high" | "medium" | "low" | "informational";
export type Flag =
  | "provisional"
  | "partially_evidenced"
  | "automated_check_failed"
  | "requires_other_access";

export interface Result {
  id: number;
  control_id: string;
  check_id: string;
  title: string;
  level: "L1" | "L2";
  section: string;
  section_name: string;
  severity: Severity;
  automation: "automated" | "partial" | "none";
  raw_status: string;
  status: Status;
  flags: Flag[];
  reason: string;
  checked_at: string | null;
  evidence: Record<string, unknown>;
  not_assessed: boolean;
}

export interface Counts {
  PASS: number;
  FAIL: number;
  MANUAL: number;
  manual_controls: number;
  /** Tested by the tool but could not complete (e.g. no Fusion pod connection); shown as MANUAL. */
  not_completed: number;
  tested: number;
  assessed: number;
  total: number;
}

export interface IdentitySummary {
  monitored: number;
  dormant: number;
  active: number;
  dormant_privileged: number;
  ghost: number | null;
  superusers: number | null;
  threshold_days: number | null;
  source: string | null;
  fusion_error?: string | null;
}

export interface RunSummary {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: "running" | "finished" | "failed";
  started_by: string | null;
  trigger: string;
  tenant: string;
  counts: Partial<Counts>;
  error: string;
  progress: { done: number; total: number };
}

export interface RunDetail extends RunSummary {
  results: Result[];
  identity_summary: IdentitySummary;
  revealed: boolean;
  running?: RunSummary | null;
}

export interface ControlMeta {
  CheckID: string;
  CisId: string;
  CheckTitle: string;
  Section: string;
  SectionName: string;
  SubSection: string | null;
  SubSectionName: string | null;
  ProfileLevel: "L1" | "L2";
  Automation: "automated" | "partial" | "none";
  ServiceName: string;
  RequiredAccess: string[];
  Description: string;
  Risk: string;
  AuditProcedure: string[];
  Remediation: { Steps: string[] };
  DefaultValue: string;
  References: string[];
  CisControlsV8: string[];
  Notes: string;
  Severity: Severity;
}

export interface Health {
  idcs: Record<string, boolean>;
  fusion: Record<string, boolean>;
  check_engine: Record<string, boolean>;
  jira: Record<string, boolean>;
  remediation_live: boolean;
  tenant: string;
  excluded_actors: string[];
  settings: Record<string, string | number | string[]>;
  checks: { total: number; automated: number; partial: number; manual_only: number };
  permissions: { manage_scans: boolean; manage_providers: boolean; manage_integrations: boolean };
  severity_label: string;
}

export const STATUSES: Status[] = ["PASS", "FAIL", "MANUAL"];
export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "informational"];
export const SECTIONS: Record<string, string> = {
  "1": "Identity and Access Management",
  "2": "Networking",
  "3": "Logging and Monitoring",
  "4": "Application Configuration Management",
  "5": "Application Access Control",
};
export const SEVERITY_LABEL = "Assessor-assigned severity (not defined by the CIS benchmark)";

export interface JiraTicketInfo {
  id: number;
  key: string;
  url: string;
  status: string;
  status_category: string;
  assignee: string;
  priority: string;
  created_at: string;
  synced_at: string | null;
}

export interface RemediationInfo {
  id: number;
  action: "suspend_user" | "revoke_role";
  role_code: string;
  status: "staged" | "executed" | "failed";
  request: { method: string; endpoint: string; payload: unknown };
  error: string;
  user: string | null;
  created_at: string;
  executed_at: string | null;
  jira_comment_error?: string | null;
}

export type IdentityKind = "dormant" | "active" | "ghost";

export interface IdentityRow {
  id: number;
  kind: IdentityKind;
  control_id: string;
  username: string;
  can_remediate: boolean;
  details: Record<string, any>;
  tickets: JiraTicketInfo[];
  remediations: RemediationInfo[];
  state: "open" | "ticketed" | "staged" | "remediated";
}

export interface IdentityPage {
  kind: IdentityKind;
  run: { id: number; finished_at: string; tenant: string } | null;
  total: number;
  page: number;
  page_size: number;
  counts: { dormant?: number; active?: number; ghost?: number };
  summary?: IdentitySummary;
  jira_configured: boolean;
  remediation_live: boolean;
  results: IdentityRow[];
}

export interface ConnField { value: string; source: "provider" | "env" | null }
export interface ConnSecret { set: boolean; source: "provider" | "env" | null }
export interface ConnectionsView {
  idcs: { base_url: ConnField; client_id: ConnField; client_secret: ConnSecret };
  fusion: { pod_url: ConnField; username: ConnField; password: ConnSecret };
  /** The platform's Oracle SaaS provider that holds these details (Providers page). */
  provider: { id: string; alias: string; uid: string } | null;
  unreadable_secrets: boolean;
  updated_at: string | null;
}
