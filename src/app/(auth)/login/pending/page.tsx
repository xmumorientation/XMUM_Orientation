"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ErrorBanner, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ROLE_LABELS, type UserRole } from "@/lib/types";

const REQUESTED_ROLE_KEY = "xmum-requested-role";

export default function PendingApprovalPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [label, setLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace("/login");
        return;
      }

      const stored = sessionStorage.getItem(REQUESTED_ROLE_KEY);
      if (stored && stored in ROLE_LABELS) {
        await supabase.rpc("fn_set_requested_role", { p_role: stored });
        sessionStorage.removeItem(REQUESTED_ROLE_KEY);
      }

      const { data } = await supabase
        .from("profiles")
        .select("approved, requested_role, role")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (!active) return;
      if (data?.approved !== false) {
        router.replace("/dashboard");
        return;
      }

      const requested = (data?.requested_role ?? null) as UserRole | null;
      setLabel(requested ? ROLE_LABELS[requested] : "the role you chose");
      setReady(true);
    }

    load().catch((err: Error) => {
      if (active) setError(err.message);
    });

    return () => {
      active = false;
    };
  }, [router, supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="auth-card">
      <div className="auth-card-inner space-y-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-1">
            Waiting for approval
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-ink">
            An admin needs to approve this account.
          </h2>
          <p className="mt-2 text-sm leading-5 text-ink-faint">
            {ready
              ? `You asked to join as ${label}. You can sign in after an admin approves it.`
              : "Checking your account."}
          </p>
        </div>
        <ErrorBanner message={error} />
        {!ready && !error && <Spinner />}
        <button type="button" onClick={signOut} className="btn-secondary w-full">
          Sign out
        </button>
      </div>
    </div>
  );
}
