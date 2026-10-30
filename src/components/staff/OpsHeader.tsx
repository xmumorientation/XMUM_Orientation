"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu } from "lucide-react";

import { AccountMenu } from "@/components/freshie/FreshieHome";
import { GameStatusPill, GameTrack, useGameStatus } from "@/components/freshie/GameStatus";
import { VORTEXA_THEME } from "@/components/freshie/groupTheme";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { useProfile } from "@/components/ProfileProvider";
import { ROLE_LABELS, type UserRole } from "@/lib/types";

import "@/components/freshie/freshie.css";
import "./staff-home.css";

// HOGM's, HOF's and GM's header on Ops (GM: Station), Map, Scores and Schedule
// (phones and portrait tablets): the same logo, role chip and account menu as their Home
// (StaffHome), in normal flow above the scroller. The logo goes Home; Log
// Out is in the account menu. The game's status is a pill in the middle of
// the bar and its progress a track under it (GameStatus, as on GroupHeader),
// in the Welcome page's colours.
// Landscape tablets and desktops use TopNav instead.

/** Short role name for the header chip. */
export const OPS_CHIP: Partial<Record<UserRole, string>> = { hof: "HOF", hogm: "HOGM", committee: "Committee", gm: "GM" };

export function OpsHeader({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const profile = useProfile();
  const t = VORTEXA_THEME;
  const { phases, status, serverNow } = useGameStatus();
  return (
    <header
      className={`fh fh-vx ops-head ${vxDisplay.variable} ${vxSlab.variable}`}
      style={
        {
          "--fh-accent": t.accent,
          "--fh-glow": t.glow,
          "--fh-blue": t.accent,
          "--fh-blue-light": t.accentLight,
          "--fh-on-blue": t.onAccent,
        } as React.CSSProperties
      }
    >
      <div className="fh-head-row">
        <div className="fh-head-l">
          <Link href="/dashboard" className="fh-brand" aria-label="Vortexa, home">
            <Image src="/vortexa-logo-sm.webp" alt="" width={320} height={184} priority style={{ width: "auto" }} />
          </Link>
        </div>
        <div className="ops-head-now">
          <GameStatusPill status={status} />
        </div>
        <div className="fh-head-r">
          {onOpenMenu && (
            <button type="button" className="fh-navbtn" aria-label="Open menu" onClick={onOpenMenu}>
              <Menu size={20} aria-hidden />
            </button>
          )}
          <span className="fh-chip fh-mono">{OPS_CHIP[profile.role] ?? ROLE_LABELS[profile.role]}</span>
          <AccountMenu
            name={profile.full_name ?? ""}
            groupName={null}
            roleLabel={ROLE_LABELS[profile.role]}
            logoutHref="/login"
          />
        </div>
      </div>
      <GameTrack phases={phases} status={status} serverNow={serverNow} />
    </header>
  );
}
