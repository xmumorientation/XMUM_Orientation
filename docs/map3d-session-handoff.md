# 3D map: handoff for a new conversation (2026-10-15, about 17:20)

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

| Batch | State |
|---|---|
| 1. Embeddable `CampusScene` + phone lite mode | **Done**, commit `3eca8cd` |
| 2. Split `CampusMap.tsx` into a data hook, panels and the 2D view (no behaviour change) | **Done**, commit `31cf14c` |
| 3. `CampusMap3DView` (stations, group pins, lightbulbs, taps) + dev preview `/map3d/preview` with mock data | **Committed after the stop (see git log; the phone fit distance was fixed, the badge-centring issue is still open).** Earlier note: stopped at 17:37 (usage 78%). The code is written and tsc/eslint are clean: `src/components/campus-map/CampusMap3DView.tsx`, `src/components/map3d/markers.tsx`, `places.ts`, a small change to `CampusScene.tsx`, and `src/app/map3d/preview/` (mock data, `?role=freshie|faci|staff|admin`). The agent's temporary debug logs have been removed. **Open bug it was fixing:** on a phone in fullscreen, the camera "flight" to a tapped station or cluster badge ends in the wrong place, or does not centre it (the flight code is near the end of `markers.tsx`). To finish: fix that, screenshot phone (390x844m) and desktop for the freshie and admin roles, then commit as step 3 and add a Progress line to the plan. |
| 4. Switch `/map`, `/checkin` and `/committee` to 3D, with the 2D view as fallback | Waiting for Ben's go |
| 5. Admin tools in 3D | Waiting |
| 6. Review and fixes | Waiting |

### Vortexa Funfair (plan step 7, done in parallel)

- **Ben's decisions:**
  - each zone has its own style: west = A Neon Cyber (brightened for daytime), central = C Toy low-poly, east = B Retro carnival;
  - all three share the A-style VORTEXA gate and the A-style powered-off look;
  - put it **straight into the map** (no separate preview for Ben);
  - the land must not look empty;
  - the lightbulbs are shared by everyone, Admin chooses which zone powers up after which key, dorm names stay on the ride labels, fireworks come every few minutes after the finale, and there is no sound.
- **Stopped at 17:23** to save usage (Ben's limit was at 65% and rising about 1.4%/min with four agents). The three zone files were still empty stubs, so nothing was lost; restart the zone build from scratch (same brief: one agent per zone). It had been running as workflow `wwo3unxai`, three agents, one per zone. They write **only new, uncommitted files**:
  - `src/components/map3d/funfair/west.tsx` and `gate.tsx`;
  - `central.tsx`;
  - `east.tsx` (plus optional sub-folders);
  - preview routes `src/app/map3d/fz-west`, `fz-central` and `fz-east` (`?power=0|1&mode=night&lite=1&cam=…`).

  Shared helpers I wrote: `funfair/common.ts`, `funfair/dorms.ts` and `funfair/ZonePreview.tsx`.
- Style benches from the first round (to be deleted once the funfair is wired in):
  - `src/components/map3d/funfair-lab/`;
  - `src/app/map3d/funfair-a|b|c`.
- **Next: funfair integration.** Do it only after batch 3 is committed, because it touches shared files.
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

## Useful facts

- The dev server is `npx next dev -p 3000`. If nothing is listening on port 3000, start it.
- Screenshots: `scratchpad/shot.mjs`, run as `CDP_PORT=<port> node --experimental-websocket shot.mjs <dir> <waitMs> <W>x<H>[m] <url> <out.png> …`. The scratchpad is session-local, so a new session must write the script again: headless Chrome over the DevTools protocol, device-metrics emulation for phones, and it prints console errors.
- Checks: `npx tsc --noEmit -p .`. Errors under `tests/` and `vitest.config.ts` were there before: the test dependencies aren't installed, so the tests can't run. Then `npx eslint <changed files>`.
- Workflows don't survive a session. A new conversation can't resume `w2i3sdadt` or `wwo3unxai`; it has to continue from the files and this note.
