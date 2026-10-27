"use client";

import { useState } from "react";

import { scheduleTimer } from "@/lib/scheduleTimer";
import { countdownParts, useEventCountdown } from "@/components/useEventCountdown";
import { useScheduleItems } from "@/components/useScheduleFeed";

const pad = (n: number | undefined) => (n === undefined ? "--" : String(n).padStart(2, "0"));

// Live control: exactly what the Welcome page countdown shows right now,
// with quick controls for the item it is counting.
export function NowOnWelcome({
  onError,
  onNotice,
}: {
  onError: (m: string | null) => void;
  onNotice: (m: string) => void;
}) {
  const { label, seconds, live, paused, itemId } = useEventCountdown();
  const t = countdownParts(seconds);
  const [busy, setBusy] = useState(false);
  // The running item's title, from the shared schedule feed the countdown already reads.
  const items = useScheduleItems();
  const title = itemId === null ? null : (items?.find((i) => i.id === itemId)?.title ?? null);

  async function act(action: "resume" | "extend" | "end", minutes = 0) {
    if (itemId === null || !title) return;
    if (action === "end" && !window.confirm(`Stop ${title} now? The countdown moves to the next item.`)) return;
    setBusy(true);
    onError(null);
    const err = await scheduleTimer({ id: itemId, title }, action, { minutes });
    setBusy(false);
    if (err) onError(err);
    else
      onNotice(
        `${title}: ${action === "extend" ? `${minutes > 0 ? "+" : ""}${minutes} min` : action === "end" ? "stopped" : `${action}d`}`
      );
  }

  return (
    <section
      aria-label="Now on the Welcome page"
      className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-brand-1/40 bg-brand-1/5 px-4 py-3"
    >
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-faint">Now on the Welcome page</p>
        <p className="font-mono text-sm font-bold tracking-[0.15em]">{label}</p>
      </div>
      <p className="font-mono text-3xl font-black tabular-nums" role="timer" aria-label={label.toLowerCase()}>
        {t && t.d > 0 ? `${t.d}d ` : ""}
        {pad(t?.h)}:{pad(t?.m)}:{pad(t?.s)}
      </p>
      {live && (
        <div className="ml-auto flex flex-wrap gap-1.5">
          {/* No Pause (removed 0102); Resume only frees an item paused before then. */}
          {paused && (
            <button disabled={busy} onClick={() => act("resume")} className="btn-secondary min-h-[36px] px-3 text-xs">
              ⏵ Resume
            </button>
          )}
          <button disabled={busy || (seconds ?? 0) < 60} onClick={() => act("extend", -5)} className="btn-secondary min-h-[36px] px-3 text-xs">
            −5 min
          </button>
          <button disabled={busy} onClick={() => act("extend", 5)} className="btn-secondary min-h-[36px] px-3 text-xs">
            +5 min
          </button>
          <button disabled={busy} onClick={() => act("end")} className="btn-danger min-h-[36px] px-3 text-xs">
            ■ Stop
          </button>
        </div>
      )}
    </section>
  );
}
