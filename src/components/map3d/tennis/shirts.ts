import { groupColor, themeFromColor } from "@/components/freshie/groupTheme";

// DRAFT: the players' names and shirts in the tennis game (docs/ROADMAP.md, item 9). No React or drawing here, so
// the map pages' game (onMap.ts) and its tests can use it.

/** A player's name is cut to this many characters (a group may choose one up to 40 long). */
const NAME_MAX = 20;

/** A player as the other phone sees them: their name (a random "Player 123" when empty) and shirt (a group colour). */
export function playerProfile(name: string, color: string) {
  const trimmed = name.trim();
  const short = trimmed.length > NAME_MAX ? `${trimmed.slice(0, NAME_MAX - 1).trimEnd()}…` : trimmed;
  return { name: short || `Player ${Math.floor(100 + Math.random() * 900)}`, color: groupColor(color) };
}

/** The other player's shirt: their colour, unless it is close to this player's (two tabs, both default blue). */
export function theirColor(mine: string, theirs: string) {
  const [a, b] = [parseInt(mine.slice(1), 16), parseInt(theirs.slice(1), 16)];
  const d = [16, 8, 0].reduce((sum, s) => sum + Math.abs(((a >> s) & 255) - ((b >> s) & 255)), 0);
  return d < 90 ? themeFromColor(mine).partner.toLowerCase() : theirs;
}

/** Both shirts of a match as this player sees them (theirs from the other player's group colour, as it came). */
export function shirtsOf(mine: string, theirs: string): [string, string] {
  return [mine, theirColor(mine, groupColor(theirs))];
}
