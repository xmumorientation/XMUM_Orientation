"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Clock3, History, Info, KeyRound, Lock, MapPin, Nfc, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { BOX_REVEAL_VIDEO, BoxReveal } from "@/components/BoxReveal";
import { vxSlab, vxDisplay, nexusBody } from "@/components/home/fonts";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PROJECTOR_LABELS, type ProjectorLocation } from "@/lib/types";
import { friendlyError } from "@/lib/utils";

import "../freshie.css";
import { themeFromColor } from "../groupTheme";
import { BlindBox } from "./BlindBox";
import { cardState, keyLocations, zoneNames } from "./derive";
import { KEY_NAMES, KeyEmblem } from "./KeyEmblem";
import { ActivityList, BlueprintDetail, ItemShelf, KeyBanner, ProjectorKeys, TokenDetail, type ShelfItem } from "./sections";
import type { BoxKind, BoxReward, ItemsData } from "./types";
import { useNewPieces } from "./useNewPieces";

// Freshie and facilitator Items page. Top: the three projectors, each over its
// puzzle key (the group's 5 pieces for it; tap for details or, once all 5 are
// in, the key and Guardian spot). Then a shelf of tokens and blind boxes: tap
// tokens for details, or a box to unlock it (BlindBox). Activity opens in a sheet.

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
  /** Only the group's Freshie login opens boxes; a Facilitator can see them. */
  canOpenBoxes: boolean;
  /** Opens one box and returns what it gave, or null if it failed. */
  onOpenBox: (kind: BoxKind) => Promise<BoxReward | null>;
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
  const [tokensOpen, setTokensOpen] = useState(false);
  const [boxFor, setBoxFor] = useState<BoxKind | null>(null);
  // A real box that was just opened: the full-screen opening clip, then the prize.
  const [revealed, setRevealed] = useState<Extract<BoxReward, { type: "tokens" }> | null>(null);

  function selectShelf(item: ShelfItem) {
    if (item === "tokens") setTokensOpen(true);
    else setBoxFor(item.replace(/^box:/, ""));
  }

  const keys = keyLocations(data);
  const names = zoneNames(data);
  const arrivals = useNewPieces(data.pieces);

  function selectLocation(loc: ProjectorLocation) {
    if (cardState(data, loc) === "key") setKeyFor(loc);
    else setDetailFor(loc);
  }

  return (
    <div className={`fh fi ${vxSlab.variable} ${vxDisplay.variable} ${nexusBody.variable}`} style={themeVars}>
      <div className="fh-bg" aria-hidden>
        <div className="fh-glow" style={{ width: 380, height: 380, background: "var(--fh-glow)", left: -150, top: 40, opacity: 0.32 }} />
        <div className="fh-glow" style={{ width: 280, height: 280, background: "#FE06AB", right: -140, bottom: 80, opacity: 0.14 }} />
      </div>

      <header className="fi-top">
        <div className="fi-top-row">
          <h1 className="fh-slab">Items</h1>
          <button type="button" className="fi-activity-btn" onClick={() => setActivityOpen(true)}>
            <History size={16} aria-hidden />
            Activity
          </button>
        </div>
        <div className="fi-game-status" data-phase={data.phase}>
          <span>
            {PHASE_LABEL[data.phase]}
            {sample && <span className="fi-sample">Sample data</span>}
          </span>
          {data.timeLeft && <span className="fi-game-clock"><Clock3 size={15} aria-hidden /><strong>{data.timeLeft}</strong><span>left to play</span></span>}
        </div>
      </header>

      <ProjectorKeys data={data} arrivals={arrivals} onSelect={selectLocation} />

      {keys.map((loc) => (
        <div key={loc} className="fi-sec fi-keyban-slot" data-celebrate={arrivals[loc]?.completed || undefined}>
          <div className="fi-keyban-clip">
            <KeyBanner data={data} loc={loc} justCompleted={arrivals[loc]?.completed} onOpen={() => setKeyFor(loc)} />
          </div>
        </div>
      ))}

      <ItemShelf data={data} onSelect={selectShelf} />

      <Sheet open={keyFor !== null} onClose={() => setKeyFor(null)} themeVars={themeVars} title={keyFor ? `${names[keyFor].short} key unlocked` : ""}>
        {keyFor && <KeySheet data={data} loc={keyFor} />}
      </Sheet>

      <Sheet open={detailFor !== null} onClose={() => setDetailFor(null)} themeVars={themeVars} title={detailFor ? names[detailFor].long : ""}>
        {detailFor && <BlueprintDetail data={data} loc={detailFor} />}
      </Sheet>

      <Sheet open={tokensOpen} onClose={() => setTokensOpen(false)} themeVars={themeVars} title="Tokens">
        <TokenDetail data={data} />
      </Sheet>

      <BlindBox
        kind={boxFor}
        data={data}
        canOpen={canOpenBoxes}
        onOpenBox={onOpenBox}
        onReveal={setRevealed}
        onClose={() => setBoxFor(null)}
        themeVars={themeVars}
      />

      {/* In a portal so it covers the whole screen, tab bar included. */}
      {revealed?.real &&
        createPortal(
          <BoxReveal
            tokens={revealed.amount}
            special={revealed.real.special}
            memberName={revealed.real.seller}
            balance={revealed.real.balance}
            onContinue={() => setRevealed(null)}
          />,
          document.body
        )}

      {/* Warm the opening clip while there is a sealed box, so it starts the
          moment the box is opened. Invisible and silent. */}
      {data.boxes.some((b) => b.unopened > 0 && !b.range) && (
        <video
          src={BOX_REVEAL_VIDEO}
          preload="auto"
          muted
          playsInline
          aria-hidden="true"
          tabIndex={-1}
          className="pointer-events-none absolute h-px w-px opacity-0"
        />
      )}

      <Sheet open={activityOpen} onClose={() => setActivityOpen(false)} themeVars={themeVars} title="Activity">
        <h2 className="fi-sheet-title">Activity</h2>
        <p className="fi-sheet-sub">Every token, piece and box for {data.group.name}, newest first.</p>
        <ActivityList entries={data.history} names={names} />
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

/**
 * Demo scan for testing the map's Lightbulbs view without the NFC cards.
 * Shown only while Admin has "NFC demo mode" on (Live control); it lights the
 * bulb for real through fn_demo_activate_projector.
 */
function useNfcDemo(loc: ProjectorLocation) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("game_config")
      .select("value")
      .eq("key", "nfc_demo_mode")
      .maybeSingle()
      .then(({ data }) => {
        if (active) setEnabled(data?.value === true || data?.value === "true");
      });
    return () => {
      active = false;
    };
  }, [supabase]);

  async function scan() {
    setBusy(true);
    setResult(null);
    const { error } = await supabase.rpc("fn_demo_activate_projector", { p_location: loc });
    setBusy(false);
    setResult(error ? { ok: false, text: friendlyError(error) } : { ok: true, text: "Lit for your group." });
  }

  return { enabled, busy, result, scan };
}

