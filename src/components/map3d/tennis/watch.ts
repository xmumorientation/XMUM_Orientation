import { turn } from "./link";
import { Match, type Note, type Seen, type Side } from "./match";
import type { Payload, Room, Transport } from "./net";

// DRAFT: watching a match up close (docs/ROADMAP.md, item 9, batch T3a). A phone whose camera is near a busy court
// joins that match's room and replays what the two players send each other: their positions and notes (link.ts),
// in the host's frame (the host is side 0, at the -x end). It sends nothing but its presence, which keeps the
// watchers to WATCH_MAX a match: every message the players send reaches each watcher too.
//
// A watcher shares no clock with the players and does not ask for one (a ping would reach everyone in the room).
// Each position carries the match's time, so the quickest to arrive says how far behind this phone hears the
// players. The watcher draws the match BUFFER_S behind that and plays each message at its own moment in the match,
// so the ball flies the path the players saw. It joins mid-match: the host's next position gives the score and
// the server, and the next shot brings the ball.

/**
 * Watchers a match (Ben, 2026-10-27). Each costs about 8 Realtime messages a second, so three full courts cost
 * about 120 a second on top of the matches' own 24: within Supabase Pro (about 500), not Free (about 100).
 */
export const WATCH_MAX = 5;
/** The match is drawn this long behind the quickest message, so most messages arrive before they are due. */
const BUFFER_S = 0.3;
/** How far behind this phone hears the players: the quickest message of the last LAG_S seconds. */
const LAG_S = 10;
/** The host's score, server or end, different from this phone's for this long (in the match), is taken. */
const SYNC_S = 1.5;

export type WatchStatus = "joining" | "watching" | "full";

type Due = { t: number; n: number; run: () => void };

export class Watch {
  /** The match as the players play it, both sides remote: side 0 the host, side 1 the guest. */
  readonly match = new Match(0, ["remote", "remote"]);
  status: WatchStatus = "joining";
  /** The match has a score and a server to show (the host's first position, or a round's start). */
  ready = false;
  private readonly room: Room;
  private readonly stops: (() => void)[] = [];
  private closed = false;
  private due: Due[] = [];
  private count = 0;
  private sorted = true;
  /** Each side's latest message: one side's messages play in the order they came. */
  private last: [number, number] = [-Infinity, -Infinity];
  /** Seconds between each recent position's moment in the match and its arrival, on this phone's clock. */
  private lags: { at: number; lag: number }[] = [];
  private lag = Infinity;
  /** The match's time last drawn (it never goes back), and how far the match has been moved on. */
  private shown = -Infinity;
  private stepped = -Infinity;
  private round = 0;
  /** Since when (in the match) the host's score has differed from this phone's. */
  private differs: number | null = null;
  private readonly listeners = new Set<() => void>();

