"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { groupColor } from "@/components/freshie/groupTheme";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  PROJECTOR_CODE_NAMES,
  RISK_TIER_META,
  ROLE_LABELS,
  type AuditEntry,
  type ProjectorLocation,
  type RiskTier,
  type UserRole,
} from "@/lib/types";
import { friendlyError, timeAgo } from "@/lib/utils";

import { StatusLine, useStatus } from "./parts";

// HOGM's game log: the game rows of audit_log (tokens, stations, puzzles,
// projectors, blind boxes, games and settings), newest first, as a table:
// time, who did it, what it was done to, the action, the token change and the
// details. HOGM reads audit_log under 0002's "leads read audit log". Only the
// actions in ACTIONS are asked for, so account and Faci changes stay on
// Admin → Audit; that is a page filter, the policy still lets HOGM read every
// row. A new audit action shows here once it is added to ACTIONS and
// describe().

type Kind = "tokens" | "stations" | "puzzles" | "projectors" | "blindbox" | "game";

const KINDS: { key: Kind | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "tokens", label: "Tokens" },
  { key: "stations", label: "Stations" },
  { key: "puzzles", label: "Puzzles" },
  { key: "projectors", label: "Projectors" },
  { key: "blindbox", label: "Blind box" },
  { key: "game", label: "Games & settings" },
];

/** Every game action this page shows, and the filter it falls under. */
const ACTIONS: Record<string, Kind> = {
  "tokens.adjust": "tokens",
  "tokens.day1_reward": "tokens",
  "tokens.undo": "tokens",
  "tokens.reset": "tokens",
  "token_rule.update": "tokens",
  "day2.challenge": "stations",
  "station.status": "stations",
  "station.checkin": "stations",
  "station.uncheckin": "stations",
  "station.clear": "stations",
  "station.gm_assign": "stations",
  "station.gm_unassign": "stations",
  "station.gm_set": "stations",
  "inventory.grant": "puzzles",
  "puzzle.redeem": "puzzles",
  "projector.activate": "projectors",
  "projector.activate_manual": "projectors",
  "projector.demo_activate": "projectors",
  "projector.reset": "projectors",
  "nfc.generate": "projectors",
  "nfc.delete": "projectors",
  "nfc.test.start": "projectors",
  "nfc.test.finish": "projectors",
  "nfc.test.reset": "projectors",
  "blindbox.buy": "blindbox",
  "blindbox.open": "blindbox",
  "blindbox.claim": "blindbox",
  "blindbox.sale": "blindbox",
  "blindbox.assign": "blindbox",
  "blindbox.set_active": "blindbox",
  "blindbox.set_quantity": "blindbox",
  "blindbox.regenerate": "blindbox",
  "blindbox.reset": "blindbox",
  "blindbox.spot_save": "blindbox",
  "blindbox.type_save": "blindbox",
  "blindbox.type_archive": "blindbox",
  "blindbox.type_delete": "blindbox",
  "gacha.draw": "blindbox",
  "game.start": "game",
  "game.end": "game",
  "game.expired": "game",
  "phase.start": "game",
  "phase.pause": "game",
  "phase.resume": "game",
  "phase.end": "game",
  "phase.extend": "game",
  "config.set": "game",
};

type Who = "all" | "gm" | "hogm" | "admin" | "groups" | "system";

const WHO: { key: Who; label: string; roles?: UserRole[] }[] = [
  { key: "all", label: "Anyone" },
  { key: "gm", label: "Game Masters", roles: ["gm", "guardian_gm"] },
  { key: "hogm", label: "HOGM", roles: ["hogm"] },
  { key: "admin", label: "Admin", roles: ["admin"] },
  { key: "groups", label: "Groups", roles: ["freshie", "faci"] },
  { key: "system", label: "System" },
];

const STATION_STATUS: Record<string, string> = { available: "Available", in_progress: "Busy", closed: "Closed" };

const TOKEN_RULES: Record<string, string> = {
  DAY1_WIN_TOKENS: "Day 1 win",
  DAY1_LOSE_TOKENS: "Day 1 lose",
  EASY_COST: "Day 2 Easy entry fee",
  MEDIUM_COST: "Day 2 Medium entry fee",
  HARD_COST: "Day 2 Hard entry fee",
};

