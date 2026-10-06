"use client";

import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import { Card } from "@/components/ui";
import { liveEnd } from "@/components/useEventCountdown";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ScheduleItem } from "@/lib/types";
import { cn, formatCountdown, friendlyError } from "@/lib/utils";

type RunState = "upcoming" | "on" | "paused" | "done" | "untimed";

const RUN_CHIP: Record<RunState, { label: string; className: string }> = {
  upcoming: { label: "Upcoming", className: "bg-paper-200 text-ink-soft" },
  on: { label: "On now", className: "bg-green-600 text-white" },
  paused: { label: "Paused", className: "bg-amber-100 text-amber-800" },
  done: { label: "Done", className: "bg-gray-200 text-gray-600" },
  untimed: { label: "No planned time", className: "bg-paper-200 text-ink-soft" },
};

function clock(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
    : null;
}

export function runState(i: ScheduleItem, now: number): RunState {
  if (!i.starts_at) return "untimed";
  if (i.timer_state === "paused") return "paused";
  const end = liveEnd(i);
  if (i.timer_state === "ended" || (end && new Date(end).getTime() <= now)) return "done";
  if (new Date(i.starts_at).getTime() > now) return "upcoming";
  return "on";
}

/** Calls fn_schedule_timer; shared by the Live schedule rows and the Now box. */
export async function scheduleTimer(
  item: Pick<ScheduleItem, "id" | "title">,
  action: "pause" | "resume" | "extend" | "set_end" | "end" | "reset",
  opts: { minutes?: number; endAt?: Date } = {}
) {
  const { error } = await supabaseBrowser().rpc("fn_schedule_timer", {
    p_item_id: item.id,
    p_action: action,
    p_minutes: opts.minutes ?? 0,
    p_end_at: opts.endAt ? opts.endAt.toISOString() : null,
  });
  return error ? friendlyError(error) : null;
}

