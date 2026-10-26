"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent } from "react";
import * as THREE from "three";

import { groupColor, themeFromColor } from "@/components/freshie/groupTheme";

import { BALL_R } from "./ball";
import { courtFrame, courtView, TENNIS_COURTS } from "./court";
import { dotTexture, Flash, Marker, Pulse, Smear, Trail } from "./effects";
import { Match, type Call, type Miss, type Why } from "./match";
import { makePlayer, playerMaterial, posePlayer } from "./player";
import { CourtSurface } from "./surface";

import "./tennis.css";

// DRAFT: the tennis game against a bot (docs/ROADMAP.md, item 9, batch T1b), on /map3d?tennis=bot. One Game feeds
// two parts: TennisCourt draws the match in the 3D scene, and TennisHud lays the broadcast's score, the calls and
// the touch controls over it. CampusMap3D loads this file only when the page asks for the game. No network: the
// bot plays on this phone.

export type TennisOptions = {
  /** The player's shirt: a group colour (the default blue when missing or invalid). */
  color: string;
  /** Two bots and no player (screenshots, tests). */
  auto: boolean;
  /** Holds the match at this many seconds in; with `auto`, the same moment every time. */
  at: number | null;
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

export type Game = {
  match: Match;
  clock: Clock;
  names: [string, string];
  colors: [string, string];
  auto: boolean;
  at: number | null;
  /** Asks the map for a frame: it draws on demand. TennisCourt sets it. */
  wake: () => void;
};

/** The game plays on the middle court, where the page's broadcast view starts. */
export const GAME_COURT = 1;

export function createGame(o: TennisOptions): Game {
  const you = groupColor(o.color);
  return {
    // a fixed seed with two bots, so a held moment is the same every time
    match: new Match(o.auto ? 17 : Math.floor(Math.random() * 1e9), [o.auto, true]),
    clock: new Clock(),
    names: o.auto ? ["Bot A", "Bot B"] : ["You", "Bot"],
    colors: [you, themeFromColor(you).partner.toLowerCase()],
    auto: o.auto,
    at: o.at,
    wake: () => {},
  };
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

/** The match on the court, in the map's scene. It owns the camera: the broadcast view, following the play a little. */
export function TennisCourt({ game }: { game: Game }) {
  const { match, clock } = game;
  const cell = TENNIS_COURTS[GAME_COURT];
  const frame = courtFrame(cell);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const aspect = size.width / Math.max(1, size.height);
  const view = useMemo(() => courtView(cell, aspect), [cell, aspect]);
  // from an upright phone (0.46) to a wide screen (1.6), as courtView blends its presets
  const followShare = FOLLOW_TALL + (1 - FOLLOW_TALL) * clamp((aspect - 0.46) / (1.6 - 0.46), 0, 1);

  const material = useMemo(playerMaterial, []);
  const dot = useMemo(dotTexture, []);
  const players = useMemo(() => game.colors.map((c) => makePlayer(c, material)), [game.colors, material]);
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

  // the broadcast view's lens (the map's own is 30°), for the screen's shape
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const was = camera.fov;
    camera.fov = view.fov;
    camera.updateProjectionMatrix();
    invalidate();
    return () => {
      camera.fov = was;
      camera.updateProjectionMatrix();
    };
  }, [camera, view.fov, invalidate]);

  useEffect(() => {
    game.wake = invalidate;
    invalidate();
    return () => {
      game.wake = () => {};
    };
  }, [game, invalidate]);

  const court = useRef<THREE.Group>(null);
  const ball = useRef<THREE.Mesh>(null);
  const shadows = useRef<(THREE.Mesh | null)[]>([]);
  const tmp = useMemo(() => ({ eye: new THREE.Vector3(), color: new THREE.Color(), across: new THREE.Vector3(), target: new THREE.Vector3() }), []);
  const cam = useRef({ follow: 0, shakeAt: -Infinity, last: 0, held: false });

  useFrame(() => {
    const g = court.current;
    if (!g) return;
    const c = cam.current;
    let t: number;
    if (game.at !== null) {
      // held: play the match up to that moment once, in the same steps every time
      if (!c.held) {
        for (let s = 0; s <= game.at; s += 1 / 60) match.step(s);
        c.held = true;
      }
      t = game.at;
    } else {
      t = clock.tick(performance.now());
      match.step(t);
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
    if (hit && b) tmp.color.set(game.colors[hit.by]).lerp(WHITE, 0.35);
    fx.trail.update((ti) => (hit && b ? match.ballAt(ti) : null), t, hit ? hit.t : t, tmp.eye, tmp.color, BALL_R * 0.95);
    fx.marker.update(game.auto ? null : match.marker(0, t), t, game.colors[0]);

    // the camera: the broadcast view, moved across with the ball and the player, and a jolt on a clean hit
    const want = followShare * clamp(FOLLOW_BALL * (b ? b[2] : 0) + FOLLOW_PLAYER * match.players[0].z, -FOLLOW_MAX, FOLLOW_MAX);
    c.follow = game.at !== null ? want : c.follow + (want - c.follow) * Math.min(1, dt * 2.5);
    const u = (t - c.shakeAt) / SHAKE_S;
    const shake = u >= 0 && u < 1 ? SHAKE_M * (1 - u) * Math.sin(t * 95) : 0;
    tmp.across.set(0, 0, 1).applyAxisAngle(Y_AXIS, frame.rotY).multiplyScalar(c.follow * cell.s);
    const up = shake * cell.s;
    camera.position.set(view.position[0] + tmp.across.x, view.position[1] + up, view.position[2] + tmp.across.z);
    tmp.target.set(view.target[0] + tmp.across.x, view.target[1] + up, view.target[2] + tmp.across.z);
    controls?.target.copy(tmp.target);
    camera.lookAt(tmp.target);

    const moving = Math.abs(want - c.follow) > 0.004 || shake !== 0;
    if (game.at === null && (match.busy() || alive || moving)) invalidate();
  });

  return (
    <>
      <CourtSurface />
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
    </>
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

/** The broadcast's score, the calls and hints, the end card, and the controls (a layer over the whole map). */
export function TennisHud({ game }: { game: Game }) {
  const { match, clock, names, colors } = game;
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
        if (!e.repeat) {
          match.tap(0, clock.at(e.timeStamp));
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
  }, [game, match, clock]);

  // a touch swings at once; if it turns into a drag, the swing is dropped and the drag moves the player
  const drag = useRef<{ id: number; last: number; moved: boolean; x0: number } | null>(null);
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x0: e.clientX, last: e.clientX, moved: false };
    match.tap(0, clock.at(e.timeStamp));
    game.wake();
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) > TAP_PX) {
      d.moved = true;
      match.cancel(0, clock.at(e.timeStamp));
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
    <div className="tn-hud" data-held={game.at !== null || undefined}>
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
      {view.phase === "over" && view.winner !== null && (
        <div className="tn-end" role="dialog" aria-label="Match over">
          <div className="tn-end-title">{view.winner === 0 && !game.auto ? "You win!" : `${names[view.winner]} wins`}</div>
          <div className="tn-end-score">
            {view.score[0]} – {view.score[1]}
          </div>
          {!game.auto && (
            <button
              type="button"
              className="tn-again"
              onClick={() => {
                match.reset(clock.t);
                game.wake();
              }}
            >
              Play again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
