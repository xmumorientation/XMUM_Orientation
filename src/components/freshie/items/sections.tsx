"use client";

import {
  ChevronRight,
  Coins,
  Gift,
  KeyRound,
  Lightbulb,
  Lock,
  MapPin,
  Puzzle,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  PIECES_PER_SET,
  PROJECTOR_LOCATIONS,
  type ProjectorLocation,
} from "@/lib/types";

import { CODE_NAMES, cardState, fillZones, lampState, ourLitLocation, zoneNames, type CardState, type ZoneName } from "./derive";
import { KEY_NAMES, KeyEmblem, type KeyMode } from "./KeyEmblem";
import type { Arrivals } from "./useNewPieces";
import type { BoxKind, HistoryEntry, ItemsData } from "./types";

const PIECES = Array.from({ length: PIECES_PER_SET }, (_, i) => i + 1);

// ── 1. Projectors with their puzzle keys ───────────────────────────────────
// Each lamp sits on top of its key (the 5 puzzle pieces). The key is the
// group's progress; the lamp is the projector's state. Tap for details.

/** How a location's key is coloured for a given card state. */
export function keyMode(state: CardState): KeyMode {
  if (state === "lit") return "lit";
  if (state === "idle" || state === "done") return "idle";
  return "normal";
}

const RING_LABEL: Record<CardState, (data: ItemsData, loc: ProjectorLocation) => string> = {
  locked: () => "Day 2",
  collecting: (data, loc) => `${data.pieces[loc].length}/${PIECES_PER_SET}`,
  key: () => "Key Ready",
  lit: () => "Lit by You",
  idle: () => "Lit",
  done: () => "Idle",
};

export function ProjectorKeys({
  data,
  arrivals,
  onSelect,
}: {
  data: ItemsData;
  /** Pieces that arrived while the page was open, for the arrival effects. */
  arrivals: Arrivals;
  /** Left out on Home, where the keys are display only. */
  onSelect?: (loc: ProjectorLocation) => void;
}) {
  const Lamp = onSelect ? "button" : "div";
  return (
    <section className="fi-sec" aria-labelledby="fi-grid-title">
      <h2 id="fi-grid-title" className="fh-sr">
        Projectors and Puzzle Keys
      </h2>
      <div className="fi-grid" data-endgame={data.phase === "endgame"}>
        {PROJECTOR_LOCATIONS.map((loc) => {
          const name = zoneNames(data)[loc];
          const lamp = lampState(data, loc);
          const card = cardState(data, loc);
          const owned = data.pieces[loc];
          const label = RING_LABEL[card](data, loc);
          const arrival = arrivals[loc];
          return (
            <Lamp
              key={loc}
              type={onSelect ? "button" : undefined}
              className="fi-lamp"
              data-state={lamp}
              data-card={card}
              data-celebrate={arrival?.completed || undefined}
              onClick={onSelect && (() => onSelect(loc))}
              role={onSelect ? undefined : "img"}
              aria-label={`${name.long}: ${owned.length} of ${PIECES_PER_SET} pieces, ${label}.${onSelect ? " Show details." : ""}`}
            >
              <span className="fi-bulb" aria-hidden>
                <Lightbulb size={18} strokeWidth={1.9} />
              </span>
              <span className="fi-beam" aria-hidden />
              <KeyEmblem
                key={arrival?.id ?? "still"}
                className="fi-key-emblem"
                loc={loc}
                owned={card === "locked" ? [] : owned}
                mode={keyMode(card)}
                fresh={arrival?.piece ?? null}
                celebrate={arrival?.completed ?? false}
              />
              <b>{name.short}</b>
              <small className={card === "collecting" ? "fh-mono" : undefined}>{label}</small>
            </Lamp>
          );
        })}
      </div>
    </section>
  );
}

// ── 2. Key banner ──────────────────────────────────────────────────────────

