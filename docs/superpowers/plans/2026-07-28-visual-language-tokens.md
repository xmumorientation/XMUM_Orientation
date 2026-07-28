# Visual Language Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the gradient/soft-shadow/Inter+Space-Grotesk system-layer look with the
flat-cobalt / thin-elevation / General-Sans language approved in
[docs/superpowers/specs/2026-07-28-visual-language-redesign-design.md](../specs/2026-07-28-visual-language-redesign-design.md),
without touching per-page rollout (out of scope — see spec).

**Architecture:** This is a token/shared-component change, not a per-page rewrite. Five
files carry almost the whole app's look because everything else consumes them: the
Tailwind config (shadow scale, font family), `globals.css` (`--brand-1` default,
`.btn-primary`, `.starlight-rule`), the shared `Button` CVA component, and the root
font loader in `layout.tsx`. One inline gradient on the dashboard hero card doesn't go
through a shared class and needs its own one-line fix. Everything else in the app
(admin, gm, guardian, checkin, etc.) already reads `.btn-primary`/`.card`/`shadow-*`/
`font-sans`/`font-display` and picks up the new look automatically — no changes needed
there in this plan.

**Tech Stack:** Next.js App Router, Tailwind CSS, `next/font/local` (self-hosted
General Sans from Fontshare), `next/font/google` (JetBrains Mono, unchanged).

## Global Constraints

- No test runner exists in this repo (`package.json` has no `test` script) — verify
  each task with `npm run typecheck` and `npm run lint`; verify the whole plan with
  `npm run build` plus a manual visual check in the browser (final task).
- Do not touch `src/app/(auth)/layout.tsx`, `src/components/BoxReveal.tsx`,
  `src/components/VictoryTakeover.tsx`, `src/app/(screen)/bigscreen/**`, or
  `src/app/activate/page.tsx` — these are the spec's "hero moment" canvases and keep
  `--brand-2`/gradients on purpose.
- Do not touch any page under `src/app/(app)/gm`, `src/app/(app)/guardian`,
  `src/app/(app)/admin/**`, `src/app/(app)/committee`, map/attendance/checkin/etc. —
  out of scope for this plan; they inherit the new look via the shared classes/fonts
  this plan changes, and get their own pass in a later plan per the spec.
- The spec's "dense/form-heavy layout pattern" (whitespace rhythm, single divider
  instead of card-wrapping, plain-text secondary links) is a per-page layout change,
  not a token — it's intentionally not in this plan and belongs to that later
  page-by-page pass.
- `General Sans` ships weights 400/500/600/700 only. Existing `font-black` (900)
  classNames elsewhere in the app are out of scope to change in this plan — they'll
  render with the browser's synthetic bold on top of 700, which is acceptable.

---

## File Structure

- Modify: `tailwind.config.ts` — `boxShadow` scale (tighter, less blur), `fontFamily`
  (`sans`/`display` both point at the new single font variable)
- Modify: `src/app/globals.css` — `--brand-1` default + `--brand-1-rgb`, `.btn-primary`
  (flat instead of gradient), `.starlight-rule` (flat instead of gradient)
- Modify: `src/components/ui/Button.tsx` — `primary` intent variant (flat instead of
  gradient)
- Modify: `src/app/(app)/dashboard/page.tsx` — one inline gradient class on the "Next
  action" hero card
- Create: `src/app/fonts/general-sans/general-sans-{400,500,600,700}.woff2`
- Modify: `src/app/layout.tsx` — replace `Inter`/`Space_Grotesk` google-font loaders
  with a single `next/font/local` General Sans loader

---

### Task 1: Tighten the shadow scale

**Files:**
- Modify: `tailwind.config.ts:56-61`

**Interfaces:**
- Produces: `shadow-raised`, `shadow-floating`, `shadow-overlay` Tailwind utilities
  (unchanged names — every consumer keeps working, only the rendered value changes)

- [ ] **Step 1: Replace the blurred shadow values with tighter, flatter ones**

Current (`tailwind.config.ts:56-61`):

```ts
      boxShadow: {
        flat: "none",
        raised: "0 1px 2px rgba(28,26,23,0.05), 0 2px 8px rgba(28,26,23,0.06)",
        floating: "0 8px 24px rgba(28,26,23,0.10), 0 2px 6px rgba(28,26,23,0.06)",
        overlay: "0 24px 90px rgba(28,26,23,0.18)",
      },
```

Replace with:

