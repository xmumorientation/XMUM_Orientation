"use client";

import { useState } from "react";
import { FONT, GAMES, QUIZ } from "../data";

function QuizGame() {
  const [step, setStep] = useState<"idle" | "playing" | "done">("idle");
  const [qIdx, setQIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  const q = QUIZ[qIdx];

  const choose = (i: number) => {
    if (answered) return;
    setSelected(i);
    setAnswered(true);
    if (i === q.ans) setScore((s) => s + 60);
  };
  const next = () => {
    if (qIdx + 1 >= QUIZ.length) {
      setStep("done");
      return;
    }
    setQIdx((i) => i + 1);
    setSelected(null);
    setAnswered(false);
  };

  if (step === "idle")
    return (
      <div className="card-glow" style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>❓</div>
        <h3 className="text-holo-cool" style={{ fontFamily: FONT.display, fontWeight: 900, fontSize: 24, marginBottom: 12 }}>Trivia Blitz</h3>
        <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 24, fontSize: 14 }}>5 questions about campus life. Earn up to 300 pts for your team!</p>
        <button onClick={() => setStep("playing")} style={{ padding: "14px 36px", borderRadius: 50, border: "none", cursor: "pointer", fontFamily: FONT.display, fontWeight: 800, fontSize: 14, background: "linear-gradient(135deg,#d966ff,#00cfff)", color: "#000" }}>
          START QUIZ ★
        </button>
      </div>
    );

  if (step === "done")
    return (
      <div className="card-glow" style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
        <h3 className="text-holo" style={{ fontFamily: FONT.display, fontWeight: 900, fontSize: 28, marginBottom: 8 }}>Quiz Complete!</h3>
        <div style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 48, color: "#ff3cac", marginBottom: 4 }}>{score}</div>
        <div style={{ color: "rgba(255,255,255,0.4)", marginBottom: 24, fontSize: 14 }}>out of 300 points</div>
        <button
          onClick={() => {
            setStep("idle");
            setQIdx(0);
            setScore(0);
            setSelected(null);
            setAnswered(false);
          }}
          style={{ padding: "12px 28px", borderRadius: 50, border: "2px solid #d966ff", cursor: "pointer", fontFamily: FONT.display, fontWeight: 800, fontSize: 13, background: "transparent", color: "#d966ff" }}
        >
          PLAY AGAIN
        </button>
      </div>
    );

  return (
    <div className="card-glow" style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: 12, fontFamily: FONT.mono, color: "rgba(255,255,255,0.4)" }}>
        <span>Q {qIdx + 1} / {QUIZ.length}</span>
        <span style={{ color: "#d966ff" }}>{score} pts</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", marginBottom: 20 }}>
        <div style={{ height: "100%", borderRadius: 2, width: `${(qIdx / QUIZ.length) * 100}%`, background: "linear-gradient(90deg,#d966ff,#00cfff)", transition: "width 0.4s" }} />
      </div>
      <p style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 17, color: "#fff", marginBottom: 16 }}>{q.q}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {q.opts.map((opt, i) => {
          let bg = "rgba(255,255,255,0.05)";
          let col = "rgba(255,255,255,0.8)";
          let border = "1px solid rgba(255,255,255,0.08)";
          if (answered && i === q.ans) {
            bg = "rgba(57,255,20,0.12)";
            col = "#39ff14";
            border = "1px solid #39ff1440";
          } else if (answered && i === selected) {
            bg = "rgba(255,60,172,0.12)";
            col = "#ff3cac";
            border = "1px solid #ff3cac40";
          }
          return (
            <button key={i} onClick={() => choose(i)} style={{ textAlign: "left", padding: "12px 16px", borderRadius: 12, border, background: bg, color: col, fontFamily: FONT.body, fontSize: 14, cursor: answered ? "default" : "pointer", transition: "all 0.2s" }}>
              <span style={{ fontFamily: FONT.mono, color: "rgba(255,255,255,0.3)", marginRight: 10, fontSize: 12 }}>{String.fromCharCode(65 + i)}.</span>
              {opt}
            </button>
          );
        })}
      </div>
      {answered && (
        <button onClick={next} style={{ width: "100%", marginTop: 16, padding: "14px", borderRadius: 50, border: "none", cursor: "pointer", fontFamily: FONT.display, fontWeight: 800, fontSize: 14, background: "linear-gradient(135deg,#d966ff,#00cfff)", color: "#000" }}>
          {qIdx + 1 >= QUIZ.length ? "SEE RESULTS →" : "NEXT →"}
        </button>
      )}
    </div>
  );
}