export function KeyBanner({
  data,
  loc,
  justCompleted = false,
  onOpen,
}: {
  data: ItemsData;
  loc: ProjectorLocation;
  /** Slide in after the key's completion effect. */
  justCompleted?: boolean;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="fi-keyban" data-celebrate={justCompleted || undefined} onClick={onOpen}>
      <span className="fi-keyban-ic" aria-hidden>
        <KeyRound size={20} strokeWidth={2} />
      </span>
      <span className="fi-keyban-text">
        <b>{CODE_NAMES[loc]} key unlocked</b>
        <span>
          {data.phase === "endgame"
            ? "Go to the Guardian and scan the part card."
            : "The Guardian arrives in the final 30 minutes."}
        </span>
      </span>
      <ChevronRight size={20} aria-hidden className="fi-keyban-go" />
    </button>
  );
}

// ── 3. Item shelf: tokens and the two kinds of box ─────────────────────────
// Icon, name and count only. Tap tokens for details, or a box to unlock it.

/** "tokens", or "box:<key>" for a group of boxes. */
export type ShelfItem = string;

export const boxShelfKey = (key: BoxKind): ShelfItem => `box:${key}`;

export function ItemShelf({ data, onSelect }: { data: ItemsData; onSelect: (item: ShelfItem) => void }) {
  const balance = data.tokens.balance;
  const previous = useRef(balance);
  const [delta, setDelta] = useState<{ value: number; key: number } | null>(null);

  useEffect(() => {
    if (previous.current !== balance) {
      setDelta({ value: balance - previous.current, key: Date.now() });
      previous.current = balance;
    }
  }, [balance]);

  const tiles: { key: ShelfItem; name: string; count: number }[] = [
    { key: "tokens", name: "Tokens", count: balance },
    ...data.boxes.map((b) => ({ key: boxShelfKey(b.key), name: b.name, count: b.unopened })),
  ];

  return (
    <section className="fi-sec" aria-labelledby="fi-shelf-title">
      <h2 id="fi-shelf-title" className="fh-sr">
        Tokens and Blind Boxes
      </h2>
      <div className="fi-shelf">
        {tiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            className="fi-tile"
            data-item={tile.key}
            onClick={() => onSelect(tile.key)}
            aria-label={`${tile.name}: ${tile.count}. Show details.`}
          >
            <span className="fi-tile-ic" aria-hidden>
              {tile.key === "tokens" ? <Coins size={22} strokeWidth={2.2} /> : <Gift size={22} strokeWidth={1.9} />}
            </span>
            <b className="fi-tile-num fh-slab">{tile.count}</b>
            <span className="fi-tile-name">{tile.name}</span>
            {tile.key === "tokens" && delta && (
              <span key={delta.key} className="fi-delta fh-mono" data-up={delta.value > 0}>
                {delta.value > 0 ? `+${delta.value}` : `−${Math.abs(delta.value)}`}
              </span>
            )}
          </button>
        ))}
      </div>
      {data.boxes.length === 0 && (
        <p className="fi-shelf-empty">
          No blind boxes yet. Scan a seller&apos;s QR in Scan to buy one. It will appear here.
        </p>
      )}
    </section>
  );
}

