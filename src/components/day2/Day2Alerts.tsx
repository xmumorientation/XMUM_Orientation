"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { FerrisWheel, Gift, Lightbulb, Map as MapIcon, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { cardState, ourLitLocation, zoneNames, type ZoneName } from "@/components/freshie/items/derive";
import { KEY_COLORS, KEY_NAMES, KeyEmblem } from "@/components/freshie/items/KeyEmblem";
import { keyMode, RING_LABEL } from "@/components/freshie/items/sections";
import type { ItemsData } from "@/components/freshie/items/types";
import { useItemsData } from "@/components/freshie/items/useItemsData";
import { ROLE_COLOR, themeFromColor, TIER_COLOR } from "@/components/freshie/groupTheme";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { useProfile } from "@/components/ProfileProvider";
import { useDay2State } from "@/components/useDay2State";
import { useGroup } from "@/components/useGroup";
import type { Day2Now } from "@/lib/day2";
import { heartbeatLevel, isFinalStretch, momentBetween, momentOnLoad, newlyLit } from "@/lib/day2Moments";
import { DEFAULT_ZONE_KEYS, FUNFAIR_ZONE_NAMES, FUNFAIR_ZONES, type FunfairZone } from "@/lib/funfair";
import {
  PIECES_PER_SET,
  PROJECTOR_CODE_NAMES,
  PROJECTOR_LOCATIONS,
  VORTEXA_ROLES,
  type ProjectorLocation,
  type UserRole,
} from "@/lib/types";
import { formatCountdown } from "@/lib/utils";

import { useFinalStretch, useProjectorLights } from "./useDay2Live";
import "./day2-alerts.css";

// Day 2 alerts on every page of the app (AppShell):
//  - Freshie and Faci: a toast when the game starts (challenge OC, HOF and
//    HOGM for blind boxes) and when the Hard stations open; the funfair card
//    when the funfair opens (their keys and what to do next); a toast each
//    time a projector is lit, never saying which group unless it is their
//    own (0096); and, while the funfair is open, the screen edges beat:
//    faintly at first, harder after each projector is lit.
//  - Everyone else: a plain toast when the funfair opens.
//  - The final stretch ticker (FunfairTicker) for players and the ops crew.
// An open page shows each moment as it comes; a page that loads mid-game
// shows the latest one (src/lib/day2Moments.ts), so a reload shows it again.

const PLAYER_ROLES: UserRole[] = ["freshie", "faci"];
const TICKER_ROLES: UserRole[] = [...PLAYER_ROLES, ...VORTEXA_ROLES];

/** How long a toast stays (also the length of its bar in day2-alerts.css). */
const TOAST_MS = 8000;
const LEAVE_MS = 280;
// Vortexa event colours (decoration only, never a group's colour).
const VX_YELLOW = "#f2ff0b";
const VX_ORANGE = "#fc9e3d";

/** The funfair zone each projector powers by default; the map's zone signs follow these too. */
const ZONE_OF = Object.fromEntries(FUNFAIR_ZONES.map((z) => [DEFAULT_ZONE_KEYS[z], z])) as Record<
  ProjectorLocation,
  FunfairZone
>;
const zoneName = (loc: ProjectorLocation) => FUNFAIR_ZONE_NAMES[ZONE_OF[loc]];
/** "Neon Pier" from "West / Neon Pier". */
const zoneShort = (loc: ProjectorLocation) => zoneName(loc).split(" / ").pop() ?? zoneName(loc);

type Toast =
  | { id: number; kind: "challenge" | "hard" | "funfair" }
  | { id: number; kind: "lit"; loc: ProjectorLocation; ours: boolean; left: number };

const Day2AlertsContext = createContext<{ openFunfair: () => void } | null>(null);

