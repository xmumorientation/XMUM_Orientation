# 3D map: handoff for a new conversation (updated 2026-10-15, about 17:55)

Ben may continue this work in a new Claude conversation. This file says where everything stands. Read it before doing anything, then read:

- [map3d-implementation-plan.md](map3d-implementation-plan.md): the plan, Ben's decisions, and the "Progress" log;
- [map3d-funfair-design.md](map3d-funfair-design.md): the funfair design;
- [map3d-draft-handoff.md](map3d-draft-handoff.md): the 3D map itself.

## Rules Ben set

- Branch `map-3d-draft` only. **Never push** (Ben pushes himself). Commits on the branch are fine once the checks pass.
- Work in **batches**: finish one, show Ben the results (screenshots in Chinese), and wait for his go before the next one.
- He watches his usage limit closely. Keep agents few. If he says the 5-hour limit is above about 85%:
  - start nothing new;
  - stop the optional work (the funfair) first;
  - let the most important step finish and commit.
- The Supabase project in `.env.local` is the **real remote project**. Never write to it: no migrations, no data changes. Check pages with the dev-only preview routes and mock data instead.
- Talk to Ben in Chinese, short and direct.

## Where things stand

### Replacing the 2D map with 3D (plan steps 1–6)

Ben's batches map to the plan's steps as follows.

