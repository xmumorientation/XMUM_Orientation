"use client";

import Link from "next/link";
import { FONT } from "./data";

export function SiteFooter() {
  return (
    <footer style={{ padding: "48px 20px 36px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="text-holo" style={{ fontFamily: FONT.display, fontWeight: 900, fontSize: 14, letterSpacing: 3 }}>
        VORTEXA · XMUM ORIENTATION 2026
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 8, fontFamily: FONT.body }}>
        &ldquo;One ticket, One Ride, Discover adventure Inside.&rdquo;
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 8, fontFamily: FONT.mono, letterSpacing: 1 }}>
        NOVEMBER 28–29, 2026 · XIAMEN UNIVERSITY MALAYSIA
      </div>
      <div style={{ marginTop: 20 }}>
        <Link
          href="/login"
          style={{
            fontFamily: FONT.mono,
            fontSize: 11,
            letterSpacing: 2,
            color: "rgba(255,255,255,0.45)",
            textDecoration: "none",
            padding: "8px 16px",
            borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.1)",
            display: "inline-block",
            transition: "all 0.2s",
          }}
        >
          STAFF &amp; STUDENT LOGIN →
        </Link>
      </div>
    </footer>
  );
}
