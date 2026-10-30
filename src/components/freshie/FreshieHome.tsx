"use client";

import { displayLabel } from "@/lib/displayLabel";

import {
  ArrowRight,
  ChevronDown,
  Coins,
  Compass,
  Gamepad2,
  GraduationCap,
  HelpCircle,
  Languages,
  ListChecks,
  Pencil,
  Puzzle,
  ScanLine,
  Trophy,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { GAME_PHASES, SPONSORS, SPONSORS_ARE_EXAMPLES } from "@/components/home/data";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { ChallengeBanner } from "@/components/ChallengeBanner";
import { GroupBadge } from "@/components/GroupBadge";
import { usePhases, usePhaseTimer } from "@/components/PhaseTimerProvider";
import { useProfile } from "@/components/ProfileProvider";
import { EDIT_PROFILE_EVENT } from "@/components/TopNav";
import { useGroup } from "@/components/useGroup";
import { useScoreboard } from "@/components/useScoreboard";
import { countdownParts, useEventCountdown } from "@/components/useEventCountdown";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PIECES_PER_SET, PROJECTOR_LOCATIONS, type Group } from "@/lib/types";
import { formatCountdown, friendlyError } from "@/lib/utils";

import "./freshie.css";
import { faciFromProfile, FACI_PROFILE_SAVED_EVENT, type FaciProfile, type FaciRow } from "./faciProfiles";
import { FaciAvatar, ProfileEditor } from "./ProfileEditor";
import { FreshieSky, type SkyCabin } from "./FreshieSky";
import { GroupCodeStop } from "./GroupCodeStop";
import { ProjectorKeys } from "./items/sections";
import { useItemsData } from "./items/useItemsData";
import { groupSwatch, themeFromColor } from "./groupTheme";

// Freshie Home (/dashboard for Freshies and Facilitators) — the logged-in
// version of the public welcome page, in the Vortexa "Night Ticket" style.
// Four full-screen stops read one at a time (scroll snapping), each about
// the Freshie's own group:
//   01 Welcome + countdown (Live control's schedule timer), plus the running game.
//      Vortexa lockup, then "Welcome <group> Freshie!".
//   02 Group code (facilitator only: password and QR; the Checklist is the
//      center tab, /checklist)
//   03 Your Facilitator (Freshie) or You & Your Partner (Faci; own card has
//      an edit pencil). Real profiles from fn_group_facis().
//   03 Your Progress (tokens, puzzle pieces per key, FAQ)
//   04 Scoreboard (own group highlighted)
//   05 How the game works
// The day's programme is on the Schedule page, not here.
// Every other role gets StaffDashboard
// (see app/(app)/dashboard/page.tsx).
//
// Data: the scoreboard reads fn_scoreboard(), the same token_balance the
// admin token board shows.
// Per-group colour: --fh-accent / --fh-glow / --fh-blue come from groups.color.
// Background: FreshieSky (scrolls with the page, ends in a city whose ferris
// wheel has one cabin per group, coloured from the scoreboard rows).

const STOPS = [
  { id: "fh-welcome", label: "Welcome" },
  { id: "fh-faci", label: "Facilitator" },
  { id: "fh-pass", label: "Progress" },
  { id: "fh-scores", label: "Scores" },
  { id: "fh-game", label: "Game" },
] as const;

const CODE_STOP = { id: "fh-code", label: "Code" };

function homeStops(isFaci: boolean) {
  if (!isFaci) return [...STOPS];
  // A Faci gets the group code first, then their own card and their partner's.
  return [STOPS[0], CODE_STOP, { id: "fh-faci", label: "Partner" }, ...STOPS.slice(2)];
}

/** The name a Faci chose for the group, else its number name ("Group 1"). */
function groupLabel(group: Group) {
  return group.display_name?.trim() || group.name;
}

export function goTo(id: string) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

// ── 01 Welcome ───────────────────────────────────────────────────────────────

