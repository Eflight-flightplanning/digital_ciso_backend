import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  UserPlus,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Cloud,
  ShieldCheck,
  Lock,
  Layers,
  Sparkles,
  Check,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  Chip,
  Dot,
  DataTable,
  Row,
} from "@/components/ui-kit/primitives";
import { useUsers, useCurrentUser, useJiraConfig, useProviders, qk } from "@/hooks/use-api";
import { api } from "@/lib/api-client";

export interface CloudProviderOption {
  id: string;
  name: string;
  short: string;
  category: string;
}

export const CLOUD_PROVIDER_OPTIONS: CloudProviderOption[] = [
  { id: "azure", name: "Microsoft Azure", short: "Azure", category: "Hyperscaler" },
  { id: "oraclecloud", name: "Oracle Cloud Infrastructure (OCI)", short: "OCI", category: "Hyperscaler" },
  { id: "oracle_saas", name: "Oracle Fusion SaaS / ERP", short: "Oracle SaaS", category: "Enterprise SaaS" },
  { id: "aws", name: "Amazon Web Services (AWS)", short: "AWS", category: "Hyperscaler" },
  { id: "gcp", name: "Google Cloud Platform (GCP)", short: "GCP", category: "Hyperscaler" },
  { id: "kubernetes", name: "Kubernetes (K8s)", short: "Kubernetes", category: "Container" },
];

const FRAMEWORK_OPTIONS = [
  { value: "ALL", label: "All Compliance Frameworks (28+ Standards)" },
  { value: "cis", label: "CIS Benchmarks Only" },
  { value: "nca", label: "NCA Frameworks Only (ECC / CCC)" },
  { value: "soc2", label: "SOC 2 Type II Only" },
  { value: "pci", label: "PCI-DSS v4.0 Only" },
  { value: "iso", label: "ISO / IEC 27001 Only" },
  { value: "hipaa", label: "HIPAA Security Only" },
  { value: "nist", label: "NIST CSF 2.0 Only" },
];

function computeDynamicRole(
  tier: "Admin" | "Member" | "Auditor",
  clouds: string[],
  framework: string
): string {
  if (tier === "Admin") {
    return "Admin";
  }

  let cloudPrefix = "";
  if (clouds.length === 0 || clouds.length === CLOUD_PROVIDER_OPTIONS.length) {
    cloudPrefix = "All Clouds";
  } else if (clouds.length === 1) {
    cloudPrefix = CLOUD_PROVIDER_OPTIONS.find((c) => c.id === clouds[0])?.short || "";
  } else if (clouds.length === 2) {
    const c1 = CLOUD_PROVIDER_OPTIONS.find((c) => c.id === clouds[0])?.short || "";
    const c2 = CLOUD_PROVIDER_OPTIONS.find((c) => c.id === clouds[1])?.short || "";
    cloudPrefix = `${c1} & ${c2}`;
  } else {
    const names = clouds
      .map((id) => CLOUD_PROVIDER_OPTIONS.find((c) => c.id === id)?.short)
      .filter(Boolean);
    cloudPrefix = names.join(" & ");
  }

  const frameworkLabel =
    framework === "cis"
      ? "CIS"
      : framework === "nca"
      ? "NCA"
      : framework === "soc2"
      ? "SOC2"
      : framework === "pci"
      ? "PCI-DSS"
      : framework === "iso"
      ? "ISO27001"
      : framework === "hipaa"
      ? "HIPAA"
      : framework === "nist"
      ? "NIST"
      : "";

  const tierSuffix = tier === "Auditor" ? "Read-Only Auditor" : "Security Analyst";

  const parts = [cloudPrefix, frameworkLabel, tierSuffix].filter(Boolean);
  return parts.join(" ");
}

export const Route = createFileRoute("/users")({
  component: UsersPage,
});

