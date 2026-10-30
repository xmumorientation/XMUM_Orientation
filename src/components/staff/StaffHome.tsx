"use client";

import { Activity, ArrowRight, CalendarDays, Check, Coins, Copy, Flag, Gift, Map, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  AccountMenu,
  Countdown,
  Credits,
  goTo,
  PhaseCard,
  StopBar,
} from "@/components/freshie/FreshieHome";
import { FreshieSky, type SkyCabin } from "@/components/freshie/FreshieSky";
import { groupSwatch, VORTEXA_THEME } from "@/components/freshie/groupTheme";
import { nexusBody, vxDisplay, vxSlab } from "@/components/home/fonts";
import { priceText, useMyBlindBoxes, type MyBlindBoxSeller } from "@/components/BlindBoxCard";
import { GroupBadge } from "@/components/GroupBadge";
import { usePhases } from "@/components/PhaseTimerProvider";
import { useScoreboard } from "@/components/useScoreboard";
import { useProfile } from "@/components/ProfileProvider";
import { OPS_CHIP } from "@/components/staff/OpsHeader";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ROLE_LABELS, type UserRole } from "@/lib/types";

import "@/components/freshie/freshie.css";
import "./staff-home.css";

// Home (/dashboard) for HOF, HOGM, Committee and GM (VORTEXA_ROLES). Same layout as
// Freshie Home: one-screen stops that snap, starting with the Welcome stop
// (Vortexa lockup, countdown, live game, two buttons, credits), in the public
// Welcome page's colours instead of a group colour (VORTEXA_THEME, .fh-vx in
// staff-home.css). Then the account's own blind boxes and QR, the scoreboard
// and the event tools. A GM's main button and first tool are its Station panel
// (/gm) instead of Ops, and it has no blind box stop. Navigation is the tab bar
// (phones and portrait tablets) or TopNav (landscape tablets and desktops).

const STOPS = [
  { id: "sh-welcome", label: "Welcome" },
  { id: "sh-bb", label: "Blind Box" },
  { id: "sh-scores", label: "Scores" },
  { id: "sh-tools", label: "Tools" },
] as const;

const GM_STOPS = STOPS.filter((s) => s.id !== "sh-bb");

type HomeGroup = { id: number; name: string; color: string | null; token_balance: number };

/** Groups and their tokens, live: the scoreboard and the sky's cabins. Reads
 *  fn_scoreboard() because a GM may not select the groups table (0002 RLS); the
 *  30-second refresh covers the realtime events RLS does not send to a GM. */
function useGroups(): HomeGroup[] | null {
  return useScoreboard() ?? null;
}

/** Shown instead of the PhaseCard while no game phase runs, so the crew knows the game is not on. */
function GameIdle() {
  const { phases } = usePhases();
  const next = phases.find((p) => p.state === "pending");
  return (
    <div className="sh-idle" role="status">
      <i aria-hidden />
      <div>
        <b>No game running</b>
        <span>{next ? `Next: ${next.name} / started from Live control` : "Games start from Live control"}</span>
      </div>
    </div>
  );
}

function WelcomeStop({ name, role }: { name: string; role: UserRole }) {
  const { phases } = usePhases();
  const live = phases.some((p) => p.state === "active" || p.state === "paused");
  return (
    <section id="sh-welcome" className="fh-stop fh-center" aria-labelledby="sh-welcome-title">
      <div className="fh-eyebrow fh-mono">XMUM 26/12 Orientation</div>
      <h1 id="sh-welcome-title" className="fh-welcome-title">
        <span className="fh-pre fh-slab">WELCOME TO</span>
        <span className="fh-mark">Vortexa</span>
      </h1>
      <p className="fh-hello">
        Hi <b>{name || "there"}</b> / {ROLE_LABELS[role]}
      </p>
      {/* Same rule as Freshie Home: the running game, else the event countdown. */}
      {live ? (
        <PhaseCard />
      ) : (
        <>
          <Countdown />
          <GameIdle />
        </>
      )}
      <div className="fh-actions">
        {role === "gm" ? (
          <Link href="/gm" className="fh-btn fh-btn-primary">
            <Flag size={18} aria-hidden />
            Station
          </Link>
        ) : (
          <Link href="/committee" className="fh-btn fh-btn-primary">
            <Activity size={18} aria-hidden />
            Ops
          </Link>
        )}
        <button type="button" className="fh-btn fh-btn-ghost" onClick={() => goTo(role === "gm" ? "sh-scores" : "sh-bb")}>
          More Info ↓
        </button>
      </div>
      <Credits />
    </section>
  );
}