export function Countdown() {
  // D-day, then Day 2 and the phases between live games (see useEventCountdown).
  const { label, seconds } = useEventCountdown();
  const t = countdownParts(seconds);

  const pad = (n: number | undefined) => (n === undefined ? "--" : String(n).padStart(2, "0"));
  const units = [
    { label: "DAYS", val: t?.d },
    { label: "HRS", val: t?.h },
    { label: "MIN", val: t?.m },
    { label: "SEC", val: t?.s },
  ];

  return (
    <div className="fh-countwrap">
      <div className="fh-clabel fh-mono">{label}</div>
      <div className="fh-count" role="timer" aria-label={label.toLowerCase()}>
        {units.map((u, i) => (
          <div key={u.label} className="fh-cell">
            <b className="fh-slab" style={i === 0 ? { color: "var(--fh-blue-light)" } : undefined}>
              {pad(u.val)}
            </b>
            <span className="fh-mono">{u.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Live phase card (same data as <PhaseTimer/>). Null when no phase is running. */
export function PhaseCard() {
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
      <ChallengeBanner />
      <div className="fh-phasecard-top fh-mono">
        <i aria-hidden />
        {current.state === "paused" ? "PAUSED" : current.is_endgame ? "ENDGAME" : "LIVE"} / PHASE {i + 1} OF{" "}
        {phases.length}
      </div>
      <b className="fh-slab">{current.name}</b>
      {/* Games started by hand in Live control have no end time. */}
      {current.ends_at || current.state === "paused" ? (
        <>
          <div className="fh-phasecard-time fh-slab">{formatCountdown(remaining)}</div>
          <div className="fh-phasecard-bar" aria-hidden>
            <i style={{ width: `${progress * 100}%` }} />
          </div>
        </>
      ) : (
        <div className="fh-phasecard-time fh-slab">LIVE</div>
      )}
      {next && <small>Next: {next.name}</small>}
    </div>
  );
}

function WelcomeStop({
  name,
  group,
  isFaci,
}: {
  name: string;
  group: Group | null;
  isFaci: boolean;
}) {
  const { phases } = usePhases();
  const live = phases.some((p) => p.state === "active" || p.state === "paused");
  return (
    <section id="fh-welcome" className="fh-stop fh-center" aria-labelledby="fh-welcome-title">
      <div className="fh-eyebrow fh-mono">XMUM 26/12 Orientation</div>
      <h1 id="fh-welcome-title" className="fh-welcome-title">
        <span className="fh-pre fh-slab">WELCOME TO</span>
        <span className="fh-mark">Vortexa</span>
      </h1>
      {isFaci ? (
        <p className="fh-hello">
          Hi <b>{name || "there"}</b>
          {group && (
            <>
              {" "}
              / you&apos;re in <b>{group.name}</b>
            </>
          )}
        </p>
      ) : (
        <p className="fh-hello">
          Welcome {group && <b>{groupLabel(group)}</b>} Freshie!
        </p>
      )}
      {/* One timer at a time: the running game while a phase is on or paused,
          else the event countdown (follows the Schedule). */}
      {live ? <PhaseCard /> : <Countdown />}
      <div className="fh-actions">
        <Link href={isFaci ? "/checklist" : "/scan"} className="fh-btn fh-btn-primary">
          {isFaci ? <ListChecks size={18} aria-hidden /> : <ScanLine size={18} aria-hidden />}
          {isFaci ? "Checklist" : "Scan a QR"}
        </Link>
        <button type="button" className="fh-btn fh-btn-ghost" onClick={() => goTo(isFaci ? "fh-code" : "fh-faci")}>
          My Group ↓
        </button>
      </div>
      <Credits />
    </section>
  );
}

// ── 02 Your Facilitator (Freshie only) ───────────────────────────────────────

/** Instagram glyph (lucide has no brand icons). */
function InstagramIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}


/**
 * The Facis of a group from fn_group_facis(), kept live: a Faci or Freshie
 * sees the Facis of their own group with their profile fields. Reloads when
 * Admin changes the group's Facis (profiles) or a Faci edits a profile
 * (faci_profiles; realtime only delivers rows the caller may read, so a
 * Freshie reloads when the page comes back into view instead).
 * With `meId` the viewer's own card comes first. Null while loading.
 */
function useGroupFacis(groupId: number | null, meId: string, enabled: boolean): FaciProfile[] | null {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [facis, setFacis] = useState<FaciProfile[] | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!groupId) {
      setFacis([]);
      return;
    }
    let active = true;
    async function load() {
      const { data } = await supabase.rpc("fn_group_facis");
      if (!active) return;
      const rows = ((data ?? []) as FaciRow[]).map((r) => faciFromProfile(r, meId));
      setFacis([...rows.filter((f) => f.isMe), ...rows.filter((f) => !f.isMe)]);
    }
    load();
    const channel = supabase
      .channel(`fh-facis-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `group_id=eq.${groupId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "faci_profiles" }, load)
      .subscribe();
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(FACI_PROFILE_SAVED_EVENT, load);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(FACI_PROFILE_SAVED_EVENT, load);
      supabase.removeChannel(channel);
    };
  }, [supabase, groupId, meId, enabled]);

  return facis;
}

