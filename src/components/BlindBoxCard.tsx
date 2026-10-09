"use client";

import { Check, Copy, Sparkles } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { Card } from "@/components/ui";
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

// "My blind box QR": one card per box the signed-in account holds, either
// personally or through its station (a station's GMs share one pool and one
// code). Links are recomputed by the server on demand, so showing a QR never
// invalidates one that is already out there; only Admin's Regenerate does.
export function BlindBoxCard() {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [shown, setShown] = useState<Record<number, Shown>>({});
  const [copied, setCopied] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Admin's RLS lets them read every assignment, so filter to this account's
    // own boxes (personal + own station) explicitly.
    const mine = profile.station_id
      ? `profile_id.eq.${profile.id},station_id.eq.${profile.station_id}`
      : `profile_id.eq.${profile.id}`;
    const { data, error: err } = await supabase
      .from("blind_box_assignments")
      .select("*, type:blind_box_types(*), station:stations(name, code)")
      .or(mine)
      .order("id");
    if (err) {
      setError(err.message);
      return;
    }
    const list = (data as unknown as Row[]) ?? [];
    setRows(list);
    if (list.length === 0) return;

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
      setShown(next);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [supabase, profile.id, profile.station_id]);

  useEffect(() => {
    load();
    // Unique name per mount: the browser client is shared across components.
    const channel = supabase
      .channel(`bb-card-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "blind_box_assignments" },
        load
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
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

  if (rows.length === 0 && !error) return null;

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {rows.map((r) => {
        const left = r.quantity - r.opened;
        const live = r.active && !r.type?.archived;
        const s = shown[r.id];
        return (
          <Card key={r.id} className="text-center">
            <h2 className="flex flex-wrap items-center justify-center gap-2 font-semibold">
              My blind box QR · {r.type?.name ?? "Box"}
              {r.type?.is_special && (
                <span className="chip bg-amber-400/40 text-amber-500">
                  <Sparkles size={12} strokeWidth={1.75} /> special
                </span>
              )}
            </h2>
            <p className="text-sm text-ink-faint">
              {r.station
                ? `Station ${r.station.name} — shared with this station's other GMs`
                : "Your own boxes"}
            </p>
            <p className="mt-1 text-sm text-ink-faint">
              {left} of {r.quantity} boxes left
              {r.type
                ? ` · ${r.type.price > 0 ? `${r.type.price} token${r.type.price !== 1 ? "s" : ""}` : "free"} to open · ${r.type.min_tokens}-${r.type.max_tokens} tokens inside`
                : ""}
              {" · each group can scan once"}
            </p>

            {!live ? (
              <p className="mt-3 text-sm font-semibold text-red-600">
                Switched off by Admin — this code doesn&apos;t work right now.
              </p>
            ) : left <= 0 ? (
              <p className="mt-3 text-sm font-semibold text-ink-faint">
                All boxes opened.
              </p>
            ) : s ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.qr}
                  alt={`Blind box QR code for ${r.type?.name ?? "box"}`}
                  className="mx-auto mt-3 w-56 max-w-full rounded-xl border border-paper-200"
                />
                <p className="mt-2 text-xs text-ink-faint">
                  Let a Freshie scan this after your mini-game.
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
                    onClick={() => copy(r.id, s.url)}
                    className="btn-secondary min-h-[40px] shrink-0 px-3 text-xs"
                  >
                    {copied === r.id ? (
                      <Check size={14} strokeWidth={2} />
                    ) : (
                      <Copy size={14} strokeWidth={1.75} />
                    )}
                    {copied === r.id ? "Copied" : "Copy"}
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
