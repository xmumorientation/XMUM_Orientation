"use client";

import React from "react";
import { GAME_PHASES } from "../data";
import { Compass, Gamepad2, Coins, Trophy } from "lucide-react";

const PHASE_ICONS: Record<string, React.ReactNode> = {
  Compass: <Compass size={24} />,
  Gamepad2: <Gamepad2 size={24} />,
  Coins: <Coins size={24} />,
  Trophy: <Trophy size={24} />,
};

/** Accent colour + sticker-style gradient per phase, from the brand palette. */
const PHASE_STYLE: Record<string, { color: string; fill: string }> = {
  EXPLORE: { color: "var(--vx-cyan)", fill: "radial-gradient(circle at 30% 30%, #0DFCFD, #0a6f8f)" },
  PLAY: { color: "var(--vx-pink)", fill: "radial-gradient(circle at 30% 30%, #FFB1C1, #FE06AB)" },
  EARN: { color: "var(--vx-orange)", fill: "radial-gradient(circle at 30% 30%, #F2FF0B, #FC9E3D)" },
  COMPETE: { color: "var(--vx-lilac)", fill: "radial-gradient(circle at 30% 30%, #E0B4FC, #8a4fd8)" },
};

export function Games() {
  return (
    <section id="games" className="vx-sec" aria-labelledby="games-title">
      <div className="vx-inner">
        <div className="vx-games-head vx-rise">
          <h2 id="games-title" className="vx-h2">How the game works</h2>
          <p className="vx-lead">What do you actually do during Orientation? Four steps, played as a team.</p>
        </div>

        <ol className="vx-steps vx-rise-2">
          {GAME_PHASES.map((phase, i) => {
            const st = PHASE_STYLE[phase.phase] ?? PHASE_STYLE.EXPLORE;
            return (
              <li key={phase.phase} className="vx-card vx-step">
                <span className="vx-step-no vx-mono" style={{ color: st.color }}>
                  0{i + 1}
                </span>
                <span className="vx-step-ic" style={{ background: st.fill }} aria-hidden>
                  {PHASE_ICONS[phase.icon]}
                </span>
                <b>{phase.label}</b>
                <p>{phase.desc}</p>
              </li>
            );
          })}
        </ol>

        <p className="vx-games-note vx-rise-3">
          Throughout the campus, Game Masters run challenge stations. Freshies team up with facilitators to conquer physical
          and mental challenges, earn tokens and puzzle pieces, and lift their team on the live orientation scoreboard.
        </p>
      </div>
    </section>
  );
}
