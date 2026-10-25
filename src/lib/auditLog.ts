import { describeLocation, roomOf, type LocStatus } from "@/lib/faciLocation";
import {
  PROJECTOR_CODE_NAMES,
  RISK_TIER_META,
  ROLE_LABELS,
  type AuditEntry,
  type ProjectorLocation,
  type RiskTier,
  type UserRole,
} from "@/lib/types";

// audit_log rows (0001) in words, shared by HOGM's game log (Game control →
// Log) and a group's Recent changes (Ops → Faci & Status). describeAudit()
// splits a row into the table's columns. Pages ask only for the actions in
// AUDIT_ACTIONS, so a new audit action shows once it is added there with its
// describeAudit() case. The per-person roster and its attendance marks
// (freshies, attendance_records) went in 0041, so their old actions are left out.

export type AuditKind =
  | "tokens"
  | "stations"
  | "puzzles"
  | "projectors"
  | "blindbox"
  | "game"
  | "location"
  | "headcount"
  | "facis"
  | "groups";

export const GAME_KINDS: AuditKind[] = ["tokens", "stations", "puzzles", "projectors", "blindbox", "game"];

/** Every action the logs show, and the filter it falls under. */
export const AUDIT_ACTIONS: Record<string, AuditKind> = {
  "tokens.adjust": "tokens",
  "tokens.admin_adjust": "tokens",
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
  "inventory.admin_give_piece": "puzzles",
  "puzzle.redeem": "puzzles",
  "projector.activate": "projectors",
  "projector.activate_manual": "projectors",
  "projector.game_lead_light": "projectors",
  "projector.demo_activate": "projectors",
  "projector.reset": "projectors",
  "projector.reset_all": "projectors",
  "nfc.generate": "projectors",
  "nfc.delete": "projectors",
  "nfc.test.start": "projectors",
  "nfc.test.finish": "projectors",
  "nfc.test.reset": "projectors",
  "blindbox.buy": "blindbox",
  "blindbox.open": "blindbox",
  "blindbox.admin_gift": "blindbox",
  "blindbox.admin_gift_undo": "blindbox",
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
  "faci_location.log": "location",
  "faci_location.edit": "location",
  "faci_location.option_save": "location",
  "faci_location.option_archive": "location",
  "faci_location.option_delete": "location",
  "headcount.set": "headcount",
  "headcount.clear": "headcount",
  "attendance.headcount_closed": "headcount",
  "group.faci_set": "facis",
  "faci_profile.set": "facis",
  "faci_profile.clear": "facis",
  "user.assign_group": "facis",
  "freshie.set_group_count": "groups",
  "group.set_color": "groups",
};

/** The actions under these filters. */
export const actionsOf = (kinds: AuditKind[]) => Object.keys(AUDIT_ACTIONS).filter((a) => kinds.includes(AUDIT_ACTIONS[a]));

/**
 * PostgREST `or` for the rows about one group: most name it in the target,
 * projector, NFC and new-account rows in detail.group_id.
 */
export const groupOr = (groupId: number) => `target.eq."group:${groupId}",detail->>group_id.eq.${groupId}`;

export type AuditLookups = {
  groups: Record<number, { name: string; color: string | null }>;
  stations: Record<number, string>;
  boxTypes: Record<number, string>;
  phases: Record<string, string>;
  sessions: Record<number, string>;
};

export type AuditNames = AuditLookups & { people: Record<string, string> };

/** One audit row split into the table's columns. `group` is set when the object is a group. */
export type AuditRow = { object: string; group?: number; action: string; tokens?: number; detail: string };

/** "group:3" with prefix "group" → "3"; "" when the target is something else. */
export function idOf(target: string | null, prefix: string) {
  return target?.startsWith(`${prefix}:`) ? target.slice(prefix.length + 1) : "";
}

/** 24-hour clock; the date too when it is not today. */
export function auditWhen(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}

