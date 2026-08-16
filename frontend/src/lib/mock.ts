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
  postureScore: 85,
  postureTrend: 3.2,
  connectedClouds: 6,
  frameworks: 4,
  openFindings: 3,
  severityBreakdown: {
    critical: 2,
    high: 1,
    medium: 0,
    low: 0,
  },
};

export const findingsByStatus = [
  { name: "Pass", value: 8421, key: "success" },
  { name: "Fail", value: 1247, key: "critical" },
  { name: "Muted", value: 312, key: "neutral" },
];

export const severityDistribution = [
  { name: "Critical", value: 42, count: 42 },
  { name: "High", value: 128, count: 128 },
  { name: "Medium", value: 315, count: 315 },
  { name: "Low", value: 580, count: 580 },
  { name: "Info", value: 182, count: 182 },
];

export const resourceInventory = [
  { service: "S3", count: 148 },
  { service: "EC2", count: 312 },
  { service: "IAM", count: 96 },
  { service: "RDS", count: 64 },
  { service: "Lambda", count: 210 },
  { service: "VPC", count: 45 },
  { service: "EKS", count: 18 },
  { service: "KMS", count: 52 },
];

export const severityOverTime = [
  { day: "Aug 10", critical: 12, high: 28, medium: 45 },
  { day: "Aug 11", critical: 10, high: 26, medium: 42 },
  { day: "Aug 12", critical: 8, high: 24, medium: 40 },
  { day: "Aug 13", critical: 7, high: 22, medium: 38 },
  { day: "Aug 14", critical: 5, high: 20, medium: 35 },
  { day: "Aug 15", critical: 4, high: 18, medium: 32 },
  { day: "Aug 16", critical: 2, high: 15, medium: 30 },
];

export const radarFrameworks = [
  { framework: "CIS AWS", pass: 88, fail: 12, trend: "+2.4%" },
  { framework: "SOC 2", pass: 93, fail: 7, trend: "+1.8%" },
  { framework: "ISO 27001", pass: 90, fail: 10, trend: "+3.1%" },
  { framework: "PCI-DSS", pass: 95, fail: 5, trend: "+0.5%" },
  { framework: "NIST CSF", pass: 86, fail: 14, trend: "+4.2%" },
  { framework: "HIPAA", pass: 92, fail: 8, trend: "+1.2%" },
];

export const complianceTrend = [
  { p: 78 },
  { p: 80 },
  { p: 82 },
  { p: 81 },
  { p: 85 },
  { p: 88 },
  { p: 91 },
  { p: 93 },
];

export const threatDots = [
  { x: 30, y: 70, r: 8, name: "S3 Bucket Public Access", severity: "critical" },
  { x: 60, y: 40, r: 6, name: "Root MFA Missing", severity: "critical" },
  { x: 80, y: 85, r: 5, name: "Open Inbound SSH", severity: "high" },
];

export const findings: Finding[] = [
  {
    id: "01a0062b-c94a-7ab5-84d3-7f59cc83341e",
    check_id: "s3_bucket_public_access",
    title: "S3 Bucket Public Read Access Enabled",
    severity: "critical",
    status: "FAIL",
    status_extended: "S3 bucket 'corp-confidential-finance-2026' allows anonymous public downloads via ACL.",
    resource: "corp-confidential-finance-2026",
    provider: "AWS",
    region: "us-east-1",
    service: "S3",
    riskScore: 95,
    confidence: 98,
    firstSeen: "2 hours ago",
    inserted_at: new Date().toISOString(),
    remediation: "Enable S3 Block Public Access and enforce bucket owner controls.",
  },
  {
    id: "02b0062b-c94a-7ab5-84d3-7f59cc83341f",
    check_id: "iam_root_mfa_enabled",
    title: "Root Account Hardware MFA Not Configured",
    severity: "critical",
    status: "FAIL",
    status_extended: "Root AWS account does not have MFA enabled (CIS AWS Benchmark 1.5).",
    resource: "arn:aws:iam::987654321098:root",
    provider: "AWS",
    region: "global",
    service: "IAM",
    riskScore: 92,
    confidence: 100,
    firstSeen: "1 day ago",
    inserted_at: new Date().toISOString(),
    remediation: "Enable virtual or hardware MFA device on root account.",
  },
  {
    id: "03c0062b-c94a-7ab5-84d3-7f59cc833420",
    check_id: "nsg_open_ssh_port",
    title: "Security Group Allows Inbound SSH from Internet (0.0.0.0/0)",
    severity: "high",
    status: "FAIL",
    status_extended: "Port 22 is exposed to public internet on production subnet.",
    resource: "sg-0a8b9c1d2e3f4a5b6",
    provider: "AWS",
    region: "us-east-1",
    service: "EC2",
    riskScore: 78,
    confidence: 94,
    firstSeen: "3 hours ago",
    inserted_at: new Date().toISOString(),
    remediation: "Restrict SSH ingress to bastion CIDR block or corporate VPN.",
  },
];

