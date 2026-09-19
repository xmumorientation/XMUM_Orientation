"use client";

import React, { useState } from "react";
import { FONT, COMMITTEES, type Committee } from "../data";
import {
  Code,
  Calendar,
  Briefcase,
  Users,
  Gamepad2,
  Megaphone,
  Wallet,
  FileText,
  Palette,
  Camera,
} from "lucide-react";

const COMMITTEE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Code,
  Calendar,
  Briefcase,
  Users,
  Gamepad2,
  Megaphone,
  Wallet,
  FileText,
  Palette,
  Camera,
};

export function Committees() {
  const [activeCommittee, setActiveCommittee] = useState<Committee | null>(null);

  return (
    <section
      id="committees"
      style={{
        scrollMarginTop: 64,
        position: "relative",
        padding: "84px 20px 80px",
        background: "transparent",
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto", position: "relative", zIndex: 2 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <h2
            style={{
              fontFamily: FONT.display,
              fontWeight: 900,
              fontSize: "clamp(36px, 7vw, 64px)",
              lineHeight: 1,
              marginBottom: 16,
            }}
          >
            <span className="text-holo">COMMIT</span>
            <span style={{ color: "#fff" }}>TEES</span>
          </h2>
          <div
            style={{
              fontFamily: FONT.mono,
              fontSize: 11,
              color: "rgba(255, 255, 255, 0.45)",
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            THE CREW BEHIND VORTEXA · 10 TEAMS
          </div>
        </div>

        {/* Committee Grid: Restrained credits aesthetic with translucent glass */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: 14,
            marginBottom: 28,
          }}
        >
          {COMMITTEES.map((c) => {
            const Icon = COMMITTEE_ICONS[c.icon] || Users;
            const isSelected = activeCommittee?.id === c.id;

            return (
              <button
                key={c.id}
                onClick={() => setActiveCommittee(isSelected ? null : c)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "22px 14px",
                  borderRadius: 16,
                  cursor: "pointer",
                  background: isSelected ? `rgba(${c.color === "#12e6ff" ? "18,230,255" : "164,55,255"}, 0.14)` : "rgba(11, 7, 24, 0.42)",
                  border: isSelected ? `1.5px solid ${c.color}` : "1px solid rgba(255, 255, 255, 0.06)",
                  boxShadow: isSelected ? `0 0 25px ${c.color}35` : "0 4px 20px rgba(0, 0, 0, 0.25)",
                  backdropFilter: "blur(12px)",
                  transition: "all 0.2s ease",
                  textAlign: "center",
                  outline: "none",
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 12,
                    background: `${c.color}15`,
                    color: c.color,
                    border: `1px solid ${c.color}40`,
                    boxShadow: `0 0 14px ${c.color}20`,
                  }}
                >
                  <Icon size={20} />
                </div>

                <div
                  style={{
                    fontFamily: FONT.display,
                    fontWeight: 900,
                    fontSize: 15,
                    color: "#fff",
                    marginBottom: 4,
                  }}
                >
                  {c.name}
                </div>

                <div
                  style={{
                    fontFamily: FONT.body,
                    fontSize: 11,
                    color: "rgba(255, 255, 255, 0.48)",
                    lineHeight: 1.3,
                  }}
                >
                  {c.fullName}
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail Panel with translucent glass */}
        {activeCommittee && (
          <div
            style={{
              padding: "28px 32px",
              borderRadius: 20,
              background: "rgba(11, 7, 24, 0.55)",
              border: `1px solid ${activeCommittee.color}40`,
              boxShadow: `0 8px 32px rgba(0, 0, 0, 0.4), 0 0 35px ${activeCommittee.color}20`,
              backdropFilter: "blur(16px)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div
                  style={{
                    fontFamily: FONT.display,
                    fontWeight: 900,
                    fontSize: 22,
                    color: activeCommittee.color,
                    marginBottom: 6,
                  }}
                >
                  {activeCommittee.name} · {activeCommittee.fullName}
                </div>
                <p
                  style={{
                    fontFamily: FONT.body,
                    fontSize: 14,
                    color: "rgba(255, 255, 255, 0.8)",
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {activeCommittee.desc}
                </p>
              </div>

              <div style={{ display: "flex", gap: 24, flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: 10, fontFamily: FONT.mono, color: "rgba(255, 255, 255, 0.4)", letterSpacing: 2, textTransform: "uppercase" }}>
                    Committee Head
                  </div>
                  <div style={{ fontSize: 14, fontFamily: FONT.mono, color: "#fff", fontWeight: 700, marginTop: 4 }}>
                    {activeCommittee.head || "TBD"}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 10, fontFamily: FONT.mono, color: "rgba(255, 255, 255, 0.4)", letterSpacing: 2, textTransform: "uppercase" }}>
                    Members
                  </div>
                  <div style={{ fontSize: 14, fontFamily: FONT.mono, color: "#fff", fontWeight: 700, marginTop: 4 }}>
                    {activeCommittee.members !== null ? activeCommittee.members : "TBD"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
