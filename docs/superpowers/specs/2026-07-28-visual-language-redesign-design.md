# Visual Language Redesign — Design Spec

Status: approved (brainstorming session, 2026-07-28)

## Problem

XMUM Orientation is building its first-ever web platform (previous years only had
Instagram campaign art — 2026/04 "Atlantis" underwater theme, 2026/08 doodle/street-art
theme — no product UI precedent exists). The 2026/12 theme is "Vortexa," not yet fully
locked. The current UI ([tailwind.config.ts](../../../tailwind.config.ts),
[globals.css](../../../src/app/globals.css)) already has a neutral paper/ink base and a
runtime-configurable `--brand-1`/`--brand-2` accent slot, but leans on
`linear-gradient(brand-1, brand-2)` buttons, soft blurred "glass" shadows, and the
Inter + Space Grotesk font pairing — reading as generic, templated "AI-common" design
(confirmed against a real comparison: `xmum-orientation-interviewslot.netlify.app`,
a separately built booking tool that is the canonical example of the look to avoid).

The platform is designed to be reused every future year by swapping admin-configurable
colors, copy, and imagery — so the redesign must produce a **durable, multi-year system**,
not a one-off skin for this year's Vortexa theme.

## Decision: System layer vs. Skin layer

Split the UI into two layers with different lifespans:

- **System layer** — every functional screen (auth, dashboard, map, inventory, gm,
  guardian, committee, admin, forms, tables, nav). Must look confident and professional
  for years without a redesign. Carries almost no yearly theme personality.
- **Skin layer** — a short, explicit list of "hero moment" canvases where each year's
  theme (Vortexa this year; Atlantis/doodle-equivalent in future years) gets full
  illustrated/decorative expression. Everything else stays out of the system layer.

  Hero moments (initial list):
  - Auth/landing entry hero
  - Loading / phase-transition screens
  - Gacha & blind-box reveal (`BoxReveal.tsx`, `VictoryTakeover.tsx`)
  - Bigscreen (`(screen)/bigscreen`)
  - NFC activation landing (`/activate`)

This lets next year's committee reskin the platform by changing colors, copy, and the
hero-moment illustrations only — without re-litigating the whole design system.

## System layer tokens

**Color** — Keep the existing `paper`/`ink` neutral base. Use the existing configurable
`--brand-1` as a single **flat** accent color everywhere in system chrome (buttons,
active states, focus rings, highlighted badges). Drop `--brand-2` and every
`linear-gradient(brand-1, brand-2)` usage from the system layer entirely — gradients are
reserved for skin-layer illustration only. New default `--brand-1`: deep cobalt
`#1e3a8a` (replacing the current teal `#0891b2`/purple `#7c3aed` gradient pair as
system-layer default). Status colors (`status.open` green / `status.busy` red /
`status.closed` gray) are unchanged — the accent must never reuse those hues.

**Typography** — Replace the Inter + Space Grotesk pairing with a single family,
**General Sans** (Fontshare, offered free for commercial use — confirm exact license
terms before implementation — self-hosted via `next/font/local`
— no CDN runtime dependency, preserving the existing "flaky venue wifi" constraint in
`layout.tsx`). Use one family across the full weight range (400 body → 900 display)
instead of pairing two fonts. Keep JetBrains Mono for data/status readouts (IDs, timers,
token counts).

**Shape & elevation** — Replace the soft blurred shadows (`shadow-raised` /
`shadow-floating` / `shadow-overlay`, the "glass card" look named as an anti-reference in
[PRODUCT.md](../../../PRODUCT.md)) with thin 1px borders and minimal flat elevation.
Border-radius scale stays similar in size but should read crisp, not glassy.

## Rejected directions (and why)

Explored interactively before landing on the above — kept here so the reasoning isn't
re-litigated next time someone revisits this:

1. **Literal theme skins** (paper ticket-stub, "night ops" control room, illustrated
   vortex/portal) — rejected as "主题皮肤" (costume): ties system-layer chrome to one
   year's theme, breaks the multi-year reuse goal.
2. **Pure Linear-style minimal** (monochrome, default-feeling restraint) — rejected as
   too generic; converges back toward the same "AI-common" look this redesign is trying
   to escape (confirmed by comparing against the Netlify booking-tool screenshot, which
   has the same soft-shadow/rounded-card/bold-headline shape).
3. **Partiful-style personality** (custom lettering, grain texture, high-energy color
   baked into system chrome) — right instinct (personality via type + one confident
   color, not decoration) but too much of it lives in the system layer; would force a
   full system redesign every time the yearly theme changes.

The resolved direction borrows Cash App's model: neutral base + one flat, deliberate
brand color + bold single-family type — restrained enough to last years, distinctive
enough to not read as a template.

## Out of scope

- `xmum-orientation-interviewslot.netlify.app` — a separate Netlify deployment (not in
  this repo, not built with this stack), made independently by the committee's VOC. Not
  part of this redesign; revisit once the system layer above is real and it's obvious
  whether that tool should follow it.
- Rolling the new tokens out across all ~15 existing pages/roles (dashboard, map,
  inventory, gm, guardian, committee, admin, bigscreen, etc.) — this spec defines the
  tokens only. Page-by-page rollout is separate implementation work.
- Designing the actual Vortexa hero-moment illustrations/content — the 2026/12 theme
  isn't locked yet; the hero-moment *boundary* is defined here, the content is a later,
  separate decision that doesn't block building the system layer.
