"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { KEY_COLORS } from "@/components/freshie/items/KeyEmblem";
import { FUNFAIR_ZONE_NAMES, type FunfairZone } from "@/lib/funfair";
import type { MapTime } from "@/lib/mapTime";
import { PROJECTOR_CODE_NAMES, type ProjectorLocation } from "@/lib/types";

import {
  BOULEVARD_X,
  FIELD,
  GATE_2D,
  GATE_AT,
  HUBS,
  PROMENADE_X,
  RIDES_2D,
  RING_R,
  WALKS,
  squeeze,
  worldToArt,
  ZONE_WORLD,
  zoneAt,
  type Ride2D,
  type RideSpot,
  type World,
} from "./funfair2dLayout";

// The Vortexa Funfair on the 2D map, drawn in the art's own isometric style (docs/map3d-funfair-design.md).
// A zone stays powered off (grey frames, dead bulbs, still rides, a red standby light) until its projector is lit;
// then its bulbs switch on one after another, the neon glows and the rides move. At dusk and night the map
// darkens and lit rides cast pools of light. Each zone keeps the 3D map's style: West / Neon Pier is neon cyber
// (pink), Central / Starlight Midway is toy-bright (cyan), East / Big Top is retro carnival (red, cream, yellow).
// Map units: the art is 3203 x 1776. No filters (this is the old phones' map): glows are radial gradients.

const MAP_W = 3203;
const MAP_H = 1776;
const mx = (p: number) => (p / 100) * MAP_W;
const my = (p: number) => (p / 100) * MAP_H;

/** The art's ground axes, per map unit: world +X runs down-right, world +Z down-left. */
const EX: [number, number] = [0.854, 0.521];
const EZ: [number, number] = [-0.863, 0.505];
type Pt = [number, number];
const iso = (a: number, b: number, h = 0): Pt => [a * EX[0] + b * EZ[0], a * EX[1] + b * EZ[1] - h];
const poly = (list: Pt[]) => list.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
/** Text and panels flat on a face that runs along +X (a box's left face) or along -Z (its right face). */
const ALONG_X = `matrix(${EX[0]} ${EX[1]} 0 1 0 0)`;
const ALONG_NEG_Z = `matrix(${-EZ[0]} ${-EZ[1]} 0 1 0 0)`;

const VX = {
  pink: "#fe06ab",
  cyan: "#0dfcfd",
  yellow: "#f2ff0b",
  orange: "#fc9e3d",
  lilac: "#e0b4fc",
  red: "#e0243f",
  cream: "#fff3dc",
  ink: "#0b0912",
};
/** Powered-off greys. */
const OFF = { frame: "#4a4652", dark: "#34303b", mid: "#5f5a69", light: "#7d7788", bulb: "#6d6676" };
/** Powered off at night: dark shapes against the dark, so an off zone reads as asleep, not as a ghost. */
const OFF_NIGHT = { frame: "#2b2833", dark: "#1d1b23", mid: "#35313e", light: "#46404f", bulb: "#3b3644" };

export const ZONE_COLOR: Record<FunfairZone, string> = { west: VX.pink, central: VX.cyan, east: "#ffd23f" };

type Ctx = {
  on: boolean;
  /** The powered-off greys (darker at night). */
  off: typeof OFF;
  /** On and motion allowed (not reduced motion). */
  motion: boolean;
  night: boolean;
  /** Gradient ids. */
  glow: (color: "pink" | "cyan" | "yellow" | "orange" | "lilac") => string;
};

/** Power-up delay for bulb `i`: they switch on one after another. */
const delay = (i: number): CSSProperties => ({ "--d": `${(i * 45) % 1600}ms` }) as CSSProperties;

function Bulb({ x, y, i, ctx, r = 3.6, color = "#fff6c2" }: { x: number; y: number; i: number; ctx: Ctx; r?: number; color?: string }) {
  return ctx.on ? (
    <circle cx={x} cy={y} r={r} fill={color} className={i % 3 === 0 ? "ff-b ff-tw" : "ff-b"} style={delay(i)} />
  ) : (
    <circle cx={x} cy={y} r={r * 0.8} fill={ctx.off.bulb} />
  );
}

/** A neon tube: a soft wide glow under a bright core when on, a dead grey tube when off. */
function Neon({ d, color, w = 6, ctx }: { d: string; color: string; w?: number; ctx: Ctx }) {
  return ctx.on ? (
    <g className="ff-neon">
      <path d={d} fill="none" stroke={color} strokeWidth={w * 3} strokeOpacity={ctx.night ? 0.4 : 0.25} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth={w * 0.35} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ) : (
    <path d={d} fill="none" stroke={ctx.off.mid} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
  );
}

function IsoBox({ A, B, h, top, left, right, z = 0 }: { A: number; B: number; h: number; top: string; left: string; right: string; z?: number }) {
  return (
    <>
      <polygon points={poly([iso(A, -B, z), iso(A, B, z), iso(A, B, z + h), iso(A, -B, z + h)])} fill={right} />
      <polygon points={poly([iso(-A, B, z), iso(A, B, z), iso(A, B, z + h), iso(-A, B, z + h)])} fill={left} />
      <polygon points={poly([iso(-A, -B, z + h), iso(A, -B, z + h), iso(A, B, z + h), iso(-A, B, z + h)])} fill={top} />
    </>
  );
}

/** Points along the front half of a flat ellipse (the side the viewer sees), left to right. */
function frontArc(rx: number, ry: number, cy: number, n: number): Pt[] {
  return Array.from({ length: n + 1 }, (_, k) => {
    const t = Math.PI - (k / n) * Math.PI;
    return [rx * Math.cos(t), cy + ry * Math.sin(t)];
  });
}

/** The visible side of a round platform, `h` tall, under a top ellipse at `-h`. */
function Drum({ rx, ry, h, side, top }: { rx: number; ry: number; h: number; side: string; top: string }) {
  return (
    <>
      <path d={`M ${-rx} ${-h} L ${-rx} 0 A ${rx} ${ry} 0 0 0 ${rx} 0 L ${rx} ${-h} Z`} fill={side} />
      <ellipse cy={-h} rx={rx} ry={ry} fill={top} />
    </>
  );
}

/** A striped cone roof: apex above, a flat ellipse below, stripes on the front. */
function Cone({ rx, ry, base, apex, a, b, scallop, ctx, bulbs = 0, i0 = 0 }: {
  rx: number; ry: number; base: number; apex: number; a: string; b: string; scallop?: [string, string]; ctx: Ctx; bulbs?: number; i0?: number;
}) {
  const n = 12;
  const arc = frontArc(rx, ry, base, n);
  const back = `M 0 ${apex} L ${-rx} ${base} A ${rx} ${ry} 0 0 0 ${rx} ${base} Z`;
  return (
    <>
      <path d={back} fill={b} />
      {arc.slice(0, -1).map((p, k) =>
        k % 2 === 0 ? <polygon key={k} points={poly([[0, apex], p, arc[k + 1]])} fill={a} /> : null,
      )}
      {scallop &&
        arc.slice(0, -1).map((p, k) => {
          const q = arc[k + 1];
          const r = Math.hypot(q[0] - p[0], q[1] - p[1]) / 2;
          return (
            <path
              key={`s${k}`}
              d={`M ${p[0]} ${p[1]} A ${r} ${r} 0 0 0 ${q[0]} ${q[1]} Z`}
              fill={k % 2 === 0 ? scallop[0] : scallop[1]}
            />
          );
        })}
      {bulbs > 0 &&
        frontArc(rx, ry, base, bulbs).map(([x, y], k) => <Bulb key={`b${k}`} x={x} y={y + 2} i={i0 + k} ctx={ctx} />)}
    </>
  );
}

function Shadow({ rx, ry }: { rx: number; ry: number }) {
  return <ellipse rx={rx} ry={ry} fill="#000" opacity="0.22" />;
}

function Glow({ cx = 0, cy, r, color, ctx }: { cx?: number; cy: number; r: number; color: Parameters<Ctx["glow"]>[0]; ctx: Ctx }) {
  if (!ctx.on) return null;
  return <circle cx={cx} cy={cy} r={r} fill={ctx.glow(color)} className="ff-halo" opacity={ctx.night ? 1 : 0.7} />;
}

function Spin({ dur, cx = 0, cy = 0, ctx, reverse, children }: { dur: number; cx?: number; cy?: number; ctx: Ctx; reverse?: boolean; children: ReactNode }) {
  return (
    <g>
      {ctx.motion && (
        <animateTransform
          attributeName="transform"
          type="rotate"
          from={`0 ${cx} ${cy}`}
          to={`${reverse ? -360 : 360} ${cx} ${cy}`}
          dur={`${dur}s`}
          repeatCount="indefinite"
        />
      )}
      {children}
    </g>
  );
}

function Sway({ deg, dur, cx, cy, ctx, children }: { deg: number; dur: number; cx: number; cy: number; ctx: Ctx; children: ReactNode }) {
  return (
    <g>
      {ctx.motion && (
        <animateTransform
          attributeName="transform"
          type="rotate"
          values={`${-deg} ${cx} ${cy};${deg} ${cx} ${cy};${-deg} ${cx} ${cy}`}
          keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
          calcMode="spline"
          dur={`${dur}s`}
          repeatCount="indefinite"
        />
      )}
      {children}
    </g>
  );
}

// ── West / Neon Pier ───────────────────────────────────────────────────────

