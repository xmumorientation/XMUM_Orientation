"use client";

import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { nexusBody, vxDisplay, vxSlab } from "@/components/home/fonts";
import { Spinner } from "@/components/ui";

import "../login.css";

/**
 * Freshie group login. One password — no email, no group picker.
 * The password is a group pass code (see lookupGroupCode). Redeem sets the
 * same httpOnly group-pass cookie the rest of /group/* already requires.
 */
export default function FreshieLoginPage() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/group-pass/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        groupId?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok || !data.ok || !data.groupId) {
        setError(
          data.error === "invalid_code" || data.error === "invalid_body"
            ? "That group password is not recognised."
            : data.message || "Could not open your group."
        );
        setBusy(false);
        return;
      }
      window.location.href = `/group/${encodeURIComponent(data.groupId)}`;
    } catch {
      setError("Could not open your group. Try again.");
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
            <p className="sl-eyebrow">Freshie Login</p>
            <h1 className="sl-title">
              Your <span className="sl-holo">group</span>
            </h1>
            <p className="sl-lead">
              Enter your group password. It opens that group&apos;s dashboard.
            </p>
          </header>

          <form onSubmit={onSubmit} className="sl-card">
            {error && (
              <p className="sl-error" role="alert">
                {error}
              </p>
            )}

            <div className="sl-field">
              <label className="sl-label" htmlFor="password">
                Group password
              </label>
              <div className="sl-input-wrap">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoFocus
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
            </div>
          </form>

          <p className="sl-foot">XMUM · Official Orientation Platform</p>
        </div>
      </div>
    </div>
  );
}
