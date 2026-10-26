import type { Flight } from "./ball";
import { parseKey } from "./lobby";
import { guess, Match, type Note, type Seen, type Side, type Who } from "./match";
import type { Payload, Room, Transport } from "./net";
import type { V3 } from "./rally";

// DRAFT: one match between two phones (docs/ROADMAP.md, item 9, batch T2a), in a room of its own. The host (the
// first of the two in the queue) keeps the clock, and the guest works out the difference from pings. Each phone
// runs its own Match with its own player nearest the camera. Everything goes in the sender's frame, and the
// receiver turns it round (x and z flipped, the sides swapped). A player's position goes about 8 times a second
// while they move and once a second while still, which is also how each phone knows the other is there.
//
// Messages (Room events): hi (until the other phone answers), ping / pong (the clock), ready / start (the guest
// is in time with the host; the match starts at `at` on the host's clock), note (Match.takeNotes), pos, away /
// back (a tab hidden or shown), resume (the host restarts the point after a pause), end (the other one left, so
// the sender won), rematch, bye.

/**
 * A player's position and speed go when the other phone's guess from the last ones (Match guess()) is POS_ERR
 * metres out, at most every POS_S, and at least every ALIVE_S. So a player running straight or standing still sends
 * little (fewer Realtime messages in T2b).
 */
const POS_ERR = 0.15;
const POS_S = 0.125;
const ALIVE_S = 1;
/**
 * Silence for this long and the match pauses; the silent player loses after GONE_S more. Mobile data drops out
 * for a second or two now and then, and a phone can stall that long compiling a shader: neither should pause it.
 */
const QUIET_S = 4;
const GONE_S = 10;
/** The match starts this long after both phones are ready; after a pause, the point starts again this long after. */
const COUNTDOWN_S = 3;
const RESUME_S = 2;
/** The other phone must answer within this long, or the match does not start. */
const MEET_S = 8;
/** Clock pings: PINGS at first, then one every PING_S. Hello, ready and start repeat every RESEND_S until heard. */
const PINGS = 5;
const PING_S = 4;
const RESEND_S = 0.5;
/** A finished match waits this long for both players to want a rematch. */
const REMATCH_S = 30;
/** After the other player lost by leaving, "end" goes again when they are heard, at most this often. */
const END_S = 2;
/**
 * A message can be lost (a dropped connection): each position also carries the sender's score, server and whether
 * its match is over. If they stay different from this phone's for SYNC_S, or the match stalls waiting on the
 * other phone (Match stalled()), the host plays the point again on both with its own score (or ends the match, if
 * it has). At most once every SYNC_GAP.
 */
const SYNC_S = 1.2;
const SYNC_GAP = 3;

export type LinkPhase = "connecting" | "countdown" | "playing" | "paused" | "over" | "closed";

export type LinkView = {
  phase: LinkPhase;
  /** Rounds started: 0 while the phones are still meeting, then 1, and one more for each rematch. */
  round: number;
  /** The other player said yes or no to a rematch (null: not yet), and so did this one. */
  rematch: { me: boolean | null; them: boolean | null };
  /** Why it closed: a rematch declined, the other player left, or the other phone never came. */
  closed: "declined" | "left" | "timeout" | null;
};

const flip = (p: V3): V3 => [-p[0], p[1], -p[2]];
const flipFlight = (f: Flight): Flight => ({ t0: f.t0, p: flip(f.p), v: flip(f.v) });
const swap = (side: Side): Side => (side === 0 ? 1 : 0);

/** A note turned round for the other phone, whose frame is this one's turned half round, with the sides swapped. */
export function turn(note: Note): Note {
  switch (note.type) {
    case "swing":
      return {
        ...note,
        to: note.to && [-note.to[0], -note.to[1]],
        toss: note.toss && { from: flip(note.toss.from), to: flip(note.toss.to) },
      };
    case "shot":
      return { ...note, flight: flipFlight(note.flight) };
    case "point":
      return { ...note, winner: swap(note.winner) };
    default:
      return note;
  }
}

/** The same number from the same key on both phones. */
function seedOf(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
}