function ScoreCalculator() {
  const [wins, setWins] = useState(3);
  const [attend, setAttend] = useState(2);
  const [bonus, setBonus] = useState(1);
  const total = wins * 350 + attend * 80 + bonus * 200;

  const rows = [
    { label: "Event Wins (×350 pts)", val: wins, set: setWins, max: 8, color: "#ff3cac" },
    { label: "Full Attendance Days (×80 pts)", val: attend, set: setAttend, max: 3, color: "#f9d342" },
    { label: "Bonus Challenges (×200 pts)", val: bonus, set: setBonus, max: 5, color: "#39ff14" },
  ];

  return (
    <div className="card-glow" style={{ padding: 24 }}>
      <h3 className="text-holo-warm" style={{ fontFamily: FONT.display, fontWeight: 900, fontSize: 20, marginBottom: 6 }}>🧮 Score Calculator</h3>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>Estimate your team&apos;s total points.</p>
      {rows.map((r) => (
        <div key={r.label} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
            <span>{r.label}</span>
            <span style={{ fontFamily: FONT.mono, color: r.color, fontWeight: 700 }}>{r.val}</span>
          </div>
          <input type="range" min={0} max={r.max} value={r.val} onChange={(e) => r.set(Number(e.target.value))} style={{ width: "100%", accentColor: r.color }} />
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderRadius: 14, background: "rgba(217,102,255,0.1)", border: "1px solid rgba(217,102,255,0.25)", marginTop: 8 }}>
        <span style={{ fontFamily: FONT.display, fontWeight: 800, color: "#fff" }}>Estimated Total</span>
        <span className="text-holo" style={{ fontFamily: FONT.mono, fontWeight: 900, fontSize: 28 }}>{total.toLocaleString()}</span>
      </div>
    </div>
  );
}

export function Games() {
  const statusStyle: Record<string, { color: string; bg: string }> = {
    LIVE: { color: "#ff3cac", bg: "rgba(255,60,172,0.12)" },
    UPCOMING: { color: "#d966ff", bg: "rgba(217,102,255,0.1)" },
    COMPLETED: { color: "rgba(255,255,255,0.3)", bg: "rgba(255,255,255,0.05)" },
  };

  return (
    <section id="games" style={{ scrollMarginTop: 64, padding: "56px 20px 72px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontFamily: FONT.display, fontWeight: 900, fontSize: "clamp(40px, 8vw, 64px)", lineHeight: 1 }}>
          <span className="text-holo">GAME</span>
          <span style={{ color: "#fff" }}>S</span>
        </h2>
        <div style={{ fontFamily: FONT.mono, fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: 3, marginTop: 8 }}>4 EVENTS · 1,550 PTS TOTAL</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 40 }}>
        {GAMES.map((game) => {
          const s = statusStyle[game.status];
          return (
            <div key={game.id} className="card-glow" style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{ fontSize: 32, flexShrink: 0 }}>{game.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 16, color: "#fff" }}>{game.name}</span>
                    <span style={{ padding: "3px 10px", borderRadius: 50, fontSize: 10, fontWeight: 700, fontFamily: FONT.mono, letterSpacing: 1, color: s.color, background: s.bg }}>{game.status}</span>
                  </div>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.5, marginBottom: 8 }}>{game.desc}</p>
                  <div style={{ display: "flex", gap: 16, fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: FONT.mono }}>
                    <span>{game.type}</span>
                    <span style={{ color: "#f9d342" }}>★ {game.points} pts</span>
                    {game.players > 0 && <span>👤 {game.players}</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <h3 style={{ fontFamily: FONT.display, fontWeight: 900, fontSize: 20, marginBottom: 16 }}>
        <span className="text-holo-cool">🎮 Play Now: Trivia Blitz</span>
      </h3>
      <QuizGame />
      <div style={{ marginTop: 24 }}>
        <ScoreCalculator />
      </div>
    </section>
  );
}
