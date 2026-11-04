"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { KEY_NAMES, KeyEmblem } from "@/components/freshie/items/KeyEmblem";
import { groupSwatch } from "@/components/freshie/groupTheme";
import { GroupBadge } from "@/components/GroupBadge";
import { usePhases } from "@/components/PhaseTimerProvider";
import { FoldBody } from "@/components/staff/game/parts";
import { useProjectorPlaces } from "@/components/useConfig";
import "@/components/staff/game/game-control.css";
import { useScoreboardPieces, type GroupPieces } from "@/components/useScoreboard";
import { PIECES_PER_SET, PROJECTOR_LOCATIONS } from "@/lib/types";

// Home's Tokens board, for every role. Day 1: each group's tokens. Day 2: like
// HOGM's Scores page, tokens and puzzles held (n/15) per group, and a dropdown
// with its three keys and the pieces it holds (fn_scoreboard_pieces).
// Starts on the day whose game is running (Day 2 for the endgame too).

const TOTAL_PIECES = PIECES_PER_SET * PROJECTOR_LOCATIONS.length;
const NO_PIECES: GroupPieces = { B1: [], A3: [], TF: [] };

export type BoardRow = { id: number; name: string; color: string | null; token_balance: number };
type Day = 1 | 2;

export function TokenBoard({
  rows,
  groupId = null,
  titleId,
  aside,
}: {
  rows: BoardRow[];
  groupId?: number | null;
  titleId: string;
  /** Right of the heading: the Live pill, or a link. */
  aside?: React.ReactNode;
}) {
  const { phases } = usePhases();
  const places = useProjectorPlaces();
  const [picked, setPicked] = useState<Day | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const live = phases.find((p) => p.state === "active" || p.state === "paused");
  const day: Day = picked ?? (live && (live.key === "day2" || live.is_endgame) ? 2 : 1);
  const pieces = useScoreboardPieces();
  const held = (id: number) => pieces?.[id] ?? NO_PIECES;
  const heldCount = (id: number) => PROJECTOR_LOCATIONS.reduce((n, loc) => n + held(id)[loc].length, 0);

  return (
    <>
      <div className="fh-stop-head fh-stop-head-row">
        <h2 id={titleId} className="fh-h2 fh-slab">
          {day === 2 ? "Tokens & Puzzles" : "Tokens"}
        </h2>
        {aside}
      </div>
      <div className="fh-day-seg" role="tablist" aria-label="Day">
        {([1, 2] as Day[]).map((d) => (
          <button key={d} type="button" role="tab" aria-selected={day === d} onClick={() => setPicked(d)}>
            Day {d}
          </button>
        ))}
      </div>

      {day === 1 ? (
        <ol className="fh-board">
          {rows.map((row) => {
            const me = row.id === groupId;
            return (
              <li key={row.id} className="fh-team" data-me={me || undefined}>
                <GroupBadge id={row.id} color={groupSwatch(row.id, row.color)} />
                <b>
                  {row.name}
                  {me && <span className="fh-you fh-mono">YOU</span>}
                </b>
                <span className="fh-team-sc fh-slab">{row.token_balance}</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <>
          <div className="fh-pz-cols fh-mono" aria-hidden>
            <span>Group</span>
            <span>Tokens</span>
            <span>Puzzles</span>
          </div>
          <ol className="fh-board fh-board-pz">
            {rows.map((row) => {
              const me = row.id === groupId;
              const open = openId === row.id;
              const own = held(row.id);
              return (
                <li key={row.id} className="fh-pz" data-me={me || undefined}>
                  <button
                    type="button"
                    className="fh-pz-head"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : row.id)}
                  >
                    <GroupBadge id={row.id} color={groupSwatch(row.id, row.color)} />
                    <b>
                      {row.name}
                      {me && <span className="fh-you fh-mono">YOU</span>}
                    </b>
                    <span className="fh-team-sc fh-slab">{row.token_balance}</span>
                    <span className="fh-pz-n fh-slab">
                      {pieces ? heldCount(row.id) : "–"}
                      <small>/{TOTAL_PIECES}</small>
                    </span>
                    <ChevronDown size={18} aria-hidden className="fh-pz-chev" data-open={open || undefined} />
                  </button>
                  <FoldBody open={open}>
                    <ul className="fh-pz-keys" aria-label={`${row.name} puzzle keys`}>
                      {PROJECTOR_LOCATIONS.map((loc) => (
                        <li key={loc} className="fh-pz-key">
                          <KeyEmblem className="fh-pz-art" loc={loc} owned={own[loc]} mode="normal" />
                          <b>{KEY_NAMES[loc]}</b>
                          <small>{places[loc].name}</small>
                          <span className="fh-pz-chip fh-mono">
                            {own[loc].length}/{PIECES_PER_SET}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </FoldBody>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </>
  );
}
