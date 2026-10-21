"use client";

import { useEffect, useMemo, useState } from "react";

import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import { useGroup } from "@/components/useGroup";
import { loadProjectorStates, type ProjectorState } from "@/lib/projectorStates";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PROJECTOR_LOCATIONS, type Phase, type ProjectorLocation, type RiskTier } from "@/lib/types";
import { formatCountdown } from "@/lib/utils";

import { GUARDIAN, SAMPLE_BOXES } from "./sampleData";
import type { GamePhase, HistoryEntry, ItemsData, LitBy } from "./types";

// Live data for the Items page and Freshie Home's puzzle card, the same
// sources Admin sees:
//   tokens      groups.token_balance (useGroup, live)
//   pieces      inventory + items (granted on a Day 2 station win)
//   projectors  fn_projector_states (0096): lit or not, and whether our group
//               lit it. Which other group lit one is Committee only.
//   phase, time phases (Live control), via usePhaseTimer
//   costs       Day 2 stations' entry_cost by risk tier
//   history     the group's token_transactions, pieces and lit projector
// A Freshie or Faci reads only their own group's rows (RLS).
// Not live yet: the Guardian spot text. Blind boxes are added by the Items page
// (useBlindBoxes); their buy and open token changes show here as "box" entries.
// The map unlocks (real location names) in the endgame.

type PieceRow = {
  id: number;
  created_at: string;
  source: string;
  items: { puzzle_location: ProjectorLocation | null; puzzle_index: number | null } | null;
};
type TxRow = { id: number; delta: number; reason: string; created_at: string };
type StationRow = { risk_tier: RiskTier; entry_cost: number };

type Fetched = {
  pieces: PieceRow[];
  tx: TxRow[];
  projectors: ProjectorState[];
  costs: ItemsData["costs"];
};

const DEFAULT_COSTS: ItemsData["costs"] = { low: 2, medium: 4, high: 6 };
const TIER_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };

/** Day 1 / Day 2 / endgame / done from Live control's phases. */
function gamePhase(phases: Phase[]): GamePhase {
  const current = phases.find((p) => p.state === "active") ?? phases.find((p) => p.state === "paused");
  if (current) {
    if (current.is_endgame || current.key === "endgame") return "endgame";
    return current.key === "day2" ? "day2" : "day1";
  }
  const state = (key: string) => phases.find((p) => p.key === key)?.state;
  if (state("endgame") === "ended") return "done";
  if (state("day2") === "ended") return "day2";
  return "day1";
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });
}

/** "Day 2 entry: Station 6 (medium)" → "Station 6 · Medium risk". */
function entryTitle(reason: string) {
  const m = /^Day 2 entry:\s*(.+?)\s*\((low|medium|high)\)\s*$/i.exec(reason);
  return m ? `${m[1]} · ${TIER_LABEL[m[2].toLowerCase()]} risk` : reason;
}