function Wheel({ ctx }: { ctx: Ctx }) {
  const R = 116;
  const hy = -166;
  const frame = ctx.on ? "#525a70" : ctx.off.frame;
  const cars = [VX.pink, VX.cyan, VX.lilac, VX.yellow];
  return (
    <>
      <Shadow rx={104} ry={30} />
      <Glow cy={hy} r={R + 70} color="pink" ctx={ctx} />
      <line x1={-46} y1={-16} x2={0} y2={hy} stroke={frame} strokeWidth="8" />
      <line x1={46} y1={-22} x2={0} y2={hy} stroke={frame} strokeWidth="8" />
      <g transform={`translate(0 ${hy})`}>
        <Spin dur={40} ctx={ctx}>
          {Array.from({ length: 16 }, (_, k) => {
            const t = (k / 16) * Math.PI * 2;
            return <line key={k} x1={0} y1={0} x2={R * Math.cos(t)} y2={R * Math.sin(t)} stroke={frame} strokeWidth="3" />;
          })}
          <circle r={R - 24} fill="none" stroke={frame} strokeWidth="3" />
          <Neon d={`M ${R} 0 A ${R} ${R} 0 1 1 ${-R} 0 A ${R} ${R} 0 1 1 ${R} 0`} color={VX.pink} w={7} ctx={ctx} />
          <Neon d={`M ${R - 24} 0 A ${R - 24} ${R - 24} 0 1 1 ${-(R - 24)} 0 A ${R - 24} ${R - 24} 0 1 1 ${R - 24} 0`} color={VX.cyan} w={3} ctx={ctx} />
          {Array.from({ length: 32 }, (_, k) => {
            const t = (k / 32) * Math.PI * 2;
            return <Bulb key={`b${k}`} x={(R + 9) * Math.cos(t)} y={(R + 9) * Math.sin(t)} i={k} ctx={ctx} r={3.2} />;
          })}
          {Array.from({ length: 12 }, (_, k) => {
            const t = (k / 12) * Math.PI * 2;
            return (
              <circle
                key={`c${k}`}
                cx={R * Math.cos(t)}
                cy={R * Math.sin(t)}
                r="12"
                fill={ctx.on ? cars[k % 4] : ctx.off.light}
                stroke={VX.ink}
                strokeWidth="2.5"
              />
            );
          })}
        </Spin>
      </g>
      <line x1={-74} y1={4} x2={0} y2={hy} stroke={frame} strokeWidth="11" strokeLinecap="round" />
      <line x1={74} y1={-4} x2={0} y2={hy} stroke={frame} strokeWidth="11" strokeLinecap="round" />
      <line x1={-40} y1={-70} x2={40} y2={-74} stroke={frame} strokeWidth="5" />
      {/* The Vortexa Eye. */}
      <circle cy={hy} r="22" fill="#15131c" stroke={frame} strokeWidth="4" />
      {ctx.on && <circle cy={hy} r="30" fill={ctx.glow("cyan")} />}
      <circle cy={hy} r="12" fill={ctx.on ? VX.cyan : ctx.off.mid} />
      <circle cy={hy} r="5" fill={VX.ink} />
      <rect x={-96} y={-6} width={192} height={14} rx={5} fill={frame} />
      <Neon d="M -90 1 L 90 1" color={VX.lilac} w={3} ctx={ctx} />
    </>
  );
}

function Carousel({ ctx }: { ctx: Ctx }) {
  const R = 70;
  const ry = 24;
  const poles = Array.from({ length: 10 }, (_, k) => (k / 10) * Math.PI * 2 + 0.3);
  const pole = (t: number, k: number) => {
    const x = (R - 14) * Math.cos(t);
    const y = -12 + (ry - 5) * Math.sin(t);
    return (
      <g key={k}>
        <line x1={x} y1={y} x2={x} y2={-78} stroke={ctx.on ? "#ffd66b" : ctx.off.light} strokeWidth="3" />
        <g>
          {ctx.motion && (
            <animateTransform
              attributeName="transform"
              type="translate"
              values={`0 0;0 -12;0 0`}
              dur="1.6s"
              begin={`${(k % 4) * -0.4}s`}
              repeatCount="indefinite"
            />
          )}
          <ellipse cx={x} cy={y - 26} rx="10" ry="6" fill={ctx.on ? (k % 2 ? VX.cream : VX.lilac) : ctx.off.light} stroke={VX.ink} strokeWidth="1.5" />
        </g>
      </g>
    );
  };
  return (
    <>
      <Shadow rx={84} ry={28} />
      <Glow cy={-70} r={130} color="lilac" ctx={ctx} />
      <Drum rx={R} ry={ry} h={12} side={ctx.on ? "#7a2a8c" : ctx.off.dark} top={ctx.on ? "#2b1f3a" : ctx.off.frame} />
      {poles.filter((t) => Math.sin(t) < 0).map((t, k) => pole(t, k))}
      <rect x={-9} y={-80} width={18} height={68} fill={ctx.on ? "#c6a1ff" : ctx.off.mid} />
      {poles.filter((t) => Math.sin(t) >= 0).map((t, k) => pole(t, k + 5))}
      <Neon d={`M ${-R} -12 A ${R} ${ry} 0 0 0 ${R} -12`} color={VX.pink} w={4} ctx={ctx} />
      <Cone
        rx={R + 12}
        ry={28}
        base={-80}
        apex={-140}
        a={ctx.on ? VX.pink : ctx.off.light}
        b={ctx.on ? VX.cream : ctx.off.mid}
        scallop={ctx.on ? [VX.cream, VX.pink] : [ctx.off.mid, ctx.off.light]}
        bulbs={14}
        i0={4}
        ctx={ctx}
      />
      <line x1="0" y1="-140" x2="0" y2="-162" stroke={ctx.on ? "#ffd66b" : ctx.off.light} strokeWidth="3" />
      <path d="M 0 -162 L 20 -156 L 0 -150 Z" fill={ctx.on ? VX.cyan : ctx.off.light} />
    </>
  );
}

function Booths({ ctx }: { ctx: Ctx }) {
  const awning = [VX.pink, VX.cyan, VX.yellow];
  return (
    <>
      <Shadow rx={92} ry={34} />
      <Glow cy={-30} r={110} color="pink" ctx={ctx} />
      {[-1, 0, 1].map((k) => {
        const [ox, oy] = iso(0, k * 46);
        const A = 16;
        const B = 20;
        const h = 32;
        const c = awning[k + 1];
        return (
          <g key={k} transform={`translate(${ox} ${oy})`}>
            <IsoBox A={A} B={B} h={h} top={ctx.on ? "#3a2c48" : ctx.off.dark} left={ctx.on ? "#5a3f73" : ctx.off.frame} right={ctx.on ? VX.cream : ctx.off.mid} />
            {/* Counter opening on the front, lit inside. */}
            <polygon points={poly([iso(A, -B + 5, 8), iso(A, B - 5, 8), iso(A, B - 5, 24), iso(A, -B + 5, 24)])} fill={ctx.on ? "#ffe9a8" : ctx.off.dark} />
            {ctx.on &&
              [-10, 0, 10].map((b) => {
                const [x, y] = iso(A, b, 13);
                return <circle key={b} cx={x} cy={y} r="3.6" fill={k === 0 ? VX.yellow : c} stroke={VX.ink} strokeWidth="1" />;
              })}
            {/* Striped awning over the counter. */}
            {[0, 1, 2, 3].map((s) => {
              const b0 = -B + (s * 2 * B) / 4;
              const b1 = -B + ((s + 1) * 2 * B) / 4;
              return (
                <polygon
                  key={s}
                  points={poly([iso(A, b0, h + 4), iso(A, b1, h + 4), iso(A + 12, b1, h - 6), iso(A + 12, b0, h - 6)])}
                  fill={s % 2 ? (ctx.on ? VX.cream : ctx.off.light) : ctx.on ? c : ctx.off.mid}
                />
              );
            })}
            {[0, 1, 2, 3, 4].map((s) => {
              const [x, y] = iso(A + 12, -B + (s * 2 * B) / 4, h - 6);
              return <Bulb key={`b${s}`} x={x} y={y + 2} i={(k + 1) * 5 + s} ctx={ctx} r={3} />;
            })}
          </g>
        );
      })}
    </>
  );
}

function Spider({ ctx }: { ctx: Ctx }) {
  const arms = [0, 1, 2, 3].map((k) => (k / 4) * Math.PI * 2);
  return (
    <>
      <Shadow rx={80} ry={26} />
      <Glow cy={-60} r={115} color="pink" ctx={ctx} />
      <Drum rx={64} ry={22} h={8} side={ctx.on ? "#3c2a52" : ctx.off.dark} top={ctx.on ? "#251b33" : ctx.off.frame} />
      <rect x={-8} y={-84} width={16} height={78} fill={ctx.on ? "#525a70" : ctx.off.frame} />
      <g transform="translate(0 -80) scale(1 0.42)">
        <Spin dur={7} ctx={ctx}>
          {arms.map((t, k) => (
            <g key={k}>
              <Neon d={`M 0 0 L ${70 * Math.cos(t)} ${70 * Math.sin(t)}`} color={VX.pink} w={7} ctx={ctx} />
              <circle cx={78 * Math.cos(t)} cy={78 * Math.sin(t)} r="17" fill={ctx.on ? (k % 2 ? VX.lilac : VX.cyan) : ctx.off.light} stroke={VX.ink} strokeWidth="3" />
            </g>
          ))}
        </Spin>
      </g>
      <ellipse cy={-86} rx="14" ry="7" fill={ctx.on ? VX.pink : ctx.off.mid} />
      <Bulb x={0} y={-94} i={3} ctx={ctx} r={4} color={VX.cyan} />
    </>
  );
}

