"use client";

import { ChevronDown, Lightbulb } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { groupSwatch } from "@/components/freshie/groupTheme";
import { KEY_NAMES, KeyEmblem } from "@/components/freshie/items/KeyEmblem";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PIECES_PER_SET, PROJECTOR_LABELS, PROJECTOR_LOCATIONS, type ProjectorLocation } from "@/lib/types";
import { cn } from "@/lib/utils";

import "./game-control.css";

// HOGM's and HOF's Scores tab (/token): every group's tokens and puzzle pieces. Tap a
// group to see its three puzzle keys, drawn like the Freshie Items page
// (KeyEmblem). Data: groups.token_balance, inventory + items (pieces, the rows
// a Day 2 station win writes) and projectors (who lit which). Live.

type GroupRow = { id: number; name: string; color: string | null; token_balance: number };
type PieceRow = { group_id: number; items: { puzzle_location: ProjectorLocation | null; puzzle_index: number | null } | null };
type ProjectorRow = { location: ProjectorLocation; activated_by_group: number | null };
type Pieces = Record<ProjectorLocation, number[]>;

const TOTAL = PIECES_PER_SET * PROJECTOR_LOCATIONS.length;
const emptyPieces = (): Pieces => ({ B1: [], A3: [], TF: [] });

export function GroupScores() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [pieces, setPieces] = useState<Record<number, Pieces>>({});
  const [lit, setLit] = useState<ProjectorRow[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
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
    const channel = supabase
      .channel(`gc-scores-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "projectors" }, load)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const count = (id: number) => PROJECTOR_LOCATIONS.reduce((n, loc) => n + (pieces[id]?.[loc].length ?? 0), 0);
  const rows = [...groups].sort((a, b) => b.token_balance - a.token_balance || count(b.id) - count(a.id) || a.id - b.id);

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
        {rows.map((g, i) => {
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
                <span className="gc-rank">{String(i + 1).padStart(2, "0")}</span>
                <i className="gc-swatch" style={{ background: groupSwatch(g.id, g.color) }} aria-hidden />
                <span className="gc-fold-name">{g.name}</span>
                <b className="gc-num">{g.token_balance}</b>
                <b className="gc-num gc-num-sub">
                  {count(g.id)}
                  <small>/{TOTAL}</small>
                </b>
                <ChevronDown size={18} aria-hidden className="gc-fold-chev" />
              </button>
              {open && (
                <div className="gc-fold-body">
                  <ul className="gc-keys" aria-label={`${g.name} puzzle keys`}>
                    {PROJECTOR_LOCATIONS.map((loc) => {
                      const ours = lit.some((p) => p.location === loc && p.activated_by_group === g.id);
                      return (
                        <li key={loc} className="gc-key" data-lit={ours || undefined}>
                          <KeyEmblem className="gc-key-art" loc={loc} owned={own[loc]} mode={ours ? "lit" : "normal"} />
                          <b>{KEY_NAMES[loc]}</b>
                          <small>{PROJECTOR_LABELS[loc]}</small>
                          <span className="gc-chip" data-tone={ours ? "live" : own[loc].length >= PIECES_PER_SET ? "ok" : "off"}>
                            {ours ? (
                              <>
                                <Lightbulb size={11} aria-hidden /> Lit
                              </>
                            ) : (
                              `${own[loc].length}/${PIECES_PER_SET}`
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
        {rows.length === 0 && <li className="gc-empty">No groups yet.</li>}
      </ol>
    </div>
  );
}
