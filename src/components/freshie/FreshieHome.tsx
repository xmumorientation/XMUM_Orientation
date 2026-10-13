"use client";

import {
  ArrowRight,
  ChevronDown,
  Coins,
  Compass,
  Gamepad2,
  GraduationCap,
  HelpCircle,
  KeyRound,
  Languages,
  MapPin,
  Menu,
  Puzzle,
  ScanLine,
  Trophy,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { GAME_PHASES, SPONSORS, SPONSORS_ARE_EXAMPLES } from "@/components/home/data";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import { useProfile } from "@/components/ProfileProvider";
import { useOpenShellMenu } from "@/components/ShellMenu";
import { useGroup } from "@/components/useGroup";
import { countdownParts, useEventCountdown } from "@/components/useEventCountdown";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PIECES_PER_SET, PROJECTOR_LOCATIONS, type Group } from "@/lib/types";
import { formatCountdown, friendlyError } from "@/lib/utils";

import "./freshie.css";
import { faciProfilesFor } from "./faciProfiles";
import { FreshieSky, type SkyCabin } from "./FreshieSky";
import { itemsShown } from "./items/sampleData";
import { ProjectorKeys } from "./items/sections";
import { groupSwatch, themeFromColor } from "./groupTheme";

// Freshie Home (/dashboard for the Freshie role only) — the logged-in
// version of the public welcome page, in the Vortexa "Night Ticket" style.
// Four full-screen stops read one at a time (scroll snapping), each about
// the Freshie's own group:
//   01 Welcome + countdown (Live control's schedule timer), plus the running game.
//      Vortexa lockup, then "Welcome <group> Freshie!".
//   02 Your Facilitator (Freshie only; sample profiles from faciProfiles.ts)
//      or Checklist (facilitator only: name, attendance, location)
//   03 Your Progress (tokens, puzzle pieces per key, FAQ)
//   04 Scoreboard (own group highlighted)
//   05 How the game works
// The day's programme is on the Schedule page, not here.
// Every other role, Faci included, gets StaffDashboard
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

const CHECK_STOP = { id: "fh-check", label: "Checklist" };

function homeStops(isFaci: boolean) {
  if (!isFaci) return [...STOPS];
  // A Faci gets the checklist where Freshies meet their Faci.
  return [STOPS[0], CHECK_STOP, ...STOPS.slice(2)];
}

/** The name a Faci chose for the group, else its number name ("Group 1"). */
function groupLabel(group: Group) {
  return group.display_name?.trim() || group.name;
}

function goTo(id: string) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

// ── 01 Welcome ───────────────────────────────────────────────────────────────

function Countdown() {
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
      <div className="fh-phasecard-top fh-mono">
        <i aria-hidden />
        {current.state === "paused" ? "PAUSED" : current.is_endgame ? "ENDGAME" : "LIVE"} · PHASE {i + 1} OF{" "}
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
  const { phases } = usePhaseTimer();
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
              · you&apos;re in <b>{group.name}</b>
            </>
          )}
        </p>
      ) : (
        <p className="fh-hello">
          Welcome {group && <b>{groupLabel(group)}</b>} Freshie!
        </p>
      )}
      {/* The countdown follows Live control's schedule timer; the card shows a running game. */}
      <Countdown />
      {live && <PhaseCard />}
      <div className="fh-actions">
        <Link href={isFaci ? "/code" : "/scan"} className="fh-btn fh-btn-primary">
          {isFaci ? <KeyRound size={18} aria-hidden /> : <ScanLine size={18} aria-hidden />}
          {isFaci ? "Group code" : "Scan a QR"}
        </Link>
        <button type="button" className="fh-btn fh-btn-ghost" onClick={() => goTo(isFaci ? "fh-pass" : "fh-faci")}>
          My Group ↓
        </button>
      </div>
      <Credits />
    </section>
  );
}

// ── Checklist (facilitator only, between Welcome and Your pass) ─────────────

