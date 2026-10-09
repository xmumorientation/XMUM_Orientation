// One colour per Freshie group. Admin sets `groups.color`. It replaces the
// blue used on Freshie screens (buttons, glow, scan frame, brand accents).
// The night layout stays. A missing or invalid value uses the default blue.

export const DEFAULT_GROUP_COLOR = "#008CFF";

const HEX = /^#[0-9A-Fa-f]{6}$/;

export type GroupTheme = {
  /** Main accent. Buttons, chips, scan frame, active tab. */
  accent: string;
  /** Soft background light. Same hue as accent, a little whiter for very light hues. */
  glow: string;
  /** Lighter accent for hover and secondary labels. */
  accentLight: string;
  /** Text that stays readable on a fill of `accent`. */
  onAccent: string;
  /** Opacity of the background lights (0–1). Lower for bright hues. */
  glowStrength: number;
  /** Size factor of the background lights (0–1). Smaller for bright hues. */
  glowSpread: number;
  /** Second, fixed Vortexa colour for background lights. About a third of the colour wheel away from the accent. */
  partner: string;
};

/** Brand colours a group's background may borrow as its partner light. */
const PARTNER_COLORS = ["#0DFCFD", "#FE06AB", "#E0B4FC", "#FC9E3D"];

export function groupColor(color: string | null | undefined): string {
  return color && HEX.test(color.trim()) ? color.trim().toLowerCase() : DEFAULT_GROUP_COLOR.toLowerCase();
}

function mixWhite(hex: string, amount: number): string {
  const int = parseInt(hex.slice(1), 16);
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
  const r = mix((int >> 16) & 255);
  const g = mix((int >> 8) & 255);
  const b = mix(int & 255);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function luminance(hex: string): number {
  const int = parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = channel((int >> 16) & 255);
  const g = channel((int >> 8) & 255);
  const b = channel(int & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hue(hex: string): number {
  const int = parseInt(hex.slice(1), 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** The brand colour closest to 120° from the accent: clear contrast, never the same hue, never a harsh complement. */
function partnerFor(accent: string): string {
  const h = hue(accent);
  let best = PARTNER_COLORS[0];
  let bestScore = Infinity;
  for (const c of PARTNER_COLORS) {
    const raw = Math.abs(hue(c) - h);
    const score = Math.abs(Math.min(raw, 360 - raw) - 120);
    if (score < bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

export function themeFromColor(color: string | null | undefined): GroupTheme {
  const accent = groupColor(color);
  const lum = luminance(accent);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    accent,
    // A very light hue (yellow, cyan, green) over navy turns olive at low
    // opacity; a whiter core keeps it reading as light.
    glow: lum > 0.5 ? mixWhite(accent, 0.18) : accent,
    accentLight: mixWhite(accent, 0.35),
    onAccent: lum > 0.45 ? "#001629" : "#ffffff",
    // Bright hues get a smaller, fainter light and dark hues a wider one, so
    // every group's background looks about as bright.
    glowStrength: round(Math.min(0.6, Math.max(0.36, 0.6 - lum * 0.25))),
    glowSpread: round(1 - Math.max(0, lum - 0.3) * 0.6),
    partner: partnerFor(accent),
  };
}

/** Number of Freshie groups shown on the Home scoreboard placeholder. */
export const GROUP_COUNT = 10;

const SWATCH_FALLBACK = ["#0DFCFD", "#E0B4FC", "#FE06AB", "#F2FF0B", "#FC9E3D", "#FFB1C1"];

/** Dot colour for a group in lists. Uses its saved color when present. */
export function groupSwatch(groupId: number, color?: string | null): string {
  if (color && HEX.test(color.trim())) return color.trim();
  return SWATCH_FALLBACK[(groupId - 1) % SWATCH_FALLBACK.length];
}
