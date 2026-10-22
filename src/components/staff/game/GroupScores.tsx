"use client";

import { ChevronDown, Lightbulb } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { groupSwatch } from "@/components/freshie/groupTheme";
import { GroupBadge } from "@/components/GroupBadge";
import { KEY_NAMES, KeyEmblem } from "@/components/freshie/items/KeyEmblem";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { useProjectorPlaces } from "@/components/useConfig";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PIECES_PER_SET, PROJECTOR_LOCATIONS, type ProjectorLocation } from "@/lib/types";
import { cn } from "@/lib/utils";

import "./game-control.css";
import { FoldBody } from "./parts";

// HOGM's and HOF's Scores tab (/token): every group's tokens and puzzle pieces. Tap a
// group to see its three puzzle keys, drawn like the Freshie Items page
// (KeyEmblem). Data: groups.token_balance, inventory + items (pieces, the rows
// a Day 2 station win writes) and projectors (who lit which). Live.
// countsOnly (GM's /token): a GM may not read the groups or inventory tables
// (0002 RLS), so tokens come from fn_scoreboard() and each key's piece count
// from fn_puzzle_status() (one call per group and key), refreshed every 30 s.
// It is a count, not which pieces, so the open row shows numbers, not key art.
// Nor which group lit a projector: that is Committee only (0096).

type GroupRow = { id: number; name: string; color: string | null; token_balance: number };
type PieceRow = { group_id: number; items: { puzzle_location: ProjectorLocation | null; puzzle_index: number | null } | null };
type ProjectorRow = { location: ProjectorLocation; activated_by_group: number | null };
type Pieces = Record<ProjectorLocation, number[]>;
type Counts = Record<ProjectorLocation, number>;

const TOTAL = PIECES_PER_SET * PROJECTOR_LOCATIONS.length;
const emptyPieces = (): Pieces => ({ B1: [], A3: [], TF: [] });

