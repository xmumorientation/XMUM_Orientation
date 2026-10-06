"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Spinner } from "@/components/ui";
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
      setLabel(requested ? ROLE_LABELS[requested] : null);
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
    <AuthShell
      role="Waiting for approval"
      lead={
        ready
          ? label
            ? `An admin needs to approve this account. You asked to join as ${label}. You can sign in after an admin approves it.`
            : "An admin needs to approve this account and give it a role. You can sign in after that."
          : "Checking your account."
      }
    >
      <div className="vx-login-form">
        {error && (
          <p className="vx-login-error" role="alert">
            {error}
          </p>
        )}
        {!ready && !error && <Spinner className="mx-auto" />}
        <button type="button" onClick={signOut} className="vx-btn vx-btn-ghost">
          Sign out
        </button>
      </div>
    </AuthShell>
  );
}
