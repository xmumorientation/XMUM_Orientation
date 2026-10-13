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
  Minus,
  Pencil,
  Plus,
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
import { EDIT_PROFILE_EVENT } from "@/components/TopNav";
import { useGroup } from "@/components/useGroup";
import { countdownParts, useEventCountdown } from "@/components/useEventCountdown";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PIECES_PER_SET, PROJECTOR_LOCATIONS, type Group } from "@/lib/types";
import { formatCountdown, friendlyError } from "@/lib/utils";

import "./freshie.css";
import { faciFromProfile, faciProfilesFor, type FaciProfile } from "./faciProfiles";
import { FaciAvatar, ProfileEditor } from "./ProfileEditor";
import { FreshieSky, type SkyCabin } from "./FreshieSky";
import { ProjectorKeys } from "./items/sections";
import { useItemsData } from "./items/useItemsData";
import { groupSwatch, themeFromColor } from "./groupTheme";

// Freshie Home (/dashboard for Freshies and Facilitators) — the logged-in
// version of the public welcome page, in the Vortexa "Night Ticket" style.
// Four full-screen stops read one at a time (scroll snapping), each about
// the Freshie's own group:
//   01 Welcome + countdown (Live control's schedule timer), plus the running game.
//      Vortexa lockup, then "Welcome <group> Freshie!".
//   02 Checklist (facilitator only: name, attendance, location)
//   03 Your Facilitator (Freshie) or You & Your Partner (Faci; own card has
//      an edit pencil). Sample profiles from faciProfiles.ts.
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

const CHECK_STOP = { id: "fh-check", label: "Checklist" };

function homeStops(isFaci: boolean) {
  if (!isFaci) return [...STOPS];
  // A Faci gets the checklist first, then their own card and their partner's.
  return [STOPS[0], CHECK_STOP, { id: "fh-faci", label: "Partner" }, ...STOPS.slice(2)];
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
          {isFaci ? "Group Code" : "Scan a QR"}
        </Link>
        <button type="button" className="fh-btn fh-btn-ghost" onClick={() => goTo(isFaci ? "fh-check" : "fh-faci")}>
          My Group ↓
        </button>
      </div>
      <Credits />
    </section>
  );
}

// ── Checklist (facilitator only, between Welcome and Your pass) ─────────────

type Headcount = { headcount: number; local_count: number | null; international_count: number | null };

/** "" or a non-number is "not counted" (null); otherwise a whole number of 0 or more. */
function countValue(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : Math.max(0, n);
}

function headcountSummary(h: Headcount | null) {
  if (!h) return "Not counted yet";
  if (h.local_count == null || h.international_count == null) return `${h.headcount} people`;
  return `${h.headcount} people · ${h.local_count} Local · ${h.international_count} International`;
}