// ── Central / Starlight Midway ─────────────────────────────────────────────

function Teacups({ ctx }: { ctx: Ctx }) {
  const cups: [number, number, string][] = [
    [-36, -18, VX.pink],
    [36, -20, VX.yellow],
    [0, 4, VX.cyan],
  ];
  return (
    <>
      <Shadow rx={88} ry={30} />
      <Glow cy={-30} r={120} color="cyan" ctx={ctx} />
      <Drum rx={76} ry={26} h={10} side={ctx.on ? "#1b7fa6" : ctx.off.dark} top={ctx.on ? "#e9fbff" : ctx.off.frame} />
      <g transform="translate(0 -10) scale(1 0.34)">
        <Spin dur={10} ctx={ctx} reverse>
          <circle r="58" fill="none" stroke={ctx.on ? VX.cyan : ctx.off.mid} strokeWidth="9" strokeDasharray="22 14" />
          <circle r="30" fill="none" stroke={ctx.on ? "#ffd23f" : ctx.off.mid} strokeWidth="7" strokeDasharray="12 10" />
        </Spin>
      </g>
      {frontArc(76, 26, 0, 12).map(([x, y], k) => (
        <Bulb key={k} x={x} y={y - 4} i={k} ctx={ctx} r={3} />
      ))}
      {cups.map(([x, y, c], k) => (
        <g key={k} transform={`translate(${x} ${y - 10})`}>
          <Sway deg={9} dur={2.2 + k * 0.4} cx={0} cy={0} ctx={ctx}>
            <ellipse rx="22" ry="7" fill={ctx.on ? "#ffffff" : ctx.off.light} />
            <path d="M -18 -22 A 18 6 0 0 0 18 -22 C 18 -6 10 -1 0 -1 C -10 -1 -18 -6 -18 -22 Z" fill={ctx.on ? c : ctx.off.mid} stroke={VX.ink} strokeWidth="1.5" />
            <ellipse cy="-22" rx="18" ry="6" fill={ctx.on ? "#ffffff" : ctx.off.light} stroke={VX.ink} strokeWidth="1.5" />
            <path d="M 17 -18 C 28 -18 28 -8 15 -8" fill="none" stroke={ctx.on ? c : ctx.off.mid} strokeWidth="4" />
            {ctx.on && <circle cx="-6" cy="-12" r="2.6" fill="#fff" />}
            {ctx.on && <circle cx="5" cy="-9" r="2.6" fill="#fff" />}
          </Sway>
        </g>
      ))}
    </>
  );
}

function Bumper({ ctx }: { ctx: Ctx }) {
  const A = 54;
  const B = 44;
  const H = 62;
  const floor = poly([iso(-A, -B), iso(A, -B), iso(A, B), iso(-A, B)]);
  const cars: [number, number, string, number][] = [
    [-20, -14, VX.pink, 2.6],
    [18, -6, VX.yellow, 3.1],
    [-6, 20, VX.cyan, 2.2],
    [26, 22, "#ff6b3d", 3.6],
  ];
  return (
    <>
      <Shadow rx={92} ry={44} />
      <Glow cy={-40} r={130} color="cyan" ctx={ctx} />
      <polygon points={floor} fill={ctx.on ? "#1d2c44" : ctx.off.dark} />
      {[iso(-A, -B), iso(A, -B), iso(-A, B)].map(([x, y], k) => (
        <line key={k} x1={x} y1={y} x2={x} y2={y - H} stroke={ctx.on ? "#ffffff" : ctx.off.light} strokeWidth="5" />
      ))}
      {cars.map(([a, b, c, dur], k) => {
        const [x, y] = iso(a, b);
        const [dx, dy] = iso(k % 2 ? 22 : -18, k % 2 ? -16 : 20);
        return (
          <g key={k}>
            {ctx.motion && (
              <animateTransform attributeName="transform" type="translate" values={`0 0;${dx} ${dy};0 0`} dur={`${dur}s`} repeatCount="indefinite" />
            )}
            <ellipse cx={x} cy={y} rx="11" ry="7" fill={ctx.on ? c : ctx.off.light} stroke={VX.ink} strokeWidth="1.5" />
            <line x1={x} y1={y - 2} x2={x} y2={y - H + 6} stroke={ctx.on ? "#9be7ff" : ctx.off.mid} strokeWidth="1" opacity="0.7" />
          </g>
        );
      })}
      {(() => {
        const [x, y] = iso(A, B);
        return <line x1={x} y1={y} x2={x} y2={y - H} stroke={ctx.on ? "#ffffff" : ctx.off.light} strokeWidth="5" />;
      })()}
      {/* Roof with a striped edge and a neon trim. */}
      <IsoBox A={A + 6} B={B + 6} h={12} z={H} top={ctx.on ? "#e9fbff" : ctx.off.mid} left={ctx.on ? VX.cyan : ctx.off.frame} right={ctx.on ? "#ffd23f" : ctx.off.frame} />
      <Neon d={`M ${iso(-A - 6, B + 6, H)} L ${iso(A + 6, B + 6, H)} L ${iso(A + 6, -B - 6, H)}`} color={VX.cyan} w={3.5} ctx={ctx} />
      {Array.from({ length: 9 }, (_, k) => {
        const [x, y] = iso(-A - 6 + (k * (2 * A + 12)) / 8, B + 6, H + 6);
        return <Bulb key={`l${k}`} x={x} y={y} i={k} ctx={ctx} r={3} />;
      })}
      {Array.from({ length: 8 }, (_, k) => {
        const [x, y] = iso(A + 6, B + 6 - ((k + 1) * (2 * B + 12)) / 8, H + 6);
        return <Bulb key={`r${k}`} x={x} y={y} i={k + 9} ctx={ctx} r={3} />;
      })}
    </>
  );
}

function Swings({ ctx }: { ctx: Ctx }) {
  const seats = Array.from({ length: 12 }, (_, k) => (k / 12) * Math.PI * 2);
  const out = ctx.on ? 92 : 54;
  const drop = ctx.on ? -100 : -84;
  const chain = (t: number, k: number) => {
    const top: Pt = [56 * Math.cos(t), -146 + 17 * Math.sin(t)];
    const seat: Pt = [out * Math.cos(t), drop + (ctx.on ? 28 : 17) * Math.sin(t)];
    return (
      <g key={k}>
        <line x1={top[0]} y1={top[1]} x2={seat[0]} y2={seat[1]} stroke={ctx.on ? "#d9f7ff" : ctx.off.light} strokeWidth="1.6" />
        <rect x={seat[0] - 6} y={seat[1] - 2} width="12" height="7" rx="2" fill={ctx.on ? [VX.pink, VX.yellow, VX.cyan][k % 3] : ctx.off.light} />
      </g>
    );
  };
  return (
    <>
      <Shadow rx={74} ry={24} />
      <Glow cy={-130} r={130} color="cyan" ctx={ctx} />
      <Drum rx={46} ry={15} h={8} side={ctx.on ? "#1b7fa6" : ctx.off.dark} top={ctx.on ? "#e9fbff" : ctx.off.frame} />
      <Sway deg={3} dur={3.4} cx={0} cy={-150} ctx={ctx}>
        {seats.filter((t) => Math.sin(t) < 0).map((t, k) => chain(t, k))}
      </Sway>
      <rect x={-7} y={-150} width={14} height={144} fill={ctx.on ? "#ffffff" : ctx.off.mid} />
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <rect key={k} x={-7} y={-140 + k * 24} width={14} height={10} fill={ctx.on ? VX.red : ctx.off.frame} />
      ))}
      <Sway deg={3} dur={3.4} cx={0} cy={-150} ctx={ctx}>
        {seats.filter((t) => Math.sin(t) >= 0).map((t, k) => chain(t, k + 6))}
        <Cone
          rx={60}
          ry={18}
          base={-146}
          apex={-186}
          a={ctx.on ? VX.cyan : ctx.off.light}
          b={ctx.on ? "#ffd23f" : ctx.off.mid}
          scallop={ctx.on ? ["#ffd23f", VX.cyan] : [ctx.off.mid, ctx.off.light]}
          bulbs={10}
          ctx={ctx}
        />
      </Sway>
    </>
  );
}

function DropTower({ ctx }: { ctx: Ctx }) {
  const H = 320;
  const frame = ctx.on ? "#33415c" : ctx.off.frame;
  return (
    <>
      <Shadow rx={52} ry={18} />
      <Glow cy={-170} r={150} color="cyan" ctx={ctx} />
      <IsoBox A={26} B={26} h={12} top={ctx.on ? "#e9fbff" : ctx.off.mid} left={ctx.on ? "#1b7fa6" : ctx.off.dark} right={ctx.on ? "#26a3cf" : ctx.off.frame} />
      <rect x={-11} y={-H} width={22} height={H - 10} fill={frame} />
      <path
        d={Array.from({ length: 14 }, (_, k) => `M -11 ${-12 - k * 22} L 11 ${-34 - k * 22}`).join(" ")}
        stroke={ctx.on ? "#5f7ba8" : ctx.off.mid}
        strokeWidth="2"
      />
      {Array.from({ length: 14 }, (_, k) => (
        <Bulb key={k} x={k % 2 ? 13 : -13} y={-24 - k * 21} i={k * 2} ctx={ctx} r={3} color={k % 2 ? VX.cyan : "#fff6c2"} />
      ))}
      <rect x={-20} y={-H - 18} width={40} height={20} rx={4} fill={ctx.on ? "#ffd23f" : ctx.off.mid} />
      <circle cy={-H - 28} r="7" fill={ctx.on ? "#ff3b3b" : "#7a2a2a"} className={ctx.on ? "ff-beacon" : undefined} />
      <g>
        {ctx.motion && (
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0;0 -238;0 -238;0 0;0 0"
            keyTimes="0;0.5;0.6;0.68;1"
            dur="7s"
            repeatCount="indefinite"
          />
        )}
        <ellipse cy={-40} rx="34" ry="11" fill={ctx.on ? VX.cyan : ctx.off.light} stroke={VX.ink} strokeWidth="2" />
        <rect x={-34} y={-52} width={68} height={12} fill={ctx.on ? "#ffd23f" : ctx.off.mid} />
        <ellipse cy={-52} rx="34" ry="11" fill={ctx.on ? "#ffe680" : ctx.off.light} stroke={VX.ink} strokeWidth="1.5" />
      </g>
    </>
  );
}

