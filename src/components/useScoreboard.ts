"use client";

import { reloadSharedFeed, useSharedFeed, type FeedSource } from "@/lib/sharedFeed";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ProjectorLocation } from "@/lib/types";

/** One row of fn_scoreboard(): every group's name, colour and tokens. */
export interface ScoreboardRow {
  id: number;
  name: string;
  color: string | null;
  token_balance: number;
}

// fn_scoreboard(), because a GM may not select the groups table (0002 RLS).
// Shared by Staff Home and Freshie Home's Tokens and cached between visits
// (src/lib/sharedFeed.ts). Realtime on groups, plus a 30 s refresh for the
// events RLS does not send to a GM.
export type ScoreboardState = {
  rows: ScoreboardRow[] | undefined;
  updatedAt: number | null;
  failed: boolean;
};

function scoreboardSource(): FeedSource<ScoreboardState> {
  const supabase = supabaseBrowser();
  return {
    async load(current) {
      try {
        const { data, error } = await supabase.rpc("fn_scoreboard");
        if (error || !data) throw new Error("Scoreboard unavailable");
        const rows = (data as ScoreboardRow[])
          .map((row) => ({ id: row.id, name: row.name, color: row.color, token_balance: row.token_balance ?? 0 }))
          .sort((a, b) => a.id - b.id);
        return { rows, updatedAt: Date.now(), failed: false };
      } catch {
        return { rows: current?.rows, updatedAt: current?.updatedAt ?? null, failed: true };
      }
    },
    listen(reload) {
      const channel = supabase
        .channel(`scoreboard-feed-${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, reload)
        .subscribe();
      return () => void supabase.removeChannel(channel);
    },
    pollMs: 30_000,
  };
}

/** Groups in id order with their tokens; undefined until the first load. */
export function useScoreboard(): ScoreboardRow[] | undefined {
  return useScoreboardState()?.rows;
}

/** Status and cached rows use the same request, subscription and polling as all scoreboard readers. */
export function useScoreboardState() {
  return useSharedFeed("scoreboard", scoreboardSource);
}

export function refreshScoreboard() {
  reloadSharedFeed("scoreboard");
}

export type GroupPieces = Record<ProjectorLocation, number[]>;

/** Piece numbers held per key, by group id (which pieces, from fn_scoreboard_pieces); undefined until the first load. */
function piecesSource(): FeedSource<Record<number, GroupPieces>> {
  const supabase = supabaseBrowser();
  return {
    async load() {
      const { data, error } = await supabase.rpc("fn_scoreboard_pieces");
      if (error || !data) return undefined;
      const out: Record<number, GroupPieces> = {};
      for (const row of data as { group_id: number; location: ProjectorLocation; puzzle_index: number }[]) {
        const own = (out[row.group_id] ??= { B1: [], A3: [], TF: [] });
        own[row.location]?.push(row.puzzle_index);
      }
      return out;
    },
    // Realtime sends a player only their own group's inventory, so the poll does the rest.
    listen(reload) {
      const channel = supabase
        .channel(`scoreboard-pieces-${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, reload)
        .subscribe();
      return () => void supabase.removeChannel(channel);
    },
    pollMs: 30_000,
  };
}

export function useScoreboardPieces(): Record<number, GroupPieces> | undefined {
  return useSharedFeed("scoreboard-pieces", piecesSource);
}
