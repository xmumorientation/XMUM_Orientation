"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";

import { makeGlow } from "../textures";
import { Board, type LiveCourt } from "./board";
import { TENNIS_COURTS } from "./court";
import type { Transport } from "./net";
import { playerMaterial } from "./player";
import { CourtSurface } from "./surface";
import { RallyCourt } from "./TennisDemo";
import { openTransport, Play, type Session, type TennisOptions } from "./TennisGame";
import { Watch } from "./watch";

// DRAFT: the tennis courts for everyone with the map open (docs/ROADMAP.md, item 9, batch T3a). A busy court
// (board.ts) shows two figures in the players' shirts playing the looping rally (rally.ts); the map's "Tennis
// Court" label says "● LIVE" (CampusScene). With the camera near a busy court, the phone watches its real match
// instead (watch.ts), while the match has room for it (WATCH_MAX). The figures move only while their court is on
// screen and near enough to see, so the map, which draws on demand on phones, is not kept drawing for them.

export type Spectator = { transport: Transport; board: Board };

export async function createSpectator(net: TennisOptions["net"]): Promise<Spectator> {
  const transport = await openTransport(net);
  return { transport, board: new Board(transport) };
}

/** Within NEAR_M of a busy court's middle (metres), with it on screen, the phone watches it; it stops beyond LEAVE_M. */
const NEAR_M = 110;
const LEAVE_M = 140;
/** A court on screen within this distance (m) plays its rally; further off, its figures are specks and stand still. */
const ANIMATE_M = 350;
/** The camera stays near a court this long before the phone joins its match, and away this long before it leaves. */
const JOIN_S = 0.6;
const LEAVE_S = 1.5;
/** A full match is tried again after this long. */
const RETRY_S = 30;

const centre = new THREE.Vector3();
const ndc = new THREE.Vector3();

/**
 * The busy court the camera is near (its match's key), once it has stayed near it a moment, and which courts are
 * seen (on screen, near enough to see their figures move).
 */
function useNearCourt(courts: LiveCourt[]) {
  const seen = useRef([false, false, false]);
  const [near, setNear] = useState<string | null>(null);
  const shown = useRef<string | null>(null);
  const pending = useRef<{ key: string | null; since: number }>({ key: null, since: 0 });
  useFrame(({ camera, clock, invalidate }) => {
    let best: { key: string; d: number } | null = null;
    seen.current = [false, false, false];
    for (const c of courts) {
      const cell = TENNIS_COURTS[c.court];
      centre.set(cell.cx, 0, cell.cz);
      const d = camera.position.distanceTo(centre) / cell.s;
      ndc.copy(centre).project(camera);
      const onScreen = ndc.z < 1 && Math.abs(ndc.x) < 1.1 && Math.abs(ndc.y) < 1.1;
      seen.current[c.court] = onScreen && d < ANIMATE_M;
      if (onScreen && d < (c.key === shown.current ? LEAVE_M : NEAR_M) && (!best || d < best.d)) best = { key: c.key, d };
    }
    const want = best?.key ?? null;
    const now = clock.getElapsedTime();
    const p = pending.current;
    if (want !== p.key) pending.current = { key: want, since: now };
    if (want === shown.current) return;
    // waiting out the moment: keep the frames coming, or a still camera never gets there
    if (now - pending.current.since < (want ? JOIN_S : LEAVE_S)) return invalidate();
    shown.current = want;
    setNear(want);
  });
  return { near: courts.some((c) => c.key === near) ? near : null, seen };
}

/** This phone watching match `key` (null: none), unless it is full; then it tries again RETRY_S later. */
function useWatch(transport: Transport, key: string | null): Watch | null {
  const [watch, setWatch] = useState<Watch | null>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const full = useRef(new Map<string, number>());
  useEffect(() => {
    if (!key) return;
    let timer = 0;
    let open: Watch | null = null;
    const join = () => {
      const wait = (full.current.get(key) ?? 0) - Date.now();
      if (wait > 0) {
        timer = window.setTimeout(join, wait);
        return;
      }
      const w = (open = new Watch(transport, key));
      setWatch(w);
      w.subscribe(() => {
        if (w.status !== "full") return bump();
        // no room (it has left already): the rally from afar, and another try later
        full.current.set(key, Date.now() + RETRY_S * 1000);
        open = null;
        setWatch(null);
        timer = window.setTimeout(join, RETRY_S * 1000);
      });
    };
    join();
    return () => {
      window.clearTimeout(timer);
      open?.close();
      setWatch(null);
    };
  }, [transport, key]);
  return watch;
}

/** A hidden tab watches nothing: every message would still reach it. */
function useHidden() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    on();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return hidden;
}

/** A watched match as Play draws it, on the map's own camera. */
function watchSession(w: Watch, c: LiveCourt): Session {
  return {
    id: `watch:${w.key}`,
    match: w.match,
    court: c.court,
    names: ["", ""],
    colors: c.colors,
    time: () => w.time() ?? 0,
    timeAt: () => 0,
    advance: (t) => w.advance(t),
    live: () => false,
    busy: () => true,
  };
}

/**
 * The busy courts, in the map's scene: the rally on each, and the real match on the one the camera is near. On the
 * map pages (T3b), this phone's own match is drawn by the game instead (`exclude`, its key), the phone watches
 * nothing while it plays (`watch` false), and the page draws the crisp courts itself (`surface` false).
 */
export function LiveCourts({
  spectator,
  exclude = null,
  watch: watching = true,
  surface = true,
}: {
  spectator: Spectator;
  exclude?: string | null;
  watch?: boolean;
  surface?: boolean;
}) {
  const { board, transport } = spectator;
  const all = useSyncExternalStore(board.subscribe, board.getView, board.getView);
  const courts = useMemo(() => (exclude ? all.filter((c) => c.key !== exclude) : all), [all, exclude]);
  const material = useMemo(playerMaterial, []);
  const shadowTex = useMemo(makeGlow, []);
  useEffect(
    () => () => {
      material.dispose();
      shadowTex.dispose();
    },
    [material, shadowTex],
  );
  const invalidate = useThree((s) => s.invalidate);
  // a court starting or ending changes the scene: draw it
  useEffect(() => invalidate(), [courts, invalidate]);

  const { near, seen } = useNearCourt(courts);
  const hidden = useHidden();
  const watch = useWatch(transport, hidden || !watching ? null : near);
  // until the match has a score to show, the watcher is moved on here (Play does it after)
  useFrame(({ invalidate }) => {
    if (!watch || watch.ready) return;
    const t = watch.time();
    if (t !== null) watch.advance(t);
    invalidate();
  });
  const watched = watch?.ready ? courts.find((c) => c.key === watch.key) : undefined;
  const session = useMemo(() => (watch && watched ? watchSession(watch, watched) : null), [watch, watched]);

  return (
    <>
      {surface && <CourtSurface />}
      {courts.map((c) =>
        session && c.key === watch?.key ? (
          <Play key={c.key} session={session} watch />
        ) : (
          <RallyCourt
            key={c.key}
            index={c.court}
            shirts={c.colors}
            material={material}
            shadowTex={shadowTex}
            at={null}
            animate={() => seen.current[c.court]}
          />
        ),
      )}
    </>
  );
}
