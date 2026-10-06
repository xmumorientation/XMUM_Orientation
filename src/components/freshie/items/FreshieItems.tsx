"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Gift, History, Info, KeyRound, MapPin, Nfc, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { vxSlab } from "@/components/home/fonts";
import { PROJECTOR_LABELS, type ProjectorLocation } from "@/lib/types";

import "../freshie.css";
import { themeFromColor } from "../groupTheme";
import { SHORT_LABEL, cardState, keyLocations } from "./derive";
import { KEY_NAMES, KeyEmblem } from "./KeyEmblem";
import { ActivityList, BlueprintDetail, BoxDetail, ItemShelf, KeyBanner, ProjectorKeys, TokenDetail, type ShelfItem } from "./sections";
import type { BoxKind, ItemsData } from "./types";
import { useNewPieces } from "./useNewPieces";

// Freshie and facilitator Items page. Top: the three projectors, each over its
// puzzle key (the group's 5 pieces for it; tap for details or, once all 5 are
// in, the key and Guardian spot). Then a shelf of tokens and blind boxes (tap a tile for
// details). Activity opens in a sheet.

const PHASE_LABEL: Record<ItemsData["phase"], string> = {
  day1: "Day 1",
  day2: "Day 2",
  endgame: "Final 30 min",
  done: "Game over",
};

