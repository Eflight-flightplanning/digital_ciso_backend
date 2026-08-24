import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ShieldAlert,
  ClipboardCheck,
  GitBranch,
  Sparkles,
  ScrollText,
  Settings2,
  Radar,
  Boxes,
  Cloud,
  FileBarChart,
  Users,
  Plug,
  UserCog,
  Bell,
  Search,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeft,
  ChevronRight,
  LogOut,
  KeyRound,
  Database,
} from "lucide-react";
import { Wordmark } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";
import { authStore } from "@/lib/auth";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };
type NavSection = { label?: string; items: NavItem[] };

export const navSections: NavSection[] = [
  { items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "SaaS & ERP",
    items: [
      { to: "/oracle-saas", label: "Oracle Fusion SaaS", icon: Database },
    ],
  },
  {
    label: "Security",
    items: [
      { to: "/findings", label: "Findings", icon: ShieldAlert },
      { to: "/compliance", label: "Compliance", icon: ClipboardCheck },
      { to: "/attack-paths", label: "Attack Paths", icon: GitBranch },
    ],
  },
  {
    label: "AI Engines",
    items: [
      { to: "/ai/advisor", label: "Spectra (Analysis)", icon: Sparkles },
      { to: "/ai/decisions", label: "Aegis (Remediation)", icon: ScrollText },
      { to: "/ai/settings", label: "Model Settings", icon: Settings2 },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      { to: "/scans", label: "Scans", icon: Radar },
      { to: "/providers", label: "Cloud Providers", icon: Cloud },
    ],
  },
  { label: "Reporting", items: [{ to: "/reports", label: "Reports", icon: FileBarChart }] },
  {
    label: "Administration",
    items: [
      { to: "/users", label: "Users & Roles", icon: Users },
      { to: "/integrations", label: "Integrations", icon: Plug },
      { to: "/profile", label: "Profile", icon: UserCog },
    ],
  },
];

function useTheme() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem("theme") || localStorage.getItem("dciso-theme");
    const isDark = saved !== "light";
    setDark(isDark);
    document.documentElement.classList.toggle("light", !isDark);
  }, []);
  const toggle = () => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("light", !next);
      localStorage.setItem("theme", next ? "dark" : "light");
      localStorage.setItem("dciso-theme", next ? "dark" : "light");
      return next;
    });
  };
  return { dark, toggle };
}

function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-200 active:scale-95 cursor-pointer ${
        dark
          ? "border-white/15 bg-white/[0.05] text-amber-300 hover:bg-white/10"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 shadow-xs"
      }`}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [user, setUser] = useState<{ name?: string; role?: string } | null>(null);

  useEffect(() => {
    setUser(authStore.getState().user);
    const unsub = authStore.subscribe((s) => setUser(s.user));
    return unsub;
  }, []);

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 shrink-0",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-sidebar-border/80">
        {!collapsed && <Wordmark collapsed={collapsed} />}
        {!collapsed && (
          <button
            onClick={onToggle}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>
      {collapsed && (
        <button
          onClick={onToggle}
          className="mx-auto my-2.5 rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
          aria-label="Expand sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      )}

      {/* Nav List - lowered with generous top padding and relaxed item gaps */}
      <nav className="flex-1 space-y-1.5 overflow-y-auto px-2.5 pt-5 pb-5">
        {navSections.map((section, si) => (
          <div key={si} className={cn(si > 0 && "mt-4 border-t border-sidebar-border/60 pt-3.5")}>
            {section.label && !collapsed && (
              <div className="section-label px-2.5 pb-2 text-[10px] tracking-wider text-muted-foreground/80 font-bold uppercase">
                {section.label}
              </div>
            )}
            {section.items.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150",
                    active
                      ? "bg-primary/12 text-primary font-semibold shadow-xs"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-primary transition-all",
                      active ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User Profile Footer */}
      <div className={cn("border-t border-sidebar-border p-3", collapsed && "flex justify-center")}>
        <Link to="/profile" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 font-display text-[11px] font-bold text-primary ring-1 ring-primary/30">
            {(user?.name || "SA").slice(0, 2).toUpperCase()}
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">{user?.name || "Security Administrator"}</span>
              <span className="block text-[10px] text-muted-foreground">{user?.role || "CISO"}</span>
            </span>
          )}
          {!collapsed && <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />}
        </Link>
      </div>
    </aside>
  );
}

function Breadcrumbs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const crumbs = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const labels = parts.map((p) => p.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
    return ["Dashboard", ...labels];
  }, [pathname]);

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
          <span className={cn(i === crumbs.length - 1 && "font-semibold text-foreground")}>{c}</span>
        </span>
      ))}
    </div>
  );
}

function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const navigate = useNavigate();
  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search findings, resources, pages…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {navSections.map((s, i) => (
          <CommandGroup key={i} heading={s.label ?? "Overview"}>
            {s.items.map((item) => (
              <CommandItem
                key={item.to}
                value={item.label}
                onSelect={() => {
                  setOpen(false);
                  navigate({ to: item.to });
                }}
              >
                <item.icon className="mr-2 h-4 w-4 text-primary" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

export function AppShell({
  children,
  title,
  subtitle,
  actions,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ name?: string; email?: string } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("access_token");
      if (!token) {
        navigate({ to: "/sign-in" });
        return;
      }
      try {
        const raw = localStorage.getItem("auth_user");
        if (raw) setCurrentUser(JSON.parse(raw));
      } catch {}
    }
  }, [navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key?.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/70 px-4 backdrop-blur-xl">
          <Breadcrumbs />
          <button
            onClick={() => setPaletteOpen(true)}
            className="ml-auto flex h-8 items-center gap-2 rounded-lg border border-border bg-surface-2/50 px-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="mono hidden rounded border border-border px-1 text-[10px] sm:inline">⌘K</kbd>
          </button>
          <ThemeToggle />
          <button className="relative text-muted-foreground transition-colors hover:text-foreground" aria-label="Notifications">
            <Bell className="h-4 w-4" />
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[9px] font-bold text-background">
              7
            </span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 font-display text-[11px] font-bold text-primary ring-1 ring-primary/40">
                {currentUser?.email ? currentUser.email.slice(0, 2).toUpperCase() : "AD"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs">
                <span className="font-bold block">{currentUser?.name || "Security Admin"}</span>
                <span className="text-[10px] text-muted-foreground font-mono">{currentUser?.email || "admin@securityplatform.com"}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/profile">
                  <UserCog className="mr-2 h-3.5 w-3.5" /> Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/ai/settings">
                  <KeyRound className="mr-2 h-3.5 w-3.5" /> API Keys
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <button
                  onClick={() => {
                    localStorage.removeItem("access_token");
                    localStorage.removeItem("auth_user");
                    localStorage.removeItem("refresh_token");
                    navigate({ to: "/sign-in" });
                  }}
                  className="flex w-full items-center px-2 py-1.5 text-xs text-critical hover:bg-critical/10 rounded cursor-pointer"
                >
                  <LogOut className="mr-2 h-3.5 w-3.5" /> Logout
                </button>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-6">
          {title && (
            <div className="enter-stagger mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl font-bold text-foreground">{title}</h1>
                {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
              </div>
              {actions}
            </div>
          )}
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} setOpen={setPaletteOpen} />
    </div>
  );
}
