"use client";

import { Check, Copy, Sparkles } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { Card } from "@/components/ui";
import { useConfig } from "@/components/useConfig";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { BlindBoxAssignment, BlindBoxType } from "@/lib/types";

export type BlindBoxRow = BlindBoxAssignment & {
  type: BlindBoxType | null;
  station: { name: string; code: string } | null;
};

type Row = BlindBoxRow;

interface Shown {
  url: string;
  qr: string;
}

/** One seller (an account or a station) and the box types it holds, with its QR once loaded. */
export interface MyBlindBoxSeller {
  id: number;
  rows: BlindBoxRow[];
  station: { name: string; code: string } | null;
  /** At least one active, unarchived box type: false means Admin switched it off. */
  live: boolean;
  left: number;
  qr: Shown | undefined;
}

// game_config values are jsonb: true or "true".
const isOn = (v: unknown) => v === true || v === "true";

// The signed-in account's blind boxes (personal + its station's shared pool),
// grouped by seller, with each seller's QR. Used by BlindBoxCard and by Staff
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
    // Everyone else's RLS already limits rows to their own account and their
    // CURRENT station (a GM's station changes by day on the server, so the
    // station_id this page loaded with can be stale). Admin's RLS reads every
    // assignment, so Admin filters to their own boxes explicitly.
    let query = supabase
      .from("blind_box_assignments")
      .select("*, type:blind_box_types(*), station:stations(name, code)");
    if (profile.role === "admin") {
      query = query.or(
        profile.station_id
          ? `profile_id.eq.${profile.id},station_id.eq.${profile.station_id}`
          : `profile_id.eq.${profile.id}`
      );
    }
    const { data, error: err } = await query.order("id");
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
  }, [supabase, profile.id, profile.role, profile.station_id]);

  useEffect(() => {
    load();
    // Unique name per mount: the browser client is shared across components.
    //   assignments: stock sold or changed
    //   types:       Admin changed a price or name
    //   sellers:     Admin regenerated this seller's QR
    //   phases:      a day starting or ending moves a GM to that day's station
    const channel = supabase
      .channel(`bb-card-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "blind_box_assignments" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "blind_box_types" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "blind_box_sellers" }, load)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "phases" }, load)
      .subscribe();
    // Admin moving a GM to another station sends no event: catch up whenever
    // the phone comes back to this page.
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

  // A personal account has one seller; so does its station, and a GM can have
  // both (own boxes + the station's shared pool).
  const bySeller = new Map<number, Row[]>();
  for (const r of rows) bySeller.set(r.seller_id, [...(bySeller.get(r.seller_id) ?? []), r]);
  const sellers: MyBlindBoxSeller[] = [...bySeller.entries()].map(([id, list]) => ({
    id,
    rows: list,
    station: list[0].station,
    live: list.some((r) => r.active && !r.type?.archived),
    left: list.reduce((n, r) => n + (r.active && !r.type?.archived ? Math.max(r.quantity - r.opened, 0) : 0), 0),
    qr: shown[list[0].id],
  }));

  return { loaded, error, sellers, copy, copied, paused };
}

// "My blind box QR": ONE card with ONE QR for the signed-in account (or its
// station: a station's GMs share one pool and one code), listing every box type
// it holds. The same QR works until all the boxes are sold.
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
      {sellers.map(({ id: sellerId, rows: list, station, live, left: totalLeft, qr: s }) => {
        return (
          <Card key={sellerId} className="text-center">
            <h2 className="font-semibold">My blind box QR</h2>
            <p className="text-sm text-ink-faint">
              {station
                ? `Station ${station.name} — shared with this station's other GMs`
                : "Your own boxes"}
            </p>
            <ul className="mx-auto mt-2 max-w-sm space-y-1 text-sm text-ink-faint">
              {list.map((r) => {
                const left = Math.max(r.quantity - r.opened, 0);
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-center gap-x-2">
                    <span className="font-semibold text-ink">{r.type?.name ?? "Box"}</span>
                    {r.type?.is_special && (
                      <span className="chip bg-amber-400/40 text-amber-500">
                        <Sparkles size={12} strokeWidth={1.75} /> special
                      </span>
                    )}
                    <span>
                      {left} of {r.quantity} left
                      {r.type ? ` · ${r.type.price > 0 ? `${r.type.price} token${r.type.price !== 1 ? "s" : ""}` : "free"}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-xs text-ink-faint">
              One QR for all of these. Each group can buy one box from you; the code keeps working until they are all sold.
            </p>

            {!live ? (
              <p className="mt-3 text-sm font-semibold text-red-600">
                Switched off by Admin — this code doesn&apos;t work right now.
              </p>
            ) : paused && totalLeft > 0 ? (
              <p className="mt-3 text-sm font-semibold text-amber-600">{paused}</p>
            ) : totalLeft <= 0 ? (
              <p className="mt-3 text-sm font-semibold text-ink-faint">
                All boxes sold.
              </p>
            ) : s ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.qr}
                  alt="Blind box QR code"
                  className="mx-auto mt-3 w-56 max-w-full rounded-xl border border-paper-200"
                />
                <p className="mt-2 text-xs text-ink-faint">
                  Let a Freshie scan this after your mini-game. Any phone camera works.
                </p>
                <div className="mx-auto mt-2 flex max-w-sm items-center gap-2">
                  <input
                    readOnly
                    value={s.url}
                    aria-label="Blind box link"
                    onFocus={(e) => e.currentTarget.select()}
                    className="input min-w-0 flex-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => copy(sellerId, s.url)}
                    className="btn-secondary min-h-[40px] shrink-0 px-3 text-xs"
                  >
                    {copied === sellerId ? (
                      <Check size={14} strokeWidth={2} />
                    ) : (
                      <Copy size={14} strokeWidth={1.75} />
                    )}
                    {copied === sellerId ? "Copied" : "Copy"}
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-ink-faint">Loading QR…</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