/** Seconds until `endsAt` on the server's clock, ticking each second while `active`. Null without an end time. */
function useSecondsLeft(endsAt: string | null, offsetMs: number, active: boolean): number | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active || !endsAt) return;
    const i = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, [active, endsAt]);
  return endsAt ? Math.max(0, (Date.parse(endsAt) - (Date.now() + offsetMs)) / 1000) : null;
}

/** Shows the Day 2 toasts, the funfair card and the heartbeat around `children`. Mounted once, in AppShell. */
export function Day2Alerts({ children }: { children: React.ReactNode }) {
  const profile = useProfile();
  const isPlayer = PLAYER_ROLES.includes(profile.role);
  const day2 = useDay2State();
  // Only players get the projector toasts and the heartbeat, and only while the Day 2 game runs.
  const lights = useProjectorLights(isPlayer ? profile.group_id : null, isPlayer && day2.segment !== "off");
  const finalStretch = isFinalStretch(day2);

  const [toast, setToast] = useState<Toast | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);
  useEffect(() => {
    const set = timers.current;
    return () => set.forEach(clearTimeout);
  }, []);

  const dismiss = useCallback(() => {
    clearTimers();
    setLeaving(true);
    later(() => {
      setToast(null);
      setLeaving(false);
    }, LEAVE_MS);
  }, [clearTimers, later]);

  const show = useCallback(
    (next: Toast) => {
      clearTimers();
      setLeaving(false);
      setToast(next);
      later(dismiss, TOAST_MS);
    },
    [clearTimers, later, dismiss]
  );

  // The first reading after Day 2's state loads is "the page opened"; later readings are changes.
  const seen = useRef<Day2Now | null>(null);
  useEffect(() => {
    if (!day2.state) return;
    const before = seen.current;
    seen.current = day2;
    const moment = before ? momentBetween(before, day2, day2.state) : momentOnLoad(day2, day2.state);
    if (!moment) return;
    if (isPlayer && moment === "funfair") {
      clearTimers();
      setToast(null);
      setCardOpen(true);
    } else if (isPlayer || moment === "funfair") {
      show({ id: Date.now(), kind: moment });
    }
  }, [day2, isPlayer, show, clearTimers]);

  // The game is over (or Admin closed the funfair): the card goes with it.
  useEffect(() => {
    if (!finalStretch) setCardOpen(false);
  }, [finalStretch]);

  // A projector lit since the last reading (never on the first one).
  const litSeen = useRef<ProjectorLocation[] | null>(null);
  useEffect(() => {
    if (!isPlayer || !lights.loaded) return;
    const before = litSeen.current;
    litSeen.current = lights.lit;
    const loc = before ? newlyLit(before, lights.lit).pop() : undefined;
    if (!loc) return;
    show({ id: Date.now(), kind: "lit", loc, ours: loc === lights.ours, left: PROJECTOR_LOCATIONS.length - lights.lit.length });
  }, [isPlayer, lights, show]);

  const api = useMemo(() => ({ openFunfair: () => setCardOpen(true) }), []);
  const level = isPlayer ? heartbeatLevel(finalStretch, lights.lit.length) : 0;

  return (
    <Day2AlertsContext.Provider value={api}>
      {children}
      {level > 0 && <div className="d2-beat" data-level={level} aria-hidden />}
      <div className={`d2-toasts ${vxSlab.variable}`} role="status" aria-live="polite">
        {toast && <Day2Toast key={toast.id} toast={toast} leaving={leaving} canScan={profile.role === "freshie"} onClose={dismiss} />}
      </div>
      {/* Mounted only in the final stretch, so the group's Items data is not loaded on every page all day. */}
      {isPlayer && finalStretch && (
        <FunfairCard
          open={cardOpen}
          onOpenChange={setCardOpen}
          endsAt={day2.state?.game_ends_at ?? null}
          offsetMs={day2.offsetMs}
        />
      )}
    </Day2AlertsContext.Provider>
  );
}

// ── Toasts ───────────────────────────────────────────────────────────────

