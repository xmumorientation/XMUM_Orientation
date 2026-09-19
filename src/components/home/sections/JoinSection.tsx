"use client";

import Link from "next/link";
import { FONT } from "../data";

export function JoinSection() {
  return (
    <section
      id="join"
      style={{
        scrollMarginTop: 64,
        position: "relative",
        padding: "120px 20px 110px",
        textAlign: "center",
        background: "transparent",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto", position: "relative", zIndex: 2 }}>
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: 12,
            color: "rgba(255, 255, 255, 0.45)",
            letterSpacing: 4,
            textTransform: "uppercase",
            marginBottom: 20,
          }}
        >
          READY TO ENTER?
        </div>

        <h2
          style={{
            fontFamily: FONT.display,
            fontWeight: 900,
            fontSize: "clamp(52px, 12vw, 100px)",
            lineHeight: 0.95,
            letterSpacing: -1,
            marginBottom: 20,
            textShadow: "0 0 50px rgba(18, 230, 255, 0.35)",
          }}
        >
          <span className="text-holo">VORTEXA</span>
        </h2>

        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: "clamp(13px, 2.5vw, 16px)",
            color: "#12e6ff",
            letterSpacing: 3,
            textTransform: "uppercase",
            marginBottom: 20,
            textShadow: "0 0 20px rgba(18, 230, 255, 0.5)",
          }}
        >
          XMUM ORIENTATION 2026
        </div>

        <p
          style={{
            fontFamily: FONT.body,
            fontSize: "clamp(16px, 2.8vw, 20px)",
            color: "rgba(255, 255, 255, 0.72)",
            maxWidth: 500,
            margin: "0 auto 48px",
            lineHeight: 1.6,
          }}
        >
          &ldquo;One ticket, One Ride, Discover adventure Inside.&rdquo;
        </p>

        <div>
          <Link
            href="/login"
            style={{
              display: "inline-block",
              padding: "18px 48px",
              borderRadius: 50,
              fontFamily: FONT.display,
              fontWeight: 900,
              fontSize: 18,
              letterSpacing: 1.5,
              background: "linear-gradient(135deg, #ff2e8b, #a437ff, #12e6ff)",
              color: "#000",
              textDecoration: "none",
              boxShadow: "0 0 50px rgba(164, 55, 255, 0.55)",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
          >
            JOIN THE GAME ★
          </Link>
        </div>
      </div>
    </section>
  );
}
