// Per-group accent colours for the Freshie Home (Vortexa "Night Ticket" style).
//
// The `groups` table has no colour column yet, so colours are mapped here by
// group id. Only Freshie Home reads this. To give a group its own look, add or
// edit its entry — `accent` tints the pass, live dot, active tab and glow;
// `glow` is the soft background light behind the page.
//
// TODO(design): fill in the 10 Freshie groups' colours. Unlisted groups use
// DEFAULT_GROUP_THEME. Brand palette for reference:
//   #063A65 #0DFCFD #BC071D #FC9E3D #FE06AB #F2FF0B #FFB1C1 #E0B4FC

export type GroupTheme = {
  /** Main accent (text/borders on black). Keep it bright enough to read. */
  accent: string;
  /** Background glow colour. */
  glow: string;
};

// Default = "Blue Hour" theme blue #008CFF (see freshie.css).
export const DEFAULT_GROUP_THEME: GroupTheme = { accent: "#008CFF", glow: "#008CFF" };

export const GROUP_THEMES: Record<number, GroupTheme> = {
  // 1: { accent: "#0DFCFD", glow: "#063A65" },
  // 2: { accent: "#FE06AB", glow: "#4a0233" },
};

export function groupTheme(groupId: number | null | undefined): GroupTheme {
  return (groupId != null && GROUP_THEMES[groupId]) || DEFAULT_GROUP_THEME;
}

/** Number of Freshie groups shown on the Home scoreboard placeholder. */
export const GROUP_COUNT = 10;

const SWATCH_FALLBACK = ["#0DFCFD", "#E0B4FC", "#FE06AB", "#F2FF0B", "#FC9E3D", "#FFB1C1"];

/** Dot colour for a group in lists: its theme accent, else a palette colour. */
export function groupSwatch(groupId: number): string {
  return GROUP_THEMES[groupId]?.accent ?? SWATCH_FALLBACK[(groupId - 1) % SWATCH_FALLBACK.length];
}
