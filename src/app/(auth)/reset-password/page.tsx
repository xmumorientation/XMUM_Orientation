"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <AuthShell role="Set a new password" backHref="/login" backLabel="Back to login">
      <form onSubmit={onSubmit} className="vx-login-form">
        {error && (
          <p className="vx-login-error" role="alert">
            {error}
          </p>
        )}
        <label htmlFor="password">
          New password (min 8 characters)
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" disabled={busy} className="vx-btn vx-btn-primary">
          {busy ? <Spinner className="border-black/25 border-t-black" /> : "Set new password"}
        </button>
      </form>
    </AuthShell>
  );
}
