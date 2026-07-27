"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { ErrorBanner, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    // Dynamic routes bypass the client router cache in Next 15, so replace()
    // alone fetches a fresh server render — no refresh() needed on top.
    router.replace(params.get("next") || "/dashboard");
  }

  return (
    <form onSubmit={onSubmit} className="auth-card">
      <div className="auth-card-inner space-y-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-1">
            Account access
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.03em] text-ink">
            Sign in to continue.
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-faint">
            Use your assigned XMUM Orientation account.
          </p>
        </div>
        <ErrorBanner message={error} />
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" disabled={busy} className="group auth-submit">
          {busy ? (
            <Spinner className="border-white/40 border-t-white" />
          ) : (
            "Log in"
          )}
        </button>
        <div className="flex justify-between gap-4 text-sm">
          <Link href="/forgot-password" className="font-semibold text-ink-soft">
            Forgot password?
          </Link>
          <Link href="/register" className="font-bold text-brand-1">
            New Freshie? Register
          </Link>
        </div>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