/** On / off settings (game_config), by key. */
const SWITCHES: Record<string, string> = {
  tokens_frozen: "Token freeze",
  rehearsal_mode: "Rehearsal mode",
  blindbox_disabled: "Blind box buying paused",
  gacha_disabled: "Gacha paused",
  nfc_disabled: "NFC paused",
  nfc_demo_mode: "NFC demo mode",
  day2_map_layer: "Day 2 map layer (map unlock)",
};

const PHASE_VERBS: Record<string, string> = { start: "Started", pause: "Paused", resume: "Resumed", end: "Ended" };

const PAGE = 50;

type Lookups = {
  groups: Record<number, { name: string; color: string }>;
  stations: Record<number, string>;
  boxTypes: Record<number, string>;
  phases: Record<string, string>;
};

type Names = Lookups & { people: Record<string, string> };

/** One audit row split into the table's columns. `group` gives the object its group's colour dot. */
type Row = { object: string; group?: number; action: string; tokens?: number; detail: string };

const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
const str = (v: unknown) => (v == null ? "" : String(v));
const plural = (n: number, word: string) => `${n} ${word}${Math.abs(n) === 1 ? "" : "s"}`;
const join = (...parts: unknown[]) => parts.filter((p) => typeof p === "string" && p).join(" · ");

/** "group:3" with prefix "group" → "3"; "" when the target is something else. */
function idOf(target: string | null, prefix: string) {
  return target?.startsWith(`${prefix}:`) ? target.slice(prefix.length + 1) : "";
}

const projectorName = (loc: unknown) => {
  const l = str(loc) as ProjectorLocation;
  return PROJECTOR_CODE_NAMES[l] ? `${PROJECTOR_CODE_NAMES[l]} projector (${l})` : `Projector ${str(loc)}`;
};

/** 24-hour clock; the date too when it is not today. */
function when(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}

