"use client";

import { useMemo, useRef, useState } from "react";

import { ChallengeBanner } from "@/components/ChallengeBanner";
import { useConfig } from "@/components/useConfig";
import { useDay2State } from "@/components/useDay2State";
import { MAX_SEGMENTS, SWITCHES, newSegmentId, segmentEnds, type Day2SegmentDef, type Day2Switch } from "@/lib/day2";
import { gameLengthKey } from "@/lib/gameLength";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";

import "./day2-schedule.css";

const STEP = 5;
const TONES = ["#8ba3c4", "#5eead4", "#a78bfa", "#f472b6", "#fb923c", "#60a5fa", "#a3e635", "#f87171"];
const FUNFAIR_TONE = "#fbbf24";

// Who feels each switch: the server refuses the action (fn_day2_guard, 0115).
const EFFECT: Record<Day2Switch, [on: string, off: string]> = {
  easy: ["Easy stations can run and submit games", "Easy stations are closed"],
  medium: ["Medium stations can run and submit games", "Medium stations are closed"],
  hard: ["Hard stations can run and submit games", "Hard stations are closed"],
  blindbox: ["Freshies can buy blind boxes", "Blind box buying is closed"],
  funfair: ["NFC and map lighting are live", "NFC and map lighting are blocked"],
};

const nameOf = (g: Day2SegmentDef, i: number) => g.label.trim() || `Segment ${i + 1}`;
const toneOf = (g: Day2SegmentDef, i: number) => (g.funfair ? FUNFAIR_TONE : TONES[i % TONES.length]);

