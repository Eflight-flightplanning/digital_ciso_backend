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

export const kpis = {
  postureScore: 74,
  postureTrend: 2.5,
  connectedClouds: 1,
  frameworks: 4,
  openFindings: 53,
  severityBreakdown: {
    critical: 0,
    high: 49,
    medium: 28,
    low: 6,
  },
};

export const findingsByStatus = [
  { name: "Pass", value: 30, key: "success" },
  { name: "Fail", value: 53, key: "critical" },
  { name: "Muted", value: 0, key: "neutral" },
];

export const severityDistribution = [
  { name: "Critical", value: 0, count: 0 },
  { name: "High", value: 49, count: 49 },
  { name: "Medium", value: 28, count: 28 },
  { name: "Low", value: 6, count: 6 },
  { name: "Info", value: 0, count: 0 },
];

export const resourceInventory = [
  { service: "Virtual Machines", count: 12 },
  { service: "Storage Accounts", count: 14 },
  { service: "SQL Databases", count: 6 },
  { service: "Network Security Groups", count: 4 },
  { service: "Key Vaults", count: 2 },
];

export const severityOverTime = [
  { day: "Aug 11", critical: 0, high: 55, medium: 32 },
  { day: "Aug 12", critical: 0, high: 53, medium: 30 },
  { day: "Aug 13", critical: 0, high: 51, medium: 29 },
  { day: "Aug 14", critical: 0, high: 50, medium: 29 },
  { day: "Aug 15", critical: 0, high: 49, medium: 28 },
  { day: "Aug 16", critical: 0, high: 49, medium: 28 },
  { day: "Aug 17", critical: 0, high: 49, medium: 28 },
];

export const radarFrameworks = [
  { framework: "CIS Microsoft Azure v2.0", pass: 74, fail: 26, trend: "+3.1%" },
  { framework: "SOC 2 Type II", pass: 82, fail: 18, trend: "+1.4%" },
  { framework: "ISO/IEC 27001", pass: 78, fail: 22, trend: "-0.8%" },
  { framework: "NIST 800-53", pass: 70, fail: 30, trend: "+2.2%" },
  { framework: "PCI-DSS v4.0", pass: 86, fail: 14, trend: "+4.6%" },
];

export const complianceTrend = [
  { p: 68 },
  { p: 70 },
  { p: 72 },
  { p: 71 },
  { p: 73 },
  { p: 74 },
];

export const threatDots = [
  { x: 35, y: 65, r: 8, name: "VM Trusted Launch Disabled", severity: "high" },
  { x: 65, y: 45, r: 6, name: "Defender SQL Protection Off", severity: "high" },
  { x: 80, y: 75, r: 5, name: "Public Storage Access Enabled", severity: "high" },
];

export const findings: Finding[] = [
  {
    id: "prowler-azure-vm_trusted_launch_enabled-ab5c336b-0e6b-4d8b-bf82-45cc005163e1-centralindia-Digital-CISO-LLM",
    check_id: "vm_trusted_launch_enabled",
    title: "Ensure Virtual Machines have Trusted Launch Enabled",
    severity: "high",
    status: "FAIL",
    status_extended: "Virtual Machine 'Digital-CISO-LLM' does not have Trusted Launch, Secure Boot, or vTPM enabled in Central India region.",
    resource: "Digital-CISO-LLM",
    provider: "AZURE",
    region: "centralindia",
    service: "Compute",
    riskScore: 88,
    confidence: 98,
    firstSeen: "Just now",
    inserted_at: new Date().toISOString(),
    remediation: "Enable Trusted Launch, Secure Boot, and vTPM for the Azure Virtual Machine.",
  },
  {
    id: "prowler-azure-defender_ensure_defender_for_app_services_is_on-ab5c336b",
    check_id: "defender_ensure_defender_for_app_services_is_on",
    title: "Ensure Microsoft Defender for App Services is On",
    severity: "high",
    status: "FAIL",
    status_extended: "Defender for App Services is not set to Standard tier for subscription eflight-azure.",
    resource: "Azure subscription 1",
    provider: "AZURE",
    region: "global",
    service: "Defender",
    riskScore: 85,
    confidence: 100,
    firstSeen: "Just now",
    inserted_at: new Date().toISOString(),
    remediation: "Enable Microsoft Defender for Cloud Standard Tier on App Services.",
  },
  {
    id: "prowler-azure-defender_ensure_defender_for_azure_sql_databases_is_on-ab5c336b",
    check_id: "defender_ensure_defender_for_azure_sql_databases_is_on",
    title: "Ensure Microsoft Defender for Azure SQL Databases is On",
    severity: "high",
    status: "FAIL",
    status_extended: "Defender for Azure SQL Databases is disabled across production SQL servers.",
    resource: "sql-production-primary",
    provider: "AZURE",
    region: "centralindia",
    service: "SQL Database",
    riskScore: 89,
    confidence: 96,
    firstSeen: "Just now",
    inserted_at: new Date().toISOString(),
    remediation: "Enable Microsoft Defender for Azure SQL and Transparent Data Encryption (TDE).",
  },
  {
    id: "prowler-azure-storage_ensure_https_traffic_only_is_enabled-ab5c336b",
    check_id: "storage_ensure_https_traffic_only_is_enabled",
    title: "Ensure Secure Transfer Required is Enabled for Storage Accounts",
    severity: "high",
    status: "FAIL",
    status_extended: "Storage account allows unencrypted HTTP transit and legacy TLS versions.",
    resource: "stproductionciso",
    provider: "AZURE",
    region: "centralindia",
    service: "Storage",
    riskScore: 84,
    confidence: 98,
    firstSeen: "Just now",
    inserted_at: new Date().toISOString(),
    remediation: "Enforce HTTPS traffic only and set minimum TLS version to TLS 1.2 on storage accounts.",
  },
];