/** The accounts (profiles) a page of rows names, to look their names up. */
export function namesIn(rows: AuditEntry[]): string[] {
  const people = new Set<string>();
  for (const r of rows) {
    if (r.actor) people.add(r.actor);
    const user = idOf(r.target, "user");
    if (user) people.add(user);
    // Faci profile rows carry the account id as the whole target.
    if (r.action.startsWith("faci_profile.") && r.target) people.add(r.target);
    if (Array.isArray(r.detail?.user_ids)) for (const id of r.detail.user_ids as string[]) people.add(id);
  }
  return [...people];
}

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

const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
const str = (v: unknown) => (v == null ? "" : String(v));
const plural = (n: number, word: string) => `${n} ${word}${Math.abs(n) === 1 ? "" : "s"}`;
const join = (...parts: unknown[]) => parts.filter((p) => typeof p === "string" && p).join(" / ");

const projectorName = (loc: unknown) => {
  const l = str(loc) as ProjectorLocation;
  return PROJECTOR_CODE_NAMES[l] ? `${PROJECTOR_CODE_NAMES[l]} projector (${l})` : `Projector ${str(loc)}`;
};

type LocDetail = { status?: unknown; other_text?: unknown; building?: unknown; details?: unknown } | null | undefined;

/** A location update as the Ops page shows it: "Arrived at B1-215", a comment after it. */
function locationText(l: LocDetail) {
  if (!l) return "";
  const details = str(l.details).trim() || null;
  const room = roomOf(details);
  const where = describeLocation({ status: str(l.status) as LocStatus, other_text: str(l.other_text) || null, building: str(l.building) });
  return join(room ? `${where}-${room}` : where, !room && details && `"${details}"`);
}

/** "12 (8 local, 4 international)". */
function headcountText(h: { total?: unknown; local?: unknown; international?: unknown } | null | undefined) {
  if (!h || h.total == null) return "";
  const split = h.local != null && h.international != null ? ` (${num(h.local)} local, ${num(h.international)} international)` : "";
  return `${num(h.total)}${split}`;
}

