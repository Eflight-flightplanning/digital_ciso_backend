import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  UserPlus,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  Chip,
  Dot,
  DataTable,
  Row,
} from "@/components/ui-kit/primitives";
import { useUsers, useRoles, useCurrentUser, useJiraConfig } from "@/hooks/use-api";

export const Route = createFileRoute("/users")({
  component: UsersPage,
});

function UsersPage() {
  const { data: apiUsers, isLoading } = useUsers();
  const { data: apiRoles } = useRoles();
  const { data: currentUserRaw } = useCurrentUser();
  const { data: jiraConfig } = useJiraConfig();

  const currentUser = (currentUserRaw as Record<string, any>) || {};
  const defaultAdminEmail = currentUser.email || jiraConfig?.email || "akhilesh.merugu@pravahya.com";
  const defaultAdminName =
    currentUser.name ||
    (jiraConfig?.email
      ? jiraConfig.email.split("@")[0].replace(".", " ").replace(/\b\w/g, (l: string) => l.toUpperCase())
      : "Akhilesh Merugu");

  const [suspendedEmails, setSuspendedEmails] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("Member");
  const [inviting, setInviting] = useState(false);

  const rawUserList = (apiUsers?.items && apiUsers.items.length > 0)
    ? (apiUsers.items as Array<Record<string, any>>).map((u) => ({
        email: String(u.email || defaultAdminEmail),
        name: String(u.name || (u.email ? String(u.email).split("@")[0] : defaultAdminName)),
        role: String(u.role || ((u.is_superuser || u.is_staff) ? "Security Admin" : "Auditor")),
        lastLogin: u.last_login ? new Date(String(u.last_login)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Active Now",
        status: (u.is_active !== false ? "Active" : "Suspended") as "Active" | "Suspended",
      }))
    : [
        {
          email: defaultAdminEmail,
          name: defaultAdminName,
          role: "Security Admin",
          lastLogin: "Active Now",
          status: "Active" as const,
        },
      ];

  const userList = rawUserList.map((u) => ({
    ...u,
    status: suspendedEmails.includes(u.email)
      ? (u.status === "Active" ? "Suspended" : "Active")
      : u.status,
  }));

  const handleInvite = () => {
    if (!newEmail || !newName) return;
    setInviting(true);
    setTimeout(() => {
      setInviting(false);
      setModalOpen(false);
      setNewEmail("");
      setNewName("");
    }, 800);
  };

  const handleToggleStatus = (email: string) => {
    setSuspendedEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };

  return (
    <AppShell
      title="User Management & Role-Based Access"
      subtitle="Manage team members, multi-cloud audit permissions, and operator access levels"
      actions={
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex h-10 min-w-[170px] items-center justify-center gap-2 rounded-lg bg-primary px-6 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
        >
          <UserPlus className="h-3.5 w-3.5" />
          <span>Invite Team Member</span>
        </button>
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
                      .join("")}
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
                    u.role === "Admin"
                      ? "critical"
                      : u.role === "Member"
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
                <button
                  onClick={() => handleToggleStatus(u.email)}
                  className="inline-flex h-7 items-center justify-center rounded bg-surface-2 px-3 text-xs font-medium text-foreground hover:bg-surface-2/80 transition-colors"
                >
                  {u.status === "Active" ? "Suspend" : "Activate"}
                </button>
              </td>
            </Row>
          ))}
        </DataTable>
      </Panel>

      {/* ── Invite User Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                <h3 className="font-display text-sm font-bold text-foreground">
                  Invite Team Member
                </h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div>
                <label className="section-label mb-1.5 block">Full Name</label>
                <input
                  type="text"
                  placeholder="Jane Doe"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-foreground outline-none"
                />
              </div>

              <div>
                <label className="section-label mb-1.5 block">Work Email</label>
                <input
                  type="email"
                  placeholder="jane.doe@company.io"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-foreground outline-none"
                />
              </div>

              <div>
                <label className="section-label mb-1.5 block">Assigned Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-foreground outline-none"
                >
                  <option value="Admin">Admin (Full Control + Remediate)</option>
                  <option value="Member">Member (View & Triage Findings)</option>
                  <option value="Viewer">Viewer (Read-Only Access)</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
              <button
                onClick={() => setModalOpen(false)}
                className="h-9 rounded-lg border border-border bg-surface-2 px-5 text-xs text-foreground hover:bg-surface-2/80"
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={inviting || !newEmail || !newName}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-40"
              >
                <span>{inviting ? "Sending..." : "Send Invitation"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