export function ChecklistStop({ group, groupId }: { group: Group | null; groupId: number | null }) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [displayName, setDisplayName] = useState("");
  const [slogan, setSlogan] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameNotice, setNameNotice] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  const [headcount, setHeadcount] = useState("");
  // Local / International are set on the Attendance page; keep them when this form saves Total.
  const [split, setSplit] = useState<{ local: number | null; international: number | null }>({
    local: null,
    international: null,
  });
  const [countError, setCountError] = useState<string | null>(null);
  const [countNotice, setCountNotice] = useState<string | null>(null);
  // Tap a row to open it; one at a time so the checklist stays on one screen.
  const [open, setOpen] = useState<1 | 2 | null>(null);
  const toggle = (n: 1 | 2) => setOpen((cur) => (cur === n ? null : n));

  useEffect(() => {
    if (!group || seeded) return;
    setDisplayName(group.display_name ?? "");
    setSlogan(group.slogan ?? "");
    setSeeded(true);
  }, [group, seeded]);

  useEffect(() => {
    if (!groupId) return;
    let active = true;
    supabase
      .from("group_headcounts")
      .select("headcount, local_count, international_count")
      .eq("group_id", groupId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        const row = data as {
          headcount: number;
          local_count: number | null;
          international_count: number | null;
        } | null;
        setHeadcount(row == null ? "" : String(row.headcount));
        setSplit({ local: row?.local_count ?? null, international: row?.international_count ?? null });
      });
    return () => {
      active = false;
    };
  }, [supabase, groupId]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setNameError(null);
    setNameNotice(null);
    setSavingName(true);
    const { error } = await supabase.rpc("fn_set_group_profile", {
      p_display_name: displayName,
      p_slogan: slogan,
    });
    setSavingName(false);
    if (error) setNameError(friendlyError(error));
    else setNameNotice("Saved.");
  }

  async function saveHeadcount(e: React.FormEvent) {
    e.preventDefault();
    setCountError(null);
    setCountNotice(null);
    const count = parseInt(headcount, 10);
    const { error } = await supabase.rpc("fn_set_headcount", {
      p_count: count,
      p_local: split.local,
      p_international: split.international,
    });
    if (error) setCountError(friendlyError(error));
    else setCountNotice("Saved.");
  }

  return (
    <section id="fh-check" className="fh-stop fh-check-stop" aria-labelledby="fh-check-title">
      <div className="fh-stop-head">
        <h2 id="fh-check-title" className="fh-h2 fh-slab">Checklist</h2>
        <p className="fh-lead">Three things to do with your group.</p>
      </div>
      <ol className="fh-checks">
        <li className={`fh-check${open === 1 ? " is-open" : ""}`}>
          <button
            type="button"
            className="fh-check-head"
            aria-expanded={open === 1}
            aria-controls="fh-check-1"
            onClick={() => toggle(1)}
          >
            <span className="fh-check-no fh-mono">01</span>
            <span className="fh-check-title">
              <b>Group name and slogan</b>
              <small>{group?.display_name ? group.display_name : "Not set yet"}</small>
            </span>
            <ChevronDown size={20} aria-hidden className="fh-check-chev" />
          </button>
          <div id="fh-check-1" className="fh-check-body" hidden={open !== 1}>
            <p>
              {group ? `${group.name} is your number.` : "You are not in a group yet."} Choose the name your group goes by.
            </p>
            <form onSubmit={saveProfile}>
              <label>
                Name
                <input
                  className="fh-input"
                  required
                  maxLength={40}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Group name"
                />
              </label>
              <label>
                Slogan
                <input
                  className="fh-input"
                  maxLength={80}
                  value={slogan}
                  onChange={(e) => setSlogan(e.target.value)}
                  placeholder="A short slogan"
                />
              </label>
              <button type="submit" className="fh-btn fh-btn-primary" disabled={savingName || !group}>
                Save
              </button>
              {nameError && <small className="fh-check-msg" role="alert">{nameError}</small>}
              {nameNotice && <small className="fh-check-msg">{nameNotice}</small>}
            </form>
          </div>
        </li>
        <li className={`fh-check${open === 2 ? " is-open" : ""}`}>
          <button
            type="button"
            className="fh-check-head"
            aria-expanded={open === 2}
            aria-controls="fh-check-2"
            onClick={() => toggle(2)}
          >
            <span className="fh-check-no fh-mono">02</span>
            <span className="fh-check-title">
              <b>Take attendance</b>
              <small>{headcount !== "" ? `${headcount} people` : "Not counted yet"}</small>
            </span>
            <ChevronDown size={20} aria-hidden className="fh-check-chev" />
          </button>
          <div id="fh-check-2" className="fh-check-body" hidden={open !== 2}>
            <form onSubmit={saveHeadcount}>
              <label>
                Headcount
                <input
                  className="fh-input"
                  type="number"
                  min={0}
                  required
                  value={headcount}
                  onChange={(e) => setHeadcount(e.target.value)}
                  placeholder="How many people"
                />
              </label>
              <button type="submit" className="fh-btn fh-btn-primary">
                Save
              </button>
              {countError && <small className="fh-check-msg" role="alert">{countError}</small>}
              {countNotice && <small className="fh-check-msg">{countNotice}</small>}
            </form>
          </div>
        </li>
        <li className="fh-check">
          <Link href="/checkin" className="fh-check-head">
            <span className="fh-check-no fh-mono">03</span>
            <span className="fh-check-title">
              <b>Update location</b>
              <small>Open the map and check your group in</small>
            </span>
            <MapPin size={20} aria-hidden className="fh-check-chev" />
          </Link>
        </li>
      </ol>
    </section>
  );
}