function describe(e: AuditEntry, n: Names): Row {
  const d = e.detail ?? {};
  const target = (prefix: string) => idOf(e.target, prefix);
  const groupName = (id: unknown) => n.groups[num(id)]?.name ?? `Group ${str(id)}`;
  const onGroup = (id: unknown) => ({ object: groupName(id), group: num(id) });
  const station = (id: unknown) => n.stations[num(id)] ?? `Station #${str(id)}`;
  const person = (id: unknown) => n.people[str(id)] ?? "someone";
  const boxType = (id: unknown) => n.boxTypes[num(id)] ?? "Blind box";
  const phase = (key: string) => n.phases[key] ?? key;
  const test = d.test_run_id && "NFC test";
  const day = d.day && `Day ${str(d.day)}`;
  const G = onGroup(target("group"));
  const P = projectorName(target("projector"));

  switch (e.action) {
    case "tokens.adjust": {
      const reason = str(d.reason).trim();
      return { ...G, action: "Tokens changed by hand", tokens: num(d.delta), detail: join(reason && `"${reason}"`, `balance ${num(d.balance_after)}`) };
    }
    case "tokens.day1_reward":
      return { ...G, action: d.result === "win" ? "Day 1 win" : "Day 1 loss", tokens: num(d.delta), detail: `balance ${num(d.balance_after)}` };
    case "tokens.undo":
      return { ...G, action: "Token change undone", detail: `transaction #${str(d.original_tx)}` };
    case "tokens.reset":
      return {
        object: "Every group",
        action: "Tokens and puzzles reset",
        detail: join(`${plural(num(d.groups_zeroed), "group")} back to 0`, `${plural(num(d.pieces_deleted), "piece")} removed`, `${plural(num(d.logs_deleted), "token log row")} removed`),
      };
    case "token_rule.update": {
      const key = target("rule");
      return { object: "Token rules", action: "Rule changed", detail: `${TOKEN_RULES[key] ?? key}: ${str(d.value)}` };
    }
    case "day2.challenge": {
      const tier = RISK_TIER_META[str(d.tier) as RiskTier]?.label ?? str(d.tier);
      return {
        ...G,
        action: d.success ? "Day 2 win" : "Day 2 loss",
        tokens: -num(d.cost),
        detail: join(station(d.station), tier, d.success && `won ${str(d.piece) || "a puzzle piece"}`),
      };
    }
    case "station.status":
      return { object: station(target("station")), action: "Status changed", detail: `now ${STATION_STATUS[str(d.status)] ?? str(d.status)}` };
    case "station.checkin":
      return { ...G, action: "Checked in", detail: str(d.station_name) || station(d.station_id) };
    case "station.uncheckin":
      return { ...G, action: "Check-in removed", detail: station(d.station_id) };
    case "station.clear":
      return { object: station(target("station")), action: "Every group checked out", detail: "" };
    case "station.gm_assign":
      return { object: station(d.station_id), action: "GM assigned", detail: join(person(target("user")), day) };
    case "station.gm_unassign":
      return { object: station(d.station_id), action: "GM removed", detail: person(target("user")) };
    case "station.gm_set": {
      const ids = Array.isArray(d.user_ids) ? (d.user_ids as string[]) : [];
      return { object: station(target("station")), action: "GMs set", detail: join(ids.length ? ids.map(person).join(", ") : "none", day) };
    }
    case "inventory.grant":
      return { ...G, action: "Piece given", detail: str(d.item_name) };
    case "puzzle.redeem": {
      const note = str(d.nfc_note).trim();
      return { ...G, action: "Puzzle handed in", detail: join(projectorName(d.location), note && `"${note}"`) };
    }
    case "projector.activate":
      return { object: P, action: "Lit with an NFC scan", detail: join(groupName(d.group_id), test) };
    case "projector.activate_manual":
      return { object: P, action: "Lit by hand", detail: join(`for ${groupName(d.group_id)}`, test) };
    case "projector.demo_activate":
      return { object: P, action: "Lit (demo)", detail: `for ${groupName(d.group_id)}` };
    case "projector.reset":
      return { object: P, action: "Set to not lit", detail: d.was_group_id ? `was lit by ${groupName(d.was_group_id)}` : "" };
    case "nfc.generate":
      return { object: P, action: "NFC codes made", detail: join(plural(num(d.count), "code"), test) };
    case "nfc.delete":
      return { object: projectorName(d.location), action: "NFC code deleted", detail: `"${str(d.label)}"` };
    case "nfc.test.start":
    case "nfc.test.finish":
      return {
        object: projectorName(d.location),
        action: e.action === "nfc.test.start" ? "NFC test started" : "NFC test finished",
        detail: `for ${groupName(d.group_id)}`,
      };
    case "nfc.test.reset":
      return { object: "NFC test", action: "Test reset", detail: "" };
    case "blindbox.buy": {
      const price = num(d.price);
      return { ...G, action: "Bought a blind box", tokens: -price, detail: join(boxType(d.type), `from ${str(d.seller)}`, price === 0 && "free") };
    }
    case "blindbox.open":
      return { ...G, action: "Opened a blind box", tokens: num(d.tokens), detail: boxType(d.type) };
    case "blindbox.claim":
      return {
        ...G,
        action: "Bought and opened a blind box",
        tokens: num(d.tokens) - num(d.price),
        detail: join(boxType(d.type), `from ${str(d.seller)}`, `paid ${num(d.price)}, got ${num(d.tokens)}`),
      };
    case "blindbox.sale":
      return { ...G, action: "Bought and opened a blind box", tokens: num(d.tokens) - num(d.price), detail: `paid ${num(d.price)}, got ${num(d.tokens)}` };
    case "blindbox.assign":
      return {
        object: `${boxType(target("type"))} boxes`,
        action: "Handed out",
        detail: join(
          `${num(d.quantity_each)} each to ${plural(num(d.sellers), "seller")}`,
          d.role && ROLE_LABELS[d.role as UserRole],
          `${num(d.total)} in all`
        ),
      };
    case "blindbox.set_active":
      return { object: "A seller's boxes", action: d.active ? "Switched on" : "Switched off", detail: "" };
    case "blindbox.set_quantity":
      return { object: "A seller's boxes", action: "Stock changed", detail: `${num(d.from)} → ${num(d.to)}` };
    case "blindbox.regenerate":
      return { object: "A seller", action: "QR replaced", detail: "" };
    case "blindbox.reset":
      return {
        object: "Blind boxes",
        action: "Restored",
        detail: join(`${plural(num(d.claims), "sale")} undone`, d.tokens_put_back ? `tokens given back to ${plural(num(d.groups), "group")}` : "tokens kept"),
      };
    case "blindbox.spot_save":
      return { object: "Spot box", action: "Saved", detail: join(`${num(d.min)}–${num(d.max)} tokens`, `${num(d.pool)} in the pool`, d.active ? "on" : "off") };
    case "blindbox.type_save":
      return {
        object: `Box type "${str(d.name)}"`,
        action: d.created ? "Created" : "Edited",
        detail: join(`${num(d.min)}–${num(d.max)} tokens`, `price ${num(d.price)}`, `stock ${num(d.stock)}`, d.special && "special"),
      };
    case "blindbox.type_archive":
    case "blindbox.type_delete":
      return { object: `Box type "${str(d.name)}"`, action: e.action === "blindbox.type_archive" ? "Archived" : "Deleted", detail: "" };
    case "gacha.draw":
      return { ...G, action: "Gacha draw", detail: join(`"${str(d.entry)}"`, str(d.pool)) };
    case "game.start":
    case "game.end":
      return { object: phase(target("phase")), action: e.action === "game.start" ? "Game started" : "Game ended", detail: "" };
    case "game.expired":
      return { object: "Games", action: "Timer ran out", detail: `${plural(num(d.count), "game")} ended` };
    case "phase.start":
    case "phase.pause":
    case "phase.resume":
    case "phase.end":
      return { object: phase(target("phase")), action: PHASE_VERBS[e.action.slice(6)], detail: "" };
    case "phase.extend":
      return { object: phase(target("phase")), action: "Extended", detail: `+${num(d.extend_minutes)} min` };
    case "config.set":
      return describeConfig(target("config"), d.value, phase);
    default:
      return { object: e.target ?? "", action: e.action, detail: "" };
  }
}

