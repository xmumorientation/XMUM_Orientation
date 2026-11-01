"use client";

import { Check, CircleDashed, History, TriangleAlert, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import { groupSwatch } from "@/components/freshie/groupTheme";
import { KEY_COLORS, KEY_NAMES } from "@/components/freshie/items/KeyEmblem";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { usePhases } from "@/components/PhaseTimerProvider";
import { useProfile } from "@/components/ProfileProvider";
import "@/components/staff/game/game-control.css";
import { MyActivitySheet } from "@/components/staff/game/MyActivitySheet";
import { ConfirmSheet, StatusLine, useStatus } from "@/components/staff/game/parts";
import { undoWindowMinutes } from "@/components/token/UndoWindowSetting";
import { ChallengeBanner } from "@/components/ChallengeBanner";
import { useConfig } from "@/components/useConfig";
import { useDay2State } from "@/components/useDay2State";
import { useOfflineQueue } from "@/components/useOfflineQueue";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  PIECES_PER_SET,
  PROJECTOR_LOCATIONS,
  RISK_TIER_META,
  type Day2Result,
  type ProjectorLocation,
  type Station,
  type StationStatus,
} from "@/lib/types";
import { projectorPlaces, type ProjectorPlace } from "@/lib/projectorPlaces";
import { cn, friendlyError, idemKey } from "@/lib/utils";

type GroupRow = { id: number; name: string; color: string | null; token_balance: number };
/** One of this GM's stations: one per day (gm_station_assignments, 0065). */
type DayStation = { day: 1 | 2; station: { id: number; name: string } | null };
type Counts = Record<ProjectorLocation, number>;
/** A Day 2 game the GM started: locked until its result is submitted or it is cancelled. Kept on this phone. */
type Day2Game = { stationId: number; groupId: number; locations: ProjectorLocation[] };
type Day1Outcome = "win" | "lose";
/**
 * A Day 1 game: one group, or two head to head. Each group gets its own
 * result. keys: one idempotency key per group, made at Start, so a retry
 * after a lost answer never pays twice. done: groups already paid (a failed
 * submit keeps the game for the rest). Kept on this phone.
 */
type Day1Game = {
  stationId: number | null;
  groupIds: number[];
  keys: Record<number, string>;
  results: Record<number, Day1Outcome>;
  done: number[];
};
type CheckState = "ok" | "warn" | "bad" | "wait";
/** What Undo would reverse (fn_undo_preview, 0093). fallback: that function is not on the database yet. */
type UndoPreview =
  | { fallback: true }
  | {
      fallback?: false;
      found: boolean;
      undoable?: boolean;
      why?: string | null;
      group_id?: number;
      group_name?: string;
      delta?: number;
      reason?: string;
      created_at?: string;
      window_minutes: number;
    };
type Day2Check = { label: string; text: string; state: CheckState };

const STATUS: Record<StationStatus, { label: string; tone: "ok" | "warn" | "off" }> = {
  available: { label: "Available", tone: "ok" },
  in_progress: { label: "In Progress", tone: "warn" },
  closed: { label: "Closed", tone: "off" },
};

const TOTAL_PIECES = PIECES_PER_SET * PROJECTOR_LOCATIONS.length;
type Places = Record<ProjectorLocation, ProjectorPlace>;
const labels = (places: Places, locs: ProjectorLocation[], join: string) => locs.map((l) => places[l].name).join(join);
const flag = (v: unknown) => v === true || v === "true";
const minutesAgo = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m === 0 ? "just now" : `${m} min ago`;
};

/**
 * Day 2 checks before a game, from what a GM may read. They are the reasons
 * fn_day2_challenge refuses a result (INSUFFICIENT_BALANCE, PHASE_LOCKED,
 * TOKENS_FROZEN, POOL_EXHAUSTED), so they show before the group plays instead
 * of after. The server still checks again on submit. counts: undefined while
 * loading, null when fn_puzzle_status failed. "warn" may start, "bad" and
 * "wait" may not.
 */
function day2Checks({
  station,
  balance,
  counts,
  locations,
  phaseOn,
  stationOn,
  frozen,
  places,
}: {
  station: Station | null;
  balance: number | null;
  counts: Counts | null | undefined;
  locations: ProjectorLocation[];
  phaseOn: boolean;
  /** Live control's Station game switch (Day 2 inner schedule, 0102). */
  stationOn: boolean;
  frozen: boolean;
  places: Places;
}): Day2Check[] {
  if (!station) return [{ label: "Station", text: "No station assigned to your account. Ask Admin.", state: "bad" }];
  const checks: Day2Check[] = [];
  const fee = station.entry_cost;

  if (station.status === "closed") {
    checks.push({ label: "Station", text: "Closed. Open it in Station status first.", state: "bad" });
  } else if (station.status === "in_progress") {
    checks.push({ label: "Station", text: "Shows In progress. If no other group is playing here, you can still start.", state: "warn" });
  }

  if (balance !== null) {
    checks.push(
      balance >= fee
        ? { label: "Tokens", text: `Has ${balance} / entry ${fee} / ${balance - fee} left after`, state: "ok" }
        : { label: "Tokens", text: `Has ${balance}, needs ${fee}. Short by ${fee - balance}.`, state: "bad" }
    );
  }
  if (frozen) checks.push({ label: "Token Freeze", text: "Admin froze tokens. Results are refused until they unfreeze.", state: "bad" });
  checks.push(
    phaseOn
      ? { label: "Day 2 Game", text: "Running", state: "ok" }
      : { label: "Day 2 Game", text: "Not started yet. Results are refused until Live control starts it.", state: "bad" }
  );
  if (!stationOn) checks.push({ label: "Station Game", text: "Switched off by Admin in Live control. Results are refused.", state: "bad" });

  const need = RISK_TIER_META[station.risk_tier].pick;
  const piece = "Puzzle Piece";
  if (counts === undefined) checks.push({ label: piece, text: "Checking…", state: "wait" });
  else if (counts === null) checks.push({ label: piece, text: "Could not check. The server still checks when you submit.", state: "warn" });
  else if (need === 0) {
    const total = PROJECTOR_LOCATIONS.reduce((n, l) => n + counts[l], 0);
    checks.push(
      total >= TOTAL_PIECES
        ? { label: piece, text: `Owns all ${TOTAL_PIECES} pieces. A win gives nothing.`, state: "bad" }
        : { label: piece, text: `Owns ${total}/${TOTAL_PIECES}. A win gives a piece they don't have.`, state: "ok" }
    );
  } else if (locations.length < need) {
    checks.push({ label: piece, text: need === 2 ? "Pick 2 locations above." : "Pick the location above.", state: "wait" });
  } else {
    const open = locations.filter((l) => counts[l] < PIECES_PER_SET);
    const full = locations.filter((l) => counts[l] >= PIECES_PER_SET);
    if (open.length === 0) checks.push({ label: piece, text: `${labels(places, full, " and ")} ${full.length > 1 ? "are" : "is"} full. A win gives nothing.`, state: "bad" });
    else if (full.length > 0) checks.push({ label: piece, text: `${labels(places, full, " and ")} is full, so a win gives a ${labels(places, open, " or ")} piece.`, state: "warn" });
    else checks.push({ label: piece, text: `A win gives a piece from ${labels(places, open, " or ")}.`, state: "ok" });
  }
  return checks;
}

