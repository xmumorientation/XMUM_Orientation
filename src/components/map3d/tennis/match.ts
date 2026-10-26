import type * as THREE from "three";

import { aim, bounces, flightAt, G, landsIn, meetPoint, netHit, offNet, type Bounce, type Flight } from "./ball";
import { COURT } from "./court";
import { handAt, racketAt, racketAtContact, servePose, STILL, swingPose, TOSS_S, type Hand, type SwingPose } from "./player";
import { rand, STEP_RATE, yawOf, type PlayerFrame, type V3 } from "./rally";

// DRAFT: the tennis game's rules (docs/ROADMAP.md, item 9, batches T1b and T2a): one match on one court, first to
// 5 points. Pure logic in metres in the court's frame (court.ts); no drawing and no network. step(t) moves the
// match on to time t, taking events (hits, bounces, the net) in time order, so a slow phone plays the same match as
// a fast one.
//
// Controls (ROADMAP item 9): drag to move along the baseline, tap to swing. The tap must come between LEAD_MAX and
// LEAD_MIN seconds before the ball reaches the racket; early in that window pulls the ball cross-court, late
// pushes it down the line, and the middle hits deep and fast. The swing then meets the ball on its own (a short
// slide of the feet, and the arm reaches up or down to its height), so the ball always meets the racket as drawn.
//
// Two phones (T2a): each runs its own Match with its own player as side 0 and the other phone's as a "remote"
// side 1. A phone says what its player does (takeNotes(): swings, shots) and the link sends it across; the other
// phone takes it in (receive()). The phone receiving the ball judges hit or miss and calls the point, so a
// player's own swing never waits for the network. Out and net follow from the shot, so both phones call those at
// once; a miss on the other side waits for that phone's call, the ball held at their racket meanwhile.

export type Side = 0 | 1;
export type Phase = "serve" | "rally" | "point" | "over";
/** Who plays a side: the player on this phone, the bot, or the player on the other phone (T2). */
export type Who = "player" | "bot" | "remote";
/** Why a point ended: the ball went out or into the net (the hitter loses), or bounced twice (the receiver loses). */
export type Why = "out" | "net" | "winner" | "miss";
/** Why a swing missed: too early, too late, or the ball was out of reach. */
export type Miss = "early" | "late" | "far";

/** A point's call: why it ended, who won it, and when. */
export type Call = { id: number; t: number; why: Why; miss: Miss | null; winner: Side };

/** What the HUD shows. A new object only when something in it changes. */
export type MatchView = {
  score: [number, number];
  server: Side;
  phase: Phase;
  /** The last point's call (OUT, NET, ...), for the HUD to show for a moment. */
  call: Call | null;
  /** Someone needs one more point. */
  matchPoint: boolean;
  /** Who won, once the match is over. */
  winner: Side | null;
  /** The side that left the match, if that ended it (T2). */
  left: Side | null;
  /** What to tell the player (side 0): how to serve, or how to play until their first good stroke. */
  hint: "serve" | "play" | null;
};

/** What the court shows as it happens: a hit (with how clean it was, 0 to 1), a bounce, the ball into the net. */
export type Fx =
  | { type: "hit"; t: number; p: V3; by: Side; clean: number }
  | { type: "bounce"; t: number; p: V3; out: boolean }
  | { type: "net"; t: number; p: V3 };

/**
 * What one phone tells the other (T2), in its own frame (the link turns it round for the other phone): its
 * player's swing (and where its feet slide, if it meets the ball), a dropped swing, a shot, and a point it called.
 * A point carries the points played before it, and swings and shots their times, so one from an earlier point
 * (or from before a point was played again) is ignored.
 */
export type Note =
  | {
      type: "swing";
      start: number;
      contact: number;
      hand: Hand;
      lift: number;
      serve: boolean;
      to: [number, number] | null;
      toss: { from: V3; to: V3 } | null;
    }
  | { type: "cancel" }
  | { type: "shot"; flight: Flight; clean: number }
  | { type: "point"; n: number; t: number; winner: Side; why: Why; miss: Miss | null };

/** Points to win the match. */
export const POINTS_TO_WIN = 5;
/** A tap meets the ball when it comes between this long (the earliest) and this long (the latest) before it (s). */
export const LEAD_MAX = 0.5;
export const LEAD_MIN = 0.06;
/** Past this share of the window either way, a stroke goes into the net (early) or wide (late). */
const EDGE = 0.9;
/** A swing with no ball to meet reaches its contact this long after the tap. */
const WHIFF_LEAD = 0.42;
/** A stroke's forward swing (the wind-up to the contact) takes this long, unless the tap came later. */
const WIND = 0.3;
/** From the tap to the serve's contact. */
const SERVE_LEAD = 0.9;
/** A new tap can start a swing this long after the last one's contact; the swing's pose ends later. */
const FOLLOW = 0.25;
const SWING_END = 0.75;
/** A stroke shows only once it has lasted this long, so a touch that turns into a drag shows none. */
const SHOW_AFTER = 0.06;
/** A touch turns into a drag before this long: its swing is dropped unless the contact is near. */
const CANCEL_S = 0.25;
/** Pauses: after a point, before a bot serves, and before the ball is hidden after a point. */
const POINT_PAUSE = 1.7;
const BOT_SERVE_WAIT = 1.1;
const BALL_HIDE = 1.1;
/** Against another phone, a player who has not served after this long (from the bot's wait) serves anyway. */
const SERVE_TIMEOUT = 7;
/** Waiting this much longer than it should on the other phone, the match has stalled (stalled()). */
const STALL_S = 2;
/** Running speeds (m/s): across the court, the bot, and up and back (automatic). */
const RUN = 6.5;
const BOT_RUN = 4.8;
const DEPTH_RUN = 7;
/**
 * Reach: a player meets a ball up to LUNGE metres further out than their racket, and steps away from one that comes
 * too close to the body at STEP_IN m/s (plus STEP_BASE), so a ball at the body needs an early tap.
 */
