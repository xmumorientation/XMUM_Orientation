"use client";

import { Check, Copy, Sparkles } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { Card } from "@/components/ui";
import { useConfig } from "@/components/useConfig";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { BlindBoxAssignment, BlindBoxType } from "@/lib/types";

export type BlindBoxRow = BlindBoxAssignment & { type: BlindBoxType | null };

type Row = BlindBoxRow;

interface Shown {
  url: string;
  qr: string;
}

/** The account as a seller: the box types it holds, with its one QR once loaded. */
export interface MyBlindBoxSeller {
  id: number;
  rows: BlindBoxRow[];
  /** At least one active, unarchived box type: false means Admin switched it off. */
  live: boolean;
  left: number;
  qr: Shown | undefined;
}

// game_config values are jsonb: true or "true".
const isOn = (v: unknown) => v === true || v === "true";

// The signed-in account's own blind boxes, with its one QR (stations no longer
// hold boxes, since 0098). Used by BlindBoxCard and by Staff
// Home's "My Blind Box" stop. Links are recomputed by the server on demand, so
// showing a QR never invalidates one that is already out there; only Admin's
// Regenerate does.
export function useMyBlindBoxes() {
  const profile = useProfile();
  const { config } = useConfig();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [shown, setShown] = useState<Record<number, Shown>>({});
  const [copied, setCopied] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  /** Why buying is paused right now (kill switches), or null. The QR cannot sell meanwhile. */
  const paused = isOn(config.blindbox_disabled)
    ? "Blind boxes are switched off by Admin, so buying is paused. Your QR works again when they are back on."
    : isOn(config.tokens_frozen)
      ? "Tokens are frozen by Admin, so buying is paused. Your QR works again when they are unfrozen."
      : null;

  // Several events can start overlapping loads; only the newest one may
  // update the state, so a slow older answer never brings back a dead QR.
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const stale = () => seq !== loadSeq.current;
    // Admin's RLS reads every assignment (the Spot's too), so filter to this
    // account's own; everyone else's RLS already does.
    const { data, error: err } = await supabase
      .from("blind_box_assignments")
      .select("*, type:blind_box_types(*)")
      .eq("profile_id", profile.id)
      .order("id");
    if (stale()) return;
    setLoaded(true);
    if (err) {
      setError(err.message);
      return;
    }
    const list = (data as unknown as Row[]) ?? [];
    setRows(list);
    if (list.length === 0) {
      setShown({});
      setError(null);
      return;
    }

    try {
      const res = await fetch("/api/blindbox/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: list.map((r) => r.id) }),
      });
      const json = (await res.json()) as {
        links?: { id: number; url: string }[];
        error?: string;
      };
      if (stale()) return;
      if (!res.ok || !json.links) {
        setError(json.error ?? "Couldn't load your QR.");
        return;
      }
      const next: Record<number, Shown> = {};
      for (const l of json.links) {
        next[l.id] = {
          url: l.url,
          qr: await QRCode.toDataURL(l.url, { width: 480, margin: 2 }),
        };
      }
      if (stale()) return;
      setShown(next);
      setError(null);
    } catch (e) {
      if (!stale()) setError(String(e));
    }
  }, [supabase, profile.id]);

  useEffect(() => {
    load();
    // Unique name per mount: the browser client is shared across components.
    //   assignments: stock sold or changed
    //   types:       Admin changed a price or name
    //   sellers:     Admin regenerated this seller's QR
    const channel = supabase
      .channel(`bb-card-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "blind_box_assignments" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "blind_box_types" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "blind_box_sellers" }, load)
      .subscribe();
    // A phone in another app can miss events: catch up when it comes back.
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [supabase, load]);

  async function copy(id: number, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      // Clipboard can be blocked; the link text stays selectable.
    }
  }

  const bySeller = new Map<number, Row[]>();
  for (const r of rows) bySeller.set(r.seller_id, [...(bySeller.get(r.seller_id) ?? []), r]);
  const sellers: MyBlindBoxSeller[] = [...bySeller.entries()].map(([id, list]) => ({
    id,
    rows: list,
    live: list.some((r) => r.active && !r.type?.archived),
    left: list.reduce((n, r) => n + (r.active && !r.type?.archived ? Math.max(r.quantity - r.opened, 0) : 0), 0),
    qr: shown[list[0].id],
  }));

  return { loaded, error, sellers, copy, copied, paused };
}

// "My blind box QR" (GM page, Admin): the same layout as Staff Home's "My
// Blind Box", centred: the QR first, then what is left of each box type. One QR
// for every type; it works until all the boxes are sold.
export function BlindBoxCard() {
  const { error, sellers, copy, copied, paused } = useMyBlindBoxes();

  if (sellers.length === 0 && !error) return null;

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {sellers.map(({ id: sellerId, rows: list, live, left: totalLeft, qr: s }) => (
        <Card key={sellerId} className="flex flex-col items-center gap-3 text-center">
          <div>
            <h2 className="font-semibold">My blind box QR</h2>
            <p className="text-sm text-ink-faint">{totalLeft} left · each group can buy one box from you</p>
          </div>

          {!live ? (
            <p className="text-sm font-semibold text-red-600">Switched off by Admin. This code doesn&apos;t work right now.</p>
          ) : paused && totalLeft > 0 ? (
            <p className="text-sm font-semibold text-amber-600">{paused}</p>
          ) : totalLeft <= 0 ? (
            <p className="text-sm font-semibold text-ink-faint">All boxes sold.</p>
          ) : s ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.qr} alt="Blind box QR code" className="w-56 max-w-full rounded-xl border border-paper-200" />
              <p className="text-xs text-ink-faint">Let a Freshie scan this after your mini-game. Any phone camera works.</p>
              <button type="button" onClick={() => copy(sellerId, s.url)} className="btn-secondary min-h-[40px] px-4 text-sm">
                {copied === sellerId ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.75} />}
                {copied === sellerId ? "Copied" : "Copy link"}
              </button>
            </>
          ) : (
            <div className="h-56 w-56 animate-pulse rounded-xl bg-paper-200" aria-label="Loading QR" />
          )}

          <ul className="flex flex-wrap justify-center gap-2">
            {list.map((r) => (
              <li key={r.id} className="min-w-[9rem] rounded-xl bg-paper-100 px-3 py-2 text-sm">
                <p className="flex items-center justify-center gap-1 font-semibold">
                  {r.type?.name ?? "Box"}
                  {r.type?.is_special && <Sparkles size={14} strokeWidth={1.75} className="text-amber-500" aria-label="special" />}
                </p>
                <p className="font-mono text-lg font-bold tabular-nums">
                  {Math.max(r.quantity - r.opened, 0)}
                  <span className="text-sm font-normal text-ink-faint">/{r.quantity}</span>
                </p>
                <p className="text-xs text-ink-faint">{priceText(r.type)}</p>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

/** "Free", "1 token", "3 tokens". */
export function priceText(type: BlindBoxType | null): string {
  if (!type) return "";
  return type.price > 0 ? `${type.price} token${type.price !== 1 ? "s" : ""}` : "Free";
}
