// One colour per Freshie group. Admin sets `groups.color`. It replaces the
// blue used on Freshie screens (buttons, glow, scan frame, brand accents).
// The night layout stays. A missing or invalid value uses the default blue.

export const DEFAULT_GROUP_COLOR = "#008CFF";

const HEX = /^#[0-9A-Fa-f]{6}$/;

export type GroupTheme = {
  /** Main accent. Buttons, chips, scan frame, active tab. */
  accent: string;
  /** Soft background light. Same hue as accent. */
  glow: string;
  /** Lighter accent for hover and secondary labels. */
  accentLight: string;
  /** Text that stays readable on a fill of `accent`. */
  onAccent: string;
};

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

export function themeFromColor(color: string | null | undefined): GroupTheme {
  const accent = groupColor(color);
  return {
    accent,
    glow: accent,
    accentLight: mixWhite(accent, 0.35),
    onAccent: luminance(accent) > 0.45 ? "#001629" : "#ffffff",
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
