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
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  Chip,
  Dot,
} from "@/components/ui-kit/primitives";
import { useProviders, useCreateProvider } from "@/hooks/use-api";

export const Route = createFileRoute("/providers")({
  component: ProvidersPage,
});

type ProviderType = "AWS" | "AZURE" | "GCP" | "OCI" | "KUBERNETES" | "GITHUB";

function ProvidersPage() {
  const { data: apiProviders, isLoading, refetch } = useProviders();
  const createProviderMutation = useCreateProvider();

  const providerList = (apiProviders?.items && apiProviders.items.length > 0)
    ? (apiProviders.items as Array<Record<string, unknown>>).map((p) => ({
        id: (p.id as string) || (p.uid as string) || "p-001",
        name: ((p.provider as string) || (p.provider_type as string) || "AWS").toUpperCase(),
        alias: (p.alias as string) || (p.uid as string) || "cloud-account",
        status: (p.connected === false ? "disconnected" : "connected") as "connected" | "disconnected" | "syncing",
        lastScan: (p.last_scan_at as string) || "Never",
        resources: (p.resources_count as number) || (p.findings_count as number) || 0,
        uid: (p.uid as string) || "",
      }))
    : [];

  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ProviderType>("AWS");
  const [alias, setAlias] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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
      let credentials: Record<string, string> = {};

      if (activeTab === "AWS") {
        uid = awsAuthMode === "role" ? awsRoleArn : awsAccessKey;
        credentials = {
          auth_mode: awsAuthMode,
          role_arn: awsRoleArn,
          external_id: awsExternalId,
          access_key: awsAccessKey,
          secret_key: awsSecretKey,
          region: awsRegion,
        };
      } else if (activeTab === "AZURE") {
        uid = azureSubscriptionId || azureClientId;
        credentials = {
          tenant_id: azureTenantId,
          client_id: azureClientId,
          client_secret: azureClientSecret,
          subscription_id: azureSubscriptionId,
        };
      } else if (activeTab === "GCP") {
        uid = gcpProjectId;
        credentials = {
          project_id: gcpProjectId,
          service_account_key: gcpServiceAccountKey,
        };
      } else if (activeTab === "OCI") {
        uid = ociTenancyOcid;
        credentials = {
          tenancy_ocid: ociTenancyOcid,
          user_ocid: ociUserOcid,
          fingerprint: ociFingerprint,
          private_key: ociPrivateKey,
          region: ociRegion,
        };
      } else if (activeTab === "KUBERNETES") {
        uid = k8sClusterName;
        credentials = {
          cluster_name: k8sClusterName,
          kubeconfig: k8sKubeconfig,
        };
      } else if (activeTab === "GITHUB") {
        uid = githubOrg;
        credentials = {
          org: githubOrg,
          token: githubToken,
        };
      }

      await createProviderMutation.mutateAsync({
        provider: activeTab === "OCI" ? "oraclecloud" : activeTab.toLowerCase(),
        uid: uid || alias,
        alias: alias.trim(),
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
                <Link
                  to="/scans"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  <Zap className="h-3 w-3" />
                  <span>Scan Now</span>
                </Link>
                <Link
                  to="/resources"
                  className="text-xs text-muted-foreground hover:text-foreground font-medium"
                >
                  View Assets →
                </Link>
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
    </AppShell>
  );
}

