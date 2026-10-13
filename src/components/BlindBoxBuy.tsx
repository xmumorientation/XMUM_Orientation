"use client";

import { Package } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase/client";
import type {
  BlindBoxBuyResult,
  BlindBoxOption,
  BlindBoxPageStatus,
  BlindBoxPreview,
} from "@/lib/types";
import { friendlyError, idemKey } from "@/lib/utils";

// What the page says instead of the BUY buttons. Nothing here charges anything.
const BLOCKED: Record<Exclude<BlindBoxPageStatus, "ok">, { title: string; message: (p: BlindBoxPreview) => string }> = {
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
    title: "Already bought!",
    message: (p) =>
      `${p.group_name} has already bought a blind box from ${p.seller_name}. Find a different seller! Your box is waiting in Items.`,
  },
  cap_reached: {
    title: "No more boxes",
    message: (p) => `${p.group_name} has already bought all ${p.cap} blind boxes it is allowed.`,
  },
};

const tokens = (n: number) => `${n} token${n !== 1 ? "s" : ""}`;

function optionNote(o: BlindBoxOption, balance: number): string | null {
  if (o.status === "sold_out") return "Sold out";
  if (o.status === "insufficient") return `Need ${tokens(o.price - balance)} more`;
  return null;
}

// Scan page for a signed-in Freshie group. It shows WHICH group is buying and
// what the seller has; the price is charged and a box taken from the seller
// only when BUY is tapped. The bought box goes to the group's Items page and is
// opened from there.
export function BlindBoxBuy({
  sellerId,
  version,
  preview,
}: {
  sellerId: number;
  version: number;
  preview: BlindBoxPreview;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  // One key per screen visit: a double-tap or a retry applies exactly once.
  const [key] = useState(() => idemKey());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bought, setBought] = useState<BlindBoxBuyResult | null>(null);

  async function buy(assignmentId: number) {
    setBusyId(assignmentId);
    setError(null);
    const { data, error: err } = await supabase.rpc("fn_bb_buy", {
      p_seller_id: sellerId,
      p_version: version,
      p_assignment_id: assignmentId,
      p_idempotency_key: key,
    });
    setBusyId(null);
    if (err) setError(friendlyError(err));
    else setBought(data as BlindBoxBuyResult);
  }

  if (bought) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-night-900 px-8 text-center">
        <div aria-hidden="true" className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10">
          <Package size={36} strokeWidth={1.5} className="text-white" />
        </div>
        <p className="mt-6 text-sm text-white/60">From {bought.seller_name}</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-white">
          You bought a {bought.type_name} box!
          {bought.special && <span className="chip ml-2 bg-amber-400/40 align-middle text-amber-300">special</span>}
        </h1>
        <p className="mt-3 text-white/80">
          {bought.price > 0 ? `${tokens(bought.price)} paid. ` : "It was free. "}
          It is waiting in your Items. Open it there!
        </p>
        <p className="mt-1 font-mono text-sm text-brand-1">Group balance: {bought.balance}</p>
        <Link href="/inventory" className="btn-primary mt-8 min-h-[64px] min-w-[220px] text-lg">
          Go to my Items
        </Link>
        <Link href="/scan" className="btn-secondary mt-4 min-w-[180px]">
          Scan another QR
        </Link>
      </main>
    );
  }

  const blocked = preview.status === "ok" ? null : BLOCKED[preview.status];

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-night-900 px-6 py-10 text-center">
      <div aria-hidden="true" className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10">
        <Package size={36} strokeWidth={1.5} className="text-white" />
      </div>

      <p className="mt-6 text-sm text-white/60">Blind boxes from</p>
      <h1 className="mt-1 font-display text-2xl font-bold text-white">{preview.seller_name}</h1>
      <p className="mt-3 text-sm text-white/70">
        Buying for <strong className="text-white">{preview.group_name}</strong>
      </p>
      <p className="mt-1 font-mono text-sm text-brand-1">Group balance: {preview.balance}</p>
      <p className="mt-1 text-xs text-white/50">
        Your group has bought {preview.group_claims} of {preview.cap} boxes.
      </p>

      {blocked ? (
        <>
          <p className="mt-6 text-xl font-bold text-white">{blocked.title}</p>
          <p className="mt-2 max-w-xs text-white/70">{blocked.message(preview)}</p>
        </>
      ) : (
        <>
          {error && (
            <p role="alert" className="mt-4 max-w-xs text-sm text-red-300">
              {error}
            </p>
          )}
          <ul className="mt-6 w-full max-w-sm space-y-3">
            {preview.options.map((o) => {
              const note = optionNote(o, preview.balance);
              return (
                <li
                  key={o.assignment_id}
                  className="flex items-center justify-between gap-4 rounded-2xl bg-white/10 px-4 py-3 text-left"
                >
                  <div>
                    <p className="font-bold text-white">
                      {o.type_name}
                      {o.special && <span className="chip ml-2 bg-amber-400/40 text-amber-300">special</span>}
                    </p>
                    <p className="text-sm text-white/70">
                      {o.price > 0 ? tokens(o.price) : "Free"}
                      {o.status !== "sold_out" && ` · ${o.left} left`}
                    </p>
                    {note && <p className="text-xs text-amber-300">{note}</p>}
                  </div>
                  <button
                    onClick={() => buy(o.assignment_id)}
                    disabled={busyId !== null || o.status !== "ok"}
                    className="btn-primary min-h-[48px] min-w-[96px]"
                  >
                    {busyId === o.assignment_id ? "Buying…" : "BUY"}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Link href="/inventory" className="btn-secondary mt-8 min-w-[180px]">
        My Items
      </Link>
      <Link href="/dashboard" className="mt-3 text-sm text-white/60 underline">
        Back to home
      </Link>
    </main>
  );
}
