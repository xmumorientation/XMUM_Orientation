"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { FONT, scrollToSection } from "./data";
import { StarSparkle } from "./decor";

const TABS = [
  { id: "home", label: "Home" },
  { id: "scoreboard", label: "Scoreboard" },
  { id: "games", label: "Games" },
  { id: "map", label: "Map" },
  { id: "schedule", label: "Schedule" },
  { id: "committees", label: "Committees" },
];

export function SiteNav({ revealed = true }: { revealed?: boolean }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("home");

  // Scroll-spy: highlight the section currently in view.
  useEffect(() => {
    const ids = TABS.map((t) => t.id).filter((id) => id !== "home");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    const onScroll = () => {
      if (window.scrollY < window.innerHeight * 0.6) setActive("home");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const go = (id: string) => {
    scrollToSection(id);
    setOpen(false);
  };

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: "rgba(5,1,12,0.82)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        transform: revealed ? "translateY(0)" : "translateY(-100%)",
        opacity: revealed ? 1 : 0,
        transition: "transform 0.6s ease, opacity 0.6s ease",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 56,
        }}
      >
        {/* Logo */}
        <button
          onClick={() => go("home")}
          aria-label="NEXUS '26 — go to top"
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
        >
          <span className="text-holo" style={{ fontFamily: FONT.display, fontWeight: 900, fontSize: 22, letterSpacing: 1 }}>
            NEXUS
          </span>
          <span style={{ fontFamily: FONT.display, fontWeight: 900, fontSize: 22, color: "#fff", letterSpacing: 1 }}>&apos;26</span>
          <StarSparkle size={14} color="#d966ff" style={{ marginLeft: 2 }} />
        </button>

        {/* Desktop links */}
        <div className="hidden md:flex" style={{ gap: 4, alignItems: "center" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => go(t.id)}
              style={{
                fontFamily: FONT.display,
                fontWeight: 700,
                fontSize: 13,
                padding: "6px 14px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                background: active === t.id ? "linear-gradient(135deg,#ff3cac,#d966ff,#00cfff)" : "transparent",
                color: active === t.id ? "#000" : "rgba(255,255,255,0.6)",
                letterSpacing: 0.5,
                transition: "all 0.2s",
              }}
            >
              {t.label}
            </button>
          ))}
          <Link
            href="/login"
            style={{
              marginLeft: 8,
              fontFamily: FONT.display,
              fontWeight: 800,
              fontSize: 13,
              padding: "8px 18px",
              borderRadius: 50,
              border: "1px solid rgba(255,255,255,0.25)",
              color: "#fff",
              letterSpacing: 0.5,
              textDecoration: "none",
            }}
          >
            Login
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", fontSize: 22 }}
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div
          className="md:hidden"
          style={{ background: "#05010c", borderTop: "1px solid rgba(255,255,255,0.06)", padding: "8px 20px 18px" }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => go(t.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                fontFamily: FONT.display,
                fontWeight: 700,
                fontSize: 15,
                padding: "12px 0",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: active === t.id ? "#d966ff" : "rgba(255,255,255,0.6)",
              }}
            >
              {t.label}
            </button>
          ))}
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            style={{
              display: "block",
              marginTop: 8,
              textAlign: "center",
              fontFamily: FONT.display,
              fontWeight: 800,
              fontSize: 15,
              padding: "12px 0",
              borderRadius: 50,
              border: "1px solid rgba(255,255,255,0.25)",
              color: "#fff",
              textDecoration: "none",
            }}
          >
            Login
          </Link>
        </div>
      )}
    </nav>
  );
}
