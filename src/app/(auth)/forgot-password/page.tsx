"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { nexusBody, vxDisplay, vxSlab } from "@/components/home/fonts";
import { Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

import "../login/login.css";

// FR-1.5: password reset via email link
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) setError(error.message);
    else setNotice("If that email exists, a reset link has been sent.");
    setBusy(false);
  }

  return (
    <main className={`sl ${vxDisplay.variable} ${vxSlab.variable} ${nexusBody.variable}`}>
      <div className="sl-bg" aria-hidden>
        <div className="sl-dots" />
        <div className="sl-glow sl-glow-a" />
        <div className="sl-glow sl-glow-b" />
        <div className="sl-glow sl-glow-c" />
      </div>

      <div className="sl-shell">
        <div className="sl-panel">
          <header className="sl-brand">
            <h1 className="sl-title sl-title-trial">
              <span className="sl-title-roles">Account recovery</span>
              <span className="sl-title-login">Reset password</span>
            </h1>
            <p className="sl-lead">We’ll email you a link to choose a new password.</p>
          </header>

          <form onSubmit={onSubmit} className="sl-card">
            {error && <p className="sl-message sl-message-error" role="alert">{error}</p>}
            {notice && <p className="sl-message sl-message-success" role="status">{notice}</p>}

            <div className="sl-field">
              <label className="sl-label" htmlFor="email">Campus email</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@xmu.edu.my"
                className="sl-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <button type="submit" disabled={busy} className="sl-submit">
              {busy ? <Spinner className="border-black/25 border-t-black" /> : "Send reset link"}
            </button>

            <div className="sl-actions">
              <Link href="/login" className="sl-ghost">
                <ArrowLeft size={16} aria-hidden />
                Back to login
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
