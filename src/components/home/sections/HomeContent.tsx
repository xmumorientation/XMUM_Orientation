"use client";

import { FONT, TEAMS, scrollToSection } from "../data";
import { Blob, Countdown, HoloSticker, MarqueeBanner, StarSparkle } from "../decor";

/**
 * The first content beat after the cinematic entry: a compact welcome, live
 * countdown, headline stats, current leaders, and the live-event alert.
 */
export function HomeContent() {
  const leaderTop = [...TEAMS].sort((a, b) => b.score - a.score).slice(0, 3);

  return (
    <section id="home" style={{ scrollMarginTop: 64 }}>
      {/* Welcome band */}
      <div style={{ position: "relative", overflow: "hidden", padding: "72px 20px 40px", textAlign: "center" }}>
        <Blob color="#7b2fff" style={{ width: 460, height: 460, top: -140, right: -120 }} />
        <Blob color="#00cfff" style={{ width: 360, height: 360, bottom: -120, left: "22%" }} />
        <HoloSticker emoji="🎡" deg={-10} style={{ width: 64, height: 64, top: "16%", left: "8%" }} />
        <HoloSticker emoji="🎮" deg={9} style={{ width: 60, height: 60, top: "22%", right: "10%" }} />
        <StarSparkle size={22} color="#ff3cac" style={{ position: "absolute", top: "30%", left: "24%", opacity: 0.6 }} />

        <div style={{ position: "relative", zIndex: 2, maxWidth: 720, margin: "0 auto" }}>
          <div
            style={{
              display: "inline-block",
              padding: "6px 18px",
              borderRadius: 100,
              marginBottom: 20,
              background: "rgba(255,60,172,0.12)",
              border: "1px solid rgba(255,60,172,0.35)",
              color: "#ff3cac",
              fontFamily: FONT.mono,
              fontSize: 11,
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            ◉ LIVE — SEP 18–20, 2026
          </div>
          <h1 style={{ fontFamily: FONT.display, fontWeight: 900, fontSize: "clamp(40px, 9vw, 84px)", lineHeight: 0.95, letterSpacing: -1, marginBottom: 18 }}>
            <span className="text-holo">WELCOME TO</span>
            <br />
            <span style={{ color: "#fff" }}>THE PARK</span>
          </h1>
          <p style={{ fontFamily: FONT.body, fontSize: "clamp(15px, 3vw, 19px)", color: "rgba(255,255,255,0.6)", maxWidth: 520, margin: "0 auto 30px", lineHeight: 1.6 }}>
            Three days. Six teams. One legendary beginning. This is University Orientation 2026 — step inside the neon carnival.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginBottom: 48 }}>
            <button
              onClick={() => scrollToSection("scoreboard")}
              style={{ padding: "14px 30px", borderRadius: 50, border: "none", cursor: "pointer", fontFamily: FONT.display, fontWeight: 800, fontSize: 14, letterSpacing: 1, background: "linear-gradient(135deg,#ff3cac,#d966ff,#00cfff)", color: "#000", boxShadow: "0 0 30px rgba(217,102,255,0.5)" }}
            >
              VIEW SCOREBOARD ★
            </button>
            <button
              onClick={() => scrollToSection("games")}
              style={{ padding: "14px 30px", borderRadius: 50, border: "2px solid rgba(255,255,255,0.2)", cursor: "pointer", fontFamily: FONT.display, fontWeight: 800, fontSize: 14, letterSpacing: 1, background: "transparent", color: "#fff" }}
            >
              JOIN THE GAME
            </button>
          </div>
          <div style={{ marginBottom: 10, fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: FONT.mono, letterSpacing: 3 }}>
            ORIENTATION BEGINS IN
          </div>
          <Countdown />
        </div>
      </div>

      <MarqueeBanner />

      {/* Stats */}
      <div style={{ padding: "56px 20px", maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
          {[
            { label: "New Students", val: "1,240", emoji: "👤", color: "#00cfff" },
            { label: "Teams", val: "6", emoji: "🏳️", color: "#d966ff" },
            { label: "Events", val: "14", emoji: "📋", color: "#ff3cac" },
            { label: "Committees", val: "6", emoji: "👥", color: "#39ff14" },
          ].map((s) => (
            <div key={s.label} className="card-glow" style={{ padding: "26px 18px", textAlign: "center" }}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>{s.emoji}</div>
              <div style={{ fontFamily: FONT.display, fontWeight: 900, fontSize: 34, color: s.color, textShadow: `0 0 20px ${s.color}60` }}>{s.val}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Current leaders */}
      <div style={{ padding: "0 20px 56px", maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontFamily: FONT.display, fontWeight: 900, fontSize: 30, marginBottom: 22 }}>
          <span className="text-holo">🏆 Current Leaders</span>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          {leaderTop.map((team, i) => (
            <div key={team.id} className="card-glow" style={{ padding: 24, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 12, right: 16, fontFamily: FONT.display, fontWeight: 900, fontSize: 60, color: team.color, opacity: 0.12 }}>#{i + 1}</div>
              <div style={{ fontSize: 34, marginBottom: 8 }}>{team.emoji}</div>
              <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 16, color: team.color, marginBottom: 4 }}>{team.name}</div>
              <div style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 26, color: "#fff" }}>
                {team.score.toLocaleString()}
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginLeft: 4 }}>pts</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live alert */}
      <div style={{ padding: "0 20px 72px", maxWidth: 900, margin: "0 auto" }}>
        <div style={{ borderRadius: 20, padding: "20px 26px", display: "flex", alignItems: "center", gap: 18, background: "linear-gradient(135deg,rgba(255,60,172,0.1),rgba(255,107,53,0.08))", border: "1px solid rgba(255,60,172,0.3)", flexWrap: "wrap" }}>
          <div className="pulse-bright" style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,60,172,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🔴</div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 10, color: "#ff3cac", letterSpacing: 3, marginBottom: 4 }}>NOW LIVE</div>
            <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 18, color: "#fff" }}>Campus Scavenger Hunt</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>142 participants active · 500 pts up for grabs</div>
          </div>
          <button
            onClick={() => scrollToSection("games")}
            style={{ padding: "12px 22px", borderRadius: 50, border: "none", cursor: "pointer", fontFamily: FONT.display, fontWeight: 800, fontSize: 13, background: "linear-gradient(135deg,#ff3cac,#ff6b35)", color: "#000", whiteSpace: "nowrap" }}
          >
            JOIN →
          </button>
        </div>
      </div>
    </section>
  );
}