export const decisions: Decision[] = [
  {
    id: "dec-01",
    finding: "Ensure Virtual Machines have Trusted Launch Enabled",
    finding_check_id: "vm_trusted_launch_enabled",
    priority: "P1",
    risk: 88,
    review: "Pending",
    sla: "4h remaining",
    reviewer: "admin@securityplatform.com",
    analyst_email: "admin@securityplatform.com",
    decision: "FIX_NOW",
    previous_status: "FAIL",
    new_status: "PENDING_APPROVAL",
    rationale_summary: "Automated Azure CLI remediation generated for Digital-CISO-LLM VM in Central India.",
    rationale: "Automated Azure CLI remediation generated for Digital-CISO-LLM VM in Central India.",
    severity: "high",
    provider_type: "AZURE",
    inserted_at: new Date().toISOString(),
  },
  {
    id: "dec-02",
    finding: "Ensure Microsoft Defender for Azure SQL Databases is On",
    finding_check_id: "defender_ensure_defender_for_azure_sql_databases_is_on",
    priority: "P1",
    risk: 89,
    review: "Pending",
    sla: "4h remaining",
    reviewer: "admin@securityplatform.com",
    analyst_email: "admin@securityplatform.com",
    decision: "FIX_NOW",
    previous_status: "FAIL",
    new_status: "PENDING_APPROVAL",
    rationale_summary: "Enforce Microsoft Defender Threat Protection on Azure SQL Server.",
    rationale: "Enforce Microsoft Defender Threat Protection on Azure SQL Server.",
    severity: "high",
    provider_type: "AZURE",
    inserted_at: new Date().toISOString(),
  },
];

export const frameworks = [
  { id: "cis_2.0_azure", name: "CIS Microsoft Azure Foundations Benchmark", version: "v2.0.0", pct: 74, score: 74.0, passed: 30, failed: 53, total: 83, status: "Compliant" },
  { id: "soc2_azure", name: "SOC 2 Type II (Trust Services Criteria)", version: "2023", pct: 82, score: 82.0, passed: 45, failed: 10, total: 55, status: "Compliant" },
  { id: "iso27001_2022_azure", name: "ISO/IEC 27001:2022 (ISMS)", version: "2022", pct: 78, score: 78.0, passed: 52, failed: 15, total: 67, status: "Compliant" },
  { id: "pci_4.0_azure", name: "PCI-DSS v4.0", version: "v4.0.0", pct: 86, score: 86.0, passed: 60, failed: 10, total: 70, status: "Compliant" },
  { id: "nist_800_53_azure", name: "NIST SP 800-53 Security Controls", version: "Rev. 5", pct: 70, score: 70.0, passed: 80, failed: 34, total: 114, status: "At Risk" },
];

export const providers = [
  { id: "p-01", uid: "ab5c336b-0e6b-4d8b-bf82-45cc005163e1", provider: "azure", alias: "eflight-azure (Microsoft Azure)", status: "CONNECTED", findings_count: 83 },
];

export const resources = [
  { id: "r-01", uid: "/subscriptions/ab5c336b/resourceGroups/rg-production/providers/Microsoft.Compute/virtualMachines/Digital-CISO-LLM", name: "Digital-CISO-LLM", service: "Compute", type: "VirtualMachine", region: "centralindia" },
  { id: "r-02", uid: "/subscriptions/ab5c336b/resourceGroups/rg-production/providers/Microsoft.Storage/storageAccounts/stproductionciso", name: "stproductionciso", service: "Storage", type: "StorageAccount", region: "centralindia" },
  { id: "r-03", uid: "/subscriptions/ab5c336b/resourceGroups/rg-production/providers/Microsoft.Sql/servers/sql-primary", name: "sql-primary", service: "SQL", type: "SqlServer", region: "centralindia" },
];

export const users = [
  { id: "u-01", email: "admin@securityplatform.com", name: "Alex CISO", role: "Security Admin", company_name: "Eflight Global Defense", status: "ACTIVE" },
  { id: "u-02", email: "devsecops@securityplatform.com", name: "DevOps Engineer", role: "Auditor", company_name: "Eflight Global Defense", status: "ACTIVE" },
];

export const scans = [
  { id: "scan-01", name: "Azure Continuous Scan", provider_alias: "eflight-azure (Microsoft Azure)", status: "COMPLETED", duration: "1m 05s", findings_discovered: 83, timestamp: new Date().toISOString() },
];

export const reportHistory = [
  { id: "RPT-8421", title: "CIS Microsoft Azure Foundations Attestation", generated_at: new Date().toISOString(), format: "PDF", score: 74 },
  { id: "RPT-8419", title: "Azure Security Finding Telemetry Export", generated_at: new Date().toISOString(), format: "CSV", score: 74 },
];

export const postureMetrics = {
  score: 74,
  critical_findings: 0,
  high_findings: 49,
  medium_findings: 28,
  low_findings: 6,
  pass_controls: 30,
  fail_controls: 53,
};

export const attackNodes = [
  { id: "internet", label: "Internet (Adversary)", x: 15, y: 50, kind: "entry" },
  { id: "runner", label: "Azure VM (Digital-CISO-LLM)", x: 42, y: 35, kind: "compute" },
  { id: "iam", label: "Entra ID Managed Identity", x: 65, y: 65, kind: "identity" },
  { id: "storage", label: "Azure SQL & Storage", x: 88, y: 50, kind: "crown" },
];

export const attackEdges = [
  { from: "internet", to: "runner", critical: true },
  { from: "runner", to: "iam", critical: true },
  { from: "iam", to: "storage", critical: true },
];