export function FreshieItems({
  data,
  groupColor,
  canOpenBoxes,
  onOpenBox,
  sample = false,
}: {
  data: ItemsData;
  groupColor: string | null | undefined;
  /** Facilitators open boxes; Freshies only see them. */
  canOpenBoxes: boolean;
  /** Opens one box and returns the tokens it gave, or null if it failed. */
  onOpenBox: (kind: BoxKind) => Promise<number | null>;
  /** Shows a "Sample data" label while the page is not on live data. */
  sample?: boolean;
}) {
  const theme = themeFromColor(groupColor);
  const themeVars = {
    "--fh-accent": theme.accent,
    "--fh-glow": theme.glow,
    "--fh-blue": theme.accent,
    "--fh-blue-light": theme.accentLight,
    "--fh-on-blue": theme.onAccent,
  } as React.CSSProperties;

  const [keyFor, setKeyFor] = useState<ProjectorLocation | null>(null);
  const [detailFor, setDetailFor] = useState<ProjectorLocation | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [shelfFor, setShelfFor] = useState<ShelfItem | null>(null);
  const [opened, setOpened] = useState<{ kind: BoxKind; amount: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function openBox(kind: BoxKind) {
    if (busy) return;
    setBusy(true);
    const amount = await onOpenBox(kind);
    setBusy(false);
    if (amount !== null) {
      setShelfFor(null);
      setOpened({ kind, amount });
    }
  }

  const keys = keyLocations(data);
  const arrivals = useNewPieces(data.pieces);

  function selectLocation(loc: ProjectorLocation) {
    if (cardState(data, loc) === "key") setKeyFor(loc);
    else setDetailFor(loc);
  }

  return (
    <div className={`fh fi ${vxSlab.variable}`} style={themeVars}>
      <div className="fh-bg" aria-hidden>
        <div className="fh-glow" style={{ width: 380, height: 380, background: "var(--fh-glow)", left: -150, top: 40, opacity: 0.32 }} />
        <div className="fh-glow" style={{ width: 280, height: 280, background: "#FE06AB", right: -140, bottom: 80, opacity: 0.14 }} />
      </div>

      <header className="fi-top">
        <div className="fi-top-row">
          <span className="fi-group">
            <i aria-hidden />
            {data.group.name}
            {sample && <span className="fi-sample fh-mono">Sample data</span>}
          </span>
          <span className="fi-phase fh-mono" data-phase={data.phase}>
            {PHASE_LABEL[data.phase]}
            {data.timeLeft ? ` · ${data.timeLeft}` : ""}
          </span>
        </div>
        <div className="fi-top-row">
          <h1 className="fh-slab">Items</h1>
          <button type="button" className="fi-activity-btn" onClick={() => setActivityOpen(true)}>
            <History size={16} aria-hidden />
            Activity
          </button>
        </div>
      </header>

      <ProjectorKeys data={data} arrivals={arrivals} onSelect={selectLocation} />

      {keys.map((loc) => (
        <div key={loc} className="fi-sec">
          <KeyBanner data={data} loc={loc} justCompleted={arrivals[loc]?.completed} onOpen={() => setKeyFor(loc)} />
        </div>
      ))}

      <ItemShelf data={data} onSelect={setShelfFor} />

      <Sheet open={keyFor !== null} onClose={() => setKeyFor(null)} themeVars={themeVars} title={keyFor ? `${SHORT_LABEL[keyFor]} key unlocked` : ""}>
        {keyFor && <KeySheet data={data} loc={keyFor} />}
      </Sheet>

      <Sheet open={detailFor !== null} onClose={() => setDetailFor(null)} themeVars={themeVars} title={detailFor ? PROJECTOR_LABELS[detailFor] : ""}>
        {detailFor && <BlueprintDetail data={data} loc={detailFor} />}
      </Sheet>

      <Sheet open={shelfFor !== null} onClose={() => setShelfFor(null)} themeVars={themeVars} title={shelfFor === "tokens" ? "Tokens" : "Blind box"}>
        {shelfFor === "tokens" && <TokenDetail data={data} />}
        {shelfFor && shelfFor !== "tokens" && (
          <BoxDetail data={data} kind={shelfFor} canOpen={canOpenBoxes} busy={busy} onOpen={() => openBox(shelfFor)} />
        )}
      </Sheet>

      <Sheet open={activityOpen} onClose={() => setActivityOpen(false)} themeVars={themeVars} title="Activity">
        <h2 className="fi-sheet-title">Activity</h2>
        <p className="fi-sheet-sub">Every token, piece and box for {data.group.name}, newest first.</p>
        <ActivityList entries={data.history} />
      </Sheet>

      <Sheet open={opened !== null} onClose={() => setOpened(null)} themeVars={themeVars} title="Box opened">
        {opened && (
          <div className="fi-reveal">
            <span className="fi-reveal-box" data-kind={opened.kind} aria-hidden>
              <Gift size={44} strokeWidth={1.7} />
            </span>
            <b className="fi-reveal-num fh-slab">+{opened.amount}</b>
            <p>{opened.kind === "gold" ? "Gold box" : "Standard box"} · added to your group&apos;s tokens</p>
            <Dialog.Close asChild>
              <button type="button" className="fh-btn fh-btn-primary fh-btn-block">
                Nice
              </button>
            </Dialog.Close>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function Sheet({
  open,
  onClose,
  title,
  themeVars,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  themeVars: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fi-overlay" />
        <Dialog.Content className={`fh fi-sheet ${vxSlab.variable}`} style={themeVars} aria-describedby={undefined}>
          <span className="fi-grab" aria-hidden />
          <Dialog.Title className="fh-sr">{title}</Dialog.Title>
          <Dialog.Close className="fi-x" aria-label="Close">
            <X size={16} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function KeySheet({ data, loc }: { data: ItemsData; loc: ProjectorLocation }) {
  const spot = data.guardian[loc];
  const endgame = data.phase === "endgame";
  return (
    <div className="fi-key">
      <span className="fi-eb fh-mono">{PROJECTOR_LABELS[loc]}</span>
      <h2 className="fi-key-title">{SHORT_LABEL[loc]} key unlocked</h2>
      <p className="fi-key-sub">All 5 pieces are in. Your {KEY_NAMES[loc]} is ready.</p>

      <KeyEmblem className="fi-key-big" loc={loc} owned={data.pieces[loc]} blade />

      <div className="fi-ticket">
        <KeyRound size={22} aria-hidden />
        <span>
          <b>{KEY_NAMES[loc]} · {PROJECTOR_LABELS[loc]}</b>
          <small className="fh-mono">
            {data.group.name.toUpperCase()} · ONE USE
          </small>
        </span>
      </div>

      <figure className="fi-spot">
        {spot.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={spot.photoUrl} alt={`Where the Guardian stands: ${spot.place}`} />
        ) : (
          <div className="fi-spot-ph" aria-hidden>
            <MapPin size={28} />
            <span className="fh-mono">Photo coming soon</span>
          </div>
        )}
        <figcaption>
          <span className="fi-eb fh-mono">Where the Guardian stands</span>
          <b>{spot.place}</b>
          <span>{spot.hint}</span>
        </figcaption>
      </figure>

      {!endgame && (
        <p className="fi-warn">
          <Info size={16} aria-hidden />
          <span>
            The Guardian arrives in the final 30 minutes. If another group lights {SHORT_LABEL[loc]} first, this key
            stops working.
          </span>
        </p>
      )}

      <div className="fi-key-actions">
        <Link href={`/map?focus=${loc}`} className="fh-btn fh-btn-ghost">
          <MapPin size={16} aria-hidden /> Show on map
        </Link>
        <button type="button" className="fh-btn fh-btn-primary" disabled>
          <Nfc size={16} aria-hidden /> Scan part card
        </button>
      </div>
      <p className="fi-key-foot">
        {endgame
          ? "Part-card scanning is added in the NFC step. For now, show this screen to the Guardian."
          : "Scanning opens in the final 30 minutes."}
      </p>
    </div>
  );
}
