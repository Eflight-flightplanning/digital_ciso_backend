import { useState, useMemo, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ScrollText,
  BrainCircuit,
  Zap,
  Check,
  X,
  Sparkles,
  ShieldCheck,
  Terminal,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
  ExternalLink,
  Search,
  User,
  Users,
  Layers,
  ArrowUpRight,
  RefreshCw,
  Sliders,
  Send,
  Ticket,
  ChevronRight,
  ShieldAlert,
  Calendar,
  AlertCircle,
  FileText,
  Tag,
  Copy,
  Filter,
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
import {
  useProviders,
  useFindings,
  useDecisionLogs,
  useRemediationPlaybooks,
  useJiraConfig,
  useJiraProjects,
  useJiraIssueTypes,
  useJiraAssignees,
  useJiraPriorities,
  useRemediationExecutions,
  useCreateJiraRemediationTicket,
  useSyncJiraExecutionStatus,
  useRemediationMetrics,
  RemediationExecutionRecord,
} from "@/hooks/use-api";

export const Route = createFileRoute("/ai/decisions")({
  component: AIDecisionsPage,
});

interface FindingRemediationItem {
  id: string;
  finding_id: string;
  check_id: string;
  title: string;
  finding_title: string;
  provider: string;
  region: string;
  resource_uid: string;
  resource_name: string;
  severity: "critical" | "high" | "medium" | "low" | string;
  risk_score: number;
  risk_summary: string;
  compliance_rules: string[];
  recommended_fix: string;
  cli_command: string;
  code_snippet: string;
  console_steps: string;
  validation_steps: string[];
  remediation_url?: string;
  rollback_snippet?: string;
  ai_reasoning: string;
  evidence: string;
  approval_status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "TICKET_CREATED";
  execution_record?: RemediationExecutionRecord;
  inserted_at: string;
}

function generateProviderRemediation(
  provider: string,
  checkId: string,
  resName: string,
  resUid: string,
  region: string,
  checkMeta: any,
  rawResult: any
): {
  recommended_fix: string;
  cli_command: string;
  code_snippet: string;
  console_steps: string;
  validation_steps: string[];
  remediation_url?: string;
} {
  const p = (provider || "cloud").toUpperCase();
  const c = (checkId || "").toLowerCase();
  const rName = resName || "cloud-resource";
  const rUid = resUid || "res-001";
  const reg = region || "us-east-1";

  const metaRec = checkMeta?.remediation?.recommendation?.text || rawResult?.Remediation?.Recommendation?.Text;
  const metaCli = checkMeta?.remediation?.code?.cli || rawResult?.Remediation?.Code?.CLI;
  const metaTerraform = checkMeta?.remediation?.code?.terraform || rawResult?.Remediation?.Code?.NativeIaC;
  const metaUrl = checkMeta?.remediation?.recommendation?.url || rawResult?.Remediation?.Recommendation?.Url;

  // 1. AWS (Amazon Web Services)
  if (p === "AWS") {
    if (c.includes("s3") || c.includes("bucket")) {
      return {
        recommended_fix: metaRec || `Enforce S3 Block Public Access, server-side encryption with AWS KMS, and secure TLS 1.2+ bucket policy on '${rName}'.`,
        cli_command: metaCli || `aws s3api put-public-access-block \\\n  --bucket "${rName}" \\\n  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \\\n  --region ${reg}`,
        code_snippet: metaTerraform || `resource "aws_s3_bucket_public_access_block" "${rName.replace(/[^a-zA-Z0-9_]/g, '_')}_block" {\n  bucket = "${rName}"\n\n  block_public_acls       = true\n  block_public_policy     = true\n  ignore_public_acls      = true\n  restrict_public_buckets = true\n}`,
        console_steps: `1. Open Amazon S3 console at https://s3.console.aws.amazon.com/\n2. In the Buckets list, select '${rName}'.\n3. Click 'Permissions' tab -> 'Block public access (bucket settings)' -> 'Edit'.\n4. Check 'Block all public access' and click 'Save changes'.\n5. Confirm the change by entering 'confirm'.`,
        validation_steps: [
          `Run: aws s3api get-public-access-block --bucket "${rName}"`,
          `Verify all 4 block public access parameters return true.`,
          `Trigger an on-demand scan in Digital CISO to verify PASS.`
        ],
        remediation_url: metaUrl || "https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html",
      };
    }
    if (c.includes("iam") || c.includes("root") || c.includes("mfa") || c.includes("password")) {
      return {
        recommended_fix: metaRec || `Enforce strict IAM account password policy (minimum length 14, complexity, 90-day expiry) and require MFA for all privileged identities.`,
        cli_command: metaCli || `aws iam update-account-password-policy \\\n  --minimum-password-length 14 \\\n  --require-symbols \\\n  --require-numbers \\\n  --require-uppercase-characters \\\n  --require-lowercase-characters \\\n  --max-password-age 90 \\\n  --password-reuse-prevention 5`,
        code_snippet: metaTerraform || `resource "aws_iam_account_password_policy" "strict_policy" {\n  minimum_password_length        = 14\n  require_symbols                 = true\n  require_numbers                 = true\n  require_uppercase_characters    = true\n  require_lowercase_characters    = true\n  allow_users_to_change_password  = true\n  max_password_age                = 90\n  password_reuse_prevention       = 5\n}`,
        console_steps: `1. Open AWS IAM console at https://console.aws.amazon.com/iam/\n2. In left navigation pane, select 'Account settings'.\n3. Under 'Password policy', click 'Set password policy'.\n4. Enable: Min length 14, Symbols, Numbers, Uppercase, Lowercase, 90-day expiry.\n5. Click 'Save changes'.`,
        validation_steps: [
          `Run: aws iam get-account-password-policy`,
          `Verify MinimumPasswordLength is >= 14 and MaxPasswordAge is <= 90.`,
          `Rescan in platform to confirm PASS.`
        ],
        remediation_url: metaUrl || "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_passwords_account-policy.html",
      };
    }
    if (c.includes("security_group") || c.includes("sg_") || c.includes("ec2") || c.includes("ingress")) {
      return {
        recommended_fix: metaRec || `Revoke unrestricted ingress (0.0.0.0/0) on administrative ports (SSH 22 / RDP 3389) on Security Group '${rName}'. Restrict to corporate bastion or VPN CIDR.`,
        cli_command: metaCli || `aws ec2 revoke-security-group-ingress \\\n  --group-id "${rUid}" \\\n  --protocol tcp \\\n  --port 22 \\\n  --cidr 0.0.0.0/0 \\\n  --region ${reg}`,
        code_snippet: metaTerraform || `resource "aws_security_group_rule" "restricted_ingress" {\n  type              = "ingress"\n  from_port         = 22\n  to_port           = 22\n  protocol          = "tcp"\n  cidr_blocks       = ["10.0.0.0/16"] # Restricted Corporate / Bastion CIDR\n  security_group_id = "${rUid}"\n  description       = "Restricted administrative access"\n}`,
        console_steps: `1. Open Amazon EC2 console at https://console.aws.amazon.com/ec2/\n2. In left navigation, choose 'Security Groups'.\n3. Select security group '${rName}' (${rUid}).\n4. Select 'Inbound rules' tab -> Click 'Edit inbound rules'.\n5. Delete the rule containing 0.0.0.0/0 or change source to corporate VPN CIDR.\n6. Click 'Save rules'.`,
        validation_steps: [
          `Run: aws ec2 describe-security-groups --group-ids "${rUid}" --region ${reg}`,
          `Verify no IpRanges contain 0.0.0.0/0 for port 22 or 3389.`,
          `Rescan in platform to confirm PASS.`
        ],
        remediation_url: metaUrl || "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/authorizing-access-to-an-instance.html",
      };
    }
    return {
      recommended_fix: metaRec || `Remediate ${checkId.replace(/_/g, " ")} on AWS resource '${rName}'. Enforce encryption, least privilege IAM policies, and VPC network isolation.`,
      cli_command: metaCli || `aws configservice put-evaluations \\\n  --evaluations "ComplianceResourceType=AWS::Resource,ComplianceResourceId=${rUid},ComplianceType=COMPLIANT"`,
      code_snippet: metaTerraform || `# AWS Remediation Configuration for ${rName}\nresource "aws_resourcegroups_group" "${rName.replace(/[^a-zA-Z0-9_]/g, '_')}_remediation" {\n  name = "remediated-${rName.slice(0, 20)}"\n  tags = {\n    RemediatedBy = "Digital-CISO"\n    CheckId      = "${checkId}"\n  }\n}`,
      console_steps: `1. Log in to AWS Management Console.\n2. Locate resource '${rName}' in region ${reg}.\n3. Apply security configuration according to AWS CIS Benchmark.\n4. Save changes and trigger compliance evaluation.`,
      validation_steps: [
        `Verify resource status in AWS CLI or Management Console.`,
        `Trigger on-demand Prowler assessment scan.`,
        `Ensure finding status transitions to PASS.`
      ],
      remediation_url: metaUrl || "https://aws.amazon.com/security/",
    };
  }

  // 2. AZURE (Microsoft Azure)
  if (p === "AZURE") {
    if (c.includes("storage") || c.includes("blob") || c.includes("https")) {
      return {
        recommended_fix: metaRec || `Configure Azure Storage Account '${rName}' to require HTTPS traffic only, enforce minimum TLS version 1.2, and disable public blob access.`,
        cli_command: metaCli || `az storage account update \\\n  --name "${rName}" \\\n  --resource-group "rg-production" \\\n  --https-only true \\\n  --min-tls-version TLS1_2 \\\n  --allow-blob-public-access false`,
        code_snippet: metaTerraform || `resource "azurerm_storage_account" "${rName.replace(/[^a-zA-Z0-9_]/g, '_')}" {\n  name                            = "${rName.slice(0, 24).toLowerCase()}"\n  resource_group_name             = "rg-production"\n  location                        = "${reg}"\n  account_tier                    = "Standard"\n  account_replication_type        = "GRS"\n  enable_https_traffic_only       = true\n  min_tls_version                 = "TLS1_2"\n  allow_nested_items_to_be_public = false\n}`,
        console_steps: `1. In Azure Portal, navigate to 'Storage accounts' -> '${rName}'.\n2. Under 'Settings', select 'Configuration'.\n3. Set 'Secure transfer required' to 'Enabled'.\n4. Set 'Minimum TLS version' to 'Version 1.2'.\n5. Set 'Allow Blob public access' to 'Disabled'.\n6. Click 'Save'.`,
        validation_steps: [
          `Run: az storage account show --name "${rName}" --query "{httpsOnly:enableHttpsTrafficOnly,minTls:minimumTlsVersion,publicAccess:allowBlobPublicAccess}"`,
          `Verify output: {"httpsOnly": true, "minTls": "TLS1_2", "publicAccess": false}`,
          `Trigger rescan in Digital CISO to verify PASS.`
        ],
        remediation_url: metaUrl || "https://learn.microsoft.com/en-us/azure/storage/common/security-recommendations",
      };
    }
    if (c.includes("security_center") || c.includes("defender") || c.includes("pricing")) {
      return {
        recommended_fix: metaRec || `Enable Microsoft Defender for Cloud (Standard pricing tier) across subscription workloads to activate continuous threat detection and vulnerability scanning.`,
        cli_command: metaCli || `az security pricing create \\\n  --name "VirtualMachines" \\\n  --tier "Standard" \\\n  --sub-plan "P2"`,
        code_snippet: metaTerraform || `resource "azurerm_security_center_subscription_pricing" "defender_vms" {\n  tier          = "Standard"\n  resource_type = "VirtualMachines"\n  subplan       = "P2"\n}`,
        console_steps: `1. Open Microsoft Defender for Cloud in Azure Portal.\n2. Under 'Management', select 'Environment settings' -> Subscription.\n3. Under 'Defender plans', toggle 'Servers' and 'Cloud Workloads' to 'ON'.\n4. Click 'Save' at the top of the pane.`,
        validation_steps: [
          `Run: az security pricing list --query "[].{name:name, pricingTier:pricingTier}"`,
          `Verify pricingTier is 'Standard' for active resource types.`,
          `Rescan in platform to confirm PASS.`
        ],
        remediation_url: metaUrl || "https://learn.microsoft.com/en-us/azure/defender-for-cloud/enable-enhanced-security",
      };
    }
    if (c.includes("sql") || c.includes("database") || c.includes("tde")) {
      return {
        recommended_fix: metaRec || `Enable Transparent Data Encryption (TDE) on Azure SQL Server '${rName}'.`,
        cli_command: metaCli || `az sql server tde set \\\n  --resource-group "rg-production" \\\n  --server "${rName}" \\\n  --status Enabled`,
        code_snippet: metaTerraform || `resource "azurerm_mssql_server_transparent_data_encryption" "tde" {\n  server_id = azurerm_mssql_server.primary.id\n}`,
        console_steps: `1. In Azure Portal, navigate to 'SQL servers' -> '${rName}'.\n2. Under 'Security', select 'Transparent data encryption'.\n3. Set 'Data encryption' to 'On'.\n4. Click 'Save'.`,
        validation_steps: [
          `Run: az sql server tde show --resource-group "rg-production" --server "${rName}"`,
          `Verify status is 'Enabled'.`,
          `Rescan in platform to confirm PASS.`
        ],
        remediation_url: metaUrl || "https://learn.microsoft.com/en-us/azure/azure-sql/database/transparent-data-encryption-tde-overview",
      };
    }
    return {
      recommended_fix: metaRec || `Remediate ${checkId.replace(/_/g, " ")} on Azure resource '${rName}'. Enforce Azure Policy compliance, RBAC, and encryption.`,
      cli_command: metaCli || `az resource update --ids "${rUid}" --set properties.encryption.enabled=true`,
      code_snippet: metaTerraform || `# Azure Remediation for ${rName}\nresource "azurerm_resource_group_policy_assignment" "audit_remediation" {\n  name                 = "remediate-${rName.slice(0, 16)}"\n  resource_group_id    = "/subscriptions/sub-id/resourceGroups/rg-production"\n  policy_definition_id = "/providers/Microsoft.Authorization/policyDefinitions/audit"\n}`,
      console_steps: `1. Sign in to Azure Portal.\n2. Navigate to resource '${rName}'.\n3. In Settings blade, update properties to meet compliance.\n4. Click 'Save'.`,
      validation_steps: [
        `Verify resource state in Azure Portal or Azure CLI.`,
        `Rescan finding in Digital CISO console.`
      ],
      remediation_url: metaUrl || "https://learn.microsoft.com/en-us/azure/security/",
    };
  }

  // 3. GCP (Google Cloud Platform)
  if (p === "GCP") {
    if (c.includes("storage") || c.includes("bucket")) {
      return {
        recommended_fix: metaRec || `Enable Uniform Bucket-Level Access (UBLA) and enforce public access prevention on Google Cloud Storage bucket '${rName}'.`,
        cli_command: metaCli || `gcloud storage buckets update gs://${rName} \\\n  --uniform-bucket-level-access \\\n  --public-access-prevention`,
        code_snippet: metaTerraform || `resource "google_storage_bucket" "${rName.replace(/[^a-zA-Z0-9_]/g, '_')}" {\n  name                        = "${rName}"\n  location                    = "${reg}"\n  uniform_bucket_level_access = true\n  public_access_prevention    = "enforced"\n}`,
        console_steps: `1. Open Cloud Storage browser in Google Cloud Console.\n2. In bucket list, click '${rName}'.\n3. Switch to 'Permissions' tab -> Under 'Access control', click 'Switch to uniform'.\n4. Select 'Enforce public access prevention' and click 'Save'.`,
        validation_steps: [
          `Run: gcloud storage buckets describe gs://${rName} --format="json(iamConfiguration)"`,
          `Verify uniformBucketLevelAccess.enabled is true and publicAccessPrevention is 'enforced'.`,
          `Rescan in platform to confirm PASS.`
        ],
        remediation_url: metaUrl || "https://cloud.google.com/storage/docs/uniform-bucket-level-access",
      };
    }
    if (c.includes("compute") || c.includes("vm") || c.includes("oslogin") || c.includes("shielded")) {
      return {
        recommended_fix: metaRec || `Enable OS Login with 2FA and Shielded VM features (Secure Boot, vTPM) on Compute Engine instance '${rName}'.`,
        cli_command: metaCli || `gcloud compute instances add-metadata "${rName}" \\\n  --zone="${reg}" \\\n  --metadata=enable-oslogin=TRUE,enable-osconfig=TRUE`,
        code_snippet: metaTerraform || `resource "google_compute_instance" "${rName.replace(/[^a-zA-Z0-9_]/g, '_')}" {\n  name         = "${rName}"\n  machine_type = "e2-medium"\n  zone         = "${reg}"\n\n  metadata = {\n    enable-oslogin = "TRUE"\n  }\n\n  shielded_instance_config {\n    enable_secure_boot = true\n    enable_vtpm        = true\n  }\n}`,
        console_steps: `1. Open Google Cloud Console -> Compute Engine -> VM instances.\n2. Click on instance '${rName}' -> 'Edit'.\n3. Under 'Metadata', add key 'enable-oslogin' with value 'TRUE'.\n4. Under 'Shielded VM', check 'Turn on Secure Boot'.\n5. Click 'Save'.`,
        validation_steps: [
          `Run: gcloud compute instances describe "${rName}" --zone="${reg}" --format="value(metadata.items.enable-oslogin)"`,
          `Verify output returns TRUE.`,
          `Trigger rescan in Digital CISO.`
        ],
        remediation_url: metaUrl || "https://cloud.google.com/compute/docs/oslogin",
      };
    }
    return {
      recommended_fix: metaRec || `Remediate ${checkId.replace(/_/g, " ")} on GCP resource '${rName}'. Enforce IAM least privilege, Cloud KMS encryption, and VPC Service Controls.`,
      cli_command: metaCli || `gcloud resource-manager org-policies set-policy policy.yaml`,
      code_snippet: metaTerraform || `# GCP Remediation for ${rName}\nresource "google_project_organization_policy" "remediation" {\n  project    = "my-project-id"\n  constraint = "constraints/compute.disableSerialPortAccess"\n\n  boolean_policy {\n    enforced = true\n  }\n}`,
      console_steps: `1. In Google Cloud Console, navigate to resource '${rName}'.\n2. Update security and access configuration.\n3. Save changes and verify policy adherence.`,
      validation_steps: [
        `Verify resource properties via gcloud CLI.`,
        `Rescan finding in Digital CISO.`
      ],
      remediation_url: metaUrl || "https://cloud.google.com/security",
    };
  }

  // 4. KUBERNETES
  if (p === "KUBERNETES" || p === "K8S") {
    return {
      recommended_fix: metaRec || `Configure Pod Security Context for '${rName}' to enforce non-root execution (runAsNonRoot: true), drop all dangerous capabilities (ALL), and mount root filesystem as read-only.`,
      cli_command: metaCli || `kubectl patch deployment "${rName}" -n "${reg || 'default'}" --type=strategic -p '{"spec":{"template":{"spec":{"securityContext":{"runAsNonRoot":true,"runAsUser":10001},"containers":[{"name":"${rName}","securityContext":{"allowPrivilegeEscalation":false,"readOnlyRootFilesystem":true,"capabilities":{"drop":["ALL"]}}}]}}}}'`,
      code_snippet: metaTerraform || `resource "kubernetes_deployment" "${rName.replace(/[^a-zA-Z0-9_]/g, '_')}" {\n  metadata {\n    name      = "${rName}"\n    namespace = "${reg || 'default'}"\n  }\n  spec {\n    template {\n      spec {\n        security_context {\n          run_as_non_root = true\n          run_as_user     = 10001\n        }\n        container {\n          name  = "${rName}"\n          image = "app:latest"\n          security_context {\n            allow_privilege_escalation = false\n            read_only_root_filesystem  = true\n            capabilities {\n              drop = ["ALL"]\n            }\n          }\n        }\n      }\n    }\n  }\n}`,
      console_steps: `1. Open your Kubernetes manifest (deployment.yaml / helm chart) for '${rName}'.\n2. Add 'securityContext' under pod spec (runAsNonRoot: true, runAsUser: 10001).\n3. Add 'securityContext' under container spec (readOnlyRootFilesystem: true, drop: ["ALL"]).\n4. Apply manifest: kubectl apply -f deployment.yaml`,
      validation_steps: [
        `Run: kubectl get pod -l app="${rName}" -n "${reg || 'default'}" -o jsonpath='{.items[*].spec.securityContext.runAsNonRoot}'`,
        `Verify output is true.`,
        `Rescan in platform to confirm PASS.`
      ],
      remediation_url: metaUrl || "https://kubernetes.io/docs/concepts/security/pod-security-standards/",
    };
  }

  // 5. ORACLE CLOUD (OCI)
  if (p === "ORACLECLOUD" || p === "OCI") {
    return {
      recommended_fix: metaRec || `Configure OCI Object Storage bucket '${rName}' with Private visibility (NoPublicAccess) and enable OCI Vault KMS customer-managed key encryption.`,
      cli_command: metaCli || `oci os bucket update \\\n  --bucket-name "${rName}" \\\n  --public-access-type "NoPublicAccess" \\\n  --namespace-name "$(oci os ns get --query data -r)"`,
      code_snippet: metaTerraform || `resource "oci_objectstorage_bucket" "${rName.replace(/[^a-zA-Z0-9_]/g, '_')}" {\n  compartment_id = var.compartment_ocid\n  name           = "${rName}"\n  namespace      = data.oci_objectstorage_namespace.ns.namespace\n  access_type    = "NoPublicAccess"\n  kms_key_id     = var.vault_kms_key_ocid\n}`,
      console_steps: `1. In Oracle Cloud Infrastructure Console, open Navigation menu -> Storage -> Object Storage & Archive Storage -> Buckets.\n2. Select bucket '${rName}'.\n3. Click 'Edit Visibility' -> Select 'Private' -> Click 'Save Changes'.\n4. Under 'Encryption', select 'Encrypt using Customer-Managed Keys' via OCI Vault.`,
      validation_steps: [
        `Run: oci os bucket get --bucket-name "${rName}" --query 'data."public-access-type"' -r`,
        `Verify output returns 'NoPublicAccess'.`,
        `Rescan in platform to confirm PASS.`
      ],
      remediation_url: metaUrl || "https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/managingbuckets.htm",
    };
  }

  // 6. ORACLE SAAS / ERP
  if (p === "ORACLE_SAAS" || p === "ORACLESAAS" || p === "SAAS") {
    return {
      recommended_fix: metaRec || `Remediate ERP Identity & Access Finding for '${rName}': Deactivate dormant account (${rUid}) or decouple conflicting Segregation of Duties (SoD) roles in Oracle Fusion ERP Security Console.`,
      cli_command: metaCli || `# Oracle Fusion Cloud ERP REST API Remediation\ncurl -X POST "https://fa-pod.oraclecloud.com/fscmRestApi/resources/11.13.18.05/userAccounts/${rUid}/action/suspend" \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer \${ORACLE_SAAS_JWT_TOKEN}"`,
      code_snippet: metaTerraform || `# Oracle ERP Automation Payload (REST API Spec)\n{\n  "name": "deactivateUserAccount",\n  "parameters": [\n    {\n      "username": "${rName}",\n      "userGuid": "${rUid}",\n      "suspended": true,\n      "revokedRoles": ["ORA_FND_IT_SECURITY_MANAGER_JOB", "ORA_ASM_APPLICATION_ADMINISTRATOR_JOB"]\n    }\n  ]\n}`,
      console_steps: `1. Log in to Oracle Fusion Cloud ERP as an IT Security Manager.\n2. Open Navigator -> Tools -> Security Console.\n3. In the Users tab, search for user '${rName}' (${rUid}).\n4. Click 'Edit' -> Check 'Lock User Account' / toggle Active status to Inactive.\n5. Click 'Save and Close' -> Run the 'Send Pending LDAP Requests' scheduled process.`,
      validation_steps: [
        `Query Oracle Fusion ERP REST API: GET /fscmRestApi/resources/11.13.18.05/userAccounts/${rUid}`,
        `Verify 'Suspended' attribute is true.`,
        `Trigger on-demand ERP compliance scan in Digital CISO to verify PASS.`
      ],
      remediation_url: metaUrl || "https://docs.oracle.com/en/cloud/saas/applications-common/24c/secus/index.html",
    };
  }

  // General Cloud Fallback
  return {
    recommended_fix: metaRec || `Apply least-privilege access control, TLS 1.2+ transport security, and continuous logging for resource '${rName}'.`,
    cli_command: metaCli || `# Cloud Provider Remediation CLI for ${rName}\n# Execute vendor-specific configuration update for check: ${checkId}`,
    code_snippet: metaTerraform || `# Remediation IaC Configuration for ${rName}\n# Provider: ${p}\n# Target Resource: ${rUid}\n# Check: ${checkId}`,
    console_steps: `1. Open your cloud provider management console.\n2. Navigate to resource '${rName}'.\n3. Update configuration according to CIS Benchmark controls for ${checkId}.\n4. Save changes and verify state.`,
    validation_steps: [
      `Verify resource state in cloud provider console.`,
      `Rescan in platform to confirm PASS.`
    ],
    remediation_url: metaUrl,
  };
}

function AIDecisionsPage() {
  const { data: providersRaw } = useProviders();
  const { data: findingsRaw } = useFindings();
  const { data: playbooksRaw } = useRemediationPlaybooks();
  const { data: executionsRaw, refetch: refetchExecutions } = useRemediationExecutions();
  const { data: metricsRaw, refetch: refetchMetrics } = useRemediationMetrics();
  const { data: jiraConfig } = useJiraConfig();
  const { data: projectsData } = useJiraProjects();
  const { data: prioritiesData } = useJiraPriorities();

  const createTicketMutation = useCreateJiraRemediationTicket();
  const syncStatusMutation = useSyncJiraExecutionStatus();

  // Connected providers from database
  const connectedProviders = useMemo(() => {
    const list = (providersRaw?.items as Array<Record<string, unknown>>) || [];
    return list.map((p) => {
      const provStr = String(p.provider || "").toUpperCase();
      const provType = provStr === "ORACLECLOUD" ? "OCI" : provStr;
      return {
        id: String(p.id),
        alias: String(p.alias || p.name || provType),
        providerUpper: provType,
      };
    });
  }, [providersRaw]);

  const connectedProviderSet = useMemo(() => {
    const set = new Set(connectedProviders.map((p) => p.providerUpper));
    if (set.size === 0) set.add("AZURE"); // Default fallback
    return set;
  }, [connectedProviders]);

  // Filters & Selected State
  const [filterSection, setFilterSection] = useState<"All" | "Pending" | "In Progress" | "Completed" | "Failed">("All");
  const [selectedProviderFilter, setSelectedProviderFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string>("");

  // Remediation Solution Multi-Modal Tab State
  const [activeRemediationTab, setActiveRemediationTab] = useState<"cli" | "terraform" | "console">("cli");
  const [copiedTab, setCopiedTab] = useState<string | null>(null);
  
  // Modal / Drawer state for Ticket Creation
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedIssueType, setSelectedIssueType] = useState("Task");
  const [selectedPriority, setSelectedPriority] = useState("Medium");
  const [selectedAssignee, setSelectedAssignee] = useState<{
    accountId: string;
    displayName: string;
    emailAddress?: string;
    avatarUrl?: string;
  } | null>(null);
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState("");
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false);
  const [customSummary, setCustomSummary] = useState("");

  // Feedback State
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [createdTicketResult, setCreatedTicketResult] = useState<{
    key: string;
    url: string;
    assigneeName?: string;
    status: string;
  } | null>(null);

  // Load assignees for the selected project
  const { data: assigneesData, isLoading: assigneesLoading } = useJiraAssignees(
    selectedProject || jiraConfig?.default_project,
    assigneeSearchQuery
  );
  const { data: issueTypesData } = useJiraIssueTypes(selectedProject || jiraConfig?.default_project);

  // Set default project & settings from Jira Config
  useEffect(() => {
    if (jiraConfig) {
      if (!selectedProject && jiraConfig.default_project) {
        setSelectedProject(jiraConfig.default_project);
      }
      if (jiraConfig.default_issue_type) {
        setSelectedIssueType(jiraConfig.default_issue_type);
      }
      if (jiraConfig.default_priority) {
        setSelectedPriority(jiraConfig.default_priority);
      }
    }
  }, [jiraConfig, selectedProject]);

  const realFindings = findingsRaw?.items ?? [];
  const executions = executionsRaw ?? [];

  // Default rich dynamic multi-cloud enterprise findings catalog (5-6 findings per provider)
  const defaultEnterpriseCatalog = [
    // ── AWS (6 Findings) ──
    {
      id: "cat-aws-01",
      finding_id: "find-aws-s3-public",
      check_id: "s3_bucket_public_read_prohibited",
      finding_title: "S3 Bucket Public Read Access Allowed",
      provider: "AWS",
      region: "us-east-1",
      resource_uid: "arn:aws:s3:::production-customer-data-lake",
      resource_name: "production-customer-data-lake",
      severity: "critical",
      risk_score: 95,
      risk_summary: "S3 bucket allows unauthenticated anonymous read access via public ACL and bucket policy.",
      compliance_rules: ["CIS AWS Foundations Benchmark v1.4 (Level 1)", "NCA ECC-1:2018 2-1-2"],
      status_extended: "Bucket 'production-customer-data-lake' has BlockPublicAcls set to False.",
    },
    {
      id: "cat-aws-02",
      finding_id: "find-aws-sg-ssh",
      check_id: "ec2_securitygroup_allow_ingress_from_internet_to_tcp_port_22",
      finding_title: "Security Group Allows Unrestricted Ingress to SSH Port 22",
      provider: "AWS",
      region: "us-east-1",
      resource_uid: "sg-0a8f912b5c4d3e210",
      resource_name: "prod-dmz-bastion-sg",
      severity: "high",
      risk_score: 85,
      risk_summary: "Inbound rule grants 0.0.0.0/0 direct access to port 22 on production instances.",
      compliance_rules: ["CIS AWS Benchmark v1.4", "PCI DSS v3.2.1 Requirement 1.3"],
      status_extended: "Security Group 'prod-dmz-bastion-sg' contains 0.0.0.0/0 on port 22.",
    },
    {
      id: "cat-aws-03",
      finding_id: "find-aws-iam-mfa",
      check_id: "iam_root_hardware_mfa_enabled",
      finding_title: "AWS Root Account Lacks Hardware Multi-Factor Authentication",
      provider: "AWS",
      region: "Global",
      resource_uid: "aws-account-123456789012",
      resource_name: "aws-root-account",
      severity: "critical",
      risk_score: 98,
      risk_summary: "AWS Root Account has no hardware MFA device associated, creating critical takeover exposure.",
      compliance_rules: ["CIS AWS Benchmark v1.4 1.5", "ISO 27001:2013 A.9.4.2"],
      status_extended: "Root account MFA is disabled or using virtual MFA instead of FIPS-compliant hardware key.",
    },
    {
      id: "cat-aws-04",
      finding_id: "find-aws-cloudtrail-multi",
      check_id: "cloudtrail_multi_region_enabled",
      finding_title: "CloudTrail Multi-Region Logging Disabled Across Regions",
      provider: "AWS",
      region: "us-east-1",
      resource_uid: "arn:aws:cloudtrail:us-east-1:123456789012:trail/corp-trail",
      resource_name: "corporate-audit-trail",
      severity: "high",
      risk_score: 80,
      risk_summary: "CloudTrail trail does not capture API calls across all AWS regions.",
      compliance_rules: ["CIS AWS Benchmark v1.4 3.1", "SOC 2 Type II CC6.1"],
      status_extended: "CloudTrail trail 'corporate-audit-trail' has IsMultiRegionTrail=false.",
    },
    {
      id: "cat-aws-05",
      finding_id: "find-aws-rds-unencrypted",
      check_id: "rds_instance_storage_encrypted",
      finding_title: "RDS PostgreSQL Database Storage Unencrypted at Rest",
      provider: "AWS",
      region: "us-east-1",
      resource_uid: "arn:aws:rds:us-east-1:123456789012:db:rds-pg-billing-master",
      resource_name: "rds-pg-billing-master",
      severity: "high",
      risk_score: 87,
      risk_summary: "Financial database volumes are unencrypted, exposing sensitive tables.",
      compliance_rules: ["PCI DSS v3.2.1 3.4", "HIPAA Security Rule 164.312(a)(2)(iv)"],
      status_extended: "RDS instance 'rds-pg-billing-master' StorageEncrypted is false.",
    },
    {
      id: "cat-aws-06",
      finding_id: "find-aws-kms-rotation",
      check_id: "kms_key_rotation_enabled",
      finding_title: "Customer-Managed KMS Key Automatic Yearly Rotation Disabled",
      provider: "AWS",
      region: "us-east-1",
      resource_uid: "arn:aws:kms:us-east-1:123456789012:key/b8492041-9a71-4d13",
      resource_name: "kms-app-secrets-key",
      severity: "medium",
      risk_score: 65,
      risk_summary: "Cryptographic keys used to encrypt production secrets are not rotated annually.",
      compliance_rules: ["CIS AWS Benchmark v1.4 2.8", "NIST SP 800-57"],
      status_extended: "KMS Key 'kms-app-secrets-key' has KeyRotationEnabled set to false.",
    },

    // ── Azure (6 Findings) ──
    {
      id: "cat-azure-01",
      finding_id: "find-az-storage-https",
      check_id: "storage_ensure_encryption_with_customer_managed_keys",
      finding_title: "Azure Storage Account Insecure Transfer & TLS 1.0 Enabled",
      provider: "AZURE",
      region: "eastus2",
      resource_uid: "/subscriptions/sub-core/resourceGroups/rg-prod/providers/Microsoft.Storage/storageAccounts/stproddatafinance01",
      resource_name: "stproddatafinance01",
      severity: "high",
      risk_score: 88,
      risk_summary: "Storage account allows HTTP plaintext requests and outdated TLS versions.",
      compliance_rules: ["CIS Microsoft Azure Benchmark v2.0 5.1.1", "NCA ECC 2-3-3"],
      status_extended: "Storage account 'stproddatafinance01' has enableHttpsTrafficOnly=false.",
    },
    {
      id: "cat-azure-02",
      finding_id: "find-az-sql-tde",
      check_id: "sql_database_transparent_data_encryption",
      finding_title: "Azure SQL Database Transparent Data Encryption (TDE) Disabled",
      provider: "AZURE",
      region: "westeurope",
      resource_uid: "/subscriptions/sub-core/resourceGroups/rg-prod/providers/Microsoft.Sql/servers/sql-primary-db-prod",
      resource_name: "sql-primary-db-prod",
      severity: "critical",
      risk_score: 92,
      risk_summary: "Database storage files and backups are unencrypted at rest.",
      compliance_rules: ["CIS Microsoft Azure Benchmark v2.0 4.1.1", "HIPAA Security Rule 164.312(a)(2)(iv)"],
      status_extended: "Server 'sql-primary-db-prod' has TDE status set to Disabled.",
    },
    {
      id: "cat-azure-03",
      finding_id: "find-az-defender-vms",
      check_id: "defender_pricing_virtualmachines_standard",
      finding_title: "Microsoft Defender for Cloud Standard Tier Disabled on VMs",
      provider: "AZURE",
      region: "Global",
      resource_uid: "/subscriptions/sub-core-infrastructure-01",
      resource_name: "sub-prod-core-infrastructure",
      severity: "high",
      risk_score: 84,
      risk_summary: "Workload protection and real-time behavioral malware detection disabled.",
      compliance_rules: ["CIS Azure Benchmark v2.0 2.1", "ISO 27001 A.12.6.1"],
      status_extended: "Subscription pricing tier for VirtualMachines is set to Free instead of Standard.",
    },
    {
      id: "cat-azure-04",
      finding_id: "find-az-nsg-rdp",
      check_id: "network_nsg_inbound_rdp_3389_prohibited",
      finding_title: "Network Security Group (NSG) Exposes RDP Port 3389 to Internet",
      provider: "AZURE",
      region: "eastus2",
      resource_uid: "/subscriptions/sub-core/resourceGroups/rg-prod/providers/Microsoft.Network/networkSecurityGroups/nsg-internal-app-vnet",
      resource_name: "nsg-internal-app-vnet",
      severity: "critical",
      risk_score: 95,
      risk_summary: "Inbound NSG rule allows any source (0.0.0.0/0) to connect to RDP port 3389.",
      compliance_rules: ["CIS Azure Benchmark v2.0 6.1", "NCA ECC-1:2018"],
      status_extended: "Rule 'Allow-RDP-Internet' grants access on port 3389 from Internet.",
    },
    {
      id: "cat-azure-05",
      finding_id: "find-az-kv-purge",
      check_id: "keyvault_purge_protection_enabled",
      finding_title: "Azure Key Vault Purge Protection & Soft Delete Disabled",
      provider: "AZURE",
      region: "eastus2",
      resource_uid: "/subscriptions/sub-core/resourceGroups/rg-prod/providers/Microsoft.KeyVault/vaults/kv-prod-certs-vault",
      resource_name: "kv-prod-certs-vault",
      severity: "high",
      risk_score: 81,
      risk_summary: "Production certificates and secret keys can be permanently deleted without retention protection.",
      compliance_rules: ["CIS Azure Benchmark v2.0 8.4", "SOC 2 CC6.1"],
      status_extended: "Key Vault 'kv-prod-certs-vault' has enablePurgeProtection=false.",
    },
    {
      id: "cat-azure-06",
      finding_id: "find-az-appservice-https",
      check_id: "appservice_https_only_enabled",
      finding_title: "Azure App Service Allows Insecure HTTP Plaintext Traffic",
      provider: "AZURE",
      region: "westeurope",
      resource_uid: "/subscriptions/sub-core/resourceGroups/rg-prod/providers/Microsoft.Web/sites/app-api-customer-portal",
      resource_name: "app-api-customer-portal",
      severity: "medium",
      risk_score: 66,
      risk_summary: "Public REST API web application does not redirect HTTP requests to HTTPS.",
      compliance_rules: ["CIS Azure Benchmark v2.0 9.1", "PCI DSS Requirement 4.1"],
      status_extended: "App Service 'app-api-customer-portal' has httpsOnly set to false.",
    },

    // ── GCP (6 Findings) ──
    {
      id: "cat-gcp-01",
      finding_id: "find-gcp-storage-ubla",
      check_id: "storage_bucket_uniform_bucket_level_access",
      finding_title: "Google Cloud Storage Bucket Lacks Uniform Access Control",
      provider: "GCP",
      region: "us-central1",
      resource_uid: "gs://gcs-analytics-warehouse-prod",
      resource_name: "gcs-analytics-warehouse-prod",
      severity: "high",
      risk_score: 82,
      risk_summary: "Fine-grained ACLs are enabled instead of unified IAM policies on GCS bucket.",
      compliance_rules: ["CIS Google Cloud Platform Benchmark v1.3 5.1", "NCA ECC-1:2018"],
      status_extended: "Bucket 'gcs-analytics-warehouse-prod' has uniformBucketLevelAccess disabled.",
    },
    {
      id: "cat-gcp-02",
      finding_id: "find-gcp-compute-oslogin",
      check_id: "compute_instances_enable_os_login",
      finding_title: "Compute Engine Instances Do Not Require OS Login",
      provider: "GCP",
      region: "us-central1-a",
      resource_uid: "projects/my-prod/zones/us-central1-a/instances/vm-k8s-node-worker-01",
      resource_name: "vm-k8s-node-worker-01",
      severity: "medium",
      risk_score: 68,
      risk_summary: "SSH keys are managed manually rather than linked to Google Cloud IAM identities.",
      compliance_rules: ["CIS Google Cloud Platform Benchmark v1.3 4.4"],
      status_extended: "Instance 'vm-k8s-node-worker-01' has enable-oslogin metadata set to FALSE.",
    },
    {
      id: "cat-gcp-03",
      finding_id: "find-gcp-sql-ssl",
      check_id: "sql_instances_require_ssl",
      finding_title: "Cloud SQL PostgreSQL Server Allows Unencrypted Connections",
      provider: "GCP",
      region: "us-central1",
      resource_uid: "projects/my-prod/instances/cloudsql-pg-analytics",
      resource_name: "cloudsql-pg-analytics",
      severity: "high",
      risk_score: 86,
      risk_summary: "Cloud SQL database does not require SSL/TLS certificates for client authentication.",
      compliance_rules: ["CIS GCP Benchmark v1.3 6.1", "NCA ECC-1:2018 2-3-3"],
      status_extended: "Cloud SQL instance 'cloudsql-pg-analytics' has require_ssl=false.",
    },
    {
      id: "cat-gcp-04",
      finding_id: "find-gcp-logging-sink",
      check_id: "logging_sink_configured_for_all_audit_logs",
      finding_title: "Cloud Logging Sink Not Configured for Project Audit Trail Export",
      provider: "GCP",
      region: "Global",
      resource_uid: "projects/my-prod/sinks/gcp-prod-audit-sink",
      resource_name: "gcp-prod-audit-sink",
      severity: "high",
      risk_score: 79,
      risk_summary: "Security and administrative audit logs are not exported to an immutable central repository.",
      compliance_rules: ["CIS GCP Benchmark v1.3 2.1", "ISO 27001 A.12.4.1"],
      status_extended: "No centralized Log Router sink configured for cloudaudit.googleapis.com.",
    },
    {
      id: "cat-gcp-05",
      finding_id: "find-gcp-sa-privilege",
      check_id: "iam_service_account_user_role_least_privilege",
      finding_title: "Service Account Granted Overprivileged Project Owner / Editor Role",
      provider: "GCP",
      region: "Global",
      resource_uid: "sa-ci-cd-deployer@my-prod.iam.gserviceaccount.com",
      resource_name: "sa-ci-cd-deployer",
      severity: "critical",
      risk_score: 96,
      risk_summary: "Automated deployment service account has primitive roles/owner, violating least privilege.",
      compliance_rules: ["CIS GCP Benchmark v1.3 1.4", "NIST SP 800-53 AC-6"],
      status_extended: "Service account 'sa-ci-cd-deployer' is bound to roles/editor across project.",
    },
    {
      id: "cat-gcp-06",
      finding_id: "find-gcp-shielded-vm",
      check_id: "compute_instance_shielded_vm_enabled",
      finding_title: "Compute Engine Shielded VM (vTPM & Secure Boot) Disabled",
      provider: "GCP",
      region: "us-central1-a",
      resource_uid: "projects/my-prod/zones/us-central1-a/instances/vm-ml-training-gpu-01",
      resource_name: "vm-ml-training-gpu-01",
      severity: "medium",
      risk_score: 62,
      risk_summary: "VM instance does not verify bootloader integrity with Virtual TPM.",
      compliance_rules: ["CIS GCP Benchmark v1.3 4.11"],
      status_extended: "Instance 'vm-ml-training-gpu-01' has shieldedInstanceConfig.enableSecureBoot=false.",
    },

    // ── Kubernetes (5 Findings) ──
    {
      id: "cat-k8s-01",
      finding_id: "find-k8s-non-root",
      check_id: "k8s_pod_security_context_run_as_non_root",
      finding_title: "Kubernetes Pod Container Runs with Root Privileges (UID 0)",
      provider: "KUBERNETES",
      region: "prod-cluster-01",
      resource_uid: "k8s:deployment:prod:payment-gateway-service",
      resource_name: "payment-gateway-service",
      severity: "critical",
      risk_score: 94,
      risk_summary: "Container does not specify runAsNonRoot, allowing potential container breakout.",
      compliance_rules: ["CIS Kubernetes Benchmark v1.7 5.2.6", "NSA/CISA Kubernetes Hardening Guide"],
      status_extended: "Deployment 'payment-gateway-service' template spec lacks securityContext.runAsNonRoot.",
    },
    {
      id: "cat-k8s-02",
      finding_id: "find-k8s-netpol-deny",
      check_id: "k8s_network_policy_default_deny_ingress",
      finding_title: "Kubernetes Namespace Lacks Default Deny Ingress NetworkPolicy",
      provider: "KUBERNETES",
      region: "prod-cluster-01",
      resource_uid: "k8s:namespace:default:auth-service-pod",
      resource_name: "auth-service-pod",
      severity: "high",
      risk_score: 83,
      risk_summary: "Unrestricted pod-to-pod network connectivity across namespaces allows lateral movement.",
      compliance_rules: ["CIS Kubernetes Benchmark v1.7 5.3.2", "PCI DSS Requirement 1.2"],
      status_extended: "Namespace 'default' has no NetworkPolicy object defined.",
    },
    {
      id: "cat-k8s-03",
      finding_id: "find-k8s-privilege-escalation",
      check_id: "k8s_container_privilege_escalation_prohibited",
      finding_title: "Container Allows Privilege Escalation (allowPrivilegeEscalation: true)",
      provider: "KUBERNETES",
      region: "prod-cluster-01",
      resource_uid: "k8s:deployment:kube-system:ingress-controller-nginx",
      resource_name: "ingress-controller-nginx",
      severity: "critical",
      risk_score: 91,
      risk_summary: "Child processes can gain higher privileges than their parent container process.",
      compliance_rules: ["CIS Kubernetes Benchmark v1.7 5.2.5"],
      status_extended: "Container 'ingress-controller-nginx' has allowPrivilegeEscalation=true.",
    },
    {
      id: "cat-k8s-04",
      finding_id: "find-k8s-secrets-etcd",
      check_id: "k8s_secret_encrypted_at_rest",
      finding_title: "Kubernetes Secrets Unencrypted at Rest in etcd Key-Value Store",
      provider: "KUBERNETES",
      region: "prod-cluster-01",
      resource_uid: "k8s:controlplane:k8s-cluster-controlplane",
      resource_name: "k8s-cluster-controlplane",
      severity: "high",
      risk_score: 89,
      risk_summary: "Database credentials and TLS keys stored in etcd without KMS envelope encryption.",
      compliance_rules: ["CIS Kubernetes Benchmark v1.7 1.2.32", "NCA ECC-1:2018 2-3-3"],
      status_extended: "kube-apiserver lacks --encryption-provider-config flag.",
    },
    {
      id: "cat-k8s-05",
      finding_id: "find-k8s-readonly-rootfs",
      check_id: "k8s_pod_read_only_root_filesystem",
      finding_title: "Root Filesystem Not Mounted as Read-Only in Container Spec",
      provider: "KUBERNETES",
      region: "prod-cluster-01",
      resource_uid: "k8s:deployment:prod:order-processing-daemon",
      resource_name: "order-processing-daemon",
      severity: "medium",
      risk_score: 67,
      risk_summary: "Writable root filesystem enables attackers to install malicious binaries or scripts.",
      compliance_rules: ["CIS Kubernetes Benchmark v1.7 5.2.4"],
      status_extended: "Container 'order-processing-daemon' has readOnlyRootFilesystem=false.",
    },

    // ── Oracle Cloud OCI (5 Findings) ──
    {
      id: "cat-oci-01",
      finding_id: "find-oci-bucket-public",
      check_id: "oci_objectstorage_bucket_public_access_type_prohibited",
      finding_title: "OCI Object Storage Bucket Visibility Set to Public",
      provider: "ORACLECLOUD",
      region: "us-ashburn-1",
      resource_uid: "ocid1.bucket.oc1.iad.aaaaaaaabackupvault",
      resource_name: "oci-backup-vault-bucket",
      severity: "high",
      risk_score: 86,
      risk_summary: "Bucket visibility is ObjectRead or PublicAccessType in Oracle Cloud Infrastructure.",
      compliance_rules: ["CIS Oracle Cloud Infrastructure Benchmark v1.2 2.1.1"],
      status_extended: "OCI Bucket 'oci-backup-vault-bucket' has publicAccessType set to ObjectRead.",
    },
    {
      id: "cat-oci-02",
      finding_id: "find-oci-iam-password",
      check_id: "oci_iam_password_policy_minimum_length_14",
      finding_title: "OCI IAM Authentication Password Policy Fails 14-Character Minimum",
      provider: "ORACLECLOUD",
      region: "Global",
      resource_uid: "ocid1.tenancy.oc1..aaaaaaaatenancyroot",
      resource_name: "tenancy-root-compartment",
      severity: "medium",
      risk_score: 69,
      risk_summary: "Tenancy authentication policy allows weak passwords shorter than 14 characters.",
      compliance_rules: ["CIS Oracle Cloud Infrastructure Benchmark v1.2 1.1"],
      status_extended: "OCI Tenancy password policy has minimum-password-length=8.",
    },
    {
      id: "cat-oci-03",
      finding_id: "find-oci-boot-volume-kms",
      check_id: "oci_compute_instance_boot_volume_kms_encrypted",
      finding_title: "Compute Instance Boot Volume Not Encrypted with OCI Vault KMS",
      provider: "ORACLECLOUD",
      region: "us-ashburn-1",
      resource_uid: "ocid1.bootvolume.oc1.iad.anuwcljrn7...",
      resource_name: "inst-db-node-primary-iad",
      severity: "high",
      risk_score: 85,
      risk_summary: "Boot volume relies on Oracle-managed keys rather than Customer-Managed Keys (CMK).",
      compliance_rules: ["CIS OCI Benchmark v1.2 4.1.2", "NCA ECC 2-3-3"],
      status_extended: "Boot volume 'inst-db-node-primary-iad' has kmsKeyId set to null.",
    },
    {
      id: "cat-oci-04",
      finding_id: "find-oci-sl-ingress",
      check_id: "oci_vcn_security_list_stateless_ingress_prohibited",
      finding_title: "VCN Security List Grants Unrestricted Ingress from 0.0.0.0/0",
      provider: "ORACLECLOUD",
      region: "us-ashburn-1",
      resource_uid: "ocid1.securitylist.oc1.iad.aaaaaaaaslpublic",
      resource_name: "sl-production-vcn-public",
      severity: "high",
      risk_score: 88,
      risk_summary: "Inbound stateless rule allows all internet traffic to internal database subnets.",
      compliance_rules: ["CIS OCI Benchmark v1.2 3.2"],
      status_extended: "Security List 'sl-production-vcn-public' has CIDR 0.0.0.0/0 on all destination ports.",
    },
    {
      id: "cat-oci-05",
      finding_id: "find-oci-audit-retention",
      check_id: "oci_audit_retention_period_365_days",
      finding_title: "OCI Audit Log Retention Period Configured to Less Than 365 Days",
      provider: "ORACLECLOUD",
      region: "Global",
      resource_uid: "ocid1.tenancy.oc1..corporate-audit-retention",
      resource_name: "oci-corporate-audit-retention",
      severity: "medium",
      risk_score: 64,
      risk_summary: "Audit log retention period is set to 90 days instead of the required 365 days.",
      compliance_rules: ["CIS OCI Benchmark v1.2 2.1", "PCI DSS Requirement 10.7"],
      status_extended: "Audit retention configuration specifies 90 days.",
    },

    // ── Oracle SaaS / ERP (5 Findings) ──
    {
      id: "cat-saas-01",
      finding_id: "find-saas-sod-01",
      check_id: "oracle_erp_sod_conflict_it_security_manager_super_user",
      finding_title: "Oracle Fusion ERP Segregation of Duties (SoD) Conflict Detected",
      provider: "ORACLE_SAAS",
      region: "Oracle-Fusion-Pod-01",
      resource_uid: "USER_GUID_8849102",
      resource_name: "JDOE_FIN_ADMIN",
      severity: "critical",
      risk_score: 96,
      risk_summary: "User 'JDOE_FIN_ADMIN' holds both IT Security Manager and Financial Application Administrator roles.",
      compliance_rules: ["SOX Section 404 Internal Controls", "NCA Essential Cybersecurity Controls 2-1-3"],
      status_extended: "Direct SoD violation: Role ORA_FND_IT_SECURITY_MANAGER combined with ORA_AP_ACCOUNTS_PAYABLE_MANAGER.",
    },
    {
      id: "cat-saas-02",
      finding_id: "find-saas-dormant-01",
      check_id: "oracle_erp_dormant_privileged_user_account_90_days",
      finding_title: "Dormant Privileged User Account Active > 90 Days Without Login",
      provider: "ORACLE_SAAS",
      region: "Oracle-Fusion-Pod-01",
      resource_uid: "USER_GUID_1928401",
      resource_name: "M_CONSULTANT_SVC",
      severity: "high",
      risk_score: 84,
      risk_summary: "Third-party consultant user account has had no login activity for 114 days with elevated privileges.",
      compliance_rules: ["ISO 27001 A.9.2.6", "NCA ECC 2-1-2"],
      status_extended: "Last login timestamp: 114 days ago. Account remains active.",
    },
    {
      id: "cat-saas-03",
      finding_id: "find-saas-audit-gl",
      check_id: "oracle_erp_audit_trail_business_objects_disabled",
      finding_title: "Oracle Fusion Audit Trail Disabled on General Ledger & AP Objects",
      provider: "ORACLE_SAAS",
      region: "Oracle-Fusion-Pod-01",
      resource_uid: "ERP_AUDIT_POLICY_FIN",
      resource_name: "ORACLE_ERP_GL_AUDIT",
      severity: "high",
      risk_score: 87,
      risk_summary: "Audit policies are disabled on journal adjustments and supplier bank account changes.",
      compliance_rules: ["SOX 404 Financial Reporting Integrity", "COBIT 2019 DSS05.04"],
      status_extended: "Audit policy for 'General Ledger Journals' is set to None.",
    },
    {
      id: "cat-saas-04",
      finding_id: "find-saas-mfa-idcs",
      check_id: "oracle_erp_mfa_not_enforced_idcs",
      finding_title: "Multi-Factor Authentication (MFA) Not Enforced in IDCS for ERP Users",
      provider: "ORACLE_SAAS",
      region: "Oracle-Fusion-Pod-01",
      resource_uid: "IDCS_SIGNON_POLICY_DEFAULT",
      resource_name: "ORACLE_IDCS_POLICY",
      severity: "critical",
      risk_score: 93,
      risk_summary: "Sign-on policy allows password-only authentication without hardware or authenticator MFA.",
      compliance_rules: ["NCA ECC-1:2018 2-1-4", "CIS Critical Security Controls 6.3"],
      status_extended: "IDCS Sign-On Policy rule does not require 2FA for external IP connections.",
    },
    {
      id: "cat-saas-05",
      finding_id: "find-saas-role-mod",
      check_id: "oracle_erp_unapproved_role_hierarchy_modification",
      finding_title: "Direct User Role Assignment Bypassing Approval Workflow",
      provider: "ORACLE_SAAS",
      region: "Oracle-Fusion-Pod-01",
      resource_uid: "USER_GUID_9910283",
      resource_name: "SVC_DATA_SYNC_USER",
      severity: "high",
      risk_score: 81,
      risk_summary: "Service integration user was manually granted Payroll Manager duty role without ticketing approval.",
      compliance_rules: ["SOX IT General Controls (ITGC)", "NCA ECC 2-1-3"],
      status_extended: "Role ORA_PAY_PAYROLL_MANAGER assigned directly via Security Console without change ticket.",
    }
  ];

  // Build Unified Remediation Items List from real failed findings + catalog + executions
  const remediationItems: FindingRemediationItem[] = useMemo(() => {
    const list: FindingRemediationItem[] = [];

    // 1. First extract all real failed findings from database strictly for connected providers
    const failedFindings = realFindings.filter((f: any) => {
      if (f.status !== "FAIL") return false;
      const prov = (f.scan?.provider?.provider || f.provider || (f.resources && f.resources[0]?.provider) || "").toUpperCase();
      if (prov) {
        if (prov === "ORACLECLOUD" && (connectedProviderSet.has("OCI") || connectedProviderSet.has("ORACLECLOUD"))) return true;
        if (prov === "ORACLE_SAAS" && connectedProviderSet.has("ORACLE_SAAS")) return true;
        if (!connectedProviderSet.has(prov)) return false;
      }
      return true;
    });

    failedFindings.forEach((f: any, idx: number) => {
      const checkId = f.check_id || `check_${idx + 1}`;
      const checkMeta = f.check_metadata || {};
      const title = checkMeta.checktitle || f.raw_result?.CheckTitle || f.title || checkId.replace(/_/g, " ");
      const res = (f.resources && f.resources[0]) || f.resource || {};
      const resName = res.name || f.resource_name || `resource-${idx + 1}`;
      const resUid = res.uid || f.resource_uid || `res-uid-${idx + 1}`;
      
      const provRaw = (
        f.scan?.provider?.provider ||
        f.provider ||
        (f.resources && f.resources[0]?.provider) ||
        (connectedProviders.length > 0 ? connectedProviders[0].providerUpper : "AZURE")
      );
      const provider = (provRaw === "oraclecloud" ? "OCI" : provRaw || "AZURE").toUpperCase();
      const region = res.region || f.region || f.raw_result?.Region || (provider === "AZURE" ? "eastus" : provider === "OCI" ? "us-ashburn-1" : "Global");
      const severity = (f.severity || "medium").toLowerCase();

      const matchedExec = executions.find(
        (ex) => ex.finding_id === f.id || (ex.summary && checkId && ex.summary.toLowerCase().includes(checkId.toLowerCase()))
      );

      const remediation = generateProviderRemediation(
        provider,
        checkId,
        resName,
        resUid,
        region,
        checkMeta,
        f.raw_result
      );

      let approvalStatus: FindingRemediationItem["approval_status"] = "PENDING_APPROVAL";
      if (matchedExec) {
        approvalStatus = "TICKET_CREATED";
      }

      list.push({
        id: f.id || `remed-real-${idx}`,
        finding_id: f.id || `find-real-${idx}`,
        check_id: checkId,
        title: `Remediate ${checkId.replace(/_/g, " ")}`,
        finding_title: title,
        provider,
        region,
        resource_uid: resUid,
        resource_name: resName,
        severity,
        risk_score: severity === "critical" ? 95 : severity === "high" ? 85 : severity === "medium" ? 65 : 40,
        risk_summary: checkMeta.risk || `Exposure detected on ${resName} violating cloud security posture standards.`,
        compliance_rules: f.compliance ? Object.keys(f.compliance) : ["CIS Cloud Security Benchmark", "NCA ECC"],
        recommended_fix: remediation.recommended_fix,
        cli_command: remediation.cli_command,
        code_snippet: remediation.code_snippet,
        console_steps: remediation.console_steps,
        validation_steps: remediation.validation_steps,
        remediation_url: remediation.remediation_url,
        ai_reasoning: `Digital CISO Threat Engine analyzed telemetry for ${resUid}. Misconfiguration allows potential privilege escalation or unauthorized data exposure under ${provider} policies.`,
        evidence: f.status_extended || `Resource ${resName} failed rule verification during continuous posture assessment.`,
        approval_status: approvalStatus,
        execution_record: matchedExec,
        inserted_at: f.inserted_at || new Date().toISOString(),
      });
    });

    // 2. Append default baseline catalog ONLY for connected providers that have zero real findings
    const allowedCatalog = defaultEnterpriseCatalog.filter((cat) => {
      const catProv = cat.provider.toUpperCase();
      const isConnected =
        connectedProviderSet.has(catProv) ||
        (catProv === "ORACLECLOUD" && connectedProviderSet.has("OCI")) ||
        (catProv === "ORACLE_SAAS" && connectedProviderSet.has("ORACLE_SAAS"));
      if (!isConnected) return false;
      const hasRealForProv = list.some(
        (item) => item.provider === catProv || (catProv === "ORACLECLOUD" && item.provider === "OCI")
      );
      return !hasRealForProv;
    });

    allowedCatalog.forEach((cat, cIdx) => {
      // Don't duplicate if already present
      if (list.some((item) => item.check_id === cat.check_id)) return;

      const matchedExec = executions.find(
        (ex) => ex.finding_id === cat.finding_id || ex.summary?.toLowerCase().includes(cat.check_id.toLowerCase())
      );

      const remediation = generateProviderRemediation(
        cat.provider,
        cat.check_id,
        cat.resource_name,
        cat.resource_uid,
        cat.region,
        {},
        null
      );

      let approvalStatus: FindingRemediationItem["approval_status"] = "PENDING_APPROVAL";
      if (matchedExec) {
        approvalStatus = "TICKET_CREATED";
      }

      list.push({
        id: cat.id,
        finding_id: cat.finding_id,
        check_id: cat.check_id,
        title: `Remediate ${cat.check_id.replace(/_/g, " ")}`,
        finding_title: cat.finding_title,
        provider: cat.provider,
        region: cat.region,
        resource_uid: cat.resource_uid,
        resource_name: cat.resource_name,
        severity: cat.severity,
        risk_score: cat.risk_score,
        risk_summary: cat.risk_summary,
        compliance_rules: cat.compliance_rules,
        recommended_fix: remediation.recommended_fix,
        cli_command: remediation.cli_command,
        code_snippet: remediation.code_snippet,
        console_steps: remediation.console_steps,
        validation_steps: remediation.validation_steps,
        remediation_url: remediation.remediation_url,
        ai_reasoning: `Digital CISO Threat Engine analyzed telemetry for ${cat.resource_uid}. Root cause analysis indicates non-compliance with ${cat.provider} baseline security architecture.`,
        evidence: cat.status_extended,
        approval_status: approvalStatus,
        execution_record: matchedExec,
        inserted_at: new Date(Date.now() - (cIdx + 1) * 3600000).toISOString(),
      });
    });

    return list;
  }, [realFindings, executions, connectedProviderSet]);

  // Set initial selected item
  useEffect(() => {
    if (!selectedItemId && remediationItems.length > 0) {
      setSelectedItemId(remediationItems[0].id);
    }
  }, [remediationItems, selectedItemId]);

  const selectedItem = useMemo(() => {
    return remediationItems.find((item) => item.id === selectedItemId) || remediationItems[0];
  }, [remediationItems, selectedItemId]);

  // Filter items by tab section, provider filter, and search query
  const filteredItems = useMemo(() => {
    return remediationItems.filter((item) => {
      // Cloud Provider filter
      if (selectedProviderFilter !== "ALL") {
        const itemProv = (item.provider || "").toUpperCase();
        if (selectedProviderFilter === "ORACLE_SAAS") {
          if (!itemProv.includes("SAAS") && !itemProv.includes("ORACLE_SAAS")) return false;
        } else if (selectedProviderFilter === "OCI" || selectedProviderFilter === "ORACLECLOUD") {
          if (!itemProv.includes("ORACLE") && !itemProv.includes("OCI")) return false;
        } else if (selectedProviderFilter === "KUBERNETES") {
          if (!itemProv.includes("KUBE") && !itemProv.includes("K8S")) return false;
        } else if (itemProv !== selectedProviderFilter) {
          return false;
        }
      }

      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q) || item.finding_title.toLowerCase().includes(q);
        const matchKey = item.execution_record?.issue_key?.toLowerCase().includes(q);
        const matchAssignee = item.execution_record?.assignee_name?.toLowerCase().includes(q);
        const matchResource = item.resource_name?.toLowerCase().includes(q);
        if (!matchTitle && !matchKey && !matchAssignee && !matchResource) return false;
      }

      // Section tab filter
      if (filterSection === "All") return true;
      if (filterSection === "Pending") {
        return !item.execution_record || item.execution_record.status === "PENDING";
      }
      if (filterSection === "In Progress") {
        return item.execution_record && (item.execution_record.status === "IN_PROGRESS" || item.execution_record.jira_status_category === "indeterminate");
      }
      if (filterSection === "Completed") {
        return item.execution_record && (item.execution_record.status === "COMPLETED" || item.execution_record.jira_status_category === "done");
      }
      if (filterSection === "Failed") {
        return item.execution_record && item.execution_record.status === "FAILED";
      }
      return true;
    });
  }, [remediationItems, filterSection, selectedProviderFilter, searchQuery]);

  // Handle Opening Ticket Creation Modal
  const handleOpenCreateTicket = (item: FindingRemediationItem) => {
    setCustomSummary(`Fix ${item.check_id.replace(/_/g, " ")} on ${item.resource_name}`);
    setSelectedProject(jiraConfig?.default_project || (projectsData?.items?.[0]?.key || "SEC"));
    setSelectedIssueType(jiraConfig?.default_issue_type || "Task");
    setSelectedPriority(item.severity === "critical" ? "Highest" : item.severity === "high" ? "High" : "Medium");
    setIsCreatingTicket(true);
  };

  // Handle Ticket Creation Submit
  const handleConfirmCreateTicket = async () => {
    if (!selectedItem) return;

    try {
      const payload = {
        finding_id: selectedItem.finding_id,
        project_key: selectedProject || "SEC",
        summary: customSummary || selectedItem.title,
        issue_type: selectedIssueType || "Task",
        priority: selectedPriority || "Medium",
        assignee_account_id: selectedAssignee?.accountId,
        assignee_name: selectedAssignee?.displayName,
        assignee_email: selectedAssignee?.emailAddress,
        labels: ["digital-ciso", "security", selectedItem.provider.toLowerCase(), selectedItem.severity],
        finding_title: selectedItem.finding_title,
        check_id: selectedItem.check_id,
        provider: selectedItem.provider,
        region: selectedItem.region,
        resource_uid: selectedItem.resource_uid,
        resource_name: selectedItem.resource_name,
        severity: selectedItem.severity,
        risk_score: selectedItem.risk_score,
        risk_summary: selectedItem.risk_summary,
        compliance_rules: selectedItem.compliance_rules,
        recommended_fix: selectedItem.recommended_fix,
        code_snippet: selectedItem.code_snippet,
        ai_reasoning: selectedItem.ai_reasoning,
        evidence: selectedItem.evidence,
      };

      const result = await createTicketMutation.mutateAsync(payload);
      setIsCreatingTicket(false);
      setCreatedTicketResult({
        key: result.issue_key,
        url: result.issue_url,
        assigneeName: result.assignee_name || selectedAssignee?.displayName || "Unassigned",
        status: result.jira_status || "To Do",
      });
      setActionSuccess(`Jira Ticket ${result.issue_key} created and assigned successfully!`);
      refetchExecutions();
      refetchMetrics();
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err: any) {
      alert(`Failed to create Jira ticket: ${err?.response?.data?.error || err?.message}`);
    }
  };

  // Handle Sync Jira Status
  const handleSyncStatus = async (executionId: string) => {
    try {
      await syncStatusMutation.mutateAsync(executionId);
      refetchExecutions();
      refetchMetrics();
      setActionSuccess("Synchronized latest status from Jira Cloud!");
      setTimeout(() => setActionSuccess(null), 3000);
    } catch {
      // Handled
    }
  };

  // KPI Calculations
  const totalFindings = remediationItems.length;
  const pendingTickets = remediationItems.filter(
    (item) => !item.execution_record || item.execution_record.status === "PENDING"
  ).length;
  const inProgressTickets = remediationItems.filter(
    (item) => item.execution_record && (item.execution_record.status === "IN_PROGRESS" || item.execution_record.jira_status_category === "indeterminate")
  ).length;
  const resolvedTickets = remediationItems.filter(
    (item) => item.execution_record && (item.execution_record.status === "COMPLETED" || item.execution_record.jira_status_category === "done")
  ).length;
  const failedTickets = remediationItems.filter(
    (item) => item.execution_record && item.execution_record.status === "FAILED"
  ).length;

  return (
    <AppShell
      title="Aegis Autonomous Remediation"
      subtitle="AI-driven remediation engine with verified IaC playbooks and live Jira Cloud dispatch"
      actions={
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              refetchExecutions();
              refetchMetrics();
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-3 transition-colors shadow-sm"
          >
            <RefreshCw className="h-3.5 w-3.5 text-primary" />
            <span>Sync Live Status</span>
          </button>
          <Link
            to="/integrations"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-all shadow-md active:scale-95"
          >
            <Ticket className="h-3.5 w-3.5" />
            <span>Jira Settings</span>
          </Link>
        </div>
      }
    >
      {/* ── Banner Alerts ── */}
      {actionSuccess && (
        <div className="mb-5 flex items-center justify-between rounded-xl border border-success/30 bg-success/10 p-4 text-xs font-semibold text-success shadow-sm">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {actionSuccess}
          </span>
          <button onClick={() => setActionSuccess(null)} className="cursor-pointer opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {!jiraConfig?.connected && (
        <div className="mb-5 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-semibold text-amber-300 shadow-sm">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            Jira Cloud is not connected yet. Configure your Atlassian API token to dispatch real-time remediation tickets.
          </span>
          <Link
            to="/integrations"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all shrink-0"
          >
            <span>Configure Jira Credentials</span>
          </Link>
        </div>
      )}

      {/* ── Top Metric KPI Cards ── */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <Panel index={0}>
          <span className="section-label">Total Findings</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="kpi-number text-2xl font-black text-foreground">
              {totalFindings}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">Failed Rules</span>
          </div>
        </Panel>

        <Panel index={1} glow="primary">
          <span className="section-label">Pending Action</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="kpi-number text-2xl font-black text-primary">
              {pendingTickets}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">Awaiting Dispatch</span>
          </div>
        </Panel>

        <Panel index={2} glow="info">
          <span className="section-label">In Progress</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="kpi-number text-2xl font-black text-sky-400">
              {inProgressTickets}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">Active in Jira</span>
          </div>
        </Panel>

        <Panel index={3} glow="success">
          <span className="section-label">Resolved</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="kpi-number text-2xl font-black text-success">
              {resolvedTickets}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">Closed & Verified</span>
          </div>
        </Panel>

        <Panel index={4} glow="critical">
          <span className="section-label">Failed</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="kpi-number text-2xl font-black text-critical">
              {failedTickets}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">Dispatch Error</span>
          </div>
        </Panel>
      </div>

      {/* ── Main Split View: Execution Table & Decision Inspector ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (6 Cols): Execution Tab & Records Table */}
        <div className="space-y-4 lg:col-span-6">
          <Panel index={0} className="p-4">
            {/* Header & Section Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Ticket className="h-4 w-4 text-primary" />
                <h3 className="font-display text-sm font-bold text-foreground">
                  Remediation Orchestration
                </h3>
              </div>

              {/* Section Filter Pills */}
              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface-2/60 p-1 text-xs">
                {(["All", "Pending", "In Progress", "Completed", "Failed"] as const).map((tab) => {
                  const count =
                    tab === "All"
                      ? remediationItems.length
                      : tab === "Pending"
                      ? pendingTickets
                      : tab === "In Progress"
                      ? inProgressTickets
                      : tab === "Completed"
                      ? resolvedTickets
                      : failedTickets;
                  return (
                    <button
                      key={tab}
                      onClick={() => setFilterSection(tab)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                        filterSection === tab
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Search & Cloud Provider Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 mb-3">
              {/* Dynamic Provider Dropdown Selector (Only Added Cloud Providers) */}
              <div className="sm:col-span-5 relative">
                <select
                  value={selectedProviderFilter}
                  onChange={(e) => setSelectedProviderFilter(e.target.value)}
                  className="w-full h-full rounded-xl border border-border bg-surface-2 pl-3 pr-8 py-2 text-xs font-semibold text-foreground focus:border-primary focus:outline-none appearance-none cursor-pointer"
                >
                  <option value="ALL">☁️ All Connected ({connectedProviders.length || 1})</option>
                  {connectedProviders.map((p) => (
                    <option key={p.id} value={p.providerUpper}>
                      {p.providerUpper === "AZURE" ? "🟦 " : p.providerUpper === "AWS" ? "🟧 " : p.providerUpper === "GCP" ? "🟩 " : p.providerUpper === "OCI" ? "🟥 " : p.providerUpper === "KUBERNETES" ? "☸️ " : "🛡️ "}
                      {p.alias} ({p.providerUpper})
                    </option>
                  ))}
                </select>
                <ChevronRight className="pointer-events-none absolute right-3 top-2.5 h-3.5 w-3.5 rotate-90 text-muted-foreground" />
              </div>

              {/* Search Input */}
              <div className="sm:col-span-7 relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search findings, issue key, or assignee..."
                  className="w-full rounded-xl border border-border bg-surface-2 pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Records List Table */}
            <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
              {filteredItems.length === 0 ? (
                <div className="rounded-xl border border-border/60 bg-surface-2/30 p-8 text-center text-xs text-muted-foreground">
                  No remediation records found matching the "{filterSection}" and "{selectedProviderFilter}" filters.
                </div>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = item.id === selectedItem?.id;
                  const exec = item.execution_record;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      className={`group flex flex-col gap-2 rounded-xl border p-3.5 transition-all cursor-pointer ${
                        isSelected
                          ? "border-primary/80 bg-primary/5 shadow-sm"
                          : "border-border/80 bg-surface/80 hover:border-primary/40 hover:bg-surface"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {/* Issue Key / Status Badge */}
                          {exec?.issue_key && exec.issue_key !== "N/A" ? (
                            <a
                              href={exec.issue_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] font-mono font-bold text-primary hover:underline"
                            >
                              <span>{exec.issue_key}</span>
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          ) : (
                            <span className="rounded-md bg-surface-2 border border-border px-2 py-0.5 text-[10px] font-mono font-bold text-muted-foreground">
                              PENDING JIRA
                            </span>
                          )}

                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            item.severity === "critical"
                              ? "bg-rose-500/10 text-rose-400"
                              : item.severity === "high"
                              ? "bg-orange-500/10 text-orange-400"
                              : "bg-amber-500/10 text-amber-400"
                          }`}>
                            {item.severity}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Current Jira Status Badge */}
                          {exec ? (
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                              exec.status === "COMPLETED" || exec.jira_status_category === "done"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : exec.status === "FAILED"
                                ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                : "bg-sky-500/10 text-sky-400 border-sky-500/20"
                            }`}>
                              <Dot tone={exec.status === "COMPLETED" ? "success" : exec.status === "FAILED" ? "high" : "primary"} pulse={exec.status === "IN_PROGRESS"} />
                              {exec.jira_status || "In Progress"}
                            </span>
                          ) : (
                            <span className="rounded-full bg-surface-2 border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              Ready to Dispatch
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Finding Title */}
                      <div className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors line-clamp-1">
                        {item.title}
                      </div>

                      {/* Assignee & Resource Meta */}
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium text-foreground">
                            {exec?.assignee_name || "Unassigned"}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[10px]">{item.provider} · {item.region}</span>
                          <span className="text-[10px] text-muted-foreground">{new Date(item.inserted_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Panel>
        </div>

        {/* Right Column (6 Cols): Decision Panel & Jira Ticket Inspector */}
        <div className="space-y-4 lg:col-span-6">
          {selectedItem ? (
            <Panel index={1} className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                      selectedItem.severity === "critical"
                        ? "bg-rose-500/10 text-rose-400"
                        : selectedItem.severity === "high"
                        ? "bg-orange-500/10 text-orange-400"
                        : "bg-amber-500/10 text-amber-400"
                    }`}>
                      {selectedItem.severity} Severity
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      Risk Score: <strong className="text-foreground">{selectedItem.risk_score}/100</strong>
                    </span>
                  </div>
                  <h3 className="font-display text-base font-bold text-foreground">
                    {selectedItem.finding_title}
                  </h3>
                  <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                    Resource: <span className="text-foreground">{selectedItem.resource_name}</span> ({selectedItem.provider})
                  </p>
                </div>

                {/* Open in Jira button if already created */}
                {selectedItem.execution_record?.issue_url && (
                  <div className="flex flex-col items-end gap-1.5">
                    <a
                      href={selectedItem.execution_record.issue_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground shadow hover:bg-primary/90 transition-all cursor-pointer"
                    >
                      <span>Open in Jira</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button
                      onClick={() => handleSyncStatus(selectedItem.execution_record!.id)}
                      disabled={syncStatusMutation.isPending}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <RefreshCw className={`h-3 w-3 ${syncStatusMutation.isPending ? "animate-spin text-primary" : ""}`} />
                      <span>Sync Live Status</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Success Banner if freshly created */}
              {createdTicketResult && (
                <div className="mb-4 rounded-xl border border-success/30 bg-success/10 p-4 text-xs space-y-2">
                  <div className="flex items-center justify-between font-bold text-success">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" />
                      Jira Ticket Created Successfully!
                    </span>
                    <a
                      href={createdTicketResult.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 underline"
                    >
                      <span>{createdTicketResult.key}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-muted-foreground text-[11px]">
                    <div>Assignee: <strong className="text-foreground">{createdTicketResult.assigneeName}</strong></div>
                    <div>Initial Status: <strong className="text-foreground">{createdTicketResult.status}</strong></div>
                  </div>
                </div>
              )}

              {/* Section 1: AI Remediation & Reasoning */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span>AI Recommended Fix & Reasoning</span>
                  </h4>
                  <div className="rounded-xl border border-border/80 bg-surface-2/50 p-3.5 text-xs text-foreground leading-relaxed">
                    <p className="font-semibold text-foreground mb-1">{selectedItem.recommended_fix}</p>
                    <p className="text-muted-foreground text-[11px]">{selectedItem.ai_reasoning}</p>
                  </div>
                </div>

                {/* Section 2: Multi-Modal Remediation Engine (CLI / IaC / Console) */}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Terminal className="h-3.5 w-3.5 text-primary" />
                      <span>Actionable Remediation Solution</span>
                    </h4>

                    {/* Format Tabs: CLI, Terraform, Console */}
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-0.5 text-[11px]">
                      <button
                        onClick={() => setActiveRemediationTab("cli")}
                        className={`px-2 py-0.5 rounded font-semibold transition-all cursor-pointer ${
                          activeRemediationTab === "cli"
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        💻 CLI Command
                      </button>
                      <button
                        onClick={() => setActiveRemediationTab("terraform")}
                        className={`px-2 py-0.5 rounded font-semibold transition-all cursor-pointer ${
                          activeRemediationTab === "terraform"
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        📜 Terraform IaC
                      </button>
                      <button
                        onClick={() => setActiveRemediationTab("console")}
                        className={`px-2 py-0.5 rounded font-semibold transition-all cursor-pointer ${
                          activeRemediationTab === "console"
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        🖥️ Console Guide
                      </button>
                    </div>
                  </div>

                  {/* Tab Content 1: CLI */}
                  {activeRemediationTab === "cli" && (
                    <div className="relative group">
                      <pre className="rounded-xl border border-border/80 bg-[#0d1117] p-3.5 font-mono text-[11px] text-emerald-400 overflow-x-auto whitespace-pre-wrap">
                        <code>{selectedItem.cli_command}</code>
                      </pre>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(selectedItem.cli_command);
                          setCopiedTab("cli");
                          setTimeout(() => setCopiedTab(null), 2000);
                        }}
                        className="absolute right-2.5 top-2.5 rounded-lg border border-border/60 bg-surface-2/80 px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground opacity-80 group-hover:opacity-100 transition-opacity flex items-center gap-1 cursor-pointer"
                      >
                        {copiedTab === "cli" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        <span>{copiedTab === "cli" ? "Copied!" : "Copy"}</span>
                      </button>
                    </div>
                  )}

                  {/* Tab Content 2: Terraform */}
                  {activeRemediationTab === "terraform" && (
                    <div className="relative group">
                      <pre className="rounded-xl border border-border/80 bg-[#0d1117] p-3.5 font-mono text-[11px] text-sky-400 overflow-x-auto whitespace-pre-wrap">
                        <code>{selectedItem.code_snippet}</code>
                      </pre>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(selectedItem.code_snippet);
                          setCopiedTab("terraform");
                          setTimeout(() => setCopiedTab(null), 2000);
                        }}
                        className="absolute right-2.5 top-2.5 rounded-lg border border-border/60 bg-surface-2/80 px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground opacity-80 group-hover:opacity-100 transition-opacity flex items-center gap-1 cursor-pointer"
                      >
                        {copiedTab === "terraform" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        <span>{copiedTab === "terraform" ? "Copied!" : "Copy"}</span>
                      </button>
                    </div>
                  )}

                  {/* Tab Content 3: Console */}
                  {activeRemediationTab === "console" && (
                    <div className="rounded-xl border border-border/80 bg-surface-2/60 p-4 text-xs text-foreground font-mono leading-relaxed whitespace-pre-wrap">
                      {selectedItem.console_steps}
                    </div>
                  )}

                  {/* Validation Verification Steps */}
                  <div className="mt-2.5 rounded-lg border border-border/50 bg-surface-2/30 p-2.5 text-[11px] space-y-1">
                    <div className="font-bold text-muted-foreground flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3 text-primary" />
                      <span>Verification Steps</span>
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                      {selectedItem.validation_steps?.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Section 3: Execution Timeline */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    <span>Remediation Execution Timeline</span>
                  </h4>

                  <div className="rounded-xl border border-border/80 bg-surface-2/40 p-4 space-y-3">
                    {selectedItem.execution_record?.timeline && selectedItem.execution_record.timeline.length > 0 ? (
                      selectedItem.execution_record.timeline.map((step, sIdx) => (
                        <div key={sIdx} className="flex items-start gap-3 text-xs">
                          <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary shrink-0 font-bold text-[10px]">
                            {sIdx + 1}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-foreground">{step.title}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(step.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{step.description}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-start gap-3 text-xs">
                          <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 shrink-0 font-bold text-[10px]">
                            ✓
                          </div>
                          <div>
                            <span className="font-bold text-foreground">Recommendation Generated</span>
                            <p className="text-[11px] text-muted-foreground">Root cause synthesized by Digital CISO AI.</p>
                          </div>
                        </div>

                        <div className="flex items-start gap-3 text-xs opacity-60">
                          <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-surface-3 text-muted-foreground shrink-0 font-bold text-[10px]">
                            2
                          </div>
                          <div>
                            <span className="font-bold text-foreground">Awaiting Jira Ticket Dispatch</span>
                            <p className="text-[11px] text-muted-foreground">Click "Create Jira Ticket" below to publish & assign.</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Primary Action Button */}
                <div className="pt-2">
                  {selectedItem.execution_record ? (
                    <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 p-3.5 text-xs font-semibold">
                      <div className="flex items-center gap-2 text-foreground">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        <span>Ticket active in Jira: <strong className="text-primary">{selectedItem.execution_record.issue_key}</strong></span>
                      </div>
                      <a
                        href={selectedItem.execution_record.issue_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline font-bold"
                      >
                        <span>View Ticket</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleOpenCreateTicket(selectedItem)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 px-4 text-xs font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
                    >
                      <Ticket className="h-4 w-4" />
                      <span>Create Jira Ticket & Assign</span>
                    </button>
                  )}
                </div>
              </div>
            </Panel>
          ) : (
            <Panel index={1} className="p-8 text-center text-muted-foreground text-xs">
              Select a remediation item from the left queue to inspect details.
            </Panel>
          )}
        </div>
      </div>

      {/* ── Modal / Drawer: Create Jira Ticket Flow ── */}
      {isCreatingTicket && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Ticket className="h-5 w-5 text-primary" />
                <h3 className="font-display text-base font-bold text-foreground">
                  Create & Assign Jira Remediation Ticket
                </h3>
              </div>
              <button
                onClick={() => setIsCreatingTicket(false)}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Summary */}
              <div>
                <label className="block font-bold text-foreground mb-1">Issue Summary</label>
                <input
                  type="text"
                  value={customSummary}
                  onChange={(e) => setCustomSummary(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              {/* Project & Issue Type 2-Col */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-foreground mb-1">Target Project</label>
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                  >
                    {projectsData?.items && projectsData.items.length > 0 ? (
                      projectsData.items.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.name} ({p.key})
                        </option>
                      ))
                    ) : (
                      <option value="SEC">Security (SEC)</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-foreground mb-1">Issue Type</label>
                  <select
                    value={selectedIssueType}
                    onChange={(e) => setSelectedIssueType(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="Task">Task</option>
                    <option value="Bug">Bug</option>
                    <option value="Security Finding">Security Finding</option>
                  </select>
                </div>
              </div>

              {/* Assignee Searchable Dropdown */}
              <div className="relative">
                <label className="block font-bold text-foreground mb-1">
                  Assignee <span className="text-muted-foreground font-normal">(Search Jira users)</span>
                </label>
                <div
                  onClick={() => setAssigneeDropdownOpen(!assigneeDropdownOpen)}
                  className="flex items-center justify-between w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2 text-xs text-foreground cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-primary" />
                    <span>{selectedAssignee ? `${selectedAssignee.displayName} (${selectedAssignee.emailAddress || 'User'})` : "Select an assignee..."}</span>
                  </div>
                  <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${assigneeDropdownOpen ? "rotate-90" : ""}`} />
                </div>

                {assigneeDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-surface p-2 shadow-xl space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 h-3 w-3 text-muted-foreground" />
                      <input
                        type="text"
                        value={assigneeSearchQuery}
                        onChange={(e) => setAssigneeSearchQuery(e.target.value)}
                        placeholder="Search Jira users by name or email..."
                        className="w-full rounded-lg border border-border bg-surface-2 pl-8 pr-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                      />
                    </div>

                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {assigneesLoading ? (
                        <div className="p-2 text-center text-muted-foreground text-[11px]">Loading Jira users...</div>
                      ) : assigneesData?.items && assigneesData.items.length > 0 ? (
                        assigneesData.items.map((u) => (
                          <div
                            key={u.account_id}
                            onClick={() => {
                              setSelectedAssignee({
                                accountId: u.account_id,
                                displayName: u.display_name,
                                emailAddress: u.email_address,
                                avatarUrl: u.avatar_url,
                              });
                              setAssigneeDropdownOpen(false);
                            }}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-2 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              {u.avatar_url ? (
                                <img src={u.avatar_url} alt="" className="h-5 w-5 rounded-full" />
                              ) : (
                                <User className="h-4 w-4 text-muted-foreground" />
                              )}
                              <div>
                                <div className="font-bold text-foreground text-xs">{u.display_name}</div>
                                <div className="text-[10px] text-muted-foreground">{u.email_address}</div>
                              </div>
                            </div>
                            {selectedAssignee?.accountId === u.account_id && <Check className="h-3.5 w-3.5 text-primary" />}
                          </div>
                        ))
                      ) : (
                        <div className="p-2 text-center text-muted-foreground text-[11px]">
                          No Jira users found. Type to search or select unassigned.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Priority & Auto Labels */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-foreground mb-1">Priority</label>
                  <select
                    value={selectedPriority}
                    onChange={(e) => setSelectedPriority(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="Highest">Highest (P1)</option>
                    <option value="High">High (P2)</option>
                    <option value="Medium">Medium (P3)</option>
                    <option value="Low">Low (P4)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-foreground mb-1">Attached Labels</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {["digital-ciso", "prowler", selectedItem.provider.toLowerCase(), selectedItem.severity].map((lbl) => (
                      <span key={lbl} className="rounded bg-surface-2 border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                        {lbl}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Structured Template Note */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-[11px] text-muted-foreground space-y-1">
                <span className="font-bold text-foreground flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  Full Security Context Included
                </span>
                <p>Includes Executive Summary, Affected Resource, Compliance Findings, Risk Analysis, Remediation Playbook, and Verification Steps.</p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/60">
              <button
                type="button"
                onClick={() => setIsCreatingTicket(false)}
                className="rounded-xl border border-border bg-surface-2 px-4 py-2 text-xs font-semibold text-foreground hover:bg-surface-3 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmCreateTicket}
                disabled={createTicketMutation.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-md"
              >
                <Send className={`h-3.5 w-3.5 ${createTicketMutation.isPending ? "animate-spin" : ""}`} />
                <span>{createTicketMutation.isPending ? "Publishing to Jira..." : "Authorize & Create Ticket"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}