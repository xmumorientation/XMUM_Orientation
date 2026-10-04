"use client";

import {
  CalendarCheck,
  Eye,
  EyeOff,
  Gamepad2,
  GraduationCap,
  Lock,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { ErrorBanner, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ROLE_LABELS, type UserRole } from "@/lib/types";

const REQUESTED_ROLE_KEY = "xmum-requested-role";
const GOOGLE_ROLES = (Object.keys(ROLE_LABELS) as UserRole[]).filter((role) => role !== "freshie");

const DEMO_PRESETS = [
  { label: "Freshie", email: "freshie.test@xmu.edu.my", pass: "TestPass123!", icon: GraduationCap },
  { label: "Admin", email: "admin.test@xmu.edu.my", pass: "TestPass123!", icon: ShieldCheck },
  { label: "Faci", email: "faci.test@xmu.edu.my", pass: "TestPass123!", icon: Users },
  { label: "GM", email: "gm.test@xmu.edu.my", pass: "TestPass123!", icon: Gamepad2 },
  { label: "HOF", email: "hof.test@xmu.edu.my", pass: "TestPass123!", icon: CalendarCheck },
];

function LoginForm() {
  const params = useSearchParams();
  const nextUrl = params.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [requestedRole, setRequestedRole] = useState<UserRole | "">("");
  const [error, setError] = useState<string | null>(
    params.get("error") === "google" ? "Google sign-in did not finish. Try again." : null,
  );
  const [busy, setBusy] = useState(false);

  async function performLogin(loginEmail: string, loginPass: string) {
    setBusy(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPass,
    });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    window.location.href = nextUrl || "/dashboard";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await performLogin(email, password);
  }

  function applyPreset(presetEmail: string, presetPass: string) {
    setEmail(presetEmail);
    setPassword(presetPass);
    performLogin(presetEmail, presetPass);
  }

  async function continueWithGoogle() {
    if (!requestedRole) return;
    setBusy(true);
    setError(null);
    sessionStorage.setItem(REQUESTED_ROLE_KEY, requestedRole);
    const supabase = supabaseBrowser();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="auth-card">
      <div className="auth-card-inner space-y-5">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-1">
              Account Login
            </p>
            {nextUrl && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                <Lock size={12} /> Sign-in required
              </span>
            )}
          </div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-ink sm:text-3xl">
            Sign in to your account
          </h2>
          <p className="mt-1 text-sm leading-5 text-ink-faint">
            Enter your XMUM student or staff email to continue.
          </p>
        </div>

        <div className="space-y-2">
          <label className="label" htmlFor="google-role">
            Continue with Google
          </label>
          <select
            id="google-role"
            className="input"
            value={requestedRole}
            onChange={(e) => setRequestedRole(e.target.value as UserRole | "")}
          >
            <option value="">Choose a role</option>
            {GOOGLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !requestedRole}
            onClick={continueWithGoogle}
            className="auth-submit gap-2.5 disabled:opacity-50"
          >
            <GoogleLogo />
            Continue with Google
          </button>
        </div>

        {/* Quick Demo Switcher Control */}
        <div className="rounded-2xl border border-brand-1/20 bg-brand-1/5 p-3 sm:p-3.5">
          <div className="flex items-center justify-between gap-2 text-xs font-bold text-ink-soft">
            <span className="flex items-center gap-1.5 text-brand-1">
              <Sparkles size={14} />
              <span>Demo Quick Login</span>
            </span>
            <span className="text-[10px] font-medium text-ink-faint">One-click sign in</span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5 sm:gap-2">
            {DEMO_PRESETS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.email, p.pass)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-paper-300 bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all duration-base ease-snappy hover:border-brand-1/60 hover:bg-brand-1/10 hover:text-brand-1 active:scale-95"
                >
                  <Icon size={14} className="text-brand-1" />
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <ErrorBanner message={error} />

        <div>
          <label className="label" htmlFor="email">
            Email address
          </label>
          <input
            id="email"
            type="email"
            required
            placeholder="student@xmu.edu.my"
            autoComplete="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              placeholder="••••••••"
              autoComplete="current-password"
              className="input pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-3 text-ink-faint transition hover:text-ink"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button type="submit" disabled={busy} className="group auth-submit">
          {busy ? (
            <Spinner className="border-white/40 border-t-white" />
          ) : (
            "Sign In"
          )}
        </button>

        <div className="flex justify-between gap-4 pt-1 text-center text-xs font-semibold text-ink-faint">
          <Link href="/forgot-password" className="hover:text-ink">
            Forgot password?
          </Link>
          <Link href="/activate" className="hover:text-ink">
            Staff invite activation
          </Link>
        </div>
      </div>
    </form>
  );
}

function GoogleLogo() {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white">
      <svg viewBox="0 0 48 48" className="h-3.5 w-3.5" aria-hidden="true">
        <path
          fill="#FFC107"
          d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.223 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
        />
        <path
          fill="#FF3D00"
          d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
        />
        <path
          fill="#4CAF50"
          d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
        />
        <path
          fill="#1976D2"
          d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
        />
      </svg>
    </span>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