export function describeAudit(e: AuditEntry, n: AuditNames): AuditRow {
  const d = e.detail ?? {};
  const target = (prefix: string) => idOf(e.target, prefix);
  const groupName = (id: unknown) => n.groups[num(id)]?.name ?? `Group ${str(id)}`;
  const onGroup = (id: unknown) => ({ object: groupName(id), group: num(id) });
  const station = (id: unknown) => n.stations[num(id)] ?? `Station #${str(id)}`;
  const person = (id: unknown) => n.people[str(id)] ?? "someone";
  const boxType = (id: unknown) => n.boxTypes[num(id)] ?? "Blind box";
  const phase = (key: string) => n.phases[key] ?? key;
  const session = (id: unknown) => n.sessions[num(id)] ?? `session #${str(id)}`;
  const test = d.test_run_id && "NFC test";
  const day = d.day && `Day ${str(d.day)}`;
  const G = onGroup(target("group"));
  const P = projectorName(target("projector"));

  switch (e.action) {
    case "tokens.adjust": {
      const reason = str(d.reason).trim();
      return { ...G, action: "Tokens changed by hand", tokens: num(d.delta), detail: join(reason && `"${reason}"`, `balance ${num(d.balance_after)}`) };
    }
    case "tokens.admin_adjust": {
      const reason = str(d.reason).trim();
      return { ...G, action: "Tokens changed (Game master)", tokens: num(d.delta), detail: join(reason && `"${reason}"`, `balance ${num(d.balance_after)}`) };
    }
    case "tokens.day1_reward":
      return { ...G, action: d.result === "win" ? "Day 1 win" : "Day 1 loss", tokens: num(d.delta), detail: `balance ${num(d.balance_after)}` };
    case "tokens.undo":
      return { ...G, action: "Token change undone", detail: `transaction #${str(d.original_tx)}` };
    case "tokens.reset":
      return {
        object: "Every group",
        action: "Tokens and puzzles reset",
        detail: join(
          `${plural(num(d.groups_zeroed), "group")} back to 0`,
          `${plural(num(d.pieces_deleted), "piece")} removed`,
          `${plural(num(d.logs_deleted), "token log row")} removed`
        ),
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
    case "inventory.admin_give_piece":
      return { ...G, action: "Piece given (Game master)", detail: join(projectorName(d.location), `piece ${num(d.index)}`) };
    case "puzzle.redeem": {
      const note = str(d.nfc_note).trim();
      return { ...G, action: "Puzzle handed in", detail: join(projectorName(d.location), note && `"${note}"`) };
    }
    case "projector.activate":
      return { object: P, action: "Lit with an NFC scan", detail: join(groupName(d.group_id), test) };
    case "projector.activate_manual":
      return { object: P, action: "Lit by hand", detail: join(`for ${groupName(d.group_id)}`, test) };
    case "projector.game_lead_light":
      return { object: P, action: d.replaced ? "Lit by hand, taken over" : "Lit by hand", detail: `for ${groupName(d.group_id)}` };
    case "projector.demo_activate":
      return { object: P, action: "Lit (demo)", detail: `for ${groupName(d.group_id)}` };
    case "projector.reset_all":
      return { object: "Every key", action: "Funfair reset", detail: `${num(d.count)} lit key${num(d.count) === 1 ? "" : "s"} cleared` };
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
    case "blindbox.admin_gift":
      return { ...G, action: "Blind box gift", detail: join(boxType(d.type), `${num(d.quantity)} box${num(d.quantity) === 1 ? "" : "es"}`) };
    case "blindbox.admin_gift_undo":
      return { object: "Blind box", action: "Gift taken back", detail: "" };
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
    case "faci_location.log":
      return { ...G, action: "Location sent", detail: locationText(d as LocDetail) };
    case "faci_location.edit":
      return { ...G, action: "Location edited", detail: `${locationText(d.before as LocDetail)} → ${locationText(d.after as LocDetail)}` };
    case "faci_location.option_save":
      return {
        object: `Location option "${str(d.name)}"`,
        action: d.created ? "Created" : d.renamed_from ? "Renamed" : "Edited",
        detail: d.renamed_from ? `was "${str(d.renamed_from)}"` : "",
      };
    case "faci_location.option_archive":
    case "faci_location.option_delete":
      return { object: `Location option "${str(d.name)}"`, action: e.action.endsWith("archive") ? "Archived" : "Deleted", detail: "" };
    case "headcount.set": {
      const before = headcountText(d.before as Parameters<typeof headcountText>[0]);
      return { ...G, action: "Headcount set", detail: join(headcountText(d.after as Parameters<typeof headcountText>[0]), before && `was ${before}`) };
    }
    case "headcount.clear": {
      const before = headcountText(d.before as Parameters<typeof headcountText>[0]);
      return { ...G, action: "Headcount cleared", detail: before && `was ${before}` };
    }
    case "attendance.headcount_closed":
      return { ...G, action: "Headcount after close", detail: join(session(d.session_id), str(d.headcount)) };
    case "group.faci_set": {
      const ids = Array.isArray(d.user_ids) ? (d.user_ids as string[]) : [];
      return { ...G, action: "Facilitators set", detail: ids.length ? ids.map(person).join(", ") : "none" };
    }
    case "faci_profile.set":
      return { object: person(e.target), action: "Profile updated", detail: "" };
    case "faci_profile.clear": {
      const fields = Array.isArray(d.fields) ? (d.fields as string[]) : [];
      return { object: person(e.target), action: "Profile cleared", detail: fields.join(", ") };
    }
    case "user.assign_group":
      return { object: person(target("user")), action: "Moved to a group", detail: groupName(d.group_id) };
    case "freshie.set_group_count":
      return { object: "Groups", action: "Number of groups set", detail: str(d.count) };
    case "group.set_color":
      return { ...G, action: "Colour changed", detail: str(d.color) };
    default:
      return { object: e.target ?? "", action: e.action, detail: "" };
  }
}

function describeConfig(key: string, value: unknown, phase: (key: string) => string): AuditRow {
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
