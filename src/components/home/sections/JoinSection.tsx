"use client";

export function JoinSection({ onJoin }: { onJoin: () => void }) {
  return (
    <section id="join" className="vx-sec vx-join" aria-labelledby="join-title">
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
