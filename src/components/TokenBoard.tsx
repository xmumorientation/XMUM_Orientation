"use client";

import { Puzzle } from "lucide-react";
import { useState } from "react";

import { groupSwatch } from "@/components/freshie/groupTheme";
import { GroupBadge } from "@/components/GroupBadge";
import { usePhases } from "@/components/PhaseTimerProvider";
import { useScoreboardPieces } from "@/components/useScoreboard";
import { PIECES_PER_SET, PROJECTOR_LOCATIONS } from "@/lib/types";

// Home's Tokens board, for every role. Day 1: each group's tokens. Day 2: its
// tokens and the puzzle pieces it holds (fn_scoreboard_pieces, a count only).
// Starts on the day whose game is running (Day 2 for the endgame too).

const TOTAL_PIECES = PIECES_PER_SET * PROJECTOR_LOCATIONS.length;

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
  const [picked, setPicked] = useState<Day | null>(null);
  const live = phases.find((p) => p.state === "active" || p.state === "paused");
  const day: Day = picked ?? (live && (live.key === "day2" || live.is_endgame) ? 2 : 1);
  const pieces = useScoreboardPieces();

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
              {day === 2 && (
                <span className="fh-team-pz fh-mono" title="Puzzle pieces held" aria-label={`${pieces?.[row.id] ?? 0} of ${TOTAL_PIECES} puzzle pieces`}>
                  <Puzzle size={13} aria-hidden /> {pieces ? `${pieces[row.id] ?? 0}/${TOTAL_PIECES}` : "–"}
                </span>
              )}
              <span className="fh-team-sc fh-slab">{row.token_balance}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}