/** The account's own blind boxes: what is left and the QR a Freshie scans. Same data as BlindBoxCard. */
function BlindBoxStop() {
  const { loaded, error, sellers, copy, copied, paused, closed } = useMyBlindBoxes();
  const [openQr, setOpenQr] = useState<{ src: string; alt: string } | null>(null);
  const left = sellers.reduce((n, s) => n + s.left, 0);
  return (
    <section id="sh-bb" className="fh-stop" aria-labelledby="sh-bb-title">
      <div className="fh-stop-head fh-stop-head-row">
        <h2 id="sh-bb-title" className="fh-h2 fh-slab">My Blind Box</h2>
        {sellers.length > 0 && <span className="fh-pill fh-mono">{left} LEFT</span>}
      </div>
      {error && <p className="sh-bb-err" role="alert">{error}</p>}
      {!loaded ? (
        <p className="sh-bb-note">Loading…</p>
      ) : sellers.length === 0 ? (
        <div className="sh-bb-empty">
          <span className="sh-tool-ic" aria-hidden>
            <Gift size={20} />
          </span>
          <div>
            <b>No blind boxes yet</b>
            <small>When Admin gives you boxes to sell, your QR shows up here.</small>
          </div>
        </div>
      ) : (
        <ul className="sh-bb-list">
          {sellers.map((s) => (
            <SellerBox key={s.id} s={s} paused={paused} closed={closed} copy={copy} copied={copied} onOpen={setOpenQr} />
          ))}
        </ul>
      )}
      {openQr && <QrLightbox qr={openQr} onClose={() => setOpenQr(null)} />}
    </section>
  );
}

/**
 * One seller's boxes, laid out as before (a switcher for two or more live
 * types, the QR, the note, Copy link, the box list). Tapping the QR opens it
 * full screen on its own, like a photo. Switched off, paused and sold out are
 * plain status lines.
 */
