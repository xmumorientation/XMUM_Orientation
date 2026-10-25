"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";

// Which group is at each station, for HOGM (Ops → Stations) and Admin (Admin →
// Stations). A GM's Day 2 Start checks the group in and the end checks it out,
// so this is the group playing there. When a GM's phone could not end the game
// (no battery, no network), the group stays; `clear` checks it out
// (fn_uncheckin, which HOGM and Admin may call for any station, 0095). Both
// read station_occupancy and groups directly (0095, 0002).

export type Occupant = { groupId: number; name: string };

export function useStationOccupants() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [byStation, setByStation] = useState<Record<number, Occupant[]>>({});

  const load = useCallback(async () => {
    const [{ data: occ }, { data: groups }] = await Promise.all([
      supabase.from("station_occupancy").select("station_id, group_id").order("checked_in_at"),
      supabase.from("groups").select("id, name, display_name"),
    ]);
    const names = new Map(
      ((groups as { id: number; name: string; display_name: string | null }[] | null) ?? []).map((g) => [
        g.id,
        g.display_name?.trim() || g.name,
      ])
    );
    const next: Record<number, Occupant[]> = {};
    for (const o of (occ as { station_id: number; group_id: number }[] | null) ?? []) {
      (next[o.station_id] ??= []).push({ groupId: o.group_id, name: names.get(o.group_id) ?? `Group ${o.group_id}` });
    }
    setByStation(next);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`occupants-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "station_occupancy" }, load)
      .subscribe();
    // A missed realtime event must not leave a group on a station for long.
    const timer = window.setInterval(load, 10_000);
    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(timer);
    };
  }, [supabase, load]);

  /** Checks a group out. Returns an error message, or null. */
  const clear = useCallback(
    async (groupId: number) => {
      const { error } = await supabase.rpc("fn_uncheckin", { p_group_id: groupId });
      await load();
      return error ? friendlyError(error) : null;
    },
    [supabase, load]
  );

  return { byStation, clear };
}
