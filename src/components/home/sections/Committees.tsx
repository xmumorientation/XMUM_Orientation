"use client";

import { useState } from "react";
import { COMMITTEES, FONT, type Committee } from "../data";

export function Committees() {
  const [active, setActive] = useState<Committee | null>(null);

  return (
    <section id="committees" style={{ scrollMarginTop: 64, padding: "56px 20px 72px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontFamily: FONT.display, fontWeight: 900, fontSize: "clamp(36px, 8vw, 64px)", lineHeight: 1 }}>
          <span className="text-holo">COMMIT</span>
          <span style={{ color: "#fff" }}>TEES</span>
        </h2>
        <div style={{ fontFamily: FONT.mono, fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: 3, marginTop: 8 }}>
          6 TEAMS · {COMMITTEES.reduce((a, c) => a + c.members, 0)} MEMBERS TOTAL
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 24 }}>
        {COMMITTEES.map((c) => (
          <button
            key={c.name}
            onClick={() => setActive(active?.name === c.name ? null : c)}
            className="card-glow"
            style={{
              padding: 24,
              textAlign: "left",
              border: "none",
              cursor: "pointer",
              outline: active?.name === c.name ? `2px solid ${c.color}60` : "none",
              outlineOffset: 2,
              boxShadow: active?.name === c.name ? `0 0 30px ${c.color}25` : "none",
              transition: "all 0.2s",
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>{c.icon}</div>
            <div style={{ fontFamily: FONT.display, fontWeight: 900, fontSize: 16, color: c.color, marginBottom: 4, textShadow: `0 0 16px ${c.color}50` }}>{c.name}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 12 }}>{c.head} · {c.members} members</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {c.functions.slice(0, 2).map((f) => (
                <span key={f} style={{ padding: "3px 10px", borderRadius: 50, fontSize: 10, background: `${c.color}12`, color: c.color, border: `1px solid ${c.color}25` }}>{f}</span>
              ))}
            </div>
          </button>
        ))}
      </div>

      {active && (
        <div className="card-glow" style={{ padding: 28 }}>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ fontSize: 48 }}>{active.icon}</div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <h3 style={{ fontFamily: FONT.display, fontWeight: 900, fontSize: 26, color: active.color, marginBottom: 8, textShadow: `0 0 24px ${active.color}60` }}>{active.name}</h3>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.65, marginBottom: 20 }}>{active.desc}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                {active.functions.map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12, background: `${active.color}08`, fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
                    <span style={{ color: active.color, fontSize: 10 }}>✦</span> {f}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: FONT.mono, letterSpacing: 2 }}>
                COMMITTEE HEAD · {active.head.toUpperCase()} · {active.members} MEMBERS
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