function SellerBox({
  s,
  paused,
  closed,
  copy,
  copied,
  onOpen,
}: {
  s: MyBlindBoxSeller;
  paused: string | null;
  closed: string | null;
  copy: (id: number, url: string) => void;
  copied: number | null;
  onOpen: (qr: { src: string; alt: string }) => void;
}) {
  const live = s.rows.filter((r) => r.active && !r.type?.archived);
  const [pick, setPick] = useState<number | null>(null);
  // One QR for a single type; one per type (and a switcher) for two or more.
  const row = s.typed ? (live.find((r) => r.id === pick) ?? live[0]) : null;
  const shown = row ? s.shown[row.id] : s.qr;
  const sold = row ? row.quantity - row.opened <= 0 : false;
  const status = !s.live
    ? { text: "Switched off by Admin. This code doesn't work right now.", off: true }
    : paused && s.left > 0
      ? { text: paused, off: true }
      : s.left <= 0
        ? { text: "All boxes sold.", off: false }
        : null;
  const copyId = row ? row.id : s.id;
  return (
    <li className="sh-bb">
      <span className="sh-bb-who fh-mono">Your Own Boxes</span>
      {status ? (
        <p className="sh-bb-state" data-tone={status.off ? "off" : undefined}>{status.text}</p>
      ) : (
        <>
          {s.typed && (
            <div className="sh-bb-switch" role="tablist" aria-label="Which box to show">
              {live.map((r) => (
                <button key={r.id} type="button" role="tab" aria-selected={r.id === row?.id} onClick={() => setPick(r.id)}>
                  {r.type?.name ?? "Box"}
                  <small>{Math.max(r.quantity - r.opened, 0)} left</small>
                </button>
              ))}
            </div>
          )}
          {sold ? (
            <p className="sh-bb-state">Sold out.</p>
          ) : (
            shown ? (
              <button
                type="button"
                className="sh-bb-qrbtn"
                disabled={!!closed}
                aria-label={`Open the ${row?.type?.name ?? "blind box"} QR code full screen`}
                onClick={() => onOpen({ src: shown.qr, alt: `${row?.type?.name ?? "Blind box"} QR code` })}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shown.qr} alt="" className="sh-bb-qr" data-closed={closed ? "" : undefined} />
              </button>
            ) : (
              <span className="sh-bb-qr sh-bb-qr-wait" aria-label="Loading QR" />
            )
          )}
          {closed ? (
            <p className="sh-bb-state" data-tone="off">{closed}</p>
          ) : (
            <>
              <small className="sh-bb-note">
                {row ? `${row.type?.name ?? "Box"} · ${priceText(row.type)}. ` : ""}A Freshie scans this after your mini-game. Tap the code to enlarge it. Each group can buy one box.
              </small>
              {shown && !sold && (
                <button type="button" className="fh-btn fh-btn-ghost sh-bb-copy" onClick={() => copy(copyId, shown.url)}>
                  {copied === copyId ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                  {copied === copyId ? "Copied" : "Copy Link"}
                </button>
              )}
            </>
          )}
          {!s.typed && (
            <ul className="sh-bb-types">
              {s.rows.map((r) => (
                <li key={r.id}>
                  <b>
                    {r.type?.name ?? "Box"}
                    {r.type?.is_special && <Sparkles size={14} aria-label="special" />}
                  </b>
                  <span className="fh-slab">
                    {Math.max(r.quantity - r.opened, 0)}
                    <small>/{r.quantity}</small>
                  </span>
                  <small>{priceText(r.type)}</small>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

/** The QR picture alone, full screen, like opening a photo. Tap anywhere or press Escape to close. */
function QrLightbox({ qr, onClose }: { qr: { src: string; alt: string }; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sh-bb-lightbox" role="dialog" aria-modal="true" aria-label="Blind box QR code" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr.src} alt={qr.alt} />
    </div>
  );
}

function ScoresStop({ groups }: { groups: HomeGroup[] | null }) {
  return (
    <section id="sh-scores" className="fh-stop" aria-labelledby="sh-scores-title">
      <div className="fh-stop-head fh-stop-head-row">
        <h2 id="sh-scores-title" className="fh-h2 fh-slab">Tokens</h2>
        <Link href="/token" className="sh-more">
          Full scoreboard <ArrowRight size={15} aria-hidden />
        </Link>
      </div>
      <ol className="fh-board">
        {(groups ?? []).map((row) => (
          <li key={row.id} className="fh-team">
            <GroupBadge id={row.id} color={groupSwatch(row.id, row.color)} />
            <b>{row.name}</b>
            <span className="fh-team-sc fh-slab">{row.token_balance}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const TOOLS = [
  { href: "/map", Icon: Map, title: "Campus Map", text: "Stations and group locations" },
  { href: "/schedule", Icon: CalendarDays, title: "Schedule", text: "The two-day programme" },
  { href: "/token", Icon: Coins, title: "Scoreboard", text: "Live tokens and puzzle pieces" },
];

const GM_TOOLS = [
  { href: "/gm", Icon: Flag, title: "Station Panel", text: "Results, rewards and station status" },
  { href: "/map", Icon: Map, title: "Campus Map", text: "Every station and its status" },
  { href: "/schedule", Icon: CalendarDays, title: "Schedule", text: "The two-day programme" },
  { href: "/token", Icon: Coins, title: "Scoreboard", text: "Live tokens and puzzle counts" },
];

function ToolsStop({ role }: { role: UserRole }) {
  return (
    <section id="sh-tools" className="fh-stop" aria-labelledby="sh-tools-title">
      <div className="fh-stop-head">
        <h2 id="sh-tools-title" className="fh-h2 fh-slab">Event Tools</h2>
      </div>
      <ul className="sh-tools">
        {(role === "gm" ? GM_TOOLS : TOOLS).map(({ href, Icon, title, text }) => (
          <li key={href}>
            <Link href={href} className="sh-tool">
              <span className="sh-tool-ic" aria-hidden>
                <Icon size={20} />
              </span>
              <span>
                <b>{title}</b>
                <small>{text}</small>
              </span>
              <ArrowRight size={18} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StaffHome() {
  const profile = useProfile();
  const groups = useGroups();
  const isGm = profile.role === "gm";

  // Section-by-section snapping, this page only (same as Freshie Home).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("fh-snap");
    return () => root.classList.remove("fh-snap");
  }, []);
  const cabins: SkyCabin[] = useMemo(() => (groups ?? []).map(({ id, color }) => ({ id, color })), [groups]);
  const theme = VORTEXA_THEME;

  return (
    <div
      className={`fh fh-vx sh ${nexusBody.variable} ${vxDisplay.variable} ${vxSlab.variable}`}
      style={
        {
          "--fh-accent": theme.accent,
          "--fh-glow": theme.glow,
          "--fh-blue": theme.accent,
          "--fh-blue-light": theme.accentLight,
          "--fh-on-blue": theme.onAccent,
          "--fh-glow-strength": theme.glowStrength,
          "--fh-glow-spread": theme.glowSpread,
          "--fh-partner": theme.partner,
        } as React.CSSProperties
      }
    >
      <FreshieSky cabins={cabins} myGroupId={null} />

      <header className="fh-head">
        <div className="fh-head-row">
          <div className="fh-head-l">
            <button type="button" className="fh-brand" onClick={() => goTo("sh-welcome")} aria-label="Vortexa — back to top">
              <Image src="/vortexa-logo-sm.webp" alt="" width={320} height={184} priority style={{ width: "auto" }} />
            </button>
          </div>
          <div className="fh-head-r">
            <span className="fh-chip fh-mono">{OPS_CHIP[profile.role] ?? ROLE_LABELS[profile.role]}</span>
            <AccountMenu
              name={profile.full_name ?? ""}
              groupName={null}
              roleLabel={ROLE_LABELS[profile.role]}
              logoutHref="/login"
            />
          </div>
        </div>
        <StopBar stops={isGm ? GM_STOPS : STOPS} />
      </header>

      <WelcomeStop name={profile.full_name ?? ""} role={profile.role} />
      {!isGm && <BlindBoxStop />}
      <ScoresStop groups={groups} />
      <ToolsStop role={profile.role} />
    </div>
  );
}
