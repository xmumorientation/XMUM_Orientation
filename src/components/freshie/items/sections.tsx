"use client";

import {
  ChevronRight,
  Coins,
  Gift,
  KeyRound,
  Lightbulb,
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

import { cardState, fillZones, lampState, ourLitLocation, zoneNames, type CardState, type ZoneName } from "./derive";
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
  key: () => "Key ready",
  lit: () => "Lit by you",
  idle: (data, loc) => `Lit · ${data.projectors[loc]!.name}`,
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
  onSelect: (loc: ProjectorLocation) => void;
}) {
  return (
    <section className="fi-sec" aria-labelledby="fi-grid-title">
      <h2 id="fi-grid-title" className="fh-sr">
        Projectors and puzzle keys
      </h2>
      <div className="fi-grid" data-endgame={data.phase === "endgame"}>
        {PROJECTOR_LOCATIONS.map((loc) => {
          const name = zoneNames(data)[loc];
          const lamp = lampState(data, loc);
          const card = cardState(data, loc);
          const owned = data.pieces[loc];
          const other = lamp === "other" ? data.projectors[loc]!.color : undefined;
          const label = RING_LABEL[card](data, loc);
          const arrival = arrivals[loc];
          return (
            <button
              key={loc}
              type="button"
              className="fi-lamp"
              data-state={lamp}
              data-card={card}
              data-celebrate={arrival?.completed || undefined}
              style={other ? ({ "--fi-other": other } as React.CSSProperties) : undefined}
              onClick={() => onSelect(loc)}
              aria-label={`${name.long}: ${owned.length} of ${PIECES_PER_SET} pieces, ${label}. Show details.`}
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
            </button>
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
        <b>{zoneNames(data)[loc].short} key unlocked</b>
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
// Icon, name and count only. Tap a tile for details (and, for a Faci, Open).

export type ShelfItem = "tokens" | BoxKind;

const BOX_INFO: Record<BoxKind, { name: string; range: string }> = {
  gold: { name: "Gold box", range: "4–6 tokens each" },
  standard: { name: "Standard box", range: "1–2 tokens each" },
};

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
    { key: "gold", name: BOX_INFO.gold.name, count: data.boxes.gold.unopened },
    { key: "standard", name: BOX_INFO.standard.name, count: data.boxes.standard.unopened },
  ];

  return (
    <section className="fi-sec" aria-labelledby="fi-shelf-title">
      <h2 id="fi-shelf-title" className="fh-sr">
        Tokens and blind boxes
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
        <b className="fh-slab">{balance}</b> tokens
      </h2>
      <p className="fi-eb fh-mono">{data.phase === "day1" ? "On Day 2 this buys" : "You can play now"}</p>
      <div className="fi-tiers">
        {tiers.map((tier) => {
          const rounds = tier.cost > 0 ? Math.floor(balance / tier.cost) : 0;
          return (
            <div key={tier.key} className="fi-tier" data-tier={tier.key} data-none={rounds === 0}>
              <span className="fh-mono">
                <i aria-hidden />
                {tier.name} · {tier.cost}
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

export function BoxDetail({
  data,
  kind,
  canOpen,
  busy,
  onOpen,
}: {
  data: ItemsData;
  kind: BoxKind;
  canOpen: boolean;
  busy: boolean;
  onOpen: () => void;
}) {
  const stock = data.boxes[kind];
  const got = stock.opened.reduce((sum, v) => sum + v, 0);
  return (
    <div className="fi-item-detail">
      <span className="fi-item-art" data-item={kind} aria-hidden>
        <Gift size={34} strokeWidth={1.9} />
      </span>
      <h2 className="fi-sheet-title">{BOX_INFO[kind].name}</h2>
      <p className="fi-sheet-sub">{BOX_INFO[kind].range}</p>
      <dl className="fi-facts">
        <div>
          <dt>To open</dt>
          <dd className="fh-slab">{stock.unopened}</dd>
        </div>
        <div>
          <dt>Opened</dt>
          <dd className="fh-slab">{stock.opened.length}</dd>
        </div>
        <div>
          <dt>Tokens from them</dt>
          <dd className="fh-slab">+{got}</dd>
        </div>
      </dl>
      {canOpen ? (
        <button type="button" className="fh-btn fh-btn-primary fh-btn-block" disabled={stock.unopened === 0 || busy} onClick={onOpen}>
          {stock.unopened === 0 ? "No boxes to open" : "Open a box"}
        </button>
      ) : (
        <p className="fi-note">Your Faci opens the boxes. The tokens go straight to your group.</p>
      )}
    </div>
  );
}

// ── 4. One location's puzzle (opened from a lamp) ──────────────────────────

const CARD_STATUS: Record<CardState, string> = {
  locked: "Unlocks on Day 2",
  collecting: "Collecting",
  key: "Key unlocked",
  lit: "Projector lit",
  idle: "Idle",
  done: "Idle",
};

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
            {data.mapUnlocked ? KEY_NAMES[loc] : "Location revealed when the map unlocks"}
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
            <span className="fi-tag" style={{ "--fi-tag": lit.color } as React.CSSProperties}>
              Lit by {lit.name}
            </span>{" "}
            {owned.length ? `Your ${owned.length} piece${owned.length === 1 ? " is" : "s are"} now idle.` : "This projector is closed."}
          </>
        )}
        {state === "done" && ours && `Your group already lit ${names[ours].short}. These pieces are idle.`}
      </p>

      {data.mapUnlocked && (
        <Link href={`/map?focus=${loc}`} className="fh-btn fh-btn-ghost fh-btn-block">
          <MapPin size={16} aria-hidden /> Show on map
        </Link>
      )}
    </div>
  );
}

// ── Activity (opened from the header) ──────────────────────────────────────

type Filter = "all" | "day1" | "day2" | "boxes";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "day1", label: "Day 1" },
  { key: "day2", label: "Day 2" },
  { key: "boxes", label: "Boxes" },
];
const KIND_ICON: Record<HistoryEntry["kind"], React.ReactNode> = {
  game: <Coins size={16} />,
  entry: <Coins size={16} />,
  piece: <Puzzle size={16} />,
  box: <Gift size={16} />,
  fix: <Wrench size={16} />,
  lit: <Lightbulb size={16} />,
};

export function ActivityList({
  entries,
  names,
}: {
  entries: HistoryEntry[];
  names: Record<ProjectorLocation, ZoneName>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const rows = entries.filter(
    (e) =>
      filter === "all" ||
      (filter === "day1" && e.day === 1 && e.kind !== "box") ||
      (filter === "day2" && e.day === 2) ||
      (filter === "boxes" && e.kind === "box")
  );

  return (
    <div className="fi-activity">
      <div className="fi-chips" role="group" aria-label="Filter activity">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className="fi-chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>
      {rows.length ? (
        <ul className="fi-hist">
          {rows.map((e) => (
            <li key={e.id}>
              <span className="fi-hist-ic" aria-hidden>
                {KIND_ICON[e.kind]}
              </span>
              <span className="fi-hist-text">
                <b>{fillZones(e.title, names)}</b>
                <small>
                  {fillZones(e.detail, names)} · {e.time}
                </small>
              </span>
              <span className="fi-hist-amt fh-mono" data-sign={e.amount > 0 ? "up" : e.amount < 0 ? "down" : "zero"}>
                {e.amount > 0 ? `+${e.amount}` : e.amount < 0 ? `−${Math.abs(e.amount)}` : e.kind === "piece" ? "+1 piece" : "–"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="fi-note">Nothing here yet.</p>
      )}
    </div>
  );
}
