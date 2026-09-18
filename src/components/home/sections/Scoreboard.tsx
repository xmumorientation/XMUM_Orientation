"use client";

import { FONT, TEAMS } from "../data";

export function Scoreboard() {
  const sorted = [...TEAMS].sort((a, b) => b.score - a.score);
  const maxScore = sorted[0].score;
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <section id="scoreboard" style={{ scrollMarginTop: 64, padding: "56px 20px 72px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontFamily: FONT.display, fontWeight: 900, fontSize: "clamp(40px, 8vw, 64px)", lineHeight: 1 }}>
          <span className="text-holo">SCORE</span>
          <span style={{ color: "#fff" }}>BOARD</span>
        </h2>
        <div style={{ fontFamily: FONT.mono, fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: 3, marginTop: 8 }}>UPDATED LIVE · DAY 2 OF 3</div>
      </div>

      {/* Podium */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 12, marginBottom: 44, height: 170 }}>
        {[sorted[1], sorted[0], sorted[2]].map((team, idx) => {
          const hs = [120, 152, 100];
          const pos = [2, 1, 3];
          return (
            <div key={team.id} style={{ flex: 1, maxWidth: 140, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{team.emoji}</div>
              <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 12, color: team.color, marginBottom: 6, textAlign: "center" }}>{team.name.replace("Team ", "")}</div>
              <div style={{ width: "100%", height: hs[idx], borderRadius: "12px 12px 0 0", background: `${team.color}18`, border: `2px solid ${team.color}50`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT.display, fontWeight: 900, fontSize: 28, color: team.color, boxShadow: `0 0 20px ${team.color}30` }}>
                {pos[idx]}
              </div>
            </div>
          );
        })}
      </div>

      {/* Ranked list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sorted.map((team, i) => (
          <div key={team.id} className="card-glow" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 24, width: 32, textAlign: "center" }}>{medals[i] ?? `#${i + 1}`}</div>
            <div style={{ fontSize: 24 }}>{team.emoji}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 14, color: team.color, marginBottom: 6 }}>{team.name}</div>
              <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 3, width: `${(team.score / maxScore) * 100}%`, background: `linear-gradient(90deg, ${team.color}88, ${team.color})`, boxShadow: `0 0 8px ${team.color}80` }} />
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: FONT.mono }}>
                <span>{team.members} members</span>
                <span>{team.wins}W</span>
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 22, color: team.color }}>{team.score.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>points</div>
            </div>
          </div>
        ))}
      </div>

      {/* Breakdown */}
      <div className="card-glow" style={{ marginTop: 32, padding: 24 }}>
        <h3 className="text-holo-cool" style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 18, marginBottom: 16 }}>Points Breakdown</h3>
        {[
          { event: "Tower Build", winner: "Team Aquila", pts: 350, color: "#00cfff" },
          { event: "Morning Cheer", winner: "Team Vega", pts: 200, color: "#d966ff" },
          { event: "Registration Sprint", winner: "Team Orion", pts: 150, color: "#ff3cac" },
          { event: "Attendance Bonus", winner: "All Teams", pts: 100, color: "#39ff14" },
        ].map((row) => (
          <div key={row.event} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 13 }}>
            <span style={{ color: "rgba(255,255,255,0.7)" }}>{row.event}</span>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: FONT.mono }}>{row.winner}</span>
            <span style={{ fontFamily: FONT.mono, fontWeight: 700, color: row.color }}>+{row.pts}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
