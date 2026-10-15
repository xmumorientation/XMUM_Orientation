"use client";

import { useEffect, useState, type ComponentType } from "react";

import type { Mode } from "../atmosphere";
import CampusScene, { type CameraView } from "../CampusScene";
import type { ZoneProps } from "./common";

// DRAFT, dev only: one funfair zone inside the real campus map, while it is
// being built. ?power=0|1, ?mode=day|sunset|night, ?lite=1, ?cam=x,y,z,tx,ty,tz.
// Removed once the funfair is wired into the scene itself.

export default function ZonePreview({ Zone }: { Zone: ComponentType<ZoneProps> }) {
  const [q, setQ] = useState<{ power: number; mode: Mode; lite: boolean; camera?: CameraView } | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const v = p.get("cam")?.split(",").map(Number);
    const m = p.get("mode");
    setQ({
      power: p.get("power") === "0" ? 0 : 1,
      mode: m === "day" || m === "night" || m === "sunset" ? m : "day",
      lite: p.get("lite") === "1",
      camera:
        v && v.length === 6 && !v.some(Number.isNaN)
          ? { position: [v[0], v[1], v[2]], target: [v[3], v[4], v[5]] }
          : undefined,
    });
  }, []);
  if (!q) return null;
  return (
    <main style={{ position: "fixed", inset: 0 }}>
      <CampusScene mode={q.mode} lite={q.lite} camera={q.camera} intro={false}>
        <Zone power={q.power} night={q.mode === "night"} lite={q.lite} />
      </CampusScene>
    </main>
  );
}