// GM's Station panel (/gm), in the Game control look (game-control.css) of the
// ops crew's Ops page. Phones, top to bottom:
//  Status    - the station's state, shown. A game sets it (Day 1 and Day 2):
//              In progress when it starts, Available when its result is
//              submitted or it is cancelled. Admin and HOGM can still set it.
//              The GM's only manual step: Open station (Closed → Available),
//              after a confirm.
//  Group     - tap the group at the station (fn_scoreboard: name, colour, tokens);
//              on Day 1 up to two, for a head-to-head
//  Result    - Day 1: three steps. 1 Pick: one group or two. 2 Play: Start
//              locks them and checks them in here. 3 Give: Win or
//              Participation for each group (two groups may both win), then
//              one confirm sheet; each group is paid by its own
//              fn_gm_day1_reward, so a failed one can be retried alone.
//              Amounts are the admin's token rules (Token page); the server
//              reads them, the GM cannot pick one. Undo shows what it would reverse (fn_undo_preview)
//              and asks first; Admin sets the window (Token page, default 10 min).
//              Day 2: three steps, one group at a time. 1 Check: tokens, the
//              Day 2 game running, no token freeze, a piece to win (the tier's
//              locations are picked here). 2 Play: the group is locked. 3 Submit:
//              Success or Failed, then a confirm sheet. The entry fee is charged
//              only on submit (fn_day2_challenge), win or lose.
// Under the title: the GM's station on each day, the current one marked Now.
// The current station is re-read when the phases change or the page comes
// back into view (from main), so Day 1 → Day 2 needs no reload.
// The database picks the current one from Live control's phases (0065:
// profiles.station_id, Day 2 once Day 1 has ended), not from the date, so it
// follows a rehearsal too. Only the current station can be operated.
// Activity (top right): the GM's own token changes, by date (MyActivitySheet).
// No blind box: GMs show no blind box QR (not here, not on Home).
// Landscape tablets and desktops: Group and Result left, Status right.
// A station runs Day 1 or Day 2; with no station, a Day switch shows both.
// All submissions carry idempotency keys and queue offline (NFR-6).
export default function GmPanelPage() {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { queue, failed, dismissFailed, submit } = useOfflineQueue();
  const { phases, offsetMs } = usePhases();
  // The page no longer re-renders every second (usePhases has no tick), so
  // re-render once when the Day 2 phase reaches its end: phaseOn below then
  // turns off on time.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const day2EndsAt = phases.find((p) => p.key === "day2" && p.state === "active")?.ends_at ?? null;
  useEffect(() => {
    if (!day2EndsAt) return;
    const ms = Date.parse(day2EndsAt) - (Date.now() + offsetMs);
    if (!(ms > 0)) return;
    const timer = window.setTimeout(rerender, Math.min(ms + 50, 2_000_000_000));
    return () => window.clearTimeout(timer);
  }, [day2EndsAt, offsetMs]);
  const day2 = useDay2State();
  const { config } = useConfig();
  const places = projectorPlaces(config);
  const result = useStatus();
  const statusMsg = useStatus();

  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [station, setStation] = useState<Station | null>(null);
  const [pickedDay, setPickedDay] = useState<1 | 2>(1);
  const [locations, setLocations] = useState<ProjectorLocation[]>([]);
  const [busy, setBusy] = useState(false);
  // Shown on the buttons only; the server applies the current rule.
  const [day1, setDay1] = useState({ win: 2, lose: 1 });
  const [game, setGame] = useState<Day2Game | null>(null);
  // The result being confirmed: true = success, false = failed.
  const [confirmWin, setConfirmWin] = useState<boolean | null>(null);
  const [piecesFor, setPiecesFor] = useState<{ groupId: number; counts: Counts | null } | null>(null);
  const [days, setDays] = useState<DayStation[]>([]);
  const [undoAsk, setUndoAsk] = useState<UndoPreview | null>(null);
  // Keep the undo prompt's "N min ago" current while it is open.
  useEffect(() => {
    if (!undoAsk) return;
    const timer = window.setInterval(rerender, 30_000);
    return () => window.clearInterval(timer);
  }, [undoAsk]);
  // Day 1: the groups picked before Start (one, or two head to head), the
  // running game, and its results waiting for the GM's confirmation.
  const [day1Picks, setDay1Picks] = useState<number[]>([]);
  const [day1Game, setDay1Game] = useState<Day1Game | null>(null);
  const [day1Ask, setDay1Ask] = useState(false);
  const [openAsk, setOpenAsk] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  // The GM's station follows the day (the server switches profiles.station_id
  // when a day's game starts or ends, or when Admin moves the GM), so it is
  // re-read instead of trusting the value this page loaded with.
  const [stationId, setStationId] = useState<number | null>(profile.station_id);

  useEffect(() => {
    async function refresh() {
      const { data } = await supabase.from("profiles").select("station_id").eq("id", profile.id).maybeSingle();
      if (data) setStationId((data as { station_id: number | null }).station_id);
    }
    // The layout's profile is from the first page load, not from opening /gm.
    void refresh();
    const channel = supabase
      .channel(`gm-day-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "phases" }, refresh)
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [supabase, profile.id]);

  // a station runs either Day 1 or Day 2, not both
  const day = station?.day ?? pickedDay;

  // Groups with their colour and tokens. A GM cannot select the groups table,
  // so this is fn_scoreboard; reloaded after each result and every 30 s.
  const loadGroups = useCallback(async () => {
    const { data } = await supabase.rpc("fn_scoreboard");
    if (!data) return null;
    const rows = (data as GroupRow[])
      .map((g) => ({ ...g, token_balance: g.token_balance ?? 0 }))
      .sort((a, b) => a.id - b.id);
    setGroups(rows);
    return rows;
  }, [supabase]);

  // One group's piece count per location. A GM may not read inventory, but
  // fn_puzzle_status gives the counts. null if any call fails.
  const loadPieces = useCallback(
    async (id: number): Promise<Counts | null> => {
      const found = await Promise.all(
        PROJECTOR_LOCATIONS.map(async (loc) => {
          const { data, error } = await supabase.rpc("fn_puzzle_status", { p_group_id: id, p_location: loc });
          return error || !data ? null : ([loc, (data as { pieces: number }).pieces] as const);
        })
      );
      if (found.some((f) => f === null)) return null;
      return Object.fromEntries(found as (readonly [ProjectorLocation, number])[]) as Counts;
    },
    [supabase]
  );

  useEffect(() => {
    void loadGroups();
    const refreshVisible = () => { if (document.visibilityState === "visible") void loadGroups(); };
    const timer = window.setInterval(refreshVisible, 30000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [loadGroups]);

  // Day 2: picking a group reads its tokens and pieces fresh, for the checks.
  useEffect(() => {
    if (day !== 2 || !groupId) return;
    let active = true;
    void loadGroups();
    loadPieces(groupId).then((counts) => {
      if (active) setPiecesFor({ groupId, counts });
    });
    return () => {
      active = false;
    };
  }, [day, groupId, loadGroups, loadPieces]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!stationId) {
        setStation(null);
        return;
      }
      const { data: st } = await supabase
        .from("stations")
        .select("*")
        .eq("id", stationId)
        .single();
      if (active) setStation((st as Station) ?? null);
    }
    // Both days' stations. Read on the live database; if the table is not
    // readable the line under the title is simply left out.
    async function loadDays() {
      const { data } = await supabase
        .from("gm_station_assignments")
        .select("day, station:stations(id, name)")
        .eq("user_id", profile.id)
        .order("day");
      if (active && data) setDays(data as unknown as DayStation[]);
    }
    load();
    loadDays();
    return () => {
      active = false;
    };
  }, [supabase, profile.id, stationId]);

  // The station's status changes from Admin (or another device): show it at
  // once. Only the status is merged, nothing else on the page is reloaded.
  useEffect(() => {
    if (!stationId) return;
    const channel = supabase
      .channel(`gm-station-${stationId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "stations", filter: `id=eq.${stationId}` },
        (payload) => {
          const row = payload.new as Station;
          setStation((cur) => (cur && cur.id === row.id ? { ...cur, status: row.status } : cur));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, stationId]);

  // Token rules can change during the event; keep the labels and the
  // station's entry fee (synced from its tier) current.
  useEffect(() => {
    let active = true;
    async function loadRules() {
      const { data } = await supabase
        .from("game_config_rules")
        .select("rule_key, rule_value")
        .in("rule_key", ["DAY1_WIN_TOKENS", "DAY1_LOSE_TOKENS"]);
      if (!active || !data) return;
      const value = (key: string, fallback: number) =>
        data.find((r) => r.rule_key === key)?.rule_value ?? fallback;
      setDay1({ win: value("DAY1_WIN_TOKENS", 2), lose: value("DAY1_LOSE_TOKENS", 1) });
      if (stationId) {
        const { data: st } = await supabase
          .from("stations")
          .select("entry_cost")
          .eq("id", stationId)
          .single();
        if (active && st) {
          setStation((cur) => (cur ? { ...cur, entry_cost: st.entry_cost } : cur));
        }
      }
    }
    loadRules();
    const channel = supabase
      .channel(`gm_token_rules_${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_config_rules" }, loadRules)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, profile.id, stationId]);

  // A started game survives a reload or a locked phone, on this phone only.
  const gameKey = `gm-day2-game:${profile.id}`;
  useEffect(() => {
    if (stationId === null) return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(gameKey) ?? "null") as Day2Game | null;
      if (saved?.stationId === stationId) {
        setGame(saved);
        setGroupId(saved.groupId);
        setLocations(saved.locations);
      }
    } catch {
      // no storage: the game is not restored
    }
  }, [gameKey, stationId]);

  function keepGame(next: Day2Game | null) {
    setGame(next);
    try {
      if (next) window.localStorage.setItem(gameKey, JSON.stringify(next));
      else window.localStorage.removeItem(gameKey);
    } catch {
      // no storage: the game lasts until the page closes
    }
  }

  // The same for a Day 1 game.
  const day1Key = `gm-day1-game:${profile.id}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(day1Key) ?? "null") as Day1Game | null;
      if (saved && saved.stationId === stationId) {
        setDay1Game(saved);
        setDay1Picks(saved.groupIds);
      }
    } catch {
      // no storage: the game is not restored
    }
  }, [day1Key, stationId]);

  function keepDay1Game(next: Day1Game | null) {
    setDay1Game(next);
    try {
      if (next) window.localStorage.setItem(day1Key, JSON.stringify(next));
      else window.localStorage.removeItem(day1Key);
    } catch {
      // no storage: the game lasts until the page closes
    }
  }

  // The GM does not set the status by hand; a game does (fn_set_station_status, own station only).
  async function autoStatus(next: StationStatus) {
    if (!station) return;
    const { error } = await supabase.rpc("fn_set_station_status", {
      p_station_id: station.id,
      p_status: next,
    });
    if (error) statusMsg.setError(`Could not set the station to ${STATUS[next].label}: ${friendlyError(error)}`);
    else {
      statusMsg.setError(null);
      setStation((cur) => (cur ? { ...cur, status: next } : cur));
    }
  }

  // Day 1, like Day 2: Start sets In progress and checks the groups in here
  // (the maps show who plays); tokens are given only after it.
  function pickDay1(id: number) {
    if (day1Game) return;
    setDay1Picks((cur) => (cur.includes(id) ? cur.filter((g) => g !== id) : cur.length < 2 ? [...cur, id] : cur));
  }

  function startDay1() {
    if (day1Picks.length === 0) return;
    result.setError(null);
    keepDay1Game({
      stationId: station?.id ?? null,
      groupIds: day1Picks,
      keys: Object.fromEntries(day1Picks.map((id) => [id, idemKey()])),
      results: {},
      done: [],
    });
    if (station) {
      if (station.status === "available") void autoStatus("in_progress");
      for (const id of day1Picks) void placeGroup(station.id, id);
    }
  }

  function setDay1Result(id: number, outcome: Day1Outcome) {
    if (!day1Game || day1Game.done.includes(id)) return;
    keepDay1Game({ ...day1Game, results: { ...day1Game.results, [id]: outcome } });
  }

  // Back to Available, unless Admin or HOGM closed the station meanwhile.
  function endDay1() {
    const playing = day1Game?.groupIds ?? [];
    keepDay1Game(null);
    setDay1Picks([]);
    if (station?.status === "in_progress") void autoStatus("available");
    for (const id of playing) void releaseGroup(id);
  }

  // One fn_gm_day1_reward per group, each with the key made at Start. A group
  // that fails stays in the game; Submit again sends only the groups not paid.
  async function submitDay1() {
    if (!day1Game) return;
    setDay1Ask(false);
    setBusy(true);
    result.setError(null);
    const done = [...day1Game.done];
    const notes: string[] = [];
    let failure: string | null = null;
    for (const id of day1Game.groupIds) {
      if (done.includes(id)) continue;
      const outcome = day1Game.results[id];
      const name = groups.find((g) => g.id === id)?.name ?? `Group ${id}`;
      const res = await submit(
        "fn_gm_day1_reward",
        { p_group_id: id, p_result: outcome, p_idempotency_key: day1Game.keys[id] },
        `Day 1 ${outcome} to ${name}`
      );
      if (res.status === "rejected") {
        failure = `${name}: ${friendlyError({ message: res.error })}`;
        break;
      }
      done.push(id);
      if (res.status === "queued") notes.push(`${name}: offline, queued`);
      else {
        const d = res.data as { delta?: number; balance?: number; duplicate?: boolean };
        notes.push(d?.duplicate ? `${name}: already given` : `${name} +${d?.delta ?? "?"}${d?.balance !== undefined ? ` / ${d.balance}` : ""}`);
      }
    }
    setBusy(false);
    void loadGroups();
    if (failure) {
      keepDay1Game({ ...day1Game, done });
      result.setError(`${failure}.${notes.length ? ` Done: ${notes.join(", ")}.` : ""} Submit again to retry.`);
      return;
    }
    result.flash(notes.join(" / "));
    endDay1();
  }

  // Step 1: what would be undone. Step 2 (the sheet's confirm): undo it.
  async function askUndo() {
    setBusy(true);
    result.setError(null);
    const { data, error } = await supabase.rpc("fn_undo_preview");
    setBusy(false);
    if (error) return setUndoAsk({ fallback: true });
    const p = data as Exclude<UndoPreview, { fallback: true }>;
    if (!p.found) return result.setError(friendlyError({ message: "NOTHING_TO_UNDO" }));
    if (!p.undoable) return result.setError(friendlyError({ message: p.why ?? "NOTHING_TO_UNDO" }));
    setUndoAsk(p);
  }

  async function undo() {
    setBusy(true);
    result.setError(null);
    const { data, error } = await supabase.rpc("fn_undo_last_transaction");
    setBusy(false);
    setUndoAsk(null);
    if (error) result.setError(friendlyError(error));
    else {
      result.flash(`Undone. Balance: ${(data as { balance?: number })?.balance ?? "updated"}`);
      void loadGroups();
    }
  }

  const tier = station?.risk_tier ?? "low";
  const needPicks = RISK_TIER_META[tier].pick;
  const fee = station?.entry_cost ?? 0;

  function toggleLocation(loc: ProjectorLocation) {
    setLocations((cur) => {
      if (cur.includes(loc)) return cur.filter((l) => l !== loc);
      if (cur.length >= needPicks) {
        // replace the oldest pick so the flow stays 2-tap fast
        return [...cur.slice(1 - needPicks || 1), loc].slice(-needPicks);
      }
      return [...cur, loc];
    });
  }

  function pickGroup(id: number) {
    if (game) return;
    if (id !== groupId) setLocations([]);
    setGroupId(id);
  }

  // Same rule as the server's phase_active(): rehearsal mode, or the day2
  // phase active and not past its end. (The endgame phase is gone: 0102.)
  const serverNow = Date.now() + offsetMs;
  const phaseOn =
    flag(config["rehearsal_mode"]) ||
    phases.some(
      (p) =>
        p.key === "day2" &&
        p.state === "active" &&
        (!p.ends_at || Date.parse(p.ends_at) > serverNow)
    );
  const stationOn = day2.switches.station;
  const frozen = flag(config["tokens_frozen"]);
  const group = groups.find((g) => g.id === groupId) ?? null;
  const counts = piecesFor && piecesFor.groupId === groupId ? piecesFor.counts : undefined;
  const checks = group
    ? day2Checks({ station, balance: group.token_balance, counts, locations, phaseOn, stationOn, frozen, places })
    : [];
  const canStart = !!group && checks.every((c) => c.state === "ok" || c.state === "warn");
  const step = game ? (confirmWin !== null ? 2 : 1) : 0;
  const day1Ready = !!day1Game && day1Game.groupIds.every((id) => day1Game.done.includes(id) || day1Game.results[id]);
  const day1Step = !day1Game ? 0 : day1Ready ? 2 : 1;
  const gameGroup = game ? (groups.find((g) => g.id === game.groupId) ?? null) : null;

  // Step 1 → 2: check again with fresh tokens and pieces, lock the group, set In progress.
  async function startGame() {
    if (!groupId || !station) return;
    setBusy(true);
    result.setError(null);
    const [rows, fresh] = await Promise.all([loadGroups(), loadPieces(groupId)]);
    setBusy(false);
    setPiecesFor({ groupId, counts: fresh });
    const balance = rows?.find((g) => g.id === groupId)?.token_balance ?? group?.token_balance ?? null;
    const blocked = day2Checks({ station, balance, counts: fresh, locations, phaseOn, stationOn, frozen, places }).find(
      (c) => c.state === "bad" || c.state === "wait"
    );
    if (blocked) return result.setError(`${blocked.label}: ${blocked.text}`);
    keepGame({ stationId: station.id, groupId, locations });
    if (station.status === "available") void autoStatus("in_progress");
    void placeGroup(station.id, groupId);
  }

  // Back to Available after a game, unless Admin or HOGM closed the station meanwhile.
  function endGame() {
    const playing = game?.groupId;
    keepGame(null);
    setConfirmWin(null);
    if (station?.status === "in_progress") void autoStatus("available");
    if (playing != null) void releaseGroup(playing);
  }

  // The maps show which group plays here: Start checks it in at this station and the end checks it out
  // (fn_manual_checkin / fn_uncheckin; a GM may at their own station, 0095). Only the maps read it, so a
  // failure is a note, never a stop to the game.
  async function placeGroup(stationId: number, playingId: number) {
    const { error } = await supabase.rpc("fn_manual_checkin", { p_station_id: stationId, p_group_id: playingId });
    if (error) statusMsg.setError(`The map could not show the group here: ${friendlyError(error)}`);
  }
  async function releaseGroup(playingId: number) {
    const { error } = await supabase.rpc("fn_uncheckin", { p_group_id: playingId });
    // Already checked out, or checked in elsewhere since: nothing of ours to clear.
    if (error && !/NOT_CHECKED_IN|NOT_YOUR_STATION/.test(error.message)) {
      statusMsg.setError(`The map could not clear the group: ${friendlyError(error)}`);
    }
  }

  function cancelGame() {
    result.setError(null);
    endGame();
  }

  // Step 3: the entry fee is charged here, win or lose.
  async function submitDay2(won: boolean) {
    if (!game) return;
    setBusy(true);
    result.setError(null);
    const res = await submit(
      "fn_day2_challenge",
      {
        p_group_id: game.groupId,
        p_success: won,
        p_locations: needPicks > 0 ? game.locations : null,
        p_idempotency_key: idemKey(),
      },
      `day2 ${won ? "win" : "lose"} to group ${game.groupId}`
    );
    setBusy(false);
    if (res.status === "confirmed") {
      const d = res.data as Day2Result;
      result.flash(
        d.duplicate
          ? "Duplicate ignored (already recorded)."
          : d.success && d.piece_name
            ? `-${d.cost} tokens / granted ${d.piece_name} / balance ${d.balance}`
            : `-${d.cost} tokens (challenge lost) / balance ${d.balance}`
      );
    } else if (res.status === "queued") {
      result.flash("Offline. Queued and will send automatically.");
    } else {
      setConfirmWin(null);
      return result.setError(friendlyError({ message: res.error }));
    }
    endGame();
    setLocations([]);
    setGroupId(null);
    void loadGroups();
  }

  const status = station ? STATUS[station.status] : null;

  return (
    <div className={cn("gc gc-st", vxDisplay.variable, vxSlab.variable)}>
      <div className="gc-bg" aria-hidden>
        <i className="gc-orb gc-orb-navy" />
        <i className="gc-orb gc-orb-pink" />
      </div>

      <header className="gc-top gc-st-top">
        <button type="button" className="gc-st-activity" onClick={() => setActivityOpen(true)}>
          <History size={15} aria-hidden />
          Activity
        </button>
        <MyActivitySheet open={activityOpen} onClose={() => setActivityOpen(false)} userId={profile.id} groups={groups} />
        <p className="gc-eyebrow">{station ? `Day ${station.day} Station` : "Station Panel"}</p>
        <h1 className="gc-title">{station?.name ?? "No Station Yet"}</h1>
        <p className="gc-sub">
          <i aria-hidden />
          {station ? (
            station.day === 2 ? (
              <>
                {station.code} / {RISK_TIER_META[tier].label} / <b>Entry −{station.entry_cost}</b>
              </>
            ) : (
              <>
                {station.code}
                {station.purpose && <> / <b>{station.purpose}</b></>}
              </>
            )
          ) : (
            "Ask Admin to assign your station"
          )}
        </p>
        <ChallengeBanner />
        {days.length > 0 && (
          <ul className="gc-st-days" aria-label="Your stations">
            {([1, 2] as const).map((d) => {
              const own = days.find((x) => Number(x.day) === d)?.station ?? null;
              const now = !!own && own.id === station?.id;
              return (
                <li key={d} data-now={now || undefined}>
                  <b>Day {d}</b>
                  <span>{own?.name ?? "Not assigned"}</span>
                  {now && (
                    <span className="gc-chip" data-tone="live">
                      Now
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </header>

      <div className="gc-st-msgs">
        {queue.length > 0 && (
          <div className="gc-status gc-status-warn" role="status">
            <b>Offline Queue Active</b>
            <p>
              {queue.length} submission{queue.length > 1 ? "s" : ""} waiting. Keep this page open;
              they will send when the connection returns.
            </p>
          </div>
        )}
        {failed.length > 0 && (
          <div className="gc-status gc-status-err" role="alert">
            <b>
              {failed.length} queued submission{failed.length > 1 ? "s" : ""} rejected
            </b>
            <p>
              These were sent after reconnecting but the server refused them. They were NOT
              applied. Redo them by hand if still needed.
            </p>
            <ul className="gc-st-failed">
              {failed.map((f) => (
                <li key={f.id}>
                  <span>
                    {f.label}: {f.error}
                  </span>
                  <button type="button" className="gc-btn" onClick={() => dismissFailed(f.id)}>
                    Dismiss
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="gc-st-grid">
        <div className="gc-st-col">
          <section className="gc-card gc-st-card" aria-labelledby="st-group">
            <div className="gc-st-head">
              <h2 id="st-group" className="gc-eyebrow">
                <span className="gc-st-step">01</span> Group
              </h2>
              {day === 1 ? (
                <span className="gc-chip">{day1Picks.length}/2</span>
              ) : (
                group && (
                  <span className="gc-chip" data-tone="live">
                    {group.token_balance} token{group.token_balance !== 1 ? "s" : ""}
                  </span>
                )
              )}
            </div>
            {/* Day 1: one group, or two head to head. Day 2: one group. */}
            <div
              className="gc-st-groups"
              role={day === 1 ? "group" : "radiogroup"}
              aria-label={day === 1 ? "Groups playing (up to 2)" : "Active group"}
            >
              {groups.map((g) => {
                const picked = day1Picks.includes(g.id);
                return day === 1 ? (
                  <button
                    key={g.id}
                    type="button"
                    role="checkbox"
                    aria-checked={picked}
                    disabled={day1Game ? !picked : !picked && day1Picks.length >= 2}
                    onClick={() => pickDay1(g.id)}
                  >
                    <i className="gc-swatch" style={{ background: groupSwatch(g.id, g.color) }} aria-hidden />
                    <span>{g.name}</span>
                  </button>
                ) : (
                  <button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={groupId === g.id}
                    disabled={!!game && game.groupId !== g.id}
                    onClick={() => pickGroup(g.id)}
                  >
                    <i className="gc-swatch" style={{ background: groupSwatch(g.id, g.color) }} aria-hidden />
                    <span>{g.name}</span>
                  </button>
                );
              })}
            </div>
            {groups.length === 0 && <p className="gc-muted">Loading groups…</p>}
            {(day === 1 ? day1Game : game) && (
              <p className="gc-muted">A game is running. Submit its result or cancel it to switch groups.</p>
            )}
          </section>

          <section className="gc-card gc-st-card" aria-labelledby="st-result">
            <div className="gc-st-head">
              <h2 id="st-result" className="gc-eyebrow">
                <span className="gc-st-step">02</span> Result
              </h2>
              {station && <span className="gc-chip">Day {station.day}</span>}
            </div>

            {!station && (
              <div className="gc-seg" role="tablist" aria-label="Day">
                {([1, 2] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="tab"
                    aria-selected={pickedDay === d}
                    disabled={!!game || !!day1Game}
                    onClick={() => setPickedDay(d)}
                  >
                    Day {d}
                  </button>
                ))}
              </div>
            )}

            {day === 1 ? (
              <>
                <ol className="gc-st-steps" aria-label="Day 1 steps">
                  {["Pick", "Play", "Give"].map((label, i) => (
                    <li key={label} aria-current={day1Step === i ? "step" : undefined}>
                      <b>{i + 1}</b>
                      {label}
                    </li>
                  ))}
                </ol>

                {!day1Game ? (
                  <>
                    <p className="gc-muted">
                      {day1Picks.length === 0
                        ? "Pick the group at your station, or two groups for a head-to-head."
                        : <>
                            <b className="gc-st-target">{day1Picks.map((id) => groups.find((g) => g.id === id)?.name ?? `Group ${id}`).join(" vs ")}</b>.
                            Tokens are given after the game.
                          </>}
                    </p>
                    <button
                      type="button"
                      className="gc-btn gc-btn-primary gc-st-submit"
                      disabled={busy || day1Picks.length === 0}
                      onClick={startDay1}
                    >
                      Start Game{day1Picks.length === 2 ? " / 2 Groups" : ""}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="gc-muted">Game over? Pick each group&apos;s result, then submit.</p>
                    {day1Game.groupIds.map((id) => {
                      const g = groups.find((x) => x.id === id) ?? null;
                      const picked = day1Game.results[id];
                      const paid = day1Game.done.includes(id);
                      return (
                        <div key={id} className="gc-st-game gc-st-d1">
                          <p className="gc-st-game-who">
                            {g && <i className="gc-swatch" style={{ background: groupSwatch(g.id, g.color) }} aria-hidden />}
                            <b>{g?.name ?? `Group ${id}`}</b>
                            <span className="gc-chip" data-tone={paid ? "ok" : "warn"}>
                              {paid ? "Given" : `${g?.token_balance ?? "—"} tokens`}
                            </span>
                          </p>
                          <div className="gc-row2">
                            {(["win", "lose"] as const).map((o) => {
                              const n = o === "win" ? day1.win : day1.lose;
                              return (
                                <button
                                  key={o}
                                  type="button"
                                  className="gc-st-award gc-st-d1-pick"
                                  data-tone={picked === o ? "win" : undefined}
                                  aria-pressed={picked === o}
                                  disabled={busy || paid}
                                  onClick={() => setDay1Result(id, o)}
                                >
                                  <b>
                                    +{n}
                                    <small> token{n !== 1 ? "s" : ""}</small>
                                  </b>
                                  <span>{o === "win" ? "Win" : "Participation"}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      className="gc-btn gc-btn-primary gc-st-submit"
                      disabled={busy || !day1Ready}
                      onClick={() => setDay1Ask(true)}
                    >
                      Submit Result{day1Game.groupIds.length > 1 ? "s" : ""}
                    </button>
                    <button type="button" className="gc-btn gc-st-undo" disabled={busy} onClick={endDay1}>
                      <X size={16} aria-hidden />
                      {day1Game.done.length ? "End Game" : "Cancel Game"}
                      <small>{day1Game.done.length ? "tokens given stay" : "no tokens given"}</small>
                    </button>
                    <ConfirmSheet
                      open={day1Ask}
                      onClose={() => setDay1Ask(false)}
                      onConfirm={submitDay1}
                      busy={busy}
                      title={day1Game.groupIds.length > 1 ? "Give These Tokens?" : "Give This Token Reward?"}
                      confirmLabel="Give Tokens"
                      body={
                        <>
                          {day1Game.groupIds
                            .filter((id) => !day1Game.done.includes(id))
                            .map((id) => {
                              const g = groups.find((x) => x.id === id);
                              const o = day1Game.results[id];
                              const n = o === "win" ? day1.win : day1.lose;
                              return (
                                <span key={id} style={{ display: "block" }}>
                                  <b>{g?.name ?? `Group ${id}`}</b>: {o === "win" ? "Win" : "Participation"} +{n}
                                  {g && ` (${g.token_balance} → ${g.token_balance + n})`}
                                </span>
                              );
                            })}
                          {station ? `At ${station.name}. ` : ""}You can undo your last transaction within{" "}
                          {undoWindowMinutes(config["undo_window_minutes"])} minutes.
                        </>
                      }
                    />
                  </>
                )}
                <StatusLine error={result.error} notice={result.notice} />
                <button type="button" className="gc-btn gc-st-undo" disabled={busy} onClick={askUndo}>
                  <Undo2 size={16} aria-hidden />
                  Undo My Last Transaction
                  <small>within {undoWindowMinutes(config["undo_window_minutes"])} min</small>
                </button>
                <ConfirmSheet
                  open={undoAsk !== null}
                  onClose={() => setUndoAsk(null)}
                  onConfirm={undo}
                  busy={busy}
                  danger
                  title="Undo Your Last Transaction?"
                  confirmLabel="Undo"
                  body={
                    !undoAsk || undoAsk.fallback ? (
                      "It reverses the last token change you made, if it is recent enough."
                    ) : (
                      <>
                        <b>{undoAsk.group_name}</b>: {undoAsk.reason} /{" "}
                        <b>
                          {(undoAsk.delta ?? 0) > 0 ? "+" : ""}
                          {undoAsk.delta}
                        </b>{" "}
                        / {undoAsk.created_at ? minutesAgo(undoAsk.created_at) : ""}.
                        {(() => {
                          const g = groups.find((x) => x.id === undoAsk.group_id);
                          return g ? ` ${g.name} goes from ${g.token_balance} to ${g.token_balance - (undoAsk.delta ?? 0)} tokens.` : "";
                        })()}
                      </>
                    )
                  }
                />
              </>
            ) : (
              <>
                <ol className="gc-st-steps" aria-label="Day 2 steps">
                  {["Check", "Play", "Submit"].map((label, i) => (
                    <li key={label} aria-current={step === i ? "step" : undefined}>
                      <b>{i + 1}</b>
                      {label}
                    </li>
                  ))}
                </ol>

                {!game ? (
                  <>
                    <p className="gc-muted">
                      {group ? (
                        <>
                          Check <b className="gc-st-target">{group.name}</b> before the game. Nothing is
                          charged until you submit the result.
                        </>
                      ) : (
                        "Pick the group at your station first."
                      )}
                    </p>

                    {group && needPicks > 0 && (
                      <div className="gc-field">
                        <span>
                          {needPicks === 2 ? "Pick 2 locations" : "Pick the location"} /{" "}
                          {RISK_TIER_META[tier].label}
                        </span>
                        <div className="gc-st-locs" role="group" aria-label="Locations">
                          {PROJECTOR_LOCATIONS.map((loc) => {
                            const n = counts?.[loc];
                            const full = n !== undefined && n >= PIECES_PER_SET;
                            const picked = locations.includes(loc);
                            return (
                              <button
                                key={loc}
                                type="button"
                                className="gc-st-loc"
                                style={{ "--key": KEY_COLORS[loc].main } as React.CSSProperties}
                                aria-pressed={picked}
                                // High risk guarantees a piece of this location, so a full one cannot be picked.
                                disabled={needPicks === 1 && full}
                                onClick={() => toggleLocation(loc)}
                              >
                                {picked && <Check size={16} className="gc-st-loc-tick" aria-hidden />}
                                <span className="gc-st-loc-key">{KEY_NAMES[loc]}</span>
                                <b>{places[loc].name}</b>
                                <span className="gc-st-loc-dots" aria-hidden>
                                  {Array.from({ length: PIECES_PER_SET }, (_, i) => (
                                    <i key={i} data-on={n !== undefined && i < n ? "" : undefined} />
                                  ))}
                                </span>
                                <small>{n === undefined ? "…" : full ? "Full 5/5" : `Has ${n}/${PIECES_PER_SET}`}</small>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {group && (
                      <ul className="gc-st-checks" aria-label="Checks">
                        {checks.map((c) => (
                          <li key={c.label} data-state={c.state}>
                            {c.state === "ok" ? (
                              <Check size={17} aria-label="OK" />
                            ) : c.state === "bad" ? (
                              <X size={17} aria-label="Blocked" />
                            ) : c.state === "warn" ? (
                              <TriangleAlert size={17} aria-label="Note" />
                            ) : (
                              <CircleDashed size={17} aria-label="Waiting" />
                            )}
                            <span>
                              <b>{c.label}</b>
                              <small>{c.text}</small>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <button
                      type="button"
                      className="gc-btn gc-btn-primary gc-st-submit"
                      disabled={busy || !canStart}
                      onClick={startGame}
                    >
                      Start Game / Entry −{fee} on Submit
                    </button>
                    <StatusLine error={result.error} notice={result.notice} />
                  </>
                ) : (
                  <>
                    <div className="gc-st-game">
                      <p className="gc-st-game-who">
                        {gameGroup && (
                          <i className="gc-swatch" style={{ background: groupSwatch(gameGroup.id, gameGroup.color) }} aria-hidden />
                        )}
                        <b>{gameGroup?.name ?? `Group ${game.groupId}`}</b>
                        <span className="gc-chip" data-tone="warn">
                          Playing
                        </span>
                      </p>
                      <dl className="gc-facts">
                        <div>
                          <dt>Risk</dt>
                          <dd>{RISK_TIER_META[tier].label}</dd>
                        </div>
                        <div>
                          <dt>Locations</dt>
                          <dd>{game.locations.length ? labels(places, game.locations, " + ") : "Any"}</dd>
                        </div>
                        <div>
                          <dt>Entry</dt>
                          <dd>−{fee} on submit</dd>
                        </div>
                        <div>
                          <dt>Tokens Now</dt>
                          <dd>{gameGroup?.token_balance ?? "—"}</dd>
                        </div>
                      </dl>
                    </div>
                    <p className="gc-muted">Game over? Tap the result, then confirm.</p>
                    <div className="gc-row2">
                      <button
                        type="button"
                        className="gc-st-award gc-st-word"
                        data-tone="ok"
                        disabled={busy}
                        onClick={() => setConfirmWin(true)}
                      >
                        <b>Success</b>
                        <span>Charge + piece</span>
                      </button>
                      <button
                        type="button"
                        className="gc-st-award gc-st-word"
                        data-tone="bad"
                        disabled={busy}
                        onClick={() => setConfirmWin(false)}
                      >
                        <b>Failed</b>
                        <span>Charge only</span>
                      </button>
                    </div>
                    <StatusLine error={result.error} notice={result.notice} />
                    <button type="button" className="gc-btn gc-st-undo" disabled={busy} onClick={cancelGame}>
                      <X size={16} aria-hidden />
                      Cancel Game
                      <small>nothing is charged</small>
                    </button>
                  </>
                )}

                <ConfirmSheet
                  open={confirmWin !== null}
                  onClose={() => setConfirmWin(null)}
                  onConfirm={() => submitDay2(confirmWin === true)}
                  title={`${gameGroup?.name ?? "This group"} ${confirmWin ? "won" : "lost"}?`}
                  body={
                    <>
                      Charge <b>{fee}</b> token{fee !== 1 ? "s" : ""}
                      {confirmWin
                        ? ` and grant a random piece from ${game?.locations.length ? labels(places, game.locations, " or ") : "any location"} that the group doesn't have yet.`
                        : ". No piece."}
                      {gameGroup && ` Tokens: ${gameGroup.token_balance} → ${gameGroup.token_balance - fee}.`}
                    </>
                  }
                  confirmLabel={`Submit ${confirmWin ? "Win" : "Loss"} / −${fee}`}
                  danger={confirmWin === false}
                  busy={busy}
                />
              </>
            )}
          </section>
        </div>

        <div className="gc-st-col">
          <section className="gc-card gc-st-card gc-st-status" aria-labelledby="st-status">
            <div className="gc-st-head">
              <h2 id="st-status" className="gc-eyebrow">Station Status</h2>
              {status && (
                <span className="gc-chip gc-st-status-chip" data-tone={status.tone}>
                  {status.label}
                </span>
              )}
            </div>
            {(!station || station.status === "closed") && (
              <p className="gc-muted">
                {!station
                  ? "No station assigned to your account. Ask Admin to set your station."
                  : "Groups cannot check in or play here while it is closed. Open it when your station is ready."}
              </p>
            )}
            {station?.status === "closed" && (
              <button type="button" className="gc-btn gc-btn-go gc-st-open" disabled={busy} onClick={() => setOpenAsk(true)}>
                Open Station
              </button>
            )}
            <StatusLine error={statusMsg.error} notice={statusMsg.notice} />
            <ConfirmSheet
              open={openAsk}
              onClose={() => setOpenAsk(false)}
              onConfirm={async () => {
                setBusy(true);
                await autoStatus("available");
                setBusy(false);
                setOpenAsk(false);
              }}
              busy={busy}
              title={`Open ${station?.name ?? "your station"}?`}
              confirmLabel="Open Station"
              body="It was closed by Admin or HOGM. Opening sets it to Available, so groups can check in and play here. The change is logged."
            />
          </section>
        </div>
      </div>
    </div>
  );
}
