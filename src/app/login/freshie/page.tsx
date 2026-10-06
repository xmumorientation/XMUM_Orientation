"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { nexusBody, vxDisplay, vxSlab } from "@/components/home/fonts";
import { FONT } from "@/components/home/data";
import { Glow, Spark } from "@/components/home/decor";
import "@/components/home/vortexa.css";
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
      if (rows[0]) setGroupId(String(rows[0].id));
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
    <div className={`${vxDisplay.variable} ${vxSlab.variable} ${nexusBody.variable}`}>
      <div className="vx vx-login" style={{ fontFamily: FONT.body }}>
        <div className="vx-dots" />
        <Glow size="min(520px, 90vw)" color="var(--vx-navy)" style={{ left: "-8%", top: "8%", opacity: 0.8 }} />
        <Glow size="min(380px, 70vw)" color="var(--vx-pink)" style={{ right: "-6%", bottom: "-8%" }} />
        <Spark size={22} color="var(--vx-yellow)" style={{ left: "14%", top: "18%" }} />
        <Spark size={16} color="var(--vx-cyan)" style={{ right: "18%", top: "22%" }} />

        <div className="vx-login-card">
          <div className="vx-eyebrow">XMUM 26/12 Orientation</div>
          <h1 style={{ margin: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span className="vx-welcome-pre">WELCOME TO</span>
            <span className="vx-welcome-mark vx-holo">Vortexa</span>
          </h1>
          <p className="vx-welcome-slogan">Pick your group and enter the 4-digit password.</p>

          <form className="vx-login-form" onSubmit={submit}>
            <label>
              Group
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
                {groups.length === 0 && <option value="">No groups yet</option>}
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
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={4}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                required
              />
            </label>
            {error && <p className="vx-login-error">{error}</p>}
            <button type="submit" className="vx-btn vx-btn-primary" disabled={busy || code.length !== 4 || !groupId}>
              {busy ? "Opening…" : "Enter"}
            </button>
          </form>

          <Link href="/" className="vx-login-back">
            <ArrowLeft size={18} aria-hidden /> Back to Welcome
          </Link>
        </div>
      </div>
    </div>
  );
}