// ── East / Big Top ─────────────────────────────────────────────────────────

function Arcade({ ctx }: { ctx: Ctx }) {
  const A = 34;
  const B = 44;
  const H = 56;
  return (
    <>
      <Shadow rx={78} ry={36} />
      <Glow cy={-60} r={120} color="yellow" ctx={ctx} />
      <IsoBox A={A} B={B} h={H} top={ctx.on ? "#4d2a73" : ctx.off.mid} left={ctx.on ? "#3b1f5c" : ctx.off.dark} right={ctx.on ? "#2c1647" : ctx.off.frame} />
      {/* Doors and windows on the left face, glowing. */}
      <g transform={`translate(${iso(-A, B)[0]} ${iso(-A, B)[1]}) ${ALONG_X}`}>
        <rect x={50} y={-30} width={18} height={30} fill={ctx.on ? VX.pink : ctx.off.dark} />
        <rect x={12} y={-40} width={26} height={16} fill={ctx.on ? "#ffe9a8" : ctx.off.dark} />
      </g>
      {/* Marquee sign on the roof. */}
      <g transform={`translate(${iso(-A + 6, B, H)[0]} ${iso(-A + 6, B, H)[1]}) ${ALONG_X}`}>
        <rect x={-2} y={-30} width={64} height={28} rx={4} fill={VX.ink} stroke={ctx.on ? VX.yellow : ctx.off.mid} strokeWidth="3" />
        <text x={30} y={-11} textAnchor="middle" fontSize="15" fontWeight="900" letterSpacing="1" fill={ctx.on ? VX.yellow : ctx.off.light} className={ctx.on ? "ff-neon" : undefined}>
          ARCADE
        </text>
      </g>
      {Array.from({ length: 8 }, (_, k) => {
        const [x, y] = iso(-A + (k * 2 * A) / 7, B, H + 2);
        return <Bulb key={k} x={x} y={y} i={k} ctx={ctx} r={3} />;
      })}
    </>
  );
}

function Haunted({ ctx }: { ctx: Ctx }) {
  const A = 30;
  const B = 36;
  const H = 44;
  const ridge = H + 34;
  const win = ctx.on ? "#7cff6b" : ctx.off.dark;
  return (
    <>
      <Shadow rx={72} ry={34} />
      {ctx.on && <circle cy={-60} r={110} fill={ctx.glow("lilac")} className="ff-halo" />}
      {/* Tower at the back corner. */}
      <g transform={`translate(${iso(-A + 10, -B + 10)[0]} ${iso(-A + 10, -B + 10)[1]})`}>
        <IsoBox A={12} B={12} h={H + 40} top="#1d1826" left={ctx.on ? "#3d3350" : ctx.off.dark} right={ctx.on ? "#2e2640" : ctx.off.frame} />
        <polygon points={poly([iso(-14, 14, H + 40), iso(14, 14, H + 40), iso(14, -14, H + 40), [0, -(H + 86)]])} fill="#14111b" />
        <rect x={-4} y={-(H + 30)} width={8} height={12} fill={ctx.on ? VX.lilac : ctx.off.dark} />
      </g>
      <IsoBox A={A} B={B} h={H} top="#1d1826" left={ctx.on ? "#4a3d60" : ctx.off.dark} right={ctx.on ? "#382e4b" : ctx.off.frame} />
      <polygon points={poly([iso(A, -B, H), iso(A, B, H), iso(0, B, ridge), iso(0, -B, ridge)])} fill={ctx.on ? "#231d2f" : "#2b2832"} />
      <polygon points={poly([iso(-A, B, H), iso(A, B, H), iso(0, B, ridge)])} fill={ctx.on ? "#2e2640" : ctx.off.frame} />
      <g transform={`translate(${iso(-A, B)[0]} ${iso(-A, B)[1]}) ${ALONG_X}`}>
        <rect x={10} y={-34} width={12} height={14} fill={win} />
        <rect x={40} y={-34} width={12} height={14} fill={win} />
        <path d="M 26 0 L 26 -16 A 6 6 0 0 1 38 -16 L 38 0 Z" fill={ctx.on ? "#ff3b6b" : ctx.off.dark} />
      </g>
      <g transform={`translate(${iso(A, B)[0]} ${iso(A, B)[1]}) ${ALONG_NEG_Z}`}>
        <rect x={14} y={-34} width={12} height={14} fill={win} />
        <rect x={44} y={-34} width={12} height={14} fill={win} />
      </g>
      {ctx.on && (
        <g opacity="0.92">
          {ctx.motion && (
            <animateTransform attributeName="transform" type="translate" values="0 0;10 -14;0 0" dur="3.2s" repeatCount="indefinite" />
          )}
          <path d="M 40 -112 C 40 -132 64 -132 64 -112 L 64 -94 L 58 -100 L 52 -94 L 46 -100 L 40 -94 Z" fill="#f4f1ff" />
          <circle cx="48" cy="-114" r="2.4" fill={VX.ink} />
          <circle cx="56" cy="-114" r="2.4" fill={VX.ink} />
        </g>
      )}
    </>
  );
}

function Ship({ ctx }: { ctx: Ctx }) {
  const py = -124;
  const frame = ctx.on ? "#7a4b2a" : ctx.off.frame;
  return (
    <>
      <Shadow rx={96} ry={30} />
      <Glow cy={-70} r={130} color="orange" ctx={ctx} />
      <line x1={-40} y1={-16} x2={0} y2={py} stroke={frame} strokeWidth="8" />
      <line x1={40} y1={-22} x2={0} y2={py} stroke={frame} strokeWidth="8" />
      <Sway deg={ctx.on ? 30 : 0} dur={4.6} cx={0} cy={py} ctx={ctx}>
        <line x1={0} y1={py} x2={-34} y2={-48} stroke={ctx.on ? "#cfd3da" : ctx.off.light} strokeWidth="4" />
        <line x1={0} y1={py} x2={34} y2={-48} stroke={ctx.on ? "#cfd3da" : ctx.off.light} strokeWidth="4" />
        <line x1={0} y1={-46} x2={0} y2={-104} stroke={ctx.on ? "#5b3a22" : ctx.off.mid} strokeWidth="4" />
        <path d="M 2 -102 Q 34 -84 2 -60 Z" fill={ctx.on ? VX.cream : ctx.off.light} />
        <path d="M 0 -104 L -18 -98 L 0 -92 Z" fill={ctx.on ? VX.red : ctx.off.mid} />
        <path d="M -80 -64 Q -62 -44 0 -44 Q 62 -44 80 -64 L 66 -32 Q 0 -6 -66 -32 Z" fill={ctx.on ? "#9a2f1f" : ctx.off.mid} stroke={VX.ink} strokeWidth="2" />
        <path d="M -72 -46 Q 0 -20 72 -46" fill="none" stroke={ctx.on ? "#ffd23f" : ctx.off.light} strokeWidth="4" />
        {Array.from({ length: 11 }, (_, k) => {
          const t = k / 10;
          const x = -66 + t * 132;
          const y = -32 + 26 * Math.sin(Math.PI * t) * 0.9 - 2;
          return <Bulb key={k} x={x} y={y} i={k} ctx={ctx} r={3} />;
        })}
      </Sway>
      <line x1={-64} y1={4} x2={0} y2={py} stroke={frame} strokeWidth="10" strokeLinecap="round" />
      <line x1={64} y1={-4} x2={0} y2={py} stroke={frame} strokeWidth="10" strokeLinecap="round" />
      <circle cy={py} r="7" fill={ctx.on ? "#ffd23f" : ctx.off.mid} />
    </>
  );
}

