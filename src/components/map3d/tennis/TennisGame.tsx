"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent } from "react";
import * as THREE from "three";

import { groupColor, themeFromColor } from "@/components/freshie/groupTheme";

import { BALL_R } from "./ball";
import { hostOnBoard } from "./board";
import { courtFrame, courtView, TENNIS_COURTS } from "./court";
import { dotTexture, Flash, Marker, Pulse, Smear, Trail } from "./effects";
import { Match, type Call, type Miss, type Why } from "./match";
import { tabTransport, type Transport } from "./net";
import { Online, type OnlineView } from "./online";
import { makePlayer, playerMaterial, posePlayer } from "./player";
import { CourtSurface } from "./surface";

import "./tennis.css";

// DRAFT: the tennis game (docs/ROADMAP.md, item 9): against a bot on /map3d?tennis=bot (batch T1b), or against
// another tab of this browser on /map3d?tennis=online (batch T2a: open it in two tabs). One Game feeds two parts:
// TennisCourt draws the match in the 3D scene, and TennisHud lays the broadcast's score, the calls, the queue and
// the touch controls over it. CampusMap3D loads this file only when the page asks for the game.

export type TennisOptions = {
  mode: "bot" | "online";
  /** The player's shirt: a group colour (the default blue when missing or invalid). */
  color: string;
  /** The player's name online (a random "Player 123" when empty). */
  name: string;
  /** A bot plays this side: two bots against each other (online, it queues and rematches by itself). */
  auto: boolean;
  /** Holds the bot's match at this many seconds in; with `auto`, the same moment every time. */
  at: number | null;
  /** Online: between tabs of this browser (BroadcastChannel), or over Supabase Realtime (T2b). */
  net: "tabs" | "realtime";
};

/** The game's own clock. It runs with the frames, at most 50 ms a frame, so a hidden tab or a stall pauses it. */
class Clock {
  t = 0;
  private wall = 0;

  tick(now: number) {
    if (this.wall) this.t += Math.min(0.05, Math.max(0, now - this.wall) / 1000);
    this.wall = now;
    return this.t;
  }

  /** The game time of an input event (its timeStamp, in ms). */
  at(stamp: number) {
    return this.t + Math.min(0.05, Math.max(0, stamp - this.wall) / 1000);
  }
}

/** A match to draw and play: the one against the bot, or this phone's online match. */
export type Session = {
  id: string;
  match: Match;
  court: number;
  names: [string, string];
  colors: [string, string];
  /** The match's time now (s), and of an input event (its timeStamp, in ms). */
  time(): number;
  timeAt(stamp: number): number;
  /** Moves the match on to time t; online, it trades messages with the other phone as well. */
  advance(t: number): void;
  /** The player may serve and swing now. */
  live(): boolean;
  /** Something moves or is about to: keep drawing. */
  busy(): boolean;
};

export type Game = {
  mode: "bot" | "online";
  auto: boolean;
  at: number | null;
  profile: { name: string; color: string };
  /** The match against the bot, or this phone's place online. */
  solo: Session | null;
  online: Online | null;
  /** Asks the map for a frame: it draws on demand. TennisCourt sets it. */
  wake: () => void;
};

/** With no match yet, the camera rests on the middle court, where the page's broadcast view starts. */
export const GAME_COURT = 1;

/** The other player's shirt: their colour, unless it is close to this player's (two tabs, both default blue). */
function theirColor(mine: string, theirs: string) {
  const [a, b] = [parseInt(mine.slice(1), 16), parseInt(theirs.slice(1), 16)];
  const d = [16, 8, 0].reduce((sum, s) => sum + Math.abs(((a >> s) & 255) - ((b >> s) & 255)), 0);
  return d < 90 ? themeFromColor(mine).partner.toLowerCase() : theirs;
}

/** The network: between tabs of this browser, or Supabase Realtime (only then is supabase-js downloaded). */
export async function openTransport(net: TennisOptions["net"]): Promise<Transport> {
  if (net === "tabs") return tabTransport();
  const [{ realtimeTransport }, { supabaseBrowser }] = await Promise.all([import("./realtime"), import("@/lib/supabase/client")]);
  return realtimeTransport(supabaseBrowser());
}