function toastCopy(t: Toast, canScan: boolean) {
  switch (t.kind) {
    case "challenge":
      return {
        accent: VX_YELLOW,
        icon: <Gift size={24} />,
        eyebrow: "Day 2 · Game On",
        title: "Challenge OC, HOF and HOGM",
        text: "Find them around campus and challenge them for a blind box.",
        crew: true,
        action: canScan ? { href: "/scan", label: "Scan a QR" } : null,
      };
    case "hard":
      return {
        accent: TIER_COLOR.high,
        icon: (
          <span className="d2-meter">
            <i />
            <i />
            <i />
          </span>
        ),
        eyebrow: "Day 2 · Hard Stations",
        title: "Hard Stations Open",
        text: "Pick 1 location. Win, and a piece from it is yours.",
        action: { href: "/map", label: "View on Map" },
      };
    case "funfair":
      return {
        accent: VX_ORANGE,
        icon: <FerrisWheel size={24} />,
        eyebrow: "Day 2 · Final Stretch",
        title: "The Funfair Race Is On",
        text: "Groups can now light their projectors and power up the funfair.",
        action: { href: "/map", label: "Open Map" },
      };
    case "lit": {
      const name = PROJECTOR_CODE_NAMES[t.loc];
      const zone = zoneShort(t.loc);
      return {
        accent: KEY_COLORS[t.loc].main,
        icon: <Lightbulb size={24} />,
        eyebrow: `Projector Lit · ${zoneName(t.loc)}`,
        title: t.ours ? `Your Group Lit ${name}` : `${name} Is Lit`,
        text: t.ours
          ? `${zone} is powering up. Watch it on the map.`
          : t.left > 0
            ? `${zone} is on. ${t.left} projector${t.left === 1 ? "" : "s"} left.`
            : `${zone} is on. Every projector is lit.`,
        action: { href: "/map", label: "Open Map" },
      };
    }
  }
}

function Day2Toast({
  toast,
  leaving,
  canScan,
  onClose,
}: {
  toast: Toast;
  leaving: boolean;
  /** A Freshie scans blind box QRs; a Faci has no Scan tab. */
  canScan: boolean;
  onClose: () => void;
}) {
  const c = toastCopy(toast, canScan);
  return (
    <div
      className="d2-toast"
      data-kind={toast.kind}
      data-leaving={leaving || undefined}
      style={{ "--d2-accent": c.accent } as React.CSSProperties}
    >
      <span className="d2-toast-icon" aria-hidden>
        {c.icon}
      </span>
      <div className="d2-toast-body">
        <span className="d2-toast-eb">{c.eyebrow}</span>
        <b className="d2-toast-title">{c.title}</b>
        <p className="d2-toast-text">{c.text}</p>
        {"crew" in c && c.crew && (
          <span className="d2-toast-crew" aria-hidden>
            {(["oc", "hof", "hogm"] as const).map((r) => (
              <span key={r} style={{ "--chip": ROLE_COLOR[r]?.accent } as React.CSSProperties}>
                {r.toUpperCase()}
              </span>
            ))}
          </span>
        )}
        {c.action && (
          <Link href={c.action.href} className="d2-toast-action" onClick={onClose}>
            {c.action.label}
          </Link>
        )}
      </div>
      <button type="button" className="d2-toast-close" aria-label="Dismiss" onClick={onClose}>
        <X size={18} aria-hidden />
      </button>
      <span className="d2-toast-bar" aria-hidden />
    </div>
  );
}

// ── The funfair card (Freshie and Faci) ───────────────────────────────────

