"use client";

import { Check, CircleDashed, TriangleAlert, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { groupSwatch } from "@/components/freshie/groupTheme";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import { useProfile } from "@/components/ProfileProvider";
import "@/components/staff/game/game-control.css";
import { ConfirmSheet, StatusLine, useStatus } from "@/components/staff/game/parts";
import { undoWindowMinutes } from "@/components/token/UndoWindowSetting";
import { useConfig } from "@/components/useConfig";
import { useOfflineQueue } from "@/components/useOfflineQueue";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  PIECES_PER_SET,
  PROJECTOR_LABELS,
  PROJECTOR_LOCATIONS,
  RISK_TIER_META,
  type Day2Result,
  type ProjectorLocation,
  type Station,
  type StationStatus,
} from "@/lib/types";
import { cn, friendlyError, idemKey } from "@/lib/utils";

type GroupRow = { id: number; name: string; color: string | null; token_balance: number };
/** One of this GM's stations: one per day (gm_station_assignments, 0065). */
type DayStation = { day: 1 | 2; station: { id: number; name: string } | null };
type Counts = Record<ProjectorLocation, number>;
/** A Day 2 game the GM started: locked until its result is submitted or it is cancelled. Kept on this phone. */
type Day2Game = { stationId: number; groupId: number; locations: ProjectorLocation[] };
type CheckState = "ok" | "warn" | "bad" | "wait";
/** What Undo would reverse (fn_undo_preview, 0090). fallback: that function is not on the database yet. */
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
  in_progress: { label: "In progress", tone: "warn" },
  closed: { label: "Closed", tone: "off" },
};

const TOTAL_PIECES = PIECES_PER_SET * PROJECTOR_LOCATIONS.length;
const labels = (locs: ProjectorLocation[], join: string) => locs.map((l) => PROJECTOR_LABELS[l]).join(join);
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
  frozen,
}: {
  station: Station | null;
  balance: number | null;
  counts: Counts | null | undefined;
  locations: ProjectorLocation[];
  phaseOn: boolean;
  frozen: boolean;
}): Day2Check[] {
  if (!station) return [{ label: "Station", text: "No station assigned to your account. Ask Admin.", state: "bad" }];
  const checks: Day2Check[] = [];
  const fee = station.entry_cost;

  if (station.status === "closed") {
    checks.push({ label: "Station", text: "Closed by Admin or HOGM. Ask them to open it.", state: "bad" });
  } else if (station.status === "in_progress") {
    checks.push({ label: "Station", text: "Shows In progress. If no other group is playing here, you can still start.", state: "warn" });
  }

  if (balance !== null) {
    checks.push(
      balance >= fee
        ? { label: "Tokens", text: `Has ${balance} · entry ${fee} · ${balance - fee} left after`, state: "ok" }
        : { label: "Tokens", text: `Has ${balance}, needs ${fee}. Short by ${fee - balance}.`, state: "bad" }
    );
  }
  if (frozen) checks.push({ label: "Token freeze", text: "Admin froze tokens. Results are refused until they unfreeze.", state: "bad" });
  checks.push(
    phaseOn
      ? { label: "Day 2 game", text: "Running", state: "ok" }
      : { label: "Day 2 game", text: "Not started yet. Results are refused until Live control starts it.", state: "bad" }
  );

  const need = RISK_TIER_META[station.risk_tier].pick;
  const piece = "Puzzle piece";
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
    if (open.length === 0) checks.push({ label: piece, text: `${labels(full, " and ")} ${full.length > 1 ? "are" : "is"} full. A win gives nothing.`, state: "bad" });
    else if (full.length > 0) checks.push({ label: piece, text: `${labels(full, " and ")} is full, so a win gives a ${labels(open, " or ")} piece.`, state: "warn" });
    else checks.push({ label: piece, text: `A win gives a piece from ${labels(open, " or ")}.`, state: "ok" });
  }
  return checks;
}