export async function createGame(o: TennisOptions): Promise<Game> {
  const color = groupColor(o.color);
  const name = o.name.trim().slice(0, 16) || `Player ${Math.floor(100 + Math.random() * 900)}`;
  const game: Game = { mode: o.mode, auto: o.auto, at: o.at, profile: { name, color }, solo: null, online: null, wake: () => {} };
  if (o.mode === "online") {
    const transport = await openTransport(o.net);
    const online = (game.online = new Online(transport, game.profile, o.auto ? "bot" : "player"));
    // the host puts its match on the courts' board (T3a), so the map shows it to everyone
    hostOnBoard(online, transport, (theirs) => [color, theirColor(color, groupColor(theirs))]);
    return game;
  }
  // a fixed seed with two bots, so a held moment is the same every time
  const match = new Match(o.auto ? 17 : Math.floor(Math.random() * 1e9), [o.auto ? "bot" : "player", "bot"]);
  const clock = new Clock();
  game.solo = {
    id: "solo",
    match,
    court: GAME_COURT,
    names: o.auto ? ["Bot A", "Bot B"] : ["You", "Bot"],
    colors: [color, themeFromColor(color).partner.toLowerCase()],
    time: () => o.at ?? clock.tick(performance.now()),
    timeAt: (stamp) => clock.at(stamp),
    advance: (t) => match.step(t),
    live: () => match.phase !== "over",
    busy: () => match.busy(),
  };
  return game;
}

const sessions = new WeakMap<Online, Session>();

/** This phone's online match as a Session, the same object for as long as the match lasts. */
function onlineSession(game: Game, online: Online, view: OnlineView): Session | null {
  const m = view.match;
  const link = online.link;
  if (!m || !link || link.key !== m.key) return null;
  const had = sessions.get(online);
  if (had?.id === m.key) return had;
  const session: Session = {
    id: m.key,
    match: link.match,
    court: m.court,
    names: ["You", m.opponent.name],
    colors: [game.profile.color, theirColor(game.profile.color, groupColor(m.opponent.color))],
    time: () => link.matchTime(),
    timeAt: (stamp) => link.matchTimeAt(stamp),
    advance: () => online.tick(),
    live: () => link.getView().phase === "playing",
    busy: () => {
      const phase = link.getView().phase;
      return phase !== "over" && phase !== "closed";
    },
  };
  sessions.set(online, session);
  return session;
}

const noSubscribe = () => () => {};
const noView = () => null;

function useSession(game: Game): Session | null {
  const online = game.online;
  const view = useSyncExternalStore(online?.subscribe ?? noSubscribe, online?.getView ?? noView, online?.getView ?? noView);
  return game.solo ?? (online && view ? onlineSession(game, online, view) : null);
}

const SIDES = [0, 1] as const;
/** Shadows lie just over the court (metres), as in the demo. */
const SHADOW_Y = 0.15;
/**
 * The camera follows the ball across the court by this share, and the player by this, at most FOLLOW_MAX metres on
 * a wide screen. An upright phone's view holds the court with little to spare, so it follows a third as much.
 */
const FOLLOW_BALL = 0.2;
const FOLLOW_PLAYER = 0.12;
const FOLLOW_MAX = 1.4;
const FOLLOW_TALL = 0.35;
/** A hit cleaner than SHAKE_CLEAN shakes the camera up to SHAKE_M metres, for SHAKE_S seconds. */
const SHAKE_CLEAN = 0.85;
const SHAKE_M = 0.06;
const SHAKE_S = 0.18;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color("#ffffff");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A court's broadcast view for the screen's shape, with its lens (the map's own is 30°) while mounted, if `lens`. */
function useBroadcast(court: number, lens = true) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const cell = TENNIS_COURTS[court];
  const aspect = size.width / Math.max(1, size.height);
  const view = useMemo(() => courtView(cell, aspect), [cell, aspect]);
  useEffect(() => {
    if (!lens || !(camera instanceof THREE.PerspectiveCamera)) return;
    const was = camera.fov;
    camera.fov = view.fov;
    camera.updateProjectionMatrix();
    invalidate();
    return () => {
      camera.fov = was;
      camera.updateProjectionMatrix();
    };
  }, [lens, camera, view.fov, invalidate]);
  return { cell, view, aspect };
}

