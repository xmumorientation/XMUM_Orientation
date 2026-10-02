"use client";

import { CalendarDays, Map, ScanLine } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { EVENT, EVENTS } from "@/components/home/data";
import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import { useProfile } from "@/components/ProfileProvider";
import { useGroup } from "@/components/useGroup";
import type { Group } from "@/lib/types";
import { formatCountdown } from "@/lib/utils";

import "./freshie.css";
import { groupTheme } from "./groupTheme";

// Freshie /dashboard — a day-of hub inside David's AppShell.
// One scroll: status (what's happening, tokens, group), a compact group
// pass, then Scan / Map / Schedule. No snap stops, no second header.
// Staff keep StaffDashboard (see app/(app)/dashboard/page.tsx).
// Freshies do not get an FAQ shortcut on this page.

const DAY1 = new Date(EVENT.dates.day1).getTime();
const DAY1_LABEL = new Date(EVENT.dates.day1).toLocaleDateString("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kuala_Lumpur",
});

function useNow(intervalMs: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Compact remain-until string. Null once day 1 has started. */
function formatUntil(diffMs: number): string | null {
  if (diffMs <= 0) return null;
  const d = Math.floor(diffMs / 86400000);
  const h = Math.floor((diffMs % 86400000) / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  const s = Math.floor((diffMs % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function todaySchedule() {
  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kuala_Lumpur",
  });
  const day = EVENTS.find((d) => d.date === today);
  if (!day || day.items.length === 0) return null;
  return day;
}

function NowStatus({ group, loading }: { group: Group | null; loading: boolean }) {
  const { phases, offsetMs, tick } = usePhaseTimer();
  void tick;
  const until = useNow(1000);
  const activeIdx = phases.findIndex((p) => p.state === "active");
  const idx = activeIdx >= 0 ? activeIdx : phases.findIndex((p) => p.state === "paused");
  const current = idx >= 0 ? phases[idx] : null;
  let kicker = "Now";
  let title = "Orientation is on";
  let detail = "Timetable still TBA";
  let tone: "wait" | "live" | "end" = "wait";
  let progress: number | null = null;
  let time: string | null = null;

  if (current) {
    const remaining =
      current.state === "paused"
        ? (current.paused_remaining ?? 0)
        : current.ends_at
          ? (new Date(current.ends_at).getTime() - (Date.now() + offsetMs)) / 1000
          : 0;
    const total = Math.max(1, current.duration_minutes * 60);
    progress = Math.min(1, Math.max(0, 1 - remaining / total));
    title = current.name;
    time = formatCountdown(remaining);
    kicker = current.state === "paused" ? "Paused" : current.is_endgame ? "Endgame" : "Live";
    tone = current.is_endgame ? "end" : "live";
    const next = phases[idx + 1];
    detail = next
      ? `Phase ${idx + 1} of ${phases.length} · next ${next.name}`
      : `Phase ${idx + 1} of ${phases.length}`;
  } else {
    const remain = until === null ? undefined : formatUntil(DAY1 - until);
    const schedule = todaySchedule();
    const nextItem = schedule?.items[0];
    if (until === null) {
      title = "—";
      detail = `Until ${DAY1_LABEL}`;
    } else if (remain) {
      title = remain;
      detail = `Until ${DAY1_LABEL} · timetable still TBA`;
    } else if (nextItem) {
      detail = `${nextItem.time} · ${nextItem.title}`;
    } else if (until !== null && !group && !loading) {
      detail = "Group not assigned yet";
    }
  }

  return (
    <StatusCard
      kicker={kicker}
      title={title}
      time={time}
      detail={detail}
      tone={tone}
      progress={progress}
      group={group}
      loading={loading}
    />
  );
}

function StatusCard({
  kicker,
  title,
  time,
  detail,
  tone,
  progress,
  group,
  loading,
}: {
  kicker: string;
  title: string;
  time: string | null;
  detail: string;
  tone: "wait" | "live" | "end";
  progress: number | null;
  group: Group | null;
  loading: boolean;
}) {
  const tokens = loading ? "…" : group ? String(group.token_balance) : "—";
  const groupLabel = loading ? "Loading group" : group ? group.name : "No group yet";

  return (
    <section className="fh-now" data-tone={tone} aria-labelledby="fh-now-title">
      <div className="fh-now-top">
        <span className="fh-kicker">
          <i className="fh-dot" aria-hidden />
          {kicker}
        </span>
        {time && (
          <span className="fh-now-time" aria-label={`${time} remaining`}>
            {time}
          </span>
        )}
      </div>
      <div className="fh-now-main">
        <h1 id="fh-now-title" className="fh-now-title">
          {title}
        </h1>
        <Link href="/transactions" className="fh-tokens">
          <b>{tokens}</b>
          <span>{group ? "group tokens" : "tokens"}</span>
        </Link>
      </div>
      {progress !== null && (
        <div className="fh-bar" aria-hidden>
          <i style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      <p className="fh-now-foot">
        <span className="fh-now-group">
          <i className="fh-swatch" aria-hidden />
          {groupLabel}
        </span>
        <span className="fh-now-detail">{detail}</span>
      </p>
    </section>
  );
}

function PassCard({
  group,
  loading,
  name,
  studentId,
}: {
  group: Group | null;
  loading: boolean;
  name: string;
  studentId: string | null;
}) {
  if (loading) {
    return <div className="fh-skel" aria-hidden />;
  }
  if (!group) {
    return (
      <section className="fh-pass" data-pending="true" aria-labelledby="fh-pass-title">
        <div className="fh-pass-body">
          <p className="fh-kicker" id="fh-pass-title">
            Group pass
          </p>
          <p className="fh-pass-name">Not assigned yet</p>
          <p className="fh-pass-who">Check in at the registration counter to get a group.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="fh-pass" aria-labelledby="fh-pass-title">
      <div className="fh-pass-body">
        <p className="fh-kicker" id="fh-pass-title">
          Group pass
        </p>
        <p className="fh-pass-name">{group.name}</p>
        <p className="fh-pass-who">
          {name || "Freshie"}
          {studentId ? <span> · {studentId}</span> : null}
        </p>
      </div>
      <p className="fh-pass-id">
        <span>Group</span>
        <b>{String(group.id).padStart(2, "0")}</b>
      </p>
    </section>
  );
}

const ACTIONS = [
  { href: "/scan", label: "Scan", hint: "QR code", icon: ScanLine, primary: true },
  { href: "/map", label: "Map", hint: "Campus", icon: Map, primary: false },
  { href: "/schedule", label: "Schedule", hint: "Full day", icon: CalendarDays, primary: false },
] as const;

function ActionRow() {
  return (
    <nav className="fh-actions" aria-label="Primary actions">
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.href}
            href={action.href}
            className="fh-action"
            data-primary={action.primary || undefined}
          >
            <Icon size={20} strokeWidth={1.75} aria-hidden />
            <b>{action.label}</b>
            <small>{action.hint}</small>
          </Link>
        );
      })}
    </nav>
  );
}

function TodayList() {
  const day = todaySchedule();
  if (!day) return null;
  return (
    <section className="fh-today" aria-labelledby="fh-today-title">
      <div className="fh-today-head">
        <h2 id="fh-today-title">Today</h2>
        <Link href="/schedule">Full schedule</Link>
      </div>
      <ol>
        {day.items.slice(0, 4).map((item, i) => (
          <li key={`${item.time}-${i}`}>
            <b>{item.title}</b>
            <small>
              {item.time === "TBD" && item.venue === "TBD" ? "Time and venue TBD" : `${item.time} · ${item.venue}`}
            </small>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function FreshieHome() {
  const profile = useProfile();
  const { group, loading } = useGroup();
  const theme = groupTheme(group?.id ?? profile.group_id);

  return (
    <div
      className="fh"
      style={{ "--fh-accent": theme.accent, "--fh-glow": theme.glow } as React.CSSProperties}
    >
      <NowStatus group={group} loading={loading} />
      <PassCard
        group={group}
        loading={loading}
        name={profile.full_name ?? ""}
        studentId={profile.student_id}
      />
      <ActionRow />
      <TodayList />
    </div>
  );
}
