"use client";

import { useState } from "react";
import { BUILDINGS, FONT, type Building } from "../data";

export function CampusMap() {
  const [selected, setSelected] = useState<Building | null>(null);

  return (
    <section id="map" style={{ scrollMarginTop: 64, padding: "56px 20px 72px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontFamily: FONT.display, fontWeight: 900, fontSize: "clamp(40px, 8vw, 64px)", lineHeight: 1 }}>
          <span className="text-holo">CAMPUS</span>
          <br />
          <span style={{ color: "#fff" }}>MAP</span>
        </h2>
        <div style={{ fontFamily: FONT.mono, fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: 3, marginTop: 8 }}>TAP A LOCATION TO EXPLORE</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 20 }}>
        {/* Map canvas */}
        <div style={{ position: "relative", borderRadius: 20, overflow: "hidden", background: "#050510", border: "1px solid rgba(255,255,255,0.08)", aspectRatio: "4/3" }}>
          <div style={{ position: "absolute", width: 200, height: 200, borderRadius: "50%", background: "#7b2fff", filter: "blur(60px)", opacity: 0.1, top: "10%", left: "20%" }} />
          <div style={{ position: "absolute", width: 180, height: 180, borderRadius: "50%", background: "#00cfff", filter: "blur(60px)", opacity: 0.08, bottom: "10%", right: "20%" }} />

          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.15 }} viewBox="0 0 100 100" preserveAspectRatio="none">
            {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((v) => (
              <line key={`h${v}`} x1="0" y1={v} x2="100" y2={v} stroke="#7b2fff" strokeWidth="0.3" />
            ))}
            {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((v) => (
              <line key={`v${v}`} x1={v} y1="0" x2={v} y2="100" stroke="#7b2fff" strokeWidth="0.3" />
            ))}
            <line x1="50" y1="5" x2="50" y2="95" stroke="#d966ff" strokeWidth="1.2" opacity="0.4" />
            <line x1="5" y1="45" x2="95" y2="45" stroke="#d966ff" strokeWidth="1.2" opacity="0.4" />
            <ellipse cx="50" cy="45" rx="10" ry="7" fill="rgba(57,255,20,0.05)" stroke="rgba(57,255,20,0.15)" strokeWidth="0.5" />
          </svg>

          {BUILDINGS.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelected(selected?.id === b.id ? null : b)}
              aria-label={b.name}
              style={{ position: "absolute", left: `${b.x}%`, top: `${b.y}%`, transform: "translate(-50%,-50%)", background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}
            >
              <div style={{ width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: selected?.id === b.id ? `${b.color}25` : "rgba(0,0,0,0.8)", border: `2px solid ${selected?.id === b.id ? b.color : b.color + "50"}`, boxShadow: selected?.id === b.id ? `0 0 16px ${b.color}60` : "none", transition: "all 0.2s" }}>
                {b.icon}
              </div>
              <span style={{ fontSize: 8, color: selected?.id === b.id ? b.color : "rgba(255,255,255,0.5)", fontFamily: FONT.display, fontWeight: 700, textAlign: "center", maxWidth: 55, lineHeight: 1.2, background: "rgba(0,0,0,0.7)", padding: "1px 4px", borderRadius: 4 }}>
                {b.name.split(" ").slice(0, 2).join(" ")}
              </span>
            </button>
          ))}

          <div style={{ position: "absolute", bottom: 10, left: 10, fontSize: 10, padding: "4px 8px", borderRadius: 6, background: "rgba(0,0,0,0.7)", color: "rgba(255,255,255,0.4)", fontFamily: FONT.mono, border: "1px solid rgba(255,255,255,0.08)" }}>
            📍 {BUILDINGS.length} locations
          </div>
        </div>

        {/* Info panel */}
        <div>
          {selected ? (
            <div className="card-glow" style={{ padding: 24, height: "100%" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>{selected.icon}</div>
              <h3 style={{ fontFamily: FONT.display, fontWeight: 900, fontSize: 18, color: selected.color, marginBottom: 8, textShadow: `0 0 20px ${selected.color}60` }}>{selected.name}</h3>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 16 }}>{selected.desc}</p>
              <div style={{ fontSize: 10, padding: "6px 10px", borderRadius: 8, background: `${selected.color}10`, color: selected.color, fontFamily: FONT.mono, letterSpacing: 1, display: "inline-block" }}>
                COORD {selected.x}, {selected.y}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {BUILDINGS.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelected(b)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, background: "#0b0714", border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", transition: "all 0.2s", textAlign: "left" }}
                >
                  <span style={{ fontSize: 16 }}>{b.icon}</span>
                  <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{b.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
