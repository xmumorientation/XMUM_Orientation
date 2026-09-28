"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, Gamepad2, Home, Menu, ScanLine, Trophy, X } from "lucide-react";

import { STOPS, scrollToSection, type StopId } from "./data";

/** Sections listed in the desktop nav (Join lives on the yellow button). */
const NAV_LINKS = STOPS.filter((s) => s.id !== "join");

/**
 * Fixed top bar. On desktop: logo, section links, Join button. On phones and
 * tablets: logo, menu button, and a progress bar naming the current stop.
 */
export function SiteNav({ active, onScan }: { active: StopId; onScan?: () => void }) {
  const [open, setOpen] = useState(false);
  const index = Math.max(0, STOPS.findIndex((s) => s.id === active));
  const current = STOPS[index];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const go = (id: string) => {
    scrollToSection(id);
    setOpen(false);
  };

  return (
    <nav className="vx-nav" aria-label="Homepage sections">
      <div className="vx-nav-row">
        <button type="button" className="vx-nav-logo" onClick={() => go("welcome")} aria-label="Vortexa — back to top">
          <Image src="/vortexa-logo-sm.webp" alt="" width={320} height={184} priority style={{ width: "auto" }} />
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

        {/* DEV PREVIEW scanner entry (desktop) — see ScanPreview.tsx */}
        {onScan && (
          <button type="button" className="vx-btn vx-btn-ghost vx-nav-scan" onClick={onScan}>
            <ScanLine size={16} aria-hidden /> Scan
          </button>
        )}

        <Link href="/login" className="vx-btn vx-btn-primary vx-nav-cta">
          Join the Game
        </Link>

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

      <div className="vx-stopbar vx-mono" aria-hidden={open}>
        <b>{String(index + 1).padStart(2, "0")}</b>
        <span className="vx-stopbar-track">
          <span className="vx-stopbar-fill" style={{ width: `${((index + 1) / STOPS.length) * 100}%` }} />
        </span>
        <span>{current.label}</span>
      </div>

      <div id="vx-menu" className="vx-menu" data-open={open}>
        {STOPS.map((t, i) => (
          <button key={t.id} type="button" className="vx-menu-item" aria-current={active === t.id} onClick={() => go(t.id)}>
            <span>{t.label}</span>
            <span className="vx-mono" style={{ fontSize: 12, color: "var(--vx-mute)" }}>
              {String(i + 1).padStart(2, "0")}
            </span>
          </button>
        ))}
        <Link href="/login" className="vx-btn vx-btn-primary" onClick={() => setOpen(false)}>
          Join the Game ★
        </Link>
      </div>
    </nav>
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

const TABS: { label: string; target: StopId; match: StopId[]; Icon: typeof Home }[] = [
  { label: "Home", target: "welcome", match: ["welcome", "overview"], Icon: Home },
  { label: "Games", target: "games", match: ["games"], Icon: Gamepad2 },
  { label: "Score", target: "scoreboard", match: ["scoreboard"], Icon: Trophy },
  { label: "Schedule", target: "schedule", match: ["schedule"], Icon: CalendarDays },
];

/**
 * Phone/tablet bottom tab bar for the four most-used stops. When `onScan` is
 * given, a raised Scan button sits in the middle (DEV PREVIEW — see
 * ScanPreview.tsx).
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