export function useItemsData(): { data: ItemsData; loading: boolean } {
  const { group } = useGroup();
  const { phases, offsetMs, tick } = usePhaseTimer();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const groupId = group?.id ?? null;
  const [fetched, setFetched] = useState<Fetched | null>(null);

  useEffect(() => {
    if (!groupId) return;
    let active = true;
    async function load() {
      const [pieces, tx, projectors, stations] = await Promise.all([
        supabase
          .from("inventory")
          .select("id, created_at, source, items!inner(type, puzzle_location, puzzle_index)")
          .eq("group_id", groupId!)
          .eq("items.type", "puzzle"),
        supabase
          .from("token_transactions")
          .select("id, delta, reason, created_at")
          .eq("group_id", groupId!)
          .order("created_at", { ascending: false })
          .limit(200),
        loadProjectorStates(supabase),
        supabase.from("stations").select("risk_tier, entry_cost").eq("day", 2),
      ]);
      if (!active) return;
      const costs = { ...DEFAULT_COSTS };
      const seen = new Set<string>();
      for (const s of (stations.data ?? []) as StationRow[]) {
        if (!(s.risk_tier in costs)) continue;
        // The cheapest station of each tier, so the hint never overstates the fee.
        if (!seen.has(s.risk_tier) || s.entry_cost < costs[s.risk_tier]) costs[s.risk_tier] = s.entry_cost;
        seen.add(s.risk_tier);
      }
      setFetched((cur) => ({
        pieces: (pieces.data ?? []) as unknown as PieceRow[],
        tx: (tx.data ?? []) as TxRow[],
        // A failed call keeps the last answer instead of showing every projector dark.
        projectors: projectors ?? cur?.projectors ?? [],
        costs,
      }));
    }
    load();
    const channel = supabase
      .channel(`items-live-${groupId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory", filter: `group_id=eq.${groupId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "token_transactions", filter: `group_id=eq.${groupId}` }, load)
      // A Freshie gets no projectors events (0096); a projector change also writes game_config.
      .on("postgres_changes", { event: "*", schema: "public", table: "game_config" }, load)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, groupId]);

  const data = useMemo<ItemsData>(() => {
    void tick; // the time left counts down every second
    const phase = gamePhase(phases);
    const current = phases.find((p) => p.state === "active") ?? phases.find((p) => p.state === "paused");
    const remaining = !current
      ? null
      : current.state === "paused"
        ? (current.paused_remaining ?? 0)
        : current.ends_at
          ? (new Date(current.ends_at).getTime() - (Date.now() + offsetMs)) / 1000
          : null;

    const pieces: ItemsData["pieces"] = { B1: [], A3: [], TF: [] };
    for (const row of fetched?.pieces ?? []) {
      const loc = row.items?.puzzle_location;
      const idx = row.items?.puzzle_index;
      if (loc && idx && !pieces[loc].includes(idx)) pieces[loc].push(idx);
    }
    for (const loc of PROJECTOR_LOCATIONS) pieces[loc].sort((a, b) => a - b);

    const projectors = { B1: null, A3: null, TF: null } as Record<ProjectorLocation, LitBy | null>;
    for (const p of fetched?.projectors ?? []) {
      if (!p.activated_at) continue;
      projectors[p.location] = { isUs: p.activated_by_group === groupId };
    }

    // History, newest first. Day 2 starts when Live control started day2.
    const day2Start = phases.find((p) => p.key === "day2")?.started_at;
    const dayOf = (iso: string): 1 | 2 => (day2Start && iso >= day2Start ? 2 : 1);
    const events: (HistoryEntry & { at: string })[] = [];
    for (const t of fetched?.tx ?? []) {
      const entry = t.reason.startsWith("Day 2 entry");
      const box = /^(Blind box|Bought .* blind box|Opened .* blind box)/.test(t.reason);
      events.push({
        id: `tx-${t.id}`,
        at: t.created_at,
        kind: entry ? "entry" : box ? "box" : t.delta < 0 ? "fix" : "game",
        day: dayOf(t.created_at),
        title: entry ? entryTitle(t.reason) : t.reason,
        detail: entry ? "Entry fee" : "",
        amount: t.delta,
        time: clock(t.created_at),
      });
    }
    for (const p of fetched?.pieces ?? []) {
      const loc = p.items?.puzzle_location;
      if (!loc) continue;
      events.push({
        id: `piece-${p.id}`,
        at: p.created_at,
        kind: "piece",
        day: dayOf(p.created_at),
        title: `Won {${loc}} piece #${p.items?.puzzle_index ?? "?"}`,
        detail: p.source === "gm_grant" ? "Station win" : "Added by Admin",
        amount: 0,
        time: clock(p.created_at),
      });
    }
    for (const loc of PROJECTOR_LOCATIONS) {
      const lit = (fetched?.projectors ?? []).find((p) => p.location === loc && p.activated_by_group === groupId);
      if (lit?.activated_at) {
        events.push({
          id: `lit-${loc}`,
          at: lit.activated_at,
          kind: "lit",
          day: 2,
          title: `{${loc}} projector lit`,
          detail: "",
          amount: 0,
          time: clock(lit.activated_at),
        });
      }
    }
    events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

    return {
      phase,
      timeLeft: remaining === null ? null : formatCountdown(Math.max(0, remaining)),
      group: { id: groupId ?? 0, name: group?.name ?? "" },
      mapUnlocked: phase === "endgame" || phase === "done",
      tokens: { balance: group?.token_balance ?? 0 },
      costs: fetched?.costs ?? DEFAULT_COSTS,
      projectors,
      pieces,
      guardian: GUARDIAN,
      boxes: SAMPLE_BOXES,
      history: events.map(({ at: _at, ...rest }) => rest),
    };
  }, [fetched, phases, offsetMs, tick, group, groupId]);

  return { data, loading: fetched === null };
}
