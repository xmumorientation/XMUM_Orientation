"use client";

import {
  ArrowRight,
  Coins,
  Compass,
  Gamepad2,
  HelpCircle,
  History,
  Package,
  ScanLine,
  Trophy,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { EVENT, EVENTS, GAME_PHASES } from "@/components/home/data";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import { useProfile } from "@/components/ProfileProvider";
import { useGroup } from "@/components/useGroup";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Group } from "@/lib/types";
import { formatCountdown } from "@/lib/utils";

import "./freshie.css";
import { GROUP_COUNT, groupSwatch, groupTheme } from "./groupTheme";

// Freshie Home (/dashboard for the Freshie role only) — the logged-in
// version of the public welcome page, in the Vortexa "Night Ticket" style.
// Five full-screen stops read one at a time (scroll snapping), each about
// the Freshie's own group:
//   01 Welcome + countdown (switches to the live phase timer on the day)
//   02 Group pass (token balance, next action, shortcuts)
//   03 How the game works
//   04 Scoreboard (own group highlighted)
//   05 Today's schedule
// Staff roles still get the original light dashboard
// (see app/(app)/dashboard/page.tsx).
//
// Data: stops 01–02 use live data (event date, PhaseTimerProvider, useGroup).
// Stops 03–05 show placeholder content for now — see the TODO(backend) notes.
// Per-group colours: --fh-accent / --fh-glow come from groupTheme.ts.

const STOPS = [
  { id: "fh-welcome", label: "Welcome" },
  { id: "fh-pass", label: "My group" },
  { id: "fh-game", label: "Game" },
  { id: "fh-scores", label: "Scores" },
  { id: "fh-today", label: "Today" },
] as const;

function goTo(id: string) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

// ── 01 Welcome ───────────────────────────────────────────────────────────────

