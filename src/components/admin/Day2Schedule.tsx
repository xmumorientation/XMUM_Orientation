"use client";

import { useMemo, useRef, useState } from "react";

import { ChallengeBanner } from "@/components/ChallengeBanner";
import { useConfig } from "@/components/useConfig";
import { useDay2State } from "@/components/useDay2State";
import { SEGMENTS, SEGMENT_DEFAULTS, SWITCHES, type Day2Segment, type Day2Switch } from "@/lib/day2";
import { gameLengthKey } from "@/lib/gameLength";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";

import "./day2-schedule.css";

type Bound = "challenge_start_min" | "challenge_end_min" | "funfair_start_min";

// Each segment runs from its start bound to its end bound. The first starts at
// the game's start, the last ends at the game's end, so those two are fixed.
const META: Record<Day2Segment, { tone: string; start: Bound | null; end: Bound | null }> = {
  normal1: { tone: "#8ba3c4", start: null, end: "challenge_start_min" },
  challenge: { tone: "#f25555", start: "challenge_start_min", end: "challenge_end_min" },
  normal2: { tone: "#8ba3c4", start: "challenge_end_min", end: "funfair_start_min" },
  funfair: { tone: "#fbbf24", start: "funfair_start_min", end: null },
};
const BOUND_ORDER: Bound[] = ["challenge_start_min", "challenge_end_min", "funfair_start_min"];
const STEP = 5;

// Who feels each switch: the server refuses the action (fn_day2_guard, 0102).
const EFFECT: Record<Day2Switch, [on: string, off: string]> = {
  station: ["GM can run and submit Day 2 games", "GM can't submit a Day 2 game"],
  blindbox: ["Freshies can buy blind boxes", "Blind box buying is closed"],
  funfair: ["NFC and map lighting are live", "NFC and map lighting are blocked"],
};