function BigTop({ ctx, beams, beamId }: { ctx: Ctx; beams: boolean; beamId: string }) {
  const rx = 112;
  const ry = 38;
  const wall = 46;
  const apex = -206;
  const stripes = frontArc(rx, ry, 0, 14);
  return (
    <>
      <Shadow rx={128} ry={44} />
      {beams && ctx.on && (
        <g opacity="0.55">
          {[-1, 1].map((s) => (
            <g key={s}>
              {ctx.motion && (
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values={`${s * 18} 0 -60;${s * -14} 0 -60;${s * 18} 0 -60`}
                  dur={`${7 + s}s`}
                  repeatCount="indefinite"
                />
              )}
              <polygon points={`${s * 30},-60 ${s * 120},-560 ${s * 250},-540`} fill={`url(#${beamId})`} />
            </g>
          ))}
        </g>
      )}
      <Glow cy={-110} r={190} color="yellow" ctx={ctx} />
      {/* Striped wall, front half. */}
      {stripes.slice(0, -1).map((p, k) => {
        const q = stripes[k + 1];
        return (
          <polygon
            key={k}
            points={poly([p, q, [q[0], q[1] - wall], [p[0], p[1] - wall]])}
            fill={k % 2 ? (ctx.on ? VX.cream : ctx.off.light) : ctx.on ? VX.red : ctx.off.mid}
          />
        );
      })}
      {/* Doorway, lit inside. */}
      <path d={`M 4 ${ry - 1} L 4 ${ry - 34} Q 22 ${ry - 50} 40 ${ry - 34} L 40 ${ry - 6} Z`} fill={ctx.on ? "#ffcf5c" : ctx.off.dark} />
      <Cone
        rx={rx + 8}
        ry={ry + 2}
        base={-wall}
        apex={apex}
        a={ctx.on ? VX.red : ctx.off.mid}
        b={ctx.on ? VX.cream : ctx.off.light}
        scallop={ctx.on ? ["#ffd23f", VX.red] : [ctx.off.light, ctx.off.mid]}
        bulbs={18}
        ctx={ctx}
      />
      {/* Bulb strings from the top to the ground stakes. */}
      {[
        [-150, 26],
        [-70, 70],
        [76, 66],
        [154, 20],
      ].map(([sx, sy], k) => {
        const mxp = sx * 0.55;
        const myp = (apex + sy) / 2 + 40;
        const d = `M 0 ${apex + 4} Q ${mxp} ${myp} ${sx} ${sy}`;
        return (
          <g key={k}>
            <path d={d} fill="none" stroke={ctx.on ? "#3a2a1a" : ctx.off.frame} strokeWidth="1.6" />
            {Array.from({ length: 9 }, (_, j) => {
              const t = (j + 1) / 10;
              const x = 2 * (1 - t) * t * mxp + t * t * sx;
              const y = (1 - t) * (1 - t) * (apex + 4) + 2 * (1 - t) * t * myp + t * t * sy;
              return <Bulb key={j} x={x} y={y} i={20 + k * 9 + j} ctx={ctx} r={3} color={j % 2 ? "#ffd23f" : "#fff6c2"} />;
            })}
          </g>
        );
      })}
      <line x1={0} y1={apex} x2={0} y2={apex - 34} stroke={ctx.on ? "#ffd23f" : ctx.off.light} strokeWidth="4" />
      <g>
        {ctx.motion && (
          <animateTransform attributeName="transform" type="skewY" values="0;-8;0" dur="1.4s" repeatCount="indefinite" additive="sum" />
        )}
        <path d={`M 0 ${apex - 34} L 30 ${apex - 26} L 0 ${apex - 18} Z`} fill={ctx.on ? VX.yellow : ctx.off.mid} />
      </g>
    </>
  );
}

