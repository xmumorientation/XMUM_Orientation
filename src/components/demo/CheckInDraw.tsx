"use client";

/**
 * DEMO: Counter QR landing — fake group draw only (website backup).
 * Does NOT issue a group Homepage pass — scanning a wristband ticket QR
 * (POST/GET /api/group-pass/redeem) is what grants /group/* access.
 * No QR scanner on this public demo page.
 */

import { useEffect, useRef, useState } from "react";

import { Glow, Spark } from "@/components/home/decor";
import { FONT } from "@/components/home/data";
import { nexusBody, vxDisplay, vxSlab } from "@/components/home/fonts";
import "@/components/home/vortexa.css";
import { DRAW_POOL } from "./demo-data";
import "./demo.css";

type Phase = "drawing" | "result";

function pickGroup(): number {
  const i = Math.floor(Math.random() * DRAW_POOL.length);
  return DRAW_POOL[i] ?? 1;
}

/** Decelerating slot delay — starts snappy, eases into the landing beat. */
function spinDelay(tick: number, maxTicks: number): number {
  const t = tick / maxTicks;
  return Math.round(55 + t * t * 220);
}

export default function CheckInDraw() {
  const [phase, setPhase] = useState<Phase>("drawing");
  const [spin, setSpin] = useState(1);
  const [group, setGroup] = useState<number | null>(null);
  const [landFlash, setLandFlash] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const clearAll = () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    };

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      const g = pickGroup();
      setGroup(g);
      setPhase("result");
      return clearAll;
    }

    const final = pickGroup();
    const maxTicks = 18;
    let tick = 0;

    const step = () => {
      tick += 1;
      setSpin(DRAW_POOL[tick % DRAW_POOL.length] ?? 1);

      if (tick >= maxTicks) {
        setGroup(final);
        setPhase("result");
        setLandFlash(true);
        const flashOff = window.setTimeout(() => setLandFlash(false), 700);
        timers.current.push(flashOff);
        return;
      }

      const id = window.setTimeout(step, spinDelay(tick, maxTicks));
      timers.current.push(id);
    };

    const start = window.setTimeout(step, 80);
    timers.current.push(start);

    return clearAll;
  }, []);

  return (
    <div
      className={`${vxDisplay.variable} ${vxSlab.variable} ${nexusBody.variable} vx vx-demo nexus relative text-white`}
      style={{ fontFamily: FONT.body }}
    >
      <main className="vx-demo-main">
        <div className="vx-dots" />
        <Glow size="min(420px, 85vw)" color="var(--vx-navy)" style={{ left: "-10%", top: "8%", opacity: 0.5 }} />
        <Glow size="min(300px, 70vw)" color="var(--vx-pink)" style={{ right: "-8%", bottom: "4%", opacity: 0.28 }} />
        <Spark size={18} color="var(--vx-yellow)" style={{ left: "14%", top: "22%", opacity: 0.5 }} />

        <div className="vx-demo-stage" aria-live="polite">
          {phase === "drawing" ? (
            <>
              <p className="vx-demo-draw-label">Drawing your group…</p>
              <div className="vx-demo-draw-frame" data-spinning="true">
                <p className="vx-demo-draw-spin" key={spin} aria-hidden>
                  {spin}
                </p>
              </div>
              <p className="vx-demo-result-lead">Matching you to a team</p>
            </>
          ) : (
            <>
              <p className="vx-demo-draw-label">You&apos;re in</p>
              <div
                className={`vx-demo-result-frame${landFlash ? " is-land" : ""}`}
              >
                <p
                  className="vx-demo-result-num vx-num"
                  aria-label={`Group ${group}`}
                >
                  {group}
                </p>
              </div>
              <h1 className="vx-demo-result-title">Group {group}</h1>
              <p className="vx-demo-result-lead">
                Head to the matching team line and find your Facilitator.
              </p>
</>
          )}
        </div>
      </main>
    </div>
  );
}
