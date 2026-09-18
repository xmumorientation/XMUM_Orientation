"use client";

import { useState } from "react";
import { EVENTS, FONT } from "../data";

export function Schedule() {
  const [activeDay, setActiveDay] = useState(0);
  const typeColors: Record<string, string> = { star: "#f9d342", game: "#00cfff", map: "#39ff14", info: "#d966ff", food: "#ff6b35" };
  const typeIcons: Record<string, string> = { star: "⭐", game: "🎮", map: "🗺️", info: "ℹ️", food: "🍜" };
  const committeeColors: Record<string, string> = {
    Logistics: "#f9d342", Program: "#d966ff", Welfare: "#39ff14",
    Games: "#00cfff", Academic: "#ff3cac", Entertainment: "#ff6b35", Media: "rgba(255,255,255,0.4)",
  };
  const dayColors = ["#00cfff", "#d966ff", "#ff3cac"];

  return (
    <section id="schedule" style={{ scrollMarginTop: 64, padding: "56px 20px 72px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontFamily: FONT.display, fontWeight: 900, fontSize: "clamp(40px, 8vw, 64px)", lineHeight: 1 }}>
          <span className="text-holo">SCHED</span>
          <span style={{ color: "#fff" }}>ULE</span>
        </h2>
        <div style={{ fontFamily: FONT.mono, fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: 3, marginTop: 8 }}>SEP 18–20, 2026 · 3 DAYS</div>
      </div>

      {/* Day tabs */}
      <div style={{ display: "flex", gap: 12, marginBottom: 36 }}>
        {EVENTS.map((ev, i) => (
          <button
            key={ev.day}
            onClick={() => setActiveDay(i)}
            style={{
              flex: 1,
              padding: "12px 8px",
              borderRadius: 14,
              cursor: "pointer",
              background: activeDay === i ? `linear-gradient(135deg, ${dayColors[i]}cc, ${dayColors[i]}66)` : "#0b0714",
              color: activeDay === i ? "#000" : "rgba(255,255,255,0.4)",
              fontFamily: FONT.display,
              fontWeight: 800,
              fontSize: 13,
              border: activeDay === i ? "none" : "1px solid rgba(255,255,255,0.06)",
              boxShadow: activeDay === i ? `0 0 20px ${dayColors[i]}40` : "none",
              transition: "all 0.2s",
            }}
          >
            <div>{ev.day}</div>
            <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>{ev.date}</div>
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 52, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.06)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {EVENTS[activeDay].items.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{ width: 40, flexShrink: 0, textAlign: "right", paddingTop: 2 }}>
                <span style={{ fontFamily: FONT.mono, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{item.time}</span>
              </div>
              <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, zIndex: 1, background: `${typeColors[item.type]}15`, border: `2px solid ${typeColors[item.type]}50`, marginTop: 1 }}>
                {typeIcons[item.type]}
              </div>
              <div className="card-glow" style={{ flex: 1, padding: "12px 16px" }}>
                <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 14, color: "#fff", marginBottom: 4 }}>{item.title}</div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>📍 {item.venue}</span>
                  <span style={{ padding: "2px 8px", borderRadius: 50, fontSize: 10, fontWeight: 700, background: `${committeeColors[item.committee] ?? "#fff"}15`, color: committeeColors[item.committee] ?? "rgba(255,255,255,0.5)" }}>
                    {item.committee}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
