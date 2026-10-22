"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase/client";
import type { BlindBoxClaim, BlindBoxResult } from "@/lib/types";

import type { BoxGroup, BoxReward } from "./types";

// The group's real blind boxes for the Items page: every box the group has
// BOUGHT (by scanning a seller's QR). A box stays "owned" until it is opened
// from here (fn_bb_open). A Freshie can read their own group's rows; the prize
// range is never in them, so it stays hidden until the box is opened.

/** Groups the claims by box type: sealed count, and what the opened ones gave (oldest first). */
export function boxGroupsOf(claims: BlindBoxClaim[]): BoxGroup[] {
  const groups = new Map<string, BoxGroup>();
  const ordered = [...claims].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const c of ordered) {
    const key = `${c.type_name}|${c.special ? 1 : 0}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        name: /box$/i.test(c.type_name) ? c.type_name : `${c.type_name} Box`,
        label: c.type_name,
        special: c.special,
        unopened: 0,
        opened: [],
      };
      groups.set(key, g);
    }
    if (c.status === "owned") g.unopened += 1;
  }
  const opened = [...claims]
    .filter((c) => c.status === "opened")
    .sort((a, b) => (a.opened_at ?? "").localeCompare(b.opened_at ?? ""));
  for (const c of opened) groups.get(`${c.type_name}|${c.special ? 1 : 0}`)!.opened.push(c.tokens ?? 0);
  // special boxes first, then the rest by name
  return [...groups.values()].sort((a, b) => Number(b.special) - Number(a.special) || a.name.localeCompare(b.name));
}

export function useBlindBoxes(groupId: number | null, enabled: boolean) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [claims, setClaims] = useState<BlindBoxClaim[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!groupId) return;
    const { data } = await supabase
      .from("blind_box_claims")
      .select("id, assignment_id, type_id, type_name, seller_name, seller_profile_id, seller_station_id, group_id, price, tokens, special, status, created_at, opened_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });
    setClaims((data as BlindBoxClaim[]) ?? []);
    setLoaded(true);
  }, [supabase, groupId]);

  useEffect(() => {
    if (!enabled || !groupId) return;
    reload();
    // A box bought by scanning a QR (here or on another phone) shows up at once.
    const channel = supabase
      .channel(`items-boxes-${groupId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "blind_box_claims", filter: `group_id=eq.${groupId}` },
        reload
      )
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [supabase, groupId, enabled, reload]);

  /**
   * Opens the oldest sealed box of this group of boxes. Null if it failed or
   * there is none left. The sealed boxes are read fresh, and a box another
   * phone on the same group login opened a moment ago (fn_bb_open answers
   * `duplicate`) is skipped, so one box is never revealed twice.
   */
  const openBox = useCallback(
    async (key: string): Promise<BoxReward | null> => {
      if (!groupId) return null;
      const [typeName, special] = [key.slice(0, key.lastIndexOf("|")), key.endsWith("|1")];
      const { data: sealed } = await supabase
        .from("blind_box_claims")
        .select("id")
        .eq("group_id", groupId)
        .eq("status", "owned")
        .eq("type_name", typeName)
        .eq("special", special)
        .order("created_at", { ascending: true })
        .limit(3);
      for (const target of (sealed as { id: number }[] | null) ?? []) {
        const { data, error } = await supabase.rpc("fn_bb_open", { p_claim_id: target.id });
        if (error) break;
        const r = data as BlindBoxResult;
        if (r.duplicate) continue;
        await reload();
        return { type: "tokens", amount: r.tokens, real: { special: r.special, seller: r.seller_name, balance: r.balance } };
      }
      await reload();
      return null;
    },
    [supabase, groupId, reload]
  );

  return { claims, loaded, reload, openBox };
}