  /** `key`: the match (lobby.ts Pair.key). `clock`: this phone's time (s); `wall`: the time (ms) watchers queue by. */
  constructor(
    t: Transport,
    readonly key: string,
    private readonly clock: () => number = () => performance.now() / 1000,
    wall: () => number = Date.now,
  ) {
    this.room = t.join(`match:${key}`);
    const id = t.id;
    this.stops.push(
      this.room.on("pos", (p) => this.onPosition(p)),
      this.room.on("note", (p) => this.onNote(p)),
      this.room.on("start", (p) => this.onStart(p.round as number)),
      this.room.on("resume", (p) => this.onResume(p)),
      this.room.onPresence((states) => this.onPresence(id, states)),
    );
    this.room.track({ w: wall() });
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  /** The match's time to draw now (s), or null before the first position. */
  time(now = this.clock()): number | null {
    if (this.lag === Infinity) return null;
    this.shown = Math.max(this.shown, now - this.lag - BUFFER_S);
    return this.shown;
  }

  /** Moves the match on to time t, playing each message due by then at its own moment. */
  advance(t: number) {
    if (!this.sorted) {
      this.due.sort((a, b) => a.t - b.t || a.n - b.n);
      this.sorted = true;
    }
    while (this.due.length && this.due[0].t <= t) {
      const d = this.due.shift()!;
      this.step(d.t);
      d.run();
    }
    this.step(t);
  }

  /** Out of the match's room. */
  close() {
    if (this.closed) return;
    this.closed = true;
    this.stops.forEach((s) => s());
    this.room.leave();
  }

  // ── Inside ──────────────────────────────────────────────────────────────────

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  private step(t: number) {
    if (t <= this.stepped) return;
    this.stepped = t;
    this.match.step(t);
  }

  /** A message from `side` for moment t of the match, to play when the match is drawn there. */
  private later(side: Side, t: number, run: () => void) {
    const at = Math.max(t, this.last[side]);
    this.last[side] = at;
    const tail = this.due[this.due.length - 1];
    if (tail && tail.t > at) this.sorted = false;
    this.due.push({ t: at, n: this.count++, run });
  }

  /** The match's time now as this phone hears it (no buffer), for a message that carries no time of its own. */
  private heardNow() {
    return this.clock() - this.lag;
  }

  /** At most WATCH_MAX watchers, the first to come: a later one leaves at once. */
  private onPresence(id: string, states: Map<string, Payload>) {
    if (this.closed || !states.has(id)) return;
    const rank = [...states]
      .filter(([, s]) => typeof s.w === "number")
      .sort(([a, s], [b, z]) => (s.w as number) - (z.w as number) || (a < b ? -1 : a > b ? 1 : 0))
      .findIndex(([k]) => k === id);
    const status: WatchStatus = rank < WATCH_MAX ? "watching" : "full";
    if (status === "full") this.close();
    if (status === this.status) return;
    this.status = status;
    this.emit();
  }

  /**
   * Whether a message of round r is to be played: one from an earlier round is not (a player's, sent before they
   * heard the next round start), and one from a later round starts that round. The first one heard says the round.
   */
  private inRound(r: unknown) {
    if (typeof r !== "number") return true;
    if (this.round === 0) this.round = r;
    else if (r > this.round) this.onStart(r);
    return r >= this.round;
  }

  private onPosition(p: Payload) {
    if (!this.inRound(p.r)) return;
    const side: Side = p.h ? 0 : 1;
    const s = p as unknown as Seen;
    // the guest's are in its own frame: turned round into the host's
    const seen: Seen = side === 0 ? { t: s.t, x: s.x, z: s.z, vx: s.vx, vz: s.vz } : { t: s.t, x: -s.x, z: -s.z, vx: -s.vx, vz: -s.vz };
    const now = this.clock();
    this.lags.push({ at: now, lag: now - s.t });
    while (now - this.lags[0].at > LAG_S) this.lags.shift();
    this.lag = Math.min(...this.lags.map((l) => l.lag));
    this.later(side, s.t, () => {
      this.match.receivePosition(seen, side);
      if (side === 0) this.compare(s.t, p.sc as [number, number], p.sv as Side, p.ov as boolean);
    });
  }

  private onNote(p: Payload) {
    if (!this.inRound(p.r)) return;
    const side: Side = p.h ? 0 : 1;
    const note = side === 0 ? (p as unknown as Note) : turn(p as unknown as Note);
    const t =
      note.type === "swing" ? note.start : note.type === "shot" ? note.flight.t0 : note.type === "point" ? note.t : this.heardNow();
    this.later(side, t, () => this.match.receive(note, side));
  }

  /**
   * A round starts (the first, or a rematch): from 0–0, its time counted from its start. What is left of the last
   * round (its last moments, still to be drawn) is dropped.
   */
  private onStart(round: number) {
    if (round <= this.round) return;
    this.round = round;
    this.due = [];
    this.sorted = true;
    this.last = [-Infinity, -Infinity];
    this.lags = [];
    this.lag = Infinity;
    this.shown = this.stepped = -Infinity;
    this.differs = null;
    // the host serves first in odd rounds (link.ts onStart)
    this.match.reset(0, round % 2 === 1 ? 0 : 1);
    this.setReady();
  }

  /** The host plays a point again, or ends the match, at moment t (older phones do not say t: skipped). */
  private onResume(p: Payload) {
    if (typeof p.t !== "number") return;
    const t = p.t;
    const score = p.score as [number, number];
    this.later(0, t, () => {
      this.differs = null;
      if (p.over) this.match.finish(score);
      else this.match.replay(t, score, p.server as Side);
    });
  }

  /**
   * The host's score, server and end with its position at moment t. The first gives this phone its score; after
   * that, one that stays different (a shot this phone joined too late to see, or a lost note) is taken.
   */
  private compare(t: number, score: [number, number], server: Side, over: boolean) {
    const m = this.match;
    const take = () => {
      this.differs = null;
      if (over) m.finish(score);
      else m.replay(t, score, server);
    };
    if (!this.ready) {
      take();
      this.setReady();
      return;
    }
    const same = score[0] === m.score[0] && score[1] === m.score[1] && server === m.server && over === (m.phase === "over");
    if (same) this.differs = null;
    else if (this.differs === null) this.differs = t;
    else if (t - this.differs > SYNC_S) take();
  }

  private setReady() {
    if (this.ready) return;
    this.ready = true;
    this.emit();
  }
}
