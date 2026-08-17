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

type ProviderType = "AWS" | "AZURE" | "GCP" | "OCI" | "KUBERNETES" | "GITHUB";

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

  const providerList: ProviderItem[] = (apiProviders?.items && apiProviders.items.length > 0)
    ? (apiProviders.items as Array<Record<string, unknown>>).map((p) => ({
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
    try {
      await deleteProviderMutation.mutateAsync(deletingProvider.id);
      setDeletingProvider(null);
      refetch();
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (
        msg.includes("404") ||
        msg.includes("Not Found") ||
        msg.includes("No Provider matches") ||
        msg.includes("does not exist")
      ) {
        setDeletingProvider(null);
        refetch();
        return;
      }
      alert(`Failed to delete provider: ${msg || "Unknown error"}`);
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
  const [ociRegion, setOciRegion] = useState("us-ashburn-1");

  // Kubernetes Fields
  const [k8sClusterName, setK8sClusterName] = useState("");
  const [k8sKubeconfig, setK8sKubeconfig] = useState("");

  // GitHub Fields
  const [githubOrg, setGithubOrg] = useState("");
  const [githubToken, setGithubToken] = useState("");

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
    setK8sClusterName("");
    setK8sKubeconfig("");
    setGithubOrg("");
    setGithubToken("");
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
            tenancy_ocid: ociTenancyOcid,
            user_ocid: ociUserOcid,
            fingerprint: ociFingerprint,
            private_key: ociPrivateKey,
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
      }

      const res = await createProviderMutation.mutateAsync({
        provider: activeTab === "OCI" ? "oraclecloud" : activeTab.toLowerCase(),
        uid: uid || alias,
        alias: alias.trim(),
      });

      const newProviderId = (res as any)?.data?.id || (res as any)?.id;
      if (newProviderId && secretPayload) {
        try {
          await createProviderSecretMutation.mutateAsync({
            providerId: newProviderId,
            secretType,
            secret: secretPayload,
          });
        } catch (secErr) {
          console.warn("Could not attach provider secret:", secErr);
        }
      }

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
      subtitle="Prowler-compatible multi-cloud connectors for AWS, Azure, GCP, Oracle Cloud (OCI), Kubernetes & SaaS"
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
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {providerList.map((p, i) => (
            <Panel
              key={`${p.name}-${p.alias}`}
              index={i}
              className="flex flex-col justify-between p-5 transition-all hover:border-primary/50"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-foreground font-display text-sm font-bold">
                      {(p.name || 'AWS').slice(0, 3).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-display text-sm font-bold text-foreground">
                        {p.alias}
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {p.name} Environment
                      </span>
                    </div>
                  </div>
                  <Chip tone={p.status === "connected" ? "success" : "critical"}>
                    <Dot tone={p.status === "connected" ? "success" : "critical"} />
                    {p.status}
                  </Chip>
                </div>

                <div className="mt-4 space-y-2 rounded-lg border border-border/80 bg-surface-2/40 p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Scanned:</span>
                    <span className="font-semibold text-foreground">{p.lastScan}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Discovered Assets:</span>
                    <span className="mono font-semibold text-foreground">
                      {(p.resources ?? 0).toLocaleString()}
                    </span>
                  </div>
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
          ))}
        </div>
      )}

      {/* ── Prowler Multi-Cloud Connection Modal (Full Real-Time Setup with OCI) ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xl my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
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
                onClick={() => setModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-surface-2"
              >
                ✕
              </button>
            </div>

            {/* Provider Type Switcher Tabs */}
            <div className="mt-5 flex flex-wrap gap-2 border-b border-border pb-4">
              {[
                { type: "AWS" as ProviderType, label: "Amazon AWS" },
                { type: "OCI" as ProviderType, label: "Oracle Cloud (OCI)" },
                { type: "AZURE" as ProviderType, label: "Microsoft Azure" },
                { type: "GCP" as ProviderType, label: "Google Cloud (GCP)" },
                { type: "KUBERNETES" as ProviderType, label: "Kubernetes" },
                { type: "GITHUB" as ProviderType, label: "GitHub" },
              ].map((tab) => (
                <button
                  key={tab.type}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.type);
                    setErrorMsg(null);
                  }}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                    activeTab === tab.type
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "border border-border bg-surface-2 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {errorMsg && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-critical/30 bg-critical/10 px-3.5 py-2.5 text-xs text-critical">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3.5 py-2.5 text-xs text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Dynamic Provider Form */}
            <form onSubmit={handleConnect} className="mt-5 space-y-4 text-xs">
              {/* Account Alias (Common) */}
              <div>
                <label className="section-label mb-1.5 block">Account Alias / Environment Name *</label>
                <input
                  type="text"
                  required
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 text-xs text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
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
                          value={awsRoleArn}
                          onChange={(e) => setAwsRoleArn(e.target.value)}
                          className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="section-label mb-1 block">External ID (Optional)</label>
                        <input
                          type="text"
                          value={awsExternalId}
                          onChange={(e) => setAwsExternalId(e.target.value)}
                          className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 text-xs text-foreground outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="section-label mb-1 block">AWS Access Key ID *</label>
                        <input
                          type="text"
                          required
                          value={awsAccessKey}
                          onChange={(e) => setAwsAccessKey(e.target.value)}
                          className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="section-label mb-1 block">AWS Secret Access Key *</label>
                        <input
                          type="password"
                          required
                          value={awsSecretKey}
                          onChange={(e) => setAwsSecretKey(e.target.value)}
                          className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary"
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
                      value={ociTenancyOcid}
                      onChange={(e) => setOciTenancyOcid(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="section-label mb-1 block">User OCID *</label>
                      <input
                        type="text"
                        required
                        value={ociUserOcid}
                        onChange={(e) => setOciUserOcid(e.target.value)}
                        className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="section-label mb-1 block">API Key Fingerprint *</label>
                      <input
                        type="text"
                        required
                        value={ociFingerprint}
                        onChange={(e) => setOciFingerprint(e.target.value)}
                        className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="section-label mb-1 block">Private Key (.pem content) *</label>
                    <textarea
                      required
                      rows={3}
                      value={ociPrivateKey}
                      onChange={(e) => setOciPrivateKey(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface-2/60 p-3 font-mono text-[11px] text-foreground outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="section-label mb-1 block">Home Region</label>
                    <select
                      value={ociRegion}
                      onChange={(e) => setOciRegion(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3 text-xs text-foreground outline-none focus:border-primary"
                    >
                      <option value="us-ashburn-1">us-ashburn-1 (US East)</option>
                      <option value="us-phoenix-1">us-phoenix-1 (US West)</option>
                      <option value="eu-frankfurt-1">eu-frankfurt-1 (Germany)</option>
                      <option value="uk-london-1">uk-london-1 (UK)</option>
                      <option value="ap-mumbai-1">ap-mumbai-1 (India)</option>
                      <option value="ap-singapore-1">ap-singapore-1 (Singapore)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* ── Azure Specific Form ── */}
              {activeTab === "AZURE" && (
                <div className="space-y-3.5 pt-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="section-label mb-1 block">Tenant ID (Directory ID) *</label>
                      <input
                        type="text"
                        required
                        value={azureTenantId}
                        onChange={(e) => setAzureTenantId(e.target.value)}
                        className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="section-label mb-1 block">Client ID (Application ID) *</label>
                      <input
                        type="text"
                        required
                        value={azureClientId}
                        onChange={(e) => setAzureClientId(e.target.value)}
                        className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="section-label mb-1 block">Client Secret *</label>
                      <input
                        type="password"
                        required
                        value={azureClientSecret}
                        onChange={(e) => setAzureClientSecret(e.target.value)}
                        className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="section-label mb-1 block">Subscription ID *</label>
                      <input
                        type="text"
                        required
                        value={azureSubscriptionId}
                        onChange={(e) => setAzureSubscriptionId(e.target.value)}
                        className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary"
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
                      value={gcpProjectId}
                      onChange={(e) => setGcpProjectId(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="section-label mb-1 block">Service Account Key JSON *</label>
                    <textarea
                      required
                      rows={3}
                      value={gcpServiceAccountKey}
                      onChange={(e) => setGcpServiceAccountKey(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface-2/60 p-3 font-mono text-[11px] text-foreground outline-none focus:border-primary"
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
                      value={k8sClusterName}
                      onChange={(e) => setK8sClusterName(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 text-xs text-foreground outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="section-label mb-1 block">Kubeconfig YAML (Read-only ServiceAccount) *</label>
                    <textarea
                      required
                      rows={3}
                      value={k8sKubeconfig}
                      onChange={(e) => setK8sKubeconfig(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface-2/60 p-3 font-mono text-[11px] text-foreground outline-none focus:border-primary"
                    />
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
                      value={githubOrg}
                      onChange={(e) => setGithubOrg(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 text-xs text-foreground outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="section-label mb-1 block">Personal Access Token / App Secret *</label>
                    <input
                      type="password"
                      required
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3.5 font-mono text-xs text-foreground outline-none focus:border-primary"
                    />
                  </div>
                </div>
              )}

              {/* Footer Actions */}
              <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="h-10 rounded-lg border border-border bg-surface-2 px-5 text-xs font-semibold text-foreground hover:bg-surface-2/80"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={connecting}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95 disabled:opacity-50"
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

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-muted-foreground block text-[11px] font-medium mb-1">Provider Type</span>
                    <div className="font-semibold text-foreground bg-surface px-3 py-2 rounded-lg border border-border/60">
                      {selectedConfigProvider.name}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px] font-medium mb-1">Discovered Assets</span>
                    <div className="mono font-semibold text-foreground bg-surface px-3 py-2 rounded-lg border border-border/60">
                      {selectedConfigProvider.resources.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-muted-foreground block text-[11px] font-medium mb-1">Last Assessment Status</span>
                  <div className="font-semibold text-foreground bg-surface px-3 py-2 rounded-lg border border-border/60">
                    {selectedConfigProvider.lastScan}
                  </div>
                </div>
              </div>

              {/* Security & Audit Capabilities */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-primary font-bold text-xs mb-1.5">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Prowler Continuous Audit Active</span>
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

