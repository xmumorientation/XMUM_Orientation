# Project notes for AI coding assistants

This file is read by Cursor, Claude Code (through `CLAUDE.md`) and other AI assistants. Keep the project rules here, in one place.

## Read first

Before starting any new development work in this repo, read [docs/ROADMAP.md](docs/ROADMAP.md). It lists:
- planned work,
- work planned for later,
- known security gaps that are parked for now.

When the user asks what to work on next, start from that file.
When you finish an item from it, remove the item from the file, or update it.

## Rules

### Freshie Home: per-group colours

All Freshie groups share one Freshie Home page (`src/components/freshie/`). Layout, buttons and logic are the same for every group. Each group can have its own colour scheme.

- Each group's colours live in `GROUP_THEMES` in [groupTheme.ts](src/components/freshie/groupTheme.ts), keyed by group id. Change a group's colours there, not in the components.
- Today a group theme has two colours, `accent` and `glow`, exposed as `var(--fh-accent)` and `var(--fh-glow)`. Use these variables for any colour that should follow the user's group. Do not hardcode a hex value.
- To make another colour change per group (for example button colour, secondary glow, sparkles), add a field to the `GroupTheme` type, expose it as a new `--fh-*` CSS variable in `FreshieHome`, and use that variable. Give the field a default in `DEFAULT_GROUP_THEME`, so groups without their own value still work.
- Many colours in [freshie.css](src/components/freshie/freshie.css) are still fixed (for example `--fh-blue`, `--fh-pink`, and the pink glow and sparkles in `FreshieHome.tsx`). They are the same for every group today. Move them into the group theme with the step above when a group needs them to differ.
- Do not branch on group id in components (for example `if (groupId === 3)`). Put the difference in `GROUP_THEMES` instead.
- Do not copy the page into one copy per group (for example `Group3Home.tsx`). There is one page, and each group's look comes from its theme.

## Other references

- [docs/permission-matrix.md](docs/permission-matrix.md): what each role can do, and known permission gaps.
- [docs/SETUP.md](docs/SETUP.md): setup, migrations and environment variables.
