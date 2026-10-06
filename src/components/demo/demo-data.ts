/**
 * Group shell content for D-day walkthrough (`/group/demo-*`).
 *
 * Access is gated by a signed, expiring Homepage pass (see `src/lib/group-pass.ts`)
 * issued after wristband/ticket QR redeem — not by secret URL alone.
 * Demo redeem codes (DEMO-GROUP-*) work only when ENABLE_DEMO_GROUP_CODES=true.
 */

export type DemoGroup = {
  /** URL slug, e.g. "demo-1" */
  id: string;
  /** Display group number shown to freshies */
  number: number;
  name: string;
  /** Accent used in the top bar */
  color: string;
  /** Short tip attributed to the Facilitator (placeholder copy) */
  faciTip: string;
};

/** Known demo shells — keep in sync with `/group/[id]` allow-list. */
export const DEMO_GROUPS: Record<string, DemoGroup> = {
  "demo-1": {
    id: "demo-1",
    number: 1,
    name: "Team Aquila",
    color: "#00cfff",
    faciTip: "Meet at the cyan flag near the counter after check-in. Stay with your Facilitator for the first briefing.",
  },
  "demo-3": {
    id: "demo-3",
    number: 3,
    name: "Team Orion",
    color: "#ff3cac",
    faciTip: "Look for the pink Orion banner. Your Facilitator will walk you to the team huddle spot.",
  },
};

/** Groups a fake counter draw may land on (client-side demo only). */
export const DRAW_POOL = [1, 2, 3, 4, 5, 6] as const;

export function getDemoGroup(id: string): DemoGroup | undefined {
  return DEMO_GROUPS[id];
}
