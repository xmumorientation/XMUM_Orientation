"use client";

import { CalendarCheck, Eye, EyeOff, Gamepad2, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ROLE_LABELS, type UserRole } from "@/lib/types";

import type { DemoLogin } from "./demo-logins";

const REQUESTED_ROLE_KEY = "xmum-requested-role";
const GOOGLE_ROLES = (Object.keys(ROLE_LABELS) as UserRole[]).filter((role) => role !== "freshie");
const DEMO_ICONS: Record<string, typeof Users> = {
  Admin: ShieldCheck,
  Faci: Users,
  GM: Gamepad2,
  HOF: CalendarCheck,
};

export function LoginForm({ demoLogins }: { demoLogins: DemoLogin[] }) {
  const params = useSearchParams();
  const nextUrl = params.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [requestedRole, setRequestedRole] = useState<UserRole | "">("");
  // The role picker opens after the first tap on Continue with Google.
  const [googleOpen, setGoogleOpen] = useState(false);
  const roleRef = useRef<HTMLSelectElement>(null);
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

  function onGoogleClick() {
    if (!requestedRole) {
      setGoogleOpen(true);
      // Wait for the picker to render, then move focus to it.
      requestAnimationFrame(() => roleRef.current?.focus());
      return;
    }
    continueWithGoogle();
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
    <AuthShell role="Committee, Faci, GM login" lead="Sign in with your campus email or Google.">
      <form onSubmit={onSubmit} className="vx-login-form">
        {error && (
          <p className="vx-login-error" role="alert">
            {error}
          </p>
        )}

        <label htmlFor="email">
          Campus email
          <input
            id="email"
            type="email"
            required
            placeholder="you@xmu.edu.my"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <div className="vx-login-label">
          <label htmlFor="password" style={{ display: "contents" }}>
            Password
          </label>
          <span className="vx-login-pass">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="vx-login-eye"
            >
              {showPassword ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
            </button>
          </span>
        </div>

        <button type="submit" disabled={busy} className="vx-btn vx-btn-primary">
          {busy ? <Spinner className="border-black/25 border-t-black" /> : "Sign in"}
        </button>

        <Link href="/forgot-password" className="vx-login-link">
          Forgot password?
        </Link>

        <p className="vx-login-divider">or</p>

        <button type="button" disabled={busy} onClick={onGoogleClick} className="vx-login-google">
          <GoogleLogo />
          Continue with Google
        </button>

        {googleOpen && (
          <div className="vx-login-google-role">
            <label htmlFor="google-role">
              Your role
              <select
                ref={roleRef}
                id="google-role"
                value={requestedRole}
                data-empty={requestedRole === ""}
                onChange={(e) => setRequestedRole(e.target.value as UserRole | "")}
              >
                <option value="">Choose a role</option>
                {GOOGLE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </label>
            <p className="vx-login-hint">
              {requestedRole
                ? "Now tap Continue with Google."
                : "Choose your role, then tap Continue with Google again."}
            </p>
          </div>
        )}
      </form>

      {demoLogins.length > 0 && (
        <details className="vx-login-demo">
          <summary>Demo quick login</summary>
          <div className="vx-login-demo-box">
            <p>Test accounts. Hidden on the live site.</p>
            <div className="vx-login-demo-row">
              {demoLogins.map((p) => {
                const Icon = DEMO_ICONS[p.label] ?? Users;
                return (
                  <button key={p.label} type="button" disabled={busy} onClick={() => applyPreset(p.email, p.pass)}>
                    <Icon size={16} aria-hidden />
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </details>
      )}
    </AuthShell>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden>
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
  );
}
