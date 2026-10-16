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

### HOF, HOGM and Committee pages: Welcome page colours

HOF, HOGM and Committee (`OPS_ROLES` in `src/lib/types.ts`) are not a group, so they have no group colour. Their pages use the colours of the public Welcome page ([vortexa.css](src/components/home/vortexa.css)).

- Home is [StaffHome.tsx](src/components/staff/StaffHome.tsx). It reuses Freshie Home's layout and parts (`Countdown`, `PhaseCard`, `Credits`, `AccountMenu`, `StopBar`, `FreshieSky`). Change those parts in `FreshieHome.tsx`, not in a copy.
- The colours come from `VORTEXA_THEME` in [groupTheme.ts](src/components/freshie/groupTheme.ts), plus the `.fh-vx` overrides in [staff-home.css](src/components/staff/staff-home.css). The rules are the same as on the Welcome page: yellow for the primary action, cyan for "you are here", and pink, lilac and orange for decoration only.
- Subpages (Ops, Scoreboard, Schedule) read the `--sp-*` variables in [staff-dashboard.css](src/components/staff/staff-dashboard.css). `.staff-vx` switches them to the Welcome colours. Do not hardcode navy hex values in staff CSS; use the variables.
- HOGM's Ops page is Game control ([components/staff/game/](src/components/staff/game/)). It has the same controls as Admin's game console: game start and end, stations, token rules and reset, puzzle pictures, NFC, and the funfair's keys (migration 0088). Blind box is not included. On the server, `is_game_lead()` (migration 0071) allows HOGM and Admin. When you add a game control to Admin, decide whether HOGM gets it too, and if so use `is_game_lead()`, not `is_admin()`. Kill-switches stay Admin only.
- The tab bar ([FreshieTabBar.tsx](src/components/freshie/FreshieTabBar.tsx), `data-variant="ops"`) has these tabs: Home, Map, Ops (the yellow center button), Scores and Schedule. On screens 1024px and wider, TopNav replaces it and shows Ops as a yellow pill (`primaryHref`).

## Other references

- [docs/permission-matrix.md](docs/permission-matrix.md): what each role can do, and known permission gaps.
- [docs/SETUP.md](docs/SETUP.md): setup, migrations and environment variables.