function KeySheet({ data, loc }: { data: ItemsData; loc: ProjectorLocation }) {
  const demo = useNfcDemo(loc);
  const spot = data.guardian[loc];
  const endgame = data.phase === "endgame";
  const name = zoneNames(data)[loc];
  const unlocked = data.mapUnlocked;
  return (
    <div className="fi-key">
      <span className="fi-eb fh-mono">{name.long}</span>
      <h2 className="fi-key-title">{name.short} key unlocked</h2>
      <p className="fi-key-sub">All 5 pieces are in. Your {KEY_NAMES[loc]} is ready.</p>

      <KeyEmblem className="fi-key-big" loc={loc} owned={data.pieces[loc]} blade />

      <div className="fi-ticket">
        <KeyRound size={22} aria-hidden />
        <span>
          <b>
            {KEY_NAMES[loc]}
            {unlocked ? ` / ${PROJECTOR_LABELS[loc]}` : ""}
          </b>
          <small className="fh-mono">
            {data.group.name.toUpperCase()} / ONE USE
          </small>
        </span>
      </div>

      <figure className="fi-spot">
        {unlocked && spot.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={spot.photoUrl} alt={`Where the Guardian stands: ${spot.place}`} />
        ) : (
          <div className="fi-spot-ph" aria-hidden>
            {unlocked ? <MapPin size={28} /> : <Lock size={26} />}
            <span className="fh-mono">{unlocked ? "Photo coming soon" : "Hidden until the map unlocks"}</span>
          </div>
        )}
        <figcaption>
          <span className="fi-eb fh-mono">Where the Guardian stands</span>
          {unlocked ? (
            <>
              <b>{spot.place}</b>
              <span>{spot.hint}</span>
            </>
          ) : (
            <span>The place appears here when the full map unlocks.</span>
          )}
        </figcaption>
      </figure>

      {!endgame && (
        <p className="fi-warn">
          <Info size={16} aria-hidden />
          <span>
            The Guardian arrives in the final 30 minutes. If another group lights {name.short} first, this key stops
            working.
          </span>
        </p>
      )}

      <div className="fi-key-actions">
        {unlocked && (
          <Link href={`/map?focus=${loc}`} className="fh-btn fh-btn-ghost">
            <MapPin size={16} aria-hidden /> Show on map
          </Link>
        )}
        <button type="button" className="fh-btn fh-btn-primary" disabled>
          <Nfc size={16} aria-hidden /> Scan part card
        </button>
        {demo.enabled && (
          <button
            type="button"
            className="fh-btn fh-btn-ghost fi-key-demo"
            onClick={demo.scan}
            disabled={demo.busy || demo.result?.ok}
          >
            <Nfc size={16} aria-hidden /> {demo.busy ? "Scanning…" : "Demo scan"}
          </button>
        )}
      </div>
      {demo.result && (
        <p className="fi-key-foot" role="status">
          {demo.result.ok ? (
            <>
              Demo: {name.short} is {demo.result.text.toLowerCase()}{" "}
              <Link href="/map?layer=bulbs" className="underline">
                See it on the map
              </Link>
            </>
          ) : (
            demo.result.text
          )}
        </p>
      )}
      {demo.enabled && !demo.result && (
        <p className="fi-key-foot">Demo mode: lights this bulb without the card, for testing the map.</p>
      )}
      <p className="fi-key-foot">
        {endgame
          ? "Part-card scanning is added in the NFC step. For now, show this screen to the Guardian."
          : "Scanning opens in the final 30 minutes."}
      </p>
    </div>
  );
}
