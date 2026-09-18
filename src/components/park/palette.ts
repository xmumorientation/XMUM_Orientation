// Central colour + timing tokens for the "Enter the Park" prototype.
// Futuristic neon carnival at night: near-black base, cyan / purple / hot-pink.
export const NEON = {
  /** Primary neon — electric cyan */
  cyan: "#12e6ff",
  /** Secondary neon — electric purple */
  purple: "#a437ff",
  /** Accent — hot pink (used sparingly) */
  pink: "#ff2e8b",
  /** Warm amber spark, used very sparingly for depth */
  amber: "#ffb454",
  /** Near-black background / fog colour */
  deep: "#05010c",
  /** Slightly lifted black for structures */
  panel: "#0b0718",
} as const;

// Scroll keyframes (0..1) at which cinematic captions appear. Kept here so the
// 3D beats and the typography beats stay in sync from a single source.
export const BEATS = {
  journey: 0.14,
  meet: 0.4,
  explore: 0.55,
  experience: 0.7,
  open: 0.92,
} as const;
