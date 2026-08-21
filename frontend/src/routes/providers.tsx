import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Cloud,
  Plus,
  RefreshCw,
  Zap,
  ShieldCheck,
  Key,
  Server,
  FileCode,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Layers,
  Trash2,
  Eye,
  Info,
  Copy,
  Check,
  X,
  Database,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  Chip,
  Dot,
} from "@/components/ui-kit/primitives";
import { useProviders, useCreateProvider, useDeleteProvider, useCreateProviderSecret } from "@/hooks/use-api";

export const Route = createFileRoute("/providers")({
  component: ProvidersPage,
});

type ProviderType = "AWS" | "AZURE" | "GCP" | "OCI" | "KUBERNETES" | "GITHUB" | "ORACLE_SAAS";

interface ProviderItem {
  id: string;
  name: string;
  alias: string;
  status: "connected" | "disconnected" | "syncing";
  lastScan: string;
  resources: number;
  uid: string;
  raw?: Record<string, unknown>;
}

function ProvidersPage() {
  const { data: apiProviders, isLoading, refetch } = useProviders();
  const createProviderMutation = useCreateProvider();
  const deleteProviderMutation = useDeleteProvider();
  const createProviderSecretMutation = useCreateProviderSecret();
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const providerList: ProviderItem[] = (apiProviders?.items && apiProviders.items.length > 0)
    ? (apiProviders.items as Array<Record<string, unknown>>)
        .filter((p) => !deletedIds.has((p.id as string) || (p.uid as string)))
        .map((p) => ({
          id: (p.id as string) || (p.uid as string) || "p-001",
          name: ((p.provider as string) || (p.provider_type as string) || "AWS").toUpperCase(),
          alias: (p.alias as string) || (p.uid as string) || "cloud-account",
          status: (p.connected === false ? "disconnected" : "connected") as "connected" | "disconnected" | "syncing",
          lastScan: (p.last_scan_at as string) || "Never",
          resources: (p.resources_count as number) || (p.findings_count as number) || 0,
          uid: (p.uid as string) || "",
          raw: p,
        }))
    : [];

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedConfigProvider, setSelectedConfigProvider] = useState<ProviderItem | null>(null);
  const [deletingProvider, setDeletingProvider] = useState<ProviderItem | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ProviderType>("AWS");
  const [alias, setAlias] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleConfirmDelete = async () => {
    if (!deletingProvider) return;
    const targetId = deletingProvider.id;
    setDeletedIds((prev) => new Set([...prev, targetId]));
    setDeletingProvider(null);
    try {
      await deleteProviderMutation.mutateAsync(targetId);
    } catch (err: any) {
      console.warn("Delete provider mutation:", err);
    } finally {
      refetch();
    }
  };

  // AWS Fields
  const [awsAuthMode, setAwsAuthMode] = useState<"role" | "keys">("role");
  const [awsRoleArn, setAwsRoleArn] = useState("");
  const [awsExternalId, setAwsExternalId] = useState("");
  const [awsAccessKey, setAwsAccessKey] = useState("");
  const [awsSecretKey, setAwsSecretKey] = useState("");
  const [awsRegion, setAwsRegion] = useState("us-east-1");

  // Azure Fields
  const [azureTenantId, setAzureTenantId] = useState("");
  const [azureClientId, setAzureClientId] = useState("");
  const [azureClientSecret, setAzureClientSecret] = useState("");
  const [azureSubscriptionId, setAzureSubscriptionId] = useState("");

  // GCP Fields
  const [gcpProjectId, setGcpProjectId] = useState("");
  const [gcpServiceAccountKey, setGcpServiceAccountKey] = useState("");

  // OCI (Oracle Cloud Infrastructure) Fields
  const [ociTenancyOcid, setOciTenancyOcid] = useState("");
  const [ociUserOcid, setOciUserOcid] = useState("");
  const [ociFingerprint, setOciFingerprint] = useState("");
  const [ociPrivateKey, setOciPrivateKey] = useState("");
  const [ociRegion, setOciRegion] = useState("uk-london-1");

  // Kubernetes Fields
  const [k8sClusterName, setK8sClusterName] = useState("");
  const [k8sKubeconfig, setK8sKubeconfig] = useState("");

  // GitHub Fields
  const [githubOrg, setGithubOrg] = useState("");
  const [githubToken, setGithubToken] = useState("");

  // Oracle SaaS / ERP Fields
  const [ociSaasAuthMode, setOciSaasAuthMode] = useState<"BASIC_AUTH" | "OAUTH2">("BASIC_AUTH");
  const [ociSaasUsername, setOciSaasUsername] = useState("");
  const [ociSaasPassword, setOciSaasPassword] = useState("");
  const [ociSaasErpType, setOciSaasErpType] = useState<"FUSION_ERP" | "FUSION_HCM" | "NETSUITE" | "ORACLE_SCM">("FUSION_ERP");
  const [ociSaasDomainUrl, setOciSaasDomainUrl] = useState("");
  const [ociSaasClientId, setOciSaasClientId] = useState("");
  const [ociSaasClientSecret, setOciSaasClientSecret] = useState("");
  const [ociSaasErpBaseUrl, setOciSaasErpBaseUrl] = useState("");

  const resetForm = () => {
    setAlias("");
    setErrorMsg(null);
    setSuccessMsg(null);
    setAwsRoleArn("");
    setAwsExternalId("");
    setAwsAccessKey("");
    setAwsSecretKey("");
    setAzureTenantId("");
    setAzureClientId("");
    setAzureClientSecret("");
    setAzureSubscriptionId("");
    setGcpProjectId("");
    setGcpServiceAccountKey("");
    setOciTenancyOcid("");
    setOciUserOcid("");
    setOciFingerprint("");
    setOciPrivateKey("");
    setOciRegion("uk-london-1");
    setK8sClusterName("");
    setK8sKubeconfig("");
    setGithubOrg("");
    setGithubToken("");
    setOciSaasErpType("FUSION_ERP");
    setOciSaasDomainUrl("");
    setOciSaasClientId("");
    setOciSaasClientSecret("");
    setOciSaasErpBaseUrl("");
  };

  const handleOpenModal = (type: ProviderType) => {
    setActiveTab(type);
    resetForm();
    setModalOpen(true);
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alias.trim()) {
      setErrorMsg("Please provide an Account Alias name.");
      return;
    }

    setConnecting(true);
    setErrorMsg(null);

    try {
      let uid = "";
      let secretPayload: Record<string, unknown> | null = null;
      let secretType = "static";

      if (activeTab === "AWS") {
        uid = awsAuthMode === "role" ? awsRoleArn : awsAccessKey;
        if (awsAuthMode === "role" && awsRoleArn) {
          secretType = "role";
          secretPayload = { role_arn: awsRoleArn, external_id: awsExternalId };
        } else if (awsAccessKey && awsSecretKey) {
          secretType = "static";
          secretPayload = { aws_access_key_id: awsAccessKey, aws_secret_access_key: awsSecretKey };
        }
      } else if (activeTab === "AZURE") {
        uid = azureSubscriptionId || azureClientId;
        if (azureClientId && azureClientSecret && azureTenantId) {
          secretType = "static";
          secretPayload = {
            client_id: azureClientId,
            client_secret: azureClientSecret,
            tenant_id: azureTenantId,
          };
        }
      } else if (activeTab === "GCP") {
        uid = gcpProjectId;
        if (gcpProjectId && gcpServiceAccountKey) {
          secretType = "static";
          secretPayload = {
            project_id: gcpProjectId,
            service_account_key: gcpServiceAccountKey,
          };
        }
      } else if (activeTab === "OCI") {
        uid = ociTenancyOcid;
        if (ociTenancyOcid && ociUserOcid && ociFingerprint && ociPrivateKey) {
          secretType = "static";
          secretPayload = {
            tenancy: ociTenancyOcid,
            tenancy_ocid: ociTenancyOcid,
            user: ociUserOcid,
            user_ocid: ociUserOcid,
            fingerprint: ociFingerprint,
            key_content: ociPrivateKey,
            private_key: ociPrivateKey,
            region: ociRegion || "us-ashburn-1",
          };
        }
      } else if (activeTab === "KUBERNETES") {
        uid = k8sClusterName;
        if (k8sKubeconfig) {
          secretType = "static";
          secretPayload = { kubeconfig: k8sKubeconfig };
        }
      } else if (activeTab === "GITHUB") {
        uid = githubOrg;
        if (githubToken) {
          secretType = "static";
          secretPayload = { token: githubToken };
        }
      } else if (activeTab === "ORACLE_SAAS") {
        uid = ociSaasErpBaseUrl || ociSaasDomainUrl || alias;
        secretType = "static";
        if (ociSaasAuthMode === "BASIC_AUTH") {
          secretPayload = {
            auth_mode: "BASIC_AUTH",
            erp_base_url: ociSaasErpBaseUrl,
            username: ociSaasUsername,
            password: ociSaasPassword,
            erp_type: ociSaasErpType,
          };
        } else {
          secretPayload = {
            auth_mode: "OAUTH2",
            erp_base_url: ociSaasErpBaseUrl,
            domain_url: ociSaasDomainUrl,
            client_id: ociSaasClientId,
            client_secret: ociSaasClientSecret,
            erp_type: ociSaasErpType,
          };
        }
      }

      await createProviderMutation.mutateAsync({
        provider:
          activeTab === "OCI"
            ? "oraclecloud"
            : activeTab === "ORACLE_SAAS"
            ? "oracle_saas"
            : activeTab.toLowerCase(),
        uid: uid || alias,
        alias: alias.trim(),
        secret: secretPayload || undefined,
        secret_type: secretType,
      });

      setSuccessMsg(`Successfully connected ${activeTab} environment: ${alias}`);
      setTimeout(() => {
        setModalOpen(false);
        resetForm();
        refetch();
      }, 900);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to connect cloud provider credentials";
      setErrorMsg(msg);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <AppShell
      title="Cloud Provider Connections"
      subtitle="Multi-cloud connectors for AWS, Azure, GCP, Oracle Cloud (OCI), Kubernetes & SaaS"
      actions={
        <button
          onClick={() => handleOpenModal("AWS")}
          className="inline-flex h-10 min-w-[190px] items-center justify-center gap-2 rounded-lg bg-primary px-6 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Cloud Provider</span>
        </button>
      }
    >
      {/* ── Connected Provider Cards Grid or Fresh Tenant Launcher ── */}
      {providerList.length === 0 ? (
        <div className="space-y-6">
          {/* Fresh Tenant Hero Banner */}
          <Panel index={0} className="p-8 text-center bg-surface-2/40 border-dashed">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
              <Cloud className="h-7 w-7" />
            </div>
            <h2 className="text-base font-bold text-foreground">No Cloud Providers Connected Yet</h2>
            <p className="mt-1.5 text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              Connect your first cloud environment to enable continuous compliance auditing and AI threat analysis. Select your cloud provider below to get started.
            </p>
          </Panel>

          {/* Provider Quick-Add Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                type: "AWS" as ProviderType,
                title: "Amazon Web Services",
                desc: "Audit IAM, S3, EC2, GuardDuty & CloudTrail using IAM Role delegation.",
                icon: "AWS",
                color: "text-[#FF9900]",
              },
              {
                type: "OCI" as ProviderType,
                title: "Oracle Cloud (OCI)",
                desc: "Audit OCI Compartments, IAM Policies, Object Storage & VCN Security Lists.",
                icon: "OCI",
                color: "text-[#C74634]",
              },
              {
                type: "AZURE" as ProviderType,
                title: "Microsoft Azure",
                desc: "Audit Entra ID, Key Vaults, NSGs & Subscriptions via Service Principal.",
                icon: "AZURE",
                color: "text-[#0078D4]",
              },
              {
                type: "GCP" as ProviderType,
                title: "Google Cloud Platform",
                desc: "Audit GCP IAM, Cloud Storage, Compute & BigQuery via Service Account.",
                icon: "GCP",
                color: "text-[#4285F4]",
              },
              {
                type: "KUBERNETES" as ProviderType,
                title: "Kubernetes Cluster",
                desc: "Audit EKS/GKE/OKE/Self-managed clusters against CIS K8s Benchmarks.",
                icon: "K8S",
                color: "text-[#326CE5]",
              },
              {
                type: "GITHUB" as ProviderType,
                title: "GitHub & SaaS",
                desc: "Audit organization repository access, branch protection & secret scanning.",
                icon: "GH",
                color: "text-slate-300",
              },
              {
                type: "ORACLE_SAAS" as ProviderType,
                title: "Oracle SaaS / ERP",
                desc: "Audit Oracle Fusion ERP, HCM & NetSuite for SoD conflicts, privileged roles & audit trail integrity.",
                icon: "ERP",
                color: "text-[#F80000]",
              },
            ].map((card) => (
              <button
                key={card.type}
                onClick={() => handleOpenModal(card.type)}
                className="group flex flex-col justify-between rounded-xl border border-border bg-surface p-5 text-left transition-all hover:border-primary hover:bg-surface-2/70 active:scale-[0.99] cursor-pointer"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className={`font-mono text-xs font-black px-2 py-1 rounded bg-surface-2 ${card.color}`}>
                      {card.icon}
                    </span>
                    <span className="text-[11px] font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      Connect →
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-sm font-bold text-foreground">
                    {card.title}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {card.desc}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-border/50 text-[11px] text-muted-foreground flex items-center gap-1.5 font-medium">
                  <Plus className="h-3 w-3 text-primary" />
                  <span>Configure {card.type} Credentials</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Connected Provider Cards Grid ── */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {providerList.map((p, i) => {
              const nameLower = (p.name || "").toLowerCase();
              const aliasLower = (p.alias || "").toLowerCase();
              const isSaas =
                nameLower === "oracle_saas" ||
                nameLower.includes("saas") ||
                aliasLower.includes("fusion");
              const isOci =
                (nameLower === "oraclecloud" || nameLower === "oci" || aliasLower.includes("oci")) &&
                !isSaas;
              const isAzure = nameLower.includes("azure");

              return (
                <Panel
                  key={`${p.name}-${p.alias}`}
                  index={i}
                  className="flex flex-col justify-between p-5 transition-all hover:border-primary/50"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-xl font-display text-xs font-bold ${
                            isSaas
                              ? "bg-red-500/10 text-red-500 border border-red-500/20"
                              : isOci
                              ? "bg-orange-500/10 text-orange-500 border border-orange-500/20"
                              : isAzure
                              ? "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                              : "bg-surface-2 text-foreground"
                          }`}
                        >
                          {isSaas ? "SaaS" : isOci ? "OCI" : (p.name || "AWS").slice(0, 3).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-display text-sm font-bold text-foreground">
                            {p.alias}
                          </h3>
                          <span className="text-xs text-muted-foreground">
                            {isSaas
                              ? "ORACLE_SAAS Environment"
                              : isOci
                              ? "ORACLECLOUD Environment"
                              : `${p.name} Environment`}
                          </span>
                        </div>
                      </div>
                      <Chip tone={p.status === "connected" ? "success" : "critical"}>
                        <Dot tone={p.status === "connected" ? "success" : "critical"} />
                        {p.status}
                      </Chip>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedConfigProvider(p)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2/70 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-surface-3 transition-colors"
                        title="View Provider Configuration"
                      >
                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Config</span>
                      </button>
                      <Link
                        to="/scans"
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                      >
                        <Zap className="h-3.5 w-3.5" />
                        <span>Scan</span>
                      </Link>

                      {isSaas && (
                        <Link
                          to="/oracle-saas"
                          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                          title="Open Oracle Fusion SaaS Governance Dashboard"
                        >
                          <Database className="h-3.5 w-3.5" />
                          <span>SaaS Portal →</span>
                        </Link>
                      )}
                    </div>

                <div className="flex items-center gap-3">
                  <Link
                    to="/resources"
                    className="text-xs text-muted-foreground hover:text-foreground font-medium"
                  >
                    Assets →
                  </Link>
                  <button
                    onClick={() => setDeletingProvider(p)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                    title="Delete / Disconnect Provider"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </Panel>
          );
        })}
        </div>
      </div>
    )}

      {/* ── Multi-Cloud Connection Modal (Full Real-Time Setup with OCI) ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6 backdrop-blur-md overflow-hidden animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface-2/40 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                  <Cloud className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-foreground">
                    Connect Cloud Provider
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Provide real-time read-only credentials for automated multi-cloud scanning
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors cursor-pointer"
                title="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Provider Type Switcher Tabs */}
            <div className="px-6 py-3 border-b border-border bg-surface-2/20 shrink-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {[
                  { type: "AWS" as ProviderType, label: "Amazon AWS" },
                  { type: "OCI" as ProviderType, label: "Oracle Cloud (OCI)" },
                  { type: "AZURE" as ProviderType, label: "Microsoft Azure" },
                  { type: "GCP" as ProviderType, label: "Google Cloud (GCP)" },
                  { type: "KUBERNETES" as ProviderType, label: "Kubernetes" },
                  { type: "GITHUB" as ProviderType, label: "GitHub" },
                  { type: "ORACLE_SAAS" as ProviderType, label: "Oracle SaaS / ERP" },
                ].map((tab) => (
                  <button
                    key={tab.type}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.type);
                      setErrorMsg(null);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                      activeTab === tab.type
                        ? "bg-primary text-primary-foreground shadow-xs ring-2 ring-primary/20"
                        : "border border-border bg-surface-2/80 text-muted-foreground hover:bg-surface-3 hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dynamic Provider Form */}
            <form onSubmit={handleConnect} className="flex flex-col flex-1 overflow-hidden min-h-0">
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-xs">
                {errorMsg && (
                  <div className="flex items-center gap-2 rounded-lg border border-critical/30 bg-critical/10 px-3.5 py-2.5 text-xs text-critical">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {successMsg && (
                  <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3.5 py-2.5 text-xs text-success">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}

                {/* Account Alias (Common) */}
                <div>
                  <label className="section-label mb-1.5 block">Account Alias / Environment Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. production-fusion-erp or aws-prod-account"
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 text-xs text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary placeholder:text-muted-foreground/50"
                  />
                </div>

                {/* ── AWS Specific Form ── */}
                {activeTab === "AWS" && (
                  <div className="space-y-4 pt-1">
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={awsAuthMode === "role"}
                          onChange={() => setAwsAuthMode("role")}
                          className="accent-primary"
                        />
                        <span className="font-semibold text-foreground">IAM Role Delegation (Recommended)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={awsAuthMode === "keys"}
                          onChange={() => setAwsAuthMode("keys")}
                          className="accent-primary"
                        />
                        <span className="font-semibold text-foreground">Access Keys</span>
                      </label>
                    </div>

                    {awsAuthMode === "role" ? (
                      <div className="space-y-3.5">
                        <div>
                          <label className="section-label mb-1 block">Role ARN *</label>
                          <input
                            type="text"
                            required
                            placeholder="arn:aws:iam::123456789012:role/SecurityAuditRole"
                            value={awsRoleArn}
                            onChange={(e) => setAwsRoleArn(e.target.value)}
                            className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                          />
                        </div>
                        <div>
                          <label className="section-label mb-1 block">External ID (Optional)</label>
                          <input
                            type="text"
                            placeholder="Optional external verification token"
                            value={awsExternalId}
                            onChange={(e) => setAwsExternalId(e.target.value)}
                            className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="section-label mb-1 block">AWS Access Key ID *</label>
                          <input
                            type="text"
                            required
                            placeholder="AKIAIOSFODNN7EXAMPLE"
                            value={awsAccessKey}
                            onChange={(e) => setAwsAccessKey(e.target.value)}
                            className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                          />
                        </div>
                        <div>
                          <label className="section-label mb-1 block">AWS Secret Access Key *</label>
                          <input
                            type="password"
                            required
                            placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                            value={awsSecretKey}
                            onChange={(e) => setAwsSecretKey(e.target.value)}
                            className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="section-label mb-1 block">Default Region</label>
                      <select
                        value={awsRegion}
                        onChange={(e) => setAwsRegion(e.target.value)}
                        className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3 text-xs text-foreground outline-none focus:border-primary"
                      >
                        <option value="us-east-1">us-east-1 (N. Virginia)</option>
                        <option value="us-west-2">us-west-2 (Oregon)</option>
                        <option value="eu-west-1">eu-west-1 (Ireland)</option>
                        <option value="ap-southeast-1">ap-southeast-1 (Singapore)</option>
                        <option value="ap-south-1">ap-south-1 (Mumbai)</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* ── OCI (Oracle Cloud Infrastructure) Form ── */}
                {activeTab === "OCI" && (
                  <div className="space-y-3.5 pt-1">
                    <div>
                      <label className="section-label mb-1 block">Tenancy OCID *</label>
                      <input
                        type="text"
                        required
                        placeholder="ocid1.tenancy.oc1..aaaaaaa..."
                        value={ociTenancyOcid}
                        onChange={(e) => setOciTenancyOcid(e.target.value)}
                        className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="section-label mb-1 block">User OCID *</label>
                        <input
                          type="text"
                          required
                          placeholder="ocid1.user.oc1..aaaaaaa..."
                          value={ociUserOcid}
                          onChange={(e) => setOciUserOcid(e.target.value)}
                          className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                        />
                      </div>
                      <div>
                        <label className="section-label mb-1 block">API Key Fingerprint *</label>
                        <input
                          type="text"
                          required
                          placeholder="20:3b:97:13:55:1c:..."
                          value={ociFingerprint}
                          onChange={(e) => setOciFingerprint(e.target.value)}
                          className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="section-label mb-1 block">Private Key (.pem content) *</label>
                      <textarea
                        required
                        rows={3}
                        placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
                        value={ociPrivateKey}
                        onChange={(e) => setOciPrivateKey(e.target.value)}
                        className="w-full rounded-lg border border-border bg-surface-2/60 p-3 font-mono text-[11px] text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                      />
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="section-label">Home Region Identifier *</label>
                        <span className="text-[10px] text-muted-foreground">Select from list or type custom</span>
                      </div>
                      <div className="space-y-2">
                        <select
                          value={ociRegion}
                          onChange={(e) => setOciRegion(e.target.value)}
                          className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3 text-xs text-foreground outline-none focus:border-primary"
                        >
                          <optgroup label="Europe">
                            <option value="uk-london-1">uk-london-1 (UK South - London)</option>
                            <option value="uk-cardiff-1">uk-cardiff-1 (UK West - Newport)</option>
                            <option value="eu-frankfurt-1">eu-frankfurt-1 (Germany Central - Frankfurt)</option>
                            <option value="eu-amsterdam-1">eu-amsterdam-1 (Netherlands - Amsterdam)</option>
                            <option value="eu-paris-1">eu-paris-1 (France - Paris)</option>
                            <option value="eu-marseille-1">eu-marseille-1 (France - Marseille)</option>
                            <option value="eu-zurich-1">eu-zurich-1 (Switzerland - Zurich)</option>
                            <option value="eu-milan-1">eu-milan-1 (Italy - Milan)</option>
                            <option value="eu-madrid-1">eu-madrid-1 (Spain - Madrid)</option>
                            <option value="eu-stockholm-1">eu-stockholm-1 (Sweden - Stockholm)</option>
                          </optgroup>
                          <optgroup label="Asia Pacific">
                            <option value="ap-mumbai-1">ap-mumbai-1 (India West - Mumbai)</option>
                            <option value="ap-hyderabad-1">ap-hyderabad-1 (India South - Hyderabad)</option>
                            <option value="ap-singapore-1">ap-singapore-1 (Singapore)</option>
                            <option value="ap-tokyo-1">ap-tokyo-1 (Japan East - Tokyo)</option>
                            <option value="ap-osaka-1">ap-osaka-1 (Japan Central - Osaka)</option>
                            <option value="ap-seoul-1">ap-seoul-1 (South Korea - Seoul)</option>
                            <option value="ap-chuncheon-1">ap-chuncheon-1 (South Korea - Chuncheon)</option>
                            <option value="ap-sydney-1">ap-sydney-1 (Australia East - Sydney)</option>
                            <option value="ap-melbourne-1">ap-melbourne-1 (Australia - Melbourne)</option>
                          </optgroup>
                          <optgroup label="North America">
                            <option value="us-ashburn-1">us-ashburn-1 (US East - Ashburn)</option>
                            <option value="us-phoenix-1">us-phoenix-1 (US West - Phoenix)</option>
                            <option value="us-sanjose-1">us-sanjose-1 (US West - San Jose)</option>
                            <option value="us-chicago-1">us-chicago-1 (US Central - Chicago)</option>
                            <option value="ca-toronto-1">ca-toronto-1 (Canada - Toronto)</option>
                            <option value="ca-montreal-1">ca-montreal-1 (Canada - Montreal)</option>
                            <option value="mx-queretaro-1">mx-queretaro-1 (Mexico - Queretaro)</option>
                            <option value="mx-monterrey-1">mx-monterrey-1 (Mexico - Monterrey)</option>
                          </optgroup>
                          <optgroup label="Middle East & Africa">
                            <option value="me-dubai-1">me-dubai-1 (UAE East - Dubai)</option>
                            <option value="me-abudhabi-1">me-abudhabi-1 (UAE - Abu Dhabi)</option>
                            <option value="me-jeddah-1">me-jeddah-1 (Saudi Arabia - Jeddah)</option>
                            <option value="me-riyadh-1">me-riyadh-1 (Saudi Arabia - Riyadh)</option>
                            <option value="il-jerusalem-1">il-jerusalem-1 (Israel - Jerusalem)</option>
                            <option value="af-johannesburg-1">af-johannesburg-1 (South Africa - Johannesburg)</option>
                          </optgroup>
                          <optgroup label="Latin America">
                            <option value="sa-saopaulo-1">sa-saopaulo-1 (Brazil - Sao Paulo)</option>
                            <option value="sa-vinhedo-1">sa-vinhedo-1 (Brazil - Vinhedo)</option>
                            <option value="sa-santiago-1">sa-santiago-1 (Chile - Santiago)</option>
                            <option value="sa-bogota-1">sa-bogota-1 (Colombia - Bogota)</option>
                            <option value="sa-valparaiso-1">sa-valparaiso-1 (Chile - Valparaiso)</option>
                          </optgroup>
                        </select>

                        <input
                          type="text"
                          placeholder="Or type custom OCI region key (e.g. uk-london-1, ap-mumbai-1)"
                          value={ociRegion}
                          onChange={(e) => setOciRegion(e.target.value.trim().toLowerCase())}
                          className="h-9 w-full rounded-lg border border-border bg-surface-2/40 px-3 font-mono text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/60"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Azure Specific Form ── */}
                {activeTab === "AZURE" && (
                  <div className="space-y-3.5 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="section-label mb-1 block">Tenant ID (Directory ID) *</label>
                        <input
                          type="text"
                          required
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                          value={azureTenantId}
                          onChange={(e) => setAzureTenantId(e.target.value)}
                          className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                        />
                      </div>
                      <div>
                        <label className="section-label mb-1 block">Client ID (Application ID) *</label>
                        <input
                          type="text"
                          required
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                          value={azureClientId}
                          onChange={(e) => setAzureClientId(e.target.value)}
                          className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="section-label mb-1 block">Client Secret *</label>
                        <input
                          type="password"
                          required
                          placeholder="••••••••••••••••"
                          value={azureClientSecret}
                          onChange={(e) => setAzureClientSecret(e.target.value)}
                          className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                        />
                      </div>
                      <div>
                        <label className="section-label mb-1 block">Subscription ID *</label>
                        <input
                          type="text"
                          required
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                          value={azureSubscriptionId}
                          onChange={(e) => setAzureSubscriptionId(e.target.value)}
                          className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* ── GCP Specific Form ── */}
                {activeTab === "GCP" && (
                  <div className="space-y-3.5 pt-1">
                    <div>
                      <label className="section-label mb-1 block">GCP Project ID *</label>
                      <input
                        type="text"
                        required
                        placeholder="my-gcp-project-12345"
                        value={gcpProjectId}
                        onChange={(e) => setGcpProjectId(e.target.value)}
                        className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                      />
                    </div>
                    <div>
                      <label className="section-label mb-1 block">Service Account Key JSON *</label>
                      <textarea
                        required
                        rows={3}
                        placeholder='{"type": "service_account", "project_id": "...", ...}'
                        value={gcpServiceAccountKey}
                        onChange={(e) => setGcpServiceAccountKey(e.target.value)}
                        className="w-full rounded-lg border border-border bg-surface-2/60 p-3 font-mono text-[11px] text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                      />
                    </div>
                  </div>
                )}

                {/* ── Kubernetes Form ── */}
                {activeTab === "KUBERNETES" && (
                  <div className="space-y-3.5 pt-1">
                    <div>
                      <label className="section-label mb-1 block">Cluster Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="eks-prod-us-east-1"
                        value={k8sClusterName}
                        onChange={(e) => setK8sClusterName(e.target.value)}
                        className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                      />
                    </div>
                    <div>
                      <label className="section-label mb-1 block">Kubeconfig YAML (Read-only ServiceAccount) *</label>
                      <textarea
                        required
                        rows={3}
                        placeholder="apiVersion: v1&#10;clusters: ...&#10;users: ..."
                        value={k8sKubeconfig}
                        onChange={(e) => setK8sKubeconfig(e.target.value)}
                        className="w-full rounded-lg border border-border bg-surface-2/60 p-3 font-mono text-[11px] text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                      />
                    </div>
                  </div>
                )}

                {/* ── Oracle SaaS / ERP Form ── */}
                {activeTab === "ORACLE_SAAS" && (
                  <div className="space-y-3.5 pt-1">
                    {/* Auth Mode Toggle */}
                    <div className="flex gap-2 p-1 rounded-lg border border-border bg-surface-2/40">
                      <button
                        type="button"
                        onClick={() => setOciSaasAuthMode("BASIC_AUTH")}
                        className={`flex-1 rounded-md py-1.5 text-xs font-bold transition-all cursor-pointer ${
                          ociSaasAuthMode === "BASIC_AUTH"
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Basic Auth (Direct Pod)
                      </button>
                      <button
                        type="button"
                        onClick={() => setOciSaasAuthMode("OAUTH2")}
                        className={`flex-1 rounded-md py-1.5 text-xs font-bold transition-all cursor-pointer ${
                          ociSaasAuthMode === "OAUTH2"
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        OAuth 2.0 (IDCS Domain)
                      </button>
                    </div>

                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-2.5 text-[11px] text-emerald-400 flex items-start gap-2">
                      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        {ociSaasAuthMode === "BASIC_AUTH"
                          ? "Connects directly using your Fusion ERP Pod URL and read-only audit user. No IDCS application setup required."
                          : "Connects using OAuth 2.0 Confidential Application registered in your Oracle Identity Domain."}
                      </span>
                    </div>

                    <div>
                      <label className="section-label mb-1 block">Oracle ERP Product *</label>
                      <select
                        value={ociSaasErpType}
                        onChange={(e) => setOciSaasErpType(e.target.value as any)}
                        className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3 text-xs text-foreground outline-none focus:border-primary"
                      >
                        <option value="FUSION_ERP">Oracle Fusion Cloud ERP (Financials & SoD)</option>
                        <option value="FUSION_HCM">Oracle Fusion Cloud HCM (HR & Payroll)</option>
                        <option value="NETSUITE">Oracle NetSuite ERP</option>
                        <option value="ORACLE_SCM">Oracle Fusion Cloud SCM (Supply Chain)</option>
                      </select>
                    </div>

                    <div>
                      <label className="section-label mb-1 block">Fusion ERP Base URL *</label>
                      <input
                        type="text"
                        required
                        placeholder="https://fa-xxxx-saasfaprod1.fa.ocs.oraclecloud.com"
                        value={ociSaasErpBaseUrl}
                        onChange={(e) => setOciSaasErpBaseUrl(e.target.value)}
                        className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                      />
                    </div>

                    {ociSaasAuthMode === "BASIC_AUTH" ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="section-label mb-1 block">Auditor Username *</label>
                          <input
                            type="text"
                            required
                            placeholder="ciso_auditor"
                            value={ociSaasUsername}
                            onChange={(e) => setOciSaasUsername(e.target.value)}
                            className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                          />
                        </div>
                        <div>
                          <label className="section-label mb-1 block">Auditor Password *</label>
                          <input
                            type="password"
                            required
                            placeholder="••••••••••••"
                            value={ociSaasPassword}
                            onChange={(e) => setOciSaasPassword(e.target.value)}
                            className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="section-label mb-1 block">Oracle Identity Domain URL *</label>
                          <input
                            type="text"
                            required
                            placeholder="https://idcs-xxxxxxxx.identity.oraclecloud.com"
                            value={ociSaasDomainUrl}
                            onChange={(e) => setOciSaasDomainUrl(e.target.value)}
                            className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="section-label mb-1 block">OAuth Client ID *</label>
                            <input
                              type="text"
                              required
                              placeholder="c9284fa019284091..."
                              value={ociSaasClientId}
                              onChange={(e) => setOciSaasClientId(e.target.value)}
                              className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                            />
                          </div>
                          <div>
                            <label className="section-label mb-1 block">OAuth Client Secret *</label>
                            <input
                              type="password"
                              required
                              placeholder="••••••••••••••••"
                              value={ociSaasClientSecret}
                              onChange={(e) => setOciSaasClientSecret(e.target.value)}
                              className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {/* Security Checks Grid - Clean 2 Columns */}
                    <div className="rounded-xl border border-border bg-surface-2/30 p-3.5 space-y-2 text-[11px]">
                      <p className="font-bold text-foreground">Security Checks Performed (Read-Only):</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
                        {[
                          "Separation of Duties (SoD) Role Conflict Detection",
                          "Superuser & Implementation Role Audit",
                          "MFA Enforcement for Finance & HR Admins",
                          "ERP Audit Trail & Tamper-Proofing Status",
                          "OAuth API Integration Scope Validation",
                          "IP Allowlist & Network Access Restrictions",
                          "Dormant Privileged Account Review",
                          "SOC 1 / ITGC Control Validation",
                        ].map((check, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-muted-foreground">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <span className="leading-tight">{check}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── GitHub Form ── */}
                {activeTab === "GITHUB" && (
                  <div className="space-y-3.5 pt-1">
                    <div>
                      <label className="section-label mb-1 block">GitHub Organization Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="my-github-org"
                        value={githubOrg}
                        onChange={(e) => setGithubOrg(e.target.value)}
                        className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                      />
                    </div>
                    <div>
                      <label className="section-label mb-1 block">Personal Access Token / App Secret *</label>
                      <input
                        type="password"
                        required
                        placeholder="ghp_xxxxxxxxxxxx"
                        value={githubToken}
                        onChange={(e) => setGithubToken(e.target.value)}
                        className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Actions - Fixed at Bottom */}
              <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4 bg-surface-2/40 shrink-0">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="h-9 rounded-lg border border-border bg-surface-2 px-4 text-xs font-semibold text-foreground hover:bg-surface-2/80 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={connecting}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${connecting ? "animate-spin" : ""}`}
                  />
                  <span>{connecting ? "Validating & Connecting..." : `Connect ${activeTab} Account`}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── View Provider Configuration Modal ── */}
      {selectedConfigProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-xl rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface-2/50">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-display text-sm font-bold">
                  {selectedConfigProvider.name.slice(0, 3)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-sm font-bold text-foreground">
                      {selectedConfigProvider.alias}
                    </h3>
                    <Chip tone={selectedConfigProvider.status === "connected" ? "success" : "critical"}>
                      <Dot tone={selectedConfigProvider.status === "connected" ? "success" : "critical"} />
                      {selectedConfigProvider.status}
                    </Chip>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedConfigProvider.name} Cloud Provider Configuration
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedConfigProvider(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Configuration Fields Grid */}
              <div className="space-y-3 rounded-xl border border-border bg-surface-2/40 p-4 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px] font-medium mb-1">Provider Alias / Name</span>
                  <div className="font-semibold text-foreground bg-surface px-3 py-2 rounded-lg border border-border/60">
                    {selectedConfigProvider.alias}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-muted-foreground text-[11px] font-medium">
                      Cloud Resource Identifier (UID / Subscription / Tenancy OCID)
                    </span>
                    <button
                      onClick={() => handleCopy(selectedConfigProvider.uid, "uid")}
                      className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                    >
                      {copiedField === "uid" ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy UID</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="font-mono text-[11px] text-foreground bg-surface px-3 py-2 rounded-lg border border-border/60 break-all select-all">
                    {selectedConfigProvider.uid || "N/A"}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-muted-foreground text-[11px] font-medium">Internal System Provider ID</span>
                    <button
                      onClick={() => handleCopy(selectedConfigProvider.id, "id")}
                      className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                    >
                      {copiedField === "id" ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy ID</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground bg-surface px-3 py-2 rounded-lg border border-border/60 break-all select-all">
                    {selectedConfigProvider.id}
                  </div>
                </div>

                <div className="pt-1">
                  <div>
                    <span className="text-muted-foreground block text-[11px] font-medium mb-1">Provider Type</span>
                    <div className="font-semibold text-foreground bg-surface px-3 py-2 rounded-lg border border-border/60">
                      {selectedConfigProvider.name}
                    </div>
                  </div>
                </div>
              </div>

              {/* Security & Audit Capabilities */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-primary font-bold text-xs mb-1.5">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Continuous Audit Active</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  This connector supports continuous CIS benchmark scanning, asset graph ingestion, and Spectra AI automated remediation procedures.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-border px-6 py-4 bg-surface-2/30">
              <button
                onClick={() => {
                  const p = selectedConfigProvider;
                  setSelectedConfigProvider(null);
                  setDeletingProvider(p);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3.5 py-2 text-xs font-semibold text-red-500 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Provider</span>
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedConfigProvider(null)}
                  className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-xs font-semibold text-foreground hover:bg-surface-2/80"
                >
                  Close
                </button>
                <Link
                  to="/scans"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all"
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>Launch Assessment</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Provider Confirmation Modal ── */}
      {deletingProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-2xl border border-red-500/30 bg-surface shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-500 mb-4">
              <Trash2 className="h-6 w-6" />
            </div>

            <h3 className="font-display text-base font-bold text-foreground">
              Disconnect & Delete Provider?
            </h3>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to remove <strong className="text-foreground">{deletingProvider.alias}</strong> (<span className="mono">{deletingProvider.name}</span>)? This will disconnect the cloud account connector from your tenant and unregister active scheduled scans.
            </p>

            <div className="mt-4 rounded-lg bg-surface-2 p-3 font-mono text-[11px] text-muted-foreground break-all">
              UID: {deletingProvider.uid || deletingProvider.id}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={deleteProviderMutation.isPending}
                onClick={() => setDeletingProvider(null)}
                className="h-9 rounded-lg border border-border bg-surface-2 px-4 text-xs font-semibold text-foreground hover:bg-surface-2/80"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteProviderMutation.isPending}
                onClick={handleConfirmDelete}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-red-600 px-5 text-xs font-bold text-white shadow-sm hover:bg-red-700 active:scale-95 disabled:opacity-50"
              >
                {deleteProviderMutation.isPending ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Confirm Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

