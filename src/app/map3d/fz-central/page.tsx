"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";

import ZonePreview from "@/components/map3d/funfair/ZonePreview";
import { FunfairCentral } from "@/components/map3d/funfair/central";
import type { ZoneProps } from "@/components/map3d/funfair/common";

// DRAFT, dev only: the funfair's central zone in the map while it is built.
// Extra parameters for checking it: ?zone=0 leaves the zone out (a baseline
// for the cost), ?flip=<ms> switches the power on after that delay (to watch
// the power-up). ?stats=1 counts the frame's draw calls and triangles into
// window.__fzStats.

function Stats() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame(() => {
    const w = window as unknown as { __fzStats?: { calls: number; triangles: number } };
    w.__fzStats = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
    gl.info.reset();
  }, -1000);
  return null;
}

function Zone(props: ZoneProps) {
  const [q, setQ] = useState<{ zone: boolean; flip: number; stats: boolean } | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const flip = Number(p.get("flip") ?? "");
    setQ({ zone: p.get("zone") !== "0", flip: Number.isFinite(flip) && flip > 0 ? flip : 0, stats: p.get("stats") === "1" });
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
      {q.zone && <FunfairCentral {...props} power={power} />}
    </>
  );
}

export default function FunfairCentralPreview() {
  return <ZonePreview Zone={Zone} />;
}
