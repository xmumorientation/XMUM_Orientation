"use client";

import Image from "next/image";
import Link from "next/link";

import { AccountMenu } from "@/components/freshie/FreshieHome";
import { VORTEXA_THEME } from "@/components/freshie/groupTheme";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { PhaseTimer } from "@/components/PhaseTimer";
import { useProfile } from "@/components/ProfileProvider";
import { ROLE_LABELS, type UserRole } from "@/lib/types";

import "@/components/freshie/freshie.css";
import "./staff-home.css";

// HOGM's, HOF's and GM's header on Ops (GM: Station), Map, Scores and Schedule
// (phones and portrait tablets): the same logo, role chip and account menu as their Home
// (StaffHome), in normal flow above the scroller. The logo goes Home; Log
// Out is in the account menu. The running game is a pill in the middle of
// the bar (PhaseTimer compact), as on TopNav.
// Landscape tablets and desktops use TopNav instead.

/** Short role name for the header chip. */
export const OPS_CHIP: Partial<Record<UserRole, string>> = { hof: "HOF", hogm: "HOGM", committee: "Committee", gm: "GM" };

export function OpsHeader() {
  const profile = useProfile();
  const t = VORTEXA_THEME;
  return (
    <header
      className={`fh fh-vx ops-head ${vxDisplay.variable} ${vxSlab.variable}`}
      style={
        {
          "--fh-accent": t.accent,
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
          <PhaseTimer compact />
        </div>
        <div className="fh-head-r">
          <span className="fh-chip fh-mono">{OPS_CHIP[profile.role] ?? ROLE_LABELS[profile.role]}</span>
          <AccountMenu
            name={profile.full_name ?? ""}
            groupName={null}
            roleLabel={ROLE_LABELS[profile.role]}
            logoutHref="/login"
          />
        </div>
      </div>
    </header>
  );
}