const LUNGE = 0.6;
const STEP_IN = 6;
const STEP_BASE = 0.3;
/** The bot starts to run this long after a shot, and floats its shots this much higher (slower) over the net. */
const BOT_REACT = 0.3;
const BOT_FLOAT = 0.3;
/** The bot aims cross-court, through the middle or down the line, and misses its timing by this much (a share). */
const BOT_AIMS = [-0.6, 0, 0.6];
const BOT_SPREAD = 0.3;
/** Over the net: a serve, and a stroke past EDGE early. */
const SERVE_CLEAR = 0.4;
const NET_CLEAR = -0.35;
/** Where players stand across the court: at most this far from the middle. */
export const AIM_MAX = COURT.halfW + 2.2;
/** Behind the baseline (metres): waiting, serving, and waiting for the serve. */
const HOME_BACK = 1.4;
const SERVE_BACK = 0.35;
const RETURN_BACK = 1;
/**
 * The other phone's player runs on from their last position at their last speed, for at most AHEAD_S (their phone
 * sends a new one as soon as that guess is out: link.ts), and the figure eases onto the guess at EASE a second. A
 * ball that comes from them eases onto its path over BLEND_S.
 */
export const AHEAD_S = 0.5;
const EASE = 10;
const BLEND_S = 0.15;

/** A player's position and speed at time t, as one phone sends it to the other. */
export type Seen = { t: number; x: number; z: number; vx: number; vz: number };

/** Where a player is at time t, guessed from what was last sent: the same guess on both phones. */
export function guess(s: Seen, t: number): [number, number] {
  const ahead = clamp(t - s.t, 0, AHEAD_S);
  return [s.x + s.vx * ahead, s.z + s.vz * ahead];
}

const SIDES = [0, 1] as const;
const other = (side: Side): Side => (side === 0 ? 1 : 0);
/** The x sign of a side's half: player 0 at the -x end. */
const dirOf = (side: Side) => (side === 0 ? -1 : 1);
/** A player's racket side across the court: player 0 faces +x, so their right hand is at +z. */
const racketSide = (side: Side) => (side === 0 ? 1 : -1);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (x: number) => x * x * (3 - 2 * x);
const approach = (v: number, to: number, k: number) => v + (to - v) * Math.min(1, k);
/** A normal deviate from two draws in [0, 1) (Box-Muller). */
const gauss = (u: number, v: number) => Math.sqrt(-2 * Math.log(Math.max(1e-9, 1 - u))) * Math.cos(2 * Math.PI * v);

/** A point of a player's rig (racketAt, handAt: facing +z) on the court, from their body, for this side. */
function onCourt(side: Side, v: THREE.Vector3): V3 {
  const yaw = yawOf(side);
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  return [v.x * c + v.z * s, v.y, -v.x * s + v.z * c];
}