// Live control, Day 2: the game's inner schedule (fn_day2_control, 0102,
// Admin only). The timeline shows the segments over the game's length; drag a
// handle, or use a card's stepper, to move a boundary (minutes from the game's
// real start), also while it runs. Start <segment> holds that segment, even
// with no game on (for tests), until Back to auto. End <segment> during auto
// moves its end to now. Switches are live on the running segment only (a flip
// lasts until the next segment); the other cards preview the segment's default.
// Kill-switches still win over all of it.
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
  const [dragging, setDragging] = useState<Bound | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const latest = useRef<number | null>(null);

  const length = (() => {
    if (state?.game_on && state.game_started_at && state.game_ends_at) {
      return Math.max(1, Math.round((Date.parse(state.game_ends_at) - Date.parse(state.game_started_at)) / 60_000));
    }
    const n = Number(config[gameLengthKey("day2")]);
    return Number.isInteger(n) && n > 0 ? n : 150;
  })();
  const val = (k: Bound) => draft[k] ?? state?.[k] ?? 0;
  const elapsed = starts ? Math.max(0, Math.floor((Date.now() - starts.normal1) / 60_000)) : null;
  const disabled = busy || !state;

  // A boundary can't pass its neighbours.
  const limits = (k: Bound): [number, number] => {
    const i = BOUND_ORDER.indexOf(k);
    return [i === 0 ? 0 : val(BOUND_ORDER[i - 1]), i === 2 ? length : val(BOUND_ORDER[i + 1])];
  };
  const clamp = (k: Bound, n: number) => {
    const [lo, hi] = limits(k);
    return Math.min(hi, Math.max(lo, n));
  };

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
      setDraft({});
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
  const label = (k: Day2Segment) => SEGMENTS.find((s) => s.key === k)!.label;
  const range = (k: Day2Segment): [number, number] => [META[k].start ? val(META[k].start!) : 0, META[k].end ? val(META[k].end!) : length];

  // Handle drag: pointer position -> minutes, snapped to 5.
  function minutesAt(clientX: number, k: Bound) {
    const r = railRef.current!.getBoundingClientRect();
    const raw = Math.round(((clientX - r.left) / r.width) * length / STEP) * STEP;
    return clamp(k, raw);
  }
  function onHandleMove(e: React.PointerEvent, k: Bound) {
    if (dragging !== k) return;
    const m = minutesAt(e.clientX, k);
    latest.current = m;
    setDraft((d) => ({ ...d, [k]: m }));
  }
  function endDrag(k: Bound) {
    if (dragging !== k) return;
    setDragging(null);
    const m = latest.current;
    latest.current = null;
    if (m !== null && m !== state?.[k]) saveTimes({ [k]: m });
    else setDraft({});
  }
  function onHandleKey(e: React.KeyboardEvent, k: Bound) {
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? STEP : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -STEP : 0;
    if (!d) return;
    e.preventDefault();
    const m = clamp(k, val(k) + d);
    latest.current = m;
    setDraft((x) => ({ ...x, [k]: m }));
  }
  function onHandleKeyUp(e: React.KeyboardEvent, k: Bound) {
    if (!e.key.startsWith("Arrow") || latest.current === null) return;
    const m = latest.current;
    latest.current = null;
    if (m !== state?.[k]) saveTimes({ [k]: m });
  }

  return (
    <section className="d2s">
      <h2 className="mb-2 font-semibold">Day 2 inner schedule</h2>
      <div className="d2s-shell">
        <div className="d2s-core">
          <ChallengeBanner />

          <div className="d2s-head">
            <span className="d2s-eyebrow">
              <span className="d2s-dot" data-live={segment !== "off"} />
              Inner schedule
            </span>
            <p className="d2s-now">
              Now: <b>{segment === "off" ? "No Day 2 game" : label(segment)}</b>
              {manual && " · held by hand"}
              {elapsed !== null && ` · ${elapsed} of ${length} min`}
            </p>
          </div>

          <div className="d2s-timeline">
            <div className="d2s-railwrap">
              <div className="d2s-rail" ref={railRef}>
                {SEGMENTS.map((s) => {
                  const [a, b] = range(s.key);
                  const pct = (Math.max(0, b - a) / length) * 100;
                  return (
                    <div
                      key={s.key}
                      className="d2s-seg"
                      data-on={segment === s.key}
                      style={{ width: `${pct}%`, ["--tone" as string]: META[s.key].tone }}
                    >
                      {pct >= 12 ? s.label : ""}
                    </div>
                  );
                })}
                {elapsed !== null && elapsed <= length && !manual && (
                  <span className="d2s-now-mark" style={{ left: `${(elapsed / length) * 100}%` }} />
                )}
              </div>
              {BOUND_ORDER.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="slider"
                  aria-label={k === "challenge_start_min" ? "Challenge mode starts" : k === "challenge_end_min" ? "Challenge mode ends" : "Funfair starts"}
                  aria-valuemin={limits(k)[0]}
                  aria-valuemax={limits(k)[1]}
                  aria-valuenow={val(k)}
                  aria-valuetext={`${val(k)} min`}
                  className="d2s-handle"
                  data-drag={dragging === k}
                  disabled={disabled}
                  style={{ left: `${(val(k) / length) * 100}%` }}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDragging(k);
                  }}
                  onPointerMove={(e) => onHandleMove(e, k)}
                  onPointerUp={() => endDrag(k)}
                  onPointerCancel={() => endDrag(k)}
                  onKeyDown={(e) => onHandleKey(e, k)}
                  onKeyUp={(e) => onHandleKeyUp(e, k)}
                >
                  <span className="d2s-tip">{val(k)} min</span>
                </button>
              ))}
            </div>
            <div className="d2s-scale" aria-hidden>
              <span>0</span>
              <span>{Math.round(length / 2)}</span>
              <span>{length} min</span>
            </div>
          </div>
          <p className="d2s-hint">Drag a handle or use a card to move a time. Minutes from the game&apos;s start. +5 on the Day 2 game makes the Funfair longer.</p>

          <button
            type="button"
            className="d2s-more"
            aria-expanded={open}
            aria-controls="d2s-cards"
            onClick={() => setOpen((o) => !o)}
          >
            <span>Segment times and switches</span>
            <i><ChevronIcon /></i>
          </button>

          <div className="d2s-collapse" data-open={open} id="d2s-cards">
          <div className="d2s-grid" inert={!open}>
            {SEGMENTS.map((s, i) => {
              const k = s.key;
              const m = META[k];
              const on = segment === k;
              const [a, b] = range(k);
              const done = elapsed !== null && !manual && !on && elapsed >= b;
              const endBound = m.end;
              const defaults = SEGMENT_DEFAULTS[k];
              return (
                <article
                  key={k + i}
                  className="d2s-card"
                  data-on={on}
                  data-done={done}
                  style={{ ["--tone" as string]: m.tone }}
                >
                  <div className="d2s-card-top">
                    <div>
                      <span className="d2s-num">{String(i + 1).padStart(2, "0")}</span>
                      <h3 className="d2s-name">{s.label}</h3>
                    </div>
                    {on ? (
                      <span className="d2s-chip" data-kind={manual ? "hand" : "live"}>{manual ? "Held" : "Live"}</span>
                    ) : done ? (
                      <span className="d2s-chip">Done</span>
                    ) : null}
                  </div>

                  <div className="d2s-time">
                    <p className="d2s-time-l">
                      <b>Starts at</b>
                      {a}–{b} min · {Math.max(0, b - a)} long
                    </p>
                    {m.start ? (
                      <Stepper value={val(m.start)} disabled={disabled} limits={limits(m.start)} onCommit={(n) => saveTimes({ [m.start!]: n })} />
                    ) : (
                      <span className="d2s-fixed">0 min</span>
                    )}
                  </div>

                  <div className="d2s-switches">
                    {SWITCHES.map((w) => {
                      const live = on && !!state;
                      const value = live ? switches[w.key] : defaults[w.key];
                      const byHand = live && w.key in flipped;
                      return (
                        <div key={w.key} className="d2s-sw">
                          <div className="min-w-0">
                            <p className="d2s-sw-name">
                              {w.label}
                              {byHand && <span className="d2s-sw-flag">By hand</span>}
                            </p>
                            <p className="d2s-sw-note">{EFFECT[w.key][value ? 0 : 1]}</p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={value}
                            aria-label={`${w.label}, ${s.label}`}
                            title={live ? undefined : "Start this segment to change it"}
                            className="d2s-toggle"
                            data-preview={!live}
                            disabled={busy || !live}
                            onClick={() =>
                              call(
                                { p_action: "set_switch", p_switch: w.key, p_on: !value },
                                `Day 2: ${w.label} ${value ? "off" : "on"} until the next segment`
                              )
                            }
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div className="d2s-actions">
                    {on && !manual && endBound && elapsed !== null && (
                      <button
                        className="d2s-btn"
                        data-kind="stop"
                        disabled={busy}
                        onClick={() => window.confirm(`End ${s.label.toLowerCase()} now?`) && saveTimes({ [endBound]: elapsed })}
                      >
                        <i><StopIcon /></i>End now
                      </button>
                    )}
                    {on && manual && (
                      <button className="d2s-btn" data-kind="go" disabled={busy} onClick={() => call({ p_action: "auto" }, "Day 2: back to auto")}>
                        <i><BackIcon /></i>Back to auto
                      </button>
                    )}
                    {!on && (
                      <button
                        className="d2s-btn"
                        disabled={disabled}
                        onClick={() =>
                          window.confirm(`Start ${s.label.toLowerCase()} now? It holds until Back to auto.`) &&
                          call({ p_action: "start_segment", p_segment: k }, `Day 2: ${s.label} started by hand`)
                        }
                      >
                        <i><PlayIcon /></i>Start now
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          </div>

          <p className="d2s-foot">
            Switches are live on the running segment; a flip lasts until the next segment. Other cards show their default. Kill-switches (blind box, NFC, token freeze) still stop everything.
          </p>
        </div>
      </div>
    </section>
  );
}

// −/+ 5 min around a typed number; commits on Enter or blur.
function Stepper({
  value,
  limits,
  disabled,
  onCommit,
}: {
  value: number;
  limits: [number, number];
  disabled: boolean;
  onCommit: (n: number) => void;
}) {
  const [lo, hi] = limits;
  const commit = (n: number) => {
    const v = Math.min(hi, Math.max(lo, Math.round(n)));
    if (Number.isFinite(v) && v !== value) onCommit(v);
  };
  return (
    <div className="d2s-stepper">
      <button type="button" aria-label="5 minutes earlier" disabled={disabled || value <= lo} onClick={() => commit(value - STEP)}>
        −
      </button>
      <label>
        <input
          key={value}
          type="number"
          inputMode="numeric"
          aria-label="Start minute"
          defaultValue={value}
          disabled={disabled}
          onBlur={(e) => e.currentTarget.value !== "" && commit(Number(e.currentTarget.value))}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        min
      </label>
      <button type="button" aria-label="5 minutes later" disabled={disabled || value >= hi} onClick={() => commit(value + STEP)}>
        +
      </button>
    </div>
  );
}

const ChevronIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden><path d="M4 6l4 4 4-4" /></svg>
);
const PlayIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden><path d="M5 3.5v9l7-4.5z" /></svg>
);
const StopIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden><rect x="4" y="4" width="8" height="8" rx="1.5" /></svg>
);
const BackIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden><path d="M3.5 8a4.5 4.5 0 1 0 1.4-3.2M3.5 3v2.5H6" /></svg>
);
