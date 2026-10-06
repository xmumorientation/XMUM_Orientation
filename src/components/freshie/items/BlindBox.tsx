"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Coins, Lock, Puzzle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { vxSlab } from "@/components/home/fonts";
import { PIECES_PER_SET } from "@/lib/types";

import { zoneNames } from "./derive";
import { KeyEmblem } from "./KeyEmblem";
import type { BoxKind, BoxReward, ItemsData } from "./types";

// Blind box flow, opened from a box tile on the shelf. Four stages:
//   ask     → "Unlock a Gold box?" with what is left and what it can give
//   sealed  → the 3D box floats; tap it to open
//   opening → it shakes, the lid flies off and light pours out (~1.4s)
//   reveal  → rays behind the reward card: tokens or a puzzle piece
// The box is opened (onOpenBox) when the viewer taps Unlock, so the reward is
// already saved before the animation plays; closing early loses nothing.
// Reduced motion skips the opening animation and goes straight to the reveal.

export const BOX_INFO: Record<BoxKind, { name: string; label: string; range: string }> = {
  gold: { name: "Gold box", label: "Gold", range: "4–6 tokens or a puzzle piece" },
  standard: { name: "Standard box", label: "Standard", range: "1–2 tokens each" },
};

type Stage = "ask" | "sealed" | "opening" | "reveal";

const OPEN_MS = 1400;

export function BlindBox({
  kind,
  data,
  canOpen,
  onOpenBox,
  onClose,
  themeVars,
}: {
  /** The box to open, or null when the flow is closed. */
  kind: BoxKind | null;
  data: ItemsData;
  canOpen: boolean;
  onOpenBox: (kind: BoxKind) => Promise<BoxReward | null>;
  onClose: () => void;
  themeVars: React.CSSProperties;
}) {
  return (
    <Dialog.Root open={kind !== null} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="bb-overlay" />
        <Dialog.Content className={`fh bb ${vxSlab.variable}`} style={themeVars} aria-describedby={undefined}>
          {kind && <BoxFlow kind={kind} data={data} canOpen={canOpen} onOpenBox={onOpenBox} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function BoxFlow({
  kind,
  data,
  canOpen,
  onOpenBox,
}: {
  kind: BoxKind;
  data: ItemsData;
  canOpen: boolean;
  onOpenBox: (kind: BoxKind) => Promise<BoxReward | null>;
}) {
  const [stage, setStage] = useState<Stage>("ask");
  const [reward, setReward] = useState<BoxReward | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const stock = data.boxes[kind];
  const info = BOX_INFO[kind];

  async function unlock() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const got = await onOpenBox(kind);
    setBusy(false);
    if (!got) {
      setFailed(true);
      return;
    }
    setReward(got);
    setStage("sealed");
  }

  function tapBox() {
    if (stage !== "sealed") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStage("reveal");
      return;
    }
    setStage("opening");
    timer.current = window.setTimeout(() => setStage("reveal"), OPEN_MS);
  }

  return (
    <div className="bb-flow" data-kind={kind} data-stage={stage}>
      <Dialog.Title className="fh-sr">{stage === "reveal" ? "Box opened" : `Unlock a ${info.name.toLowerCase()}`}</Dialog.Title>
      <Dialog.Close className="fi-x bb-x" aria-label="Close">
        <X size={16} />
      </Dialog.Close>

      {stage === "ask" && (
        <div className="bb-card">
          <div className="bb-mini" aria-hidden>
            <Box3D kind={kind} />
          </div>
          <span className="fi-eb fh-mono">Blind box · {info.label}</span>
          <h2 className="bb-ask-title">Unlock a {info.name.toLowerCase()}?</h2>
          <p className="bb-ask-sub">{info.range}</p>
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
              <dd className="fh-slab">+{stock.opened.reduce((sum, v) => sum + v, 0)}</dd>
            </div>
          </dl>
          {canOpen ? (
            <>
              <button type="button" className="fh-btn fh-btn-primary fh-btn-block" disabled={stock.unopened === 0 || busy} onClick={unlock}>
                {stock.unopened === 0 ? "No boxes to open" : busy ? "Unlocking…" : "Unlock"}
              </button>
              {failed && <p className="bb-error">Could not open the box. Try again.</p>}
              <Dialog.Close asChild>
                <button type="button" className="bb-later">
                  Not now
                </button>
              </Dialog.Close>
            </>
          ) : (
            <p className="bb-locked">
              <Lock size={15} aria-hidden />
              Your Faci unlocks the boxes. What&apos;s inside goes straight to your group.
            </p>
          )}
        </div>
      )}

      {(stage === "sealed" || stage === "opening") && (
        <div className="bb-stage">
          <button type="button" className="bb-scene" onClick={tapBox} disabled={stage === "opening"} aria-label="Open the box">
            <span className="bb-light" aria-hidden />
            <Box3D kind={kind} />
            <span className="bb-shadow" aria-hidden />
          </button>
          <p className="bb-hint fh-mono" aria-live="polite">
            {stage === "sealed" ? "Tap the box to open" : "Opening…"}
          </p>
          <span className="bb-flash" aria-hidden />
        </div>
      )}

      {stage === "reveal" && reward && (
        <Reveal
          kind={kind}
          reward={reward}
          data={data}
          canOpenAnother={canOpen && stock.unopened > 0}
          busy={busy}
          onOpenAnother={unlock}
        />
      )}
    </div>
  );
}

// ── The 3D box ─────────────────────────────────────────────────────────────

function Box3D({ kind }: { kind: BoxKind }) {
  const info = BOX_INFO[kind];
  return (
    <span className="bb-cube" aria-hidden>
      <span className="bb-face bb-front">
        <span className="bb-tag fh-mono">Blind box · {info.label}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bb-logo" src="/vortexa-logo-sm.webp" alt="" />
        <span className="bb-q fh-slab">?</span>
        <span className="bb-foot fh-mono">{info.range}</span>
      </span>
      <span className="bb-face bb-side bb-right">
        <span className="bb-side-title fh-slab">Could be</span>
        <span className="bb-dots">
          <i data-c="coin">
            <Coins size={14} strokeWidth={2.4} />
          </i>
          <i data-c="coin">
            <Coins size={14} strokeWidth={2.4} />
          </i>
          <i data-c="coin">
            <Coins size={14} strokeWidth={2.4} />
          </i>
          <i data-c={kind === "gold" ? "piece" : "coin"}>
            {kind === "gold" ? <Puzzle size={14} strokeWidth={2.2} /> : <Coins size={14} strokeWidth={2.4} />}
          </i>
          <i data-c="secret">?</i>
        </span>
        <span className="bb-side-foot fh-mono">Vortexa · 2026</span>
      </span>
      <span className="bb-face bb-side bb-left">
        <span className="bb-side-title fh-slab">Vortexa</span>
      </span>
      <span className="bb-face bb-back" />
      <span className="bb-face bb-top">
        <span className="bb-ribbon" />
      </span>
      <span className="bb-face bb-bottom" />
    </span>
  );
}

// ── Reveal ─────────────────────────────────────────────────────────────────

const SPARKS = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2;
  const r = 120 + (i % 3) * 22;
  return { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r), delay: (i % 4) * 0.05 };
});

