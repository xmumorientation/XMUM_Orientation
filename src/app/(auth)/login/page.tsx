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
  UserCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { ErrorBanner, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

const DEMO_PRESETS = [
  { label: "Freshie", email: "freshie.test@xmu.edu.my", pass: "TestPass123!", icon: GraduationCap },
  { label: "Admin", email: "admin.test@xmu.edu.my", pass: "TestPass123!", icon: ShieldCheck },
  { label: "Faci", email: "faci.test@xmu.edu.my", pass: "TestPass123!", icon: Users },
  { label: "GM", email: "gm.test@xmu.edu.my", pass: "TestPass123!", icon: Gamepad2 },
  { label: "HOF", email: "hof.test@xmu.edu.my", pass: "TestPass123!", icon: CalendarCheck },
];

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextUrl = params.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

        <div className="flex flex-col gap-2 pt-1 text-center text-sm">
          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-brand-1/30 bg-brand-1/10 px-4 py-2.5 font-bold text-brand-1 transition hover:bg-brand-1/20 active:scale-95"
          >
            <UserCheck size={16} />
            New Freshie? Register Account
          </Link>

          <div className="flex justify-between gap-4 pt-2 text-xs font-semibold text-ink-faint">
            <Link href="/forgot-password" className="hover:text-ink">
              Forgot password?
            </Link>
            <Link href="/activate" className="hover:text-ink">
              Staff invite activation
            </Link>
          </div>
        </div>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
