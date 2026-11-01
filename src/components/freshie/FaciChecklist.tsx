"use client";

import {
  Check,
  ChevronDown,
  Megaphone,
  Minus,
  Navigation,
  Plus,
  RefreshCw,
  Satellite,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useFaciLocation, type FaciLocationStatus } from "@/components/FaciLocationTracker";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { useLocationOptions } from "@/components/useLocationOptions";
import { useGroup } from "@/components/useGroup";
import { useProfile } from "@/components/ProfileProvider";
import { DETAILS_MAX, LOC_STATUSES, OTHER_TEXT_MAX, clock, describeLocation, type FaciLocation, type LocStatus } from "@/lib/faciLocation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Group } from "@/lib/types";
import { friendlyError } from "@/lib/utils";

import "./freshie.css";
import { themeFromColor } from "./groupTheme";

// The Facilitator's Checklist page (/checklist, the center tab).
//   Set up once: the group's name and slogan (ticked once it is set).
//   Keep updated: Admin can ask for these at any time, so they are never
//   "done". In order: Manual Location Update and Attendance, which show
//   when they were last sent and turn amber once that is over STALE_MIN old,
//   then Live GPS: this phone's location status with a Refresh button
//   (FaciLocationTracker).

type Headcount = {
  headcount: number;
  local_count: number | null;
  international_count: number | null;
  updated_at?: string;
};

/** Minutes after which an attendance count or a manual location update is "due" again. */
const STALE_MIN = 30;

/** The current time, ticking every 30 s, for "5 min ago" labels. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function ago(iso: string | Date, now: number) {
  const min = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

function isStale(iso: string | undefined | null, now: number) {
  return !iso || now - new Date(iso).getTime() > STALE_MIN * 60_000;
}

/** "" or a non-number is "not counted" (null); otherwise a whole number of 0 or more. */
function countValue(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : Math.max(0, n);
}

function headcountSummary(h: Headcount | null) {
  if (!h) return "Not counted yet";
  if (h.local_count == null || h.international_count == null) return `${h.headcount} people`;
  return `${h.headcount} people / ${h.local_count} Local / ${h.international_count} International`;
}

