"use client";

import React, { useState } from "react";
import { FONT, EVENTS } from "../data";
import { Star, Gamepad2, Info, UtensilsCrossed } from "lucide-react";

export function Schedule() {
  const [activeDayIdx, setActiveDayIdx] = useState(0);

  const TYPE_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
    star: { icon: <Star size={16} />, color: "#f9d342" },
    game: { icon: <Gamepad2 size={16} />, color: "#12e6ff" },
    info: { icon: <Info size={16} />, color: "#a437ff" },
    food: { icon: <UtensilsCrossed size={16} />, color: "#ffb454" },
  };

  const dayColors = ["#12e6ff", "#a437ff"];
  const currentDay = EVENTS[activeDayIdx] ?? EVENTS[0];

  return (
    <section
      id="schedule"
      style={{
        scrollMarginTop: 64,
        position: "relative",
        padding: "84px 20px 76px",
        background: "transparent",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto", position: "relative", zIndex: 2 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <h2
            style={{
              fontFamily: FONT.display,
              fontWeight: 900,
              fontSize: "clamp(36px, 7vw, 64px)",
              lineHeight: 1,
              marginBottom: 16,
            }}
          >
            <span className="text-holo">SCHED</span>
            <span style={{ color: "#fff" }}>ULE</span>
          </h2>
          <div
            style={{
              fontFamily: FONT.mono,
              fontSize: 11,
              color: "rgba(255, 255, 255, 0.45)",
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            28–29 NOVEMBER 2026 · 2 DAYS
          </div>
        </div>

        {/* Day Tabs */}
        <div style={{ display: "flex", gap: 12, marginBottom: 36, justifyContent: "center" }}>
          {EVENTS.map((ev, i) => {
            const isActive = activeDayIdx === i;
            const color = dayColors[i] || "#12e6ff";
            return (
              <button
                key={ev.day}
                onClick={() => setActiveDayIdx(i)}
                style={{
                  flex: 1,
                  maxWidth: 180,
                  padding: "14px 16px",
                  borderRadius: 16,
                  cursor: "pointer",
                  background: isActive ? `linear-gradient(135deg, ${color}30, ${color}10)` : "rgba(11, 7, 24, 0.45)",
                  color: isActive ? "#fff" : "rgba(255, 255, 255, 0.5)",
                  fontFamily: FONT.display,
                  fontWeight: 800,
                  fontSize: 14,
                  border: isActive ? `1.5px solid ${color}` : "1px solid rgba(255, 255, 255, 0.08)",
                  boxShadow: isActive ? `0 0 25px ${color}30` : "none",
                  backdropFilter: "blur(12px)",
                  transition: "all 0.2s ease",
                  textAlign: "center",
                }}
              >
                <div>{ev.day}</div>
                <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.75, marginTop: 2, fontFamily: FONT.mono }}>
                  {ev.date}
                </div>
              </button>
            );
          })}
        </div>

        {/* Timeline Items */}
        <div style={{ position: "relative" }}>
          <div
            style={{
              position: "absolute",
              left: 48,
              top: 8,
              bottom: 8,
              width: 1,
              background: "rgba(255, 255, 255, 0.1)",
            }}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {currentDay.items.map((item, i) => {
              const cfg = TYPE_ICONS[item.type] || TYPE_ICONS.info;
              return (
                <div key={i} style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  {/* Time column */}
                  <div
                    style={{
                      width: 40,
                      flexShrink: 0,
                      textAlign: "right",
                      fontFamily: FONT.mono,
                      fontSize: 11,
                      color: "rgba(255, 255, 255, 0.45)",
                      letterSpacing: 1,
                    }}
                  >
                    {item.time}
                  </div>

                  {/* Icon circle */}
                  <div
                    style={{
                      flexShrink: 0,
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 1,
                      background: "#0b0718",
                      border: `1.5px solid ${cfg.color}`,
                      color: cfg.color,
                      boxShadow: `0 0 12px ${cfg.color}40`,
                    }}
                  >
                    {cfg.icon}
                  </div>

                  {/* Content card with translucent glass */}
                  <div
                    style={{
                      flex: 1,
                      padding: "16px 20px",
                      borderRadius: 14,
                      background: "rgba(11, 7, 24, 0.45)",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                      backdropFilter: "blur(12px)",
                      boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: FONT.display,
                        fontWeight: 800,
                        fontSize: 15,
                        color: "#fff",
                      }}
                    >
                      {item.title}
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(255, 255, 255, 0.4)",
                        fontFamily: FONT.mono,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        flexShrink: 0,
                      }}
                    >
                      {item.venue === "TBD" ? "TIME & VENUE TBD" : item.venue}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
