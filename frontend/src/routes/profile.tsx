import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Save,
  CheckCircle2,
  Key,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  PanelTitle,
  Chip,
} from "@/components/ui-kit/primitives";
import { useCurrentUser } from "@/hooks/use-api";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { data: user } = useCurrentUser();

  const [name, setName] = useState(user?.name || "Nadia Harding");
  const [email] = useState(user?.email || "n.harding@acme.io");
  const [title, setTitle] = useState("Chief Information Security Officer");
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Sync state if user data loads
  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <AppShell
      title="User Profile & Security Settings"
      subtitle="Manage your credentials, authentication factors, and security session parameters"
    >
      {savedSuccess && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-success/30 bg-success/10 p-3 text-xs font-semibold text-success">
          <span>✓ Profile settings updated successfully!</span>
          <button onClick={() => setSavedSuccess(false)}>✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── User Card ── */}
        <Panel index={0} holo glow="primary" className="p-5 text-center flex flex-col items-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface-2 font-display text-2xl font-bold text-foreground ring-1 ring-border shadow-md">
            NH
          </div>
          <h3 className="mt-3 font-display text-base font-bold text-foreground">
            {name}
          </h3>
          <p className="text-xs text-muted-foreground">{title}</p>
          <div className="mt-2">
            <Chip tone="critical">Security Administrator</Chip>
          </div>

          <div className="mt-6 w-full space-y-2 border-t border-border/80 pt-4 text-left text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Organization:</span>
              <span className="font-semibold text-foreground">{user?.company_name || "Acme Corp"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">MFA Status:</span>
              <span className="font-semibold text-success flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> FIDO2 WebAuthn
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Session:</span>
              <span className="mono text-muted-foreground">8 hours</span>
            </div>
          </div>
        </Panel>

        {/* ── Profile & Password Form ── */}
        <div className="space-y-6 lg:col-span-2">
          <Panel index={1} className="p-5">
            <PanelTitle
              title="Personal Information"
              hint="Update your organization identity attributes"
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
                <label className="section-label mb-1.5 block">Work Email</label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="h-9 w-full rounded-lg border border-border/50 bg-surface-2/30 px-3 text-muted-foreground outline-none cursor-not-allowed"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
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
              hint="Requires current master authentication factor"
            />

            <div className="mt-4 space-y-4 text-xs max-w-md">
              <div>
                <label className="section-label mb-1.5 block">Current Password</label>
                <input
                  type="password"
                  placeholder="••••••••••••"
                  className="h-9 w-full rounded-lg border border-border bg-surface-2/60 px-3 text-foreground outline-none"
                />
              </div>

              <div>
                <label className="section-label mb-1.5 block">New Password</label>
                <input
                  type="password"
                  placeholder="••••••••••••"
                  className="h-9 w-full rounded-lg border border-border bg-surface-2/60 px-3 text-foreground outline-none"
                />
              </div>

              <button
                type="button"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-5 text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary transition-colors"
              >
                <Key className="h-3.5 w-3.5" />
                <span>Change Password</span>
              </button>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