// GM's Station panel (/gm), in the Game control look (game-control.css) of the
// ops crew's Ops page. Phones, top to bottom:
//  Status    - the station's state, shown only. A Day 2 game sets it: In
//              progress when it starts, Available when its result is submitted
//              or it is cancelled. Admin and HOGM can still set it (Closed).
//  Group     - tap the group at the station (fn_scoreboard: name, colour, tokens)
//  Result    - Day 1: win or participation reward, confirmed in a sheet first.
//              Amounts are the admin's token rules (Token page); the server
//              reads them, the GM cannot pick one. Undo shows what it would reverse (fn_undo_preview)
//              and asks first; Admin sets the window (Token page, default 10 min).
//              Day 2: three steps, one group at a time. 1 Check: tokens, the
//              Day 2 game running, no token freeze, a piece to win (the tier's
//              locations are picked here). 2 Play: the group is locked. 3 Submit:
//              Success or Failed, then a confirm sheet. The entry fee is charged
//              only on submit (fn_day2_challenge), win or lose.
// Under the title: the GM's station on each day, the current one marked Now.
// The database picks the current one from Live control's phases (0065:
// profiles.station_id, Day 2 once Day 1 has ended), not from the date, so it
// follows a rehearsal too. Only the current station can be operated.
// No blind box: GMs show no blind box QR (not here, not on Home).
// Landscape tablets and desktops: Group and Result left, Status right.
// A station runs Day 1 or Day 2; with no station, a Day switch shows both.
// All submissions carry idempotency keys and queue offline (NFR-6).
export default function GmPanelPage() {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { queue, failed, dismissFailed, submit } = useOfflineQueue();
  const { phases, offsetMs } = usePhaseTimer();
  const { config } = useConfig();
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
  // Day 1 reward waiting for the GM's confirmation.
  const [day1Ask, setDay1Ask] = useState<"win" | "lose" | null>(null);

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
      if (!profile.station_id) return;
      const { data: st } = await supabase
        .from("stations")
        .select("*")
        .eq("id", profile.station_id)
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
  }, [supabase, profile.id, profile.station_id]);

  // The station's status changes from Admin (or another device): show it at
  // once. Only the status is merged, nothing else on the page is reloaded.
  useEffect(() => {
    if (!profile.station_id) return;
    const channel = supabase
      .channel(`gm-station-${profile.station_id}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "stations", filter: `id=eq.${profile.station_id}` },
        (payload) => {
          const row = payload.new as Station;
          setStation((cur) => (cur && cur.id === row.id ? { ...cur, status: row.status } : cur));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, profile.station_id]);

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
      if (profile.station_id) {
        const { data: st } = await supabase
          .from("stations")
          .select("entry_cost")
          .eq("id", profile.station_id)
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
  }, [supabase, profile.id, profile.station_id]);

  // A started game survives a reload or a locked phone, on this phone only.
  const gameKey = `gm-day2-game:${profile.id}`;
  const stationId = station?.id ?? null;
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

  // The GM no longer sets the status by hand; a Day 2 game does (fn_set_station_status, own station only).
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

  async function day1Reward(outcome: "win" | "lose") {
    if (!groupId) return result.setError("先选组别 Select a group first.");
    const label = outcome === "win" ? "Station win" : "Station participation";
    setBusy(true);
    result.setError(null);
    setDay1Ask(null);
    const res = await submit(
      "fn_gm_day1_reward",
      {
        p_group_id: groupId,
        p_result: outcome,
        p_idempotency_key: idemKey(),
      },
      `Day 1 ${outcome} to group ${groupId}`
    );
    setBusy(false);
    if (res.status === "confirmed") {
      const d = res.data as { delta?: number; balance?: number; duplicate?: boolean };
      if (d?.duplicate) return result.flash("Duplicate ignored (already recorded).");
      result.flash(
        `${label}: +${d?.delta ?? "?"}${d?.balance !== undefined ? ` · balance ${d.balance}` : ""}`
      );
      void loadGroups();
    } else if (res.status === "queued") {
      result.flash("Offline. Queued and will send automatically.");
    } else {
      result.setError(friendlyError({ message: res.error }));
    }
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

  // Same rule as the server's phase_active(): rehearsal mode, or the day2 or
  // endgame phase active and not past its end.
  const serverNow = Date.now() + offsetMs;
  const phaseOn =
    flag(config["rehearsal_mode"]) ||
    phases.some(
      (p) =>
        (p.key === "day2" || p.key === "endgame") &&
        p.state === "active" &&
        (!p.ends_at || Date.parse(p.ends_at) > serverNow)
    );
  const frozen = flag(config["tokens_frozen"]);
  const group = groups.find((g) => g.id === groupId) ?? null;
  const counts = piecesFor && piecesFor.groupId === groupId ? piecesFor.counts : undefined;
  const checks = group
    ? day2Checks({ station, balance: group.token_balance, counts, locations, phaseOn, frozen })
    : [];
  const canStart = !!group && checks.every((c) => c.state === "ok" || c.state === "warn");
  const step = game ? (confirmWin !== null ? 2 : 1) : 0;
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
    const blocked = day2Checks({ station, balance, counts: fresh, locations, phaseOn, frozen }).find(
      (c) => c.state === "bad" || c.state === "wait"
    );
    if (blocked) return result.setError(`${blocked.label}: ${blocked.text}`);
    keepGame({ stationId: station.id, groupId, locations });
    if (station.status === "available") void autoStatus("in_progress");
  }

  // Back to Available after a game, unless Admin or HOGM closed the station meanwhile.
  function endGame() {
    keepGame(null);
    setConfirmWin(null);
    if (station?.status === "in_progress") void autoStatus("available");
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
            ? `-${d.cost} tokens · granted ${d.piece_name} · balance ${d.balance}`
            : `-${d.cost} tokens (challenge lost) · balance ${d.balance}`
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

      <header className="gc-top">
        <p className="gc-eyebrow">{station ? `Day ${station.day} station` : "Station panel"}</p>
        <h1 className="gc-title">{station?.name ?? "No station yet"}</h1>
        <p className="gc-sub">
          <i aria-hidden />
          {station ? (
            station.day === 2 ? (
              <>
                {station.code} · {RISK_TIER_META[tier].label} · <b>Entry −{station.entry_cost}</b>
              </>
            ) : (
              <>
                {station.code}
                {station.purpose && <> · <b>{station.purpose}</b></>}
              </>
            )
          ) : (
            "Ask Admin to assign your station"
          )}
        </p>
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
            <b>Offline queue active</b>
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
              {group && (
                <span className="gc-chip" data-tone="live">
                  {group.token_balance} token{group.token_balance !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="gc-st-groups" role="radiogroup" aria-label="Active group">
              {groups.map((g) => (
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
              ))}
            </div>
            {groups.length === 0 && <p className="gc-muted">Loading groups…</p>}
            {game && <p className="gc-muted">A game is running. Submit its result or cancel it to switch groups.</p>}
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
                    disabled={!!game}
                    onClick={() => setPickedDay(d)}
                  >
                    Day {d}
                  </button>
                ))}
              </div>
            )}

            {day === 1 ? (
              <>
                <p className="gc-muted">
                  {group ? (
                    <>
                      For <b className="gc-st-target">{group.name}</b>. Tokens are added at once.
                    </>
                  ) : (
                    "Pick the group at your station first."
                  )}
                </p>
                <div className="gc-row2">
                  <button
                    type="button"
                    className="gc-st-award"
                    data-tone="win"
                    disabled={busy || !groupId}
                    onClick={() => setDay1Ask("win")}
                  >
                    <b>
                      +{day1.win}
                      <small> token{day1.win !== 1 ? "s" : ""}</small>
                    </b>
                    <span>Win</span>
                  </button>
                  <button
                    type="button"
                    className="gc-st-award"
                    disabled={busy || !groupId}
                    onClick={() => setDay1Ask("lose")}
                  >
                    <b>
                      +{day1.lose}
                      <small> token{day1.lose !== 1 ? "s" : ""}</small>
                    </b>
                    <span>Participation</span>
                  </button>
                </div>
                {(() => {
                  const n = day1Ask === "lose" ? day1.lose : day1.win;
                  const tokens = `+${n} token${n !== 1 ? "s" : ""}`;
                  return (
                    <ConfirmSheet
                      open={day1Ask !== null}
                      onClose={() => setDay1Ask(null)}
                      onConfirm={() => day1Ask && day1Reward(day1Ask)}
                      busy={busy}
                      title={`Give ${group?.name ?? "this group"} ${tokens}?`}
                      confirmLabel={`Give ${tokens}`}
                      body={
                        <>
                          {day1Ask === "win" ? "Win" : "Participation"}
                          {station ? ` at ${station.name}` : ""}.
                          {group && ` ${group.name} goes from ${group.token_balance} to ${group.token_balance + n} tokens.`}{" "}
                          You can undo it within {undoWindowMinutes(config["undo_window_minutes"])} minutes.
                        </>
                      }
                    />
                  );
                })()}
                <StatusLine error={result.error} notice={result.notice} />
                <button type="button" className="gc-btn gc-st-undo" disabled={busy} onClick={askUndo}>
                  <Undo2 size={16} aria-hidden />
                  Undo my last transaction
                  <small>within {undoWindowMinutes(config["undo_window_minutes"])} min</small>
                </button>
                <ConfirmSheet
                  open={undoAsk !== null}
                  onClose={() => setUndoAsk(null)}
                  onConfirm={undo}
                  busy={busy}
                  danger
                  title="Undo your last transaction?"
                  confirmLabel="Undo"
                  body={
                    !undoAsk || undoAsk.fallback ? (
                      "It reverses the last token change you made, if it is recent enough."
                    ) : (
                      <>
                        <b>{undoAsk.group_name}</b>: {undoAsk.reason} ·{" "}
                        <b>
                          {(undoAsk.delta ?? 0) > 0 ? "+" : ""}
                          {undoAsk.delta}
                        </b>{" "}
                        · {undoAsk.created_at ? minutesAgo(undoAsk.created_at) : ""}.
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
                          {needPicks === 2 ? "Pick 2 locations" : "Pick the location"} ·{" "}
                          {RISK_TIER_META[tier].label}
                        </span>
                        <div className="gc-seg gc-st-locs" role="group" aria-label="Locations">
                          {PROJECTOR_LOCATIONS.map((loc) => {
                            const n = counts?.[loc];
                            const full = n !== undefined && n >= PIECES_PER_SET;
                            return (
                              <button
                                key={loc}
                                type="button"
                                aria-pressed={locations.includes(loc)}
                                // High risk guarantees a piece of this location, so a full one cannot be picked.
                                disabled={needPicks === 1 && full}
                                onClick={() => toggleLocation(loc)}
                              >
                                {PROJECTOR_LABELS[loc]}
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
                      Start game · entry −{fee} on submit
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
                          <dd>{game.locations.length ? labels(game.locations, " + ") : "Any"}</dd>
                        </div>
                        <div>
                          <dt>Entry</dt>
                          <dd>−{fee} on submit</dd>
                        </div>
                        <div>
                          <dt>Tokens now</dt>
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
                      Cancel game
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
                        ? ` and grant a random piece from ${game?.locations.length ? labels(game.locations, " or ") : "any location"} that the group doesn't have yet.`
                        : ". No piece."}
                      {gameGroup && ` Tokens: ${gameGroup.token_balance} → ${gameGroup.token_balance - fee}.`}
                    </>
                  }
                  confirmLabel={`Submit ${confirmWin ? "win" : "loss"} · −${fee}`}
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
              <h2 id="st-status" className="gc-eyebrow">Station status</h2>
              {status && (
                <span className="gc-chip gc-st-status-chip" data-tone={status.tone}>
                  {status.label}
                </span>
              )}
            </div>
            <p className="gc-muted">
              {!station
                ? "No station assigned to your account. Ask Admin to set your station."
                : station.day === 2
                  ? "Changes by itself: In progress when you start a game, Available when you submit or cancel it. Admin and HOGM can close the station."
                  : "Admin and HOGM set the status of Day 1 stations."}
            </p>
            <StatusLine error={statusMsg.error} notice={statusMsg.notice} />
          </section>
        </div>
      </div>
    </div>
  );
}