/** The group's next step in the final stretch, from the same rules as the Items page (derive.ts). */
function nextStep(
  data: ItemsData,
  names: Record<ProjectorLocation, ZoneName>
): { loc: ProjectorLocation | null; head: string; text: string } {
  const ours = ourLitLocation(data);
  if (ours) {
    return { loc: ours, head: `Your Group Lit ${names[ours].short}`, text: "Mission complete. Watch the funfair power up on the map." };
  }
  const ready = PROJECTOR_LOCATIONS.find((loc) => cardState(data, loc) === "key");
  if (ready) {
    return {
      loc: ready,
      head: `${KEY_NAMES[ready]} Is Ready`,
      text: "Get the NFC card from the Guardian, then light the projector before another group does.",
    };
  }
  const open = PROJECTOR_LOCATIONS.filter((loc) => cardState(data, loc) === "collecting");
  if (!open.length) return { loc: null, head: "Every Projector Is Lit", text: "The race is over. Watch the finale on the map." };
  const best = open.reduce((a, b) => (data.pieces[b].length > data.pieces[a].length ? b : a));
  const have = data.pieces[best].length;
  const need = PIECES_PER_SET - have;
  if (!have) {
    return { loc: null, head: "No Pieces Yet", text: "Win Day 2 stations for pieces. All 5 of one key light a projector." };
  }
  return {
    loc: best,
    head: `Closest: ${names[best].short}, ${have} of ${PIECES_PER_SET}`,
    text: `Win ${need} more ${names[best].short} piece${need === 1 ? "" : "s"} at Day 2 stations, then find the Guardian.`,
  };
}

