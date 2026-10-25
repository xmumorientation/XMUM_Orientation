"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { useConfig } from "@/components/useConfig";
import { useDay2State } from "@/components/useDay2State";
import { blindBoxReason } from "@/lib/day2";
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
// hold boxes, since 0100). Used by BlindBoxCard and by Staff
// Home's "My Blind Box" stop. Links are recomputed by the server on demand, so
// showing a QR never invalidates one that is already out there; only Admin's
// Regenerate does.
export function useMyBlindBoxes() {
  const profile = useProfile();
  const { config } = useConfig();
  const day2 = useDay2State();
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
  /** Closed by the Day 2 inner schedule (0102): the QR shows, greyed, with this reason. */
  const closed = blindBoxReason(day2);

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

  return { loaded, error, sellers, copy, copied, paused, closed };
}

/** "Free", "1 token", "3 tokens". */
export function priceText(type: BlindBoxType | null): string {
  if (!type) return "";
  return type.price > 0 ? `${type.price} token${type.price !== 1 ? "s" : ""}` : "Free";
}
