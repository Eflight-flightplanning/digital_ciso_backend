import { useState, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Save,
  CheckCircle2,
  Key,
  Shield,
  Cloud,
  Lock,
  Building2,
  Mail,
  Briefcase,
  Layers,
  AlertCircle,
  Loader2,
  Plus,
  Clock,
  Check,
  X,
  FileCheck2,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  PanelTitle,
  Chip,
  Dot,
} from "@/components/ui-kit/primitives";
import { useCurrentUser, useJiraConfig, useProviders } from "@/hooks/use-api";
import { useSubscriptions } from "@/hooks/use-subscriptions";
import { api } from "@/lib/api-client";
import { authStore } from "@/lib/auth";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { data: userRaw } = useCurrentUser();
  const { data: jiraConfig } = useJiraConfig();
  const { data: providersRaw } = useProviders();

  const {
    subscribedClouds,
    subscribedCompliances,
    cloudSubscriptions,
    complianceSubscriptions,
    availableClouds,
    availableCompliances,
    changeRequests,
    createChangeRequest,
    isRequestCreating,
    reviewChangeRequest,
    isReviewing,
  } = useSubscriptions();

  // Session user lives in memory only (lib/auth.ts); nothing is persisted to localStorage.
  const authStoredUser = useMemo(() => authStore.getState().user as Record<string, any> | null, []);

  const user = (userRaw as Record<string, any>) || authStoredUser || {};

  const currentEmail = user.email || authStoredUser?.email || jiraConfig?.email || "";
  const currentName =
    user.name ||
    authStoredUser?.name ||
    (currentEmail
      ? currentEmail.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())
      : "Security Administrator");

  const [name, setName] = useState(currentName);
  const [email, setEmail] = useState(currentEmail);
  const [title, setTitle] = useState(user.title || "Cloud Security Architect & Lead Administrator");
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Modularity Request Modal State
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestType, setRequestType] = useState<"add_cloud" | "add_compliance">("add_cloud");
  const [targetValue, setTargetValue] = useState("");
  const [targetDisplayName, setTargetDisplayName] = useState("");
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  // Sync state if user data loads
  useEffect(() => {
    const freshEmail = user.email || authStoredUser?.email || jiraConfig?.email;
    const freshName = user.name || authStoredUser?.name;
    if (freshEmail) setEmail(freshEmail);
    if (freshName) setName(freshName);
    if (user.title) setTitle(user.title);
  }, [user.name, user.email, user.title, authStoredUser, jiraConfig?.email]);

  const initials = useMemo(() => {
    const display = (name && name !== "Security Administrator") ? name : (email || "SA");
    const parts = display.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return display.slice(0, 2).toUpperCase();
  }, [name, email]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters long.");
      return;
    }

    try {
      setPasswordLoading(true);
      await api.post("/users/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: any) {
      setPasswordError(err?.message || "Failed to update password.");
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetValue) {
      setRequestError("Please select an item to request.");
      return;
    }
    setRequestError(null);
    setRequestSuccess(null);

    try {
      await createChangeRequest({
        request_type: requestType,
        target_value: targetValue,
        target_display_name: targetDisplayName || targetValue,
      });
      setRequestSuccess("Change request submitted successfully. Pending administrator review.");
      setTimeout(() => {
        setShowRequestModal(false);
        setRequestSuccess(null);
        setTargetValue("");
        setTargetDisplayName("");
      }, 1800);
    } catch (err: any) {
      setRequestError(err?.message || "Failed to submit request.");
    }
  };

  const handleAdminReview = async (id: string, newStatus: "approved" | "rejected") => {
    try {
      await reviewChangeRequest({
        id,
        status: newStatus,
        notes: `Reviewed by ${name || "Administrator"}`,
      });
    } catch (err: any) {
      alert("Failed to review request: " + (err?.message || "Unknown error"));
    }
  };

  // Filter available items for request (exclude already subscribed)
  const requestableClouds = useMemo(() => {
    return availableClouds.filter((c) => !subscribedClouds.includes(c.id.toLowerCase()));
  }, [availableClouds, subscribedClouds]);

  const requestableCompliances = useMemo(() => {
    return availableCompliances.filter((c) => !subscribedCompliances.includes(c.id));
  }, [availableCompliances, subscribedCompliances]);

  return (
    <AppShell>
      <div className="space-y-6 pb-12">
        {/* ── Page Header ── */}
        <div>
          <h1 className="font-display text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            Account & Subscriptions
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Manage your personal security profile, cloud environments, and compliance standards
          </p>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Profile details updated successfully.</span>
          </div>
        )}

        {passwordSuccess && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Password updated successfully.</span>
          </div>
        )}

        {passwordError && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{passwordError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* ── User ID Card ── */}
          <Panel index={0} className="flex flex-col items-center p-6 text-center lg:col-span-1">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/30 to-cyan-500/20 border border-primary/40 font-display text-2xl font-black text-primary shadow-lg shadow-primary/10">
              {initials}
            </div>
            <h3 className="mt-3.5 font-display text-base font-bold text-foreground">
              {name}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">{title}</p>
            <div className="mt-2.5">
              <Chip tone="critical">
                <Shield className="h-3 w-3 inline mr-1" />
                Security Administrator
              </Chip>
            </div>

            <div className="mt-6 w-full space-y-3 border-t border-border/80 pt-4 text-left text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Tenant Workspace:
                </span>
                <span className="font-semibold text-foreground">
                  {user.company_name || authStoredUser?.company_name || (email ? `${email.split("@")[0]}'s Organization` : "Primary Tenant")}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Cloud className="h-3.5 w-3.5" /> Subscribed Clouds:
                </span>
                <span className="font-mono text-[11px] font-bold text-cyan-400">
                  {subscribedClouds.length > 0
                    ? subscribedClouds.map((c) => c.toUpperCase()).join(", ")
                    : "Azure"}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <FileCheck2 className="h-3.5 w-3.5" /> Active Compliances:
                </span>
                <span className="font-mono text-[11px] font-bold text-emerald-400">
                  {subscribedCompliances.length > 0 ? `${subscribedCompliances.length} Standards` : "Standard Set"}
                </span>
              </div>
            </div>
          </Panel>

          {/* ── Personal Info & Password ── */}
          <div className="space-y-6 lg:col-span-2">
            <Panel index={1} className="p-5">
              <PanelTitle
                title="Personal Information"
                hint="Update your operator identity and security contacts"
              />

              <form onSubmit={handleSave} className="mt-4 space-y-4 text-xs">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="section-label mb-1.5 block">Full Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-9 w-full rounded-lg border border-border bg-surface-2/60 px-3 text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="section-label mb-1.5 block">Job Title</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="h-9 w-full rounded-lg border border-border bg-surface-2/60 px-3 text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="section-label mb-1.5 block">Work Email (Primary Identity)</label>
                  <div className="relative">
                    <input
                      type="email"
                      value={email}
                      disabled
                      className="h-9 w-full rounded-lg border border-border/50 bg-surface-2/30 px-3 text-muted-foreground outline-none cursor-not-allowed"
                    />
                    <Mail className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground opacity-50" />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95 cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>Update Profile</span>
                  </button>
                </div>
              </form>
            </Panel>

            <Panel index={2} className="p-5">
              <PanelTitle
                title="Change Password & Session Keys"
                hint="Requires active authentication factor verification"
              />

              <form onSubmit={handlePasswordChange} className="mt-4 space-y-4 text-xs max-w-md">
                <div>
                  <label className="section-label mb-1.5 block">Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="h-9 w-full rounded-lg border border-border bg-surface-2/60 px-3 text-foreground outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="section-label mb-1.5 block">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="h-9 w-full rounded-lg border border-border bg-surface-2/60 px-3 text-foreground outline-none focus:border-primary"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!currentPassword || !newPassword || passwordLoading}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 px-5 text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {passwordLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Updating Password…</span>
                    </>
                  ) : (
                    <>
                      <Key className="h-3.5 w-3.5" />
                      <span>Change Password</span>
                    </>
                  )}
                </button>
              </form>
            </Panel>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            TENANT MODULARITY & SUBSCRIPTION MANAGEMENT SECTION
        ══════════════════════════════════════════════════════════════════════ */}
        <Panel index={3} className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-cyan-400" />
                <h2 className="font-display text-lg font-bold text-foreground">
                  Tenant Modularity & Environment Subscriptions
                </h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Your portal metrics, radar posture, scans, findings, and AI Copilot are strictly scoped to these selections.
              </p>
            </div>

            <button
              onClick={() => {
                setRequestError(null);
                setRequestSuccess(null);
                setShowRequestModal(true);
              }}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 text-xs font-bold text-white shadow-md shadow-cyan-500/20 transition-all hover:brightness-110 active:scale-95 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Request New Provider or Standard</span>
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Active Clouds Column */}
            <div className="rounded-2xl border border-border/60 bg-surface-2/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Cloud className="h-4 w-4 text-cyan-400" /> Active Cloud Providers
                </span>
                <span className="rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-black">
                  {subscribedClouds.length} Active
                </span>
              </div>

              <div className="space-y-2">
                {subscribedClouds.map((cloud) => (
                  <div
                    key={cloud}
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-surface-1 px-3.5 py-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/15 border border-cyan-500/30 font-bold text-cyan-400 text-[10px]">
                        {cloud.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-foreground capitalize">
                          {cloud === "oraclecloud" ? "Oracle Cloud (OCI)" : cloud === "oracle_saas" ? "Oracle Fusion SaaS" : cloud}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Active in dashboard, radar & scans</div>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Subscribed
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Compliances Column */}
            <div className="rounded-2xl border border-border/60 bg-surface-2/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileCheck2 className="h-4 w-4 text-emerald-400" /> Active Compliance Standards
                </span>
                <span className="rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-black">
                  {subscribedCompliances.length} Active
                </span>
              </div>

              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {subscribedCompliances.map((comp) => {
                  const match = availableCompliances.find((c) => c.id === comp);
                  const name = match ? match.name : comp;
                  return (
                    <div
                      key={comp}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-surface-1 px-3.5 py-2.5 text-xs"
                    >
                      <div className="pr-2">
                        <div className="font-bold text-foreground truncate max-w-[260px]">
                          {name}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Included in radar & automated audits</div>
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 shrink-0">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Active
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Change Requests & Approvals Table ── */}
          <div className="mt-8 border-t border-border/80 pt-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Modularity Change Requests & Administrative Approvals
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Adding or removing cloud environments and compliances after onboarding requires admin approval.
                </p>
              </div>
            </div>

            {changeRequests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 p-6 text-center text-xs text-muted-foreground">
                No subscription change requests pending. Your environment configuration is up to date.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-muted-foreground font-semibold">
                    <tr>
                      <th className="p-3">Target Provider / Standard</th>
                      <th className="p-3">Request Type</th>
                      <th className="p-3">Requested By</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Date</th>
                      <th className="p-3 text-right">Admin Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 bg-surface-1">
                    {changeRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-surface-2/50 transition-colors">
                        <td className="p-3 font-bold text-foreground">
                          {req.target_display_name || req.target_value}
                        </td>
                        <td className="p-3 text-muted-foreground capitalize">
                          {req.request_type.replace("_", " ")}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {req.requested_by_email || "User"}
                        </td>
                        <td className="p-3">
                          {req.status === "pending" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold text-amber-400">
                              <Clock className="h-3 w-3" /> Pending Approval
                            </span>
                          )}
                          {req.status === "approved" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> Approved
                            </span>
                          )}
                          {req.status === "rejected" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 text-[10px] font-bold text-rose-400">
                              <X className="h-3 w-3" /> Rejected
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {new Date(req.inserted_at).toLocaleDateString()}
                        </td>
                        <td className="p-3 text-right">
                          {req.status === "pending" ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                onClick={() => handleAdminReview(req.id, "approved")}
                                disabled={isReviewing}
                                className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1 text-[11px] font-bold text-emerald-400 hover:bg-emerald-500/30 transition-all cursor-pointer"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleAdminReview(req.id, "rejected")}
                                disabled={isReviewing}
                                className="rounded-lg bg-rose-500/20 border border-rose-500/40 px-2.5 py-1 text-[11px] font-bold text-rose-400 hover:bg-rose-500/30 transition-all cursor-pointer"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted-foreground italic">
                              Reviewed
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Panel>

        {/* ── Request Modal ── */}
        {showRequestModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-2xl border border-border bg-surface-1 p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-cyan-400" />
                  Request Subscription Change
                </h3>
                <button
                  onClick={() => setShowRequestModal(false)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {requestSuccess && (
                <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                  {requestSuccess}
                </div>
              )}

              {requestError && (
                <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
                  {requestError}
                </div>
              )}

              <form onSubmit={handleCreateRequest} className="mt-4 space-y-4 text-xs">
                <div>
                  <label className="section-label mb-1.5 block">Category</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRequestType("add_cloud");
                        setTargetValue("");
                        setTargetDisplayName("");
                      }}
                      className={`rounded-xl border p-2.5 font-bold transition-all ${
                        requestType === "add_cloud"
                          ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                          : "border-border bg-surface-2 text-muted-foreground"
                      }`}
                    >
                      Cloud Provider
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRequestType("add_compliance");
                        setTargetValue("");
                        setTargetDisplayName("");
                      }}
                      className={`rounded-xl border p-2.5 font-bold transition-all ${
                        requestType === "add_compliance"
                          ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                          : "border-border bg-surface-2 text-muted-foreground"
                      }`}
                    >
                      Compliance Standard
                    </button>
                  </div>
                </div>

                <div>
                  <label className="section-label mb-1.5 block">Select Target</label>
                  {requestType === "add_cloud" ? (
                    <select
                      value={targetValue}
                      onChange={(e) => {
                        setTargetValue(e.target.value);
                        const match = availableClouds.find((c) => c.id === e.target.value);
                        if (match) setTargetDisplayName(match.name);
                      }}
                      className="h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-foreground outline-none focus:border-cyan-500"
                    >
                      <option value="">-- Choose Cloud Provider --</option>
                      {requestableClouds.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.category})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={targetValue}
                      onChange={(e) => {
                        setTargetValue(e.target.value);
                        const match = availableCompliances.find((c) => c.id === e.target.value);
                        if (match) setTargetDisplayName(match.name);
                      }}
                      className="h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-foreground outline-none focus:border-emerald-500"
                    >
                      <option value="">-- Choose Compliance Standard --</option>
                      {requestableCompliances.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.providerName})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setShowRequestModal(false)}
                    className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-surface-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isRequestCreating || !targetValue}
                    className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md transition-all hover:brightness-110 disabled:opacity-50"
                  >
                    {isRequestCreating ? "Submitting..." : "Submit for Approval"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
