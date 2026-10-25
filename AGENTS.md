# Project notes for AI coding assistants

This file is read by Cursor, Claude Code (through `CLAUDE.md`) and other AI assistants. Keep the project rules here, in one place.

## Read first

Before starting any new development work in this repo, read [docs/ROADMAP.md](docs/ROADMAP.md). It lists:
- planned work,
- work planned for later,
- known security gaps that are parked for now.

When the user asks what to work on next, start from that file.
When you finish work from it, record what was done in its "Done" section.

## Rules

### Freshie and Faci pages: per-group colours

All Freshie groups share one set of pages (Freshie Home, Items, Schedule; Facilitators use the same Home). Layout, buttons and logic are the same for every group. Each group has its own colour.

- A group's colour is **one value, `groups.color`**, set by Admin in Admin → Freshies (Color). It is not in the code. A missing or invalid value falls back to the default blue (`DEFAULT_GROUP_COLOR`).
- [groupTheme.ts](src/components/freshie/groupTheme.ts) `themeFromColor()` derives the rest from that one colour: `accent`, `glow`, `accentLight`, `onAccent` (text on an accent fill), `glowStrength`, `glowSpread` and `partner`. Change how colours are derived there, not in the components.
- They reach the page as CSS variables: `--fh-accent`, `--fh-glow`, `--fh-blue` (same as accent), `--fh-blue-light`, `--fh-on-blue`, `--fh-glow-strength`, `--fh-glow-spread`, `--fh-partner`. Use these for any colour that should follow the group. Do not hardcode a hex value. Text on an accent fill uses `var(--fh-on-blue)`, so a light group colour still reads.
- The variables are set in `AppShell` (for Freshie and Faci) and on the roots of `FreshieHome`, `FreshieItems` and `FreshieSchedule`; sheets and dialogs rendered outside them (portals) get them passed in. When adding a variable, set it in all of those places.
- To make another colour follow the group (for example sparkles or a secondary glow), add a field to the `GroupTheme` type, compute it in `themeFromColor()`, expose it as a new `--fh-*` variable where the others are set, and use that variable.
- Some colours in [freshie.css](src/components/freshie/freshie.css) are still fixed for every group (for example `--fh-pink` and the pink glow and sparkles in `FreshieHome.tsx`). Move them into the theme with the step above if a group needs them to differ.
- Do not branch on group id in components (for example `if (groupId === 3)`). Derive the difference from the group's colour in `themeFromColor()` instead.
- Do not copy a page per group (for example `Group3Home.tsx`). There is one page, and each group's look comes from its colour.

### HOF, HOGM, Committee and GM pages: Welcome page colours

HOF, HOGM and Committee (`OPS_ROLES` in `src/lib/types.ts`) and GM (`VORTEXA_ROLES` is `OPS_ROLES` plus GM) are not a group, so they have no group colour. Their pages use the colours of the public Welcome page ([vortexa.css](src/components/home/vortexa.css)). Guardian GM still uses the older staff design.

- Home is [StaffHome.tsx](src/components/staff/StaffHome.tsx). It reuses Freshie Home's layout and parts (`Countdown`, `PhaseCard`, `Credits`, `AccountMenu`, `StopBar`, `FreshieSky`). Change those parts in `FreshieHome.tsx`, not in a copy.
- The colours come from `VORTEXA_THEME` in [groupTheme.ts](src/components/freshie/groupTheme.ts), plus the `.fh-vx` overrides in [staff-home.css](src/components/staff/staff-home.css). The rules are the same as on the Welcome page: yellow for the primary action, cyan for "you are here", and pink, lilac and orange for decoration only.
- Subpages (Ops, Scoreboard, Schedule) read the `--sp-*` variables in [staff-dashboard.css](src/components/staff/staff-dashboard.css). `.staff-vx` switches them to the Welcome colours. Do not hardcode navy hex values in staff CSS; use the variables.
- HOGM's Ops page is Game control ([components/staff/game/](src/components/staff/game/)). It has part of Admin's game console: stations, token rules and the reset (Rehearsal mode only), puzzle pictures, and the funfair's keys (migration 0088). Starting and ending the games, NFC and blind box are not included (Admin does those). On the server, `is_game_lead()` (migration 0071) allows HOGM and Admin. When you add a game control to Admin, decide whether HOGM gets it too, and if so use `is_game_lead()`, not `is_admin()`. Kill-switches stay Admin only, and so does the Day 2 inner schedule (migration 0102, `fn_day2_control`): its Station game, Blind box and Funfair switches gate the Day 2 result, blind box buying and every way of lighting the map on the server (`fn_day2_guard`). There is no Pause for games or schedule items.
- The tab bar ([FreshieTabBar.tsx](src/components/freshie/FreshieTabBar.tsx), `data-variant="ops"`) has these tabs: Home, Map, Ops (the yellow center button), Scores and Schedule. On screens 1024px and wider, TopNav replaces it and shows Ops as a yellow pill (`primaryHref`).
- GM has the same tabs and look, with **Station** (`/gm`) instead of Ops. The Station page ([gm/page.tsx](src/app/(app)/gm/page.tsx)) uses the Game control classes (`.gc-st` in [game-control.css](src/components/staff/game/game-control.css)). Day 2 on the Station page runs in three steps: Check (tokens, the Day 2 game running, no token freeze, a piece to win), Play (the group is locked) and Submit (confirm sheet; the entry fee is charged only then). The GM does not set the station status by hand: starting a Day 2 game sets In progress, and submitting or cancelling it sets Available. The one manual step is Open station (Closed → Available, after a confirm). GM's Home is `StaffHome` with Station in place of Ops, no Big screen and no blind box. GMs show no blind box QR anywhere. Its Scores tab is `GroupScores countsOnly`: tokens from `fn_scoreboard()` and each key's piece count from `fn_puzzle_status()`, because a GM may not read which pieces a group owns.
- A GM cannot select the `groups` or `inventory` tables (0002 RLS). Read group names, colours and tokens with `fn_scoreboard()` on any page a GM sees. Realtime sends a GM no `groups` events, so refresh on a timer as well.

## Other references

- [docs/permission-matrix.md](docs/permission-matrix.md): what each role can do, and known permission gaps.
- [docs/SETUP.md](docs/SETUP.md): setup, migrations and environment variables.
- [docs/map3d-session-handoff.md](docs/map3d-session-handoff.md): the 3D campus map, the Vortexa Funfair and the lake stage: where things stand and how to work on them without breaking the map.
