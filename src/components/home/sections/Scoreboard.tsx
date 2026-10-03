"use client";

import React from "react";
import { TEAMS } from "../data";
import { Spark } from "../decor";

export function Scoreboard() {
  const live = TEAMS.some((t) => t.score !== null);

  return (
    <section id="scoreboard" className="vx-sec vx-score" aria-labelledby="scoreboard-title">
      <div className="vx-dots" />
      <Spark size={24} color="var(--vx-orange)" style={{ left: "6%", bottom: "14%" }} />

      <div className="vx-inner">
        <div className="vx-score-head vx-rise">
          <h2 id="scoreboard-title" className="vx-h2">Scoreboard</h2>
          <span className="vx-pill vx-mono">
            <i aria-hidden />
            {live ? "LIVE NOW" : "LIVE FROM 28 NOV"}
          </span>
        </div>
        <p className="vx-lead vx-rise">
          {live
            ? "Real-time standings across all orientation teams."
            : "The scoreboard goes live when the game begins. Here are the teams you'll be cheering for."}
        </p>

        <ol className="vx-board vx-rise-2">
          {TEAMS.map((team, idx) => (
            <li key={team.id} className="vx-card vx-team">
              <span className="vx-team-rk vx-mono">0{idx + 1}</span>
              <i className="vx-team-sw" style={{ background: team.color }} aria-hidden />
              <b>{team.name}</b>
              <span className="vx-num" data-live={team.score !== null}>
                {team.score ?? "—"}
                {team.score === null && <span className="vx-sr">No score yet</span>}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