function describeConfig(key: string, value: unknown, phase: (key: string) => string): Row {
  if (SWITCHES[key]) return { object: SWITCHES[key], action: value === true || value === "true" ? "Turned on" : "Turned off", detail: "" };
  if (key.startsWith("puzzle_image_")) return { object: projectorName(key.slice(13)), action: "New puzzle picture", detail: "" };
  if (key.startsWith("projector_place_")) {
    const place = value as { name?: unknown } | null;
    return { object: projectorName(key.slice(16)), action: "Place set", detail: `"${str(place?.name)}"` };
  }
  if (key.startsWith("bonding_session_duration_")) return { object: phase(key.slice(25)), action: "Game length set", detail: `${str(value)} min` };
  if (key === "undo_window_minutes") return { object: "Undo window", action: "Set", detail: `${str(value)} min` };
  if (key === "blindbox_group_cap") return { object: "Blind boxes per group", action: "Set", detail: str(value) };
  const shown = JSON.stringify(value) ?? "";
  return { object: `Setting "${key}"`, action: "Changed", detail: shown.length > 80 ? `${shown.slice(0, 80)}…` : shown };
}

export function LogSection() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { error, setError } = useStatus();
  const [kind, setKind] = useState<Kind | "all">("all");
  const [who, setWho] = useState<Who>("all");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lookups, setLookups] = useState<Lookups>({ groups: {}, stations: {}, boxTypes: {}, phases: {} });
  // Only the latest load may write, so a slow answer for an old filter is dropped.
  const seq = useRef(0);

  useEffect(() => {
    (async () => {
      const [{ data: g }, { data: s }, { data: t }, { data: p }] = await Promise.all([
        supabase.from("groups").select("id, name, color").order("id"),
        supabase.from("stations").select("id, name"),
        supabase.from("blind_box_types").select("id, name"),
        supabase.from("phases").select("key, name"),
      ]);
      const byId = (list: { id: number; name: string }[] | null) => Object.fromEntries((list ?? []).map((r) => [r.id, r.name]));
      setLookups({
        groups: Object.fromEntries(
          ((g as { id: number; name: string; color: string | null }[]) ?? []).map((r) => [r.id, { name: r.name, color: groupColor(r.color) }])
        ),
        stations: byId(s),
        boxTypes: byId(t),
        phases: Object.fromEntries(((p as { key: string; name: string }[]) ?? []).map((r) => [r.key, r.name])),
      });
    })();
  }, [supabase]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    const actions = Object.keys(ACTIONS).filter((a) => kind === "all" || ACTIONS[a] === kind);
    let query = supabase
      .from("audit_log")
      .select("*")
      .in("action", actions)
      .order("created_at", { ascending: false })
      // One extra row tells whether there is more.
      .limit(limit + 1);
    const roles = WHO.find((w) => w.key === who)?.roles;
    if (who === "system") query = query.is("actor_role", null);
    else if (roles) query = query.in("actor_role", roles);
    // Most rows name the group in the target; projector and NFC rows in detail.
    if (groupId != null) query = query.or(`target.eq."group:${groupId}",detail->>group_id.eq.${groupId}`);
    const { data, error: err } = await query;
    if (mine !== seq.current) return;
    if (err) {
      setLoading(false);
      return setError(friendlyError(err));
    }
    const list = (data as AuditEntry[]) ?? [];
    const shown = list.slice(0, limit);
    // Names for whoever acted and for the Game Masters a station change names.
    const ids = new Set<string>();
    for (const r of shown) {
      if (r.actor) ids.add(r.actor);
      const user = idOf(r.target, "user");
      if (user) ids.add(user);
      if (Array.isArray(r.detail?.user_ids)) for (const id of r.detail.user_ids as string[]) ids.add(id);
    }
    const { data: found } = ids.size
      ? await supabase.from("profiles").select("id, full_name").in("id", [...ids])
      : { data: [] };
    if (mine !== seq.current) return;
    setPeople(Object.fromEntries(((found as { id: string; full_name: string | null }[]) ?? []).map((p) => [p.id, p.full_name || "Someone"])));
    setRows(shown);
    setHasMore(list.length > limit);
    setError(null);
    setLoading(false);
  }, [supabase, kind, who, groupId, limit, setError]);

  // No realtime on audit_log, so the list refreshes every 30 s.
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const names: Names = { ...lookups, people };
  const groups = Object.entries(lookups.groups);

  return (
    <div className="gc-stack">
      <StatusLine error={error} notice={null} />

      <div className="gc-card gc-log-filters">
        <div className="gc-field">
          <span>What</span>
          <div className="gc-pills" role="group" aria-label="What happened">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                aria-pressed={kind === k.key}
                onClick={() => {
                  setKind(k.key);
                  setLimit(PAGE);
                }}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>
        <div className="gc-field">
          <span>Who</span>
          <div className="gc-pills" role="group" aria-label="Who did it">
            {WHO.map((w) => (
              <button
                key={w.key}
                type="button"
                aria-pressed={who === w.key}
                onClick={() => {
                  setWho(w.key);
                  setLimit(PAGE);
                }}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
        <div className="gc-toolbar">
          <select
            className="gc-input"
            aria-label="Group"
            value={groupId ?? ""}
            onChange={(e) => {
              setGroupId(e.target.value ? Number(e.target.value) : null);
              setLimit(PAGE);
            }}
          >
            <option value="">All groups</option>
            {groups.map(([id, g]) => (
              <option key={id} value={id}>
                {g.name}
              </option>
            ))}
          </select>
          <button type="button" className="gc-icon" aria-label="Refresh" disabled={loading} onClick={load}>
            <RefreshCw size={17} aria-hidden />
          </button>
        </div>
      </div>

      {/* Phones: the table slides sideways inside this card; Time stays put. */}
      <div className="gc-card gc-log-wrap">
        {rows === null ? (
          <p className="gc-empty">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="gc-empty">Nothing here yet.</p>
        ) : (
          <table className="gc-log">
            <thead>
              <tr>
                <th>Time</th>
                <th>Who</th>
                <th>Object</th>
                <th>Action</th>
                <th className="gc-log-tok">Tokens</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const row = describe(r, names);
                const dot = row.group != null ? names.groups[row.group]?.color : undefined;
                return (
                  <tr key={r.id}>
                    <td className="gc-log-time">
                      <time dateTime={r.created_at} title={new Date(r.created_at).toLocaleString()}>
                        {when(r.created_at)}
                      </time>
                      <small>{timeAgo(r.created_at)}</small>
                    </td>
                    <td className="gc-log-who">
                      <b>{r.actor ? (people[r.actor] ?? "Someone") : "System"}</b>
                      {r.actor_role && <small>{ROLE_LABELS[r.actor_role]}</small>}
                    </td>
                    <td className="gc-log-obj">
                      {dot && <i aria-hidden style={{ "--gc-log-dot": dot } as CSSProperties} />}
                      {row.object}
                    </td>
                    <td className="gc-log-act">{row.action}</td>
                    <td className="gc-log-tok" data-sign={row.tokens ? (row.tokens > 0 ? "+" : "-") : undefined}>
                      {row.tokens == null ? "" : row.tokens > 0 ? `+${row.tokens}` : row.tokens < 0 ? `−${-row.tokens}` : "0"}
                    </td>
                    <td className="gc-log-detail">{row.detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {hasMore && (
        <button type="button" className="gc-btn" disabled={loading} onClick={() => setLimit((l) => l + PAGE)}>
          Load more
        </button>
      )}
    </div>
  );
}
