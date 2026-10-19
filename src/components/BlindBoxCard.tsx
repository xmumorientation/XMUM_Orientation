"use client";

import { Check, Copy, Sparkles } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { Card } from "@/components/ui";
import { useConfig } from "@/components/useConfig";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { BlindBoxAssignment, BlindBoxType } from "@/lib/types";

type Row = BlindBoxAssignment & {
  type: BlindBoxType | null;
  station: { name: string; code: string } | null;
};

interface Shown {
  url: string;
  qr: string;
}

// "My blind box QR": ONE card with ONE QR for the signed-in account (or its
// station: a station's GMs share one pool and one code), listing every box type
// it holds. The same QR works until all the boxes are sold. Links are
// recomputed by the server on demand, so showing a QR never invalidates one
// that is already out there; only Admin's Regenerate does.
// game_config values are jsonb: true or "true".
const isOn = (v: unknown) => v === true || v === "true";

export function BlindBoxCard({
  showEmpty = false,
}: {
  /** Say so when this account holds no boxes (where Home's "My blind box QR" links). */
  showEmpty?: boolean;
} = {}) {
  const profile = useProfile();
  const { config } = useConfig();
  const paused = isOn(config.blindbox_disabled)
    ? "Blind boxes are switched off by Admin, so buying is paused. Your QR works again when they are back on."
    : isOn(config.tokens_frozen)
      ? "Tokens are frozen by Admin, so buying is paused. Your QR works again when they are unfrozen."
      : null;
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [shown, setShown] = useState<Record<number, Shown>>({});
  const [copied, setCopied] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Several events can start overlapping loads; only the newest one may
  // update the card, so a slow older answer never brings back a dead QR.
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

  if (rows.length === 0 && !error) {
    if (!showEmpty) return null;
    return (
      <Card className="text-center">
        <h2 className="font-semibold">My blind box QR</h2>
        <p className="mt-1 text-sm text-ink-faint">
          You have no blind boxes to sell yet. Admin hands them out in Admin → Blind box.
        </p>
      </Card>
    );
  }

  // One card per seller. A personal account has one seller; so does its
  // station, and a GM can have both (own boxes + the station's shared pool).
  const sellers = new Map<number, Row[]>();
  for (const r of rows) sellers.set(r.seller_id, [...(sellers.get(r.seller_id) ?? []), r]);

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {[...sellers.entries()].map(([sellerId, list]) => {
        const first = list[0];
        const live = list.some((r) => r.active && !r.type?.archived);
        const totalLeft = list.reduce(
          (n, r) => n + (r.active && !r.type?.archived ? Math.max(r.quantity - r.opened, 0) : 0),
          0
        );
        const s = shown[first.id];
        return (
          <Card key={sellerId} className="text-center">
            <h2 className="font-semibold">My blind box QR</h2>
            <p className="text-sm text-ink-faint">
              {first.station
                ? `Station ${first.station.name} — shared with this station's other GMs`
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
