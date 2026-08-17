import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import { ShieldMark } from "@/components/brand/Logo";
import { authStore } from "@/lib/auth";

export const Route = createFileRoute("/sign-in")({
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authStore.signIn(email, password);
      navigate({ to: "/findings" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid credentials";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4 overflow-hidden">
      {/* Background Animated Atmosphere */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <div className="enter-stagger relative w-full max-w-md">
        {/* Brand Header */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center">
            <ShieldMark size={44} />
          </div>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-foreground">
            DIGITAL <span className="text-primary">CISO</span>
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Autonomous Cloud Security Operations
          </p>
        </div>

        {/* Sign In Card */}
        <div className="glass-card holo-border p-6 shadow-2xl backdrop-blur-2xl">
          <h2 className="font-display text-sm font-bold text-foreground">
            Sign In to Console
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Enter authorized security credentials to proceed
          </p>

          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-critical/30 bg-critical/10 px-3 py-2 text-xs text-critical">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-xs">
            <div>
              <label className="section-label mb-1.5 block">Work Email</label>
              <div className="relative">
                <Mail className="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-surface-2/60 pr-3 pl-9 text-xs text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="section-label">Master Password</label>
                <a href="#" className="text-[11px] text-primary hover:underline font-medium">
                  Forgot Password?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-surface-2/60 pr-3 pl-9 text-xs text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" defaultChecked className="accent-primary" />
                <span>Remember session for 30 days</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-xs font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50"
            >
              <span>{loading ? "Authenticating Session..." : "Sign In to Command Console"}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Quick Demo Login Helpers */}
          <div className="mt-5 border-t border-border/60 pt-3.5">
            <p className="text-[11px] font-semibold text-muted-foreground mb-2">Quick Sign-In Credentials:</p>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  setEmail("meruguakhilesh.98@gmail.com");
                  setPassword("Admin@12345");
                }}
                className="w-full flex items-center justify-between rounded-lg border border-border/80 bg-surface-2/60 px-3 py-1.5 text-[11px] text-foreground hover:bg-surface-2 hover:border-primary/40 transition-all text-left"
              >
                <div>
                  <span className="font-semibold text-primary">meruguakhilesh.98@gmail.com</span>
                  <span className="text-muted-foreground block text-[10px]">Primary Admin Tenant (170+ Findings)</span>
                </div>
                <span className="text-[10px] font-mono bg-surface-3 px-1.5 py-0.5 rounded border border-border/60">Admin@12345</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEmail("admin@securityplatform.com");
                  setPassword("Admin@12345");
                }}
                className="w-full flex items-center justify-between rounded-lg border border-border/80 bg-surface-2/60 px-3 py-1.5 text-[11px] text-foreground hover:bg-surface-2 hover:border-primary/40 transition-all text-left"
              >
                <div>
                  <span className="font-semibold text-foreground">admin@securityplatform.com</span>
                  <span className="text-muted-foreground block text-[10px]">Global SecOps Administrator</span>
                </div>
                <span className="text-[10px] font-mono bg-surface-3 px-1.5 py-0.5 rounded border border-border/60">Admin@12345</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sign Up Link */}
        <div className="mt-4 text-center text-xs text-muted-foreground">
          Don't have an enterprise account?{" "}
          <Link to="/sign-up" className="font-semibold text-primary hover:underline">
            Register Organization
          </Link>
        </div>
      </div>
    </div>
  );
}