// Live control, Day 2: the game's inner schedule (fn_day2_control, 0115,
// Admin only). A list of 1 to 8 segments over the game's length. Drag a
// handle, or use a card's stepper, to move a segment's start (minutes from the
// game's real start), also while it runs. Add Segment After splits a segment
// in two; Remove gives its time to the one before. Each card's switches are
// that segment's saved defaults (Easy, Medium and Hard stations, Blind Box,
// Funfair). On the running segment a flip asks: Change Default (saved) or
// Just Now (until the next segment). Start Now holds a segment, even with no
// game on (for tests), until Back to Auto. Kill-switches still win over all of it.
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
  const { state, segment, index, manual, switches, flipped, starts, reload } = day2;
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState<{ id: string; key: Day2Switch } | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const latest = useRef<number | null>(null);

  const length = (() => {
    if (state?.game_on && state.game_started_at && state.game_ends_at) {
      return Math.max(1, Math.round((Date.parse(state.game_ends_at) - Date.parse(state.game_started_at)) / 60_000));
    }
    const n = Number(config[gameLengthKey("day2")]);
    return Number.isInteger(n) && n > 0 ? n : 150;
  })();
  const saved = state?.segments ?? [];
  const segs = saved.map((g) => (g.id in draft ? { ...g, start_min: draft[g.id] } : g));
  // The timeline always shows the whole plan. If the running game is shorter than
  // the plan (a rehearsal), the rail stretches to the last segment's start plus
  // 10 min, so every segment keeps its own width instead of being squeezed off
  // the end; the game's real end is marked on it.
  const span = Math.max(length, (segs.length ? segs[segs.length - 1].start_min : 0) + 10);
  const ends = segmentEnds(segs, span);
  const elapsed = starts ? Math.max(0, Math.floor((Date.now() - starts[0]) / 60_000)) : null;
  const disabled = busy || !state;
  const atMax = segs.length >= MAX_SEGMENTS;

  // A start can't pass its neighbours (at least 1 min per segment).
  const limits = (i: number): [number, number] => [segs[i - 1].start_min + 1, i + 1 < segs.length ? segs[i + 1].start_min - 1 : Math.max(segs[i].start_min, length - 1)];
  const clamp = (i: number, n: number) => {
    const [lo, hi] = limits(i);
    return Math.min(hi, Math.max(lo, n));
  };

  async function save(next: Day2SegmentDef[], notice: string) {
    setBusy(true);
    onError(null);
    const { error } = await supabase.rpc("fn_day2_control", { p_action: "set_segments", p_segments: next });
    setBusy(false);
    setDraft({});
    if (error) return onError(friendlyError(error));
    onNotice(notice);
    reload();
  }

  async function call(args: Record<string, unknown>, notice: string) {
    setBusy(true);
    onError(null);
    const { error } = await supabase.rpc("fn_day2_control", args);
    setBusy(false);
    if (error) return onError(friendlyError(error));
    onNotice(notice);
    reload();
  }

  const withStart = (id: string, n: number) => saved.map((g) => (g.id === id ? { ...g, start_min: n } : g));

  function setStart(i: number, n: number) {
    const v = clamp(i, Math.round(n));
    if (v === saved[i].start_min) return setDraft({});
    void save(withStart(saved[i].id, v), `Day 2: ${nameOf(saved[i], i)} starts at ${v} min`);
  }

  function setLabel(i: number, label: string) {
    const v = label.trim().slice(0, 40);
    if (v === saved[i].label) return;
    void save(saved.map((g, k) => (k === i ? { ...g, label: v } : g)), "Day 2: segment renamed");
  }

  function addAfter(i: number) {
    const a = saved[i].start_min;
    const b = ends[i];
    if (b - a < 2) return onError("That segment is too short to split. Make it at least 2 minutes long first.");
    const mid = a + Math.floor((b - a) / 2);
    const copy: Day2SegmentDef = { ...saved[i], id: newSegmentId(saved), label: "", start_min: mid };
    const next = [...saved.slice(0, i + 1), copy, ...saved.slice(i + 1)];
    void save(next, `Day 2: segment added at ${mid} min`);
  }

  function remove(i: number) {
    if (!window.confirm(`Remove ${nameOf(saved[i], i).toLowerCase()}? Its time goes to the segment before it.`)) return;
    void save(saved.filter((_, k) => k !== i), "Day 2: segment removed");
  }

  function setDefault(i: number, key: Day2Switch, on: boolean) {
    void save(saved.map((g, k) => (k === i ? { ...g, [key]: on } : g)), `Day 2: ${SWITCHES.find((s) => s.key === key)!.label} default ${on ? "on" : "off"}`);
  }

  // Handle drag: pointer position -> minutes, snapped to 5.
  function minutesAt(clientX: number, i: number) {
    const r = railRef.current!.getBoundingClientRect();
    return clamp(i, Math.round((((clientX - r.left) / r.width) * span) / STEP) * STEP);
  }
  function onHandleMove(e: React.PointerEvent, i: number) {
    if (dragging !== segs[i].id) return;
    const m = minutesAt(e.clientX, i);
    latest.current = m;
    setDraft((d) => ({ ...d, [segs[i].id]: m }));
  }
  function endDrag(i: number) {
    if (dragging !== segs[i].id) return;
    setDragging(null);
    const m = latest.current;
    latest.current = null;
    if (m !== null && m !== saved[i].start_min) setStart(i, m);
    else setDraft({});
  }
  function onHandleKey(e: React.KeyboardEvent, i: number) {
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? STEP : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -STEP : 0;
    if (!d) return;
    e.preventDefault();
    const m = clamp(i, segs[i].start_min + d);
    latest.current = m;
    setDraft((x) => ({ ...x, [segs[i].id]: m }));
  }
  function onHandleKeyUp(e: React.KeyboardEvent, i: number) {
    if (!e.key.startsWith("Arrow") || latest.current === null) return;
    const m = latest.current;
    latest.current = null;
    if (m !== saved[i].start_min) setStart(i, m);
  }

  return (
    <section className="d2s">
      <h2 className="mb-2 font-semibold">Day 2 Inner Schedule</h2>
      <div className="d2s-shell">
        <div className="d2s-core">
          <ChallengeBanner />

          <div className="d2s-head">
            <span className="d2s-eyebrow">
              <span className="d2s-dot" data-live={segment !== "off"} />
              Inner Schedule
            </span>
            <p className="d2s-now">
              Now: <b>{segment === "off" ? "No Day 2 game" : day2.label}</b>
              {manual && ", held by hand"}
              {elapsed !== null && `, ${elapsed} of ${length} min`}
            </p>
          </div>

          <div className="d2s-timeline">
            <div className="d2s-railwrap">
              <div className="d2s-rail" ref={railRef}>
                {segs.map((g, i) => {
                  const pct = (Math.max(0, ends[i] - g.start_min) / span) * 100;
                  return (
                    <div
                      key={g.id}
                      className="d2s-seg"
                      title={nameOf(g, i)}
                      data-on={segment === g.id}
                      style={{ width: `${pct}%`, ["--tone" as string]: toneOf(g, i) }}
                    >
                      {pct >= 18 ? nameOf(g, i) : ""}
                    </div>
                  );
                })}
                {elapsed !== null && elapsed <= span && !manual && (
                  <span className="d2s-now-mark" style={{ left: `${(elapsed / span) * 100}%` }} />
                )}
                {span > length && <span className="d2s-end-mark" style={{ left: `${(length / span) * 100}%` }} title={`Game ends at ${length} min`} />}
              </div>
              {segs.map((g, i) =>
                i === 0 ? null : (
                  <button
                    key={g.id}
                    type="button"
                    role="slider"
                    aria-label={`${nameOf(g, i)} starts`}
                    aria-valuemin={limits(i)[0]}
                    aria-valuemax={limits(i)[1]}
                    aria-valuenow={g.start_min}
                    aria-valuetext={`${g.start_min} min`}
                    className="d2s-handle"
                    data-drag={dragging === g.id}
                    disabled={disabled}
                    data-past={g.start_min >= length}
                    // A segment can start after the running game ends (a 20 min rehearsal
                    // against a 60 and 105 min plan). Pin its handle to the rail's end:
                    // 300% would push the page wider than a phone.
                    style={{ left: `${Math.min(100, (g.start_min / span) * 100)}%` }}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setDragging(g.id);
                    }}
                    onPointerMove={(e) => onHandleMove(e, i)}
                    onPointerUp={() => endDrag(i)}
                    onPointerCancel={() => endDrag(i)}
                    onKeyDown={(e) => onHandleKey(e, i)}
                    onKeyUp={(e) => onHandleKeyUp(e, i)}
                  >
                    <span className="d2s-tip">{g.start_min} min</span>
                  </button>
                )
              )}
            </div>
            <div className="d2s-scale" aria-hidden>
              <span>0</span>
              <span>{Math.round(span / 2)}</span>
              <span>{span} min</span>
            </div>
          </div>
          <p className="d2s-hint">
            Drag a handle or use a card to move a time. Minutes from the game&apos;s start. +5 on the Day 2 game makes the last segment longer. Up to {MAX_SEGMENTS} segments.
          </p>

          <button type="button" className="d2s-more" aria-expanded={open} aria-controls="d2s-cards" onClick={() => setOpen((o) => !o)}>
            <span>Segment Times and Switches</span>
            <i><ChevronIcon /></i>
          </button>

          <div className="d2s-collapse" data-open={open} id="d2s-cards">
            <div className="d2s-grid" inert={!open}>
              {segs.map((g, i) => {
                const on = segment === g.id;
                const a = g.start_min;
                const b = ends[i];
                const done = elapsed !== null && !manual && !on && elapsed >= b;
                const nextStart = i + 1 < segs.length ? segs[i + 1].start_min : null;
                const label = nameOf(g, i);
                return (
                  <article key={g.id} className="d2s-card" data-on={on} data-done={done} style={{ ["--tone" as string]: toneOf(g, i) }}>
                    <div className="d2s-card-top">
                      <div>
                        <span className="d2s-num">{String(i + 1).padStart(2, "0")}</span>
                        <h3 className="d2s-name">{label}</h3>
                      </div>
                      {on ? (
                        <span className="d2s-chip" data-kind={manual ? "hand" : "live"}>{manual ? "Held" : "Live"}</span>
                      ) : done ? (
                        <span className="d2s-chip">Done</span>
                      ) : null}
                    </div>

                    <label className="d2s-labelrow">
                      <span>Name</span>
                      <input
                        key={g.label}
                        type="text"
                        maxLength={40}
                        aria-label={`Name, segment ${i + 1}`}
                        defaultValue={g.label}
                        placeholder={`Segment ${i + 1}`}
                        disabled={disabled}
                        onBlur={(e) => setLabel(i, e.currentTarget.value)}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      />
                    </label>

                    <div className="d2s-time">
                      <p className="d2s-time-l">
                        <b>Starts at</b>
                        {a}–{b} min, {Math.max(0, b - a)} long
                      </p>
                      {i > 0 ? (
                        <Stepper value={a} disabled={disabled} limits={limits(i)} onCommit={(n) => setStart(i, n)} />
                      ) : (
                        <span className="d2s-fixed">0 min</span>
                      )}
                    </div>

                    <div className="d2s-switches">
                      {SWITCHES.map((w) => {
                        const live = on && !!state;
                        const value = live ? switches[w.key] : g[w.key];
                        const byHand = live && w.key in flipped;
                        const asking = ask?.id === g.id && ask.key === w.key;
                        return (
                          <div key={w.key} className="d2s-sw-wrap">
                            <div className="d2s-sw">
                              <div className="min-w-0">
                                <p className="d2s-sw-name">
                                  {w.label}
                                  {byHand && <span className="d2s-sw-flag">By Hand</span>}
                                </p>
                                <p className="d2s-sw-note">{EFFECT[w.key][value ? 0 : 1]}</p>
                              </div>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={value}
                                aria-label={`${w.label}, ${label}`}
                                className="d2s-toggle"
                                disabled={busy || !state}
                                onClick={() => (live ? setAsk(asking ? null : { id: g.id, key: w.key }) : setDefault(i, w.key, !value))}
                              />
                            </div>
                            {asking && (
                              <div className="d2s-ask" role="group" aria-label={`Change ${w.label}`}>
                                <button
                                  type="button"
                                  className="d2s-btn"
                                  disabled={busy}
                                  onClick={() => {
                                    setAsk(null);
                                    setDefault(i, w.key, !value);
                                  }}
                                >
                                  Change Default
                                </button>
                                <button
                                  type="button"
                                  className="d2s-btn"
                                  disabled={busy}
                                  onClick={() => {
                                    setAsk(null);
                                    void call(
                                      { p_action: "set_switch", p_switch: w.key, p_on: !value },
                                      `Day 2: ${w.label} ${value ? "off" : "on"} until the next segment`
                                    );
                                  }}
                                >
                                  Just Now
                                </button>
                                <button type="button" className="d2s-btn" onClick={() => setAsk(null)}>
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="d2s-actions">
                      {on && !manual && nextStart !== null && elapsed !== null && elapsed > a && (
                        <button
                          className="d2s-btn"
                          data-kind="stop"
                          disabled={busy}
                          onClick={() =>
                            window.confirm(`End ${label.toLowerCase()} now?`) && save(withStart(segs[i + 1].id, Math.min(elapsed, (i + 2 < segs.length ? segs[i + 2].start_min - 1 : length - 1))), `Day 2: ${label} ended`)
                          }
                        >
                          <i><StopIcon /></i>End Now
                        </button>
                      )}
                      {on && manual && (
                        <button className="d2s-btn" data-kind="go" disabled={busy} onClick={() => call({ p_action: "auto" }, "Day 2: back to auto")}>
                          <i><BackIcon /></i>Back to Auto
                        </button>
                      )}
                      {!on && (
                        <button
                          className="d2s-btn"
                          disabled={disabled}
                          onClick={() =>
                            window.confirm(`Start ${label.toLowerCase()} now? It holds until Back to Auto.`) &&
                            call({ p_action: "start_segment", p_segment: g.id }, `Day 2: ${label} started by hand`)
                          }
                        >
                          <i><PlayIcon /></i>Start Now
                        </button>
                      )}
                      <button
                        className="d2s-btn"
                        disabled={disabled || atMax || manual}
                        title={manual ? "Press Back to Auto first" : atMax ? `At most ${MAX_SEGMENTS} segments` : undefined}
                        onClick={() => addAfter(i)}
                      >
                        <i><PlusIcon /></i>Add Segment After
                      </button>
                      {i > 0 && (
                        <button
                          className="d2s-btn"
                          data-kind="stop"
                          disabled={disabled || manual}
                          title={manual ? "Press Back to Auto first" : undefined}
                          onClick={() => remove(i)}
                        >
                          <i><TrashIcon /></i>Remove
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <p className="d2s-foot">
            A card&apos;s switches are the segment&apos;s saved defaults. On the running segment, Just Now lasts until the next segment. A closed station tier refuses Start Game and Submit at that tier&apos;s stations. Kill-switches (blind box, NFC, token freeze) still stop everything.
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
const PlusIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden><path d="M8 3.5v9M3.5 8h9" /></svg>
);
const TrashIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8" /></svg>
);
