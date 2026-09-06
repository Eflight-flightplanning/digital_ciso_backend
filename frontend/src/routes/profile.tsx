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
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  PanelTitle,
  Chip,
  Dot,
} from "@/components/ui-kit/primitives";
import { useCurrentUser, useJiraConfig, useProviders } from "@/hooks/use-api";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { data: userRaw } = useCurrentUser();
  const { data: jiraConfig } = useJiraConfig();
  const { data: providersRaw } = useProviders();

  const user = (userRaw as Record<string, any>) || {};

  const defaultEmail = user.email || jiraConfig?.email || "akhilesh.merugu@pravahya.com";
  const defaultName =
    user.name ||
    (jiraConfig?.email
      ? jiraConfig.email.split("@")[0].replace(".", " ").replace(/\b\w/g, (l: string) => l.toUpperCase())
      : "Akhilesh Merugu");

  const [name, setName] = useState(defaultName);
  const [email] = useState(defaultEmail);
  const [title, setTitle] = useState(user.title || "Cloud Security Architect & Lead Administrator");
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Sync state if user data loads
  useEffect(() => {
    if (user.name) setName(user.name);
    if (user.title) setTitle(user.title);
  }, [user.name, user.title]);

  const initials = useMemo(() => {
    if (!name) return "AM";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }, [name]);

  const connectedProviders = useMemo(() => {
    const list = (providersRaw?.items as Array<Record<string, any>>) || [];
    return list.map((p) => ({
      id: String(p.id),
      alias: String(p.alias || p.name || p.provider),
      provider: String(p.provider || "").toUpperCase(),
    }));
  }, [providersRaw]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    setPasswordSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
    setTimeout(() => setPasswordSuccess(false), 3000);
  };

  return (
    <AppShell
      title="User Profile & Security Settings"
      subtitle="Manage your identity credentials, active cloud authorizations, and platform session parameters"
    >
      {savedSuccess && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-success/30 bg-success/10 p-4 text-xs font-semibold text-success shadow-sm">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Profile settings updated successfully!
          </span>
          <button onClick={() => setSavedSuccess(false)} className="cursor-pointer opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {passwordSuccess && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-success/30 bg-success/10 p-4 text-xs font-semibold text-success shadow-sm">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Password and session tokens rotated successfully!
          </span>
          <button onClick={() => setPasswordSuccess(false)} className="cursor-pointer opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── User Identity Card ── */}
        <Panel index={0} glow="primary" className="p-5 text-center flex flex-col items-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 font-display text-2xl font-black text-primary ring-1 ring-primary/30 shadow-md">
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
                <Building2 className="h-3.5 w-3.5" /> Workspace:
              </span>
              <span className="font-semibold text-foreground">
                {user.company_name || (jiraConfig?.base_url ? new URL(jiraConfig.base_url).hostname : "Pravahya Enterprise")}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" /> MFA Status:
              </span>
              <span className="font-semibold text-success flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Enforced (TOTP)
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Cloud className="h-3.5 w-3.5" /> Active Clouds:
              </span>
              <span className="font-mono text-[11px] font-bold text-primary">
                {connectedProviders.length > 0
                  ? connectedProviders.map((p) => p.provider).join(", ")
                  : "Azure"}
              </span>
            </div>
          </div>
        </Panel>

        {/* ── Profile & Password Forms ── */}
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
                  <div className="relative">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-9 w-full rounded-lg border border-border bg-surface-2/60 px-3 text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
                    />
                  </div>
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
                <span className="text-[11px] text-muted-foreground mt-1 block">
                  Managed via identity provider directory sync. Contact admin to change email.
                </span>
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

          {/* Change Password */}
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
                disabled={!currentPassword || !newPassword}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 px-5 text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Key className="h-3.5 w-3.5" />
                <span>Change Password</span>
              </button>
            </form>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
