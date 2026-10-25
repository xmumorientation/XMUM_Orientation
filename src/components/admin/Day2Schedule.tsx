"use client";

import { useMemo, useState } from "react";

import { ChallengeBanner } from "@/components/ChallengeBanner";
import { Card } from "@/components/ui";
import { useConfig } from "@/components/useConfig";
import { useDay2State } from "@/components/useDay2State";
import { SEGMENTS, SWITCHES, type Day2Segment } from "@/lib/day2";
import { gameLengthKey } from "@/lib/gameLength";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, friendlyError } from "@/lib/utils";

const SEGMENT_TONE: Record<Day2Segment, string> = {
  normal1: "bg-paper-200",
  challenge: "bg-red-500",
  normal2: "bg-paper-200",
  funfair: "bg-amber-400",
};

type Bound = "challenge_start_min" | "challenge_end_min" | "funfair_start_min";
const BOUNDS: { key: Bound; label: string }[] = [
  { key: "challenge_start_min", label: "Challenge mode starts" },
  { key: "challenge_end_min", label: "Challenge mode ends" },
  { key: "funfair_start_min", label: "Funfair starts" },
];

// Live control, Day 2: the game's inner schedule (fn_day2_control, 0102,
// Admin only). The bar shows the segments over the game's length; the three
// sliders move their boundaries (minutes from the game's real start), also
// while it runs. Start <segment> holds that segment, even with no game on
// (for tests), until Back to auto. End <segment> during auto moves its end to
// now. The switches start at the segment's defaults; a flip lasts until the
// next segment. Kill-switches still win over all of it.
export function Day2Schedule({
  onError,
  onNotice,
}: {
  onError: (m: string | null) => void;
  onNotice: (m: string) => void;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { config } = useConfig();
  const day2 = useDay2State();
  const { state, segment, manual, switches, flipped, starts, reload } = day2;
  const [draft, setDraft] = useState<Partial<Record<Bound, number>>>({});
  const [busy, setBusy] = useState(false);

  const length = (() => {
    if (state?.game_on && state.game_started_at && state.game_ends_at) {
      return Math.max(1, Math.round((Date.parse(state.game_ends_at) - Date.parse(state.game_started_at)) / 60_000));
    }
    const n = Number(config[gameLengthKey("day2")]);
    return Number.isInteger(n) && n > 0 ? n : 150;
  })();
  const val = (k: Bound) => draft[k] ?? state?.[k] ?? 0;
  const elapsed = starts ? Math.max(0, Math.floor((Date.now() - starts.normal1) / 60_000)) : null;

  async function call(args: Record<string, unknown>, notice: string) {
    setBusy(true);
    onError(null);
    const { error } = await supabase.rpc("fn_day2_control", args);
    setBusy(false);
    if (error) return onError(friendlyError(error));
    onNotice(notice);
    reload();
  }

  async function saveTimes(next: Partial<Record<Bound, number>>) {
    const t = { challenge_start_min: val("challenge_start_min"), challenge_end_min: val("challenge_end_min"), funfair_start_min: val("funfair_start_min"), ...next };
    if (!(t.challenge_start_min <= t.challenge_end_min && t.challenge_end_min <= t.funfair_start_min)) {
      return onError("Keep the order: challenge starts, challenge ends, then the funfair.");
    }
    await call(
      {
        p_action: "set_times",
        p_challenge_start_min: t.challenge_start_min,
        p_challenge_end_min: t.challenge_end_min,
        p_funfair_start_min: t.funfair_start_min,
      },
      `Day 2: challenge ${t.challenge_start_min}–${t.challenge_end_min} min, funfair from ${t.funfair_start_min} min`
    );
    setDraft({});
  }

  // End during auto: move this segment's end boundary to now.
  const END_BOUND: Partial<Record<Day2Segment, Bound>> = {
    normal1: "challenge_start_min",
    challenge: "challenge_end_min",
    normal2: "funfair_start_min",
  };

  const label = (k: Day2Segment) => SEGMENTS.find((s) => s.key === k)!.label;

  return (
    <section>
      <h2 className="mb-2 font-semibold">Day 2 inner schedule</h2>
      <Card className="space-y-4 p-4">
        <ChallengeBanner />
        <p className="text-sm">
          Now:{" "}
          <b>{segment === "off" ? "No Day 2 game" : `${label(segment)}${manual ? " (started by hand)" : ""}`}</b>
          {elapsed !== null && <span className="text-ink-faint"> · {elapsed} min into the game</span>}
        </p>

        {/* the segments over the game's length */}
        <div className="flex h-6 overflow-hidden rounded-lg text-[10px] font-bold" aria-hidden>
          {(
            [
              ["normal1", 0, val("challenge_start_min")],
              ["challenge", val("challenge_start_min"), val("challenge_end_min")],
              ["normal2", val("challenge_end_min"), val("funfair_start_min")],
              ["funfair", val("funfair_start_min"), length],
            ] as [Day2Segment, number, number][]
          ).map(([k, a, b]) => (
            <div
              key={k}
              className={cn("flex items-center justify-center truncate", SEGMENT_TONE[k], segment === k && "ring-2 ring-inset ring-ink")}
              style={{ width: `${(Math.max(0, b - a) / length) * 100}%` }}
            >
              {b - a >= 10 ? label(k) : ""}
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {BOUNDS.map((b) => (
            <label key={b.key} className="text-xs">
              <span className="flex justify-between font-semibold">
                {b.label} <span className="tabular-nums">{val(b.key)} min</span>
              </span>
              <input
                type="range"
                min={0}
                max={length}
                step={5}
                value={val(b.key)}
                disabled={busy || !state}
                onChange={(e) => setDraft((d) => ({ ...d, [b.key]: Number(e.target.value) }))}
                onPointerUp={() => Object.keys(draft).length > 0 && saveTimes({})}
                onKeyUp={() => Object.keys(draft).length > 0 && saveTimes({})}
                className="w-full"
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-ink-faint">
          Minutes from the game&apos;s start. +5 on the Day 2 game makes the Funfair longer.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {SEGMENTS.map((s) => {
            const on = segment === s.key;
            const endBound = END_BOUND[s.key];
            if (on && manual) return null;
            if (on && !manual && endBound && elapsed !== null) {
              return (
                <button
                  key={s.key}
                  disabled={busy}
                  className="btn-danger min-h-[36px] px-3 text-xs"
                  onClick={() => window.confirm(`End ${s.label.toLowerCase()} now?`) && saveTimes({ [endBound]: elapsed })}
                >
                  ■ End {s.label.toLowerCase()}
                </button>
              );
            }
            if (on) return null;
            return (
              <button
                key={s.key}
                disabled={busy || !state}
                className="btn-secondary min-h-[36px] px-3 text-xs"
                onClick={() =>
                  window.confirm(`Start ${s.label.toLowerCase()} now? It holds until Back to auto.`) &&
                  call({ p_action: "start_segment", p_segment: s.key }, `Day 2: ${s.label} started by hand`)
                }
              >
                ▶ Start {s.label.toLowerCase()}
              </button>
            );
          })}
          {manual && (
            <button
              disabled={busy}
              className="btn-primary min-h-[36px] px-3 text-xs"
              onClick={() => call({ p_action: "auto" }, "Day 2: back to auto")}
            >
              ↺ Back to auto
            </button>
          )}
        </div>

        <div className="divide-y divide-paper-200 rounded-xl border border-paper-200">
          {SWITCHES.map((w) => (
            <SwitchRow
              key={w.key}
              label={w.label}
              on={switches[w.key]}
              flipped={w.key in flipped}
              busy={busy || !state}
              onFlip={(v) =>
                call({ p_action: "set_switch", p_switch: w.key, p_on: v }, `Day 2: ${w.label} ${v ? "on" : "off"} until the next segment`)
              }
            />
          ))}
        </div>
        <p className="text-xs text-ink-faint">
          A flip lasts until the next segment. Kill-switches (blind box, NFC, token freeze) still stop everything.
        </p>
      </Card>
    </section>
  );
}

function SwitchRow({
  label,
  on,
  flipped,
  busy,
  onFlip,
}: {
  label: string;
  on: boolean;
  flipped: boolean;
  busy: boolean;
  onFlip: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-ink-faint">{flipped ? "Set by hand for this segment" : "Segment default"}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={busy}
        onClick={() => onFlip(!on)}
        className="min-h-[36px] rounded-lg px-3 text-xs font-bold disabled:opacity-60"
        style={{ backgroundColor: on ? "#16a34a" : "#9ca3af", color: "#fff" }}
      >
        {on ? "ON" : "OFF"}
      </button>
    </div>
  );
}

