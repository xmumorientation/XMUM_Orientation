"use client";

import { CheckCircle2, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, friendlyError } from "@/lib/utils";

// How long a GM may undo their last transaction on the Station page:
// game_config "undo_window_minutes", read by fn_undo_window_minutes() (0093),
// 1 to 120 minutes, default 10. Shown in the Token page's Token Rules card;
// only Admin can change it (fn_set_config).

const MIN = 1;
const MAX = 120;
const DEFAULT = 10;

/** Same rule as fn_undo_window_minutes(). */
export function undoWindowMinutes(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= MIN ? Math.min(n, MAX) : DEFAULT;
}

export function UndoWindowSetting({
  config,
  canEdit,
  onError,
  onSaved,
}: {
  config: Record<string, unknown>;
  canEdit: boolean;
  onError: (message: string) => void;
  onSaved: (message: string) => void;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const saved = undoWindowMinutes(config["undo_window_minutes"]);
  const [draft, setDraft] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const value = draft === "" ? saved : Math.trunc(Number(draft));
  const valid = Number.isInteger(value) && value >= MIN && value <= MAX;
  const dirty = draft !== "" && value !== saved;

  async function save() {
    if (!valid) return onError(`The undo window must be ${MIN} to ${MAX} minutes.`);
    setBusy(true);
    const { error } = await supabase.rpc("fn_set_config", { p_key: "undo_window_minutes", p_value: value });
    setBusy(false);
    if (error) return onError(friendlyError(error));
    setDraft("");
    onSaved(`GMs can now undo for ${value} minute${value !== 1 ? "s" : ""}.`);
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300">
          <Undo2 size={14} className="text-cyan-400" />
          GM undo window
        </span>
        <p className="mt-1 text-[11px] text-slate-400">
          How long a GM can undo their last Day 1 reward on the Station page ({MIN}–{MAX} min). Day 2 results
          cannot be undone there; correct them here.
        </p>
      </div>
      <div className="flex items-center gap-2">
        {canEdit ? (
          <>
            <label
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-3 py-1.5",
                dirty ? "border-amber-400 bg-amber-950/30" : "border-slate-700 bg-slate-950"
              )}
            >
              <input
                type="number"
                min={MIN}
                max={MAX}
                value={draft === "" ? saved : draft}
                aria-label="GM undo window in minutes"
                onChange={(e) => setDraft(e.target.value)}
                className="w-16 min-w-0 bg-transparent text-base font-black text-white tabular-nums focus:outline-none"
              />
              <span className="text-xs font-bold text-slate-400">min</span>
            </label>
            <button
              type="button"
              onClick={save}
              disabled={busy || !dirty || !valid}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black transition-all",
                dirty && valid
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 hover:brightness-110"
                  : "cursor-not-allowed bg-slate-800 text-slate-500"
              )}
            >
              <CheckCircle2 size={15} />
              {dirty ? "Save" : "Saved"}
            </button>
          </>
        ) : (
          <span className="text-lg font-black text-white tabular-nums">{saved} min</span>
        )}
      </div>
    </div>
  );
}