/** The coaster: a station at D4 and a circuit with a vertical loop over D5. Drawn in map units, not local. */
function Coaster({ station, loop, ctx }: { station: Pt; loop: Pt; ctx: Ctx }) {
  const ux = loop[0] - station[0];
  const uy = loop[1] - station[1];
  const len = Math.hypot(ux, uy);
  const u: Pt = [ux / len, uy / len];
  const v: Pt = [-u[1], u[0]];
  const c: Pt = [(station[0] + loop[0]) / 2, (station[1] + loop[1]) / 2];
  const half = len / 2 + 70;
  const N = 72;
  const ground = (t: number): Pt => [c[0] + u[0] * half * Math.cos(t) + v[0] * 58 * Math.sin(t), c[1] + u[1] * half * Math.cos(t) + v[1] * 58 * Math.sin(t)];
  const height = (t: number) => 30 + 92 * Math.pow(0.5 - 0.5 * Math.cos(t - Math.PI), 2.4) + 16 * Math.sin(3 * t);
  const loopR = 40;
  // From the loop end (t = 0) round the circuit; the loop is flown at t = 0.
  const rail: Pt[] = [];
  for (let k = 0; k <= N; k++) {
    const t = (k / N) * Math.PI * 2;
    const g = ground(t);
    rail.push([g[0], g[1] - height(t)]);
  }
  const [lx, ly] = rail[0];
  const d =
    `M ${lx} ${ly} A ${loopR} ${loopR} 0 0 1 ${lx} ${ly - 2 * loopR} A ${loopR} ${loopR} 0 0 1 ${lx} ${ly} ` +
    rail
      .slice(1)
      .map(([x, y]) => `L ${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(" ");
  const supports = rail.filter((_, k) => k % 4 === 0).map((p, k) => ({ p, g: ground((k * 4 * Math.PI * 2) / N) }));
  const rails = ctx.on ? VX.yellow : ctx.off.light;
  const sx = station[0];
  const sy = station[1];
  return (
    <g>
      {ctx.on && <ellipse cx={c[0]} cy={c[1] - 60} rx={half + 60} ry={130} fill={ctx.glow("yellow")} className="ff-halo" opacity={ctx.night ? 0.9 : 0.6} />}
      {supports.map(({ p, g }, k) => (
        <line key={k} x1={g[0]} y1={g[1]} x2={p[0]} y2={p[1]} stroke={ctx.on ? "#c9b9a6" : ctx.off.mid} strokeWidth="3" />
      ))}
      <line x1={lx - 30} y1={ly + height(0) + 6} x2={lx} y2={ly - loopR} stroke={ctx.on ? "#c9b9a6" : ctx.off.mid} strokeWidth="4" />
      <line x1={lx + 30} y1={ly + height(0) - 6} x2={lx} y2={ly - loopR} stroke={ctx.on ? "#c9b9a6" : ctx.off.mid} strokeWidth="4" />
      <path d={d} fill="none" stroke={ctx.on ? "#7a1f2b" : ctx.off.dark} strokeWidth="10" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={rails} strokeWidth="3.5" strokeLinejoin="round" className={ctx.on ? "ff-neon" : undefined} />
      {rail.filter((_, k) => k % 3 === 1).map(([x, y], k) => (
        <Bulb key={k} x={x} y={y - 7} i={k} ctx={ctx} r={3} color={k % 2 ? VX.pink : "#fff6c2"} />
      ))}
      {/* Station at D4. */}
      <g transform={`translate(${sx} ${sy})`}>
        <Shadow rx={44} ry={20} />
        <IsoBox A={18} B={30} h={26} top={ctx.on ? VX.cream : ctx.off.mid} left={ctx.on ? VX.red : ctx.off.frame} right={ctx.on ? "#b81d33" : ctx.off.dark} />
        {[0, 1, 2, 3, 4, 5].map((k) => {
          const [x, y] = iso(-18 + (k * 36) / 5, 30, 28);
          return <Bulb key={k} x={x} y={y} i={k} ctx={ctx} r={3} />;
        })}
        <g transform={`translate(${iso(-18, 30, 26)[0]} ${iso(-18, 30, 26)[1]}) ${ALONG_X}`}>
          <text x={18} y={-6} textAnchor="middle" fontSize="11" fontWeight="900" fill={ctx.on ? VX.yellow : ctx.off.light}>
            VORTEX
          </text>
        </g>
      </g>
      {/* The train: three cars, running the circuit when on, waiting at the loop when off. */}
      {[0, 1, 2].map((k) => (
        <g key={k} transform={ctx.motion ? undefined : `translate(${rail[3 + k * 2][0]} ${rail[3 + k * 2][1]})`}>
          {ctx.motion && (
            <animateMotion dur="9s" repeatCount="indefinite" rotate="auto" path={d} begin={`${-k * 0.16}s`} />
          )}
          <rect x="-11" y="-12" width="22" height="10" rx="3" fill={ctx.on ? (k === 0 ? VX.pink : VX.red) : ctx.off.light} stroke={VX.ink} strokeWidth="1.5" />
        </g>
      ))}
    </g>
  );
}

// ── Shared ─────────────────────────────────────────────────────────────────

function Gate({ ctx }: { ctx: Ctx }) {
  const L = iso(0, 54);
  const R = iso(0, -54);
  const h = 92;
  return (
    <>
      <Shadow rx={70} ry={26} />
      <Glow cy={-80} r={120} color="cyan" ctx={ctx} />
      {[R, L].map(([x, y], k) => (
        <g key={k} transform={`translate(${x} ${y})`}>
          <IsoBox A={8} B={8} h={h} top={ctx.on ? VX.pink : ctx.off.mid} left={ctx.on ? "#2a2240" : ctx.off.dark} right={ctx.on ? "#1d1830" : ctx.off.frame} />
          <Neon d={`M ${iso(8, 8)[0]} ${iso(8, 8)[1] - 4} L ${iso(8, 8)[0]} ${iso(8, 8)[1] - h + 4}`} color={VX.cyan} w={3} ctx={ctx} />
        </g>
      ))}
      <g transform={`translate(${L[0]} ${L[1] - h - 4}) ${ALONG_NEG_Z}`}>
        <rect x={-6} y={-34} width={136} height={34} rx={6} fill={VX.ink} stroke={ctx.on ? VX.pink : ctx.off.mid} strokeWidth="3" />
        <text x={62} y={-10} textAnchor="middle" fontSize="22" fontWeight="900" letterSpacing="3" fill={ctx.on ? VX.cyan : ctx.off.light} className={ctx.on ? "ff-neon" : undefined}>
          VORTEXA
        </text>
      </g>
    </>
  );
}

/** A zone's power box: a red standby light while off, sparks and a green light once on. */
function PowerBox({ ctx }: { ctx: Ctx }) {
  return (
    <>
      <IsoBox A={9} B={12} h={20} top={ctx.off.light} left={ctx.off.mid} right={ctx.off.frame} />
      <circle cx={iso(9, 0, 13)[0]} cy={iso(9, 0, 13)[1]} r="3.6" fill={ctx.on ? "#4ade80" : "#ff3b3b"} className={ctx.on ? undefined : "ff-standby"} />
      {ctx.on && <path d="M -4 -30 L 2 -38 L -1 -38 L 4 -46" fill="none" stroke={VX.yellow} strokeWidth="2.4" className="ff-spark" />}
    </>
  );
}

/** Bulb strings between neighbouring rides of a zone. */
const FESTOONS: [number, number][] = [
  [0, 1],
  [1, 2],
  [0, 4],
  [3, 4],
  [5, 6],
  [5, 7],
  [7, 8],
  [6, 8],
  [9, 11],
  [9, 10],
  [11, 14],
  [10, 14],
];

function Festoon({ a, b, ctx, i0 }: { a: RideSpot; b: RideSpot; ctx: Ctx; i0: number }) {
  const ax = mx(a.x);
  const ay = my(a.y) - 54;
  const bx = mx(b.x);
  const by = my(b.y) - 54;
  const cx = (ax + bx) / 2;
  const cy = (ay + by) / 2 + 34;
  const n = Math.max(4, Math.round(Math.hypot(bx - ax, by - ay) / 26));
  return (
    <g>
      <path d={`M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`} fill="none" stroke={ctx.on ? "#2a2030" : ctx.off.frame} strokeWidth="1.6" opacity="0.8" />
      {Array.from({ length: n - 1 }, (_, j) => {
        const t = (j + 1) / n;
        const x = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cx + t * t * bx;
        const y = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cy + t * t * by;
        const colors = [VX.pink, VX.yellow, VX.cyan, "#fff6c2"];
        return <Bulb key={j} x={x} y={y} i={i0 + j} ctx={ctx} r={3.2} color={colors[j % 4]} />;
      })}
    </g>
  );
}

function rideArt(ride: Ride2D, ctx: Ctx, beams: boolean, id: string): ReactNode {
  switch (ride) {
    case "wheel":
      return <Wheel ctx={ctx} />;
    case "carousel":
      return <Carousel ctx={ctx} />;
    case "booths":
      return <Booths ctx={ctx} />;
    case "spider":
      return <Spider ctx={ctx} />;
    case "teacups":
      return <Teacups ctx={ctx} />;
    case "bumper":
      return <Bumper ctx={ctx} />;
    case "swings":
      return <Swings ctx={ctx} />;
    case "drop":
      return <DropTower ctx={ctx} />;
    case "arcade":
      return <Arcade ctx={ctx} />;
    case "haunted":
      return <Haunted ctx={ctx} />;
    case "ship":
      return <Ship ctx={ctx} />;
    case "bigtop":
      return <BigTop ctx={ctx} beams={beams} beamId={`${id}-beam`} />;
    default:
      return null;
  }
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(q.matches);
    update();
    q.addEventListener("change", update);
    return () => q.removeEventListener("change", update);
  }, []);
  return reduced;
}

const GLOWS = { pink: VX.pink, cyan: VX.cyan, yellow: "#ffd23f", orange: VX.orange, lilac: VX.lilac } as const;

// ── The ground: lawn, walks, plazas, trees ─────────────────────────────────

/** Squeezed world → map units. */
const wpt = (w: World): Pt => {
  const a = worldToArt(w);
  return [mx(a.x), my(a.y)];
};
const wpoly = (list: World[]) => poly(list.map(wpt));
/** A circle on the field (world units), as the ellipse it makes on the art. */
const wcircle = ([cx, cz]: World, r: number, n = 32) =>
  wpoly(Array.from({ length: n }, (_, k) => [cx + r * Math.cos((k / n) * Math.PI * 2), cz + r * Math.sin((k / n) * Math.PI * 2)] as World));
/** A circle's outline as a closed path, for neon rings. */
const wring = (c: World, r: number) => {
  const pts = Array.from({ length: 33 }, (_, k) => wpt([c[0] + r * Math.cos((k / 32) * Math.PI * 2), c[1] + r * Math.sin((k / 32) * Math.PI * 2)]));
  return `M ${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L ")} Z`;
};
function segment(a: World, b: World, hw: number) {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n: World = [(-(b[1] - a[1]) / l) * hw, ((b[0] - a[0]) / l) * hw];
  return wpoly([
    [a[0] + n[0], a[1] + n[1]],
    [b[0] + n[0], b[1] + n[1]],
    [b[0] - n[0], b[1] - n[1]],
    [a[0] - n[0], a[1] - n[1]],
  ]);
}

/** Paving and its kerb (the art's beige and a warm edge), and the art's lawn and trees. */
const GROUND = { lawn: "#979a4e", lawnLight: "#a6a95a", lawnDark: "#868a42", pave: "#efdfce", kerb: "#d6b393", tree: "#016837", treeLight: "#12804a", trunk: "#7a4a1e" };

/** Each ride's round plaza (world units); the coaster has none, its station sits on the lawn. */
const PLAZA: Partial<Record<Ride2D, number>> = {
  wheel: 6.2,
  carousel: 4.6,
  booths: 4.4,
  spider: 4.2,
  teacups: 4.8,
  bumper: 5.3,
  swings: 4.6,
  drop: 3.4,
  arcade: 4.2,
  haunted: 4.2,
  ship: 4.8,
  bigtop: 6.4,
};

/** Trees in the art's style along the road and the park, framing the fair. */
const TREES: World[] = [
  ...Array.from({ length: 30 }, (_, k) => [45.7, -41.3 + k * 2.6] as World),
  ...Array.from({ length: 8 }, (_, k) => [22.6 + k * 2.9, -41.6] as World),
  // Along the park, leaving the gate clear.
  ...Array.from({ length: 19 }, (_, k) => [21.7, -38.5 + k * 2.85] as World).filter(([, z]) => Math.abs(z - GATE_AT[1]) > 3.4),
];

/** Flower beds on the open lawn by the park. */
const BEDS: { at: World; r: number; colors: string[] }[] = [
  { at: [25.4, -36.8], r: 1.6, colors: [VX.pink, VX.lilac] },
  { at: [25.0, -15.5], r: 1.5, colors: [VX.yellow, VX.cream] },
  { at: [24.8, 3.2], r: 1.5, colors: [VX.cyan, VX.cream] },
  { at: [39.4, 30.5], r: 1.7, colors: [VX.yellow, VX.red] },
];

function Tree({ at }: { at: World }) {
  const [x, y] = wpt(at);
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cy="1" rx="13" ry="5" fill="#000" opacity="0.18" />
      <rect x="-3.5" y="-16" width="7" height="17" fill={GROUND.trunk} />
      <circle cx="-8" cy="-22" r="10" fill={GROUND.tree} />
      <circle cx="8" cy="-22" r="10" fill={GROUND.tree} />
      <circle cy="-34" r="11" fill={GROUND.tree} />
      <circle cx="-3" cy="-38" r="4" fill={GROUND.treeLight} />
    </g>
  );
}

/**
 * The fair's ground, drawn under the dark of night: the lawn over the art's brown field, the walks and plazas,
 * flower beds and trees.
 */
export function FunfairGround({ id }: { id: string }) {
  const plazas = RIDES_2D.filter((r) => PLAZA[r.ride]);
  return (
    <g aria-hidden="true">
      <defs>
        <pattern id={`${id}-lawn`} width="46" height="28" patternUnits="userSpaceOnUse">
          <rect width="46" height="28" fill={GROUND.lawn} />
          <ellipse cx="9" cy="7" rx="5" ry="2" fill={GROUND.lawnLight} />
          <ellipse cx="33" cy="20" rx="6" ry="2.2" fill={GROUND.lawnDark} opacity="0.7" />
          <ellipse cx="38" cy="5" rx="2.5" ry="1" fill={GROUND.lawnLight} />
        </pattern>
      </defs>
      <polygon points={wpoly(FIELD)} fill={`url(#${id}-lawn)`} stroke={GROUND.lawn} strokeWidth="10" strokeLinejoin="round" />
      {/* Walks: kerb, then paving; round joints where they meet. */}
      {[GROUND.kerb, GROUND.pave].map((fill, layer) => (
        <g key={fill} fill={fill}>
          {WALKS.flatMap((w, k) =>
            w.pts.slice(1).map((b, j) => <polygon key={`${k}-${j}`} points={segment(w.pts[j], b, w.hw + (layer ? 0 : 0.3))} />),
          )}
          {WALKS.flatMap((w, k) => w.pts.map((p, j) => <polygon key={`j${k}-${j}`} points={wcircle(p, w.hw + (layer ? 0 : 0.3), 16)} />))}
          <polygon points={wcircle(HUBS.east, RING_R + 1.3 + (layer ? 0 : 0.3))} />
          {plazas.map((r) => (
            <polygon key={r.tag} points={wcircle(r.at, PLAZA[r.ride]! + (layer ? 0 : 0.35))} />
          ))}
          <polygon points={wcircle(HUBS.central, 3.6 + (layer ? 0 : 0.35))} />
          <polygon points={wcircle(HUBS.west, 2.7 + (layer ? 0 : 0.35))} />
        </g>
      ))}
      {/* The lawn inside the Big Top's ring walk, with its own plaza at the tent. */}
      <polygon points={wcircle(HUBS.east, RING_R - 1.3)} fill={`url(#${id}-lawn)`} stroke={GROUND.kerb} strokeWidth="5" />
      <polygon points={wcircle(HUBS.east, PLAZA.bigtop!)} fill={GROUND.pave} stroke={GROUND.kerb} strokeWidth="5" />
      {/* Inlay rings on each plaza, in its zone's colour. */}
      {plazas.map((r) => (
        <path key={r.tag} d={wring(r.at, PLAZA[r.ride]! - 0.8)} fill="none" stroke={ZONE_COLOR[r.zone]} strokeOpacity="0.35" strokeWidth="4" />
      ))}
      {/* Central hub: a fountain with a star inlay. */}
      {Array.from({ length: 8 }, (_, k) => {
        const t = (k / 8) * Math.PI * 2;
        const [x1, y1] = wpt([HUBS.central[0] + 1.7 * Math.cos(t), HUBS.central[1] + 1.7 * Math.sin(t)]);
        const [x2, y2] = wpt([HUBS.central[0] + 3.3 * Math.cos(t), HUBS.central[1] + 3.3 * Math.sin(t)]);
        return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d6c3a8" strokeWidth="4" />;
      })}
      <polygon points={wcircle(HUBS.central, 1.6)} fill="#4d9dd4" stroke="#dfe7ee" strokeWidth="5" />
      <polygon points={wcircle(HUBS.west, 1.2)} fill="#c9b6d8" stroke="#dfe7ee" strokeWidth="4" />
      {BEDS.map((b, k) => (
        <g key={k}>
          <polygon points={wcircle(b.at, b.r, 20)} fill="#6f7a35" stroke={GROUND.kerb} strokeWidth="4" />
          {Array.from({ length: 9 }, (_, j) => {
            const t = j * 2.4;
            const rr = (b.r - 0.4) * Math.sqrt((j + 0.5) / 9);
            const [x, y] = wpt([b.at[0] + rr * Math.cos(t), b.at[1] + rr * Math.sin(t)]);
            return <circle key={j} cx={x} cy={y} r="4.2" fill={b.colors[j % 2]} />;
          })}
        </g>
      ))}
      {TREES.slice()
        .sort((a, b) => wpt(a)[1] - wpt(b)[1])
        .map((t, k) => (
          <Tree key={k} at={t} />
        ))}
    </g>
  );
}

/** Lamp posts along the promenade and the boulevard, kept off the plazas. */
const LAMPS: World[] = (() => {
  const clear = (p: World) =>
    RIDES_2D.every((r) => !PLAZA[r.ride] || Math.hypot(p[0] - r.at[0], p[1] - r.at[1]) > PLAZA[r.ride]! + 0.6) &&
    Math.hypot(p[0] - HUBS.central[0], p[1] - HUBS.central[1]) > 4.2 &&
    Math.hypot(p[0] - HUBS.east[0], p[1] - HUBS.east[1]) > RING_R + 2;
  const out: World[] = [];
  for (let z = -39.5; z < HUBS.east[1] - RING_R; z += 4.4) {
    out.push([PROMENADE_X - 1.9, z], [PROMENADE_X + 1.9, z + 2.2]);
  }
  for (let z = -39; z < 34; z += 5.6) out.push([BOULEVARD_X - 1.7, z]);
  return out.filter(clear);
})();

function Lamp({ ctx }: { ctx: Ctx }) {
  return (
    <>
      <ellipse rx="6" ry="2.4" fill="#000" opacity="0.25" />
      <line x1="0" y1="0" x2="0" y2="-38" stroke={ctx.on ? "#3b3550" : ctx.off.frame} strokeWidth="3.4" />
      <path d="M -7 -38 L 7 -38" stroke={ctx.on ? "#3b3550" : ctx.off.frame} strokeWidth="3" />
      {ctx.on && <circle cy="-41" r="24" fill={ctx.glow("yellow")} className="ff-halo" />}
      <circle cy="-41" r="5.2" fill={ctx.on ? "#fff3c4" : ctx.off.light} stroke={ctx.on ? "#ffd23f" : ctx.off.frame} strokeWidth="1.6" />
    </>
  );
}

/** Where a power box stands, beside each zone's hub. */
const POWER_AT: Record<FunfairZone, World> = {
  west: [HUBS.west[0] + 3, HUBS.west[1] + 3.6],
  central: [HUBS.central[0] - 4.8, HUBS.central[1] - 3],
  east: [HUBS.east[0] + RING_R + 2.6, HUBS.east[1] - 3],
};

/** The glow of a lit zone on its ground: neon plaza rings, lit walks, the fountain. Drawn over the dark. */
function GroundGlow({ power, night, id }: { power: Record<FunfairZone, boolean>; night: boolean; id: string }) {
  const lit = RIDES_2D.filter((r) => PLAZA[r.ride] && power[r.zone]);
  return (
    <g>
      {night &&
        WALKS.flatMap((w, k) =>
          w.pts.slice(1).map((b, j) => {
            const a = w.pts[j];
            const zone = zoneAt((a[1] + b[1]) / 2);
            if (!power[zone]) return null;
            return <polygon key={`${k}-${j}`} points={segment(a, b, w.hw)} fill={ZONE_COLOR[zone]} opacity="0.16" />;
          }),
        )}
      {lit.map((r) => (
        <g key={r.tag} className="ff-on">
          <path className="ff-neon" d={wring(r.at, PLAZA[r.ride]! - 0.8)} fill="none" stroke={ZONE_COLOR[r.zone]} strokeOpacity="0.35" strokeWidth="14" />
          <path className="ff-neon" d={wring(r.at, PLAZA[r.ride]! - 0.8)} fill="none" stroke={ZONE_COLOR[r.zone]} strokeWidth="4" />
        </g>
      ))}
      {power.east && <path className="ff-neon" d={wring(HUBS.east, RING_R + 1.3)} fill="none" stroke="#ffd23f" strokeWidth="3.5" />}
      {power.central && (
        <g className="ff-on">
          <polygon points={wcircle(HUBS.central, 4.2)} fill={`url(#${id}-cyan)`} className="ff-halo" />
          <polygon points={wcircle(HUBS.central, 1.6)} fill="#7ff8ff" />
          {Array.from({ length: 8 }, (_, k) => {
            const t = (k / 8) * Math.PI * 2;
            const [x1, y1] = wpt([HUBS.central[0] + 1.7 * Math.cos(t), HUBS.central[1] + 1.7 * Math.sin(t)]);
            const [x2, y2] = wpt([HUBS.central[0] + 3.4 * Math.cos(t), HUBS.central[1] + 3.4 * Math.sin(t)]);
            return <line key={k} className="ff-neon" x1={x1} y1={y1} x2={x2} y2={y2} stroke={VX.cyan} strokeWidth="4" strokeLinecap="round" />;
          })}
          {/* The fountain's jet. */}
          <path d={`M ${wpt(HUBS.central)[0]} ${wpt(HUBS.central)[1]} q -10 -40 0 -62 q 10 22 0 62`} fill="#bffcff" opacity="0.85" className="ff-halo" />
        </g>
      )}
      {power.west && <path className="ff-neon" d={wring(HUBS.west, 2.7)} fill="none" stroke={VX.pink} strokeWidth="4" />}
    </g>
  );
}

/**
 * The whole funfair. `power` says which zones are on; the gate lights once any zone is.
 * Rides are drawn back to front, so nearer ones cover farther ones as in the art.
 */
export function Funfair2D({ power, time, id }: { power: Record<FunfairZone, boolean>; time: MapTime; id: string }) {
  const reduced = useReducedMotion();
  const night = time !== "day";
  const ctxFor = (on: boolean): Ctx => ({
    on,
    off: time === "night" ? OFF_NIGHT : OFF,
    motion: on && !reduced,
    night,
    glow: (c) => `url(#${id}-${c})`,
  });
  const anyOn = power.west || power.central || power.east;
  // Off zones fade a little into the dusk; at night they turn to dark shapes (OFF_NIGHT).
  const dim = time === "sunset" ? 0.85 : 1;
  const coaster = RIDES_2D.find((r) => r.ride === "coaster")!;
  const loop = RIDES_2D.find((r) => r.ride === "loop")!;
  const drawn = [
    ...RIDES_2D.filter((r) => r.ride !== "loop").map((r) => ({ key: r.tag, zone: r.zone as FunfairZone | null, y: my(r.y), spot: r as RideSpot | null, lamp: null as World | null })),
    { key: "gate", zone: null, y: my(GATE_2D.y), spot: null, lamp: null },
    ...LAMPS.map((at, k) => ({ key: `lamp${k}`, zone: zoneAt(at[1]) as FunfairZone | null, y: wpt(at)[1], spot: null, lamp: at })),
  ].sort((a, b) => a.y - b.y);

  return (
    <g aria-hidden="true">
      <defs>
        {Object.entries(GLOWS).map(([name, color]) => (
          <radialGradient key={name} id={`${id}-${name}`}>
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="45%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        ))}
        <linearGradient id={`${id}-beam`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#fff6c2" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#fff6c2" stopOpacity="0" />
        </linearGradient>
      </defs>
      {FESTOONS.map(([a, b], k) => {
        const ra = RIDES_2D[a];
        const on = power[ra.zone];
        return (
          <g key={k} className={on ? "ff-on" : undefined} opacity={on ? 1 : dim}>
            <Festoon a={ra} b={RIDES_2D[b]} ctx={ctxFor(on)} i0={k * 7} />
          </g>
        );
      })}
      <GroundGlow power={power} night={night} id={id} />
      {(Object.keys(POWER_AT) as FunfairZone[]).map((zone) => {
        const [x, y] = wpt(POWER_AT[zone]);
        return (
          <g key={zone} transform={`translate(${x} ${y})`} opacity={power[zone] ? 1 : dim}>
            <PowerBox ctx={ctxFor(power[zone])} />
          </g>
        );
      })}
      {drawn.map(({ key, zone, spot, lamp }) => {
        if (lamp) {
          const [x, y] = wpt(lamp);
          const on = power[zone!];
          return (
            <g key={key} transform={`translate(${x} ${y})`} opacity={on ? 1 : dim}>
              <Lamp ctx={ctxFor(on)} />
            </g>
          );
        }
        if (!spot) {
          return (
            <g key={key} transform={`translate(${mx(GATE_2D.x)} ${my(GATE_2D.y)})`} className={anyOn ? "ff-on" : undefined} opacity={anyOn ? 1 : dim}>
              <Gate ctx={ctxFor(anyOn)} />
            </g>
          );
        }
        const on = power[zone!];
        const ctx = ctxFor(on);
        if (spot.ride === "coaster") {
          return (
            <g key={key} className={on ? "ff-on" : undefined} opacity={on ? 1 : dim}>
              <Coaster station={[mx(coaster.x), my(coaster.y)]} loop={[mx(loop.x), my(loop.y)]} ctx={ctx} />
            </g>
          );
        }
        return (
          <g key={key} transform={`translate(${mx(spot.x)} ${my(spot.y)})`} className={on ? "ff-on" : undefined} opacity={on ? 1 : dim}>
            {rideArt(spot.ride, ctx, night, id)}
          </g>
        );
      })}
    </g>
  );
}

// ── Zone signs (the Projectors layer) ──────────────────────────────────────

function KeyGlyph({ location, color }: { location: ProjectorLocation; color: string }) {
  if (location === "B1") {
    const star = Array.from({ length: 10 }, (_, k) => {
      const r = k % 2 ? 6 : 14;
      const t = (k / 10) * Math.PI * 2 - Math.PI / 2;
      return `${(r * Math.cos(t)).toFixed(1)},${(r * Math.sin(t)).toFixed(1)}`;
    }).join(" ");
    return <polygon points={star} fill={color} />;
  }
  if (location === "A3") {
    return (
      <g stroke={color} strokeWidth="3" fill="none">
        <circle r="12" />
        {[0, 1, 2, 3].map((k) => {
          const t = (k / 4) * Math.PI;
          return <line key={k} x1={-12 * Math.cos(t)} y1={-12 * Math.sin(t)} x2={12 * Math.cos(t)} y2={12 * Math.sin(t)} />;
        })}
      </g>
    );
  }
  return (
    <g>
      <ellipse rx="15" ry="6" fill="none" stroke={color} strokeWidth="3" transform="rotate(-24)" />
      <circle r="5.5" fill={color} />
    </g>
  );
}

/** Which zone's sign floats where: above the zone's middle, high enough to clear most rides. */
const SIGN_LIFT = 250;

/**
 * One sign over each zone: its key's glyph and code name, bright in the key's colour when its projector is lit,
 * grey when not. Tapping one opens the projector's details.
 */
export function ZoneSign({
  location,
  zone,
  lit,
  selected,
  group,
  title,
  onTap,
  id,
}: {
  /** Prefix for the SVG ids (the inline and full-screen maps are both in the page). */
  id: string;
  location: ProjectorLocation;
  zone: FunfairZone;
  lit: boolean;
  selected: boolean;
  /** The group that lit it, when the viewer may know (fn_map_lightbulbs, 0096). */
  group: number | null;
  title: string;
  onTap: () => void;
}) {
  const s = worldToArt(squeeze(ZONE_WORLD[zone]));
  const key = KEY_COLORS[location];
  const name = `${PROJECTOR_CODE_NAMES[location]}${lit && group != null ? ` / G${group}` : ""}`;
  const area = FUNFAIR_ZONE_NAMES[zone].split(" / ")[1].toUpperCase();
  const sub = lit ? area : `${area} / OFF`;
  // Rough text widths (bold 30 px name, 17 px caps with 2 px tracking), with room for the glyph and the ends.
  const w = Math.max(name.length * 19, sub.length * 13.2) + 110;
  const x0 = -w / 2;
  return (
    <g
      data-map-hit
      className="pointer-events-auto cursor-pointer"
      transform={`translate(${mx(s.x)} ${my(s.y)})`}
      onClick={onTap}
    >
      <title>{title}</title>
      <ellipse rx="18" ry="7" fill={lit ? key.main : "#57534e"} opacity="0.9" />
      <line x1="0" y1="0" x2="0" y2={-SIGN_LIFT + 36} stroke={lit ? key.main : "#a8a29e"} strokeWidth="3" strokeDasharray="8 7" opacity="0.85" />
      <g transform={`translate(0 ${-SIGN_LIFT})`}>
        {lit && <ellipse rx={w / 2 + 40} ry="70" fill={`url(#${id}-${location})`} className="ff-halo" />}
        <defs>
          <radialGradient id={`${id}-${location}`}>
            <stop offset="0%" stopColor={key.main} stopOpacity="0.6" />
            <stop offset="100%" stopColor={key.main} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect
          x={x0}
          y={-36}
          width={w}
          height={72}
          rx={36}
          fill={lit ? VX.ink : "#2a2730"}
          stroke={selected ? "#ffffff" : lit ? key.main : "#6b6574"}
          strokeWidth={selected ? 8 : 5}
        />
        <circle cx={x0 + 38} r="25" fill={lit ? "#1a1424" : "#3a3640"} stroke={lit ? key.main : "#6b6574"} strokeWidth="3" />
        <g transform={`translate(${x0 + 38} 0)`}>
          <KeyGlyph location={location} color={lit ? key.main : "#8a8494"} />
        </g>
        <text x={x0 + 74} y={2} fontSize="30" fontWeight="900" fill={lit ? "#ffffff" : "#b9b3c4"}>
          {name}
        </text>
        <text x={x0 + 75} y={25} fontSize="17" fontWeight="800" letterSpacing="2" fill={lit ? key.main : "#8a8494"}>
          {sub}
        </text>
      </g>
    </g>
  );
}

// ── Night ──────────────────────────────────────────────────────────────────

/** How dark the map gets, and how bright the pools are. */
const DARK: Record<Exclude<MapTime, "day">, { color: string; opacity: number; pool: number }> = {
  sunset: { color: "#3b1408", opacity: 0.3, pool: 0.65 },
  night: { color: "#060a22", opacity: 0.66, pool: 1 },
};

/** A pool of light on the ground under a lit ride. */
export type GroundLight = { key: string; x: number; y: number; rx: number; ry: number; color: string };

/** The ground lights of the lit zones: one pool under each ride, and the gate's once any zone is on. */
export function groundLights(power: Record<FunfairZone, boolean>): GroundLight[] {
  const lights: GroundLight[] = RIDES_2D.filter((r) => power[r.zone]).map((r) => ({
    key: r.tag,
    x: mx(r.x),
    y: my(r.y) + 10,
    rx: r.ride === "wheel" || r.ride === "bigtop" ? 300 : 230,
    ry: r.ride === "wheel" || r.ride === "bigtop" ? 180 : 140,
    color: ZONE_COLOR[r.zone],
  }));
  if (power.west || power.central || power.east) {
    lights.push({ key: "gate", x: mx(GATE_2D.x), y: my(GATE_2D.y) + 10, rx: 190, ry: 115, color: VX.cyan });
  }
  return lights;
}

/**
 * The dark of dusk or night over the whole map, with a hole of light under each lit ride. Drawn under the funfair,
 * stations and pins, so they stay on top. Nothing by day.
 */
export function NightLight({ time, lights, id }: { time: MapTime; lights: GroundLight[]; id: string }) {
  if (time === "day") return null;
  const dark = DARK[time];
  return (
    <g aria-hidden="true">
      <defs>
        {/* Mask: white keeps the dark, black clears it. Each pool fades from clear in the middle to dark. */}
        <radialGradient id={`${id}-hole`}>
          <stop offset="0%" stopColor="#000" />
          <stop offset="40%" stopColor="#000" />
          <stop offset="100%" stopColor="#fff" />
        </radialGradient>
        <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width={MAP_W} height={MAP_H}>
          <rect width={MAP_W} height={MAP_H} fill="#fff" />
          {lights.map((l) => (
            <ellipse key={l.key} cx={l.x} cy={l.y} rx={l.rx} ry={l.ry} fill={`url(#${id}-hole)`} />
          ))}
        </mask>
        {[...new Set(lights.map((l) => l.color))].map((c) => (
          <radialGradient key={c} id={`${id}-pool-${c.slice(1)}`}>
            <stop offset="0%" stopColor="#fff3c4" stopOpacity={0.5 * dark.pool} />
            <stop offset="45%" stopColor={c} stopOpacity={0.26 * dark.pool} />
            <stop offset="100%" stopColor={c} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      <rect width={MAP_W} height={MAP_H} fill={dark.color} opacity={dark.opacity} mask={`url(#${id}-mask)`} />
      {lights.map((l) => (
        <ellipse key={l.key} className="map-bulb-pool" cx={l.x} cy={l.y} rx={l.rx} ry={l.ry} fill={`url(#${id}-pool-${l.color.slice(1)})`} />
      ))}
    </g>
  );
}
