"use client";

import { Check, Copy, RefreshCw, Sparkles } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { BlindBoxAssignment } from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

import type { TabProps } from "./TypesTab";
import type { Seller } from "./useBlindBoxAdmin";

// One row per seller: their ONE QR (every box type they hold), and per type
// how many are sold out of how many, with the number editable and an on/off
// switch. Setting a number to 0 takes that type back (only while none sold).
// Previewing a QR never changes it; Regenerate does.
export function CodesTab({ data, onError, onNotice, goTo }: TabProps) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [copied, setCopied] = useState<number | null>(null);
  const [qrs, setQrs] = useState<Record<number, string>>({});
  const [big, setBig] = useState<Seller | null>(null);

  const urlOf = (s: Seller) => data.links[s.rows[0].id]?.url;

  useEffect(() => {
    let cancel = false;
    (async () => {
      const next: Record<number, string> = {};
      for (const s of data.sellers) {
        const url = data.links[s.rows[0].id]?.url;
        if (url) next[s.id] = await QRCode.toDataURL(url, { width: 480, margin: 1 });
      }
      if (!cancel) setQrs(next);
    })();
    return () => {
      cancel = true;
    };
  }, [data.sellers, data.links]);

  const q = search.trim().toLowerCase();
  const rows = data.sellers.filter(
    (s) =>
      (!typeFilter || s.rows.some((a) => String(a.type_id) === typeFilter)) &&
      (!q || s.name.toLowerCase().includes(q))
  );

  async function call(fn: string, args: Record<string, unknown>, okMsg: string) {
    onError(null);
    const { error } = await supabase.rpc(fn, args);
    data.reload();
    if (error) {
      // BOX_UNKNOWN is worded for Freshies; here it means the row is gone.
      onError(
        error.message.includes("BOX_UNKNOWN")
          ? "That assignment no longer exists (it may have been changed in another tab). The list is refreshed."
          : friendlyError(error)
      );
      return false;
    }
    onNotice(okMsg);
    return true;
  }

  async function saveQty(s: Seller, a: BlindBoxAssignment) {
    const raw = (edits[a.id] ?? "").trim();
    // An empty field is not 0: 0 takes the boxes back.
    if (raw === "") return;
    const next = Math.floor(Number(raw));
    if (!Number.isFinite(next) || next < 0) return;
    const type = data.types.find((t) => t.id === a.type_id)?.name ?? "box";
    if (next === 0 && !window.confirm(`Take back all of ${s.name}'s ${type} boxes? They return to stock.`)) return;
    if (await call("fn_bb_set_quantity", { p_assignment_id: a.id, p_quantity: next }, next === 0 ? "Taken back." : "Updated.")) {
      setEdits(({ [a.id]: _, ...rest }) => rest);
    }
  }

  async function regenerate(s: Seller) {
    if (
      !window.confirm(
        `Give ${s.name} a new QR? It is their one QR for every box type: any copy already shown or printed stops working. Boxes already bought are not affected.`
      )
    ) {
      return;
    }
    await call("fn_bb_regenerate", { p_id: s.rows[0].id }, "New QR made. The old one no longer works.");
  }

  async function copy(id: number, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      // Clipboard can be blocked; the QR preview shows the link to select.
    }
  }

  if (data.sellers.length === 0) {
    return (
      <Card className="max-w-xl space-y-3 text-sm">
        <p className="font-semibold">Nobody holds boxes yet</p>
        <p className="text-ink-faint">Hand boxes to people in step 2. Each person then gets one QR for all their boxes.</p>
        <button type="button" onClick={() => goTo("assign")} className="btn-primary px-4">
          Go to step 2
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          className="input w-auto min-w-[14rem]"
          placeholder="Search seller…"
          aria-label="Search seller"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input w-auto"
          aria-label="Filter by box type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All box types</option>
          {data.types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.archived ? " (archived)" : ""}
            </option>
          ))}
        </select>
      </div>

      <Card className="divide-y divide-paper-200 p-0">
        {rows.map((s) => {
          const url = urlOf(s);
          return (
            <div key={s.id} className="grid gap-4 p-4 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
              <button
                type="button"
                onClick={() => setBig(s)}
                disabled={!qrs[s.id]}
                aria-label={`Show ${s.name}'s QR`}
                className="grid h-[5.5rem] w-[5.5rem] place-items-center rounded-xl border border-paper-200 bg-white p-1.5 transition hover:border-ink-faint active:scale-[0.98]"
              >
                {qrs[s.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local data URL
                  <img src={qrs[s.id]} alt="" className="h-full w-full" />
                ) : data.linksStatus === "error" ? (
                  <span className="text-[11px] text-red-500">no link</span>
                ) : (
                  <span className="h-full w-full animate-pulse rounded-lg bg-paper-200" />
                )}
              </button>

              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-xs text-ink-faint">{s.kind}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={!url}
                      onClick={() => url && copy(s.id, url)}
                      className="btn-secondary min-h-[36px] gap-1 px-3 text-xs"
                    >
                      {copied === s.id ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.75} />}
                      {copied === s.id ? "Copied" : "Copy link"}
                    </button>
                    <button type="button" onClick={() => regenerate(s)} className="btn-secondary min-h-[36px] gap-1 px-3 text-xs">
                      <RefreshCw size={14} strokeWidth={1.75} />
                      Regenerate
                    </button>
                  </div>
                </div>

                <ul className="space-y-1.5">
                  {s.rows.map((a) => {
                    const type = data.types.find((t) => t.id === a.type_id);
                    const dead = !a.active || type?.archived;
                    const changed = edits[a.id] !== undefined && edits[a.id].trim() !== "" && Number(edits[a.id]) !== a.quantity;
                    return (
                      <li
                        key={a.id}
                        className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-paper-100 px-3 py-1.5 text-sm", dead && "opacity-60")}
                      >
                        <span className="inline-flex min-w-[7rem] items-center gap-1 font-medium">
                          {type?.name ?? "?"}
                          {type?.is_special && <Sparkles size={14} strokeWidth={1.75} className="text-amber-500" aria-label="special" />}
                          {type?.archived && <span className="text-xs font-normal text-red-600">archived</span>}
                        </span>
                        <span className="flex items-center gap-1 text-ink-faint">
                          sold <b className="font-mono text-ink">{a.opened}</b> /
                          <input
                            type="number"
                            min={a.opened}
                            aria-label={`${type?.name ?? "Box"} total for ${s.name}`}
                            className="input min-h-[32px] w-16 px-2 py-0.5 font-mono text-sm"
                            value={edits[a.id] ?? String(a.quantity)}
                            onChange={(e) => setEdits({ ...edits, [a.id]: e.target.value })}
                            onKeyDown={(e) => e.key === "Enter" && saveQty(s, a)}
                          />
                          {changed && (
                            <button type="button" onClick={() => saveQty(s, a)} className="btn-primary min-h-[32px] px-2 text-xs">
                              Set
                            </button>
                          )}
                        </span>
                        {a.quantity - a.opened <= 0 && <span className="chip bg-gray-200 text-gray-700">sold out</span>}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={a.active}
                          onClick={() =>
                            call("fn_bb_assignment_set_active", { p_id: a.id, p_active: !a.active }, a.active ? "Switched off." : "Switched on.")
                          }
                          className={cn(
                            "ml-auto min-h-[32px] min-w-[56px] rounded-full px-3 text-xs font-bold",
                            a.active ? "bg-green-600 text-white" : "border border-paper-300 bg-white text-ink-faint"
                          )}
                        >
                          {a.active ? "On" : "Off"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink-faint">Nobody matches.</p>}
      </Card>

      {big && qrs[big.id] && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-6" onClick={() => setBig(null)}>
          <div className="card w-full max-w-sm bg-white p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold">{big.name}</p>
            <p className="mb-3 text-sm text-ink-faint">
              {big.rows.map((a) => data.types.find((t) => t.id === a.type_id)?.name ?? "Box").join(" · ")}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
            <img src={qrs[big.id]} alt={`${big.name}'s blind box QR`} className="w-full" />
            <input
              readOnly
              value={urlOf(big) ?? ""}
              aria-label="Blind box link"
              onFocus={(e) => e.currentTarget.select()}
              className="input mt-3 text-xs"
            />
            <p className="mt-2 text-xs text-ink-faint">Looking at a QR changes nothing. Tap outside to close.</p>
            <button type="button" onClick={() => setBig(null)} className="btn-secondary mt-3 w-full">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
