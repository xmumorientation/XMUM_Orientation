"use client";

import { Package } from "lucide-react";
import { useMemo, useState } from "react";

import { BOX_REVEAL_VIDEO, BoxReveal } from "@/components/BoxReveal";
import { supabaseBrowser } from "@/lib/supabase/client";
import type {
  BlindBoxPreview,
  BlindBoxPreviewStatus,
  BlindBoxResult,
} from "@/lib/types";
import { friendlyError, idemKey } from "@/lib/utils";

// What each non-"ok" preview status tells the Freshie instead of the Open
// button. Nothing here deducts anything.
const BLOCKED: Record<
  Exclude<BlindBoxPreviewStatus, "ok">,
  { title: string; message: (p: BlindBoxPreview) => string }
> = {
  disabled: {
    title: "Paused",
    message: () => "Blind boxes are paused by the committee. Try again shortly.",
  },
  frozen: {
    title: "Paused",
    message: () => "Token operations are briefly paused by the committee. Try again shortly.",
  },
  sold_out: {
    title: "All gone!",
    message: (p) => `${p.seller_name} has given out all their blind boxes.`,
  },
  already_from_seller: {
    title: "Already opened!",
    message: (p) =>
      `Your group has already opened a blind box from ${p.seller_name}. Find a different one!`,
  },
  cap_reached: {
    title: "No more opens",
    message: (p) =>
      `Your group has used all ${p.cap} of its blind box opens.`,
  },
  insufficient: {
    title: "Not enough tokens",
    message: (p) =>
      `This box costs ${p.price} token${p.price !== 1 ? "s" : ""} and your group has ${p.balance}.`,
  },
};

// Confirm screen + opening. Opening the link only shows this screen; the
// price is paid and a box is deducted only when Open is tapped.
export function BlindBoxOpener({
  assignmentId,
  version,
  preview,
}: {
  assignmentId: number;
  version: number;
  preview: BlindBoxPreview;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  // One key per screen visit: a double-tap or a retry applies exactly once.
  const [key] = useState(() => idemKey());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BlindBoxResult | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("fn_open_blind_box", {
      p_assignment_id: assignmentId,
      p_version: version,
      p_idempotency_key: key,
    });
    setBusy(false);
    if (err) setError(friendlyError(err));
    else setResult(data as BlindBoxResult);
  }

  if (result) {
    return (
      <BoxReveal
        tokens={result.tokens}
        special={result.special}
        memberName={result.seller_name}
        balance={result.balance}
      />
    );
  }

  const blocked = preview.status === "ok" ? null : BLOCKED[preview.status];
  const price = preview.price;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-night-900 px-8 text-center">
      <div
        aria-hidden="true"
        className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10"
      >
        <Package size={36} strokeWidth={1.5} className="text-white" />
      </div>

      <p className="mt-6 text-sm text-white/60">From {preview.seller_name}</p>
      <h1 className="mt-1 font-display text-2xl font-bold text-white">
        {preview.type_name}
        {preview.special && (
          <span className="chip ml-2 bg-amber-400/40 align-middle text-amber-300">
            special
          </span>
        )}
      </h1>

      {blocked ? (
        <>
          <p className="mt-6 text-xl font-bold text-white">{blocked.title}</p>
          <p className="mt-2 max-w-xs text-white/70">{blocked.message(preview)}</p>
        </>
      ) : (
        <>
          <p className="mt-6 text-white/80">
            {price > 0
              ? `Costs ${price} token${price !== 1 ? "s" : ""} from your group.`
              : "Free to open."}
          </p>
          <p className="mt-1 font-mono text-sm text-brand-1">
            Group balance: {preview.balance}
          </p>
          <p className="mt-1 text-xs text-white/50">
            Your group has opened {preview.group_claims} of {preview.cap} boxes.
          </p>
          {error && (
            <p role="alert" className="mt-4 max-w-xs text-sm text-red-300">
              {error}
            </p>
          )}
          <button
            onClick={open}
            disabled={busy}
            className="btn-primary mt-8 min-h-[64px] min-w-[220px] text-lg"
          >
            {busy ? "Opening…" : price > 0 ? `Open (-${price})` : "Open"}
          </button>
        </>
      )}

      <a href="/dashboard" className="btn-secondary mt-6 min-w-[180px]">
        Back to home
      </a>

      {/* Warm the cache while the Freshie reads this screen, so the opening
          clip starts the moment they tap Open. Invisible and silent. */}
      {!blocked && (
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
    </main>
  );
}
