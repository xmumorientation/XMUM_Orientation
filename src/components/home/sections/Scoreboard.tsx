"use client";

import React from "react";
import { FONT, TEAMS } from "../data";

export function Scoreboard() {
  return (
    <section
      id="scoreboard"
      style={{
        scrollMarginTop: 64,
        position: "relative",
        padding: "84px 20px 76px",
        background: "transparent",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 2 }}>
        <h2
          style={{
            fontFamily: FONT.display,
            fontWeight: 900,
            fontSize: "clamp(36px, 7vw, 64px)",
            lineHeight: 1,
            marginBottom: 16,
          }}
        >
          <span className="text-holo">SCORE</span>
          <span style={{ color: "#fff" }}>BOARD</span>
        </h2>

        <p
          style={{
            fontFamily: FONT.body,
            fontSize: "clamp(15px, 2.5vw, 18px)",
            color: "rgba(255, 255, 255, 0.7)",
            maxWidth: 520,
            margin: "0 auto 36px",
            lineHeight: 1.6,
          }}
        >
          Real-time standings across all orientation houses and teams.
        </p>

        {/* Futuristic Leaderboard Display Board with translucent glass */}
        <div
          style={{
            borderRadius: 24,
            padding: "36px 24px",
            background: "rgba(5, 1, 12, 0.30)",
            border: "1px solid rgba(18, 230, 255, 0.18)",
            boxShadow: "0 4px 24px rgba(0, 0, 0, 0.25), 0 0 30px rgba(18, 230, 255, 0.05)",
            backdropFilter: "blur(8px)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Neon Header Status */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 18px",
              borderRadius: 50,
              background: "rgba(18, 230, 255, 0.08)",
              border: "1px solid rgba(18, 230, 255, 0.25)",
              marginBottom: 18,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#12e6ff",
                boxShadow: "0 0 10px #12e6ff",
              }}
            />
            <span
              style={{
                fontFamily: FONT.mono,
                fontSize: 11,
                color: "#12e6ff",
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              Standby · System Initialised
            </span>
          </div>

          <h3
            style={{
              fontFamily: FONT.display,
              fontWeight: 900,
              fontSize: "clamp(19px, 3.8vw, 26px)",
              color: "#fff",
              letterSpacing: 1,
              marginBottom: 8,
            }}
          >
            THE SCOREBOARD WILL GO LIVE WHEN THE GAME BEGINS
          </h3>

          <p
            style={{
              fontFamily: FONT.mono,
              fontSize: 12,
              color: "rgba(255, 255, 255, 0.45)",
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 32,
            }}
          >
            D-Day: 28–29 November 2026 · Live Telemetry
          </p>

          {/* Team Standing Preview Roster */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 12,
              textAlign: "left",
            }}
          >
            {TEAMS.map((team, idx) => (
              <div
                key={team.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 18px",
                  borderRadius: 14,
                  background: "rgba(255, 255, 255, 0.03)",
                  border: `1px solid ${team.color}25`,
                  backdropFilter: "blur(8px)",
                  transition: "border-color 0.2s, transform 0.2s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{
                      fontFamily: FONT.mono,
                      fontWeight: 700,
                      fontSize: 15,
                      color: "rgba(255, 255, 255, 0.35)",
                      width: 20,
                    }}
                  >
                    0{idx + 1}
                  </span>
                  <div>
                    <div
                      style={{
                        fontFamily: FONT.display,
                        fontWeight: 800,
                        fontSize: 14,
                        color: "#fff",
                      }}
                    >
                      {team.name}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        fontFamily: FONT.mono,
                        color: team.color,
                        letterSpacing: 1,
                        marginTop: 2,
                      }}
                    >
                      READY
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: team.color,
                    boxShadow: `0 0 10px ${team.color}80`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
