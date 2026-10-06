"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Gamepad2, Home, Menu, ScanLine, Trophy, X } from "lucide-react";

import { STOPS, scrollToSection, type StopId } from "./data";

/**
 * Public Welcome nav links (desktop + hamburger).
 * Keep STOPS for scroll/IntersectionObserver — not every stop is a nav item.
 * Welcome → Overview → Schedule → Games → Committees.
 * Scoreboard & Check-in are page sections only (not listed in the menu).
 */
const NAV_LINKS: { id: StopId; label: string }[] = [
  { id: "welcome", label: "Welcome" },
  { id: "overview", label: "Overview" },
  { id: "schedule", label: "Schedule" },
  { id: "games", label: "Games" },
  { id: "committees", label: "Committees" },
];

/** Same set for the mobile hamburger drawer. */
const HAMBURGER_LINKS = NAV_LINKS;

/**
 * Fixed top bar. On desktop: logo, section links, and the "Join the Game"
 * button. On phones and tablets: logo, hamburger, and a progress bar naming
 * the current stop. "Join the Game" opens the login chooser, which offers
 * the Freshie login and the Committee, Faci, GM login.
 * Scan is not available on the public Welcome page.
 */
export function SiteNav({ active, onJoin }: { active: StopId; onJoin?: () => void }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const index = Math.max(0, STOPS.findIndex((s) => s.id === active));
  const current = STOPS[index];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const go = (id: string) => {
    scrollToSection(id);
    setOpen(false);
  };

  return (
    <>
      {mounted &&
        createPortal(
          <div
            className="vx-menu-backdrop"
            data-open={open}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />,
          document.body
        )}

      <nav className="vx-nav" data-open={open} aria-label="Welcome page sections">
      <div className="vx-nav-row">
        <button type="button" className="vx-nav-logo" onClick={() => go("welcome")} aria-label="Vortexa, back to top">
          <Image
            src="/vortexa-logo-sm.webp"
            alt=""
            width={320}
            height={184}
            sizes="(max-width: 1023px) 56px, 66px"
            priority
            style={{ width: "auto" }}
          />
        </button>

        <div className="vx-nav-links">
          {NAV_LINKS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="vx-nav-link"
              aria-current={active === t.id}
              onClick={() => go(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="vx-nav-logins">
          <button type="button" className="vx-btn vx-btn-primary" onClick={() => onJoin?.()}>
            Join the Game ★
          </button>
        </div>

        <button
          type="button"
          className="vx-burger"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="vx-menu"
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* The label has a fixed width, so the track keeps one length at every
          stop and only the fill moves (it scales, so no layout work on scroll). */}
      <div className="vx-stopbar vx-mono" aria-hidden={open}>
        <b>{String(index + 1).padStart(2, "0")}</b>
        <span className="vx-stopbar-track">
          <span className="vx-stopbar-fill" style={{ transform: `scaleX(${(index + 1) / STOPS.length})` }} />
        </span>
        <span className="vx-stopbar-label">{current.label}</span>
      </div>

      <div id="vx-menu" className="vx-menu" data-open={open}>
        {HAMBURGER_LINKS.map((t, i) => (
          <button key={t.id} type="button" className="vx-menu-item" aria-current={active === t.id} onClick={() => go(t.id)}>
            <span>{t.label}</span>
            <span className="vx-mono" style={{ fontSize: 12, color: "var(--vx-mute)" }}>
              {String(i + 1).padStart(2, "0")}
            </span>
          </button>
        ))}
        <div className="vx-menu-actions">
          <button
            type="button"
            className="vx-btn vx-btn-primary"
            onClick={() => {
              setOpen(false);
              onJoin?.();
            }}
          >
            Join the Game ★
          </button>
          <button type="button" className="vx-btn vx-btn-ghost" onClick={() => go("check-in")}>
            How to check in
          </button>
        </div>
      </div>
    </nav>
    </>
  );
}

const TABS: { label: string; target: StopId; match: StopId[]; Icon: typeof Home }[] = [
  { label: "Home", target: "welcome", match: ["welcome", "overview"], Icon: Home },
  { label: "Schedule", target: "schedule", match: ["schedule"], Icon: CalendarDays },
  { label: "Games", target: "games", match: ["games"], Icon: Gamepad2 },
  { label: "Score", target: "scoreboard", match: ["scoreboard"], Icon: Trophy },
];

/**
 * Phone/tablet bottom tab bar for the four most-used stops. When `onScan` is
 * given, a raised Scan button sits in the middle. The public Welcome page
 * does not pass `onScan`, because scanning needs a login.
 */
export function TabBar({ active, onScan }: { active: StopId; onScan?: () => void }) {
  const tab = ({ label, target, match, Icon }: (typeof TABS)[number]) => (
    <button
      key={label}
      type="button"
      className="vx-tab"
      aria-current={match.includes(active)}
      onClick={() => scrollToSection(target)}
    >
      <Icon size={22} aria-hidden />
      {label}
    </button>
  );

  return (
    <div className="vx-tabbar" role="navigation" aria-label="Quick sections">
      {TABS.slice(0, 2).map(tab)}
      {onScan && (
        <button type="button" className="vx-tab vx-tab-scan" onClick={onScan} aria-label="Scan a QR code">
          <span className="vx-tab-scan-btn" aria-hidden>
            <ScanLine size={26} strokeWidth={2.2} />
          </span>
          Scan
        </button>
      )}
      {TABS.slice(2).map(tab)}
    </div>
  );
}

/** Desktop-only column of dots on the right edge: one per stop, clickable. */
export function StopRail({ active }: { active: StopId }) {
  const index = STOPS.findIndex((s) => s.id === active);
  return (
    <div className="vx-rail" role="navigation" aria-label="Jump to section">
      {STOPS.map((s, i) => (
        <button
          key={s.id}
          type="button"
          aria-label={s.label}
          aria-current={i === index}
          data-state={i < index ? "done" : undefined}
          onClick={() => scrollToSection(s.id)}
        >
          <span className="vx-rail-tip" aria-hidden>
            {s.label}
          </span>
        </button>
      ))}
    </div>
  );
}