| Ben's batch | Plan step | State |
|---|---|---|
| 1 | 1. Embeddable `CampusScene` + phone lite mode | **Done**, commit `3eca8cd` |
| 2 | 2. Split `CampusMap.tsx` into a data hook (`campus-map/useCampusMapData.ts`), panels (`CampusMapPanels.tsx`) and the 2D view (`CampusMap2DView.tsx`), with no behaviour change | **Done**, commit `31cf14c` |
| 3 | 3. `campus-map/CampusMap3DView.tsx`, `map3d/markers.tsx`, `map3d/places.ts` + the dev preview `/map3d/preview` (mock data; `?role=freshie\|faci\|staff\|admin`, `&full=1`, `&view=2d`) | **Done**, commit `0e24148`. Ben has seen the screenshots. One known issue: on a phone in fullscreen, tapping a station badge does not always centre the camera on the building (`CameraRig` at the end of `markers.tsx`; the badge tap is in `CampusMap3DView` `taps.badge`). Fix it in batch 4. |
| **4** (next, **waiting for Ben's go**) | 4 + 5 | Switch `/map`, `/checkin` and `/committee` to 3D (`next/dynamic`, `ssr: false`, a loading state, the 2D view when WebGL is missing or fails, `?map=2d` to force 2D). **Remove the lightbulb markers and the lightbulb layer from the 3D view** (see below). Admin tools in 3D: station add/edit, the accuracy check in metres, anchor tools labelled 2D-only. Fix the badge-centring issue. One agent, about 10–15% of Ben's 5-hour limit; it can be split into "pages + fallback" and "Admin tools". |
| 5 | 6 | Review and fixes. Waiting. |

### Vortexa Funfair (plan step 7, done in parallel)

- **Ben's decisions:**
  - each zone has its own style: west = A Neon Cyber (brightened for daytime), central = C Toy low-poly, east = B Retro carnival;
  - all three share the A-style VORTEXA gate and the A-style powered-off look;
  - put it **straight into the map** (no separate preview for Ben);
  - the land must not look empty;
  - the lightbulbs are shared by everyone, Admin chooses which zone powers up after which key, dorm names stay on the ride labels, fireworks come every few minutes after the finale, and there is no sound.
- The scaffolding and the three style benches are **committed** (see git log, "funfair scaffolding"), so the chosen style code is safe. The zone build was **stopped at 17:23** to save usage (Ben's limit was at 65% and rising about 1.4%/min with four agents). The three zone files were still empty stubs, so nothing was lost; restart the zone build from scratch (same brief: one agent per zone). It had been running as workflow `wwo3unxai`, three agents, one per zone. The zone agents may write **only these files**:
  - `src/components/map3d/funfair/west.tsx` and `gate.tsx`;
  - `central.tsx`;
  - `east.tsx` (plus optional sub-folders);
  - preview routes `src/app/map3d/fz-west`, `fz-central` and `fz-east` (`?power=0|1&mode=night&lite=1&cam=…`).

  Shared helpers I wrote: `funfair/common.ts`, `funfair/dorms.ts` and `funfair/ZonePreview.tsx`.
- Style benches from the first round (to be deleted once the funfair is wired in):
  - `src/components/map3d/funfair-lab/`;
  - `src/app/map3d/funfair-a|b|c`.
- **Next: rebuild the three zones (one agent per zone, styles from `funfair-lab/styleA|B|C.tsx`), then integrate.** Integration touches shared files, so don't run it at the same time as batch 4.
  1. Render the three zones and the gate inside `CampusScene`.
  2. Replace the brown field on the ground with funfair paving and paths.
  3. Keep trees off the rides.
  4. Add labels such as "LY3 · Vortexa Eye" and "Vortexa Funfair (game zone)".
  5. Power each zone from the lightbulbs, with the default mapping in code: east ← B1, west ← A3, central ← TF. On `/map3d`, `?funfair=1,0,1` forces the states.
  6. Delete the lab and `fz-*` routes.
  7. Run the checks, commit, and show Ben screenshots of the whole map.
  8. The Admin mapping table (`funfair_zones`) and its UI need a migration. Write the file but **do not apply it** to the remote project.

### Lightbulbs in 3D (Ben, 2026-10-15)

- Batch 3 was building lightbulb markers and a lightbulb layer into the 3D view, before this decision.
- Batch 4 must **remove** them from the 3D view: the funfair zones show which lights are on, and the location photos on the Items page tell groups where to go.
- Keep the lightbulb list, Admin's reset and the 2D fallback's lightbulb layer. "Move lightbulb" stays 2D only. See the funfair design, section "How the game reaches the funfair".

## Ben may keep polishing the buildings and the funfair: how to avoid breaking progress

The visual work and the 2D→3D replacement live in different files, so they can go on in parallel if the following holds.

| What changes | Files | Safe? | Rule |
|---|---|---|---|
| How a building or landmark looks (roofs, colours, windows, the statue, B1, courts, water, trees) | `map3d/buildings.tsx`, `statue.tsx`, `sports.tsx`, `water.tsx`, `vegetation.tsx`, `textures.ts`, `atmosphere.tsx` | Yes | Keep the exported component names and props, and keep the lite-mode branches (phones). |
| Where a building stands or how big it is | `map3d/geo.ts` (`BLOCKS`, `B1_PLACE`, `DOME`, `STATUE`), `campusData.ts`, `scripts/map3d/*` | Careful | Station markers and hit areas follow `map3d/places.ts`, which reads these positions. After a move, check `/map3d/preview` (markers on the right buildings) and `inKeepOut` (no trees inside). Don't change `UNITS_PER_M`, the world axes or `gpsToWorld`: group GPS pins depend on them. |
| The funfair | everything under `map3d/funfair/` and `funfair-lab/` | Yes | Self-contained until integration. Integration is the only step that touches `CampusScene.tsx`, `ground.tsx` and `geo.ts`. |
| The map pages and data | `components/CampusMap.tsx`, `components/campus-map/*`, the pages | No, not during batch 4 | Batch 4 owns these. Don't edit them by hand while it runs. |

- **One task, one commit.** Commit visual tweaks on their own (for example "style(map3d): …") and never mix them into a batch commit.
- **When two things run at once,** each agent `git add`s only its own files.
- **After any visual change,** look at `/map3d` (the whole map), `/map3d/preview` (markers still on their buildings) and a phone size (`390x844m`, lite mode).

## Useful facts

- The dev server is `npx next dev -p 3000`. If nothing is listening on port 3000, start it.
- Screenshots: `scratchpad/shot.mjs`, run as `CDP_PORT=<port> node --experimental-websocket shot.mjs <dir> <waitMs> <W>x<H>[m] <url> <out.png> …`. The scratchpad is session-local, so a new session must write the script again: headless Chrome over the DevTools protocol, device-metrics emulation for phones, and it prints console errors.
- Checks: `npx tsc --noEmit -p .`. Errors under `tests/` and `vitest.config.ts` were there before: the test dependencies aren't installed, so the tests can't run. Then `npx eslint <changed files>`.
- `scratchpad/impl/step3/probe.mjs` (session-local) replays taps, drags and screenshots from a JSON step list. It is useful for checking taps on a phone. Write it again in a new session if needed.
- Workflows don't survive a session. A new conversation can't resume `w2i3sdadt` or `wwo3unxai`; it has to continue from the files and this note.
