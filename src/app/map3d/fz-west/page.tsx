"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";

import ZonePreview from "@/components/map3d/funfair/ZonePreview";
import type { ZoneProps } from "@/components/map3d/funfair/common";
import { FunfairGate } from "@/components/map3d/funfair/gate";
import { FunfairWest } from "@/components/map3d/funfair/west";

// DRAFT, dev only: the funfair's west zone and the VORTEXA gate in the map while they are built.
// ZonePreview reads ?power=0|1, ?mode=day|sunset|night, ?lite=1 and ?cam=x,y,z,tx,ty,tz. Here also:
// - ?gate=0|0.33|0.67|1: the gate's share of zones powered (default 1); ?gate=off leaves the gate out;
// - ?flip=<ms>: the zone powers up after that delay (to watch the power-up);
// - ?zone=0: leaves the zone and the gate out (a baseline for the cost); ?west=0 leaves only the zone out;
// - ?stats=1: counts the frame's draw calls and triangles into window.__fzStats.

function Stats() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    gl.info.autoReset = false;
    (window as unknown as { __fzScene?: unknown }).__fzScene = scene;
    // a map that draws on demand (lite) stops drawing; keep frames coming so the counts are current
    const id = window.setInterval(() => invalidate(), 250);
    return () => {
      gl.info.autoReset = true;
      window.clearInterval(id);
    };
  }, [gl, scene, invalidate]);
  useFrame(() => {
    const w = window as unknown as { __fzStats?: { calls: number; triangles: number } };
    w.__fzStats = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
    gl.info.reset();
  }, -1000);
  return null;
}

type Query = { zone: boolean; west: boolean; gate: number | null; flip: number; stats: boolean };

function Zone(props: ZoneProps) {
  const [q, setQ] = useState<Query | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const flip = Number(p.get("flip") ?? "");
    const g = p.get("gate");
    const gv = Number(g ?? "1");
    setQ({
      zone: p.get("zone") !== "0",
      west: p.get("west") !== "0",
      gate: g === "off" ? null : Number.isFinite(gv) ? Math.min(1, Math.max(0, gv)) : 1,
      flip: Number.isFinite(flip) && flip > 0 ? flip : 0,
      stats: p.get("stats") === "1",
    });
  }, []);
  useEffect(() => {
    if (!q?.flip) return;
    const id = window.setTimeout(() => setOn(true), q.flip);
    return () => window.clearTimeout(id);
  }, [q]);
  if (!q) return null;
  const power = q.flip ? (on ? 1 : 0) : props.power;
  return (
    <>
      {q.stats && <Stats />}
      {q.zone && q.west && <FunfairWest {...props} power={power} />}
      {q.zone && q.gate !== null && <FunfairGate {...props} power={q.gate} />}
    </>
  );
}

export default function FunfairWestPreview() {
  return <ZonePreview Zone={Zone} />;
}