/** The lift (swingPose) that puts the racket at height y at the contact. */
function liftFor(hand: Hand, y: number) {
  let [lo, hi] = [-1.3, 1.8];
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (racketAt({ ...swingPose(0, hand, mid), ...STILL }).y < y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** How a receiver meets a ball at height y with each hand: the arm's lift, and the racket's offset from the body. */
type Reach = { hand: Hand; lift: number; dx: number; dz: number };

function reachFor(side: Side, y: number): Reach[] {
  return ([1, -1] as Hand[]).map((hand) => {
    const lift = liftFor(hand, y);
    const [dx, , dz] = onCourt(side, racketAt({ ...swingPose(0, hand, lift), ...STILL }));
    return { hand, lift, dx, dz };
  });
}

/**
 * Where a stroke goes, from its timing (-1 the earliest tap that meets the ball, 1 the latest): late pushes the
 * ball out to the racket's side (down the line, for a forehand), early pulls it across, and the middle hits deep,
 * fast and through the middle. Past EDGE, the earliest go into the net and the latest go wide. `jitter` in
 * [-0.5, 0.5] moves it a little.
 */
export function strokeTarget(by: Side, hand: Hand, timing: number, jitter: number): { to: [number, number]; clear: number } {
  const line = hand === 1 ? racketSide(by) : -racketSide(by);
  const off = Math.abs(timing);
  const depth = dirOf(other(by)) * (COURT.halfL - (2.6 + 3 * off));
  const clear = 0.45 + 0.9 * off * off;
  if (timing > EDGE) return { to: [depth, line * (COURT.halfW + 0.4 + (timing - EDGE) * 4)], clear };
  const z = clamp(line * timing * 3.9 + jitter * 0.6, -(COURT.halfW - 0.25), COURT.halfW - 0.25);
  return { to: [depth, z], clear: timing < -EDGE ? NET_CLEAR : clear };
}

type Shot = {
  by: Side;
  flight: Flight;
  net: Bounce | null;
  land: (Bounce & { in: boolean }) | null;
  /** The second bounce: the receiver loses the point if they have not hit the ball by then. */
  second: number | null;
  /** Where the receiver should meet it (null when it goes out or into the net), and how with each hand. */
  meet: Bounce | null;
  reach: Reach[];
  landed: boolean;
  /** The receiver swung at it and missed, and why. */
  missed: Miss | null;
};

type Swing = {
  serve: boolean;
  start: number;
  contact: number;
  hand: Hand;
  lift: number;
  /** A stroke that meets the ball: the feet slide from `from` to `to` (x, z) by the contact. Timing as strokeTarget. */
  hit: { from: [number, number]; to: [number, number]; timing: number } | null;
  /** A swing that misses, and why. */
  miss: Miss | null;
  /** The serve's toss, from the hand to the racket. */
  toss: { from: V3; to: V3 } | null;
  done: boolean;
};

type Player = {
  who: Who;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Where they want to stand across the court: the player's drag, the bot's plan. */
  aim: number;
  /** Arrow keys held: -1, 0 or 1. */
  push: number;
  swing: Swing | null;
  /** A bot's return: when it starts to run, to where, and when it taps. */
  plan: { moveAt: number; z: number; tapAt: number } | null;
  /** The other phone's player: what their phone last sent. */
  seen: Seen | null;
};

const newPlayer = (who: Who): Player => ({ who, x: 0, z: 0, vx: 0, vz: 0, aim: 0, push: 0, swing: null, plan: null, seen: null });

const READY = swingPose(-1, 1);

/** A stroke's time from its contact as its pose plays it: an early tap winds up slowly, a late one swings at once. */
function strokeRel(s: Swing, t: number) {
  const lead = s.contact - s.start;
  if (t >= s.contact) return t - s.contact;
  if (lead < WIND) return -WIND + ((t - s.start) / lead) * WIND;
  if (t >= s.contact - WIND) return t - s.contact;
  return -0.75 + ((t - s.start) / (lead - WIND)) * (0.75 - WIND);
}

/** The serve's toss at share u of it: up from the hand and down onto the racket. */
function tossAt(toss: { from: V3; to: V3 }, u: number): V3 {
  const [a, b] = [toss.from, toss.to];
  const tau = u * TOSS_S;
  const vy = (b[1] - a[1] + (G * TOSS_S * TOSS_S) / 2) / TOSS_S;
  return [a[0] + (b[0] - a[0]) * u, a[1] + vy * tau - (G * tau * tau) / 2, a[2] + (b[2] - a[2]) * u];
}

export class Match {
  phase: Phase = "serve";
  score: [number, number] = [0, 0];
  server: Side = 0;
  readonly players: [Player, Player];
  private shot: Shot | null = null;
  /** The ball's path since the last hit (after a point too, until it is hidden). */
  private flight: Flight | null = null;
  /** A ball from the other phone eases from where it was drawn onto its path (T2). */
  private blend: { at: number; from: V3 } | null = null;
  private shots = 0;
  private matches = 0;
  private t = 0;
  private serveAt = 0;
  /** When the point being played began (T2: the other phone's notes from before it are ignored). */
  private pointAt = 0;
  private nextAt = 0;
  private endedAt = 0;
  private call: Call | null = null;
  private calls = 0;
  private won: Side | null = null;
  private learned = false;
  private fx: Fx[] = [];
  private notes: Note[] = [];
  private view!: MatchView;
  private listeners = new Set<() => void>();
  /** The usual contact height: the receiver meets the ball as it comes down through it. */
  private readonly height = racketAtContact(1).y;

  /** `who`: who plays each side (side 0 is this phone's, nearest the camera). `first`: who serves first. */
  constructor(
    private readonly seed: number,
    who: [Who, Who],
    first?: Side,
  ) {
    this.players = [newPlayer(who[0]), newPlayer(who[1])];
    this.reset(0, first);
  }

  /** A new match from time t. The first serve changes hands each match, unless `first` says who serves. */
  reset(t: number, first?: Side) {
    this.t = t;
    this.score = [0, 0];
    this.server = first ?? ((this.matches % 2) as Side);
    this.matches++;
    this.call = null;
    this.won = null;
    this.blend = null;
    for (const side of SIDES) {
      Object.assign(this.players[side], { x: dirOf(side) * (COURT.halfL + HOME_BACK), z: 0, vx: 0, vz: 0, aim: 0, push: 0, swing: null, plan: null, seen: null });
    }
    this.startPoint(t);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getView = () => this.view;

  /** The court's events since the last call (hits, bounces, the net), for the effects. */
  drain(): Fx[] {
    const out = this.fx;
    this.fx = [];
    return out;
  }

  /** What to tell the other phone since the last call (T2). */
  takeNotes(): Note[] {
    const out = this.notes;
    this.notes = [];
    return out;
  }

  /** Moves where `side` wants to stand across the court by dz metres (a drag). */
  moveAim(side: Side, dz: number) {
    const p = this.players[side];
    p.aim = clamp(p.aim + dz, -AIM_MAX, AIM_MAX);
  }

  /** Arrow keys: -1, 0 or 1. */
  setPush(side: Side, dir: number) {
    this.players[side].push = dir;
  }

  /** A tap from `side` at time t: serves, or swings at the ball coming to them. */
  tap(side: Side, t: number) {
    const p = this.players[side];
    if (p.who === "remote" || this.phase === "over") return;
    if (p.swing && !(p.swing.done && t >= p.swing.contact + FOLLOW)) return;
    if (this.phase === "serve") {
      if (side !== this.server) return;
      const at = (v: THREE.Vector3): V3 => {
        const [dx, y, dz] = onCourt(side, v);
        return [p.x + dx, y, p.z + dz];
      };
      p.swing = {
        serve: true,
        start: t,
        contact: t + SERVE_LEAD,
        hand: 1,
        lift: 0,
        hit: null,
        miss: null,
        toss: { from: at(handAt({ ...servePose(-TOSS_S), ...STILL })), to: at(racketAt({ ...servePose(0), ...STILL })) },
        done: false,
      };
      p.vx = p.vz = 0;
      p.aim = p.z;
      this.tell(p.swing);
      this.emit();
      return;
    }
    const shot = this.shot;
    if (this.phase !== "rally" || !shot || shot.by === side) return;
    const meet = shot.meet;
    const whiff = (miss: Miss | null, contact: number) => {
      const hand: Hand = meet && (meet.p[2] - p.z) * racketSide(side) < 0 ? -1 : 1;
      p.swing = { serve: false, start: t, contact, hand, lift: 0, hit: null, miss, toss: null, done: false };
      if (miss) shot.missed = miss;
      this.tell(p.swing);
    };
    if (!meet) return whiff(null, t + WHIFF_LEAD);
    const lead = meet.t - t;
    if (lead > LEAD_MAX) return whiff("early", t + WHIFF_LEAD);
    if (lead < LEAD_MIN) return whiff("late", t + LEAD_MIN);
    const best = this.reachFrom(side, shot, lead);
    if (!best) return whiff("far", meet.t);
    const timing = 1 - (2 * (lead - LEAD_MIN)) / (LEAD_MAX - LEAD_MIN);
    p.swing = {
      serve: false,
      start: t,
      contact: meet.t,
      hand: best.reach.hand,
      lift: best.reach.lift,
      hit: { from: [p.x, p.z], to: best.to, timing },
      miss: null,
      toss: null,
      done: false,
    };
    shot.missed = null;
    this.tell(p.swing);
  }

  /** The tap turned into a drag: its swing is dropped, unless its stroke has begun. */
  cancel(side: Side, t: number) {
    const p = this.players[side];
    const s = p.swing;
    if (!s || s.done || p.who === "remote") return;
    const before = s.serve ? s.contact - TOSS_S : Math.min(s.start + CANCEL_S, s.contact - 0.08);
    if (t >= before) return;
    p.swing = null;
    p.aim = p.z;
    if (this.shot && s.miss && this.shot.missed === s.miss) this.shot.missed = null;
    if (this.online()) this.notes.push({ type: "cancel" });
    if (s.serve) this.emit();
  }

  /** Moves the match on to time t. */
  step(t: number) {
    const dt = Math.min(0.1, Math.max(0, t - this.t));
    this.t = t;
    this.move(dt, t);
    for (let guard = 0; guard < 12; guard++) {
      const e = this.nextEvent();
      if (!e || e.at > t) break;
      e.run();
    }
    for (const p of this.players) if (p.swing?.done && t >= p.swing.contact + SWING_END) p.swing = null;
  }

  /** A note from the other phone (T2), already turned into this phone's frame: their player is the remote side. */
  receive(note: Note) {
    const side = this.players[1].who === "remote" ? 1 : this.players[0].who === "remote" ? 0 : null;
    if (side === null || this.phase === "over") return;
    const p = this.players[side];
    if (note.type === "swing") {
      if (note.start < this.pointAt) return;
      p.swing = {
        serve: note.serve,
        start: note.start,
        contact: note.contact,
        hand: note.hand,
        lift: note.lift,
        hit: note.to ? { from: [p.x, p.z], to: note.to, timing: 0 } : null,
        miss: null,
        toss: note.toss,
        done: false,
      };
    } else if (note.type === "cancel") {
      if (p.swing && !p.swing.done) p.swing = null;
    } else if (note.type === "shot") {
      if (note.flight.t0 < this.pointAt || this.phase === "point") return;
      const was = this.ballAt(this.t);
      if (this.phase === "serve") this.phase = "rally";
      this.launch(side, note.flight, note.clean);
      if (was) this.blend = { at: this.t, from: was };
    } else if (note.n === this.score[0] + this.score[1] && this.phase === "rally") {
      // their miss: a ball held at their racket goes on past it
      const s = this.shot;
      if (s?.meet && this.flight === s.flight && this.t > s.meet.t) this.flight = { ...s.flight, t0: s.flight.t0 + (this.t - s.meet.t) };
      this.endPoint(note.t, note.winner, note.why, note.miss, false);
    }
  }

  /** The other phone's player at time t (T2): where they stand, for their figure to follow. */
  receivePosition(s: Seen) {
    const p = this.players.find((q) => q.who === "remote");
    if (p && (!p.seen || s.t >= p.seen.t)) p.seen = s;
  }

  /**
   * Plays a point again from time t (after a pause, T2). `score` and `server`: the host's, which the guest takes,
   * since a point called while the phones could not hear each other may have reached only one of them.
   */
  replay(t: number, score: [number, number] = this.score, server: Side = this.server) {
    this.t = t;
    this.score = [score[0], score[1]];
    this.server = server;
    for (const p of this.players) {
      p.swing = null;
      p.plan = null;
    }
    this.startPoint(t);
  }

  /** Ends the match with this score: the host's, when this phone missed the last point (T2). */
  finish(score: [number, number]) {
    this.score = [score[0], score[1]];
    this.phase = "over";
    this.flight = null;
    this.emit();
  }

  /**
   * The match has waited on the other phone too long: a ball held at their racket, or their serve, that never
   * came (a note lost on the way). A reason to play the point again (T2).
   */
  stalled(t: number): boolean {
    const s = this.shot;
    // their phone calls a miss at the second bounce, so the wait runs from then
    if (this.phase === "rally" && s?.meet && this.flight === s.flight && this.players[other(s.by)].who === "remote") {
      return t - (s.second ?? s.meet.t) > STALL_S;
    }
    const srv = this.players[this.server];
    if (this.phase !== "serve" || srv.who !== "remote") return false;
    return srv.swing?.serve ? t - srv.swing.contact > STALL_S : t - this.serveAt > SERVE_TIMEOUT + STALL_S;
  }

  /** Ends the match at once: the other side left it (T2). */
  forfeit(left: Side) {
    this.phase = "over";
    this.won = other(left);
    this.flight = null;
    this.emit();
  }

  /** A player's body and pose at time t, for drawing. */
  frame(side: Side, t: number): PlayerFrame {
    const p = this.players[side];
    const yaw = yawOf(side);
    // the run in the player's own frame (as rally.ts)
    const fwd = p.vx * Math.sin(yaw) + p.vz * Math.cos(yaw);
    const right = -p.vx * Math.cos(yaw) + p.vz * Math.sin(yaw);
    const step = Math.sin(t * STEP_RATE);
    const speed = Math.min(1, Math.hypot(p.vx, p.vz) / 3);
    return {
      x: p.x,
      z: p.z,
      yaw,
      pose: {
        ...this.upper(p.swing, t),
        strideX: step * 0.55 * Math.min(1, Math.abs(fwd) / 3),
        strideZ: step * 0.4 * Math.min(1, Math.abs(right) / 3),
        bob: Math.abs(step) * 0.05 * speed,
      },
    };
  }

  /** For the racket's blur: the swing's time from its contact (from its pose's start), or null with no swing. */
  swingTime(side: Side, t: number): { rel: number; since: number } | null {
    const s = this.players[side].swing;
    if (!s) return null;
    if (s.serve) return { rel: t - s.contact, since: s.start };
    if (t < s.start + SHOW_AFTER) return null;
    return { rel: strokeRel(s, t), since: s.start + SHOW_AFTER };
  }

  /** The ball at time t (metres on the court), or null when it is not shown. */
  ballAt(t: number): V3 | null {
    if (this.phase === "over") return null;
    if (this.phase === "serve") {
      const p = this.players[this.server];
      const s = p.swing;
      if (s?.serve && s.toss && t >= s.contact - TOSS_S) return tossAt(s.toss, (t - (s.contact - TOSS_S)) / TOSS_S);
      const [dx, y, dz] = onCourt(this.server, handAt(this.frame(this.server, t).pose));
      return [p.x + dx, y, p.z + dz];
    }
    if (!this.flight || (this.phase === "point" && t > this.endedAt + BALL_HIDE)) return null;
    // the other phone has not said yet whether its player hit it: hold it at their racket
    const s = this.shot;
    if (this.phase === "rally" && s?.meet && this.flight === s.flight && this.players[other(s.by)].who === "remote" && t > s.meet.t) {
      return [...s.meet.p];
    }
    const p = flightAt(this.flight, t);
    const b = this.blend;
    if (b && t < b.at + BLEND_S) {
      const k = 1 - (t - b.at) / BLEND_S;
      const q = flightAt(this.flight, b.at);
      return [p[0] + (b.from[0] - q[0]) * k, p[1] + (b.from[1] - q[1]) * k, p[2] + (b.from[2] - q[2]) * k];
    }
    return p;
  }

  /** The ball coming to `side`: when and where they should meet it, or null. */
  incoming(side: Side): Bounce | null {
    const s = this.shot;
    return this.phase === "rally" && s?.meet && s.by !== side ? s.meet : null;
  }

  /** Who hit the ball last and when it left the racket (the trail starts there), or null before the serve. */
  lastHit(): { by: Side; t: number } | null {
    return this.shot && this.flight ? { by: this.shot.by, t: this.shot.flight.t0 } : null;
  }

  /**
   * Where `side` should meet the ball coming to them: whether they can from where they stand, and whether a tap
   * now would meet it. Null when no ball is coming or their swing is already on its way.
   */
  marker(side: Side, t: number): { x: number; z: number; ok: boolean; now: boolean } | null {
    const s = this.shot;
    if (this.phase !== "rally" || !s?.meet || s.by === side || this.players[side].swing?.hit) return null;
    const lead = s.meet.t - t;
    if (lead < 0) return null;
    const ok = this.reachFrom(side, s, Math.min(lead, LEAD_MAX)) !== null;
    return { x: s.meet.p[0], z: s.meet.p[2], ok, now: lead <= LEAD_MAX && lead >= LEAD_MIN };
  }

  /** Whether anything moves or is about to. The map draws on demand: ask for frames while this holds. */
  busy(): boolean {
    if (this.phase === "rally" || this.phase === "point" || this.online()) return true;
    if (this.phase === "serve" && this.players[this.server].who === "bot") return true;
    return this.players.some(
      (p) => p.swing !== null || p.push !== 0 || Math.abs(p.vx) > 0.02 || Math.abs(p.vz) > 0.02 || Math.abs(p.aim - p.z) > 0.01,
    );
  }

  // ── Inside ──────────────────────────────────────────────────────────────────

  /** The other phone's player is on this court (T2). */
  private online() {
    return this.players[0].who === "remote" || this.players[1].who === "remote";
  }

  /** Tells the other phone about a swing of this phone's player (or bot). */
  private tell(s: Swing) {
    if (!this.online()) return;
    const { start, contact, hand, lift, serve, toss } = s;
    this.notes.push({ type: "swing", start, contact, hand, lift, serve, to: s.hit ? s.hit.to : null, toss });
  }

  private startPoint(t: number) {
    this.phase = "serve";
    this.shot = null;
    this.flight = null;
    this.blend = null;
    this.pointAt = t;
    this.serveAt = t + BOT_SERVE_WAIT;
    const srv = this.players[this.server];
    // a bot serves from a spot of its own, off the middle
    if (srv.who === "bot") srv.aim = (rand(this.seed, this.shots, 7) * 2 - 1) * 1.6;
    for (const p of this.players) p.plan = null;
    this.emit();
  }

  private upper(s: Swing | null, t: number): SwingPose {
    if (!s) return READY;
    if (s.serve) return servePose(t - s.contact);
    if (t < s.start + SHOW_AFTER) return READY;
    return swingPose(strokeRel(s, t), s.hand, s.lift);
  }

  /** The hand and spot to meet the shot from where `side` stands, if they can (LUNGE, STEP_IN). */
  private reachFrom(side: Side, shot: Shot, lead: number) {
    const p = this.players[side];
    const meet = shot.meet!;
    let best: { reach: Reach; to: [number, number]; cost: number } | null = null;
    for (const r of shot.reach) {
      const to: [number, number] = [meet.p[0] - r.dx, meet.p[2] - r.dz];
      const dz = to[1] - p.z;
      // out toward the ball is a lunge; away from a ball too close to the body is a step, which takes time
      const limit = Math.sign(dz) === Math.sign(r.dz) ? LUNGE : STEP_BASE + STEP_IN * lead;
      if (Math.abs(dz) <= limit && (!best || Math.abs(dz) < best.cost)) best = { reach: r, to, cost: Math.abs(dz) };
    }
    return best;
  }

  /** Where `side` stands up and back: behind the baseline, or on their way to meet the ball. */
  private depthFor(side: Side) {
    const dir = dirOf(side);
    if (this.phase === "serve") return dir * (COURT.halfL + (side === this.server ? SERVE_BACK : RETURN_BACK));
    const s = this.shot;
    if (this.phase === "rally" && s?.meet && s.by !== side && s.reach.length) return s.meet.p[0] - s.reach[0].dx;
    return dir * (COURT.halfL + HOME_BACK);
  }

  private move(dt: number, t: number) {
    if (dt <= 0) return;
    for (const side of SIDES) {
      const p = this.players[side];
      const s = p.swing;
      if (s?.hit && !s.done) {
        // the stroke's footwork: a slide to where the racket meets the ball, by the contact
        const u = smooth(clamp((t - s.start) / Math.max(0.01, s.contact - s.start), 0, 1));
        const x = s.hit.from[0] + (s.hit.to[0] - s.hit.from[0]) * u;
        const z = s.hit.from[1] + (s.hit.to[1] - s.hit.from[1]) * u;
        p.vx = (x - p.x) / dt;
        p.vz = (z - p.z) / dt;
        p.x = x;
        p.z = z;
        continue;
      }
      if (s?.serve && !s.done) {
        p.vx = p.vz = 0;
        continue;
      }
      if (p.who === "remote") {
        this.follow(p, t, dt);
        continue;
      }
      if (p.who === "bot" && p.plan && t >= p.plan.moveAt) p.aim = p.plan.z;
      if (p.push) p.aim = clamp(p.aim + p.push * RUN * dt, -AIM_MAX, AIM_MAX);
      const top = p.who === "bot" ? BOT_RUN : RUN;
      p.vz = approach(p.vz, clamp((p.aim - p.z) * 8, -top, top), dt * 18);
      p.z += p.vz * dt;
      p.vx = approach(p.vx, clamp((this.depthFor(side) - p.x) * 5, -DEPTH_RUN, DEPTH_RUN), dt * 18);
      p.x += p.vx * dt;
    }
  }

  /** The other phone's player: eased onto the guess from what their phone last sent. */
  private follow(p: Player, t: number, dt: number) {
    if (!p.seen) return;
    const [x, z] = guess(p.seen, t);
    const k = Math.min(1, dt * EASE);
    const [nx, nz] = [p.x + (x - p.x) * k, p.z + (z - p.z) * k];
    p.vx = approach(p.vx, (nx - p.x) / dt, dt * 12);
    p.vz = approach(p.vz, (nz - p.z) / dt, dt * 12);
    p.x = nx;
    p.z = nz;
  }

  /** The earliest thing due: a serve or a bot's tap, a swing's contact, the ball's net or bounce, the next point. */
  private nextEvent(): { at: number; run: () => void } | null {
    let next: { at: number; run: () => void } | null = null;
    const add = (at: number, run: () => void) => {
      if (!next || at < next.at) next = { at, run };
    };
    const srv = this.players[this.server];
    if (this.phase === "serve" && !srv.swing) {
      if (srv.who === "bot") add(this.serveAt, () => this.tap(this.server, this.serveAt));
      // against another phone, a player who does not serve serves anyway
      else if (srv.who === "player" && this.online()) {
        const at = this.serveAt + SERVE_TIMEOUT;
        add(at, () => this.tap(this.server, at));
      }
    }
    if (this.phase === "point") add(this.nextAt, () => this.nextPoint(this.nextAt));
    for (const side of SIDES) {
      const p = this.players[side];
      const plan = p.plan;
      if (p.who === "bot" && plan && this.phase === "rally") {
        add(plan.tapAt, () => {
          p.plan = null;
          p.aim = plan.z;
          this.tap(side, plan.tapAt);
        });
      }
      const s = p.swing;
      if (s && !s.done) add(s.contact, () => this.contact(side, s));
    }
    const shot = this.shot;
    if (shot && this.phase === "rally") {
      const { net, land, second } = shot;
      if (net) add(net.t, () => this.intoNet(shot, net));
      else if (land && !shot.landed) add(land.t, () => this.landed(shot, land));
      // a ball the other phone's player should meet: that phone calls the point
      else if (second !== null && this.players[other(shot.by)].who !== "remote") add(second, () => this.twice(shot, second));
    }
    return next;
  }

  private contact(side: Side, s: Swing) {
    s.done = true;
    const p = this.players[side];
    // the other phone's player: their shot comes as a note
    if (p.who === "remote") return;
    if (s.serve && s.toss) {
      const k = this.shots;
      // into the service box across the centre line from the server
      const across = -Math.sign(p.z || racketSide(side)) * (1.3 + 1.4 * rand(this.seed, k, 3));
      const deep = 3.6 + 2.2 * rand(this.seed, k, 4);
      this.phase = "rally";
      this.fire(side, s.contact, s.toss.to, [dirOf(other(side)) * deep, across], SERVE_CLEAR + (p.who === "bot" ? BOT_FLOAT : 0), 0.7);
      return;
    }
    const shot = this.shot;
    if (!s.hit || !shot?.meet || shot.by === side || this.phase !== "rally") return;
    const { to, clear } = strokeTarget(side, s.hand, s.hit.timing, rand(this.seed, this.shots, 5) - 0.5);
    // the player stays where the stroke took them; the bot heads back toward the middle
    p.aim = p.who === "bot" ? s.hit.to[1] * 0.3 : s.hit.to[1];
    if (p.who === "player") this.learned = true;
    this.fire(side, s.contact, shot.meet.p, to, clear < 0 ? clear : clear + (p.who === "bot" ? BOT_FLOAT : 0), 1 - Math.abs(s.hit.timing));
  }

  /** The ball leaves `by`'s racket at time t, aimed at a bounce at `to`. */
  private fire(by: Side, t: number, from: V3, to: [number, number], clear: number, clean: number) {
    this.launch(by, aim(t, from, to, clear), clean);
  }

  /** The ball leaves `by`'s racket on this flight: works out its whole path and what it will do. */
  private launch(by: Side, flight: Flight, clean: number) {
    const r = other(by);
    const net = netHit(flight);
    let land: Shot["land"] = null;
    let second: number | null = null;
    let meet: Bounce | null = null;
    let reach: Reach[] = [];
    if (!net) {
      const [b1, b2] = bounces(flight, 2);
      land = { ...b1, in: landsIn(b1.p, dirOf(r)) };
      second = b2 ? b2.t : null;
      if (land.in) {
        meet = meetPoint(flight, this.height);
        reach = reachFor(r, meet.p[1]);
      }
    }
    this.shot = { by, flight, net, land, second, meet, reach, landed: false, missed: null };
    this.flight = flight;
    this.blend = null;
    if (this.players[by].who !== "remote" && this.online()) this.notes.push({ type: "shot", flight, clean });
    this.shots++;
    this.fx.push({ type: "hit", t: flight.t0, p: flight.p, by, clean });
    if (this.players[r].who === "bot" && meet) this.planReturn(r, flight.t0);
    this.emit();
  }

  /** A bot's answer to the shot just hit: where to run, and when to tap (its timing misses by a random share). */
  private planReturn(side: Side, t: number) {
    const shot = this.shot!;
    const meet = shot.meet!;
    const p = this.players[side];
    const k = this.shots;
    // the hand that needs the shorter run, a forehand unless the backhand is clearly shorter
    const run = (r: Reach) => Math.abs(meet.p[2] - r.dz - p.z) + (r.hand === -1 ? 0.4 : 0);
    const r = shot.reach.reduce((a, b) => (run(b) < run(a) ? b : a));
    // a bot that leads gets sloppier, so a match stays close
    const ahead = Math.max(0, this.score[side] - this.score[other(side)]);
    const aimAt = BOT_AIMS[Math.floor(rand(this.seed, k, 10) * BOT_AIMS.length)];
    const timing = aimAt + (BOT_SPREAD + 0.07 * ahead) * gauss(rand(this.seed, k, 11), rand(this.seed, k, 12));
    const lead = LEAD_MIN + ((1 - timing) / 2) * (LEAD_MAX - LEAD_MIN);
    p.plan = { moveAt: t + BOT_REACT, z: clamp(meet.p[2] - r.dz, -AIM_MAX, AIM_MAX), tapAt: meet.t - lead };
  }

  /** This phone calls the shot's point if its own player was to receive it; the other phone calls the rest. */
  private callsHere(shot: Shot) {
    return this.players[other(shot.by)].who !== "remote";
  }

  private intoNet(shot: Shot, net: Bounce) {
    this.flight = offNet(shot.flight, net);
    this.fx.push({ type: "net", t: net.t, p: net.p });
    this.endPoint(net.t, other(shot.by), "net", null, this.callsHere(shot));
  }

  private landed(shot: Shot, land: Bounce & { in: boolean }) {
    shot.landed = true;
    this.fx.push({ type: "bounce", t: land.t, p: land.p, out: !land.in });
    if (!land.in) this.endPoint(land.t, other(shot.by), "out", null, this.callsHere(shot));
  }

  /** The ball bounced twice on the receiver's side (or came down against the back fence). */
  private twice(shot: Shot, at: number) {
    this.fx.push({ type: "bounce", t: at, p: flightAt(shot.flight, at), out: false });
    this.endPoint(at, shot.by, shot.missed ? "miss" : "winner", shot.missed, this.callsHere(shot));
  }

  /** The point is over. `tell`: this phone called it, so the other phone hears (T2). */
  private endPoint(t: number, winner: Side, why: Why, miss: Miss | null, tell: boolean) {
    if (tell && this.online()) this.notes.push({ type: "point", n: this.score[0] + this.score[1], t, winner, why, miss });
    this.score = winner === 0 ? [this.score[0] + 1, this.score[1]] : [this.score[0], this.score[1] + 1];
    this.phase = "point";
    this.endedAt = t;
    this.nextAt = t + POINT_PAUSE;
    this.call = { id: ++this.calls, t, why, miss, winner };
    for (const p of this.players) p.plan = null;
    this.emit();
  }

  private nextPoint(t: number) {
    if (Math.max(...this.score) >= POINTS_TO_WIN) {
      this.phase = "over";
      this.flight = null;
      this.emit();
      return;
    }
    this.server = other(this.server);
    this.startPoint(t);
  }

  private emit() {
    const human = this.players[0];
    let hint: MatchView["hint"] = null;
    if (human.who === "player" && this.phase === "serve" && this.server === 0 && !human.swing?.serve) hint = "serve";
    else if (human.who === "player" && this.phase === "rally" && !this.learned) hint = "play";
    this.view = {
      score: this.score,
      server: this.server,
      phase: this.phase,
      call: this.call,
      matchPoint: this.phase !== "over" && Math.max(...this.score) === POINTS_TO_WIN - 1,
      winner: this.phase === "over" ? (this.won ?? (this.score[0] > this.score[1] ? 0 : 1)) : null,
      left: this.won === null ? null : other(this.won),
      hint,
    };
    this.listeners.forEach((fn) => fn());
  }
}
