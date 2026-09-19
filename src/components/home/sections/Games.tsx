"use client";

import React from "react";
import { FONT, GAME_PHASES } from "../data";
import { Compass, Gamepad2, Coins, Trophy } from "lucide-react";

const PHASE_ICONS: Record<string, React.ReactNode> = {
  Compass: <Compass size={28} />,
  Gamepad2: <Gamepad2 size={28} />,
  Coins: <Coins size={28} />,
  Trophy: <Trophy size={28} />,
};

const PHASE_COLORS: Record<string, string> = {
  EXPLORE: "#12e6ff",
  PLAY: "#a437ff",
  EARN: "#ff2e8b",
  COMPETE: "#39ff14",
};

export function Games() {
  return (
    <section
      id="games"
      style={{
        scrollMarginTop: 64,
        position: "relative",
        padding: "84px 20px 76px",
        background: "transparent",
      }}
    >
      <div style={{ maxWidth: 840, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 2 }}>
        <h2
          style={{
            fontFamily: FONT.display,
            fontWeight: 900,
            fontSize: "clamp(36px, 7vw, 64px)",
            lineHeight: 1,
            marginBottom: 16,
          }}
        >
          <span className="text-holo">GAME</span>
          <span style={{ color: "#fff" }}>S</span>
        </h2>

        <p
          style={{
            fontFamily: FONT.body,
            fontSize: "clamp(16px, 2.5vw, 20px)",
            color: "rgba(255, 255, 255, 0.7)",
            maxWidth: 560,
            margin: "0 auto 44px",
            lineHeight: 1.6,
          }}
        >
          What do you actually do during Orientation?
        </p>

        {/* Conceptual Journey: EXPLORE → PLAY → EARN → COMPETE */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: 16,
            marginBottom: 44,
          }}
        >
          {GAME_PHASES.map((phase) => {
            const color = PHASE_COLORS[phase.phase] || "#12e6ff";
            return (
              <div
                key={phase.phase}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "26px 16px",
                  borderRadius: 18,
                  background: "rgba(5, 1, 12, 0.28)",
                  border: `1px solid ${color}30`,
                  boxShadow: `0 4px 20px rgba(0, 0, 0, 0.2), 0 0 15px ${color}10`,
                  backdropFilter: "blur(6px)",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                }}
              >
                <div
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 14,
                    background: `${color}15`,
                    border: `1.5px solid ${color}60`,
                    color: color,
                    boxShadow: `0 0 16px ${color}25`,
                  }}
                >
                  {PHASE_ICONS[phase.icon]}
                </div>
                <div
                  style={{
                    fontFamily: FONT.display,
                    fontWeight: 900,
                    fontSize: 17,
                    letterSpacing: 1,
                    color: color,
                    marginBottom: 8,
                  }}
                >
                  {phase.phase}
                </div>
                <p
                  style={{
                    fontFamily: FONT.body,
                    fontSize: 13,
                    color: "rgba(255, 255, 255, 0.7)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  {phase.desc}
                </p>
              </div>
            );
          })}
        </div>

        {/* Narrative Anchor: Floating typography with subtle top accent line */}
        <div
          style={{
            maxWidth: 680,
            margin: "0 auto",
            paddingTop: 28,
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <p
            style={{
              fontFamily: FONT.body,
              fontSize: 15,
              color: "rgba(255, 255, 255, 0.8)",
              lineHeight: 1.7,
              margin: 0,
              textShadow: "0 2px 14px rgba(0, 0, 0, 0.85)",
            }}
          >
            Throughout the campus, Game Masters run challenge stations. Freshies team up with facilitators to conquer physical and mental challenges, earn tokens and puzzle pieces, and elevate their team on the live orientation scoreboard.
          </p>
        </div>
      </div>
    </section>
  );
}
