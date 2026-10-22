import { UNITS_PER_M, type CourtBlock, type Sport } from "./geo";

// DRAFT: the outdoor courts' sizes and how each block in geo.ts SPORTS is split into courts. sports.tsx draws them,
// and the tennis game (tennis/) plays on them. No React or drawing here, so tests can import it.

/** Equipment height exaggeration (heights only; positions stay to scale). */
export const LIFT = 1.6;

export type Spec = { L: number; W: number; area: string; court: string; line: string; key?: string };

/** Playing area (length along the court's long axis, width) in metres, and paint. */
export const SPEC: Record<Sport, Spec> = {
  tennis: { L: 23.77, W: 10.97, area: "#6f7b8c", court: "#7d8c9c", line: "#f5f5f0" },
  basketball: { L: 28, W: 15, area: "#5b6875", court: "#657a87", line: "#f5f5f0", key: "#90949b" },
  // small-sided futsal: three fit across a 40 m block
  futsal: { L: 25, W: 12, area: "#5e6a74", court: "#687680", line: "#f5f5f0" },
  // not visible in the photo; same court family, a little warmer
  volleyball: { L: 18, W: 9, area: "#6a7480", court: "#7a8590", line: "#f5f5f0" },
};

export type Cell = {
  sport: Sport;
  cx: number;
  cz: number;
  /** true when the court's long axis runs along world X */
  alongX: boolean;
  /** world units per metre for this court's markings */
  s: number;
};

export function courtCells(b: CourtBlock): Cell[] {
  const alongX = b.long === "x";
  const [x0, x1] = b.x;
  const [z0, z1] = b.z;
  const spanL = alongX ? x1 - x0 : z1 - z0;
  const spanW = (alongX ? z1 - z0 : x1 - x0) / b.count;
  const spec = SPEC[b.sport];
  // real size, unless the court's share of the block is too small for it
  const s = Math.min(UNITS_PER_M, (spanL * 0.9) / spec.L, (spanW * 0.88) / spec.W);
  const mid = alongX ? (x0 + x1) / 2 : (z0 + z1) / 2;
  const start = alongX ? z0 : x0;
  return Array.from({ length: b.count }, (_, i) => {
    const across = start + spanW * (i + 0.5);
    return { sport: b.sport, cx: alongX ? mid : across, cz: alongX ? across : mid, alongX, s };
  });
}
