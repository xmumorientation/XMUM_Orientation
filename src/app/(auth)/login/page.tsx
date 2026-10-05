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
import { ROLE_LABELS, type UserRole } from "@/lib/types";

import "./login.css";

const REQUESTED_ROLE_KEY = "xmum-requested-role";
const GOOGLE_ROLES = (Object.keys(ROLE_LABELS) as UserRole[]).filter((role) => role !== "freshie");

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
            <div className="sl-google">
              <label className="sl-label" htmlFor="google-role">
                Continue with Google
              </label>
              <select
                id="google-role"
                className="sl-input sl-select"
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
                className="sl-google-btn"
              >
                <GoogleLogo />
                Continue with Google
              </button>
            </div>

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

function GoogleLogo() {
  return (
    <span className="sl-google-logo" aria-hidden>
      <svg viewBox="0 0 48 48" className="sl-google-svg">
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
