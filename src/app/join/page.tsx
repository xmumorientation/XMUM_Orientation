"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { nexusBody, vxDisplay, vxSlab } from "@/components/home/fonts";
import { FONT } from "@/components/home/data";
import { Glow } from "@/components/home/decor";
import "@/components/home/vortexa.css";
import { groupLoginEmail, groupLoginPassword, parseGroupJoin } from "@/lib/group-login";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function JoinPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [message, setMessage] = useState("Opening your group…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Current QRs carry ?g=<signed group token>; the server signs in with the
    // group's current password. Older prints carry ?group3=1234 and work until
    // that group's password is changed.
    const token = params.get("g");
    const parsed = token ? null : parseGroupJoin(params);
    if (!token && !parsed) {
      setMessage("This scan link is not a group login.");
      setFailed(true);
      return;
    }

    let cancelled = false;
    (async () => {
      // This phone only: a global sign-out would end every phone of the group.
      await supabase.auth.signOut({ scope: "local" });
      let failed: boolean;
      if (token) {
        const res = await fetch("/api/group-join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ t: token }),
        });
        failed = !res.ok;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: groupLoginEmail(parsed!.groupId),
          password: groupLoginPassword(parsed!.code),
        });
        failed = !!error;
      }
      if (cancelled) return;
      if (failed) {
        setMessage("This scan link did not sign the group in.");
        setFailed(true);
        return;
      }
      window.location.href = "/dashboard";
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return (
    <div className={`${vxDisplay.variable} ${vxSlab.variable} ${nexusBody.variable}`}>
      <div className="vx vx-login" style={{ fontFamily: FONT.body }}>
        <div className="vx-dots" />
        <Glow size="min(480px, 90vw)" color="var(--vx-navy)" style={{ left: "-8%", top: "10%", opacity: 0.8 }} />
        <div className="vx-login-card">
          <span className="vx-welcome-mark vx-holo">Vortexa</span>
          <p className="vx-welcome-slogan">{message}</p>
          {failed && (
            <Link href="/login/freshie" className="vx-btn vx-btn-primary">
              Freshie Login
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
