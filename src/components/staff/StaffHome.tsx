"use client";

import { Activity, ArrowRight, CalendarDays, Check, Coins, Copy, Gift, Map, Monitor, Sparkles } from "lucide-react";
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
import { useMyBlindBoxes } from "@/components/BlindBoxCard";
import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import { useProfile } from "@/components/ProfileProvider";
import { OPS_CHIP } from "@/components/staff/OpsHeader";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ROLE_LABELS, type UserRole } from "@/lib/types";

import "@/components/freshie/freshie.css";
import "./staff-home.css";

// Home (/dashboard) for HOF, HOGM and Committee (OPS_ROLES). Same layout as
// Freshie Home: one-screen stops that snap, starting with the Welcome stop
// (Vortexa lockup, countdown, live game, two buttons, credits), in the public
// Welcome page's colours instead of a group colour (VORTEXA_THEME, .fh-vx in
// staff-home.css). Then the account's own blind boxes and QR, the scoreboard
// and the event tools. Navigation is the tab bar (phones and portrait tablets)
// or TopNav (landscape tablets and desktops).

const STOPS = [
  { id: "sh-welcome", label: "Welcome" },
  { id: "sh-bb", label: "Blind box" },
  { id: "sh-scores", label: "Scores" },
  { id: "sh-tools", label: "Tools" },
] as const;

type HomeGroup = { id: number; name: string; color: string | null; token_balance: number };

/** Groups and their tokens, live: the scoreboard and the sky's cabins. */
function useGroups() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [groups, setGroups] = useState<HomeGroup[] | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: gs } = await supabase.from("groups").select("id, name, color, token_balance").order("id");
      if (!active) return;
      setGroups(
        ((gs as HomeGroup[]) ?? [])
          .map((g) => ({ ...g, token_balance: g.token_balance ?? 0 }))
          .sort((a, b) => b.token_balance - a.token_balance || a.id - b.id)
      );
    }
    load();
    const channel = supabase
      .channel(`sh-groups-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, load)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return groups;
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
        <span>{next ? `Next: ${next.name} / started from Live control` : "Games start from Live control"}</span>
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
        Hi <b>{name || "there"}</b> / {ROLE_LABELS[role]}
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
        <button type="button" className="fh-btn fh-btn-ghost" onClick={() => goTo("sh-bb")}>
          More Info ↓
        </button>
      </div>
      <Credits />
    </section>
  );
}

/** The account's own blind boxes: what is left and the QR a Freshie scans. Same data as BlindBoxCard. */
function BlindBoxStop() {
  const { loaded, error, sellers, copy, copied } = useMyBlindBoxes();
  const left = sellers.reduce((n, s) => n + s.left, 0);
  return (
    <section id="sh-bb" className="fh-stop" aria-labelledby="sh-bb-title">
      <div className="fh-stop-head fh-stop-head-row">
        <h2 id="sh-bb-title" className="fh-h2 fh-slab">My Blind Box</h2>
        {sellers.length > 0 && <span className="fh-pill fh-mono">{left} LEFT</span>}
      </div>
      {error && <p className="sh-bb-err" role="alert">{error}</p>}
      {!loaded ? (
        <p className="sh-bb-note">Loading…</p>
      ) : sellers.length === 0 ? (
        <div className="sh-bb-empty">
          <span className="sh-tool-ic" aria-hidden>
            <Gift size={20} />
          </span>
          <div>
            <b>No blind boxes yet</b>
            <small>When Admin gives you boxes to sell, your QR shows up here.</small>
          </div>
        </div>
      ) : (
        <ul className="sh-bb-list">
          {sellers.map((s) => (
            <li key={s.id} className="sh-bb">
              <div className="sh-bb-info">
                <span className="sh-bb-who fh-mono">{s.station ? `Station ${s.station.name} / shared` : "Your own boxes"}</span>
                <ul className="sh-bb-types">
                  {s.rows.map((r) => (
                    <li key={r.id}>
                      <b>
                        {r.type?.name ?? "Box"}
                        {r.type?.is_special && <Sparkles size={14} aria-label="special" />}
                      </b>
                      <span className="fh-slab">
                        {Math.max(r.quantity - r.opened, 0)}
                        <small>/{r.quantity}</small>
                      </span>
                      <small>{r.type ? (r.type.price > 0 ? `${r.type.price} token${r.type.price !== 1 ? "s" : ""}` : "Free") : ""}</small>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="sh-bb-code">
                {!s.live ? (
                  <p className="sh-bb-state" data-tone="off">Switched off by Admin. This code doesn&apos;t work right now.</p>
                ) : s.left <= 0 ? (
                  <p className="sh-bb-state">All boxes sold.</p>
                ) : s.qr ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.qr.qr} alt="Blind box QR code" className="sh-bb-qr" />
                    <small className="sh-bb-note">A Freshie scans this after your mini-game. Each group can buy one box.</small>
                    <button type="button" className="fh-btn fh-btn-ghost sh-bb-copy" onClick={() => copy(s.id, s.qr!.url)}>
                      {copied === s.id ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                      {copied === s.id ? "Copied" : "Copy link"}
                    </button>
                  </>
                ) : (
                  <p className="sh-bb-note">Loading QR…</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ScoresStop({ groups }: { groups: HomeGroup[] | null }) {
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
  const groups = useGroups();

  // Section-by-section snapping, this page only (same as Freshie Home).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("fh-snap");
    return () => root.classList.remove("fh-snap");
  }, []);
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
      <BlindBoxStop />
      <ScoresStop groups={groups} />
      <ToolsStop />
    </div>
  );
}
