"use client";

import { Activity, ArrowRight, CalendarDays, Coins, Map, Monitor, QrCode, Trophy, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  AccountMenu,
  Countdown,
  Credits,
  goTo,
  PhaseCard,
  StopBar,
} from "@/components/freshie/FreshieHome";
import { FreshieSky, type SkyCabin } from "@/components/freshie/FreshieSky";
import { groupSwatch, VORTEXA_THEME } from "@/components/freshie/groupTheme";
import { nexusBody, vxDisplay, vxSlab } from "@/components/home/fonts";
import { usePhaseTimer } from "@/components/PhaseTimerProvider";import { useProfile } from "@/components/ProfileProvider";
import { OPS_CHIP } from "@/components/staff/OpsHeader";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ROLE_LABELS, type UserRole } from "@/lib/types";

import "@/components/freshie/freshie.css";
import "./staff-home.css";

// Home (/dashboard) for HOF, HOGM and Committee (OPS_ROLES). Same layout as
// Freshie Home's Welcome stop (Vortexa lockup, countdown, live game, two
// buttons, credits), in the public Welcome page's colours instead of a group
// colour (VORTEXA_THEME, .fh-vx in staff-home.css). Below it: the live floor,
// the scoreboard and the event tools. Navigation is the tab bar (phones and
// portrait tablets) or TopNav (landscape tablets and desktops).

const STOPS = [
  { id: "sh-welcome", label: "Welcome" },
  { id: "sh-floor", label: "Live floor" },
  { id: "sh-scores", label: "Scores" },
  { id: "sh-tools", label: "Tools" },
] as const;

type FloorGroup = { id: number; name: string; color: string | null; token_balance: number };

