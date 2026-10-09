"use client";

import { useEffect, useMemo, useState } from "react";

import { EVENT } from "@/components/home/data";
import { usePhaseTimerOptional } from "@/components/PhaseTimerProvider";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ScheduleItem } from "@/lib/types";

export interface EventCountdown {
  /** Shown above the digits, e.g. "ORIENTATION DAY 1 STARTS IN", "OPENING CEREMONY ENDS IN". */
  label: string;
  /** Seconds left; null while loading (render "--"). 0 when nothing is counting. */
  seconds: number | null;
  /** True while a schedule item is on (or paused). */
  live: boolean;
  paused: boolean;
  /** The schedule item being counted (its start or its end), if any. */
  itemId: number | null;
}

export type CountdownItem = Pick<
  ScheduleItem,
  | "id"
  | "day_label"
  | "title"
  | "starts_at"
  | "ends_at"
  | "timer_state"
  | "timer_end_override"
  | "timer_paused_remaining"
>;

const result = (
  label: string,
  seconds: number,
  extra: Partial<Pick<EventCountdown, "live" | "paused" | "itemId">> = {}
): EventCountdown => ({ label, seconds, live: false, paused: false, itemId: null, ...extra });

// Day dates have no time of day; count to this (event local time) until the
// first item gets a planned start.
const DAY_START = "08:00:00+08:00";

/** When an item's live run ends: Live control's change, else the planned end. */
export function liveEnd(i: Pick<ScheduleItem, "timer_end_override" | "ends_at">) {
  return i.timer_end_override ?? i.ends_at;
}

// One countdown for the whole event, used by the Welcome page, Freshie Home
// and Live control. Schedule items run by their planned times by themselves:
//   before Day N's first item   → "ORIENTATION DAY N STARTS IN"
//   an item is on               → "<ITEM> ENDS IN" (to its live end)
//   an item is paused           → "<ITEM> PAUSED", frozen
//   between items               → "<NEXT ITEM> STARTS IN"
//   after the last item         → "ORIENTATION COMPLETE"
// Live control can pause, move the end (±5 min, new end time), stop early or
// reset an item; it never changes the planned schedule. Without any planned
// times it counts to the day dates, then to the fixed date in EVENT.
export function useEventCountdown(): EventCountdown {
  // Inside the app shell, reuse the shared 1s tick and server clock offset.
  const shared = usePhaseTimerOptional();
  const [items, setItems] = useState<CountdownItem[] | null>(null);
  const [dayDates, setDayDates] = useState<{ day_label: string; day_date: string }[]>([]);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let active = true;
    async function load() {
      const { data, error } = await supabase
        .from("schedule_items")
        .select("id, day_label, title, starts_at, ends_at, timer_state, timer_end_override, timer_paused_remaining")
        .order("starts_at", { nullsFirst: false });
      // Columns missing (migration 0049 not run yet): count to the dates.
      if (active) setItems(error ? [] : ((data as CountdownItem[]) ?? []));
    }
    async function loadDays() {
      const { data } = await supabase.from("schedule_days").select("day_label, day_date").order("day_date");
      if (active && data) setDayDates(data);
    }
    load();
    loadDays();
    const channel = supabase
      .channel(`event-countdown-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_items" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_days" }, loadDays)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Own 1s tick only when there is no provider; the provider already ticks.
  useEffect(() => {
    if (shared) return;
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [shared]);

  const tick = shared?.tick;
  const offsetMs = shared?.offsetMs ?? 0;

  return useMemo((): EventCountdown => {
    // Server render and first client render: nothing yet, so markup matches.
    if (items === null || (!shared && now === null)) {
      return { label: "ORIENTATION BEGINS IN", seconds: null, live: false, paused: false, itemId: null };
    }
    void tick;
    const t = (shared ? Date.now() : (now as number)) + offsetMs;
    const ms = (iso: string) => new Date(iso).getTime();
    const until = (iso: string) => Math.max(0, (ms(iso) - t) / 1000);
    const upper = (s: string) => s.toUpperCase();

    const timed = items.filter((i) => i.starts_at);
    if (timed.length > 0) {
      // 1. Paused by Admin: frozen.
      const paused = timed.find((i) => i.timer_state === "paused");
      if (paused) {
        return result(`${upper(paused.title)} PAUSED`, paused.timer_paused_remaining ?? 0, {
          live: true,
          paused: true,
          itemId: paused.id,
        });
      }

      // 2. On now: past its planned start, before its live end, not stopped.
      const on = timed.find((i) => {
        const end = liveEnd(i);
        return i.timer_state !== "ended" && ms(i.starts_at as string) <= t && end !== null && t < ms(end);
      });
      if (on) {
        return result(`${upper(on.title)} ENDS IN`, until(liveEnd(on) as string), { live: true, itemId: on.id });
      }

      // 3. Next to start.
      const next = timed.find((i) => i.timer_state !== "ended" && ms(i.starts_at as string) > t);
      if (next) {
        const firstOfDay = timed.find((i) => i.day_label === next.day_label) === next;
        return result(
          firstOfDay ? `ORIENTATION ${upper(next.day_label)} STARTS IN` : `${upper(next.title)} STARTS IN`,
          until(next.starts_at as string),
          { itemId: next.id }
        );
      }
      return result("ORIENTATION COMPLETE", 0);
    }

    // 4. No planned times yet: the day dates from the Schedule page.
    if (dayDates.length > 0) {
      const starts = dayDates.map((d) => ({ label: d.day_label, at: `${d.day_date}T${DAY_START}` }));
      const nextDay = starts.find((d) => ms(d.at) > t);
      if (nextDay) return result(`ORIENTATION ${upper(nextDay.label)} STARTS IN`, until(nextDay.at));
      return result("ORIENTATION IS ON", 0);
    }

    // 5. Nothing set in Admin yet: the fixed event date.
    if (until(EVENT.dates.day1) > 0) return result("ORIENTATION BEGINS IN", until(EVENT.dates.day1));
    return result("ORIENTATION IS ON", 0);
  }, [items, dayDates, shared, now, tick, offsetMs]);
}

/** Splits seconds into the four countdown cells. */
export function countdownParts(seconds: number | null) {
  if (seconds === null) return null;
  const s = Math.max(0, Math.floor(seconds));
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}
