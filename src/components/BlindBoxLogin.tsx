"use client";

import { Package } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { groupLoginEmail, groupLoginPassword } from "@/lib/group-login";
import { supabaseBrowser } from "@/lib/supabase/client";

type FreshieGroup = { id: number; name: string };

/**
 * Shown on the public /blindbox page instead of the buy screen when the
 * visitor is not signed in as a Freshie group (an outside scanner, or the
 * in-app scanner after the session ended). Pick the group, enter the 4-digit
 * password, and the same page reloads on the buy screen: the scan link is
 * kept, so nothing needs scanning twice.
 *
 * `notFreshie`: the visitor is signed in, but as staff or a Faci (or, with
 * `noGroup`, as a Freshie account with no group). Only Freshie group logins
 * can buy, so offer to switch to one.
 */
export function BlindBoxLogin({
  sellerName,
  spot = false,
  notFreshie = false,
  noGroup = false,
}: {
  sellerName: string;
  /** The hidden Spot box (free, claimed instead of bought). */
  spot?: boolean;
  notFreshie?: boolean;
  noGroup?: boolean;
}) {
  const what = spot ? "You found a hidden blind box!" : `${sellerName} is selling blind boxes.`;
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [groups, setGroups] = useState<FreshieGroup[]>([]);
  const [groupId, setGroupId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const showForm = !notFreshie || switching;

  useEffect(() => {
    if (!showForm) return;
    supabase.rpc("fn_list_freshie_groups").then(({ data, error: rpcError }) => {
      if (rpcError) {
        setError("Groups are not ready yet.");
        return;
      }
      const rows = (data as FreshieGroup[]) ?? [];
      setGroups(rows);
      if (rows.length === 1) setGroupId(String(rows[0].id));
    });
  }, [supabase, showForm]);

  async function switchToFreshie() {
    setBusy(true);
    // This device only: a global sign-out would end the account's sessions on
    // every other device too.
    await supabase.auth.signOut({ scope: "local" });
    setBusy(false);
    setSwitching(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || code.length !== 4) return;
    setBusy(true);
    setError(null);
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: groupLoginEmail(Number(groupId)),
      password: groupLoginPassword(code),
    });
    if (signError) {
      setBusy(false);
      setError("That code does not match this group.");
      return;
    }
    // Same URL, now signed in: the server renders the buy screen.
    router.refresh();
  }

  if (notFreshie && !switching) {
    return (
      <AuthShell
        role="Blind box"
        lead={
          noGroup
            ? `${what} Your account is not in a group yet, so it cannot buy. Log in with your group's 4-digit password instead.`
            : `${what} Only Freshie groups can get one, and you are signed in with a staff or Facilitator account.`
        }
        backHref="/dashboard"
        backLabel="Back to home"
      >
        <div className="vx-login-form">
          <button type="button" className="vx-btn vx-btn-primary" onClick={switchToFreshie} disabled={busy}>
            {busy ? "Signing out…" : noGroup ? "Log in as your group" : "Log in as a Freshie"}
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      role="Blind box"
      lead={
        <>
          <Package size={18} aria-hidden style={{ display: "inline", verticalAlign: "-3px", marginRight: 6 }} />
          {what} Pick your group and enter its 4-digit password to {spot ? "claim it" : "buy one"}.
        </>
      }
    >
      <form className="vx-login-form" onSubmit={submit}>
        <label>
          Group
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} data-empty={groupId === ""} required>
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
          {busy ? "Checking…" : "Continue to the blind box"}
        </button>
      </form>
    </AuthShell>
  );
}