/** Groups (tokens) and headcounts, live. Same tables as the Ops page. */
function useFloor() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [groups, setGroups] = useState<FloorGroup[] | null>(null);
  const [checkedIn, setCheckedIn] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: gs }, { data: hcs }] = await Promise.all([
        supabase.from("groups").select("id, name, color, token_balance").order("id"),
        supabase.from("group_headcounts").select("headcount"),
      ]);
      if (!active) return;
      setGroups(
        ((gs as FloorGroup[]) ?? [])
          .map((g) => ({ ...g, token_balance: g.token_balance ?? 0 }))
          .sort((a, b) => b.token_balance - a.token_balance || a.id - b.id)
      );
      setCheckedIn(((hcs as { headcount: number }[]) ?? []).reduce((sum, r) => sum + (r.headcount ?? 0), 0));
    }
    load();
    const channel = supabase
      .channel(`sh-floor-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_headcounts" }, load)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return { groups, checkedIn };
}

/** Shown instead of the PhaseCard while no game phase runs, so the crew knows the game is not on. */
function GameIdle() {
  const { phases } = usePhaseTimer();
  const next = phases.find((p) => p.state === "pending");
  return (
    <div className="sh-idle" role="status">
      <i aria-hidden />
      <div>
        <b>No game running</b>
        <span>{next ? `Next: ${next.name} · started from Live control` : "Games start from Live control"}</span>
      </div>
    </div>
  );
}

function WelcomeStop({ name, role }: { name: string; role: UserRole }) {
  const { phases } = usePhaseTimer();
  const live = phases.some((p) => p.state === "active" || p.state === "paused");
  return (
    <section id="sh-welcome" className="fh-stop fh-center" aria-labelledby="sh-welcome-title">
      <div className="fh-eyebrow fh-mono">XMUM 26/12 Orientation</div>
      <h1 id="sh-welcome-title" className="fh-welcome-title">
        <span className="fh-pre fh-slab">WELCOME TO</span>
        <span className="fh-mark">Vortexa</span>
      </h1>
      <p className="fh-hello">
        Hi <b>{name || "there"}</b> · {ROLE_LABELS[role]}
      </p>
      {/* Same rule as Freshie Home: the running game, else the event countdown. */}
      {live ? (
        <PhaseCard />
      ) : (
        <>
          <Countdown />
          <GameIdle />
        </>
      )}
      <div className="fh-actions">
        <Link href="/committee" className="fh-btn fh-btn-primary">
          <Activity size={18} aria-hidden />
          Ops
        </Link>
        <button type="button" className="fh-btn fh-btn-ghost" onClick={() => goTo("sh-floor")}>
          More Info ↓
        </button>
      </div>
      <Credits />
    </section>
  );
}

function FloorStop({ groups, checkedIn }: { groups: FloorGroup[] | null; checkedIn: number | null }) {
  const leader = groups?.[0];
  const tiles = [
    {
      href: "/committee?view=attendance",
      Icon: Users,
      value: checkedIn == null ? "—" : checkedIn.toLocaleString("en"),
      label: "people checked in",
    },
    {
      href: "/token",
      Icon: Trophy,
      value: leader && leader.token_balance > 0 ? leader.name : "—",
      label: leader && leader.token_balance > 0 ? `leading · ${leader.token_balance.toLocaleString("en")} tokens` : "no tokens yet",
    },
    { href: "/map", Icon: Map, value: "Map", label: "where groups are now" },
  ];
  return (
    <section id="sh-floor" className="fh-stop" aria-labelledby="sh-floor-title">
      <div className="fh-stop-head fh-stop-head-row">
        <h2 id="sh-floor-title" className="fh-h2 fh-slab">Live Floor</h2>
        <span className="fh-pill fh-mono">● LIVE</span>
      </div>
      <ul className="sh-tiles">
        {tiles.map(({ href, Icon, value, label }) => (
          <li key={href}>
            <Link href={href} className="sh-tile">
              <Icon size={20} aria-hidden />
              <b className="fh-slab">{value}</b>
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScoresStop({ groups }: { groups: FloorGroup[] | null }) {
  return (
    <section id="sh-scores" className="fh-stop" aria-labelledby="sh-scores-title">
      <div className="fh-stop-head fh-stop-head-row">
        <h2 id="sh-scores-title" className="fh-h2 fh-slab">Scoreboard</h2>
        <Link href="/token" className="sh-more">
          Full scoreboard <ArrowRight size={15} aria-hidden />
        </Link>
      </div>
      <ol className="fh-board">
        {(groups ?? []).map((row, i) => (
          <li key={row.id} className="fh-team">
            <span className="fh-team-rk fh-mono">{String(i + 1).padStart(2, "0")}</span>
            <i className="fh-team-sw" style={{ background: groupSwatch(row.id, row.color) }} aria-hidden />
            <b>{row.name}</b>
            <span className="fh-team-sc fh-slab">{row.token_balance}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const TOOLS = [
  { href: "/bigscreen", Icon: Monitor, title: "Big screen", text: "Open the event display" },
  { href: "/committee#blindbox", Icon: QrCode, title: "My blind box QR", text: "Show your seller code" },
  { href: "/map", Icon: Map, title: "Campus map", text: "Stations and group locations" },
  { href: "/schedule", Icon: CalendarDays, title: "Schedule", text: "The two-day programme" },
  { href: "/token", Icon: Coins, title: "Scoreboard", text: "Live tokens and puzzle pieces" },
];

function ToolsStop() {
  return (
    <section id="sh-tools" className="fh-stop" aria-labelledby="sh-tools-title">
      <div className="fh-stop-head">
        <h2 id="sh-tools-title" className="fh-h2 fh-slab">Event Tools</h2>
      </div>
      <ul className="sh-tools">
        {TOOLS.map(({ href, Icon, title, text }) => (
          <li key={href}>
            <Link href={href} className="sh-tool">
              <span className="sh-tool-ic" aria-hidden>
                <Icon size={20} />
              </span>
              <span>
                <b>{title}</b>
                <small>{text}</small>
              </span>
              <ArrowRight size={18} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StaffHome() {
  const profile = useProfile();
  const { groups, checkedIn } = useFloor();
  const cabins: SkyCabin[] = useMemo(() => (groups ?? []).map(({ id, color }) => ({ id, color })), [groups]);
  const theme = VORTEXA_THEME;

  return (
    <div
      className={`fh fh-vx sh ${nexusBody.variable} ${vxDisplay.variable} ${vxSlab.variable}`}
      style={
        {
          "--fh-accent": theme.accent,
          "--fh-glow": theme.glow,
          "--fh-blue": theme.accent,
          "--fh-blue-light": theme.accentLight,
          "--fh-on-blue": theme.onAccent,
          "--fh-glow-strength": theme.glowStrength,
          "--fh-glow-spread": theme.glowSpread,
          "--fh-partner": theme.partner,
        } as React.CSSProperties
      }
    >
      <FreshieSky cabins={cabins} myGroupId={null} />

      <header className="fh-head">
        <div className="fh-head-row">
          <div className="fh-head-l">
            <button type="button" className="fh-brand" onClick={() => goTo("sh-welcome")} aria-label="Vortexa — back to top">
              <Image src="/vortexa-logo-sm.webp" alt="" width={320} height={184} priority style={{ width: "auto" }} />
            </button>
          </div>
          <div className="fh-head-r">
            <span className="fh-chip fh-mono">{OPS_CHIP[profile.role] ?? ROLE_LABELS[profile.role]}</span>
            <AccountMenu
              name={profile.full_name ?? ""}
              groupName={null}
              roleLabel={ROLE_LABELS[profile.role]}
              logoutHref="/login"
              links={[{ href: "/bigscreen", label: "Big screen" }]}
            />
          </div>
        </div>
        <StopBar stops={STOPS} />
      </header>

      <WelcomeStop name={profile.full_name ?? ""} role={profile.role} />
      <FloorStop groups={groups} checkedIn={checkedIn} />
      <ScoresStop groups={groups} />
      <ToolsStop />
    </div>
  );
}
