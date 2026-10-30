"use client";

import { Gamepad2, Info, Star, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { vxSlab, vxDisplay } from "@/components/home/fonts";
import { useEventCountdown } from "@/components/useEventCountdown";
import { useGroup } from "@/components/useGroup";
import { useScheduleItems } from "@/components/useScheduleFeed";
import type { ScheduleItem } from "@/lib/types";

import "./freshie.css";
import "@/components/staff/staff-home.css";
import { themeFromColor, VORTEXA_THEME } from "./groupTheme";

// Logged-in Freshie schedule. Same night layout as the welcome page
// schedule (day switcher + timeline cards), filled from schedule_items
// so an admin edit shows up here. With `vortexa` (HOGM, HOF, GM) it uses the
// Welcome page colours (.fh-vx) and marks the item that is on now.

const DAY_META: Record<string, { weekday: string; date: string }> = {
  "Day 1": { weekday: "SAT", date: "28 Nov" },
  "Day 2": { weekday: "SUN", date: "29 Nov" },
};

const TAGS: Record<string, { label: string; color: string; Icon: LucideIcon }> = {
  INFO: { label: "INFO", color: "#0DFCFD", Icon: Info },
  CEREMONY: { label: "CEREMONY", color: "#F2FF0B", Icon: Star },
  GAME: { label: "GAME", color: "#FE06AB", Icon: Gamepad2 },
  FOOD: { label: "FOOD", color: "#FC9E3D", Icon: UtensilsCrossed },
};

function whenLabel(item: ScheduleItem) {
  const time = item.time_label.trim();
  const venue = item.location.trim();
  const tbd = (value: string) => value === "" || value.toUpperCase() === "TBD";
  if (tbd(time) && tbd(venue)) return "TIME & VENUE TBD";
  if (tbd(venue)) return time;
  if (tbd(time)) return venue;
  return `${time} / ${venue}`;
}

export function FreshieSchedule({ vortexa = false }: { vortexa?: boolean }) {
  const { group } = useGroup();
  const theme = vortexa ? VORTEXA_THEME : themeFromColor(group?.color);
  const { nowId: onId } = useEventCountdown();
  const nowId = vortexa ? onId : null;
  // Shared, cached feed (useScheduleFeed.ts): a return visit shows the last schedule at once.
  const feedItems = useScheduleItems();
  const items = useMemo<ScheduleItem[] | null>(
    () =>
      feedItems
        ? [...feedItems].sort((a, b) => a.day_label.localeCompare(b.day_label) || a.sort_order - b.sort_order || a.id - b.id)
        : null,
    [feedItems]
  );
  const [active, setActive] = useState(0);
  const picked = useRef(false);

  const days = useMemo(() => [...new Set((items ?? []).map((item) => item.day_label))], [items]);

  useEffect(() => {
    if (picked.current || days.length === 0) return;
    picked.current = true;
    const today = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "Asia/Kuala_Lumpur",
    });
    const index = days.findIndex((label) => DAY_META[label]?.date === today);
    if (index >= 0) setActive(index);
  }, [days]);

  const dayIndex = Math.min(active, Math.max(days.length - 1, 0));
  const day = days[dayIndex] ?? null;
  const dayItems = (items ?? []).filter((item) => item.day_label === day);

  return (
    <div
      className={`fh fh-sched${vortexa ? " fh-vx" : ""} ${vxSlab.variable} ${vxDisplay.variable}`}
      style={
        {
          "--fh-accent": theme.accent,
          "--fh-glow": theme.glow,
          "--fh-blue": theme.accent,
          "--fh-blue-light": theme.accentLight,
          "--fh-on-blue": theme.onAccent,
        } as React.CSSProperties
      }
    >
      <div className="fh-bg" aria-hidden>
        <div className="fh-glow" style={{ width: 380, height: 380, background: "var(--fh-glow)", left: -150, top: 40, opacity: 0.35 }} />
        <div className="fh-glow" style={{ width: 280, height: 280, background: "#FE06AB", right: -140, bottom: 40, opacity: 0.16 }} />
      </div>

      <div className="fh-sched-inner">
        <div className="fh-sched-side">
          <div className="fh-sched-title">
            {vortexa && <p className="fh-eyebrow fh-mono">Two-Day Programme</p>}
            <h1 className="fh-h2 fh-slab">Schedule</h1>
          </div>
          {days.length > 0 && (
            <div className="fh-days" role="tablist" aria-label="Orientation day">
              {days.map((label, index) => {
                const meta = DAY_META[label];
                return (
                  <button
                    key={label}
                    type="button"
                    role="tab"
                    id={`fh-day-tab-${index}`}
                    aria-selected={dayIndex === index}
                    aria-controls="fh-day-panel"
                    className="fh-day"
                    onClick={() => setActive(index)}
                  >
                    <b>{label}</b>
                    {meta && (
                      <span className="fh-mono">
                        {meta.weekday}, {meta.date.toUpperCase()}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <ol
          id="fh-day-panel"
          role="tabpanel"
          aria-labelledby={day ? `fh-day-tab-${dayIndex}` : undefined}
          className="fh-timeline"
        >
          {items === null ? (
            <li className="fh-sched-empty">Loading…</li>
          ) : dayItems.length === 0 ? (
            <li className="fh-sched-empty">The schedule will appear here once the committee publishes it.</li>
          ) : (
            dayItems.map((item) => {
              const tag = TAGS[item.description.trim().toUpperCase()];
              const note = tag ? "" : item.description.trim();
              const when = whenLabel(item);
              return (
                <li
                  key={item.id}
                  className="fh-sched-item"
                  data-now={item.id === nowId || undefined}
                  style={{ "--dot": tag?.color ?? "#0DFCFD" } as React.CSSProperties}
                >
                  <b>
                    {item.id === nowId && <span className="fh-sched-now fh-mono">NOW</span>}
                    {item.title}
                  </b>
                  <small className="fh-mono">{note ? `${when} / ${note}` : when}</small>
                  {tag && (
                    <span className="fh-sched-tag fh-mono" style={{ color: tag.color }}>
                      <tag.Icon size={12} aria-hidden />
                      {tag.label}
                    </span>
                  )}
                </li>
              );
            })
          )}
        </ol>
      </div>
    </div>
  );
}