export const decisions: Decision[] = [
  {
    id: "dec-01",
    finding: "S3 Bucket Public Read Access Enabled",
    finding_check_id: "s3_bucket_public_access",
    priority: "P1",
    risk: 95,
    review: "Approved",
    sla: "2h remaining",
    reviewer: "admin@securityplatform.com",
    analyst_email: "admin@securityplatform.com",
    decision: "FIX_NOW",
    previous_status: "FAIL",
    new_status: "RESOLVED",
    rationale_summary: "Automated Terraform playbook generated by Qwen 3.5 9B on Azure VM and applied after human approval.",
    rationale: "Automated Terraform playbook generated by Qwen 3.5 9B on Azure VM and applied after human approval.",
    severity: "critical",
    provider_type: "AWS",
    inserted_at: new Date().toISOString(),
  },
  {
    id: "dec-02",
    finding: "Root Account Hardware MFA Not Configured",
    finding_check_id: "iam_root_mfa_enabled",
    priority: "P1",
    risk: 92,
    review: "Pending",
    sla: "4h remaining",
    reviewer: "admin@securityplatform.com",
    analyst_email: "admin@securityplatform.com",
    decision: "FIX_NOW",
    previous_status: "FAIL",
    new_status: "PENDING_APPROVAL",
    rationale_summary: "High risk root credential exposure requiring urgent hardware MFA token registration.",
    rationale: "High risk root credential exposure requiring urgent hardware MFA token registration.",
    severity: "critical",
    provider_type: "AWS",
    inserted_at: new Date().toISOString(),
  },
];

export const frameworks = [
  { id: "cis_3.0_aws", name: "CIS AWS Foundations Benchmark", version: "v3.0.0", pct: 91, score: 91.2, passed: 156, failed: 15, total: 171, status: "Compliant" },
  { id: "cis_2.0_aws", name: "CIS AWS Foundations Benchmark", version: "v2.0.0", pct: 89, score: 89.5, passed: 142, failed: 17, total: 159, status: "Compliant" },
  { id: "cis_3.0_azure", name: "CIS Microsoft Azure Benchmark", version: "v3.0.0", pct: 87, score: 87.4, passed: 134, failed: 20, total: 154, status: "Compliant" },
  { id: "cis_3.0_gcp", name: "CIS Google Cloud Platform Benchmark", version: "v3.0.0", pct: 88, score: 88.0, passed: 112, failed: 15, total: 127, status: "Compliant" },
  { id: "cis_1.8_k8s", name: "CIS Kubernetes Benchmark", version: "v1.8.0", pct: 84, score: 84.1, passed: 98, failed: 18, total: 116, status: "Compliant" },
  { id: "soc2_aws", name: "SOC 2 Type II (Trust Services Criteria)", version: "2023", pct: 94, score: 94.0, passed: 98, failed: 6, total: 104, status: "Compliant" },
  { id: "iso27001_2022_aws", name: "ISO/IEC 27001:2022 (ISMS)", version: "2022", pct: 90, score: 90.2, passed: 118, failed: 13, total: 131, status: "Compliant" },
  { id: "iso27001_2013_aws", name: "ISO/IEC 27001:2013", version: "2013", pct: 92, score: 92.5, passed: 114, failed: 9, total: 123, status: "Compliant" },
  { id: "pci_4.0_aws", name: "PCI-DSS (Payment Card Industry)", version: "v4.0.0", pct: 95, score: 95.0, passed: 145, failed: 7, total: 152, status: "Compliant" },
  { id: "pci_3.2.1_aws", name: "PCI-DSS", version: "v3.2.1", pct: 96, score: 96.2, passed: 138, failed: 5, total: 143, status: "Compliant" },
  { id: "nist_csf_2.0_aws", name: "NIST Cybersecurity Framework (CSF)", version: "2.0", pct: 88, score: 88.6, passed: 108, failed: 14, total: 122, status: "Compliant" },
  { id: "nist_csf_1.1_aws", name: "NIST Cybersecurity Framework (CSF)", version: "1.1", pct: 90, score: 90.0, passed: 95, failed: 11, total: 106, status: "Compliant" },
  { id: "nist_800_53_revision_5_aws", name: "NIST SP 800-53 Security Controls", version: "Rev. 5", pct: 82, score: 82.3, passed: 215, failed: 46, total: 261, status: "At Risk" },
  { id: "nist_800_171_revision_2_aws", name: "NIST SP 800-171 Protecting CUI", version: "Rev. 2", pct: 86, score: 86.4, passed: 110, failed: 17, total: 127, status: "Compliant" },
  { id: "hipaa_aws", name: "HIPAA Security Rule & HITECH", version: "2023", pct: 94, score: 94.5, passed: 72, failed: 4, total: 76, status: "Compliant" },
  { id: "aws_foundational_security_best_practices_aws", name: "AWS Foundational Security Best Practices (FSBP)", version: "v1.0", pct: 89, score: 89.1, passed: 220, failed: 27, total: 247, status: "Compliant" },
  { id: "aws_well_architected_framework_security_pillar_aws", name: "AWS Well-Architected Security Pillar", version: "2024", pct: 91, score: 91.8, passed: 165, failed: 15, total: 180, status: "Compliant" },
  { id: "mitre_attack_aws", name: "MITRE ATT&CK Cloud Matrix", version: "v14.1", pct: 85, score: 85.0, passed: 140, failed: 24, total: 164, status: "Compliant" },
  { id: "gdpr_aws", name: "EU General Data Protection Regulation (GDPR)", version: "2018", pct: 93, score: 93.4, passed: 58, failed: 4, total: 62, status: "Compliant" },
  { id: "fedramp_moderate_revision_4_aws", name: "FedRAMP Moderate Baseline", version: "Rev. 4", pct: 81, score: 81.0, passed: 180, failed: 42, total: 222, status: "At Risk" },
  { id: "fedramp_low_revision_4_aws", name: "FedRAMP Low Baseline", version: "Rev. 4", pct: 92, score: 92.0, passed: 85, failed: 7, total: 92, status: "Compliant" },
  { id: "dora_2022_2554", name: "Digital Operational Resilience Act (DORA)", version: "EU 2022/2554", pct: 89, score: 89.0, passed: 64, failed: 8, total: 72, status: "Compliant" },
  { id: "nis2_aws", name: "NIS2 Cybersecurity Directive", version: "EU 2022/2555", pct: 88, score: 88.2, passed: 76, failed: 10, total: 86, status: "Compliant" },
  { id: "csa_ccm_4.0", name: "Cloud Security Alliance CCM", version: "v4.0.0", pct: 91, score: 91.0, passed: 195, failed: 19, total: 214, status: "Compliant" },
  { id: "cisa_aws", name: "CISA Cloud Security Technical Reference Architecture", version: "v2.0", pct: 92, score: 92.4, passed: 88, failed: 7, total: 95, status: "Compliant" },
  { id: "ens_rd2022_aws", name: "Esquema Nacional de Seguridad (ENS)", version: "RD 311/2022", pct: 87, score: 87.5, passed: 120, failed: 17, total: 137, status: "Compliant" },
  { id: "ffiec_aws", name: "FFIEC Cybersecurity Assessment Tool", version: "2023", pct: 90, score: 90.5, passed: 78, failed: 8, total: 86, status: "Compliant" },
  { id: "rbi_cyber_security_framework_aws", name: "RBI Cyber Security Framework", version: "2023", pct: 93, score: 93.0, passed: 52, failed: 4, total: 56, status: "Compliant" },
];