function Countdown() {
  const calc = () => {
    const diff = new Date(EVENT.dates.day1).getTime() - Date.now();
    if (diff <= 0) return null;
    return {
      d: Math.floor(diff / 86400000),
      h: Math.floor((diff % 86400000) / 3600000),
      m: Math.floor((diff % 3600000) / 60000),
      s: Math.floor((diff % 60000) / 1000),
    };
  };
  // Start undefined so server and first client render match.
  const [t, setT] = useState<ReturnType<typeof calc> | undefined>(undefined);
  useEffect(() => {
    setT(calc());
    const i = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(i);
  }, []);

  const pad = (n: number | undefined) => (n === undefined ? "--" : String(n).padStart(2, "0"));
  const units = [
    { label: "DAYS", val: t?.d },
    { label: "HRS", val: t?.h },
    { label: "MIN", val: t?.m },
    { label: "SEC", val: t?.s },
  ];

  return (
    <div className="fh-countwrap">
      <div className="fh-clabel fh-mono">{t === null ? "ORIENTATION IS ON" : "ORIENTATION BEGINS IN"}</div>
      <div className="fh-count" role="timer" aria-label="Time until orientation begins">
        {units.map((u, i) => (
          <div key={u.label} className="fh-cell">
            <b className="fh-slab" style={i === 0 ? { color: "var(--fh-blue-light)" } : undefined}>
              {t === null ? "00" : pad(u.val)}
            </b>
            <span className="fh-mono">{u.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Live phase card (same data as <PhaseTimer/>). Null when no phase is running. */
function PhaseCard() {
  const { phases, offsetMs, tick } = usePhaseTimer();
  void tick;
  const activeIdx = phases.findIndex((p) => p.state === "active");
  const i = activeIdx >= 0 ? activeIdx : phases.findIndex((p) => p.state === "paused");
  if (i < 0) return null;
  const current = phases[i];

  const remaining =
    current.state === "paused"
      ? (current.paused_remaining ?? 0)
      : current.ends_at
        ? (new Date(current.ends_at).getTime() - (Date.now() + offsetMs)) / 1000
        : 0;
  const total = Math.max(1, current.duration_minutes * 60);
  const progress = Math.min(1, Math.max(0, 1 - remaining / total));
  const next = phases[i + 1];

  return (
    <div className="fh-phasecard" data-endgame={current.is_endgame}>
      <div className="fh-phasecard-top fh-mono">
        <i aria-hidden />
        {current.state === "paused" ? "PAUSED" : current.is_endgame ? "ENDGAME" : "LIVE"} · PHASE {i + 1} OF{" "}
        {phases.length}
      </div>
      <b className="fh-slab">{current.name}</b>
      <div className="fh-phasecard-time fh-slab">{formatCountdown(remaining)}</div>
      <div className="fh-phasecard-bar" aria-hidden>
        <i style={{ width: `${progress * 100}%` }} />
      </div>
      {next && <small>Next: {next.name}</small>}
    </div>
  );
}

function WelcomeStop({ name, group }: { name: string; group: Group | null }) {
  const { phases } = usePhaseTimer();
  const live = phases.some((p) => p.state === "active" || p.state === "paused");
  return (
    <section id="fh-welcome" className="fh-stop fh-center" aria-labelledby="fh-welcome-title">
      <div className="fh-eyebrow fh-mono">XMUM Orientation 2026</div>
      <h1 id="fh-welcome-title" className="fh-welcome-title">
        <span className="fh-pre fh-slab">WELCOME TO</span>
        <span className="fh-mark">Vortexa</span>
      </h1>
      <p className="fh-hello">
        Hi <b>{name || "there"}</b>
        {group && (
          <>
            {" "}
            · you&apos;re in <b>{group.name}</b>
          </>
        )}
      </p>
      {live ? <PhaseCard /> : <Countdown />}
      <div className="fh-actions">
        <Link href="/scan" className="fh-btn fh-btn-primary">
          <ScanLine size={18} aria-hidden /> Scan a QR
        </Link>
        <button type="button" className="fh-btn fh-btn-ghost" onClick={() => goTo("fh-pass")}>
          My group ↓
        </button>
      </div>
    </section>
  );
}

// ── 02 Group pass ────────────────────────────────────────────────────────────

function GroupPass({ group, loading }: { group: Group | null; loading: boolean }) {
  if (loading) return <div className="fh-skel" aria-hidden />;
  if (!group) {
    return (
      <div className="fh-pending">
        <div className="fh-eb fh-mono">● Group pending</div>
        <p>
          You have not been assigned to a group yet. Check again after the registration counter finishes your
          check-in.
        </p>
      </div>
    );
  }
  return (
    <div className="fh-pass">
      <div className="fh-pass-main">
        <div className="fh-eb fh-mono">Group pass</div>
        <div className="fh-pass-group">{group.name}</div>
        <div className="fh-pass-num fh-slab">{group.token_balance}</div>
        <div className="fh-pass-unit">tokens in your group</div>
      </div>
      <div className="fh-pass-stub fh-mono">
        <span className="fh-live">
          <i aria-hidden />
          LIVE
        </span>
        <span>GROUP</span>
        <b className="fh-slab">{String(group.id).padStart(2, "0")}</b>
      </div>
    </div>
  );
}

function PassStop({ group, loading }: { group: Group | null; loading: boolean }) {
  return (
    <section id="fh-pass" className="fh-stop" aria-labelledby="fh-pass-title">
      <div className="fh-stop-head">
        <h2 id="fh-pass-title" className="fh-h2 fh-slab">Your pass</h2>
        <p className="fh-lead">Your group&apos;s live token balance.</p>
      </div>
      <div className="fh-pass-grid">
        <GroupPass group={group} loading={loading} />
        <div className="fh-pass-side">
          <Link href="/inventory" className="fh-next">
            <span className="fh-next-ic" aria-hidden>
              <Package size={24} />
            </span>
            <span>
              <span className="fh-eb fh-mono">Next action</span>
              <b className="fh-slab">Check your progress</b>
              <small>See your group&apos;s collected pieces &amp; rank</small>
            </span>
            <span className="fh-next-arr" aria-hidden>
              <ArrowRight size={20} strokeWidth={2.4} />
            </span>
          </Link>
          <nav className="fh-tiles" aria-label="Shortcuts">
            <Link href="/transactions" className="fh-tile">
              <span className="fh-tile-ic" style={{ background: "#FC9E3D24", color: "#FC9E3D" }} aria-hidden>
                <History size={20} />
              </span>
              <b>Token history</b>
            </Link>
            <Link href="/faq" className="fh-tile">
              <span className="fh-tile-ic" style={{ background: "#FE06AB24", color: "#FE06AB" }} aria-hidden>
                <HelpCircle size={20} />
              </span>
              <b>FAQ</b>
            </Link>
          </nav>
        </div>
      </div>
    </section>
  );
}

// ── 03 How the game works ────────────────────────────────────────────────────

const PHASE_ICON: Record<string, React.ReactNode> = {
  Compass: <Compass size={22} />,
  Gamepad2: <Gamepad2 size={22} />,
  Coins: <Coins size={22} />,
  Trophy: <Trophy size={22} />,
};
const PHASE_FILL: Record<string, string> = {
  EXPLORE: "radial-gradient(circle at 30% 30%, #0DFCFD, #0a6f8f)",
  PLAY: "radial-gradient(circle at 30% 30%, #FFB1C1, #FE06AB)",
  EARN: "radial-gradient(circle at 30% 30%, #F2FF0B, #FC9E3D)",
  COMPETE: "radial-gradient(circle at 30% 30%, #E0B4FC, #8a4fd8)",
};

function GameStop() {
  // TODO(backend): show the group's progress per step (DONE / NOW / NEXT
  // tags from the concept) once there is data for it. Steps only for now.
  return (
    <section id="fh-game" className="fh-stop" aria-labelledby="fh-game-title">
      <div className="fh-stop-head">
        <h2 id="fh-game-title" className="fh-h2 fh-slab">How it works</h2>
        <p className="fh-lead">Four steps, played as a team.</p>
      </div>
      <ol className="fh-steps">
        {GAME_PHASES.map((p, i) => (
          <li key={p.phase} className="fh-step">
            <span className="fh-step-ic" style={{ background: PHASE_FILL[p.phase] }} aria-hidden>
              {PHASE_ICON[p.icon]}
            </span>
            <b className="fh-slab">
              <span className="fh-step-no fh-mono">0{i + 1}</span> {p.label}
            </b>
            <small>{p.desc}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── 04 Scoreboard ────────────────────────────────────────────────────────────

function ScoresStop({ groupId }: { groupId: number | null }) {
  // TODO(backend): replace the placeholder rows with the real groups (name,
  // score, rank) once the scoreboard data source is decided. Scores show "—"
  // until then; the Freshie's own group is highlighted.
  const rows = Array.from({ length: GROUP_COUNT }, (_, i) => i + 1);
  return (
    <section id="fh-scores" className="fh-stop" aria-labelledby="fh-scores-title">
      <div className="fh-stop-head fh-stop-head-row">
        <h2 id="fh-scores-title" className="fh-h2 fh-slab">Scoreboard</h2>
        <span className="fh-pill fh-mono">● LIVE FROM 28 NOV</span>
      </div>
      <ol className="fh-board">
        {rows.map((id, i) => {
          const me = id === groupId;
          return (
            <li key={id} className="fh-team" data-me={me || undefined}>
              <span className="fh-team-rk fh-mono">{String(i + 1).padStart(2, "0")}</span>
              <i className="fh-team-sw" style={{ background: groupSwatch(id) }} aria-hidden />
              <b>
                Group {id}
                {me && <span className="fh-you fh-mono">YOU</span>}
              </b>
              <span className="fh-team-sc fh-slab">
                —<span className="fh-sr">No score yet</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ── 05 Today ─────────────────────────────────────────────────────────────────

const TYPE_DOT: Record<string, string> = { info: "#0DFCFD", star: "#F2FF0B", game: "#FE06AB", food: "#FC9E3D" };

function TodayStop() {
  // TODO(backend): read today's items from the Schedule page's data source
  // and mark the current / finished items. Uses the homepage placeholder
  // rundown (components/home/data.ts EVENTS) for now.
  const [dayIdx, setDayIdx] = useState(0);
  useEffect(() => {
    const today = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "Asia/Kuala_Lumpur",
    });
    const i = EVENTS.findIndex((d) => d.date === today);
    if (i >= 0) setDayIdx(i);
  }, []);
  const day = EVENTS[dayIdx] ?? EVENTS[0];

  return (
    <section id="fh-today" className="fh-stop" aria-labelledby="fh-today-title">
      <div className="fh-stop-head">
        <h2 id="fh-today-title" className="fh-h2 fh-slab">Today</h2>
        <p className="fh-lead">
          {day.day} · {day.date}
        </p>
      </div>
      <ol className="fh-tl">
        {day.items.map((it, i) => (
          <li key={i} className="fh-it" style={{ "--d": TYPE_DOT[it.type] ?? "#0DFCFD" } as React.CSSProperties}>
            <b>{it.title}</b>
            <small className="fh-mono">
              {it.time === "TBD" && it.venue === "TBD" ? "TIME & VENUE TBD" : `${it.time} · ${it.venue}`}
            </small>
          </li>
        ))}
      </ol>
      <Link href="/schedule" className="fh-btn fh-btn-ghost fh-btn-block">
        Full schedule →
      </Link>
    </section>
  );
}

// ── Chrome: header, account menu, stop bar ───────────────────────────────────

function AccountMenu({ name, groupName }: { name: string; groupName: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Same sign-out as AppShell.
  async function signOut() {
    await supabaseBrowser().auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="fh-avatar"
        aria-label="Account"
        aria-expanded={open}
        aria-controls="fh-account"
        onClick={() => setOpen(!open)}
      >
        {initials}
      </button>
      {open && (
        <div id="fh-account" className="fh-menu" role="menu">
          <b>{name || "Freshie"}</b>
          <span>Freshie{groupName ? ` · ${groupName}` : ""}</span>
          <button type="button" role="menuitem" onClick={signOut}>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export function FreshieHome() {
  const profile = useProfile();
  // Call useGroup() once per page: each call opens its own realtime channel
  // (group-<id>), and Supabase rejects a second subscription to that name.
  const { group, loading } = useGroup();
  const theme = groupTheme(profile.group_id);
  const [active, setActive] = useState(0);

  // Section-by-section snapping, this page only (same idea as the homepage).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("fh-snap");
    return () => root.classList.remove("fh-snap");
  }, []);

  useEffect(() => {
    const els = STOPS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(STOPS.findIndex((s) => s.id === e.target.id));
        }
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div
      className={`fh ${vxDisplay.variable} ${vxSlab.variable}`}
      style={{ "--fh-accent": theme.accent, "--fh-glow": theme.glow } as React.CSSProperties}
    >
      <div className="fh-bg" aria-hidden>
        <div className="fh-glow" style={{ width: 380, height: 380, background: "var(--fh-glow)", left: -150, top: 80, opacity: 0.35 }} />
        <div className="fh-glow" style={{ width: 300, height: 300, background: "#FE06AB", right: -150, bottom: 80, opacity: 0.16 }} />
        <i className="fh-spark" style={{ width: 18, height: 18, background: "#F2FF0B", left: "10%", top: "30%" }} />
        <i className="fh-spark" style={{ width: 24, height: 24, background: "linear-gradient(#FFB1C1, #FE06AB)", right: "9%", top: "58%" }} />
        <i className="fh-spark" style={{ width: 14, height: 14, background: "#0DFCFD", right: "24%", top: "18%" }} />
      </div>

      <header className="fh-head">
        <div className="fh-head-row">
          <button type="button" className="fh-brand" onClick={() => goTo("fh-welcome")} aria-label="Vortexa — back to top">
            <Image src="/vortexa-logo-sm.webp" alt="" width={320} height={184} priority style={{ width: "auto" }} />
          </button>
          <div className="fh-head-r">
            <span className="fh-chip fh-mono">Freshie</span>
            <AccountMenu name={profile.full_name ?? ""} groupName={group?.name ?? null} />
          </div>
        </div>
        <div className="fh-stopbar fh-mono" aria-hidden>
          <b>{String(active + 1).padStart(2, "0")}</b>
          <span className="fh-stopbar-track">
            <span style={{ width: `${((active + 1) / STOPS.length) * 100}%` }} />
          </span>
          <span>{STOPS[active]?.label}</span>
        </div>
      </header>

      <WelcomeStop name={profile.full_name ?? ""} group={group} />
      <PassStop group={group} loading={loading} />
      <GameStop />
      <ScoresStop groupId={profile.group_id} />
      <TodayStop />
    </div>
  );
}
