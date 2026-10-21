"use client";

import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui";
import { groupQrPng } from "@/lib/group-qr";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, friendlyError } from "@/lib/utils";

import type { TabProps } from "./TypesTab";

const SPOT_COLOR = "#FE06AB"; // the Welcome page's pink

// The Spot box: ONE QR that never changes. Print it as many times as you like
// and hide the copies; a group that finds one gets one free box (once per
// group, outside the group limit). Range, pool and on/off change here without
// touching the QR (fn_bb_spot_save).
export function SpotTab({ data, onError, onNotice }: TabProps) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const spot = data.spot;
  const a = spot?.assignment;
  const url = a ? data.links[a.id]?.url : undefined;

  const [form, setForm] = useState<{ min: string; max: string; pool: string; active: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [png, setPng] = useState<string | null>(null);

  const f = form ?? {
    min: String(spot?.type.min_tokens ?? 1),
    max: String(spot?.type.max_tokens ?? 3),
    pool: String(a?.quantity ?? 20),
    active: a?.active ?? true,
  };
  const set = (k: keyof typeof f, v: string | boolean) => setForm({ ...f, [k]: v });

  useEffect(() => {
    if (!url) return;
    let cancel = false;
    groupQrPng("VORTEXA BLIND BOX", url, SPOT_COLOR).then((file) => !cancel && setPng(file));
    return () => {
      cancel = true;
    };
  }, [url]);

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
    onNotice(spot ? "Spot saved. The QR is the same." : "Spot set up. Download its QR to print.");
    setForm(null);
    data.reload();
  }

  function download() {
    if (!png) return;
    const link = document.createElement("a");
    link.href = png;
    link.download = "blind-box-spot.png";
    link.click();
  }

  const claimed = a?.opened ?? 0;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <Card className="space-y-3 text-center">
        {png ? (
          // eslint-disable-next-line @next/next/no-img-element -- local data URL
          <img src={png} alt="Spot box QR card" className="mx-auto w-full max-w-[16rem] rounded-[1.4rem]" />
        ) : (
          <div className="mx-auto grid aspect-[4/5] w-full max-w-[16rem] place-items-center rounded-[1.4rem] bg-paper-200 px-6 text-sm text-ink-faint">
            {spot ? "Making the QR…" : "The QR appears once the Spot is set up."}
          </div>
        )}
        <button type="button" disabled={!png} onClick={download} className="btn-primary w-full gap-1.5 active:scale-[0.98]">
          <Download size={16} strokeWidth={1.75} aria-hidden />
          Download to print
        </button>
        <p className="text-xs text-ink-faint">
          This QR never changes. Print as many copies as you like and hide them around campus.
        </p>
      </Card>

      <Card>
        <form onSubmit={save} className="space-y-4">
          <div>
            <h2 className="font-semibold">{spot ? "Spot box" : "Set up the Spot box"}</h2>
            <p className="text-sm text-ink-faint">
              A group that finds a copy scans it and claims one free box. Each group gets at most one Spot box, and it
              doesn&apos;t count toward their limit of {data.cap}.
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
                ["min", "Min tokens", 0],
                ["max", "Max tokens", 0],
                ["pool", "Boxes in the pool", claimed],
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
            The pool can&apos;t go below what&apos;s already claimed ({claimed}).
          </p>

          <label className="flex items-center justify-between gap-3 rounded-xl bg-paper-100 px-3 py-2.5 text-sm">
            <span>
              <b>Spot is on</b>
              <span className="block text-xs text-ink-faint">Off: scanning a copy says the code isn&apos;t active.</span>
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
              {busy ? "Saving…" : spot ? "Save" : "Set up the Spot"}
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