export const providers = [
  { id: "p-01", uid: "987654321098", provider: "aws", alias: "Production AWS Environment", status: "CONNECTED", findings_count: 3 },
  { id: "p-02", uid: "azure-sub-sec-01", provider: "azure", alias: "Enterprise Azure Workloads", status: "CONNECTED", findings_count: 0 },
];

export const resources = [
  { id: "r-01", uid: "arn:aws:s3:::corp-confidential-finance-2026", name: "corp-confidential-finance-2026", service: "s3", type: "Bucket", region: "us-east-1" },
  { id: "r-02", uid: "arn:aws:iam::987654321098:root", name: "AWS Root User", service: "iam", type: "User", region: "global" },
];

export const users = [
  { id: "u-01", email: "admin@securityplatform.com", name: "Alex CISO", role: "Security Admin", company_name: "Eflight Global Defense", status: "ACTIVE" },
  { id: "u-02", email: "devsecops@securityplatform.com", name: "DevOps Engineer", role: "Auditor", company_name: "Eflight Global Defense", status: "ACTIVE" },
];

export const scans = [
  { id: "scan-01", name: "Scheduled Daily Cloud Audit", provider_alias: "Production AWS Environment", status: "COMPLETED", duration: "2m 14s", findings_discovered: 3, timestamp: new Date().toISOString() },
];

export const reportHistory = [
  { id: "RPT-001", title: "Executive CISO Security Assurance Report", generated_at: new Date().toISOString(), format: "HTML / PDF", score: 85 },
];





export const postureMetrics = {
  score: 85,
  critical_findings: 2,
  high_findings: 1,
  medium_findings: 0,
  low_findings: 0,
  pass_controls: 142,
  fail_controls: 3,
};
export const attackNodes = [
  { id: "internet", label: "Internet (Adversary)", x: 15, y: 50, kind: "entry" },
  { id: "runner", label: "CI Runner (Port 3389)", x: 45, y: 35, kind: "compute" },
  { id: "iam", label: "ci-deployer Role", x: 65, y: 65, kind: "identity" },
  { id: "s3", label: "prod-billing-exports", x: 85, y: 50, kind: "crown" },
];

export const attackEdges = [
  { from: "internet", to: "runner", critical: true },
  { from: "runner", to: "iam", critical: true },
  { from: "iam", to: "s3", critical: true },
];