function Reveal({
  kind,
  reward,
  data,
  canOpenAnother,
  busy,
  onOpenAnother,
}: {
  kind: BoxKind;
  reward: BoxReward;
  data: ItemsData;
  canOpenAnother: boolean;
  busy: boolean;
  onOpenAnother: () => void;
}) {
  const stock = data.boxes[kind];
  const total = stock.opened.length + stock.unopened;
  const pad = (n: number) => String(n).padStart(2, "0");

  let tag: string;
  let title: string;
  let detail: string;
  let art: React.ReactNode;
  if (reward.type === "tokens") {
    tag = "Tokens";
    title = `+${reward.amount} tokens`;
    detail = `Added to ${data.group.name}'s tokens. You now have ${data.tokens.balance}.`;
    art = (
      <span className="bb-coin" aria-hidden>
        <Coins size={56} strokeWidth={2} />
      </span>
    );
  } else {
    const name = zoneNames(data)[reward.loc];
    const owned = data.pieces[reward.loc];
    tag = "Puzzle piece";
    title = `${name.short} piece #${reward.piece}`;
    detail = `A piece of the ${name.short} key. ${owned.length}/${PIECES_PER_SET} collected.`;
    art = (
      <KeyEmblem
        className="bb-piece"
        loc={reward.loc}
        owned={owned}
        fresh={reward.piece}
        blade={owned.length >= PIECES_PER_SET}
        celebrate={owned.length >= PIECES_PER_SET}
      />
    );
  }

  return (
    <div className="bb-reveal">
      <span className="bb-rays" aria-hidden />
      <div className="bb-art" data-reward={reward.type}>
        <span className="bb-halo" aria-hidden />
        {art}
        {SPARKS.map((s, i) => (
          <span
            key={i}
            className="bb-spark"
            aria-hidden
            style={{ "--dx": `${s.dx}px`, "--dy": `${s.dy}px`, animationDelay: `${0.15 + s.delay}s` } as React.CSSProperties}
          />
        ))}
      </div>
      <span className="bb-rtag fh-mono">{tag}</span>
      <span className="bb-no fh-mono">
        {BOX_INFO[kind].label} · No. {pad(stock.opened.length)} / {pad(total)}
      </span>
      <h2 className="bb-rtitle fh-slab">{title}</h2>
      <p className="bb-rdetail">{detail}</p>
      <div className="bb-ractions">
        {canOpenAnother && (
          <button type="button" className="fh-btn fh-btn-primary" disabled={busy} onClick={onOpenAnother}>
            {busy ? "Unlocking…" : "Open another"}
          </button>
        )}
        <Dialog.Close asChild>
          <button type="button" className="fh-btn fh-btn-ghost">
            Close
          </button>
        </Dialog.Close>
      </div>
    </div>
  );
}