/** The match on its court, in the map's scene (or, online before a match, the camera resting on the middle court). */
export function TennisCourt({ game }: { game: Game }) {
  const session = useSession(game);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    game.wake = invalidate;
    invalidate();
    // online, a change (a match found, the other player's answer) may need frames again
    const stop = game.online?.subscribe(invalidate);
    return () => {
      game.wake = () => {};
      stop?.();
    };
  }, [game, invalidate]);
  return (
    <>
      <CourtSurface />
      {session ? <Play key={session.id} session={session} held={game.solo ? game.at : null} auto={game.auto} /> : <Rest />}
    </>
  );
}

/** No match: the camera rests on the middle court's broadcast view. */
function Rest() {
  const { view } = useBroadcast(GAME_COURT);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    camera.position.set(...view.position);
    controls?.target.set(...view.target);
    camera.lookAt(...view.target);
    invalidate();
  }, [camera, controls, view, invalidate]);
  return null;
}

/**
 * A match on its court. It owns the camera: the broadcast view, following the play a little. `held`: the match
 * held at that moment (?t=, against the bot). `auto`: a bot plays side 0, so no marker. `watch`: a spectator's
 * match (TennisLive.tsx, T3a), drawn on the map's own camera, with no marker.
 */
export function Play({ session, held = null, auto = false, watch = false }: { session: Session; held?: number | null; auto?: boolean; watch?: boolean }) {
  const { match } = session;
  const { cell, view, aspect } = useBroadcast(session.court, !watch);
  const frame = courtFrame(cell);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  const invalidate = useThree((s) => s.invalidate);
  // from an upright phone (0.46) to a wide screen (1.6), as courtView blends its presets
  const followShare = FOLLOW_TALL + (1 - FOLLOW_TALL) * clamp((aspect - 0.46) / (1.6 - 0.46), 0, 1);

  const material = useMemo(playerMaterial, []);
  const dot = useMemo(dotTexture, []);
  const players = useMemo(() => session.colors.map((c) => makePlayer(c, material)), [session.colors, material]);
  const fx = useMemo(
    () => ({
      trail: new Trail(),
      smears: [new Smear(), new Smear()],
      land: new Pulse(false),
      net: new Pulse(true),
      flash: new Flash(dot),
      marker: new Marker(),
    }),
    [dot],
  );
  useEffect(() => {
    // each racket's blur moves with its player
    players.forEach((p, i) => p.rig.root.add(fx.smears[i].mesh));
    return () => {
      players.forEach((p, i) => p.rig.root.remove(fx.smears[i].mesh));
      players.forEach((p) => p.dispose());
    };
  }, [players, fx]);
  useEffect(
    () => () => {
      material.dispose();
      dot.dispose();
      fx.trail.dispose();
      fx.smears.forEach((s) => s.dispose());
      fx.land.dispose();
      fx.net.dispose();
      fx.flash.dispose();
      fx.marker.dispose();
    },
    [material, dot, fx],
  );

  const court = useRef<THREE.Group>(null);
  const ball = useRef<THREE.Mesh>(null);
  const shadows = useRef<(THREE.Mesh | null)[]>([]);
  const tmp = useMemo(() => ({ eye: new THREE.Vector3(), color: new THREE.Color(), across: new THREE.Vector3(), target: new THREE.Vector3() }), []);
  const cam = useRef({ follow: 0, shakeAt: -Infinity, last: 0, held: false });

  // compile every effect's shader now, not at the first hit: a phone stalls while it compiles one, and online a
  // stall of a few seconds reads as a phone gone to sleep (link.ts)
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const all: THREE.Object3D[] = [fx.trail.mesh, ...fx.smears.map((s) => s.mesh), fx.land.mesh, fx.net.mesh, fx.flash.sprite, fx.marker.mesh];
    if (ball.current) all.push(ball.current);
    const was = all.map((o) => o.visible);
    all.forEach((o) => (o.visible = true));
    gl.compile(scene, camera);
    all.forEach((o, i) => (o.visible = was[i]));
  }, [gl, scene, camera, fx]);

  useFrame(() => {
    const g = court.current;
    if (!g) return;
    const c = cam.current;
    let t: number;
    if (held !== null) {
      // held: play the match up to that moment once, in the same steps every time
      if (!c.held) {
        for (let s = 0; s <= held; s += 1 / 60) match.step(s);
        c.held = true;
      }
      t = held;
    } else {
      t = session.time();
      session.advance(t);
      t = Math.max(t, 0);
    }
    const dt = Math.max(0, t - c.last);
    c.last = t;

    for (const side of SIDES) {
      const f = match.frame(side, t);
      const { rig } = players[side];
      rig.root.position.set(f.x, 0, f.z);
      rig.root.rotation.y = f.yaw;
      posePlayer(rig, f.pose);
      shadows.current[side]?.position.set(f.x, SHADOW_Y, f.z);
      const sw = match.swingTime(side, t);
      fx.smears[side].update((ti) => match.frame(side, ti).pose, t, sw ? sw.rel : null, sw ? sw.since : t);
    }

    const b = match.ballAt(t);
    if (ball.current) {
      ball.current.visible = b !== null;
      if (b) ball.current.position.set(...b);
    }
    const bs = shadows.current[2];
    if (bs) {
      bs.visible = b !== null;
      if (b) {
        bs.position.set(b[0], SHADOW_Y, b[2]);
        bs.scale.setScalar(Math.max(0.5, 1 - b[1] / 8));
      }
    }

    for (const e of match.drain()) {
      if (e.type === "hit") {
        fx.flash.fire(e.t, e.p, 0.9 + 1.4 * e.clean);
        if (e.clean > SHAKE_CLEAN) c.shakeAt = e.t;
      } else if (e.type === "bounce") {
        fx.land.fire(e.t, [e.p[0], SHADOW_Y, e.p[2]], e.out ? "#ff4d5e" : "#ffffff", e.out ? 1.3 : 0.9, e.out ? 1.2 : 0.5);
      } else {
        fx.net.fire(e.t, e.p, "#ffffff", 1.1, 0.5);
      }
    }
    let alive = fx.flash.update(t);
    alive = fx.land.update(t) || alive;
    alive = fx.net.update(t) || alive;

    // the trail, in the hitter's colour, facing the camera
    g.updateWorldMatrix(true, false);
    g.worldToLocal(tmp.eye.copy(camera.position));
    const hit = match.lastHit();
    if (hit && b) tmp.color.set(session.colors[hit.by]).lerp(WHITE, 0.35);
    fx.trail.update((ti) => (hit && b ? match.ballAt(ti) : null), t, hit ? hit.t : t, tmp.eye, tmp.color, BALL_R * 0.95);
    fx.marker.update(auto || watch ? null : match.marker(0, t), t, session.colors[0]);
    if (watch) {
      if (session.busy() || alive) invalidate();
      return;
    }

    // the camera: the broadcast view, moved across with the ball and the player, and a jolt on a clean hit
    const want = followShare * clamp(FOLLOW_BALL * (b ? b[2] : 0) + FOLLOW_PLAYER * match.players[0].z, -FOLLOW_MAX, FOLLOW_MAX);
    c.follow = held !== null ? want : c.follow + (want - c.follow) * Math.min(1, dt * 2.5);
    const u = (t - c.shakeAt) / SHAKE_S;
    const shake = u >= 0 && u < 1 ? SHAKE_M * (1 - u) * Math.sin(t * 95) : 0;
    tmp.across.set(0, 0, 1).applyAxisAngle(Y_AXIS, frame.rotY).multiplyScalar(c.follow * cell.s);
    const up = shake * cell.s;
    camera.position.set(view.position[0] + tmp.across.x, view.position[1] + up, view.position[2] + tmp.across.z);
    tmp.target.set(view.target[0] + tmp.across.x, view.target[1] + up, view.target[2] + tmp.across.z);
    controls?.target.copy(tmp.target);
    camera.lookAt(tmp.target);

    const moving = Math.abs(want - c.follow) > 0.004 || shake !== 0;
    if (held === null && (session.busy() || alive || moving)) invalidate();
  });

  return (
    <group ref={court} position={frame.position} rotation-y={frame.rotY} scale={frame.scale}>
      {players.map((p, i) => (
        <primitive key={i} object={p.rig.root} />
      ))}
      <mesh ref={ball} visible={false}>
        <sphereGeometry args={[BALL_R, 12, 10]} />
        <meshStandardMaterial color="#d8f03c" emissive="#d8f03c" emissiveIntensity={0.4} roughness={0.6} />
      </mesh>
      {[1.3, 1.3, 0.45].map((r, i) => (
        <mesh
          key={i}
          ref={(m) => {
            shadows.current[i] = m;
          }}
          rotation-x={-Math.PI / 2}
          renderOrder={2}
        >
          <planeGeometry args={[r, r]} />
          <meshBasicMaterial map={dot} color="#000" transparent opacity={0.45} depthWrite={false} />
        </mesh>
      ))}
      <primitive object={fx.trail.mesh} />
      <primitive object={fx.land.mesh} />
      <primitive object={fx.net.mesh} />
      <primitive object={fx.flash.sprite} />
      <primitive object={fx.marker.mesh} />
    </group>
  );
}

