"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { useProfile } from "@/components/ProfileProvider";
import { useGroup } from "@/components/useGroup";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ROLE_LABELS } from "@/lib/types";

import { AccountMenu } from "./FreshieHome";
import { FACI_PROFILE_SAVED_EVENT, faciFromProfile, type FaciRow } from "./faciProfiles";
import { GameStatusPill, GameTrack, useGameStatus } from "./GameStatus";
import { themeFromColor } from "./groupTheme";
import "./freshie.css";

// Freshie's and Facilitator's header on every page but Home (and a Freshie's
// Scan; phones and portrait tablets, TopNav from 1024px), in normal flow
// above the scroller like OpsHeader: the logo (goes Home), the game's status
// in the middle, the account menu on the right, and the game's progress
// under it (GameStatus). In the group's colour.

/** A Faci's own photo (fn_group_facis), for the account menu. Freshies have none. */
function useMyAvatar(meId: string, enabled: boolean) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    async function load() {
      const { data } = await supabase.rpc("fn_group_facis");
      const mine = ((data ?? []) as FaciRow[]).find((r) => r.id === meId);
      if (active) setUrl(mine ? faciFromProfile(mine, meId).avatarUrl : null);
    }
    load();
    window.addEventListener(FACI_PROFILE_SAVED_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(FACI_PROFILE_SAVED_EVENT, load);
    };
  }, [supabase, meId, enabled]);
  return url;
}

export function GroupHeader() {
  const profile = useProfile();
  const isFaci = profile.role === "faci";
  const { group } = useGroup();
  const router = useRouter();
  const avatarUrl = useMyAvatar(profile.id, isFaci);
  const { status, serverNow } = useGameStatus();
  const theme = themeFromColor(group?.color);

  return (
    <header
      className={`fh fa-head ${vxDisplay.variable} ${vxSlab.variable}`}
      style={
        {
          "--fh-accent": theme.accent,
          "--fh-glow": theme.glow,
          "--fh-blue": theme.accent,
          "--fh-blue-light": theme.accentLight,
          "--fh-on-blue": theme.onAccent,
        } as React.CSSProperties
      }
    >
      <div className="fh-head-row">
        <div className="fh-head-l">
          <Link href="/dashboard" className="fh-brand" aria-label="Vortexa, home">
            <Image src="/vortexa-logo-sm.webp" alt="" width={320} height={184} priority style={{ width: "auto" }} />
          </Link>
        </div>
        <div className="fa-head-now">
          <GameStatusPill status={status} />
        </div>
        <div className="fh-head-r">
          <AccountMenu
            name={profile.full_name ?? ""}
            avatarUrl={avatarUrl}
            onEditProfile={isFaci ? () => router.push("/dashboard?edit=profile") : undefined}
            groupName={group?.name ?? null}
            roleLabel={ROLE_LABELS[profile.role]}
            logoutHref={isFaci ? "/login" : "/"}
          />
        </div>
      </div>
      <GameTrack status={status} serverNow={serverNow} />
    </header>
  );
}