```ts
      boxShadow: {
        flat: "none",
        raised: "0 1px 2px rgba(28,26,23,0.06)",
        floating: "0 4px 12px rgba(28,26,23,0.10)",
        overlay: "0 12px 32px rgba(28,26,23,0.16)",
      },
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: exits 0, no errors (this is a plain object literal change, nothing to type-check against it directly, but confirms the file still parses as valid TS)

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: exits 0, no new warnings

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts
git commit -m "$(cat <<'EOF'
Tighten shadow scale from soft/blurred to flat elevation

Per docs/superpowers/specs/2026-07-28-visual-language-redesign-design.md:
drop the diffuse "glass card" blur radius on raised/floating/overlay,
keep the same utility names so every existing consumer picks up the
new look with no other file changes.
EOF
)"
```

---

### Task 2: Flatten the system-layer accent color

**Files:**
- Modify: `src/app/globals.css:8` (`--brand-1` default)
- Modify: `src/app/globals.css:12` (`--brand-1-rgb`)
- Modify: `src/app/globals.css:54-57` (`.btn-primary`)
- Modify: `src/app/globals.css:110-113` (`.starlight-rule`)

**Interfaces:**
- Produces: `--brand-1` now defaults to `#1e3a8a` (deep cobalt) instead of
  `#0891b2` (teal); `.btn-primary` and `.starlight-rule` render as flat `--brand-1`
  instead of a `--brand-1`→`--brand-2` gradient. `--brand-2` and
  `--brand-2-rgb` are left untouched (still consumed by the hero-moment files listed
  in Global Constraints).

- [ ] **Step 1: Change the default brand-1 value and its rgb channel triple**

Current (`src/app/globals.css:6-13`):

```css
  :root {
    /* Event brand accents — overridden at runtime from Admin → Brand */
    --brand-1: #0891b2;
    --brand-2: #7c3aed;
    /* Channel triples so Tailwind can apply opacity modifiers (bg-brand-1/20)
       to a runtime-set CSS var. Keep these in sync with --brand-1/--brand-2. */
    --brand-1-rgb: 8 145 178;
    --brand-2-rgb: 124 58 237;
  }
```

Replace with:

```css
  :root {
    /* Event brand accents — overridden at runtime from Admin → Brand */
    --brand-1: #1e3a8a;
    --brand-2: #7c3aed;
    /* Channel triples so Tailwind can apply opacity modifiers (bg-brand-1/20)
       to a runtime-set CSS var. Keep these in sync with --brand-1/--brand-2. */
    --brand-1-rgb: 30 58 138;
    --brand-2-rgb: 124 58 237;
  }
```

- [ ] **Step 2: Flatten `.btn-primary` from a gradient to a solid fill**

Current (`src/app/globals.css:54-57`):

```css
  .btn-primary {
    @apply btn text-white shadow-raised;
    background-image: linear-gradient(90deg, var(--brand-1), var(--brand-2));
  }
```

Replace with:

```css
  .btn-primary {
    @apply btn text-white shadow-raised bg-brand-1;
  }
```

- [ ] **Step 3: Flatten `.starlight-rule` (the accent underline used on every page
      heading via the shared `PageTitle` component) from a gradient to a solid fill**

Current (`src/app/globals.css:109-114`):

```css
/* Brand accent underline used on page headings */
.starlight-rule {
  background: linear-gradient(90deg, var(--brand-1), var(--brand-2));
  height: 3px;
  border-radius: 999px;
}
```

Replace with:

```css
/* Brand accent underline used on page headings */
.starlight-rule {
  background: var(--brand-1);
  height: 3px;
  border-radius: 999px;
}
```

- [ ] **Step 4: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "$(cat <<'EOF'
Flatten system-layer accent to a solid cobalt, drop gradients