export function UsersPage() {
  const queryClient = useQueryClient();
  const { data: apiUsers, refetch } = useUsers();
  const { data: currentUserRaw } = useCurrentUser();
  const { data: jiraConfig } = useJiraConfig();

  const currentUser = (currentUserRaw as Record<string, any>) || {};
  const currentUserRoleStr = String(
    currentUser.role ||
    (typeof window !== "undefined" ? JSON.parse(localStorage.getItem("auth_user") || "{}")?.role : "") ||
    ""
  ).toLowerCase();
  const isAdmin =
    Boolean(currentUser.is_superuser) ||
    Boolean(currentUser.is_staff) ||
    currentUserRoleStr.includes("admin") ||
    currentUserRoleStr.includes("owner");

  const defaultAdminEmail = currentUser.email || jiraConfig?.email || "digitalciso@eflight.aero";
  const defaultAdminName =
    currentUser.name ||
    (jiraConfig?.email
      ? jiraConfig.email.split("@")[0].replace(".", " ").replace(/\b\w/g, (l: string) => l.toUpperCase())
      : "Digital CISO Administrator");

  const { data: providersData } = useProviders();

  const connectedCloudSet = useMemo(() => {
    const list = (providersData?.items as Array<Record<string, unknown>>) || [];
    const set = new Set<string>();
    list.forEach((p) => {
      const v = String(p.provider || "").toLowerCase();
      if (v) set.add(v);
    });
    return set;
  }, [providersData]);

  const [suspendedEmails, setSuspendedEmails] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<{ id?: string; email: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [roleTier, setRoleTier] = useState<"Admin" | "Member" | "Auditor">("Auditor");
  const [selectedClouds, setSelectedClouds] = useState<string[]>(["azure"]);
  const [frameworkScope, setFrameworkScope] = useState<string>("cis");
  const [customRoleName, setCustomRoleName] = useState<string>("");
  const [isCustomRole, setIsCustomRole] = useState(false);

  const toggleCloud = (cloudId: string) => {
    if (roleTier === "Admin") return;
    setSelectedClouds((prev) => {
      if (prev.includes(cloudId)) {
        if (prev.length <= 1) return prev; // Keep at least one selected
        return prev.filter((id) => id !== cloudId);
      } else {
        return [...prev, cloudId];
      }
    });
  };

  const handleSelectAllClouds = () => {
    if (roleTier === "Admin") return;
    setSelectedClouds(CLOUD_PROVIDER_OPTIONS.map((c) => c.id));
  };

  const computedRole = useMemo(() => {
    return computeDynamicRole(roleTier, selectedClouds, frameworkScope);
  }, [roleTier, selectedClouds, frameworkScope]);

  const activeRoleName = isCustomRole && customRoleName.trim() ? customRoleName.trim() : computedRole;

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [localUsers, setLocalUsers] = useState<Array<Record<string, any>>>([]);

  // Parse fetched users from API cleanly (no dummy data)
  const fetchedItems: Array<Record<string, any>> = Array.isArray(apiUsers?.items)
    ? (apiUsers.items as Array<Record<string, any>>)
    : [];

  const combinedUsersMap = new Map<string, {
    id: string;
    email: string;
    name: string;
    role: string;
    lastLogin: string;
    status: string;
  }>();

  // Include current logged in user first if available
  if (defaultAdminEmail) {
    combinedUsersMap.set(defaultAdminEmail.toLowerCase(), {
      id: currentUser.id || "admin-current",
      email: defaultAdminEmail,
      name: defaultAdminName,
      role: currentUser.role || "Admin",
      lastLogin: "Active Now",
      status: "Active",
    });
  }

  // Add backend users
  fetchedItems.forEach((u) => {
    const email = String(u.email || u.attributes?.email || "");
    if (!email) return;
    const cleanEmail = email.toLowerCase();
    const name = String(u.name || u.attributes?.name || email.split("@")[0]);
    const role = String(
      u.role || u.attributes?.role || ((u.is_superuser || u.is_staff) ? "Admin" : "Member")
    );
    const userId = String(u.id || u.attributes?.id || "");
    combinedUsersMap.set(cleanEmail, {
      id: userId,
      email,
      name,
      role: role.charAt(0).toUpperCase() + role.slice(1),
      lastLogin: u.last_login ? new Date(String(u.last_login)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Active Now",
      status: u.is_active !== false ? "Active" : "Suspended",
    });
  });

  // Add newly created local users
  localUsers.forEach((u) => {
    if (u.email) {
      combinedUsersMap.set(String(u.email).toLowerCase(), {
        id: String(u.id || ""),
        email: String(u.email),
        name: String(u.name || ""),
        role: String(u.role || "Member"),
        lastLogin: String(u.lastLogin || "Active Now"),
        status: String(u.status || "Active"),
      });
    }
  });

  const userList = Array.from(combinedUsersMap.values()).map((u) => ({
    ...u,
    status: suspendedEmails.includes(u.email)
      ? (u.status === "Active" ? "Suspended" : "Active")
      : u.status,
  }));

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newName || !newPassword) {
      setErrorMsg("Please fill in all required fields (Full Name, Work Email, Role, Password).");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const chosenRole = activeRoleName;

    try {
      // Send creation request to Django API
      const payload = {
        data: {
          type: "users",
          attributes: {
            name: newName,
            email: newEmail,
            password: newPassword,
            role: chosenRole,
          },
        },
      };

      const res: any = await api.post("/users", payload);
      const createdId = res?.data?.id || res?.data?.data?.id || res?.id || "";

      const newUserObj = {
        id: createdId,
        email: newEmail,
        name: newName,
        role: chosenRole,
        lastLogin: "Created Just Now",
        status: "Active",
      };

      setLocalUsers((prev) => [...prev, newUserObj]);
      setSuccessMsg(`User ${newName} successfully created! Credentials and setup instructions have been emailed to ${newEmail}.`);
      
      // Invalidate API queries to refresh backend user list
      queryClient.invalidateQueries({ queryKey: qk.users() });
      refetch();

      setTimeout(() => {
        setSubmitting(false);
        setModalOpen(false);
        setNewEmail("");
        setNewName("");
        setNewPassword("");
        setSuccessMsg(null);
      }, 1500);
    } catch (err: any) {
      const msg =
        err?.response?.data?.errors?.[0]?.detail ||
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to create user account. Please check the email address or credentials.";
      setErrorMsg(msg);
      setSubmitting(false);
    }
  };

  const handleToggleStatus = (email: string) => {
    setSuspendedEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };

  const handleConfirmDeleteUser = async (userToDelete: { id?: string; email: string; name: string }) => {
    if (!isAdmin) {
      setErrorMsg("You do not have administrative permission to remove users.");
      setDeleteConfirmUser(null);
      return;
    }
    setDeleting(true);
    try {
      let targetId = userToDelete.id;
      if (!targetId || targetId === "admin-current") {
        const found = fetchedItems.find((u: any) => {
          const e = String(u.email || u.attributes?.email || "").toLowerCase();
          return e === userToDelete.email.toLowerCase();
        });
        if (found) {
          targetId = String(found.id || found.attributes?.id || "");
        }
      }

      if (targetId && targetId !== "admin-current") {
        await api.delete(`/users/${targetId}`);
      } else {
        await api.delete(`/users/${encodeURIComponent(userToDelete.email)}`);
      }
      setLocalUsers((prev) => prev.filter((u) => u.email.toLowerCase() !== userToDelete.email.toLowerCase()));
      setSuspendedEmails((prev) => prev.filter((e) => e.toLowerCase() !== userToDelete.email.toLowerCase()));
      setSuccessMsg(`User ${userToDelete.name || userToDelete.email} was removed successfully.`);
      queryClient.invalidateQueries({ queryKey: qk.users() });
      refetch();
    } catch (err: any) {
      console.warn("Backend user deletion failed:", err);
      const msg =
        err?.response?.data?.errors?.[0]?.detail ||
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to remove user account. Permission denied.";
      setErrorMsg(msg);
    } finally {
      setDeleting(false);
      setDeleteConfirmUser(null);
    }
  };

  return (
    <AppShell
      title="User Management & Role-Based Access"
      subtitle="Manage team members, multi-cloud audit permissions, and administrator credentials"
      actions={
        isAdmin ? (
          <button
            onClick={() => {
              setErrorMsg(null);
              setSuccessMsg(null);
              setModalOpen(true);
            }}
            className="inline-flex h-10 min-w-[170px] items-center justify-center gap-2 rounded-lg bg-primary px-6 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95 cursor-pointer"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Add Team Member</span>
          </button>
        ) : (
          <div className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-xs font-semibold text-muted-foreground">
            <span>Read-Only Audit Mode</span>
          </div>
        )
      }
    >
      {/* ── Users Table ── */}
      <Panel index={0} className="p-0">
        <DataTable
          head={[
            "User Profile",
            "Email Address",
            "Role & Permissions",
            "Last Login",
            "Account Status",
            "Actions",
          ]}
        >
          {userList.map((u, i) => (
            <Row key={u.email} index={i}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 font-display text-[11px] font-bold text-foreground ring-1 ring-border">
                    {u.name
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .toUpperCase()}
                  </div>
                  <span className="text-xs font-semibold text-foreground">
                    {u.name}
                  </span>
                </div>
              </td>
              <td className="mono text-xs text-muted-foreground px-4 py-3">
                {u.email}
              </td>
              <td className="px-4 py-3">
                <Chip
                  tone={
                    u.role.includes("Admin") || u.role.includes("Owner")
                      ? "critical"
                      : u.role.includes("Analyst") || u.role === "Member"
                        ? "primary"
                        : "neutral"
                  }
                >
                  {u.role}
                </Chip>
              </td>
              <td className="mono text-[11px] text-muted-foreground px-4 py-3">
                {u.lastLogin}
              </td>
              <td className="px-4 py-3">
                <Chip tone={u.status === "Active" ? "success" : "neutral"}>
                  <Dot tone={u.status === "Active" ? "success" : "neutral"} />
                  {u.status}
                </Chip>
              </td>
              <td className="px-4 py-3">
                {isAdmin ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleStatus(u.email)}
                      className="inline-flex h-7 items-center justify-center rounded bg-surface-2 px-3 text-xs font-medium text-foreground hover:bg-surface-2/80 transition-colors cursor-pointer"
                    >
                      {u.status === "Active" ? "Suspend" : "Activate"}
                    </button>

                    {u.email.toLowerCase() !== defaultAdminEmail.toLowerCase() && (
                      <button
                        onClick={() => setDeleteConfirmUser({ id: u.id, email: u.email, name: u.name })}
                        className="inline-flex h-7 items-center justify-center gap-1 rounded bg-rose-500/10 border border-rose-500/20 px-2.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
                        title="Remove User Account"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground italic">View Only</span>
                )}
              </td>
            </Row>
          ))}
        </DataTable>
      </Panel>

      {/* ── Add User Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                <h3 className="font-display text-sm font-bold text-foreground">
                  Add Team Member &amp; Dynamic Role Scope
                </h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="section-label mb-1.5 block font-semibold text-foreground">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jane Doe"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-foreground outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="section-label mb-1.5 block font-semibold text-foreground">Work Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. jane.doe@company.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-foreground outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* ── 1. Access Level / Permission Tier ── */}
              <div>
                <label className="section-label mb-1.5 block font-semibold text-foreground">
                  1. Permission &amp; Access Tier *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    {
                      tier: "Auditor" as const,
                      title: "Read-Only Auditor",
                      badge: "With Full AI & Remediation Access",
                      desc: "Read-only audit of posture & compliance, with full access to Spectra AI and Aegis Remediation Playbooks.",
                    },
                    {
                      tier: "Member" as const,
                      title: "Security Analyst",
                      badge: "Security Operations",
                      desc: "Operational access: run cloud scans, triage findings, and execute approved remediations.",
                    },
                    {
                      tier: "Admin" as const,
                      title: "Administrator",
                      badge: "Full System Control",
                      desc: "Full administrative control, manage users, cloud provider credentials, and tenant configuration.",
                    },
                  ].map((t) => (
                    <button
                      key={t.tier}
                      type="button"
                      onClick={() => setRoleTier(t.tier)}
                      className={`flex flex-col text-left p-3 rounded-xl border transition-all cursor-pointer ${
                        roleTier === t.tier
                          ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                          : "border-border bg-surface-2 hover:border-border/80"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className={`font-bold text-xs ${roleTier === t.tier ? "text-primary" : "text-foreground"}`}>
                          {t.title}
                        </span>
                      </div>
                      <span className="mt-0.5 inline-block text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                        {t.badge}
                      </span>
                      <span className="mt-1 text-[10px] text-muted-foreground leading-tight">
                        {t.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── 2. Multi-Cloud Provider Scope (Dynamic Selection) ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="section-label font-semibold text-foreground flex items-center gap-1.5">
                    <Cloud className="h-3.5 w-3.5 text-primary" />
                    <span>2. Multi-Cloud Provider Scope *</span>
                    <span className="text-[10px] text-muted-foreground font-normal">
                      (Select one or multiple clouds)
                    </span>
                  </label>
                  {roleTier !== "Admin" && (
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={handleSelectAllClouds}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                          selectedClouds.length === CLOUD_PROVIDER_OPTIONS.length
                            ? "bg-primary text-primary-foreground"
                            : "bg-surface-2 text-muted-foreground hover:text-foreground border border-border"
                        }`}
                      >
                        All Clouds (Fleet)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedClouds(["azure"])}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-surface-2 text-muted-foreground hover:text-foreground border border-border transition-colors cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>
                  )}
                </div>

                {roleTier === "Admin" ? (
                  <div className="rounded-xl border border-border/80 bg-surface-2/40 p-3 text-xs text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>Administrators automatically have unrestricted visibility across all connected clouds and services.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {CLOUD_PROVIDER_OPTIONS.map((cloud) => {
                      const isSelected = selectedClouds.includes(cloud.id);
                      const isConnected =
                        connectedCloudSet.has(cloud.id) ||
                        (cloud.id === "oraclecloud" && (connectedCloudSet.has("oci") || connectedCloudSet.has("oraclecloud")));

                      return (
                        <div
                          key={cloud.id}
                          onClick={() => toggleCloud(cloud.id)}
                          className={`relative flex flex-col justify-between p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                              : "border-border bg-surface-2 hover:border-border/80 hover:bg-surface-2/80 opacity-70"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-bold text-xs text-foreground truncate">
                              {cloud.name}
                            </span>
                            <div
                              className={`flex h-4 w-4 items-center justify-center rounded border transition-colors shrink-0 ${
                                isSelected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-muted-foreground/40 bg-surface"
                              }`}
                            >
                              {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                            </div>
                          </div>

                          <div className="mt-2 flex items-center justify-between text-[10px]">
                            <span className="font-mono text-muted-foreground">
                              {cloud.short}
                            </span>
                            {isConnected ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                Connected
                              </span>
                            ) : (
                              <span className="text-muted-foreground/60 text-[9px]">Available</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {roleTier !== "Admin" && (
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                    <span>
                      Selected Scope ({selectedClouds.length}):{" "}
                      <strong className="text-foreground">
                        {selectedClouds.length === CLOUD_PROVIDER_OPTIONS.length
                          ? "All Fleet Clouds"
                          : selectedClouds.map((id) => CLOUD_PROVIDER_OPTIONS.find((c) => c.id === id)?.short).join(", ")}
                      </strong>
                    </span>
                    <span className="text-[10px] text-muted-foreground">Click to toggle clouds</span>
                  </div>
                )}
              </div>

              {/* ── 3. Compliance Framework Boundary (Dynamic Selection) ── */}
              <div>
                <label className="section-label mb-1.5 block font-semibold text-foreground flex items-center justify-between">
                  <span>3. Compliance Standard Scope *</span>
                  {roleTier === "Admin" && (
                    <span className="text-[10px] text-muted-foreground font-normal">All Standards for Admins</span>
                  )}
                </label>
                <select
                  disabled={roleTier === "Admin"}
                  value={roleTier === "Admin" ? "ALL" : frameworkScope}
                  onChange={(e) => setFrameworkScope(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-foreground outline-none focus:border-primary disabled:opacity-50"
                >
                  {FRAMEWORK_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* ── 4. Live Dynamic Role Preview Card ── */}
              <div className="rounded-xl border border-border/80 bg-surface-2/70 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span>Dynamic Role Assignment Preview</span>
                  </span>
                  <span className="rounded-md bg-primary/10 border border-primary/30 px-2.5 py-0.5 text-xs font-bold text-primary">
                    {activeRoleName}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Cloud className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                    <span>
                      Clouds:{" "}
                      <strong className="text-foreground">
                        {roleTier === "Admin"
                          ? "All Fleet Clouds"
                          : selectedClouds.length === CLOUD_PROVIDER_OPTIONS.length
                          ? "All Fleet Clouds"
                          : selectedClouds.map((id) => CLOUD_PROVIDER_OPTIONS.find((c) => c.id === id)?.short).join(", ")}
                      </strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <span>
                      Standard:{" "}
                      <strong className="text-foreground">
                        {roleTier === "Admin"
                          ? "All Frameworks"
                          : FRAMEWORK_OPTIONS.find((f) => f.value === frameworkScope)?.label || frameworkScope}
                      </strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>
                      AI &amp; Remediation:{" "}
                      <strong className="text-emerald-400 font-bold">
                        ✓ Full Access (Spectra &amp; Aegis)
                      </strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    <span>
                      Permissions:{" "}
                      <strong className="text-foreground">
                        {roleTier === "Auditor"
                          ? "Read-Only (No Scans/Edits)"
                          : roleTier === "Member"
                          ? "Analyst (Scans & AI)"
                          : "Full Administrator"}
                      </strong>
                    </span>
                  </div>
                </div>
                <div className="pt-1.5 border-t border-border/60 flex items-center justify-between text-[11px]">
                  <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
                    <input
                      type="checkbox"
                      checked={isCustomRole}
                      onChange={(e) => {
                        setIsCustomRole(e.target.checked);
                        if (e.target.checked && !customRoleName) {
                          setCustomRoleName(computedRole);
                        }
                      }}
                      className="rounded border-border text-primary focus:ring-0"
                    />
                    <span>Customize role name manually</span>
                  </label>
                  {isCustomRole && (
                    <input
                      type="text"
                      value={customRoleName}
                      onChange={(e) => setCustomRoleName(e.target.value)}
                      placeholder={computedRole}
                      className="h-7 w-48 rounded border border-border bg-surface px-2 text-xs text-foreground outline-none focus:border-primary"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="section-label mb-1.5 block font-semibold text-foreground">
                  Initial Password *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    placeholder="Set initial password for account (min 8 characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface-2 pl-3 pr-10 text-foreground outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Credentials and instructions will be emailed to the user via SendGrid. They will be prompted to change their password on first login and complete 2FA setup.
                </p>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="h-9 rounded-lg border border-border bg-surface-2 px-5 text-xs text-foreground hover:bg-surface-2/80 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !newEmail || !newName || !newPassword}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-40 cursor-pointer"
                >
                  <span>{submitting ? "Creating User..." : "Create User Account"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Remove User Modal ── */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 border-b border-border pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display text-sm font-bold text-foreground">Remove User Account</h3>
                <p className="text-[11px] text-muted-foreground">Permanent access revocation</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to remove <strong className="text-foreground">{deleteConfirmUser.name}</strong> (<span className="mono font-semibold">{deleteConfirmUser.email}</span>) from your organization? This user will no longer be able to log in.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
              <button
                onClick={() => setDeleteConfirmUser(null)}
                className="h-8 rounded-lg border border-border bg-surface-2 px-4 text-xs font-medium text-foreground hover:bg-surface-2/80 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmDeleteUser(deleteConfirmUser)}
                disabled={deleting}
                className="inline-flex h-8 items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
              >
                {deleting ? "Removing..." : "Remove User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

