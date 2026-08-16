import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Lock,
  Mail,
  ArrowRight,
  Building,
  User,
  AlertCircle,
} from "lucide-react";
import { ShieldMark } from "@/components/brand/Logo";
import { authStore } from "@/lib/auth";

export const Route = createFileRoute("/sign-up")({
  component: SignUpPage,
});

function SignUpPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");
  const [password, setPassword] = useState("");
  const [cloud, setCloud] = useState("Multi-Cloud");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authStore.signUp(email, password, name, org);
      navigate({ to: "/" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength = Math.min(
    100,
    (password.length > 8 ? 40 : 10) +
      (/[A-Z]/.test(password) ? 20 : 0) +
      (/[0-9]/.test(password) ? 20 : 0) +
      (/[^A-Za-z0-9]/.test(password) ? 20 : 0)
  );

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4 overflow-hidden">
      {/* Background Atmosphere */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <div className="enter-stagger relative w-full max-w-md">
        {/* Brand Header */}
        <div className="mb-5 text-center">
          <div className="inline-flex items-center justify-center">
            <ShieldMark size={44} />
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
            DIGITAL <span className="text-primary">CISO</span>
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Register Organization Tenant
          </p>
        </div>

        {/* Sign Up Card */}
        <div className="glass-card holo-border p-6 shadow-2xl backdrop-blur-2xl">
          <h2 className="font-display text-sm font-bold text-foreground">
            Create Enterprise Account
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Deploy autonomous AI security across your infrastructure
          </p>

          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-critical/30 bg-critical/10 px-3 py-2 text-xs text-critical">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs">
            <div>
              <label className="section-label mb-1.5 block">Full Name</label>
              <div className="relative">
                <User className="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-surface-2/60 pr-3 pl-9 text-xs text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
                />
              </div>
            </div>

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

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="section-label mb-1.5 block">Organization</label>
                <div className="relative">
                  <Building className="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    required
                    value={org}
                    onChange={(e) => setOrg(e.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-surface-2/60 pr-3 pl-9 text-xs text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="section-label mb-1.5 block">Primary Cloud</label>
                <select
                  value={cloud}
                  onChange={(e) => setCloud(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-surface-2/60 px-3 text-xs text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
                >
                  <option>Multi-Cloud</option>
                  <option>Amazon AWS</option>
                  <option>Microsoft Azure</option>
                  <option>Google Cloud</option>
                  <option>Oracle Cloud (OCI)</option>
                  <option>Kubernetes</option>
                </select>
              </div>
            </div>

            <div>
              <label className="section-label mb-1.5 block">Master Password</label>
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
              {password && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full transition-all ${
                        passwordStrength > 70
                          ? "bg-success"
                          : passwordStrength > 40
                            ? "bg-high"
                            : "bg-critical"
                      }`}
                      style={{ width: `${passwordStrength}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {passwordStrength > 70
                      ? "Strong"
                      : passwordStrength > 40
                        ? "Moderate"
                        : "Weak"}
                  </span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-xs font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50"
            >
              <span>{loading ? "Creating Tenant..." : "Deploy Tenant"}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>

        {/* Sign In Link */}
        <div className="mt-4 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link to="/sign-in" className="font-semibold text-primary hover:underline">
            Sign In Here
          </Link>
        </div>
      </div>
    </div>
  );
}