export function GroupScores({ countsOnly = false }: { countsOnly?: boolean }) {
  const places = useProjectorPlaces();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [pieces, setPieces] = useState<Record<number, Pieces>>({});
  const [counts, setCounts] = useState<Record<number, Counts>>({});
  const [lit, setLit] = useState<ProjectorRow[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    async function loadCounts() {
      const sb = await supabase.rpc("fn_scoreboard");
      if (!active || !sb.data) return;
      const gs = (sb.data as GroupRow[]).map((g) => ({ ...g, token_balance: g.token_balance ?? 0 }));
      setGroups(gs);
      const found = await Promise.all(
        gs.flatMap((g) =>
          PROJECTOR_LOCATIONS.map(async (loc) => {
            const { data } = await supabase.rpc("fn_puzzle_status", { p_group_id: g.id, p_location: loc });
            return { id: g.id, loc, n: (data as { pieces?: number } | null)?.pieces ?? null };
          })
        )
      );
      if (!active) return;
      // A failed call keeps the last count instead of showing 0.
      setCounts((cur) => {
        const next: Record<number, Counts> = {};
        for (const { id, loc, n } of found) {
          (next[id] ??= { B1: 0, A3: 0, TF: 0 })[loc] = n ?? cur[id]?.[loc] ?? 0;
        }
        return next;
      });
    }
    async function load() {
      if (countsOnly) return loadCounts();
      const [gs, inv, pj] = await Promise.all([
        supabase.from("groups").select("id, name, color, token_balance").order("id"),
        supabase.from("inventory").select("group_id, items!inner(type, puzzle_location, puzzle_index)").eq("items.type", "puzzle"),
        supabase.from("projectors").select("location, activated_by_group"),
      ]);
      if (!active) return;
      const byGroup: Record<number, Pieces> = {};
      for (const row of (inv.data ?? []) as unknown as PieceRow[]) {
        const loc = row.items?.puzzle_location;
        const idx = row.items?.puzzle_index;
        if (!loc || !idx) continue;
        const own = (byGroup[row.group_id] ??= emptyPieces());
        if (!own[loc].includes(idx)) own[loc].push(idx);
      }
      setGroups(((gs.data ?? []) as GroupRow[]).map((g) => ({ ...g, token_balance: g.token_balance ?? 0 })));
      setPieces(byGroup);
      setLit((pj.data ?? []) as ProjectorRow[]);
    }
    load();
    // Realtime sends a GM no groups or inventory events (RLS), so countsOnly also refreshes every 30 s.
    const refreshVisible = () => { if (document.visibilityState === "visible") void load(); };
    const timer = countsOnly ? window.setInterval(refreshVisible, 30000) : undefined;
    if (countsOnly) document.addEventListener("visibilitychange", refreshVisible);
    const channel = supabase
      .channel(`gc-scores-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "projectors" }, load)
      .subscribe();
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
      supabase.removeChannel(channel);
    };
  }, [supabase, countsOnly]);

  const owned = (id: number, loc: ProjectorLocation) =>
    countsOnly ? (counts[id]?.[loc] ?? 0) : (pieces[id]?.[loc].length ?? 0);
  const count = (id: number) => PROJECTOR_LOCATIONS.reduce((n, loc) => n + owned(id, loc), 0);

  return (
    <div className={cn("gc", vxDisplay.variable, vxSlab.variable)}>
      <div className="gc-bg" aria-hidden>
        <i className="gc-orb gc-orb-navy" />
        <i className="gc-orb gc-orb-pink" />
      </div>

      <header className="gc-top">
        <p className="gc-eyebrow">Live</p>
        <h1 className="gc-title">Scores</h1>
      </header>

      <div className="gc-scores-head" aria-hidden>
        <span>Group</span>
        <span>Tokens</span>
        <span>Puzzles</span>
      </div>
      <ol className="gc-list gc-scores">
        {groups.map((g) => {
          const open = openId === g.id;
          const own = pieces[g.id] ?? emptyPieces();
          return (
            <li key={g.id} className="gc-card gc-fold" data-open={open || undefined}>
              <button
                type="button"
                className="gc-fold-head gc-score-head"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : g.id)}
              >
                <GroupBadge id={g.id} color={groupSwatch(g.id, g.color)} />
                <span className="gc-fold-name">{g.name}</span>
                <b className="gc-num">{g.token_balance}</b>
                <b className="gc-num gc-num-sub">
                  {count(g.id)}
                  <small>/{TOTAL}</small>
                </b>
                <ChevronDown size={18} aria-hidden className="gc-fold-chev" />
              </button>
              <FoldBody open={open}>
                <div className="gc-fold-body">
                  <ul className="gc-keys" aria-label={`${g.name} puzzle keys`}>
                    {PROJECTOR_LOCATIONS.map((loc) => {
                      const ours = lit.some((p) => p.location === loc && p.activated_by_group === g.id);
                      const n = owned(g.id, loc);
                      const full = n >= PIECES_PER_SET;
                      return (
                        <li key={loc} className="gc-key" data-lit={ours || undefined}>
                          {countsOnly ? (
                            <b className="gc-key-count">
                              {n}
                              <small>/{PIECES_PER_SET}</small>
                            </b>
                          ) : (
                            <KeyEmblem className="gc-key-art" loc={loc} owned={own[loc]} mode={ours ? "lit" : "normal"} />
                          )}
                          <b>{KEY_NAMES[loc]}</b>
                          <small>{places[loc].name}</small>
                          {(!countsOnly || ours || full) && (
                            <span className="gc-chip" data-tone={ours ? "live" : full ? "ok" : "off"}>
                              {ours ? (
                                <>
                                  <Lightbulb size={11} aria-hidden /> Lit
                                </>
                              ) : countsOnly ? (
                                "Full set"
                              ) : (
                                `${n}/${PIECES_PER_SET}`
                              )}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </FoldBody>
            </li>
          );
        })}
        {groups.length === 0 && <li className="gc-empty">No groups yet.</li>}
      </ol>
    </div>
  );
}
