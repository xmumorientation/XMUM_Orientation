"use client";

import { Glow, Spark } from "../decor";

export function JoinSection({ onJoin }: { onJoin: () => void }) {
  return (
    <section id="join" className="vx-sec vx-join" aria-labelledby="join-title">
      <div className="vx-dots" />
      <Glow size="min(480px, 90vw)" color="var(--vx-navy)" style={{ left: "8%", top: "14%", opacity: 0.8 }} />
      <Glow size="min(320px, 70vw)" color="var(--vx-pink)" style={{ right: "10%", bottom: "6%" }} />
      <Spark size={30} color="var(--vx-yellow)" style={{ left: "12%", bottom: "18%" }} />
      <Spark size={18} color="var(--vx-cyan)" style={{ right: "14%", top: "18%" }} />

      <div className="vx-inner">
        <div className="vx-ticket vx-pass vx-rise">
          <div className="vx-pass-main">
            <div className="vx-eyebrow">Admit one · Freshie</div>
            <h2 id="join-title" className="vx-pass-title vx-holo">Your ride starts here</h2>
            <p>One ticket, one ride. Sign in to see your team, your game stations and the live score.</p>
            <button type="button" className="vx-btn vx-btn-primary" onClick={onJoin}>
              Join the Game ★
            </button>
          </div>
          <div className="vx-pass-stub vx-mono">
            <span>GATE OPENS</span>
            <b className="vx-num">28 NOV</b>
            <span className="vx-pass-year">2026 · XMUM</span>
          </div>
        </div>
      </div>
    </section>
  );
}
