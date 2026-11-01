import { turn } from "./link";
import { guess, type Match, type Seen, type Side } from "./match";
import type { Room } from "./net";

// DRAFT: a match against the bot, for its watchers (docs/ROADMAP.md, item 9; Ben, 2026-10-27: watchers see the bot
// match for real too). The match plays on this phone alone (TennisMap.tsx botGame()); this sends it to its room as
// a hosted match would (link.ts): this phone's player as the host (side 0), the bot as the guest, its notes and
// positions in its own frame (turned round), each with `h` and `r`. So watch.ts plays it as it plays any match.
// It sends only while someone watches (the room's presence), and nothing else: no clock, no start, no resume.

/** A position goes when a watcher's guess from the last one is POS_ERR metres out, at most every POS_S, at least every ALIVE_S. */
const POS_ERR = 0.15;
const POS_S = 0.125;
const ALIVE_S = 1;

const SIDES = [0, 1] as const;

export class Relay {
  /** Someone watches: keep the match moving on (and drawing) on this phone. */
  watched = false;
  private readonly sent: [number, number] = [-Infinity, -Infinity];
  private readonly last: [Seen | null, Seen | null] = [null, null];

  /** `room`: the match's room (`match:<key>`), joined by onMap.ts playBot(). */
  constructor(
    private readonly room: Room,
    private readonly match: Match,
  ) {
    match.relay = true;
    // the room is left with the seat (onMap.ts leave()), and this listener with it
    room.onPresence((states) => {
      const watched = states.size > 0;
      if (watched === this.watched) return;
      this.watched = watched;
      // a new watcher needs the host's score at once
      if (watched) this.sent.fill(-Infinity);
    });
  }

  /** Sends what happened up to match time t: call it after each Match step. */
  tick(t: number) {
    const m = this.match;
    const notes = m.takeSided();
    if (!this.watched) return;
    const r = m.rounds;
    for (const [side, note] of notes) {
      this.room.send("note", side === 0 ? { ...note, h: true, r } : { ...turn(note), h: false, r });
    }
    for (const side of SIDES) this.position(side, t, r);
  }

  private position(side: Side, t: number, r: number) {
    const p = this.match.players[side];
    // a stroke's slide watchers draw themselves, from the swing's note
    if (p.swing?.hit && !p.swing.done && t - this.sent[side] < ALIVE_S) return;
    const last = this.last[side];
    const g = last && guess(last, t);
    const off = g ? Math.hypot(p.x - g[0], p.z - g[1]) : Infinity;
    if (!((off > POS_ERR && t - this.sent[side] >= POS_S) || t - this.sent[side] >= ALIVE_S)) return;
    this.sent[side] = t;
    const seen: Seen = (this.last[side] = { t, x: p.x, z: p.z, vx: p.vx, vz: p.vz });
    if (side === 1) {
      this.room.send("pos", { t, x: -seen.x, z: -seen.z, vx: -seen.vx, vz: -seen.vz, h: false, r });
      return;
    }
    const m = this.match;
    this.room.send("pos", { ...seen, sc: m.score, sv: m.server, ov: m.phase === "over", h: true, r });
  }
}
