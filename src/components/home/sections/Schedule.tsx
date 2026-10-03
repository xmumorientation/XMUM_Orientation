"use client";

import React, { useState } from "react";
import { EVENTS } from "../data";
import { Star, Gamepad2, Info, UtensilsCrossed } from "lucide-react";

const TYPE_STYLE: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  info: { icon: <Info size={12} />, color: "var(--vx-cyan)", label: "INFO" },
  star: { icon: <Star size={12} />, color: "var(--vx-yellow)", label: "CEREMONY" },
  game: { icon: <Gamepad2 size={12} />, color: "var(--vx-pink)", label: "GAME" },
  food: { icon: <UtensilsCrossed size={12} />, color: "var(--vx-orange)", label: "FOOD" },
};

const WEEKDAY: Record<string, string> = { "28 Nov": "SAT", "29 Nov": "SUN" };

export function Schedule() {
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const currentDay = EVENTS[activeDayIdx] ?? EVENTS[0];

  return (
    <section id="schedule" className="vx-sec vx-sched" aria-labelledby="schedule-title">
      <div className="vx-dots" />

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
                  {WEEKDAY[ev.date] ? `${WEEKDAY[ev.date]} · ` : ""}
                  {ev.date.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </div>

        <ol
          id="day-panel"
          role="tabpanel"
          aria-labelledby={`day-tab-${activeDayIdx}`}
          className="vx-timeline vx-rise-2"
        >
          {currentDay.items.map((item, i) => {
            const st = TYPE_STYLE[item.type] ?? TYPE_STYLE.info;
            const when = item.time === "TBD" && item.venue === "TBD" ? "TIME & VENUE TBD" : `${item.time} · ${item.venue}`;
            return (
              <li key={i} className="vx-card vx-item" style={{ "--dot": st.color } as React.CSSProperties}>
                <b>{item.title}</b>
                <small className="vx-mono">{when}</small>
                <span className="vx-tag vx-mono" style={{ color: st.color }}>
                  {st.icon}
                  {st.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
