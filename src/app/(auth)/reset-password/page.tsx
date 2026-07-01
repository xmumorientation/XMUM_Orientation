"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorBanner, Spinner } from "@/components/ui";
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
    <form onSubmit={onSubmit} className="card space-y-4 p-5">
      <ErrorBanner message={error} />
      <div>
        <label className="label" htmlFor="password">
          New password (min 8 chars)
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? (
          <Spinner className="border-white/40 border-t-white" />
        ) : (
          "Set new password"
        )}
      </button>
    </form>
  );
}
