"use client";

import React, { useEffect, useMemo, useState } from "react";
import { EVENTS } from "../data";
import { Star, Gamepad2, Info, UtensilsCrossed } from "lucide-react";

import { supabaseBrowser } from "@/lib/supabase/client";
import type { ScheduleItem } from "@/lib/types";

// The tag an Admin types in an entry's description (same rule as the
// Freshie Schedule page). Any other description is shown as a note.
const TAG_STYLE: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  INFO: { icon: <Info size={12} />, color: "var(--vx-cyan)", label: "INFO" },
  CEREMONY: { icon: <Star size={12} />, color: "var(--vx-yellow)", label: "CEREMONY" },
  GAME: { icon: <Gamepad2 size={12} />, color: "var(--vx-pink)", label: "GAME" },
  FOOD: { icon: <UtensilsCrossed size={12} />, color: "var(--vx-orange)", label: "FOOD" },
};

const WEEKDAY: Record<string, string> = { "28 Nov": "SAT", "29 Nov": "SUN" };

function whenLabel(item: ScheduleItem) {
  const time = item.time_label.trim();
  const venue = item.location.trim();
  const tbd = (value: string) => value === "" || value.toUpperCase() === "TBD";
  if (tbd(time) && tbd(venue)) return "TO BE ANNOUNCED";
  if (tbd(venue)) return time;
  if (tbd(time)) return venue;
  return `${time}, ${venue}`;
}

// Days and dates come from EVENTS (they are fixed). The entries for each day
// come from schedule_items, which Admin edits; an edit shows up here live.
export function Schedule() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  // null while loading. A failed load counts as "no entries yet".
  const [items, setItems] = useState<ScheduleItem[] | null>(null);
  const currentDay = EVENTS[activeDayIdx] ?? EVENTS[0];

  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase
        .from("schedule_items")
        .select("*")
        .order("sort_order")
        .order("id");
      if (active) setItems((data as ScheduleItem[]) ?? []);
    }
    load();
    const channel = supabase
      .channel("vx-schedule")
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_items" }, load)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const dayItems = (items ?? []).filter((item) => item.day_label === currentDay.day);
  const dateLine = `${WEEKDAY[currentDay.date] ? `${WEEKDAY[currentDay.date]}, ` : ""}${currentDay.date.toUpperCase()}`;

  return (
    <section id="schedule" className="vx-sec vx-sched" aria-labelledby="schedule-title">
      <div className="vx-inner">
        <div className="vx-sched-side vx-rise">
          <h2 id="schedule-title" className="vx-h2">Schedule</h2>
          <div className="vx-days" role="tablist" aria-label="Orientation day">
            {EVENTS.map((ev, i) => (
              <button
                key={ev.day}
                type="button"
                role="tab"
                id={`day-tab-${i}`}
                aria-selected={activeDayIdx === i}
                aria-controls="day-panel"
                className="vx-day"
                onClick={() => setActiveDayIdx(i)}
              >
                <b>{ev.day}</b>
                <span className="vx-mono">
                  {WEEKDAY[ev.date] ? `${WEEKDAY[ev.date]}, ` : ""}
                  {ev.date.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </div>

        {items === null ? (
          <ol id="day-panel" role="tabpanel" aria-labelledby={`day-tab-${activeDayIdx}`} aria-busy="true" className="vx-timeline vx-rise-2">
            {[0, 1, 2].map((i) => (
              <li key={i} className="vx-card vx-item vx-item-skel" aria-hidden />
            ))}
          </ol>
        ) : dayItems.length === 0 ? (
          <div id="day-panel" role="tabpanel" aria-labelledby={`day-tab-${activeDayIdx}`} className="vx-coming vx-rise-2">
            <p className="vx-coming-title">Schedule coming soon</p>
            <p className="vx-mono vx-coming-meta">
              {currentDay.day}, {dateLine} 2026, TBA
            </p>
            <p className="vx-coming-note">Full timetable drops closer to the event. Dates are locked, and times and venues are still TBA.</p>
          </div>
        ) : (
          <ol
            id="day-panel"
            role="tabpanel"
            aria-labelledby={`day-tab-${activeDayIdx}`}
            className="vx-timeline vx-rise-2"
          >
            {dayItems.map((item) => {
              const tag = TAG_STYLE[item.description.trim().toUpperCase()];
              const note = tag ? "" : item.description.trim();
              const when = whenLabel(item);
              return (
                <li key={item.id} className="vx-card vx-item" style={{ "--dot": tag?.color ?? "var(--vx-cyan)" } as React.CSSProperties}>
                  <b>{item.title}</b>
                  <small className="vx-mono">{note ? `${when}, ${note}` : when}</small>
                  {tag && (
                    <span className="vx-tag vx-mono" style={{ color: tag.color }}>
                      {tag.icon}
                      {tag.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
