"use client";

import {
  CalendarCheck,
  Eye,
  EyeOff,
  Gamepad2,
  GraduationCap,
  Lock,
  Music2,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  UserCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Spinner } from "@/components/ui";
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
    <div className="nexus-shell fixed inset-0 z-[60] overflow-y-auto px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100dvh-2.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-w-6xl grid-cols-1 items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left hero — desktop only */}
        <section className="relative hidden min-w-0 lg:block">
          {/* Decorative floating orbs, anchored to the hero column so they never cross into the form card */}
          <div className="nexus-orb nexus-star-spin pointer-events-none absolute -left-10 -top-10">
            <Star size={20} />
          </div>
          <div className="nexus-orb nexus-blob-float pointer-events-none absolute -right-8 top-16" style={{ animationDelay: "1.5s" }}>
            <Gamepad2 size={20} />
          </div>
          <div className="nexus-orb nexus-blob-float pointer-events-none absolute -left-14 bottom-0" style={{ animationDelay: "3s" }}>
            <Trophy size={20} />
          </div>
          <div className="nexus-orb nexus-star-spin pointer-events-none absolute -right-4 bottom-0" style={{ animationDelay: "2s" }}>
            <Music2 size={20} />
          </div>

          <div className="nexus-eyebrow">
            <span className="h-2 w-2 rounded-full bg-[#ff3cac]" />
            XMUM Freshies Orientation
          </div>

          <h1 className="nexus-holo-text mt-6 font-display text-[clamp(3rem,5.5vw,5rem)] font-black leading-[0.95] tracking-[-0.03em]">
            Welcome to XMUM!
          </h1>
          <p className="mt-4 max-w-md text-xl font-bold leading-8 tracking-tight text-[#c8b8f0]">
            Your XMUM journey starts here.
          </p>

          <div className="mt-6 h-1.5 w-32 rounded-full bg-[linear-gradient(90deg,#ff3cac,#7b2fff,#00cfff)]" />

          <div className="mt-10 max-w-lg border-t border-white/10 pt-4 text-xs font-semibold text-[#7060a0]">
            Xiamen University Malaysia • Official Orientation Platform
          </div>
        </section>

        {/* Right form */}
        <section className="relative mx-auto w-full min-w-0 max-w-md py-6 lg:py-0">
          <div className="mb-6 lg:hidden">
            <div className="nexus-eyebrow">
              <span className="h-2 w-2 rounded-full bg-[#ff3cac]" />
              XMUM Freshies Orientation
            </div>
            <h1 className="nexus-holo-text mt-3 text-3xl font-black tracking-tight">
              Welcome to XMUM
            </h1>
            <p className="mt-1 text-sm font-semibold leading-5 text-[#a79cd0]">
              Your XMUM journey starts here.
            </p>
          </div>

          <form onSubmit={onSubmit} className="nexus-card">
            <div className="nexus-card-inner space-y-5">
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff3cac]">
                    Account Login
                  </p>
                  {nextUrl && (
                    <span className="nexus-badge-amber">
                      <Lock size={12} /> Sign-in required
                    </span>
                  )}
                </div>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-[#f0eeff] sm:text-3xl">
                  Sign in to your account
                </h2>
                <p className="mt-1 text-sm leading-5 text-[#7060a0]">
                  Enter your XMUM student or staff email to continue.
                </p>
              </div>

              {/* Quick Demo Switcher Control */}
              <div className="rounded-2xl border border-[#d966ff]/20 bg-[#d966ff]/5 p-3 sm:p-3.5">
                <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#c8b8f0]">
                  <span className="flex items-center gap-1.5 text-[#d966ff]">
                    <Sparkles size={14} />
                    <span>Demo Quick Login</span>
                  </span>
                  <span className="text-[10px] font-medium text-[#7060a0]">One-click sign in</span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5 sm:gap-2">
                  {DEMO_PRESETS.map((p) => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => applyPreset(p.email, p.pass)}
                        className="nexus-chip"
                      >
                        <Icon size={14} />
                        <span>{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && <div className="nexus-error">{error}</div>}

              <div>
                <label className="nexus-label" htmlFor="email">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="student@xmu.edu.my"
                  autoComplete="email"
                  className="nexus-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="nexus-label" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="nexus-input pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-3 text-[#7060a0] transition hover:text-[#00cfff]"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={busy} className="nexus-btn-primary">
                {busy ? (
                  <Spinner className="border-black/30 border-t-[#08080b]" />
                ) : (
                  "Sign In"
                )}
              </button>

              <div className="flex flex-col gap-2 pt-1 text-center text-sm">
                <Link href="/register" className="nexus-btn-outline">
                  <UserCheck size={16} />
                  New Freshie? Register Account
                </Link>

                <div className="flex justify-between gap-4 pt-2 text-xs font-semibold text-[#7060a0]">
                  <Link href="/forgot-password" className="hover:text-[#00cfff]">
                    Forgot password?
                  </Link>
                  <Link href="/activate" className="hover:text-[#00cfff]">
                    Staff invite activation
                  </Link>
                </div>
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
