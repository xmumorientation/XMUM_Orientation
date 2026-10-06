"use client";

import { useEffect, useMemo, useState } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { groupLoginEmail, groupLoginPassword } from "@/lib/group-login";
import { supabaseBrowser } from "@/lib/supabase/client";

type FreshieGroup = { id: number; name: string };

export default function FreshieLoginPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [groups, setGroups] = useState<FreshieGroup[]>([]);
  const [groupId, setGroupId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc("fn_list_freshie_groups").then(({ data, error: rpcError }) => {
      if (rpcError) {
        setError("Groups are not ready yet.");
        return;
      }
      const rows = (data as FreshieGroup[]) ?? [];
      setGroups(rows);
      // Only one group: nothing to choose, so pick it. Otherwise the Freshie
      // picks their own group from the "Choose your group" list.
      if (rows.length === 1) setGroupId(String(rows[0].id));
    });
  }, [supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || code.length !== 4) return;
    setBusy(true);
    setError(null);
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: groupLoginEmail(Number(groupId)),
      password: groupLoginPassword(code),
    });
    setBusy(false);
    if (signError) {
      setError("That code does not match this group.");
      return;
    }
    window.location.href = "/dashboard";
  }

  return (
    <AuthShell role="Freshie Login" lead="Pick your group and enter the 4-digit password.">
      <form className="vx-login-form" onSubmit={submit}>
        <label>
          Group
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            data-empty={groupId === ""}
            required
          >
            {groups.length === 0 ? (
              <option value="">No groups yet</option>
            ) : (
              <option value="" disabled>
                Choose your group
              </option>
            )}
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          4-digit password
          <input
            className="vx-login-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••"
            required
          />
        </label>
        {error && (
          <p className="vx-login-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="vx-btn vx-btn-primary" disabled={busy || code.length !== 4 || !groupId}>
          {busy ? "Opening…" : "Enter"}
        </button>
      </form>
    </AuthShell>
  );
}
