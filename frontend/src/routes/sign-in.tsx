import { useState, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Lock,
  Mail,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Eye,
  EyeOff,
  Sun,
  Moon,
  ShieldCheck,
  CheckCircle2,
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
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── Theme State ── */
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem("dciso-theme");
    const dark = saved !== "light";
    setIsDark(dark);
    document.documentElement.classList.toggle("light", !dark);
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("light", !next);
      localStorage.setItem("dciso-theme", next ? "dark" : "light");
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authStore.signIn(email, password);
      navigate({ to: "/dashboard" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid credentials";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`relative flex min-h-screen flex-col justify-between font-sans antialiased overflow-hidden transition-colors duration-300 ${
        isDark ? "bg-background text-foreground" : "bg-background text-foreground"
      }`}
    >
      {/* ── Background Gradients & Ambient Dot Drift ── */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className={`absolute -left-40 top-[-10%] h-[34rem] w-[34rem] rounded-full blur-[140px] ${isDark ? "bg-[#0A6EDD]/20" : "bg-[#0A6EDD]/15"}`} />
        <div className={`absolute -right-32 top-[15%] h-[30rem] w-[30rem] rounded-full blur-[140px] ${isDark ? "bg-cyan-500/15" : "bg-cyan-500/12"}`} />
        <div
          className={`absolute inset-0 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)] ${
            isDark
              ? "bg-[radial-gradient(circle,rgba(255,255,255,0.035)_1px,transparent_1px)]"
              : "bg-[radial-gradient(circle,rgba(15,23,42,0.06)_1px,transparent_1px)]"
          } bg-[size:24px_24px]`}
        />
      </div>

      {/* ── Top Utility Bar: Back Link & Theme Switcher ── */}
      <header className="relative z-10 mx-auto flex w-full max-w-[1400px] items-center justify-between p-6 sm:px-10">
        <Link
          to="/"
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition-all hover:-translate-y-0.5 active:scale-95 ${
            isDark
              ? "border-white/15 bg-white/[0.04] text-slate-300 hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
              : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 shadow-xs"
          }`}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Overview</span>
        </Link>

        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-200 active:scale-95 cursor-pointer ${
            isDark
              ? "border-white/15 bg-white/[0.05] text-amber-300 hover:bg-white/10"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 shadow-xs"
          }`}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      {/* ── Main Authentication Form Card ── */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-[460px]">
          {/* Brand Header */}
          <div className="mb-6 text-center">
            <Link to="/" className="inline-flex items-center justify-center transition-transform hover:scale-105">
              <ShieldMark size={48} />
            </Link>
            <h1 className={`mt-3.5 text-2xl font-black tracking-tight leading-none ${isDark ? "text-white" : "text-slate-950"}`}>
              DIGITAL <span className="text-primary font-black">CISO</span>
            </h1>
            <p className="mt-1 text-xs font-bold text-primary tracking-wide">
              AI Cloud Security
            </p>
          </div>

          {/* Glass Card */}
          <div
            className={`overflow-hidden rounded-3xl p-7 sm:p-8 transition-all ${
              isDark
                ? "border border-white/15 bg-white/[0.04] backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
                : "border border-slate-200/90 bg-white/95 backdrop-blur-2xl shadow-[0_20px_50px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/5"
            }`}
          >
            {/* Card Header */}
            <div className={`border-b pb-4 ${isDark ? "border-white/10" : "border-slate-200"}`}>
              <div className="flex items-center justify-between">
                <h2 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-950"}`}>
                  Sign In to Console
                </h2>
                <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${isDark ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-300 text-emerald-700"}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Secure Gate
                </span>
              </div>
              <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600 font-medium"}`}>
                Enter authorized security credentials to proceed
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-500">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-xs">
              <div>
                <label className={`mb-1.5 block font-bold uppercase tracking-wider text-[11px] ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Work Email
                </label>
                <div className="relative">
                  <Mail className={`absolute top-3 left-3.5 h-4 w-4 ${isDark ? "text-slate-500" : "text-slate-400"}`} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className={`h-11 w-full rounded-xl border pr-3.5 pl-10 text-xs font-medium outline-none transition-all ${
                      isDark
                        ? "border-white/10 bg-white/[0.03] text-white placeholder-slate-500 focus:border-cyan-500 focus:bg-white/[0.06] focus:ring-2 focus:ring-cyan-500/20"
                        : "border-slate-300 bg-slate-50/70 text-slate-900 placeholder-slate-400 focus:border-cyan-600 focus:bg-white focus:ring-2 focus:ring-cyan-500/20"
                    }`}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={`font-bold uppercase tracking-wider text-[11px] ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    Master Password
                  </label>
                  <a href="#" className="text-[11px] text-primary hover:underline font-semibold">
                    Forgot Password?
                  </a>
                </div>
                <div className="relative">
                  <Lock className={`absolute top-3 left-3.5 h-4 w-4 ${isDark ? "text-slate-500" : "text-slate-400"}`} />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className={`h-11 w-full rounded-xl border pr-10 pl-10 text-xs font-medium outline-none transition-all ${
                      isDark
                        ? "border-white/10 bg-white/[0.03] text-white placeholder-slate-500 focus:border-cyan-500 focus:bg-white/[0.06] focus:ring-2 focus:ring-cyan-500/20"
                        : "border-slate-300 bg-slate-50/70 text-slate-900 placeholder-slate-400 focus:border-cyan-600 focus:bg-white focus:ring-2 focus:ring-cyan-500/20"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="Toggle password visibility"
                    className={`absolute top-3 right-3 p-0.5 transition-colors cursor-pointer ${
                      isDark ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-700"
                    }`}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className={`flex items-center gap-2 cursor-pointer text-xs ${isDark ? "text-slate-400" : "text-slate-600 font-medium"}`}>
                  <input
                    type="checkbox"
                    defaultChecked
                    className="h-3.5 w-3.5 rounded border-slate-300 accent-primary focus:ring-primary"
                  />
                  <span>Remember session for 30 days</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex h-11 w-full items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 px-6 text-xs font-bold text-white shadow-[0_0_24px_rgba(6,182,212,0.4)] transition-all hover:-translate-y-0.5 active:scale-95 cursor-pointer disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>Authenticating Session...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Command Console</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            {/* Trust Badges */}
            <div className={`mt-6 pt-4 border-t flex items-center justify-between text-[11px] ${isDark ? "border-white/10 text-slate-500" : "border-slate-200 text-slate-600 font-medium"}`}>
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Zero-Trust IAM
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                Audit Logged
              </span>
              <span>28 Standards</span>
            </div>
          </div>

          {/* Sign Up Link */}
          <div className="mt-5 text-center text-xs">
            <span className={isDark ? "text-slate-400" : "text-slate-600 font-medium"}>
              Don't have an enterprise account?{" "}
            </span>
            <Link to="/sign-up" className="font-bold text-primary hover:underline">
              Register Organization
            </Link>
          </div>
        </div>
      </main>

      {/* ── Footer Copyright ── */}
      <footer className="relative z-10 p-6 text-center text-[11px] text-slate-500 font-medium">
        © 2026 Digital CISO. All rights reserved. SOC 2 Type II & ISO 27001 Compliant Architecture.
      </footer>
    </div>
  );
}
