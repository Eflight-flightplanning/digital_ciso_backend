/**
 * Digital CISO — Shared Data Models & Types
 * (All mock fixtures have been permanently removed; all telemetry is live from backend)
 */

export interface Finding {
  id: string;
  check_id?: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "informational";
  status: "FAIL" | "PASS" | "MUTED" | string;
  status_extended?: string;
  resource?: string;
  resource_id?: string;
  provider: string;
  region?: string;
  service?: string;
  inserted_at?: string;
  impact?: string;
  riskScore?: number;
  confidence?: number;
  firstSeen?: string;
  remediation?: string;
}

export interface Decision {
  id: string;
  finding?: string;
  finding_check_id?: string;
  analyst_email?: string;
  priority?: string;
  risk?: number;
  review?: "Pending" | "Approved" | "Rejected" | "Auto-Applied" | string;
  sla?: string;
  reviewer?: string;
  decision?: "FIX_NOW" | "ACCEPT_RISK" | "MUTE" | string;
  previous_status?: string;
  new_status?: string;
  rationale_summary?: string;
  rationale?: string;
  severity?: string;
  provider_type?: string;
  inserted_at?: string;
}