export class Link {
  readonly match: Match;
  private readonly room: Room;
  private readonly stops: (() => void)[] = [];
  private view: LinkView = { phase: "connecting", round: 0, rematch: { me: null, them: null }, closed: null };
  private readonly listeners = new Set<() => void>();
  /** The host's clock minus this one's (s): 0 on the host. */
  private offset = 0;
  private bestRtt = Infinity;
  private pongs = 0;
  private pinged = -Infinity;
  private met = false;
  private readonly opened: number;
  /** When this phone last heard the other (this phone's clock). */
  private heard: number;
  private resent = -Infinity;
  private posSent = -Infinity;
  private posLast: Seen | null = null;
  /** Time 0 of the match on the host's clock, once the host has set it; and when play (re)starts. */
  private startAt: number | null = null;
  private playAt = Infinity;
  private round = 0;
  private pausedAt: number | null = null;
  private overAt: number | null = null;
  private endSent = -Infinity;
  private ticked = Infinity;
  /** Since when the other phone's score (or server, or end) has differed from this one's; the last resync. */
  private differs: number | null = null;
  private synced = -Infinity;
  /** The other phone is hidden, or this one is. */
  private theyAway = false;
  private away = false;
  /**
   * The other phone has gone from the room's presence (its tab closed or its connection dropped; a "bye" sent as a
   * page closes may never arrive). The match pauses at once, as for silence, and they lose GONE_S later unless
   * they come back. `seenThem`: they were in it.
   */
  private gone = false;
  private seenThem = false;