/** − / number / + for counting people at the gathering point; the number can also be typed. */
function Counter({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const n = countValue(value) ?? 0;
  return (
    <div className="fh-counter">
      <label htmlFor={id}>{label}</label>
      <div className="fh-stepper">
        <button type="button" aria-label={`One less ${label}`} disabled={n === 0} onClick={() => onChange(String(n - 1))}>
          <Minus size={18} aria-hidden />
        </button>
        <input
          id={id}
          className="fh-slab"
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" aria-label={`One more ${label}`} onClick={() => onChange(String(n + 1))}>
          <Plus size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * One task card. `state`: "done" / "todo" for a one-off task (a tick or its
 * number), "fresh" / "due" for one Admin can ask for again (its icon, accent
 * or amber, and `when` on the right).
 */
function Task({
  id,
  Icon,
  title,
  status,
  state,
  when,
  open,
  onToggle,
  children,
}: {
  id: string;
  Icon: LucideIcon;
  title: string;
  status: string;
  state: "done" | "todo" | "fresh" | "due";
  when?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const bodyId = `fh-cl-${id}`;
  return (
    <li className="fh-cl-task" data-state={state} data-open={open || undefined}>
      <button type="button" className="fh-cl-head" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <span className="fh-cl-disc" aria-hidden>
          {state === "done" ? <Check size={18} strokeWidth={3} /> : <Icon size={18} />}
        </span>
        <span className="fh-cl-title">
          <b>{title}</b>
          <small>{status}</small>
        </span>
        {when && <span className="fh-cl-when fh-mono">{when}</span>}
        <ChevronDown size={20} aria-hidden className="fh-cl-chev" />
      </button>
      <div id={bodyId} className="fh-cl-body" hidden={!open}>
        {children}
      </div>
    </li>
  );
}

const GPS_LABEL: Record<FaciLocationStatus, { text: string; tone: "ok" | "warn" | "bad" | "off" }> = {
  active: { text: "Live", tone: "ok" },
  imprecise: { text: "Approximate", tone: "warn" },
  requesting: { text: "Finding You", tone: "warn" },
  prompt: { text: "Not Allowed Yet", tone: "warn" },
  denied: { text: "Blocked", tone: "bad" },
  unavailable: { text: "Not Sending", tone: "bad" },
  error: { text: "Not Sending", tone: "bad" },
  idle: { text: "Off", tone: "off" },
};

/** This phone's GPS for the group's map pin: status, last fix, Refresh, Keep tracking. */
function GpsCard({ now }: { now: number }) {
  const { status, lastReportedAt, accuracy, error, requestLocation, keepAwake, setKeepAwake, wakeLock } = useFaciLocation();
  const [refreshing, setRefreshing] = useState(false);
  const sentAt = useRef<Date | null>(null);
  const label = GPS_LABEL[status];

  // A refresh ends when a new fix is sent, the phone reports a problem, or after 25 s.
  useEffect(() => {
    if (!refreshing) return;
    if (lastReportedAt !== sentAt.current || label.tone === "bad") {
      setRefreshing(false);
      return;
    }
    const t = setTimeout(() => setRefreshing(false), 25_000);
    return () => clearTimeout(t);
  }, [refreshing, lastReportedAt, label.tone]);

  function refresh() {
    sentAt.current = lastReportedAt;
    setRefreshing(true);
    requestLocation();
  }

  const busy = refreshing || status === "requesting";
  const detail = lastReportedAt
    ? `Sent ${ago(lastReportedAt, now)}${accuracy != null ? ` / ±${Math.round(accuracy)} m` : ""}`
    : "Nothing sent yet";

  return (
    <li className="fh-cl-gps" data-tone={label.tone}>
      <div className="fh-cl-gps-row">
        <span className="fh-cl-disc" aria-hidden>
          <Satellite size={18} />
        </span>
        <span className="fh-cl-title">
          <b>Live GPS</b>
          <small>{detail}</small>
        </span>
        <span className="fh-cl-pill fh-mono" role="status">
          <i aria-hidden /> {label.text}
        </span>
      </div>
      {label.tone !== "ok" && error && <p className="fh-cl-gps-err">{error}</p>}
      <div className="fh-cl-gps-actions">
        <button type="button" className="fh-btn fh-btn-primary" onClick={refresh} disabled={busy}>
          <RefreshCw size={16} aria-hidden className={busy ? "fh-cl-spin" : undefined} />
          {busy ? "Refreshing…" : status === "prompt" ? "Allow Location" : "Refresh GPS"}
        </button>
        <label className="fh-cl-switch">
          <input type="checkbox" checked={keepAwake} onChange={(e) => setKeepAwake(e.target.checked)} />
          <span aria-hidden />
          Keep Tracking
        </label>
      </div>
      {keepAwake && wakeLock === "unsupported" && (
        <small className="fh-cl-gps-note">This browser can&apos;t keep the screen on. Keep the app open.</small>
      )}
    </li>
  );
}

export function FaciChecklist() {
  const profile = useProfile();
  const { group } = useGroup();
  const theme = themeFromColor(group?.color);
  return (
    <div
      className={`fh fh-cl ${vxSlab.variable} ${vxDisplay.variable}`}
      style={
        {
          "--fh-accent": theme.accent,
          "--fh-glow": theme.glow,
          "--fh-blue": theme.accent,
          "--fh-blue-light": theme.accentLight,
          "--fh-on-blue": theme.onAccent,
        } as React.CSSProperties
      }
    >
      <div className="fh-bg" aria-hidden>
        <div className="fh-glow" style={{ width: 360, height: 360, background: "var(--fh-glow)", right: -160, top: 20, opacity: 0.3 }} />
        <div className="fh-glow" style={{ width: 260, height: 260, background: "#0DFCFD", left: -140, bottom: 60, opacity: 0.1 }} />
      </div>
      <ChecklistTasks group={group} groupId={profile.group_id} />
    </div>
  );
}

function ChecklistTasks({ group, groupId }: { group: Group | null; groupId: number | null }) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [displayName, setDisplayName] = useState("");
  const [slogan, setSlogan] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameNotice, setNameNotice] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  // Faci counts Local and International; Total is their sum. Same group_headcounts
  // row and fn_set_headcount as Admin > Headcount and /attendance.
  const [local, setLocal] = useState("");
  const [international, setInternational] = useState("");
  const [saved, setSaved] = useState<Headcount | null>(null);
  const [savingCount, setSavingCount] = useState(false);
  const [countError, setCountError] = useState<string | null>(null);
  const [countNotice, setCountNotice] = useState<string | null>(null);
  // One task open at a time.
  const [open, setOpen] = useState<"name" | "count" | "loc" | null>(null);
  const toggle = (k: "name" | "count" | "loc") => setOpen((cur) => (cur === k ? null : k));
  const now = useNow();

  // Manual Location Update: a text-only note of where the GROUP is (status +
  // building), sent by any Faci in it. Not GPS, not the map, not station check-in. Each submit adds an
  // entry; Admin sees the latest one on Headcount and location.
  const [locStatus, setLocStatus] = useState<LocStatus>("heading_to");
  const [locOther, setLocOther] = useState("");
  const [locBuilding, setLocBuilding] = useState("");
  const [locDetails, setLocDetails] = useState("");
  const { names: locNames } = useLocationOptions();
  const [locLast, setLocLast] = useState<FaciLocation | null>(null);
  const [locSaving, setLocSaving] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [locNotice, setLocNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!group || seeded) return;
    setDisplayName(group.display_name ?? "");
    setSlogan(group.slogan ?? "");
    setSeeded(true);
  }, [group, seeded]);

  useEffect(() => {
    if (!groupId) return;
    let active = true;
    supabase
      .from("group_headcounts")
      .select("headcount, local_count, international_count, updated_at")
      .eq("group_id", groupId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        const row = data as Headcount | null;
        setSaved(row);
        setLocal(row?.local_count == null ? "" : String(row.local_count));
        setInternational(row?.international_count == null ? "" : String(row.international_count));
      });
    return () => {
      active = false;
    };
  }, [supabase, groupId]);

  // The group's latest entry (RLS: their group's rows), whoever in the group
  // sent it. Live, so a colleague's update and an Admin correction show up here.
  useEffect(() => {
    let active = true;
    async function loadLast() {
      const { data } = await supabase
        .from("faci_location_updates")
        .select("id, user_id, group_id, status, other_text, building, details, created_at, edited_by, edited_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (active) setLocLast((data as FaciLocation | null) ?? null);
    }
    loadLast();
    const channel = supabase
      .channel(`faci-loc-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "faci_location_updates" }, loadLast)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function saveLocation(e: React.FormEvent) {
    e.preventDefault();
    setLocError(null);
    setLocNotice(null);
    if (!locBuilding) return setLocError("Choose a building.");
    if (locStatus === "other" && !locOther.trim()) return setLocError("Type your status.");
    setLocSaving(true);
    const { error } = await supabase.rpc("fn_faci_log_location", {
      p_status: locStatus,
      p_other_text: locStatus === "other" ? locOther : null,
      p_building: locBuilding,
      p_details: locDetails,
    });
    setLocSaving(false);
    if (error) return setLocError(friendlyError(error));
    setLocNotice("Saved. Admin can see it now.");
    setLocOther("");
    setLocDetails("");
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setNameError(null);
    setNameNotice(null);
    setSavingName(true);
    const { error } = await supabase.rpc("fn_set_group_profile", {
      p_display_name: displayName,
      p_slogan: slogan,
    });
    setSavingName(false);
    if (error) setNameError(friendlyError(error));
    else setNameNotice("Saved.");
  }

  const localN = countValue(local);
  const internationalN = countValue(international);
  const counted = localN !== null || internationalN !== null;
  // A blank side counts as 0 once the other side has a number.
  const total = (localN ?? 0) + (internationalN ?? 0);

  async function saveHeadcount(e: React.FormEvent) {
    e.preventDefault();
    if (!counted) return;
    setCountError(null);
    setCountNotice(null);
    setSavingCount(true);
    const next: Headcount = {
      headcount: total,
      local_count: localN ?? 0,
      international_count: internationalN ?? 0,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.rpc("fn_set_headcount", {
      p_count: next.headcount,
      p_local: next.local_count,
      p_international: next.international_count,
    });
    setSavingCount(false);
    if (error) return setCountError(friendlyError(error));
    setSaved(next);
    setLocal(String(next.local_count));
    setInternational(String(next.international_count));
    setCountNotice("Saved. Admin can see it now.");
  }

  const countDue = isStale(saved?.updated_at, now);
  const locDue = isStale(locLast?.created_at, now);

  return (
    <div className="fh-cl-inner">
      <header className="fh-cl-top">
        <p className="fh-eyebrow fh-mono">Facilitator{group ? ` / ${group.name}` : ""}</p>
        <h1 className="fh-h2 fh-slab">Checklist</h1>
        <p className="fh-lead">Set your group up once, then keep Admin updated through the day.</p>
      </header>

      <h2 className="fh-cl-sec fh-mono">Set Up</h2>
      <ol className="fh-cl-list">
        <Task
          id="name"
          Icon={Megaphone}
          title="Group Name and Slogan"
          status={group?.display_name || "Not set yet"}
          state={group?.display_name ? "done" : "todo"}
          open={open === "name"}
          onToggle={() => toggle("name")}
        >
          <p>
            {group ? `${group.name} is your number.` : "You are not in a group yet."} Choose the name your group goes by.
          </p>
          <form onSubmit={saveProfile}>
            <label>
              Name
              <input
                className="fh-input"
                required
                maxLength={40}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Group name"
              />
            </label>
            <label>
              Slogan
              <input
                className="fh-input"
                maxLength={80}
                value={slogan}
                onChange={(e) => setSlogan(e.target.value)}
                placeholder="A short slogan"
              />
            </label>
            <button type="submit" className="fh-btn fh-btn-primary" disabled={savingName || !group}>
              Save
            </button>
            {nameError && <small className="fh-check-msg" role="alert">{nameError}</small>}
            {nameNotice && <small className="fh-check-msg">{nameNotice}</small>}
          </form>
        </Task>
      </ol>

      <div className="fh-cl-sec-row">
        <h2 className="fh-cl-sec fh-mono">Keep Updated</h2>
        <small>Keep updated anytime</small>
      </div>
      <ol className="fh-cl-list">
        <Task
          id="loc"
          Icon={Navigation}
          title="Manual Location Update"
          status={locLast ? `${describeLocation(locLast)} / ${clock(locLast.created_at)}` : "Not sent yet"}
          state={locDue ? "due" : "fresh"}
          when={locLast ? ago(locLast.created_at, now) : "Due"}
          open={open === "loc"}
          onToggle={() => toggle("loc")}
        >
          <form onSubmit={saveLocation}>
            <label>
              Status
              <select className="fh-input" value={locStatus} onChange={(e) => setLocStatus(e.target.value as LocStatus)}>
                {LOC_STATUSES.map((st) => (
                  <option key={st.value} value={st.value}>
                    {st.label}
                  </option>
                ))}
              </select>
            </label>
            {locStatus === "other" && (
              <label>
                Your Status
                <input
                  className="fh-input"
                  required
                  maxLength={OTHER_TEXT_MAX}
                  value={locOther}
                  onChange={(e) => setLocOther(e.target.value)}
                  placeholder="e.g. Taking photos"
                />
              </label>
            )}
            <label>
              Building
              <select className="fh-input" required value={locBuilding} onChange={(e) => setLocBuilding(e.target.value)}>
                <option value="" disabled>
                  Choose a building
                </option>
                {locNames.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Details (Optional)
              <textarea
                className="fh-input"
                rows={2}
                maxLength={DETAILS_MAX}
                value={locDetails}
                onChange={(e) => setLocDetails(e.target.value)}
                placeholder="example: #G07, Ground Floor Corridor"
              />
            </label>
            <button type="submit" className="fh-btn fh-btn-primary" disabled={locSaving}>
              {locSaving ? "Sending…" : "Send Update"}
            </button>
            {locError && <small className="fh-check-msg" role="alert">{locError}</small>}
            {locNotice && <small className="fh-check-msg">{locNotice}</small>}
            {locLast && (
              <small className="fh-check-msg">
                Last update: {describeLocation(locLast)} / {clock(locLast.created_at)}
                {locLast.details ? ` / "${locLast.details}"` : ""}
                {locLast.edited_at ? " (edited by Admin)" : ""}
              </small>
            )}
          </form>
        </Task>

        <Task
          id="count"
          Icon={Users}
          title="Take Attendance"
          status={headcountSummary(saved)}
          state={countDue ? "due" : "fresh"}
          when={saved?.updated_at ? ago(saved.updated_at, now) : "Due"}
          open={open === "count"}
          onToggle={() => toggle("count")}
        >
          <form onSubmit={saveHeadcount}>
            <div className="fh-count-grid">
              <Counter id="fh-count-local" label="Local" value={local} onChange={setLocal} />
              <Counter id="fh-count-intl" label="International" value={international} onChange={setInternational} />
            </div>
            <div className="fh-count-total" aria-live="polite">
              <span className="fh-mono">Total</span>
              <b className="fh-slab">{counted ? total : "–"}</b>
            </div>
            {saved && saved.local_count == null && saved.international_count == null && (
              <small className="fh-check-msg">
                Saved before as {saved.headcount} in total, with no Local / International split.
              </small>
            )}
            <button type="submit" className="fh-btn fh-btn-primary" disabled={!counted || savingCount}>
              {savingCount ? "Saving…" : "Save"}
            </button>
            {countError && <small className="fh-check-msg" role="alert">{countError}</small>}
            {countNotice && <small className="fh-check-msg">{countNotice}</small>}
          </form>
        </Task>


        <GpsCard now={now} />
      </ol>

    </div>
  );
}