// ── 02 Your Facilitator (Freshie only) ───────────────────────────────────────

/** WhatsApp glyph (lucide has no brand icons). */
function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" strokeLinejoin="round" />
      <path d="M9.5 9.2c.3 1.6 1.7 3.3 3.4 4l1-1 1.7.8-.3 1.2c-2.6.4-6.4-3-6.3-5.9l1.2-.4.8 1.6z" fill="currentColor" stroke="none" />
    </svg>
  );
}

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

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

function FaciStop({ groupId }: { groupId: number | null }) {
  const facis = faciProfilesFor(groupId);
  // Collapsed: photo, name, Instagram. One card open at a time so a group
  // with several Facis still fits on one screen.
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <section id="fh-faci" className="fh-stop" aria-labelledby="fh-faci-title">
      <div className="fh-stop-head fh-stop-head-row">
        <h2 id="fh-faci-title" className="fh-h2 fh-slab">
          Your Facilitator{facis.length > 1 ? "s" : ""}
        </h2>
        <span className="fh-pill fh-mono fh-faci-sample">Sample</span>
      </div>
      <ul className="fh-facis">
        {facis.map((f) => {
          const open = openId === f.id;
          return (
            <li key={f.id} className="fh-faci" data-open={open || undefined}>
              <div className="fh-faci-head">
                <span className="fh-faci-avatar" aria-hidden>
                  {f.avatarUrl ? (
                    <Image src={f.avatarUrl} alt="" width={160} height={160} />
                  ) : (
                    <span className="fh-slab">{initialsOf(f.name)}</span>
                  )}
                </span>
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
                  </button>
                  {/* Sample handles and numbers are made up, so they do not link out yet. */}
                  {(f.instagram || f.whatsapp) && (
                    <div className="fh-faci-links">
                      {f.instagram && (
                        <span className="fh-faci-ig">
                          <InstagramIcon size={14} />@{f.instagram}
                        </span>
                      )}
                      {f.whatsapp && (
                        <span className="fh-faci-wa">
                          <WhatsAppIcon size={14} />WhatsApp
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <ChevronDown size={20} aria-hidden className="fh-faci-chev" />
              </div>
              {/* Always rendered so it can slide open; inert keeps it out of tab order and screen readers while closed. */}
              <div id={`fh-faci-${f.id}`} className="fh-faci-drawer" inert={!open}>
                <div className="fh-faci-clip">
                  <div className="fh-faci-body">
                    <small className="fh-faci-prog">
                      <GraduationCap size={14} aria-hidden /> {f.programme}
                    </small>
                    <p className="fh-faci-intro">“{f.intro}”</p>
                    <div className="fh-faci-langs">
                      <Languages size={14} aria-hidden />
                      {f.languages.map((lang) => (
                        <span key={lang} className="fh-faci-lang">{lang}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── 03 Your progress ─────────────────────────────────────────────────────────

function ProgressStop({ group, loading }: { group: Group | null; loading: boolean }) {
  const router = useRouter();
  // Same keys as the Items page (sample data until Items goes live).
  const items = useMemo(() => itemsShown(), []);
  const owned = PROJECTOR_LOCATIONS.reduce((sum, loc) => sum + items.pieces[loc].length, 0);

  return (
    <section id="fh-pass" className="fh-stop" aria-labelledby="fh-pass-title">
      <div className="fh-stop-head">
        <h2 id="fh-pass-title" className="fh-h2 fh-slab">Your Progress</h2>
      </div>
      {loading ? (
        <div className="fh-skel" aria-hidden />
      ) : !group ? (
        <div className="fh-pending">
          <div className="fh-eb fh-mono">● Group pending</div>
          <p>
            You have not been assigned to a group yet. Check again after the registration counter finishes your
            check-in.
          </p>
        </div>
      ) : (
        <div className="fh-prog">
          <Link href="/transactions" className="fh-next fh-prog-tokens">
            {/* Same gold coin as the Tokens tile on the Items page. */}
            <span className="fh-next-ic fi-item-art" data-item="tokens" aria-hidden>
              <Coins size={22} strokeWidth={2.2} />
            </span>
            <span>
              <b className="fh-prog-title">Tokens</b>
              <b className="fh-prog-num fh-slab">{group.token_balance}</b>
            </span>
            <span className="fh-next-arr" aria-label="Token history">
              <ArrowRight size={20} strokeWidth={2.4} />
            </span>
          </Link>

          <div className="fh-prog-puzzle">
            <Link href="/inventory" className="fh-prog-head">
              <span className="fh-tile-ic" style={{ background: "#E0B4FC24", color: "#E0B4FC" }} aria-hidden>
                <Puzzle size={20} />
              </span>
              <span>
                <b className="fh-prog-title">Puzzle Pieces</b>
                <small className="fh-mono">
                  {owned}/{PROJECTOR_LOCATIONS.length * PIECES_PER_SET}
                  <span className="fh-prog-sample"> · Sample</span>
                </small>
              </span>
              <span className="fh-prog-more">
                Items <ArrowRight size={14} aria-hidden />
              </span>
            </Link>
            <div className="fh-prog-keys">
              <ProjectorKeys data={items} arrivals={{}} onSelect={() => router.push("/inventory")} />
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

function ScoresStop({ groupId, onRows }: { groupId: number | null; onRows?: (rows: ScoreRow[]) => void }) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [rows, setRows] = useState<ScoreRow[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase.rpc("fn_scoreboard");
      if (!active || !data) return;
      const next = (data as ScoreRow[])
        .map((row) => ({
          id: row.id,
          name: row.name,
          color: row.color,
          token_balance: row.token_balance ?? 0,
        }))
        .sort((a, b) => b.token_balance - a.token_balance || a.id - b.id);
      setRows(next);
      onRows?.(next);
    }
    load();
    const refreshVisible = () => { if (document.visibilityState === "visible") void load(); };
    const timer = window.setInterval(refreshVisible, 30000);
    document.addEventListener("visibilitychange", refreshVisible);
    const channel = supabase
      .channel(`fh-scores-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, load)
      .subscribe();
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
      supabase.removeChannel(channel);
    };
  }, [supabase, onRows]);

  return (
    <section id="fh-scores" className="fh-stop" aria-labelledby="fh-scores-title">
      <div className="fh-stop-head fh-stop-head-row">
        <h2 id="fh-scores-title" className="fh-h2 fh-slab">Scoreboard</h2>
        <span className="fh-pill fh-mono">● LIVE FROM 28 NOV</span>
      </div>
      <ol className="fh-board">
        {rows.map((row, i) => {
          const me = row.id === groupId;
          return (
            <li key={row.id} className="fh-team" data-me={me || undefined}>
              <span className="fh-team-rk fh-mono">{String(i + 1).padStart(2, "0")}</span>
              <i className="fh-team-sw" style={{ background: groupSwatch(row.id, row.color) }} aria-hidden />
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
function Credits() {
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

function AccountMenu({
  name,
  groupName,
  roleLabel,
  logoutHref,
}: {
  name: string;
  groupName: string | null;
  roleLabel: string;
  logoutHref: string;
}) {
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

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    window.location.href = logoutHref;
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className={roleLabel === "Freshie" ? "fh-avatar fh-avatar-label" : "fh-avatar"}
        aria-label="Account"
        aria-expanded={open}
        aria-controls="fh-account"
        onClick={() => setOpen(!open)}
      >
        {roleLabel === "Freshie" ? <>Freshie<ChevronDown size={14} aria-hidden /></> : initials}
      </button>
      {open && (
        <div id="fh-account" className="fh-menu" role="menu">
          <b>{name || roleLabel}</b>
          <span>
            {roleLabel}
            {groupName && roleLabel !== "Freshie" ? `, ${groupName}` : ""}
          </span>
          <button type="button" role="menuitem" onClick={signOut}>
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}

export function FreshieHome() {
  const profile = useProfile();
  const { group, loading } = useGroup();
  const theme = themeFromColor(group?.color);
  const openMenu = useOpenShellMenu();
  const isFaci = profile.role === "faci";
  const roleLabel = isFaci ? "Facilitator" : "Freshie";
  const stops = useMemo(() => homeStops(isFaci), [isFaci]);
  const [active, setActive] = useState(0);
  // Scoreboard rows double as the ferris wheel's cabins (one per group).
  const [cabins, setCabins] = useState<SkyCabin[]>([]);

  // Section-by-section snapping, this page only (same idea as the homepage).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("fh-snap");
    return () => root.classList.remove("fh-snap");
  }, []);

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
            {isFaci && (
              <button type="button" className="fh-navbtn" aria-label="Open menu" onClick={() => openMenu?.()}>
                <Menu size={20} strokeWidth={1.75} />
              </button>
            )}
            <button type="button" className="fh-brand" onClick={() => goTo("fh-welcome")} aria-label="Vortexa — back to top">
              <Image src="/vortexa-logo-sm.webp" alt="" width={320} height={184} priority style={{ width: "auto" }} />
            </button>
          </div>
          <div className="fh-head-r">
            <span className="fh-chip fh-mono">{roleLabel}</span>
            <AccountMenu
              name={profile.full_name ?? ""}
              groupName={group?.name ?? null}
              roleLabel={roleLabel}
              logoutHref={isFaci ? "/login" : "/"}
            />
          </div>
        </div>
        <div className="fh-stopbar fh-mono" aria-hidden>
          <b>{String(active + 1).padStart(2, "0")}</b>
          <span className="fh-stopbar-track">
            <span style={{ width: `${((active + 1) / stops.length) * 100}%` }} />
          </span>
          <span>{stops[active]?.label}</span>
        </div>
      </header>

      <WelcomeStop name={profile.full_name ?? ""} group={group} isFaci={isFaci} />
      {isFaci ? <ChecklistStop group={group} groupId={profile.group_id} /> : <FaciStop groupId={profile.group_id} />}
      <ProgressStop group={group} loading={loading} />
      <ScoresStop groupId={profile.group_id} onRows={setCabins} />
      <GameStop />
    </div>
  );
}