function FaciStop({
  groupId,
  viewer,
  team,
  onEditMe,
}: {
  groupId: number | null;
  /** Set for a Faci: their group's real Facis, their own card first (YOU, edit pencil). */
  viewer?: { id: string; name: string } | null;
  /** A Faci's group, loaded by FreshieHome so the header avatar shares it. Null while loading. */
  team?: FaciProfile[] | null;
  /** Opens the profile editor (pencil on the Faci's own card). */
  onEditMe?: () => void;
}) {
  const freshie = useGroupFacis(groupId, "", !viewer);
  // Until the list loads, a Faci sees at least their own card.
  const facis = viewer
    ? (team ?? [faciFromProfile({ id: viewer.id, full_name: viewer.name }, viewer.id)])
    : (freshie ?? []);
  // Collapsed: photo, name, Instagram. One card open at a time so a group
  // with several Facis still fits on one screen.
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <section id="fh-faci" className="fh-stop" aria-labelledby="fh-faci-title">
      <div className="fh-stop-head fh-stop-head-row">
        <h2 id="fh-faci-title" className="fh-h2 fh-slab">
          {viewer ? (
            <>You &amp; Your Partner{facis.length > 2 ? "s" : ""}</>
          ) : (
            <>Your Facilitator{facis.length > 1 ? "s" : ""}</>
          )}
        </h2>
      </div>
      <ul className="fh-facis">
        {facis.map((f) => {
          const open = openId === f.id;
          return (
            <li key={f.id} className="fh-faci" data-open={open || undefined} data-me={f.isMe || undefined}>
              <div className="fh-faci-head">
                <FaciAvatar name={f.name} avatarUrl={f.avatarUrl} />
                <div className="fh-faci-id">
                  {/* The button stretches over the whole row; the Instagram chip sits above it. */}
                  <button
                    type="button"
                    className="fh-faci-toggle"
                    aria-expanded={open}
                    aria-controls={`fh-faci-${f.id}`}
                    onClick={() => setOpenId(open ? null : f.id)}
                  >
                    <b className="fh-faci-name fh-slab">{f.name}</b>
                    {f.isMe && <span className="fh-faci-you fh-mono">YOU</span>}
                  </button>
                  <div className="fh-faci-links">
                    {!f.instagram ? (
                      // No handle yet: greyed and inactive until the Faci adds one.
                      <span className="fh-faci-ig" data-empty aria-disabled="true">
                        <InstagramIcon size={14} />Instagram
                      </span>
                    ) : (
                      <a
                        className="fh-faci-ig"
                        href={`https://instagram.com/${encodeURIComponent(f.instagram)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <InstagramIcon size={14} />@{f.instagram}
                      </a>
                    )}
                  </div>
                </div>
                <ChevronDown size={20} aria-hidden className="fh-faci-chev" />
              </div>
              {/* Always rendered so it can slide open; inert keeps it out of tab order and screen readers while closed. */}
              <div id={`fh-faci-${f.id}`} className="fh-faci-drawer" inert={!open}>
                <div className="fh-faci-clip">
                  <div className="fh-faci-body">
                    {f.isMe && onEditMe && (
                      <button type="button" className="fh-faci-edit" aria-label="Edit your profile" onClick={onEditMe}>
                        <Pencil size={15} strokeWidth={2.2} aria-hidden />
                      </button>
                    )}
                    {f.programme && (
                      <small className="fh-faci-prog">
                        <GraduationCap size={14} aria-hidden /> {displayLabel(f.programme)}
                      </small>
                    )}
                    {f.intro && <p className="fh-faci-intro">“{f.intro}”</p>}
                    {f.languages.length > 0 && (
                      <div className="fh-faci-langs">
                        <Languages size={14} aria-hidden />
                        {f.languages.map((lang) => (
                          <span key={lang} className="fh-faci-lang">{lang}</span>
                        ))}
                      </div>
                    )}
                    {!f.programme && !f.intro && f.languages.length === 0 && (
                      <small className="fh-faci-empty">No profile details yet.</small>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {viewer && team && team.length < 2 && (
        <p className="fh-faci-solo">No partner assigned yet. Admin assigns Facilitators in Freshie Control.</p>
      )}
      {!viewer && freshie && freshie.length === 0 && (
        <p className="fh-faci-solo">Your Facilitators will show here once they are assigned to your group.</p>
      )}
    </section>
  );
}

// ── 03 Your progress ─────────────────────────────────────────────────────────

function ProgressStop({ group, loading }: { group: Group | null; loading: boolean }) {
  // Same live data as the Items page, so both always show the same keys.
  const { data: items } = useItemsData();
  const owned = PROJECTOR_LOCATIONS.reduce((sum, loc) => sum + items.pieces[loc].length, 0);

  return (
    <section id="fh-pass" className="fh-stop" aria-labelledby="fh-pass-title">
      <div className="fh-stop-head fh-stop-head-row">
        <h2 id="fh-pass-title" className="fh-h2 fh-slab">Your Progress</h2>
        {group && (
          <Link href="/inventory" className="fh-prog-link">
            Items <ArrowRight size={15} aria-hidden />
          </Link>
        )}
      </div>
      {loading ? (
        <div className="fh-skel" aria-hidden />
      ) : !group ? (
        <div className="fh-pending">
          <div className="fh-eb fh-mono">● Group Pending</div>
          <p>
            You have not been assigned to a group yet. Check again after the registration counter finishes your
            check-in.
          </p>
        </div>
      ) : (
        <div className="fh-prog">
          {/* Display only: the Items link sits in the heading. */}
          <div className="fh-next fh-prog-tokens">
            {/* Same gold coin as the Tokens tile on the Items page. */}
            <span className="fh-next-ic fi-item-art" data-item="tokens" aria-hidden>
              <Coins size={22} strokeWidth={2.2} />
            </span>
            <span>
              <b className="fh-prog-title">Tokens</b>
              <b className="fh-prog-num fh-slab">{group.token_balance}</b>
            </span>
          </div>

          <div className="fh-prog-puzzle">
            <div className="fh-prog-head">
              <span className="fh-tile-ic" style={{ background: "#E0B4FC24", color: "#E0B4FC" }} aria-hidden>
                <Puzzle size={20} />
              </span>
              <span>
                <b className="fh-prog-title">Puzzle Pieces</b>
                <small className="fh-mono">
                  {owned}/{PROJECTOR_LOCATIONS.length * PIECES_PER_SET}
                </small>
              </span>
            </div>
            <div className="fh-prog-keys">
              <ProjectorKeys data={items} arrivals={{}} />
            </div>
          </div>

          <Link href="/faq" className="fh-tile fh-prog-faq">
            <span className="fh-tile-ic" style={{ background: "#FE06AB24", color: "#FE06AB" }} aria-hidden>
              <HelpCircle size={20} />
            </span>
            <b className="fh-prog-title">FAQ</b>
            <small>Rules, help and contacts</small>
            <ArrowRight size={18} aria-hidden />
          </Link>
        </div>
      )}
    </section>
  );
}

// ── How the game works ────────────────────────────────────────────────────

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
        <h2 id="fh-game-title" className="fh-h2 fh-slab">How It Works</h2>
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

// ── Scoreboard ────────────────────────────────────────────────────────────

type ScoreRow = { id: number; name: string; color: string | null; token_balance: number };
const NO_ROWS: ScoreRow[] = [];

function ScoresStop({ groupId, onRows }: { groupId: number | null; onRows?: (rows: ScoreRow[]) => void }) {
  // Shared with Staff Home and cached between visits (useScoreboard).
  const board = useScoreboard();
  const rows: ScoreRow[] = board ?? NO_ROWS;
  useEffect(() => {
    if (board) onRows?.(board);
  }, [board, onRows]);

  return (
    <section id="fh-scores" className="fh-stop" aria-labelledby="fh-scores-title">
      <div className="fh-stop-head fh-stop-head-row">
        <h2 id="fh-scores-title" className="fh-h2 fh-slab">Tokens</h2>
        <span className="fh-pill fh-mono">● LIVE FROM 28 NOV</span>
      </div>
      <ol className="fh-board">
        {rows.map((row) => {
          const me = row.id === groupId;
          return (
            <li key={row.id} className="fh-team" data-me={me || undefined}>
              <GroupBadge id={row.id} color={groupSwatch(row.id, row.color)} />
              <b>
                {row.name}
                {me && <span className="fh-you fh-mono">YOU</span>}
              </b>
              <span className="fh-team-sc fh-slab">{row.token_balance}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Organiser + sponsors, under the Welcome buttons. Same list as the public homepage. */
export function Credits() {
  return (
    <div className="fh-credits" data-example-sponsors={SPONSORS_ARE_EXAMPLES || undefined}>
      <div className="fh-credits-col">
        <span className="fh-credits-label fh-mono">Organised by</span>
        <Image
          src="/xmum-logo-horizontal-white.png"
          alt="Xiamen University Malaysia"
          width={1024}
          height={211}
          className="fh-credits-xmum"
        />
      </div>
      <span className="fh-credits-sep" aria-hidden />
      <div className="fh-credits-col">
        <span className="fh-credits-label fh-mono">
          Supported by{SPONSORS_ARE_EXAMPLES && <span className="fh-credits-example"> (Example)</span>}
        </span>
        <ul className="fh-credits-sponsors">
          {SPONSORS.map((s, i) => {
            const body = s.logo ? (
              <Image src={s.logo} alt={s.name} width={240} height={102} className="fh-sponsor-logo" />
            ) : (
              <span className="fh-sponsor-ph">{s.name}</span>
            );
            return (
              <li key={i}>
                {s.href ? (
                  <a href={s.href} target="_blank" rel="noopener noreferrer">
                    {body}
                  </a>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ── Chrome: header, account menu, stop bar ───────────────────────────────────

export function AccountMenu({
  name,
  groupName,
  roleLabel,
  logoutHref,
  avatarUrl,
  onEditProfile,
}: {
  name: string;
  groupName: string | null;
  roleLabel: string;
  logoutHref: string;
  /** Faci only: same photo as their Facilitator card (null shows initials). */
  avatarUrl?: string | null;
  /** Faci only: shows "Edit Profile" in the menu. */
  onEditProfile?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  async function signOut() {
    await supabaseBrowser().auth.signOut({ scope: "local" });
    window.location.href = logoutHref;
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className={roleLabel === "Freshie" ? "fh-avatar fh-avatar-label" : "fh-avatar fh-avatar-me"}
        aria-label="Account"
        aria-expanded={open}
        aria-controls="fh-account"
        data-profile-account={onEditProfile ? "" : undefined}
        onClick={() => setOpen(!open)}
      >
        {roleLabel === "Freshie" ? (
          <>
            Freshie
            <ChevronDown size={14} aria-hidden />
          </>
        ) : (
          <FaciAvatar name={name} avatarUrl={avatarUrl ?? null} size={40} plain />
        )}
      </button>
      {open && (
        <div id="fh-account" className="fh-menu" role="menu">
          <b>{name || roleLabel}</b>
          <span>
            {roleLabel}
            {groupName && roleLabel !== "Freshie" ? `, ${groupName}` : ""}
          </span>
          {onEditProfile && (
            <button
              type="button"
              role="menuitem"
              className="fh-menu-edit"
              onClick={() => {
                setOpen(false);
                onEditProfile();
              }}
            >
              <Pencil size={15} aria-hidden /> Edit Profile
            </button>
          )}
          <button type="button" role="menuitem" onClick={signOut}>
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Which stop is on screen. Keeps its own state so a stop change re-renders
 * only this bar, not the whole page (sky, scoreboard, keys), which made the
 * fill animation stutter. The fill animates width, not transform: Safari can
 * skip transform transitions under the header's backdrop-filter.
 */
export function StopBar({ stops }: { stops: readonly { id: string; label: string }[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const els = stops.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(stops.findIndex((s) => s.id === e.target.id));
        }
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [stops]);

  return (
    <div className="fh-stopbar fh-mono" aria-hidden>
      <b>{String(active + 1).padStart(2, "0")}</b>
      <span className="fh-stopbar-track">
        <span style={{ width: `${((active + 1) / stops.length) * 100}%` }} />
      </span>
      <span>{stops[active]?.label}</span>
    </div>
  );
}

export function FreshieHome() {
  const profile = useProfile();
  const { group, loading } = useGroup();
  const theme = themeFromColor(group?.color);
  const isFaci = profile.role === "faci";
  const roleLabel = isFaci ? "Facilitator" : "Freshie";
  const stops = useMemo(() => homeStops(isFaci), [isFaci]);
  // A Faci's name and group, shared by the header avatar, Welcome, their card
  // and the profile editor, so an edit shows everywhere at once.
  const [myName, setMyName] = useState(profile.full_name ?? "");
  const [editing, setEditing] = useState(false);

  // TopNav's "Edit Profile" (landscape): an event on this page, or
  // /dashboard?edit=profile from another page.
  useEffect(() => {
    if (!isFaci) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("edit") === "profile") {
      setEditing(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
    const open = () => setEditing(true);
    window.addEventListener(EDIT_PROFILE_EVENT, open);
    return () => window.removeEventListener(EDIT_PROFILE_EVENT, open);
  }, [isFaci]);
  const team = useGroupFacis(profile.group_id, profile.id, isFaci);
  const teamView = useMemo(
    () => team?.map((f) => (f.isMe ? { ...f, name: myName || f.name } : f)) ?? null,
    [team, myName]
  );
  const me: FaciProfile =
    teamView?.find((f) => f.isMe) ?? faciFromProfile({ id: profile.id, full_name: myName }, profile.id);
  // Scoreboard rows double as the ferris wheel's cabins (one per group).
  const [cabins, setCabins] = useState<SkyCabin[]>([]);

  // Section-by-section snapping, this page only (same idea as the homepage).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("fh-snap");
    return () => root.classList.remove("fh-snap");
  }, []);

  const themeVars = {
    "--fh-accent": theme.accent,
    "--fh-glow": theme.glow,
    "--fh-blue": theme.accent,
    "--fh-blue-light": theme.accentLight,
    "--fh-on-blue": theme.onAccent,
  } as React.CSSProperties;

  return (
    <div
      className={`fh ${vxDisplay.variable} ${vxSlab.variable}`}
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
      <FreshieSky cabins={cabins} myGroupId={profile.group_id} />

      <header className="fh-head">
        <div className="fh-head-row">
          <div className="fh-head-l">
            <button type="button" className="fh-brand" onClick={() => goTo("fh-welcome")} aria-label="Vortexa — back to top">
              <Image src="/vortexa-logo-sm.webp" alt="" width={320} height={184} priority style={{ width: "auto" }} />
            </button>
          </div>
          <div className="fh-head-r">
            <span className="fh-chip fh-mono">{roleLabel}</span>
            <AccountMenu
              name={isFaci ? myName : (profile.full_name ?? "")}
              avatarUrl={isFaci ? me.avatarUrl : null}
              onEditProfile={isFaci ? () => setEditing(true) : undefined}
              groupName={group?.name ?? null}
              roleLabel={roleLabel}
              logoutHref={isFaci ? "/login" : "/"}
            />
          </div>
        </div>
        <StopBar stops={stops} />
      </header>

      <WelcomeStop name={isFaci ? myName : (profile.full_name ?? "")} group={group} isFaci={isFaci} />
      {isFaci && <GroupCodeStop group={group} />}
      <FaciStop
        groupId={profile.group_id}
        viewer={isFaci ? { id: profile.id, name: myName } : null}
        team={teamView}
        onEditMe={() => setEditing(true)}
      />
      <ProgressStop group={group} loading={loading} />
      <ScoresStop groupId={profile.group_id} onRows={setCabins} />
      <GameStop />

      {isFaci && (
        <ProfileEditor
          open={editing}
          onClose={() => setEditing(false)}
          me={me}
          userId={profile.id}
          themeVars={themeVars}
          onSaved={setMyName}
        />
      )}
    </div>
  );
}
