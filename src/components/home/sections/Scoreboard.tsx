"use client";

import React from "react";
import { TEAMS } from "../data";

export function Scoreboard() {
  const live = TEAMS.some((t) => t.score !== null);

  return (
    <section id="scoreboard" className="vx-sec vx-score" aria-labelledby="scoreboard-title">
      <div className="vx-dots" />

      <div className="vx-inner">
        <div className="vx-score-head vx-rise">
          <h2 id="scoreboard-title" className="vx-h2">Scoreboard</h2>
          <span className="vx-pill vx-mono">
            <i aria-hidden />
            {live ? "LIVE NOW" : "LIVE FROM 28 NOV"}
          </span>
        </div>

        {live ? (
          <>
            <p className="vx-lead vx-rise">Real-time standings across all orientation teams.</p>
            <ol className="vx-board vx-rise-2">
              {TEAMS.map((team, idx) => (
                <li key={team.id} className="vx-card vx-team">
                  <span className="vx-team-rk vx-mono">{String(idx + 1).padStart(2, "0")}</span>
                  <i className="vx-team-sw" style={{ background: team.color }} aria-hidden />
                  <b>{team.name}</b>
                  <span className="vx-num" data-live="true">
                    {team.score}
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <div className="vx-coming vx-rise-2" style={{ maxWidth: 520 }}>
            <p className="vx-coming-title">Team rankings coming soon</p>
            <p className="vx-mono vx-coming-meta">Games begin on 28 Nov 2026</p>
            <p className="vx-coming-note">
              See your team’s score and ranking here once the games begin.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