  /** `key`: the lobby's Pair.key. `host`: this phone hosts it. `local`: who plays here ("bot" for two bots). */
  constructor(
    t: Transport,
    readonly key: string,
    readonly host: boolean,
    local: Who,
    private readonly clock: () => number,
  ) {
    this.room = t.join(`match:${key}`);
    this.match = new Match(seedOf(key), [local, "remote"], host ? 0 : 1);
    this.opened = this.heard = clock();
    const on = (event: string, fn: (p: Payload) => void) =>
      this.stops.push(
        this.room.on(event, (p) => {
          this.hear();
          fn(p);
        }),
      );
    on("hi", () => {});
    on("ping", (p) => this.room.send("pong", { id: p.id, t: p.t, h: this.shared() }));
    on("pong", (p) => this.onPong(p.t as number, p.h as number));
    on("ready", () => this.host && this.begin());
    on("start", (p) => !this.host && this.onStart(p.round as number, p.at as number));
    on("note", (p) => this.match.receive(turn(p as unknown as Note)));
    on("pos", (p) => {
      const s = p as unknown as Seen;
      this.match.receivePosition({ t: s.t, x: -s.x, z: -s.z, vx: -s.vx, vz: -s.vz });
      this.compare(p.sc as [number, number], p.sv as Side, p.ov as boolean);
    });
    on("away", () => {
      this.theyAway = true;
    });
    on("back", () => {
      this.theyAway = false;
      if (this.host) this.resume();
    });
    on("wait", () => this.host && this.resume());
    on("resume", (p) => {
      if (this.host) return;
      const score = p.score as [number, number];
      const mine: [number, number] = [score[1], score[0]];
      if (p.over) this.finishAs(mine);
      else this.replayAt(p.at as number, mine, swap(p.server as Side));
    });
    on("end", (p) => this.lost(swap(p.left as Side)));
    on("rematch", (p) => this.onRematch(p.yes as boolean));
    on("bye", () => this.onBye());
    // presence in the match's room: two players, a join and a leave each, and the leave comes even when the page
    // that left could not say so
    const { host: h, guest } = parseKey(key);
    const them = t.id === h ? guest : h;
    this.stops.push(
      this.room.onPresence((states) => {
        const here = states.has(them);
        if (here) this.seenThem = true;
        const gone = this.seenThem && !here;
        if (gone === this.gone) return;
        this.gone = gone;
        if (!gone && this.host && this.view.phase === "paused") this.resume();
      }),
    );
    this.room.track({ here: true });
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getView = () => this.view;

  /** The host's clock (s). */
  shared(now = this.clock()) {
    return now + this.offset;
  }

  /** The match's time now (s): negative before it starts. */
  matchTime(now = this.clock()) {
    return this.startAt === null ? -1 : this.shared(now) - this.startAt;
  }

  /** The match's time of an input event (its timeStamp in ms, on this phone's performance clock). */
  matchTimeAt(stamp: number) {
    return this.matchTime(stamp / 1000);
  }

  /** Seconds left: of the countdown, or of the pause before the silent player loses. */
  secondsLeft(now = this.clock()) {
    if (this.view.phase === "countdown") return Math.max(0, this.playAt - this.shared(now));
    if (this.view.phase === "paused" && this.pausedAt !== null) return Math.max(0, this.pausedAt + GONE_S - now);
    return 0;
  }

  /** Moves everything on: call it every frame. */
  tick(now = this.clock()) {
    const v = this.view;
    if (v.phase === "closed") return;
    if (now - this.resent >= RESEND_S) {
      this.resent = now;
      if (!this.met) this.room.send("hi", {});
      else if (!this.host && this.pongs >= 3 && this.startAt === null) this.room.send("ready", {});
    }
    if (!this.host && this.met && now - this.pinged >= (this.pongs < PINGS ? 0.1 : PING_S)) {
      this.pinged = now;
      this.room.send("ping", { id: this.pongs, t: now });
    }
    if (!this.met) {
      if (now - this.opened > MEET_S) this.close("timeout");
      return;
    }
    const t = this.matchTime(now);
    // this phone stopped running for a while (asleep, without a hidden tab first): it does not play through the
    // gap on its own, but pauses, so the host plays the point again
    const gap = now - this.ticked > QUIET_S;
    this.ticked = now;
    if (gap && v.phase === "playing") {
      this.pausedAt = now;
      this.room.send("wait", {});
      this.set({ phase: "paused" });
    }
    if (v.phase === "countdown" && this.shared(now) >= this.playAt) this.set({ phase: "playing" });
    // a hidden tab does not play on: the other phone has paused for it
    if (this.view.phase === "playing" && !this.away) {
      this.match.step(t);
      for (const n of this.match.takeNotes()) this.room.send("note", n as unknown as Payload);
      // waiting on a note that never came, while the other phone still talks: set both right
      if (this.match.stalled(t) && now - this.heard < ALIVE_S * 1.5) this.resync();
      if (this.match.phase === "over") {
        // the host says when the match is over (and with what score); the guest waits to hear it
        if (this.host) {
          this.room.send("resume", { at: this.shared(now), score: this.match.score, server: this.match.server, over: true });
          this.overAt = now;
          this.set({ phase: "over" });
        }
      } else if (this.theyAway || this.gone || now - this.heard > QUIET_S) {
        this.pausedAt = now;
        // the host may still be playing (its tab was the one hidden): it restarts the point when it hears this
        this.room.send("wait", {});
        this.set({ phase: "paused" });
      }
    }
    if (this.view.phase === "paused" && this.pausedAt !== null && now - this.pausedAt > GONE_S) {
      // they never came back: they lose
      this.match.forfeit(1);
      this.endSent = now;
      this.room.send("end", { left: 1 });
      this.overAt = now;
      this.set({ phase: "over", rematch: { me: null, them: false } });
    }
    if (this.view.phase === "over" && this.overAt !== null && now - this.overAt > REMATCH_S) this.close("timeout");
    this.sendPosition(now, t);
  }

  /** This phone's tab was hidden (it stops drawing, so it cannot play) or shown again. */
  setAway(away: boolean) {
    if (away === this.away) return;
    this.away = away;
    this.room.send(away ? "away" : "back", {});
    if (!away && this.host) this.resume();
  }

  /** Yes or no to a rematch. No leaves the match. */
  wantRematch(yes: boolean) {
    if (this.view.phase !== "over") return;
    this.room.send("rematch", { yes });
    this.set({ rematch: { ...this.view.rematch, me: yes } });
    if (!yes) this.close("declined");
    else this.maybeRematch();
  }

  /** Leaves the match (and the room): mid-match, the other player wins. */
  close(why: LinkView["closed"] = "left") {
    if (this.view.phase === "closed") return;
    this.room.send("bye", {});
    this.stops.forEach((s) => s());
    this.room.leave();
    this.set({ phase: "closed", closed: why });
  }

  // ── Inside ──────────────────────────────────────────────────────────────────

  private set(change: Partial<LinkView>) {
    this.view = { ...this.view, ...change };
    this.listeners.forEach((fn) => fn());
  }

  private hear() {
    this.heard = this.clock();
    if (!this.met) {
      this.met = true;
      this.room.send("hi", {});
    }
    // they lost by leaving, perhaps while they could not hear it: say it again (at most every END_S)
    if (this.match.getView().left === 1 && this.view.phase !== "closed" && this.heard - this.endSent > END_S) {
      this.endSent = this.heard;
      this.room.send("end", { left: 1 });
    }
    // back from a pause: the host starts the point again
    if (this.view.phase === "paused" && !this.theyAway && !this.gone && this.host) this.resume();
  }

  private onPong(sent: number, hostNow: number) {
    const now = this.clock();
    const rtt = now - sent;
    this.pongs++;
    // the quickest answer says the most; an old best counts for a little less each time
    this.bestRtt *= 1.05;
    if (rtt <= this.bestRtt) {
      this.bestRtt = rtt;
      this.offset = hostNow + rtt / 2 - now;
    }
  }

  /** The host: the guest is ready, so set the start (again, for a rematch). */
  private begin() {
    if (this.startAt !== null && this.round > 0 && this.view.phase !== "over") {
      // the guest missed the start: say it again
      this.room.send("start", { round: this.round, at: this.startAt });
      return;
    }
    this.onStart(this.round + 1, this.shared() + COUNTDOWN_S);
    this.room.send("start", { round: this.round, at: this.startAt });
  }

  /** A round starts at `at` on the host's clock. The host serves first in odd rounds, the guest in even ones. */
  private onStart(round: number, at: number) {
    if (round <= this.round) return;
    this.round = round;
    this.startAt = this.playAt = at;
    const hostServes = round % 2 === 1;
    this.match.reset(0, hostServes === this.host ? 0 : 1);
    this.pausedAt = this.overAt = null;
    this.set({ phase: "countdown", round, rematch: { me: null, them: null } });
  }

  /** A match that can still be set right: started, and not ended by a player leaving. */
  private open() {
    const p = this.view.phase;
    return this.startAt !== null && (p === "paused" || p === "playing" || p === "over") && this.match.getView().left === null;
  }

  /**
   * The host: play the point again a moment from now, on both phones, with the host's score and server; or, if
   * the host's match is over, end the guest's with the host's score. Also from "playing": a host whose own tab was
   * hidden never paused (it did not run), but the guest did.
   */
  private resume() {
    // a host whose own tab is hidden cannot play the point: it restarts it when shown again
    if (!this.open() || this.away) return;
    const at = this.shared() + RESUME_S;
    const { score, server } = this.match;
    const over = this.match.phase === "over";
    this.room.send("resume", { at, score, server, over });
    if (!over) this.replayAt(at, score, server);
  }

  /** Plays the point again at `at`, with this score and server (the host's; the guest's come turned round). */
  private replayAt(at: number, score: [number, number], server: Side) {
    if (!this.open()) return;
    this.match.replay(at - this.startAt!, score, server);
    this.playAt = at;
    this.pausedAt = this.overAt = null;
    this.differs = null;
    this.set({ phase: "countdown", rematch: { me: null, them: null } });
  }

  /** The guest: the host's match is over with this score. */
  private finishAs(score: [number, number]) {
    if (!this.open()) return;
    this.differs = null;
    if (this.match.phase !== "over" || this.match.score[0] !== score[0] || this.match.score[1] !== score[1]) this.match.finish(score);
    if (this.view.phase !== "over") {
      this.overAt = this.clock();
      this.set({ phase: "over" });
    }
  }

  /** The other phone's score, server and end, from its positions: a difference that lasts means a lost note. */
  private compare(score: [number, number], server: Side, over: boolean) {
    const m = this.match;
    const same = score[1] === m.score[0] && score[0] === m.score[1] && swap(server) === m.server && over === (m.phase === "over");
    // the host's match is over just as this guest's is (its word on it was lost): over here too
    if (same && over && !this.host && this.open()) this.finishAs([m.score[0], m.score[1]]);
    if (same || !this.open()) {
      this.differs = null;
      return;
    }
    const now = this.clock();
    this.differs ??= now;
    if (now - this.differs > SYNC_S) this.resync();
  }

  /** Sets both phones right: the host plays the point again; a guest asks it to. */
  private resync() {
    const now = this.clock();
    if (now - this.synced < SYNC_GAP) return;
    this.synced = now;
    this.differs = null;
    if (this.host) this.resume();
    else this.room.send("wait", {});
  }

  /** The other phone says this player left (and so lost). */
  private lost(left: Side) {
    if (this.view.phase === "over" || this.view.phase === "closed") return;
    this.match.forfeit(left);
    this.overAt = this.clock();
    this.set({ phase: "over", rematch: { me: false, them: null } });
  }

  private onRematch(yes: boolean) {
    this.set({ rematch: { ...this.view.rematch, them: yes } });
    if (!yes) this.close("declined");
    else this.maybeRematch();
  }

  private maybeRematch() {
    const r = this.view.rematch;
    if (this.host && r.me && r.them) {
      this.onStart(this.round + 1, this.shared() + COUNTDOWN_S);
      this.room.send("start", { round: this.round, at: this.startAt });
    }
  }

  private onBye() {
    if (this.view.phase === "closed") return;
    if (this.view.phase === "over") return this.close("declined");
    // mid-match: they left, so this player wins
    if (this.view.phase === "connecting") return this.close("timeout");
    this.match.forfeit(1);
    this.overAt = this.clock();
    this.set({ phase: "over", rematch: { me: null, them: false } });
  }

  private sendPosition(now: number, t: number) {
    const p = this.match.players[0];
    // a stroke's slide the other phone draws itself, from the swing's note
    if (p.swing?.hit && !p.swing.done && now - this.posSent < ALIVE_S) return;
    const g = this.posLast && guess(this.posLast, t);
    const off = g ? Math.hypot(p.x - g[0], p.z - g[1]) : Infinity;
    if ((off > POS_ERR && now - this.posSent >= POS_S) || now - this.posSent >= ALIVE_S) {
      this.posSent = now;
      this.posLast = { t, x: p.x, z: p.z, vx: p.vx, vz: p.vz };
      const m = this.match;
      this.room.send("pos", { ...this.posLast, sc: m.score, sv: m.server, ov: m.phase === "over" });
    }
  }
}
