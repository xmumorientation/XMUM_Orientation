"use client";

import { Download, Printer } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui";
import { groupQrPng } from "@/lib/group-qr";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, friendlyError } from "@/lib/utils";

import type { TabProps } from "./TypesTab";

const SPOT_COLOR = "#FE06AB"; // the Welcome page's pink

type SpotCode = { n: number; claimed: boolean; group_name: string | null; claimed_at: string | null; url: string };

const cardLabel = (n: number) => `BLIND BOX ${String(n).padStart(2, "0")}`;

// The Spot box: ONE CODE PER BOX (migration 0116). Each box in the pool has
// its own QR, made once and never changed. Print the sheet once and hide the
// codes; a box can be claimed once, by any group, and a group can claim as many
// as it finds (free, outside the group limit). Range, pool size and on/off
// change here without touching any code (fn_bb_spot_save); a bigger pool adds
// codes, a smaller one removes unclaimed ones, highest number first.
export function SpotTab({ data, onError, onNotice }: TabProps) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const spot = data.spot;
  const a = spot?.assignment;

  const [form, setForm] = useState<{ min: string; max: string; pool: string; active: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<SpotCode[] | null>(null);
  const [printing, setPrinting] = useState(false);

  const f = form ?? {
    min: String(spot?.type.min_tokens ?? 1),
    max: String(spot?.type.max_tokens ?? 3),
    pool: String(a?.quantity ?? 24),
    active: a?.active ?? true,
  };
  const set = (k: keyof typeof f, v: string | boolean) => setForm({ ...f, [k]: v });

  const loadCodes = useCallback(async () => {
    if (!spot) return setCodes([]);
    try {
      const res = await fetch("/api/blindbox/spot-links", { cache: "no-store" });
      const json = (await res.json()) as { codes?: SpotCode[]; error?: string };
      if (!res.ok || !json.codes) return onError(`Couldn't load the codes: ${json.error ?? `HTTP ${res.status}`}`);
      setCodes(json.codes);
    } catch (e) {
      onError(`Couldn't load the codes: ${String(e)}`);
    }
  }, [spot, onError]);

  useEffect(() => {
    void loadCodes();
  }, [loadCodes, a?.quantity, a?.opened]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    const { error } = await supabase.rpc("fn_bb_spot_save", {
      p_min: Number(f.min),
      p_max: Number(f.max),
      p_pool: Number(f.pool),
      p_active: f.active,
    });
    setBusy(false);
    if (error) return onError(friendlyError(error));
    onNotice(spot ? "Spot saved. The codes are the same." : "Spot set up. Print its codes.");
    setForm(null);
    data.reload();
    void loadCodes();
  }

  async function downloadOne(c: SpotCode) {
    const png = await groupQrPng(cardLabel(c.n), c.url, SPOT_COLOR);
    const link = document.createElement("a");
    link.href = png;
    link.download = `hidden-blind-box-${String(c.n).padStart(2, "0")}.png`;
    link.click();
  }

  // One page with every code, to print (or save as PDF) once.
  async function printAll() {
    if (!codes?.length) return;
    // Open the window now, inside the click, so a pop-up blocker allows it.
    const win = window.open("", "_blank");
    if (!win) return onError("Allow pop-ups for this site to print all the codes.");
    setPrinting(true);
    try {
      const pngs = await Promise.all(codes.map((c) => groupQrPng(cardLabel(c.n), c.url, SPOT_COLOR)));
      win.document.write(`<!doctype html><title>hidden-blind-box-codes</title>
<style>
  @page { size: A4; margin: 10mm }
  body { margin: 0; font-family: sans-serif }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm }
  .grid img { width: 100%; break-inside: avoid }
</style>
<div class="grid">${pngs.map((p, i) => `<img src="${p}" alt="Blind box ${codes[i].n}">`).join("")}</div>
<script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };<\/script>`);
      win.document.close();
    } catch (e) {
      win.close();
      onError(`Couldn't make the print page: ${String(e)}`);
    } finally {
      setPrinting(false);
    }
  }

  const claimed = a?.opened ?? 0;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold">Codes to Print</h2>
          <p className="text-sm text-ink-faint">
            One code for each box in the pool. Print them once and hide them: each code can be claimed once.
          </p>
        </div>
        <button
          type="button"
          disabled={!codes?.length || printing}
          onClick={printAll}
          className="btn-primary w-full gap-1.5 active:scale-[0.98]"
        >
          <Printer size={16} strokeWidth={1.75} aria-hidden />
          {printing ? "Making the Sheet…" : `Print All ${codes?.length ?? ""} Codes`.replace("  ", " ")}
        </button>
        <p className="text-xs text-ink-faint">
          The codes never change. If you lose one, print just that one again from the list.
        </p>

        {codes === null ? (
          <p className="text-sm text-ink-faint">{spot ? "Loading the codes…" : "The codes appear once the Spot is set up."}</p>
        ) : (
          <ul className="max-h-80 divide-y divide-paper-200 overflow-auto rounded-xl border border-paper-200 text-sm">
            {codes.map((c) => (
              <li key={c.n} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="font-mono font-bold tabular-nums">#{String(c.n).padStart(2, "0")}</span>
                <span className={cn("min-w-0 flex-1 truncate text-xs", c.claimed ? "font-semibold" : "text-ink-faint")}>
                  {c.claimed ? `Claimed by ${c.group_name ?? "a group"}` : "Not found yet"}
                </span>
                <button
                  type="button"
                  onClick={() => downloadOne(c)}
                  className="rounded-lg p-1.5 text-ink-faint hover:bg-paper-100"
                  aria-label={`Download code ${c.n}`}
                >
                  <Download size={16} strokeWidth={1.75} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <form onSubmit={save} className="space-y-4">
          <div>
            <h2 className="font-semibold">{spot ? "Spot Box" : "Set Up the Spot Box"}</h2>
            <p className="text-sm text-ink-faint">
              A group that finds a code scans it and claims that free box. A group can claim as many as it finds, and they
              don&apos;t count toward its limit of {data.cap}.
            </p>
          </div>

          {spot && (
            <dl className="grid grid-cols-3 gap-2 border-y border-paper-200 py-3 text-center">
              {(
                [
                  ["claimed", claimed],
                  ["left", Math.max(0, (a?.quantity ?? 0) - claimed)],
                  ["in the pool", a?.quantity ?? 0],
                ] as [string, number][]
              ).map(([label, value]) => (
                <div key={label}>
                  <dd className="font-mono text-2xl font-bold tabular-nums">{value}</dd>
                  <dt className="text-xs text-ink-faint">{label}</dt>
                </div>
              ))}
            </dl>
          )}

          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["min", "Min Tokens", 0],
                ["max", "Max Tokens", 0],
                ["pool", "Boxes in the Pool", claimed],
              ] as const
            ).map(([k, label, min]) => (
              <div key={k} className="space-y-1">
                <label className="label text-xs" htmlFor={`bb-spot-${k}`}>
                  {label}
                </label>
                <input
                  id={`bb-spot-${k}`}
                  type="number"
                  min={min}
                  required
                  className="input font-mono"
                  value={f[k]}
                  onChange={(e) => set(k, e.target.value)}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-ink-faint">
            A box opens for a random number of tokens from min to max. New numbers apply to boxes claimed from now on.
            The pool is the number of codes: a bigger pool adds codes, a smaller one removes unclaimed ones (it can&apos;t
            go below what&apos;s already claimed: {claimed}).
          </p>

          <label className="flex items-center justify-between gap-3 rounded-xl bg-paper-100 px-3 py-2.5 text-sm">
            <span>
              <b>Spot Is On</b>
              <span className="block text-xs text-ink-faint">Off: scanning a code says it isn&apos;t active.</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={f.active}
              onClick={() => set("active", !f.active)}
              className={cn(
                "min-h-[32px] min-w-[56px] rounded-full px-3 text-xs font-bold",
                f.active ? "bg-green-600 text-white" : "border border-paper-300 bg-white text-ink-faint"
              )}
            >
              {f.active ? "On" : "Off"}
            </button>
          </label>

          <div className="flex gap-2">
            <button disabled={busy} type="submit" className="btn-primary px-6 active:scale-[0.98]">
              {busy ? "Saving…" : spot ? "Save" : "Set Up the Spot"}
            </button>
            {form && (
              <button type="button" onClick={() => setForm(null)} className="btn-secondary">
                Cancel
              </button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
