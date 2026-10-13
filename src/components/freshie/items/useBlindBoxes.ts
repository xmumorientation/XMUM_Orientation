"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase/client";
import type { BlindBoxClaim, BlindBoxResult } from "@/lib/types";

import type { BoxGroup, BoxReward, HistoryEntry } from "./types";

// The group's real blind boxes for the Items page: every box the group has
// BOUGHT (by scanning a seller's QR). A box stays "owned" until it is opened
// from here (fn_bb_open). A Freshie can read their own group's rows; the prize
// range is never in them, so it stays hidden until the box is opened.

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

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
        name: /box$/i.test(c.type_name) ? c.type_name : `${c.type_name} box`,
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

/** Activity rows: each purchase, and each opening. Newest first. */
export function boxHistoryOf(claims: BlindBoxClaim[], day: 1 | 2): HistoryEntry[] {
  const rows: { at: string; entry: HistoryEntry }[] = [];
  for (const c of claims) {
    rows.push({
      at: c.created_at,
      entry: {
        id: `bb-buy-${c.id}`,
        kind: "box",
        day,
        title: `Bought a ${c.type_name} box`,
        detail: `From ${c.seller_name}`,
        amount: -c.price,
        time: clock(c.created_at),
      },
    });
    if (c.status === "opened" && c.opened_at) {
      rows.push({
        at: c.opened_at,
        entry: {
          id: `bb-open-${c.id}`,
          kind: "box",
          day,
          title: `Opened a ${c.type_name} box`,
          detail: `Won ${c.tokens ?? 0} token${c.tokens === 1 ? "" : "s"}`,
          amount: c.tokens ?? 0,
          time: clock(c.opened_at),
        },
      });
    }
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at)).map((r) => r.entry);
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

  /** Opens the oldest sealed box of this group of boxes. Null if it failed. */
  const openBox = useCallback(
    async (key: string): Promise<BoxReward | null> => {
      const target = claims
        .filter((c) => c.status === "owned" && `${c.type_name}|${c.special ? 1 : 0}` === key)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      if (!target) return null;
      const { data, error } = await supabase.rpc("fn_bb_open", { p_claim_id: target.id });
      if (error) {
        await reload();
        return null;
      }
      await reload();
      return { type: "tokens", amount: (data as BlindBoxResult).tokens };
    },
    [supabase, claims, reload]
  );

  return { claims, loaded, reload, openBox };
}