New --brand-1 default is #1e3a8a (deep cobalt), replacing the teal/
purple gradient pair in .btn-primary and .starlight-rule. --brand-2
stays defined for the hero-moment surfaces that still use it.
EOF
)"
```

---

### Task 3: Flatten the shared Button component's primary variant

**Files:**
- Modify: `src/components/ui/Button.tsx:20-23`

**Interfaces:**
- Consumes: `--brand-1` from Task 2 (reads it via the existing `bg-brand-1` Tailwind
  utility, which already resolves to `rgb(var(--brand-1-rgb) / <alpha-value>)` per
  `tailwind.config.ts:29-32` — unchanged)
- Produces: `buttonVariants({ intent: "primary" })` now renders a flat `bg-brand-1`
  fill instead of a `brand-1`→`brand-2` gradient. `secondary`/`danger`/`ghost`/
  `console` variants are untouched.

- [ ] **Step 1: Replace the inline gradient with the flat brand-1 utility**

Current (`src/components/ui/Button.tsx:20-23`):

```ts
      intent: {
        primary:
          "text-white shadow-raised bg-[image:linear-gradient(90deg,theme(colors.brand.1),theme(colors.brand.2))]",
        secondary:
```

Replace with:

```ts
      intent: {
        primary: "text-white shadow-raised bg-brand-1",
        secondary:
```

- [ ] **Step 2: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Button.tsx
git commit -m "$(cat <<'EOF'
Flatten Button primary variant to solid brand-1

Matches the .btn-primary flattening in globals.css — the two button
systems in this codebase (legacy CSS classes and the newer CVA
component) now agree on flat accent, no gradient.
EOF
)"
```

---

### Task 4: Fix the dashboard hero card's inline gradient

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx:147`

**Interfaces:**
- Consumes: `--brand-1` from Task 2
- Produces: the "Next action" hero card on `/dashboard` renders with a flat
  `bg-brand-1` background instead of a `brand-1`→`brand-2` gradient. This is the one
  spot in the app that builds its own arbitrary-value gradient class instead of going
  through `.btn-primary`/`Button`, so it needs its own fix.

- [ ] **Step 1: Replace the arbitrary gradient class with the flat utility**

Current (`src/app/(app)/dashboard/page.tsx:147`):

```tsx
        <div className="bg-[linear-gradient(90deg,var(--brand-1),var(--brand-2))] px-4 py-3 text-white">
```

Replace with:

```tsx
        <div className="bg-brand-1 px-4 py-3 text-white">
```

- [ ] **Step 2: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx"
git commit -m "$(cat <<'EOF'
Flatten dashboard hero card gradient to solid brand-1

Dashboard is a system-layer screen per the visual language spec, not
a hero moment — it shouldn't carry the brand-1/brand-2 gradient.
EOF
)"
```

---

### Task 5: Self-host General Sans and retire Inter + Space Grotesk

**Files:**
- Create: `src/app/fonts/general-sans/general-sans-400.woff2`
- Create: `src/app/fonts/general-sans/general-sans-500.woff2`
- Create: `src/app/fonts/general-sans/general-sans-600.woff2`
- Create: `src/app/fonts/general-sans/general-sans-700.woff2`
- Modify: `src/app/layout.tsx`
- Modify: `tailwind.config.ts:44-48`

**Interfaces:**
- Produces: a `--font-sans` CSS variable (General Sans, weights 400–700) that both the
  `font-sans` and `font-display` Tailwind utilities resolve to. `--font-mono`
  (JetBrains Mono) is unchanged. Every existing `className="font-sans"` or
  `className="font-display"` usage in the app keeps working with no changes — only the
  variable they point at changes.

- [ ] **Step 1: Download the four General Sans weight files**

General Sans is a free-for-commercial-use family from Fontshare — confirm the exact
license terms at <https://www.fontshare.com/fonts/general-sans> before shipping to
production. These URLs were verified live on 2026-07-28 (stable across repeat
requests, ~21-23KB each):

```bash
mkdir -p src/app/fonts/general-sans
curl -sL "https://cdn.fontshare.com/wf/MFQT7HFGCR2L5ULQTW6YXYZXXHMPKLJ3/YWQ244D6TACUX5JBKATPOW5I5MGJ3G73/7YY3ZAAE3TRV2LANYOLXNHTPHLXVWTKH.woff2" -o src/app/fonts/general-sans/general-sans-400.woff2
curl -sL "https://cdn.fontshare.com/wf/3RZHWSNONLLWJK3RLPEKUZOMM56GO4LJ/BPDRY7AHVI3MCDXXVXTQQ76H3UXA63S3/SB2OEB6IKZPRR6JT4GFJ2TFT6HBB6AZN.woff2" -o src/app/fonts/general-sans/general-sans-500.woff2
curl -sL "https://cdn.fontshare.com/wf/K46YRH762FH3QJ25IQM3VAXAKCHEXXW4/ISLWQPUZHZF33LRIOTBMFOJL57GBGQ4B/3ZLMEXZEQPLTEPMHTQDAUXP5ZZXCZAEN.woff2" -o src/app/fonts/general-sans/general-sans-600.woff2
curl -sL "https://cdn.fontshare.com/wf/KWXO5X3YW4X7OLUMPO4X24HQJGJU7E2Q/VOWUQZS3YLP66ZHPTXAFSH6YACY4WJHT/NIQ54PVBBIWVK3PFSOIOUJSXIJ5WTNDP.woff2" -o src/app/fonts/general-sans/general-sans-700.woff2
ls -la src/app/fonts/general-sans/
```

Expected: 4 files listed, each roughly 20-24KB, none 0 bytes.

If any of these URLs 404 (Fontshare occasionally rotates its CDN paths), regenerate
them from the live API instead of guessing:

```bash
curl -s "https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap" \
  | grep -oE "//cdn.fontshare.com[^']+\.woff2" | sort -u
```

This returns 4 URLs in weight order (400, 500, 600, 700); prefix each with `https:`
and re-run the matching `curl -o` command above.

- [ ] **Step 2: Replace the Inter/Space Grotesk loaders with a single local General
      Sans loader**

Current (`src/app/layout.tsx:1-24`):

```tsx
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "./globals.css";
import { cn } from "@/lib/utils";

// Self-hosted at build time by next/font — no runtime dependency on a font
// CDN, which matters on flaky venue wifi during the live event.
const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});
```

Replace with:

```tsx
import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "./globals.css";
import { cn } from "@/lib/utils";

// Self-hosted at build time — no runtime dependency on a font CDN, which
// matters on flaky venue wifi during the live event. General Sans ships
// weights 400/500/600/700 only (no 800/900); font-black usages elsewhere
// fall back to browser synthetic bolding on top of 700.
const sans = localFont({
  src: [
    {
      path: "./fonts/general-sans/general-sans-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/general-sans/general-sans-500.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/general-sans/general-sans-600.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/general-sans/general-sans-700.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-sans",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});
```

Then, in the same file, update the `<html>` element (`src/app/layout.tsx:44-47`):

Current:

```tsx
    <html
      lang="en"
      className={cn(display.variable, body.variable, mono.variable)}
    >
```

Replace with:

```tsx
    <html lang="en" className={cn(sans.variable, mono.variable)}>
```

- [ ] **Step 3: Point `font-sans` and `font-display` at the same variable**

Current (`tailwind.config.ts:44-48`):

```ts
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
```

Replace with:

```ts
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["var(--font-sans)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
```

- [ ] **Step 4: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0. If typecheck complains about `next/font/local`, confirm the
installed `next` version supports it (it does from 13.x onward; this repo is on
`^15.1.6` per `package.json`).

- [ ] **Step 5: Commit**

```bash
git add src/app/fonts src/app/layout.tsx tailwind.config.ts
git commit -m "$(cat <<'EOF'
Replace Inter + Space Grotesk with self-hosted General Sans

One family across weights 400-700 for both font-sans and font-display,
matching the visual language spec's "type carries the personality, not
two mismatched fonts" call. Self-hosted via next/font/local (same
flaky-venue-wifi constraint the previous next/font/google setup noted).
EOF
)"
```

---

### Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full check sequence**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all three exit 0. `next build` additionally confirms the local font files
resolve correctly at build time (a bad path in Task 5 Step 2 fails the build, not
just typecheck).

- [ ] **Step 2: Start the dev server and visually check `/login`**

Run: `npm run dev`, open `http://localhost:3000/login` in a browser.

Confirm:
- Body/heading text renders in General Sans (rounder, more humanist letterforms than
  Inter's — check the lowercase "a" and "g")
- The submit button is a flat cobalt (`#1e3a8a`) fill, not a teal-to-purple gradient
- Card edges look like a crisp thin border, not a soft drop shadow

- [ ] **Step 3: Visually check `/dashboard`**

This route requires an authenticated session. If you already have a local Supabase
instance configured and a test account (see
[docs/SETUP.md § 3](../../SETUP.md) "First admin account"), log in and open
`/dashboard`; confirm the "Next action" hero card is a flat cobalt fill (not a
gradient) and the page heading's accent underline (`.starlight-rule`) is solid, not a
gradient.

If no local Supabase/test account is available in this environment, skip the live
check and instead re-read the diff from Task 4 to confirm `bg-brand-1` replaced the
gradient class exactly as specified — this is a single className swap with no other
logic involved, so a code read is sufficient confirmation when a live session isn't
reachable.

- [ ] **Step 4: Report results**

No commit for this task — it's verification only. Summarize what was confirmed live
vs. confirmed by code read (per Step 3) when reporting completion.
