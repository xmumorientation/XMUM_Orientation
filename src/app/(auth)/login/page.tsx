"use client";

import {
  ArrowLeft,
  CalendarCheck,
  Eye,
  EyeOff,
  Gamepad2,
  Lock,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { nexusBody, vxDisplay, vxSlab } from "@/components/home/fonts";
import { Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

import "./login.css";

const DEMO_PRESETS = [
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
    <div
      className={`sl ${vxDisplay.variable} ${vxSlab.variable} ${nexusBody.variable}`}
    >
      <div className="sl-bg" aria-hidden>
        <div className="sl-dots" />
        <div className="sl-glow sl-glow-a" />
        <div className="sl-glow sl-glow-b" />
        <div className="sl-glow sl-glow-c" />
      </div>

      <div className="sl-shell">
        <div className="sl-panel">
          <header className="sl-brand">
            <p className="sl-eyebrow">Staff Login</p>
            <h1 className="sl-title">
              Committee · <span className="sl-holo">Facilitator</span> · GM
            </h1>
            <p className="sl-lead">
              Sign in with your staff email to open the orientation control room.
              Freshie check-in lives on the Welcome page — not here.
            </p>
            <div className="sl-roles" aria-label="Staff roles">
              <span className="sl-role">Committee</span>
              <span className="sl-role">Facilitator</span>
              <span className="sl-role">GM</span>
              <span className="sl-role">HOF</span>
            </div>
            {nextUrl && (
              <span className="sl-gate">
                <Lock size={12} aria-hidden /> Sign-in required
              </span>
            )}
          </header>

          <form onSubmit={onSubmit} className="sl-card">
            {/* DEMO ONLY — disable one-click presets before production. */}
            <div className="sl-demo">
              <div className="sl-demo-head">
                <span className="sl-demo-title">
                  <Sparkles size={14} aria-hidden />
                  Demo Quick Login
                </span>
              </div>
              <p className="sl-demo-note">
                Demo only — turn off before production.
              </p>
              <div className="sl-demo-row">
                {DEMO_PRESETS.map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      disabled={busy}
                      onClick={() => applyPreset(p.email, p.pass)}
                      className="sl-chip"
                    >
                      <Icon size={14} aria-hidden />
                      <span>{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <p className="sl-error" role="alert">
                {error}
              </p>
            )}

            <div className="sl-field">
              <label className="sl-label" htmlFor="email">
                Staff email
              </label>
              <input
                id="email"
                type="email"
                required
                placeholder="you@xmu.edu.my"
                autoComplete="email"
                className="sl-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="sl-field">
              <label className="sl-label" htmlFor="password">
                Password
              </label>
              <div className="sl-input-wrap">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="sl-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="sl-eye"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={busy} className="sl-submit">
              {busy ? (
                <Spinner className="border-black/25 border-t-black" />
              ) : (
                "Sign in"
              )}
            </button>

            <div className="sl-actions">
              <Link href="/" className="sl-ghost">
                <ArrowLeft size={16} aria-hidden />
                Back to Welcome
              </Link>
              <div className="sl-links">
                <Link href="/forgot-password">Forgot password?</Link>
                <Link href="/activate">Staff invite activation</Link>
              </div>
            </div>
          </form>

          <p className="sl-foot">XMUM · Official Orientation Platform</p>
        </div>
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
