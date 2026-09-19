"use client";

import { FONT } from "../data";
import { Countdown, MarqueeBanner } from "../decor";

export function OverviewSection() {
  return (
    <section
      id="overview"
      style={{
        scrollMarginTop: 64,
        position: "relative",
        padding: "80px 20px 72px",
        background: "transparent",
      }}
    >
      <div style={{ maxWidth: 880, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 2 }}>
        <h2
          style={{
            fontFamily: FONT.display,
            fontWeight: 900,
            fontSize: "clamp(36px, 7vw, 64px)",
            lineHeight: 1,
            marginBottom: 16,
          }}
        >
          <span className="text-holo">OVER</span>
          <span style={{ color: "#fff" }}>VIEW</span>
        </h2>

        <p
          style={{
            fontFamily: FONT.body,
            fontSize: "clamp(15px, 2.5vw, 18px)",
            color: "rgba(255, 255, 255, 0.7)",
            maxWidth: 580,
            margin: "0 auto 36px",
            lineHeight: 1.6,
          }}
        >
          XMUM Orientation 2026 brings together freshies, facilitators, and game masters across campus for two days of shared challenges and discovery.
        </p>

        {/* Countdown Timer */}
        <div style={{ marginBottom: 14, fontSize: 11, color: "rgba(255, 255, 255, 0.4)", fontFamily: FONT.mono, letterSpacing: 3 }}>
          ORIENTATION BEGINS IN
        </div>
        <div style={{ marginBottom: 44 }}>
          <Countdown />
        </div>
      </div>

      <div style={{ margin: "20px 0 44px" }}>
        <MarqueeBanner />
      </div>

      {/* Information Board: Glass metrics bar floating inside the world */}
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "0 20px", position: "relative", zIndex: 2 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: 16,
            padding: "28px 24px",
            borderRadius: 20,
            background: "rgba(5, 1, 12, 0.25)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            backdropFilter: "blur(6px)",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
          }}
        >
          <div style={{ textAlign: "center", padding: "12px 8px" }}>
            <div
              style={{
                fontFamily: FONT.display,
                fontWeight: 900,
                fontSize: "clamp(24px, 4vw, 36px)",
                color: "#12e6ff",
                textShadow: "0 0 20px rgba(18, 230, 255, 0.4)",
              }}
            >
              28–29 NOV
            </div>
            <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.45)", fontFamily: FONT.mono, letterSpacing: 2, marginTop: 6, textTransform: "uppercase" }}>
              Main D-Day
            </div>
          </div>

          <div style={{ textAlign: "center", padding: "12px 8px" }}>
            <div
              style={{
                fontFamily: FONT.display,
                fontWeight: 900,
                fontSize: "clamp(28px, 5vw, 40px)",
                color: "#a437ff",
                textShadow: "0 0 20px rgba(164, 55, 255, 0.4)",
              }}
            >
              2 DAYS
            </div>
            <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.45)", fontFamily: FONT.mono, letterSpacing: 2, marginTop: 6, textTransform: "uppercase" }}>
              Full Program
            </div>
          </div>

          <div style={{ textAlign: "center", padding: "12px 8px" }}>
            <div
              style={{
                fontFamily: FONT.display,
                fontWeight: 900,
                fontSize: "clamp(28px, 5vw, 40px)",
                color: "#ff2e8b",
                textShadow: "0 0 20px rgba(255, 46, 139, 0.4)",
              }}
            >
              TBA
            </div>
            <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.45)", fontFamily: FONT.mono, letterSpacing: 2, marginTop: 6, textTransform: "uppercase" }}>
              Orientation Teams
            </div>
          </div>

          <div style={{ textAlign: "center", padding: "12px 8px" }}>
            <div
              style={{
                fontFamily: FONT.display,
                fontWeight: 900,
                fontSize: "clamp(28px, 5vw, 40px)",
                color: "#39ff14",
                textShadow: "0 0 20px rgba(57, 255, 20, 0.4)",
              }}
            >
              10
            </div>
            <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.45)", fontFamily: FONT.mono, letterSpacing: 2, marginTop: 6, textTransform: "uppercase" }}>
              Committees
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
