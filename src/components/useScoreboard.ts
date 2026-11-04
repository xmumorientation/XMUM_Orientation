"use client";

import { useSharedFeed, type FeedSource } from "@/lib/sharedFeed";
import { supabaseBrowser } from "@/lib/supabase/client";

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
function scoreboardSource(): FeedSource<ScoreboardRow[]> {
  const supabase = supabaseBrowser();
  return {
    async load() {
      const { data } = await supabase.rpc("fn_scoreboard");
      if (!data) return undefined;
      return (data as ScoreboardRow[])
        .map((row) => ({ id: row.id, name: row.name, color: row.color, token_balance: row.token_balance ?? 0 }))
        .sort((a, b) => a.id - b.id);
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
  return useSharedFeed("scoreboard", scoreboardSource);
}

/** Puzzle pieces held per group id (a count, not which pieces); undefined until the first load. */
function piecesSource(): FeedSource<Record<number, number>> {
  const supabase = supabaseBrowser();
  return {
    async load() {
      const { data } = await supabase.rpc("fn_scoreboard_pieces");
      if (!data) return undefined;
      const out: Record<number, number> = {};
      for (const row of data as { group_id: number; pieces: number }[]) out[row.group_id] = row.pieces ?? 0;
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

export function useScoreboardPieces(): Record<number, number> | undefined {
  return useSharedFeed("scoreboard-pieces", piecesSource);
}