/** − / number / + for counting people at the gathering point; the number can also be typed. */
function Counter({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const n = countValue(value) ?? 0;
  return (
    <div className="fh-counter">
      <label htmlFor={id}>{label}</label>
      <div className="fh-stepper">
        <button type="button" aria-label={`One less ${label}`} disabled={n === 0} onClick={() => onChange(String(n - 1))}>
          <Minus size={18} aria-hidden />
        </button>
        <input
          id={id}
          className="fh-slab"
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" aria-label={`One more ${label}`} onClick={() => onChange(String(n + 1))}>
          <Plus size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function ChecklistStop({ group, groupId }: { group: Group | null; groupId: number | null }) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [displayName, setDisplayName] = useState("");
  const [slogan, setSlogan] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameNotice, setNameNotice] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  // Faci counts Local and International; Total is their sum. Same group_headcounts
  // row and fn_set_headcount as Admin > Headcount and /attendance.
  const [local, setLocal] = useState("");
  const [international, setInternational] = useState("");
  const [saved, setSaved] = useState<Headcount | null>(null);
  const [savingCount, setSavingCount] = useState(false);
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
        const row = data as Headcount | null;
        setSaved(row);
        setLocal(row?.local_count == null ? "" : String(row.local_count));
        setInternational(row?.international_count == null ? "" : String(row.international_count));
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

  const localN = countValue(local);
  const internationalN = countValue(international);
  const counted = localN !== null || internationalN !== null;
  // A blank side counts as 0 once the other side has a number.
  const total = (localN ?? 0) + (internationalN ?? 0);

  async function saveHeadcount(e: React.FormEvent) {
    e.preventDefault();
    if (!counted) return;
    setCountError(null);
    setCountNotice(null);
    setSavingCount(true);
    const next: Headcount = { headcount: total, local_count: localN ?? 0, international_count: internationalN ?? 0 };
    const { error } = await supabase.rpc("fn_set_headcount", {
      p_count: next.headcount,
      p_local: next.local_count,
      p_international: next.international_count,
    });
    setSavingCount(false);
    if (error) return setCountError(friendlyError(error));
    setSaved(next);
    setLocal(String(next.local_count));
    setInternational(String(next.international_count));
    setCountNotice("Saved. Admin can see it now.");
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
              <b>Group Name and Slogan</b>
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
              <b>Take Attendance</b>
              <small>{headcountSummary(saved)}</small>
            </span>
            <ChevronDown size={20} aria-hidden className="fh-check-chev" />
          </button>
          <div id="fh-check-2" className="fh-check-body" hidden={open !== 2}>
            <form onSubmit={saveHeadcount}>
              <div className="fh-count-grid">
                <Counter id="fh-count-local" label="Local" value={local} onChange={setLocal} />
                <Counter id="fh-count-intl" label="International" value={international} onChange={setInternational} />
              </div>
              <div className="fh-count-total" aria-live="polite">
                <span className="fh-mono">Total</span>
                <b className="fh-slab">{counted ? total : "–"}</b>
              </div>
              {saved && saved.local_count == null && saved.international_count == null && (
                <small className="fh-check-msg">
                  Saved before as {saved.headcount} in total, with no Local / International split.
                </small>
              )}
              <button type="submit" className="fh-btn fh-btn-primary" disabled={!counted || savingCount}>
                {savingCount ? "Saving…" : "Save"}
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
              <b>Update Location</b>
              <small>Check your group in at a station</small>
            </span>
            <MapPin size={20} aria-hidden className="fh-check-chev" />
          </Link>
        </li>
      </ol>
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
 * The Facis of a group, live: Admin assigns them in Freshie Control
 * (profiles.group_id). A Faci may read their own group's profiles under RLS.
 * The viewer comes first, then partners by name. Null while loading.
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
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "faci")
        .eq("group_id", groupId!)
        .order("full_name");
      if (!active) return;
      const rows = ((data ?? []) as { id: string; full_name: string }[]).map((r) => faciFromProfile(r, meId));
      setFacis([...rows.filter((f) => f.isMe), ...rows.filter((f) => !f.isMe)]);
    }
    load();
    // Only this group's rows, so a profile change elsewhere does not reload every Faci.
    // Catches a partner added to the group (or renamed). A partner moved OUT arrives
    // with group_id no longer this group, so it shows on the next load.
    const channel = supabase
      .channel(`fh-facis-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles", filter: `group_id=eq.${groupId}` },
        load
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, groupId, meId, enabled]);

  return facis;
}

/**
 * A Freshie's Facilitators from fn_group_facis() (rows: id, full_name, instagram
 * for the caller's group). Until the backend ships that RPC, falls back to the
 * sample profiles so the stop still shows something, marked Sample.
 * No realtime for Freshies (the RPC hides fields per caller); reloads when the
 * page comes back into view.
 */
function useFreshieFacis(groupId: number | null, enabled: boolean): { facis: FaciProfile[]; sample: boolean } | null {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [result, setResult] = useState<{ facis: FaciProfile[]; sample: boolean } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    async function load() {
      const { data, error } = await supabase.rpc("fn_group_facis");
      if (!active) return;
      // PGRST202 / 42883: the RPC does not exist yet.
      if (error && (error.code === "PGRST202" || error.code === "42883")) {
        setResult({ facis: faciProfilesFor(groupId), sample: true });
        return;
      }
      const rows = (error ? [] : (data ?? [])) as { id: string; full_name: string; instagram?: string | null }[];
      setResult({ facis: rows.map((r) => faciFromProfile(r, "")), sample: false });
    }
    load();
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [supabase, groupId, enabled]);

  return result;
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
  const live = viewer ? (team ?? null) : null;
  const freshie = useFreshieFacis(groupId, !viewer);
  // Until the list loads, a Faci sees at least their own card.
  const facis = viewer
    ? (live ?? [faciFromProfile({ id: viewer.id, full_name: viewer.name }, viewer.id)])
    : (freshie?.facis ?? []);
  // Only the Freshie fallback is made-up; a Faci always sees real profiles.
  const sample = !viewer && (freshie?.sample ?? false);
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
        {sample && <span className="fh-pill fh-mono fh-faci-sample">Sample</span>}
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
                    ) : sample ? (
                      // Sample handles are made up, so they do not link out.
                      <span className="fh-faci-ig">
                        <InstagramIcon size={14} />@{f.instagram}
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
                        <GraduationCap size={14} aria-hidden /> {f.programme}
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
      {viewer && live && live.length < 2 && (
        <p className="fh-faci-solo">No partner assigned yet. Admin assigns Facilitators in Freshie Control.</p>
      )}
      {!viewer && freshie && freshie.facis.length === 0 && (
        <p className="fh-faci-solo">Your Facilitators will show here once they are assigned to your group.</p>
      )}
    </section>
  );
}

// ── 03 Your progress ─────────────────────────────────────────────────────────

function ProgressStop({ group, loading }: { group: Group | null; loading: boolean }) {
  const router = useRouter();
  // Same live data as the Items page, so both always show the same keys.
  const { data: items } = useItemsData();
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
    await supabaseBrowser().auth.signOut();
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
function StopBar({ stops }: { stops: readonly { id: string; label: string }[] }) {
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
  const openMenu = useOpenShellMenu();
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
      {isFaci && <ChecklistStop group={group} groupId={profile.group_id} />}
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
