"use client";

import Link from "next/link";
import { useState } from "react";

import { ErrorBanner, Spinner, SuccessBanner } from "@/components/ui";
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
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) setError(error.message);
    else setNotice("If that email exists, a reset link has been sent.");
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="auth-card">
      <div className="auth-card-inner space-y-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-1">
            Account recovery
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.03em] text-ink">
            Reset your password.
          </h2>
        </div>
        <ErrorBanner message={error} />
        <SuccessBanner message={notice} />
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button type="submit" disabled={busy} className="group auth-submit">
          {busy ? (
            <Spinner className="border-white/40 border-t-white" />
          ) : (
            "Send reset link"
          )}
        </button>
        <p className="text-center text-sm">
          <Link href="/login" className="font-bold text-brand-1">
            Back to login
          </Link>
        </p>
      </div>
    </form>
  );
}