function FunfairCard({
  open,
  onOpenChange,
  endsAt,
  offsetMs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endsAt: string | null;
  offsetMs: number;
}) {
  const router = useRouter();
  const { group } = useGroup();
  const { data } = useItemsData();
  const left = useSecondsLeft(endsAt, offsetMs, open);
  const theme = themeFromColor(group?.color);
  const names = zoneNames(data);
  const step = nextStep(data, names);

  // A portal: the group's colours are passed in (AGENTS.md).
  const themeVars = {
    "--fh-accent": theme.accent,
    "--fh-glow": theme.glow,
    "--fh-blue": theme.accent,
    "--fh-blue-light": theme.accentLight,
    "--fh-on-blue": theme.onAccent,
  } as React.CSSProperties;

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="d2-card-overlay" />
        <RadixDialog.Content className={`d2-card ${vxDisplay.variable} ${vxSlab.variable}`} style={themeVars}>
          <span className="d2-strip d2-strip-t" aria-hidden />
          <span className="d2-strip d2-strip-r" aria-hidden />
          <span className="d2-strip d2-strip-b" aria-hidden />
          <span className="d2-strip d2-strip-l" aria-hidden />
          <div className="d2-card-in">
            <div className="d2-card-top">
              <span className="d2-card-eb">Day 2 · Final Stretch</span>
              {left !== null && <span className="d2-card-left">{formatCountdown(left)} Left</span>}
            </div>
            <RadixDialog.Title className="d2-card-title">
              <span className="d2-card-the">Light Up the </span>
              <span className="d2-card-mark">Funfair</span>
            </RadixDialog.Title>
            <RadixDialog.Description className="d2-card-desc">
              Light a projector to power up its zone. 3 projectors, 3 winners. Each one lights once.
            </RadixDialog.Description>

            <ul className="d2-tiles" aria-label="Your keys">
              {PROJECTOR_LOCATIONS.map((loc) => {
                const state = cardState(data, loc);
                return (
                  <li
                    key={loc}
                    className="d2-tile"
                    data-focus={loc === step.loc || undefined}
                    style={{ "--d2-key": KEY_COLORS[loc].main } as React.CSSProperties}
                  >
                    <KeyEmblem className="d2-tile-key" loc={loc} owned={data.pieces[loc]} mode={keyMode(state)} />
                    <b className="d2-tile-name">{names[loc].short}</b>
                    <span className="d2-tile-zone">{zoneShort(loc)}</span>
                    <span className="d2-tile-state">{RING_LABEL[state](data, loc)}</span>
                  </li>
                );
              })}
            </ul>

            <div
              className="d2-card-next"
              style={{ "--d2-key": step.loc ? KEY_COLORS[step.loc].main : VX_ORANGE } as React.CSSProperties}
            >
              <b>{step.head}</b>
              <span>{step.text}</span>
            </div>

            <div className="d2-card-actions">
              <button
                type="button"
                className="fh-btn fh-btn-primary"
                onClick={() => {
                  onOpenChange(false);
                  router.push("/map");
                }}
              >
                <MapIcon size={18} aria-hidden /> Open Map
              </button>
              <RadixDialog.Close className="fh-btn fh-btn-ghost">Later</RadixDialog.Close>
            </div>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

// ── Final stretch, on the pages ───────────────────────────────────────────

/** The final stretch ticker is on for this viewer (FreshieHome and StaffHome make room for it). */
export function useTickerOn(): boolean {
  const profile = useProfile();
  return useFinalStretch() && TICKER_ROLES.includes(profile.role);
}

/**
 * The red ticker under the header on every page while the funfair is open
 * (players and the ops crew). A player's tap brings the funfair card back;
 * anyone else's opens the map. "home" sits in Home's fixed header (phones);
 * "shell" in AppShell under the other headers ("shell-home": Home on a
 * wide screen, under TopNav).
 */
export function FunfairTicker({ place }: { place: "home" | "shell" | "shell-home" }) {
  const profile = useProfile();
  const day2 = useDay2State();
  const api = useContext(Day2AlertsContext);
  const finalStretch = isFinalStretch(day2);
  const { lit } = useProjectorLights(null, finalStretch);
  const left = useSecondsLeft(day2.state?.game_ends_at ?? null, day2.offsetMs, finalStretch);
  if (!finalStretch || !TICKER_ROLES.includes(profile.role)) return null;

  const isPlayer = PLAYER_ROLES.includes(profile.role);
  const total = PROJECTOR_LOCATIONS.length;
  const text = [
    isPlayer ? "Light Up the Funfair" : "Funfair Race",
    `${lit.length} / ${total} Lit`,
    left !== null ? `Ends in ${formatCountdown(left)}` : null,
    isPlayer ? "Got an NFC card? Tap it on your phone" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const line = (
    <span className="d2-ticker-line">
      <i className="d2-ticker-dot" />
      {text} ·
    </span>
  );
  const track = (
    <span className="d2-ticker-track" aria-hidden>
      {line}
      {line}
    </span>
  );
  const label = `Light up the funfair: ${lit.length} of ${total} projectors lit.`;

  return (
    <div className="d2-ticker" data-place={place}>
      {isPlayer && api ? (
        <button type="button" className="d2-ticker-btn" aria-label={`${label} Show the funfair card.`} onClick={api.openFunfair}>
          {track}
        </button>
      ) : (
        <Link href="/map" className="d2-ticker-btn" aria-label={`${label} Open the map.`}>
          {track}
        </Link>
      )}
    </div>
  );
}

/** "Final Stretch", blinking at the top of the phase card while the funfair is open. */
export function FinalStretchBanner() {
  return <div className="d2-final-banner">Final Stretch</div>;
}

/** The three projectors under the phase card's timer: lit ones glow in their key's colour. Never which group. */
export function ProjectorsLitRow() {
  const { lit } = useProjectorLights();
  return (
    <div className="d2-litrow">
      <span className="d2-litrow-label">
        Projectors {lit.length} / {PROJECTOR_LOCATIONS.length} Lit
      </span>
      <ul>
        {PROJECTOR_LOCATIONS.map((loc) => {
          const on = lit.includes(loc);
          return (
            <li key={loc} data-lit={on || undefined} style={{ "--d2-key": KEY_COLORS[loc].main } as React.CSSProperties}>
              <Lightbulb size={15} aria-hidden />
              {PROJECTOR_CODE_NAMES[loc]}
              <span className="fh-sr">{on ? ", lit" : ", not lit yet"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
