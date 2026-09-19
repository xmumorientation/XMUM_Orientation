"use client";

import Link from "next/link";
import { FONT } from "../data";

export function WelcomeSection() {
  return (
    <section
      id="welcome"
      style={{
        scrollMarginTop: 64,
        position: "relative",
        padding: "100px 20px 90px",
        background: "transparent",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Central content container floating directly inside the cinematic world */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 780,
          width: "100%",
          textAlign: "center",
          padding: "52px 20px",
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: "6px 20px",
            borderRadius: 100,
            marginBottom: 24,
            background: "rgba(18, 230, 255, 0.1)",
            border: "1px solid rgba(18, 230, 255, 0.3)",
            color: "#12e6ff",
            fontFamily: FONT.mono,
            fontSize: 11,
            letterSpacing: 3,
            textTransform: "uppercase",
            boxShadow: "0 0 16px rgba(18, 230, 255, 0.2)",
          }}
        >
          XMUM ORIENTATION 2026
        </div>

        <h1
          style={{
            fontFamily: FONT.display,
            fontWeight: 900,
            fontSize: "clamp(38px, 8vw, 72px)",
            lineHeight: 1.05,
            letterSpacing: -1,
            marginBottom: 22,
          }}
        >
          <span className="text-holo">WELCOME TO</span>
          <br />
          <span style={{ color: "#fff", textShadow: "0 0 35px rgba(18,230,255,0.4)" }}>VORTEXA</span>
        </h1>

        <p
          style={{
            fontFamily: FONT.body,
            fontSize: "clamp(15px, 2.6vw, 19px)",
            color: "rgba(255, 255, 255, 0.85)",
            maxWidth: 620,
            margin: "0 auto 16px",
            lineHeight: 1.65,
            textShadow: "0 2px 18px rgba(0, 0, 0, 0.9)",
          }}
        >
          Vortexa is the official theme of XMUM Orientation 2026 — a futuristic neon carnival where new beginnings take flight. Over two unforgettable days, discover campus, bond with your team, and step into university life with energy and purpose.
        </p>

        <p
          style={{
            fontFamily: FONT.mono,
            fontSize: "clamp(12px, 1.8vw, 13px)",
            color: "rgba(255, 255, 255, 0.6)",
            letterSpacing: 2,
            textTransform: "uppercase",
            marginBottom: 40,
            textShadow: "0 2px 14px rgba(0, 0, 0, 0.85)",
          }}
        >
          &ldquo;One ticket, One Ride, Discover adventure Inside.&rdquo;
        </p>

        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/login"
            style={{
              padding: "16px 38px",
              borderRadius: 50,
              fontFamily: FONT.display,
              fontWeight: 800,
              fontSize: 15,
              letterSpacing: 1,
              background: "linear-gradient(135deg, #ff2e8b, #a437ff, #12e6ff)",
              color: "#000",
              textDecoration: "none",
              boxShadow: "0 0 35px rgba(164, 55, 255, 0.45)",
              display: "inline-block",
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