const CALLS: Record<Why, string> = { out: "OUT", net: "NET", winner: "WINNER", miss: "MISS" };
/** The player's own misses say what went wrong. */
const COACH: Record<Miss, string> = { early: "TOO EARLY", late: "TOO LATE", far: "TOO FAR" };
/** A touch that moves this far (px) is a drag, not a tap (as the map's own taps). */
const TAP_PX = 14;
/** A drag across the whole screen moves the player this far across the court (metres). */
const DRAG_M = 14;
/** How long a call stays up (ms). */
const CALL_MS = 1400;

/** The layer over the map: the match's score, calls and controls, and online, the queue and the match's state. */
export function TennisHud({ game }: { game: Game }) {
  const session = useSession(game);
  return (
    <div className="tn-hud" data-held={game.at !== null || undefined}>
      {session && <MatchHud game={game} session={session} />}
      {game.online && <OnlineHud game={game} online={game.online} session={session} />}
    </div>
  );
}

/** The broadcast's score, the calls and hints, the controls, and (against the bot) the end card. */
function MatchHud({ game, session }: { game: Game; session: Session }) {
  const { match, names, colors } = session;
  const view = useSyncExternalStore(match.subscribe, match.getView, match.getView);
  const callId = view.call?.id ?? 0;
  const [gone, setGone] = useState(0);
  useEffect(() => {
    if (!callId || game.at !== null) return;
    const timer = window.setTimeout(() => setGone(callId), CALL_MS);
    return () => window.clearTimeout(timer);
  }, [callId, game.at]);
  // a held moment shows the call only if it was still up then
  const shown = game.at === null ? view.call?.id !== gone : view.call !== null && game.at - view.call.t < CALL_MS / 1000;
  const call = view.call && shown ? view.call : null;
  const touch = useMemo(() => window.matchMedia("(pointer: coarse)").matches, []);
  const playing = !game.auto && view.phase !== "over";

  // keys: arrows (or A and D) move, Space or Enter swings
  useEffect(() => {
    if (game.auto) return;
    const held = new Set<string>();
    const which = (key: string) =>
      key === "ArrowLeft" || key === "a" || key === "A" ? "left" : key === "ArrowRight" || key === "d" || key === "D" ? "right" : null;
    const push = () => {
      match.setPush(0, (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0));
      game.wake();
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("button")) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!e.repeat && session.live()) {
          match.tap(0, session.timeAt(e.timeStamp));
          game.wake();
        }
        return;
      }
      const k = which(e.key);
      if (k && !held.has(k)) {
        held.add(k);
        push();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const k = which(e.key);
      if (k && held.delete(k)) push();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      match.setPush(0, 0);
    };
  }, [game, match, session]);

  // a touch swings at once; if it turns into a drag, the swing is dropped and the drag moves the player
  const drag = useRef<{ id: number; last: number; moved: boolean; x0: number } | null>(null);
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x0: e.clientX, last: e.clientX, moved: false };
    if (session.live()) match.tap(0, session.timeAt(e.timeStamp));
    game.wake();
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) > TAP_PX) {
      d.moved = true;
      match.cancel(0, session.timeAt(e.timeStamp));
    }
    if (!d.moved) return;
    match.moveAim(0, ((e.clientX - d.last) / Math.max(1, window.innerWidth)) * DRAG_M);
    d.last = e.clientX;
    game.wake();
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  const callText = (c: Call) => (c.why === "miss" && c.miss && c.winner === 1 && !game.auto ? COACH[c.miss] : CALLS[c.why]);
  const hint =
    view.hint === "serve"
      ? touch
        ? "Tap to serve"
        : "Click or press Space to serve"
      : view.hint === "play"
        ? touch
          ? "Drag ← → to move · Tap to swing"
          : "Drag or ← → to move · Click or Space to swing"
        : null;

  return (
    <>
      {playing && (
        <div
          className="tn-input"
          role="application"
          aria-label="Tennis court. Drag to move, tap to swing."
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      )}
      <div className="tn-bug" aria-label={`Score: ${names[0]} ${view.score[0]}, ${names[1]} ${view.score[1]}`}>
        {SIDES.map((side) => (
          <div key={side} className="tn-row">
            <span className="tn-chip" style={{ background: colors[side] }} />
            <span className="tn-name">{names[side]}</span>
            <span className="tn-serve" data-on={view.server === side && view.phase !== "over"} />
            <span key={view.score[side]} className="tn-score" data-pop={view.score[side] > 0}>
              {view.score[side]}
            </span>
          </div>
        ))}
      </div>
      {view.matchPoint && (view.phase === "serve" || view.phase === "rally") && <div className="tn-mp">MATCH POINT</div>}
      {call && (
        <div key={call.id} className="tn-call" aria-live="polite">
          <div className="tn-call-text" style={{ "--tn-glow": colors[call.winner] } as CSSProperties}>
            {callText(call)}
          </div>
          <div className="tn-call-detail">Point · {names[call.winner]}</div>
        </div>
      )}
      {hint && <div className="tn-hint">{hint}</div>}
      {game.mode === "bot" && view.phase === "over" && view.winner !== null && (
        <div className="tn-end" role="dialog" aria-label="Match over">
          <div className="tn-end-title">{view.winner === 0 && !game.auto ? "You win!" : `${names[view.winner]} wins`}</div>
          <div className="tn-end-score">
            {view.score[0]} – {view.score[1]}
          </div>
          {!game.auto && (
            <div className="tn-btns">
              <button
                type="button"
                className="tn-btn"
                onClick={() => {
                  match.reset(session.time());
                  game.wake();
                }}
              >
                Play again
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** Online: the queue, the match's start and pauses, and its end (rematch or not). */
function OnlineHud({ game, online, session }: { game: Game; online: Online; session: Session | null }) {
  const view = useSyncExternalStore(online.subscribe, online.getView, online.getView);
  const link = view.match?.link ?? null;
  const name = view.match?.opponent.name ?? "";
  // a hidden tab cannot play: the other phone pauses; leaving the page leaves every room at once
  useEffect(() => {
    const onVisible = () => online.setAway(document.hidden);
    const onHide = () => online.close();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onHide);
    };
  }, [online]);
  // the countdown and the pause count down on screen
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const counting = link?.phase === "countdown" || link?.phase === "paused";
  useEffect(() => {
    if (!counting) return;
    const id = window.setInterval(redraw, 250);
    return () => window.clearInterval(id);
  }, [counting]);
  const left = Math.ceil(online.link?.secondsLeft() ?? 0);
  const { lobby } = view;
  const act = (fn: () => void) => () => {
    fn();
    game.wake();
  };

  if (!view.match || !link) {
    // the queue's room is joined only on Play, so before that there is nothing to count
    const queued = lobby?.me.status === "queue";
    const status = !lobby || !queued
      ? "Play someone on the courts"
      : lobby.waiting < 2
        ? "Finding someone to play…"
        : lobby.playing >= 3
          ? `Waiting for a free court · ${lobby.ahead} ahead`
          : "Pairing…";
    return (
      <div className="tn-panel">
        <div className="tn-panel-title">Tennis · {game.profile.name}</div>
        <div className="tn-panel-sub" aria-live="polite">
          {status}
        </div>
        {!game.auto && (
          <div className="tn-btns">
            {queued ? (
              <button type="button" className="tn-btn" data-kind="ghost" onClick={act(() => online.cancel())}>
                Cancel
              </button>
            ) : (
              <button type="button" className="tn-btn" onClick={act(() => online.play())}>
                Play
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const where = `vs ${name} · Court ${view.match.court + 1}`;
  if (link.phase === "connecting" || link.phase === "countdown") {
    return (
      <div className="tn-banner">
        <div className="tn-banner-title">{where}</div>
        {link.phase === "countdown" && left > 0 ? <div className="tn-count">{left}</div> : <div className="tn-panel-sub">Connecting…</div>}
      </div>
    );
  }
  if (link.phase === "paused") {
    return (
      <div className="tn-end" role="status">
        <div className="tn-end-title">Waiting for {name}</div>
        <div className="tn-end-score">{left > 0 ? `${left} s, then you win` : "…"}</div>
      </div>
    );
  }
  if (link.phase === "playing") return null;
  return session ? <OnlineEnd game={game} online={online} session={session} name={name} /> : null;
}

/** The end of an online match: who won, a rematch (both must say yes), or back to the queue. */
function OnlineEnd({ game, online, session, name }: { game: Game; online: Online; session: Session; name: string }) {
  const view = useSyncExternalStore(online.subscribe, online.getView, online.getView);
  const mv = useSyncExternalStore(session.match.subscribe, session.match.getView, session.match.getView);
  const link = view.match?.link;
  if (!link) return null;
  const act = (fn: () => void) => () => {
    fn();
    game.wake();
  };
  const title =
    mv.left === 1 ? `${name} left · You win` : mv.left === 0 ? "You left the match" : mv.winner === 0 ? "You win!" : `${name} wins`;
  const { me, them } = link.rematch;
  const closed = link.phase === "closed";
  const note = closed
    ? link.closed === "declined"
      ? me === false
        ? null
        : `${name} said no to a rematch`
      : link.closed === "timeout"
        ? "No answer"
        : null
    : me && them === null
      ? `Waiting for ${name}…`
      : them && me === null
        ? `${name} wants a rematch`
        : null;
  const canRematch = !closed && mv.left === null && me === null && them !== false;
  return (
    <div className="tn-end" role="dialog" aria-label="Match over">
      <div className="tn-end-title">{title}</div>
      <div className="tn-end-score">
        {mv.score[0]} – {mv.score[1]}
      </div>
      {note && <div className="tn-panel-sub">{note}</div>}
      {!game.auto && (
        <div className="tn-btns">
          {canRematch && (
            <button type="button" className="tn-btn" onClick={act(() => online.rematch(true))}>
              Rematch
            </button>
          )}
          {closed || mv.left !== null || them === false ? (
            <button type="button" className="tn-btn" data-kind={canRematch ? "ghost" : undefined} onClick={act(() => online.playAgain())}>
              Play again
            </button>
          ) : null}
          <button type="button" className="tn-btn" data-kind="ghost" onClick={act(() => online.leave())}>
            Leave
          </button>
        </div>
      )}
    </div>
  );
}
