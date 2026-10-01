"use client";

/**
 * DEMO: Group Homepage shell after Facilitator group QR.
 *
 * Temporary open routes (`/group/demo-1`, `/group/demo-3`) for D-day walkthrough.
 * Redesigned to award-winning HCI standards with digital wristband identity,
 * Facilitator intelligence hub, and tactical shortcuts.
 */

import {
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  HelpCircle,
  Map as MapIcon,
  MessageSquare,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState, type CSSProperties } from "react";

import { FONT } from "@/components/home/data";
import { Glow } from "@/components/home/decor";
import { nexusBody, vxDisplay, vxSlab } from "@/components/home/fonts";
import "@/components/home/vortexa.css";
import type { DemoGroup } from "./demo-data";
import "./demo.css";

export default function GroupHome({ group }: { group: DemoGroup }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setCoords({ x, y });
  }, []);

  const handlePointerLeave = useCallback(() => {
    setCoords(null);
  }, []);

  const accentStyle = {
    "--vx-demo-accent": group.color,
    "--pass-x": coords ? `${coords.x}%` : "50%",
    "--pass-y": coords ? `${coords.y}%` : "50%",
  } as CSSProperties;

  return (
    <div
      className={`${vxDisplay.variable} ${vxSlab.variable} ${nexusBody.variable} vx vx-demo nexus relative text-white`}
      style={{ fontFamily: FONT.body, ...accentStyle }}
    >
      {/* Top Navigation Bar */}
      <header className="vx-demo-top">
        <div className="vx-demo-top-brand">
          <span className="vx-demo-badge" aria-hidden>
            {group.number}
          </span>
          <div className="vx-demo-top-meta">
            <b>{group.name}</b>
            <span>GROUP {group.number} · VORTEXA PORTAL</span>
          </div>
        </div>

        <Link href="/" className="vx-demo-back-btn" aria-label="Return to Welcome">
          <ArrowLeft size={16} strokeWidth={1.75} />
          <span className="hidden sm:inline">Welcome</span>
        </Link>
      </header>

      <div className="vx-demo-body">
        <div className="vx-dots" aria-hidden />
        <Glow
          size="min(440px, 85vw)"
          color={group.color}
          style={{ right: "-12%", top: "2%", opacity: 0.28 }}
        />

        {/* 1. Holographic Cyber Wristband Pass */}
        <section
          ref={cardRef}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          className="vx-demo-pass"
          aria-label={`Official Pass for ${group.name}`}
        >
          <div className="vx-demo-pass-glare" aria-hidden />
          <div className="vx-demo-pass-shimmer" aria-hidden />

          <div className="vx-demo-pass-inner">
            <div className="vx-demo-pass-header">
              <span className="vx-demo-pass-tag">OFFICIAL D-DAY PASS</span>
              <div className="vx-demo-pass-pill">
                <span className="vx-demo-pass-dot" style={{ backgroundColor: group.color }} />
                <span>GROUP {group.number}</span>
              </div>
            </div>

            <div className="vx-demo-pass-content">
              <div className="min-w-0">
                <p className="vx-demo-pass-kicker">TEAM IDENTITY</p>
                <h1 className="vx-demo-pass-title">{group.name}</h1>
                <p className="vx-demo-pass-sub">
                  Wristband Verified · Sector Station Ready
                </p>
              </div>

              <div className="vx-demo-pass-stencil" aria-hidden>
                <span className="vx-demo-stencil-lead">NO.</span>
                <span className="vx-demo-stencil-val">
                  {String(group.number).padStart(2, "0")}
                </span>
              </div>
            </div>

            <div className="vx-demo-pass-footer">
              <div className="flex items-center gap-2">
                <Users size={14} strokeWidth={1.75} className="text-[var(--vx-mute)]" />
                <span className="text-xs text-[var(--vx-text-2)]">Squad Active · XMUM</span>
              </div>
              <span className="vx-demo-pass-live">● RADAR SYNCED</span>
            </div>
          </div>
        </section>

        {/* 2. Facilitator Tactical Briefing Card */}
        <section className="vx-demo-card vx-demo-card--faci" aria-labelledby="group-faci-tip">
          <div className="vx-demo-card-head">
            <div className="vx-demo-icon-box" style={{ color: group.color }}>
              <MessageSquare size={18} strokeWidth={1.75} />
            </div>
            <div>
              <h2 id="group-faci-tip" className="vx-demo-card-title">
                Facilitator Intel
              </h2>
              <p className="vx-demo-card-subtitle">Direct briefing for your team</p>
            </div>
          </div>
          <div className="vx-demo-quote-block">
            <p className="vx-demo-quote-text">&ldquo;{group.faciTip}&rdquo;</p>
          </div>
        </section>

        {/* 3. Field Operations Shortcuts */}
        <section aria-label="Field Operations">
          <h2 className="vx-demo-sec-heading">FIELD OPERATIONS</h2>
          <div className="vx-demo-shortcuts-grid">
            <Link href="/map" className="vx-demo-shortcut-card group">
              <div className="flex items-center justify-between">
                <span className="vx-demo-shortcut-icon">
                  <MapIcon size={20} strokeWidth={1.75} />
                </span>
                <ArrowUpRight size={16} strokeWidth={1.75} className="text-[var(--vx-mute)] transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
              <div className="mt-3">
                <span className="vx-demo-shortcut-name">Campus Radar</span>
                <p className="vx-demo-shortcut-desc">Station locations, guardians & water points</p>
              </div>
            </Link>

            <Link href="/schedule" className="vx-demo-shortcut-card group">
              <div className="flex items-center justify-between">
                <span className="vx-demo-shortcut-icon">
                  <Clock size={20} strokeWidth={1.75} />
                </span>
                <ArrowUpRight size={16} strokeWidth={1.75} className="text-[var(--vx-mute)] transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
              <div className="mt-3">
                <span className="vx-demo-shortcut-name">Timeline Plan</span>
                <p className="vx-demo-shortcut-desc">Phase countdowns, ceremonies & intervals</p>
              </div>
            </Link>

            <Link href="/faq" className="vx-demo-shortcut-card group">
              <div className="flex items-center justify-between">
                <span className="vx-demo-shortcut-icon">
                  <HelpCircle size={20} strokeWidth={1.75} />
                </span>
                <ArrowUpRight size={16} strokeWidth={1.75} className="text-[var(--vx-mute)] transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
              <div className="mt-3">
                <span className="vx-demo-shortcut-name">Emergency & FAQ</span>
                <p className="vx-demo-shortcut-desc">Medical first aid, lost & found, rules</p>
              </div>
            </Link>
          </div>
        </section>

        {/* 4. Schedule & Tasks Status Boards */}
        <section className="vx-demo-card" aria-labelledby="group-schedule">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Calendar size={18} strokeWidth={1.75} className="text-[var(--vx-cyan)]" />
              <h2 id="group-schedule" className="vx-demo-card-title">
                Squad Timetable
              </h2>
            </div>
            <span className="vx-demo-empty-chip">PRE-EVENT</span>
          </div>
          <div className="vx-demo-empty">
            <b>Timetable Pending Publication</b>
            <span>Full schedule goes live closer to 28 Nov 2026. Follow your Facilitator for morning call times.</span>
          </div>
        </section>

        <section className="vx-demo-card" aria-labelledby="group-tasks">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} strokeWidth={1.75} className="text-[var(--vx-yellow)]" />
              <h2 id="group-tasks" className="vx-demo-card-title">
                Active Missions
              </h2>
            </div>
            <span className="vx-demo-empty-chip">LOCKED</span>
          </div>
          <div className="vx-demo-empty">
            <b>Missions Unlock on Game Day</b>
            <span>Live station tasks and puzzle blueprint quests will activate as each orientation phase begins.</span>
          </div>
        </section>

        {/* Reassurance notes */}
        <div className="vx-demo-callout">
          <Sparkles size={16} strokeWidth={1.75} className="text-[var(--vx-yellow)] shrink-0 mt-0.5" />
          <p>
            <strong>Device Sync:</strong> Switched or recharged phones? Scan your Facilitator&apos;s physical wristband QR code at any time to re-anchor this team portal.
          </p>
        </div>

        <p className="vx-demo-warn">
          DEMO ROUTE — Designed for orientation rehearsal walkthrough. Production passes are signed and time-expiring.
        </p>
      </div>
    </div>
  );
}
