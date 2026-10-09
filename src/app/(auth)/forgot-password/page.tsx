"use client";

import { useState } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

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
    <AuthShell
      role="Reset password"
      lead="We’ll email you a link to choose a new password."
      backHref="/login"
      backLabel="Back to login"
    >
      <form onSubmit={onSubmit} className="vx-login-form">
        {error && (
          <p className="vx-login-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="vx-login-notice" role="status">
            {notice}
          </p>
        )}

        <label htmlFor="email">
          Campus email
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@xmu.edu.my"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <button type="submit" disabled={busy} className="vx-btn vx-btn-primary">
          {busy ? <Spinner className="border-black/25 border-t-black" /> : "Send reset link"}
        </button>
      </form>
    </AuthShell>
  );
}