export function TokenDetail({ data }: { data: ItemsData }) {
  const balance = data.tokens.balance;
  const tiers = [
    { key: "low", name: "Low", cost: data.costs.low },
    { key: "medium", name: "Medium", cost: data.costs.medium },
    { key: "high", name: "High", cost: data.costs.high },
  ];
  return (
    <div className="fi-item-detail">
      <span className="fi-item-art" data-item="tokens" aria-hidden>
        <Coins size={34} strokeWidth={2.2} />
      </span>
      <h2 className="fi-sheet-title">
        <b className="fh-slab">{balance}</b> Tokens
      </h2>
      <p className="fi-eb fh-mono">{data.phase === "day1" ? "On Day 2 this buys" : "You can play now"}</p>
      <div className="fi-tiers">
        {tiers.map((tier) => {
          const rounds = tier.cost > 0 ? Math.floor(balance / tier.cost) : 0;
          return (
            <div key={tier.key} className="fi-tier" data-tier={tier.key} data-none={rounds === 0}>
              <span className="fh-mono">
                <i aria-hidden />
                {tier.name} / {tier.cost}
              </span>
              <b>×{rounds}</b>
              <small>{rounds === 1 ? "round" : "rounds"}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 4. One location's puzzle (opened from a lamp) ──────────────────────────

const CARD_STATUS: Record<CardState, string> = {
  locked: "Unlocks on Day 2",
  collecting: "Collecting",
  key: "Key Unlocked",
  lit: "Projector Lit",
  idle: "Idle",
  done: "Idle",
};

/**
 * Where a projector's NFC card is: Admin's picture (Admin → Puzzles) and the place, once the group has earned
 * them (all 5 pieces, or lit it; 0098). On the key sheet and, after the key is used, on the projector's detail.
 */
export function NfcSpot({ data, loc }: { data: ItemsData; loc: ProjectorLocation }) {
  const place = data.places[loc];
  const image = data.images[loc];
  return (
    <figure className="fi-spot">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={`Where the ${CODE_NAMES[loc]} NFC card is${place ? `: ${place.name}` : ""}`} />
      ) : (
        <div className="fi-spot-ph" aria-hidden>
          {place ? <MapPin size={28} /> : <Lock size={26} />}
          <span className="fh-mono">{place ? "Picture coming soon" : "Hidden for now"}</span>
        </div>
      )}
      <figcaption>
        <span className="fi-eb fh-mono">Where the NFC Card Is</span>
        {place ? <b>{place.name}</b> : <span>The place appears here once all 5 pieces are in.</span>}
      </figcaption>
    </figure>
  );
}

export function BlueprintDetail({ data, loc }: { data: ItemsData; loc: ProjectorLocation }) {
  const state = cardState(data, loc);
  const owned = data.pieces[loc];
  const missing = PIECES.filter((i) => !owned.includes(i));
  const lit = data.projectors[loc];
  const ours = ourLitLocation(data);
  const names = zoneNames(data);

  return (
    <div className="fi-detail" data-state={state}>
      <header className="fi-detail-head">
        <div>
          <span className="fi-eb fh-mono">{CARD_STATUS[state]}</span>
          <h2>{names[loc].long}</h2>
          <span className="fi-detail-key-name">
            {data.places[loc] ? KEY_NAMES[loc] : "Place revealed when all 5 pieces are in"}
          </span>
        </div>
        <span className="fi-count fh-mono">
          {state === "locked" ? "–" : owned.length}/{PIECES_PER_SET}
        </span>
      </header>

      <KeyEmblem
        className="fi-detail-key"
        loc={loc}
        owned={state === "locked" ? [] : owned}
        mode={keyMode(state)}
        blade={owned.length >= PIECES_PER_SET}
      />

      <p className="fi-detail-note">
        {state === "locked" && "Pieces come from Day 2 game stations."}
        {state === "collecting" &&
          (owned.length ? `Still missing #${missing.join(", #")}.` : "No pieces yet. Win Day 2 rounds to collect them.")}
        {state === "lit" && "Your group lit this projector. Mission complete."}
        {state === "idle" && lit && (
          <>
            <span className="fi-tag">Already Lit</span>{" "}
            {owned.length ? `Your ${owned.length} piece${owned.length === 1 ? " is" : "s are"} now idle.` : "This projector is closed."}
          </>
        )}
        {state === "done" && ours && `Your group already lit ${names[ours].short}. These pieces are idle.`}
      </p>

      {data.places[loc] && <NfcSpot data={data} loc={loc} />}

      {data.mapUnlocked && (
        <Link href={`/map?focus=${loc}`} className="fh-btn fh-btn-ghost fh-btn-block">
          <MapPin size={16} aria-hidden /> Show on Map
        </Link>
      )}
    </div>
  );
}

// ── Activity (opened from the header) ──────────────────────────────────────

// One chip per kind of history. Buying and opening a box sit under Boxes,
// not Tokens, even though they move tokens. `tone` picks the kind's colour
// in freshie.css ([data-tone]); "all" follows the group colour.
type Filter = "all" | "tokens" | "boxes" | "pieces" | "projectors";
const FILTERS: { key: Filter; label: string; icon: React.ReactNode; kinds: HistoryEntry["kind"][] }[] = [
  { key: "all", label: "All", icon: null, kinds: [] },
  { key: "tokens", label: "Tokens", icon: <Coins size={14} />, kinds: ["game", "entry", "fix"] },
  { key: "boxes", label: "Blind Boxes", icon: <Gift size={14} />, kinds: ["box"] },
  { key: "pieces", label: "Puzzle Pieces", icon: <Puzzle size={14} />, kinds: ["piece"] },
  { key: "projectors", label: "Projectors", icon: <Lightbulb size={14} />, kinds: ["lit"] },
];
const KIND_TONE: Record<HistoryEntry["kind"], Filter | "fix"> = {
  game: "tokens",
  entry: "tokens",
  fix: "fix",
  box: "boxes",
  piece: "pieces",
  lit: "projectors",
};
const KIND_ICON: Record<HistoryEntry["kind"], React.ReactNode> = {
  game: <Coins size={16} />,
  entry: <Coins size={16} />,
  piece: <Puzzle size={16} />,
  box: <Gift size={16} />,
  fix: <Wrench size={16} />,
  lit: <Lightbulb size={16} />,
};

function signed(n: number) {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}

function entryBadge(e: HistoryEntry) {
  if (e.amount !== 0) return signed(e.amount);
  if (e.kind === "piece") return "+1 piece";
  if (e.kind === "lit") return "Lit";
  return "–";
}

export function ActivityList({
  entries,
  names,
}: {
  entries: HistoryEntry[];
  names: Record<ProjectorLocation, ZoneName>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const kindsOf = (f: Filter) => FILTERS.find((x) => x.key === f)?.kinds ?? [];
  const pick = (f: Filter) => (f === "all" ? entries : entries.filter((e) => kindsOf(f).includes(e.kind)));
  const rows = pick(filter);

  const earned = rows.reduce((sum, e) => sum + Math.max(e.amount, 0), 0);
  const spent = rows.reduce((sum, e) => sum + Math.min(e.amount, 0), 0);
  // Newest first, so Day 2 comes before Day 1.
  const days = ([2, 1] as const)
    .map((day) => ({ day, list: rows.filter((e) => e.day === day) }))
    .filter((d) => d.list.length > 0);

  return (
    <div className="fi-activity">
      <div className="fi-act-sum">
        <div data-sign="up">
          <small>Earned</small>
          <b className="fh-mono">{signed(earned)}</b>
        </div>
        <div data-sign="down">
          <small>Spent</small>
          <b className="fh-mono">{signed(spent)}</b>
        </div>
        <div>
          <small>Net</small>
          <b className="fh-mono">{signed(earned + spent)}</b>
        </div>
      </div>

      <div className="fi-act-tabs" role="group" aria-label="Filter activity">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className="fi-act-tab"
            data-tone={f.key}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.icon && <span aria-hidden>{f.icon}</span>}
            {f.label}
            <span className="fi-act-count fh-mono">{pick(f.key).length}</span>
          </button>
        ))}
      </div>

      {days.length ? (
        days.map(({ day, list }) => (
          <section key={day} className="fi-act-day">
            <h3>
              Day {day}
              <small className="fh-mono">
                {list.length} {list.length === 1 ? "entry" : "entries"}
              </small>
            </h3>
            <ol className="fi-act-list">
              {list.map((e) => (
                <li key={e.id} data-tone={KIND_TONE[e.kind]}>
                  <span className="fi-act-ic" aria-hidden>
                    {KIND_ICON[e.kind]}
                  </span>
                  <span className="fi-act-text">
                    <b>{fillZones(e.title, names)}</b>
                    {e.detail && <small>{fillZones(e.detail, names)}</small>}
                  </span>
                  <span className="fi-act-side">
                    <span
                      className="fi-act-amt fh-mono"
                      data-sign={e.amount > 0 ? "up" : e.amount < 0 ? "down" : "zero"}
                    >
                      {entryBadge(e)}
                    </span>
                    <time className="fh-mono">{e.time}</time>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ))
      ) : (
        <div className="fi-act-empty">
          <span aria-hidden>
            <Coins size={22} />
          </span>
          <p>Nothing here yet. Win station games and open blind boxes to fill this up.</p>
        </div>
      )}
    </div>
  );
}