// Live schedule: items run by their planned times by themselves (the Welcome
// page countdown follows them). Each item opens into a checklist:
// 1. Session (attendance, open/close by hand) and 2. Time (its status). The
// item that is on is adjusted in "Now on the Welcome page" (NowOnWelcome).
// Times are edited on the Schedule page; games run from the header.
export function LiveSchedule({
  day,
  onError,
  onNotice,
}: {
  /** Live control's day filter: only this day's items are shown. */
  day: string;
  onError: (m: string | null) => void;
  onNotice: (m: string) => void;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { offsetMs, tick } = usePhaseTimer();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [sessions, setSessions] = useState<Record<number, boolean>>({}); // id → closed
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [{ data: its }, { data: ses }] = await Promise.all([
      supabase
        .from("schedule_items")
        .select("*")
        .order("day_label")
        .order("sort_order")
        .order("id"),
      supabase.from("attendance_sessions").select("id, closed"),
    ]);
    setItems((its as ScheduleItem[]) ?? []);
    setSessions(Object.fromEntries((ses ?? []).map((s) => [s.id, s.closed])));
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("live-control")
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_items" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_sessions" }, load)
      .subscribe();
    const interval = setInterval(load, 15_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [load, supabase]);

  void tick;
  const now = Date.now() + offsetMs;
  const nextItem = items
    .filter((i) => runState(i, now) === "upcoming")
    .sort((a, b) => (a.starts_at as string).localeCompare(b.starts_at as string))[0];

  async function run(fn: () => Promise<string | null>, notice: string) {
    setBusy(true);
    onError(null);
    const err = await fn();
    setBusy(false);
    if (err) return onError(err);
    onNotice(notice);
    load();
  }

  function session(i: ScheduleItem, action: "open" | "close") {
    run(async () => {
      const { error } = await supabase.rpc("fn_schedule_session", { p_item_id: i.id, p_action: action });
      return error ? friendlyError(error) : null;
    }, `${i.title}: session ${action === "open" ? "opened" : "closed"}`);
  }

  function timeLeft(i: ScheduleItem, state: RunState) {
    if (state === "paused") return i.timer_paused_remaining ?? 0;
    const end = liveEnd(i);
    if (state === "on" && end) return (new Date(end).getTime() - now) / 1000;
    return null;
  }

  function checklist(i: ScheduleItem) {
    const sessionClosed = i.session_id != null ? sessions[i.session_id] : undefined;
    const state = runState(i, now);
    const left = timeLeft(i, state);

    return (
      <div className="mt-3 space-y-3 rounded-xl border border-paper-200 p-3">
        {/* 1. Session */}
        <div className="flex flex-wrap items-center gap-2">
          <Step done={sessionClosed === true} active={sessionClosed === false} n={1} />
          <span className="w-16 text-sm font-bold">Session</span>
          <span className="text-xs text-ink-faint">
            {sessionClosed === undefined ? "Not opened" : sessionClosed ? "Closed" : "Open for attendance"}
          </span>
          <div className="ml-auto flex gap-1.5">
            <button disabled={busy || sessionClosed === false} onClick={() => session(i, "open")} className="btn-secondary min-h-[34px] px-3 text-xs">
              {sessionClosed ? "Reopen" : "Open"}
            </button>
            <button disabled={busy || sessionClosed !== false} onClick={() => session(i, "close")} className="btn-secondary min-h-[34px] px-3 text-xs">
              Close
            </button>
          </div>
        </div>

        {/* 2. Time: runs by itself from the planned times */}
        <div className="flex flex-wrap items-center gap-2">
          <Step done={state === "done"} active={state === "on" || state === "paused"} n={2} />
          <span className="w-16 text-sm font-bold">Time</span>
          <span className={cn("chip", RUN_CHIP[state].className)}>{RUN_CHIP[state].label}</span>
          {left !== null && (
            <span className="font-mono text-sm font-bold tabular-nums">{formatCountdown(left)} left</span>
          )}
          <span className="text-xs text-ink-faint">
            {i.starts_at
              ? `Runs ${clock(i.starts_at)}–${clock(liveEnd(i)) ?? "?"} by itself${
                  i.timer_end_override && i.timer_end_override !== i.ends_at ? ` (planned end ${clock(i.ends_at)})` : ""
                }. While it's on, adjust it in "Now on the Welcome page" above.`
              : "Set a planned start and end on the Schedule page."}
          </span>
        </div>
      </div>
    );
  }

  function row(i: ScheduleItem) {
    const isOpen = expanded === i.id;
    const state = runState(i, now);
    const left = timeLeft(i, state);
    const sessionOpen = i.session_id != null && sessions[i.session_id] === false;

    return (
      <div key={i.id} className={cn("px-4 py-3", (state === "on" || state === "paused") && "bg-green-50/60")}>
        <button
          type="button"
          onClick={() => setExpanded(isOpen ? null : i.id)}
          aria-expanded={isOpen}
          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
        >
          <span className="w-24 shrink-0 text-sm font-semibold tabular-nums text-brand-1">
            {i.starts_at ? `${clock(i.starts_at)}${i.ends_at ? `–${clock(i.ends_at)}` : ""}` : i.time_label}
          </span>
          <span className="min-w-0 flex-1 font-semibold">{i.title}</span>
          {sessionOpen && <span className="chip bg-green-100 text-green-800">Session open</span>}
          {left !== null && (
            <span className="chip bg-green-600 font-mono text-white tabular-nums">
              {state === "paused" ? "PAUSED " : ""}
              {formatCountdown(left)}
            </span>
          )}
          {i === nextItem && <span className="chip bg-brand-1/10 text-brand-1">NEXT</span>}
          {state === "done" && <span className="chip bg-gray-200 text-gray-600">Done</span>}
          <ChevronDown size={16} className={cn("shrink-0 text-ink-faint transition", isOpen && "rotate-180")} />
        </button>
        {isOpen && checklist(i)}
      </div>
    );
  }

  const dayItems = items.filter((i) => i.day_label === day);

  return (
    <section>
      <h2 className="mb-2 font-semibold">Live schedule</h2>
      {dayItems.length === 0 ? (
        <Card className="text-sm text-ink-faint">
          Nothing on the {day} schedule yet. Add items on the Schedule page.
        </Card>
      ) : (
        <Card className="p-0">
          <p className="border-b border-paper-200 px-4 py-2.5 font-bold">{day}</p>
          <div className="divide-y divide-paper-200">{dayItems.map(row)}</div>
        </Card>
      )}
    </section>
  );
}

function Step({ n, done, active }: { n: number; done: boolean; active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
        done ? "bg-green-600 text-white" : active ? "bg-amber-400 text-ink" : "bg-paper-200 text-ink-soft"
      )}
    >
      {done ? <Check size={14} /> : n}
    </span>
  );
}
