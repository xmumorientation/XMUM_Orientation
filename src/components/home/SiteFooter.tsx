"use client";

import Link from "next/link";
import { FONT } from "./data";

export function SiteFooter() {
  return (
    <footer style={{ padding: "36px 20px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="text-holo" style={{ fontFamily: FONT.display, fontWeight: 900, fontSize: 13, letterSpacing: 3 }}>
        NEXUS &apos;26 · UNIVERSITY ORIENTATION 2026
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 6, fontFamily: FONT.mono }}>
        MADE WITH ★ BY THE MEDIA COMMITTEE
      </div>
      <div style={{ marginTop: 14 }}>
        <Link href="/login" style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>
          STAFF &amp; STUDENT LOGIN →
        </Link>
      </div>
    </footer>
  );
}
