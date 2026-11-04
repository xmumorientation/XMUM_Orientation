# Plan: Day 2 inner schedule with add/remove segments and station tiers

Status: built on branch `claude/day2-schedule-segments-83f0af` (uncommitted; migration 0115 not yet run on the live database). Agreed in discussion. Replaces the fixed 4 segments of [day2-inner-schedule.md](day2-inner-schedule.md). Migration will be 0115 (latest is 0114).

## Model

- A segment is a row in a list: stable `id`, optional `label`, `start_min`, and 5 switches: **Easy, Medium, Hard** (station risk tiers low / medium / high), **Blind Box**, **Funfair**.
- First segment always starts at 0 and cannot be removed. A segment ends where the next starts; the last ends at the game's end (+5 min on the Day 2 game lengthens the last segment).
- Stored as JSON in `day2_schedule`. The old `challenge_start_min`, `challenge_end_min`, `funfair_start_min` columns are migrated and dropped.
- The master "Station Game" switch is removed. To stop everything: all three tiers off, or the `tokens_frozen` kill-switch.

## Challenge Mode

Not a segment type any more. The red CHALLENGE MODE banner shows while the Day 2 game runs and the current segment's Blind Box switch is on. Blind Box defaults on in every segment.

## Seed (new plan, 150 min game)

| Segment | Start | Easy | Medium | Hard | Blind Box | Funfair |
|---|---|---|---|---|---|---|
| Opening | 0 | on | on | off | on | off |
| Hard Stations Open | 60 | on | on | on | on | off |
| Funfair | 105 | on | on | on | on | on |

Migration 0115 replaces the old 60/90/120 times with this seed (also correct on a DB where 0102 ran with no edits).

## Add / remove

- Add: splits the chosen segment at its midpoint; the new one copies its switches; then drag or type its time.
- Remove: its range goes to the previous segment, which keeps its own switches.
- Max 8 segments, each at least 1 min (start times strictly increasing).
- Add / remove refused while a segment is held by hand (press Back to Auto first). Allowed during a running game.

## Switches

- Card switches edit the segment's saved defaults. Toggling in the running segment asks "Change Default" or "Just Now" (just now = temporary live flip, tagged "by hand", as today).
- A live flip is stored as `{segment_id, switch: bool}`. Any add, remove or time edit that changes the running segment clears it.
- Start Now holds a segment by id (works with no game, for tests); Back to Auto follows the clock. Removing the held segment is refused.
- Outside the Day 2 game with no hold: all three tiers on, Blind Box off, Funfair off, no banner.

## Closed tier (server enforced)

- `fn_day2_challenge` and the GM's Start game refuse a station whose tier is off (new error `TIER_CLOSED`). `stations.status` is not written (that is the GM's own Open Station state). A group already playing may still submit.
- Shown as "Closed" with a reopens-at time on: GM Station Check step, Freshie Schedule and map station list, Ops → Stations and Admin → Stations (badge).
- Admin only (`is_admin()`), kill-switches still win, Rehearsal mode does not bypass (unchanged).

## Build

1. Migration 0115: new schema, seed, `fn_day2_state`, `fn_day2_control` (set_segments / add / remove / start_segment / auto / set_switch with scope default or now), `fn_day2_guard` tiers, patch `fn_day2_challenge` and Start game (`fn_manual_checkin`).
2. `useDay2State` and `ChallengeBanner` follow the list.
3. [Day2Schedule.tsx](../../src/components/admin/Day2Schedule.tsx): slider with N handles, card list, add/remove.
4. Closed-tier display in the places above; error text in `src/lib/utils.ts`.
5. Rewrite `tests/game-lead/day2-schedule.test.ts` and `tests/admin-ui/game-master-day2.test.tsx`; update ROADMAP, permission-matrix, AGENTS.md.
