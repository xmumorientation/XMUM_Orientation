# 3D map: handoff for a new conversation (updated 2026-10-16)

Ben may continue this work in a new Claude conversation. This file says where everything stands. Read it before doing anything, then read:

- [map3d-implementation-plan.md](map3d-implementation-plan.md): the plan, Ben's decisions, and the "Progress" log;
- [map3d-funfair-design.md](map3d-funfair-design.md): the funfair design;
- [map3d-draft-handoff.md](map3d-draft-handoff.md): the 3D map itself.

## Rules Ben set

- **Never push** (Ben pushes himself). Commits on the working branch are fine once the checks pass.
- Branches: `map-3d-draft` (PR #39), `map3d-batch4` (PR #40) and `map3d-batch5` (PR #41) are merged. **All funfair work is on `funfair-central`** (Ben, 2026-10-16: no more new branches). Before Ben pushes it, merge the latest `origin/main` into it and check that `git merge-tree --write-tree origin/main HEAD` is clean, so its PR merges without conflicts.
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
| 3 | 3. `campus-map/CampusMap3DView.tsx`, `map3d/markers.tsx`, `map3d/places.ts` + the dev preview `/map3d/preview` (mock data; `?role=freshie\|faci\|staff\|admin`, `&full=1`, `&map=2d` (was `&view=2d`), `&check=1` for Admin's accuracy check) | **Done**, commit `0e24148`. Ben has seen the screenshots. One known issue: on a phone in fullscreen, tapping a station badge does not always centre the camera on the building (`CameraRig` at the end of `markers.tsx`; the badge tap is in `CampusMap3DView` `taps.badge`). Fix it in batch 4. |
| 4 | 4 + 5 | **Done**, merged (PR #40). `/map`, `/checkin` and `/committee` draw the 3D map through `campus-map/CampusMapView.tsx`: `next/dynamic` with `ssr: false`, a loading card, and the 2D view when WebGL is missing, when the 3D view throws (an error boundary), or with `?map=2d`. No lightbulb markers or layer in 3D; the lightbulb list sits under the 3D map (Admin keeps Reset; Move is 2D only). Fullscreen has an Auto / Sunset / Day / Night switch (top right, accent = group colour or Welcome cyan). Admin's accuracy check in 3D: tap the ground, see the GPS error in metres, nothing saved; saved anchors are labelled 2D only. Badge centring on phones: taps that moved 8–16 px were thrown away as drags; touch now allows 16 px (`isTap` in `markers.tsx`), and a flight first plays out the controls' damping. |
| 5 | 6 | **Done**, merged (PR #41). See "Batch 5" below. |

### Vortexa Funfair (plan step 7, done in parallel)

- **Ben's decisions:**
  - each zone has its own style: west = A Neon Cyber (brightened for daytime), central = C Toy low-poly, east = B Retro carnival;
  - all three share the A-style VORTEXA gate and the A-style powered-off look;
  - put it **straight into the map** (no separate preview for Ben);
  - the land must not look empty;
  - the lightbulbs are shared by everyone, Admin chooses which zone powers up after which key, dorm names stay on the ride labels, fireworks come every few minutes after the finale, and there is no sound.
- **Batches** (Ben's go between each; all on `funfair-central`):

  | Batch | Work | State |
  |---|---|---|
  | F1 | Central zone (style C): LY4 teacups, LY5 bumper cars, LY8 swing ride, LY9 drop tower, the crossing with the Starlight pole and the power box, the north square (fountain, stalls, stage) | **Done.** Code: `funfair/central.tsx` and `funfair/central/`. Dev page `/map3d/fz-central` (`?power=0\|1`, `?flip=<ms>` powers up after a delay, `?stats=1`, `?zone=0`; add `?perf=0` for headless shots). Desktop cost: +28 draw calls, about +118k triangles (shadow pass included). |
  | F2 | West zone (style A, brightened for day): LY3 Vortexa Eye with food stalls, LY1 carousel, LY2 game booths with the duck shoot, LY6 and LY7 spider rides; the shared VORTEXA gate **Done.** `funfair/west.tsx` and `funfair/west/` (origin world (35.2, -38.2)), `funfair/gate.tsx` (world (20, -11.5); `power` = share of zones on: pillars at 1/3, letters at 2/3, arch at 1). Extras beyond the brief: a lagoon with a lighthouse and duck boats, a palm grove with a neon dome, a food court. Dev page `/map3d/fz-west` (`?gate=0..1\|off`, `?west=0`). Desktop: West +34 draw calls / +160k triangles, gate +5 / +7k; lite West +23 / +83k. |
  | F3 | East zone (style B): Canteen D6 Big Top, D4/D5 roller coaster, D2 haunted house, D3 pirate ship, D1 arcade | **Done.** `funfair/east.tsx` and `funfair/east/` (origin world (29, 18); `onLawn()` in `east/layout.ts`). The pirate ship moved 14 m north and the arcade 21 m north to stay on the lawn. Extras: a helter-skelter, a food court, circus wagons. A walk starts where Central's promenade ends. Dev page `/map3d/fz-east`. Desktop +15 draw calls / +127k triangles; lite +12 / +56k. |
  | F4 | Integration into the map | **Done** (see "In the map" below) |
  | F5 | Admin control | **Done; migration 0088 not applied** (see "Admin control" below) |

- **The land** (Ben, 2026-10-16): the brown field is gone. The whole dorm land is lawn like the lake park (`FUNFAIR_LAND` in `geo.ts`), reaching west to LY1 and LY6, and the zones may use all of it, not just the old field. Zones have no lawn plate of their own: they add paths and raised plazas on the campus lawn (Central dropped its plate).
- **Depth precision:** `DepthRange` in `CampusScene` moves the camera's near plane out with its distance to the target (2.5%, 1 to 10). Thin layers (paths 0.12 m over the lawn, plaza rims) are then safe on phones at map distances. Still keep stacked flat layers at least 0.08 m apart.
- Until F4, the funfair touches only `src/components/map3d/funfair/`, `src/app/map3d/fz-*` and the docs, so teammates' work on `main` can't conflict with it. A zone writes only its own files: `west.tsx` and `gate.tsx` (plus `west/`), `east.tsx` (plus `east/`), and its `fz-*` route. Shared helpers: `funfair/common.ts`, `funfair/dorms.ts`, `funfair/ZonePreview.tsx`.
- **Later (polish; Ben: viewable and usable first, details later):**
  - West: the wheel plaza's night light pool floods it pink; the lighthouse beam is strong under bloom; palm fronds are flat blades; the carousel horses look grey under the canopy; check the gate pillars against Central's south hedge.
  - East: dim (and thin) the cables once a zone is on; the coaster train never stops in the station and its speed is a simple height formula; the loop is a rounded spline and there is no lift chain; ghosts and the prize wheel don't move, the Big Top's flags don't wave; no searchlights; the haunted house's porch post hides part of "HAUNTED" from some angles; no queue rails; no light strings across East's walks; trees on a plain grid and no hedges by the road; the Big Top's inside is a dark box.
  - All zones: bulb strings and pennants have no wire (they float up close); the bright neon cables at night (pink West, yellow East).
- `usePowerRamp` (`common.ts`) asks for frames while it ramps, so a power-up plays to the end on a map that draws on demand (the card, lite mode). Rides only move on drawn frames.
- Style benches from the first round (to be deleted once the funfair is wired in): `src/components/map3d/funfair-lab/` and `src/app/map3d/funfair-a|b|c`.
- **In the map (F4, 2026-10-16):**
  - `funfair/Funfair.tsx`: `Funfair` renders the three zones and the gate. `CampusScene` takes `funfair` (each zone 0 or 1, default all off) and renders it.
    - `ZONE_KEYS`: the default key for each zone (east ← B1, west ← A3, central ← TF).
    - `funfairFromBulbs()` turns lit lightbulbs into zone power. `CampusMap3DView` feeds it `data.bulbs`, which every role gets for lit bulbs and which updates live, so a newly lit bulb plays the power-up.
    - The gate gets the share of zones on.
  - Labels:
    - `funfair/labels.ts` has `RIDE_TAGS`, one per dorm with its ride ("LY3 · Vortexa Eye"). In the map view they are sprite tags shown when the camera is close, whether or not names are on (`RideTags` in `markers.tsx`, replacing `DormTags`).
    - `FUNFAIR_LABEL` "Vortexa Funfair (game zone)" is shown with the place names.
    - The dorm footprints are no longer drawn on the ground.
  - Drawing: full screen draws every frame while any zone is on, also in lite (the rides turn). The card still draws on demand; a power-up there plays to the end and then stops.
  - `/map3d` takes `?funfair=1,0,1` (west, central, east; default all on).
  - The style benches and the `fz-*` dev pages are deleted. View a zone with `/map3d?cam=…&funfair=…&mode=…`.
    - West: `cam=72,46,10,34,0,-30`.
    - Central: `cam=72,42,28,32,0,-11.5`.
    - East: `cam=68,46,52,29,0,16`.
  - Cost: the whole map on desktop is 828 draw calls and about 901k triangles (shadow pass included). The funfair adds roughly +85 calls / +410k triangles on desktop, and +60 / +200k in lite (from the zone builds). On slow phones the frame-rate probe steps down to lite, then to the 2D map.
  - Not done: a painted link path from West's Gate Walk to the gate (the orange strip along the park already joins them).
- **Phones at night (2026-10-16, Ben: lit zones were hard to see on his iPhone):**
  - Phones draw lite (no bloom, no point lights), so lit zones barely stood out. Lite now makes up for it.
  - Bulbs and neon tubes are 1.6× bigger (`LITE_LIGHT_SCALE`; `lightBake()` sets `Bake.widen`).
  - Powered paint and paving glow a little at night (`LITE_SELF_LIT`, `LITE_PAVING_LIT`; `uSelf` in each kit's paint shader).
  - The light pools are 1.4× bigger and stronger.
  - Soft halos sit over each zone's landmarks (`funfair/glow.tsx`, one draw call per zone, fading out within about 45–110 units of the camera).
  - At sunset, phones show the halos and light pools at about 40% of their night strength (`DUSK_SHARE` in `glow.tsx`; zones get `dusk`), with no self-glow.
  - Desktop and daytime are unchanged.
- **Admin control (F5, 2026-10-16):**
  - **Migration** `supabase/migrations/0088_funfair_zones.sql`, written but **not applied**; Ben's team applies it.
    - `funfair_zones`: one row per zone with its keys (`required`), `rule` (any/all) and `manual` override. It is seeded with the default keys, and only `is_game_lead()` can read it, since the keys would give away where the unlit bulbs are.
    - `fn_funfair_state()`: zone and on/off, for everyone signed in.
    - `fn_set_funfair_zone()`: game leads only.
    - Realtime is on for the table.
  - **Map side:**
    - `src/lib/funfair.ts` holds the shared types, the defaults and `funfairMissing()`. It has no 3D code.
    - `useCampusMapData({ loadFunfair })` (3D view only) asks `fn_funfair_state` on load, whenever the lit bulbs change, and every 30 s. If 0088 is missing it stops after the first 404 and uses `funfairFromBulbs()` with the default keys. The result is `data.funfair`; the dev preview's mock fills it from the default keys.
  - **The cards:** `useFunfairZones()` (`src/components/useFunfairZones.ts`) loads and saves for both.
    - Admin → Live control: `components/admin/FunfairZones.tsx`.
    - HOGM → Game control, new Funfair tab: `components/staff/game/FunfairSection.tsx`.
    - Each card has keys B1/A3/TF, any/all (when there are two or more keys), override Auto/On/Off, and Preview.
  - **Preview:** `?funfair_preview=west|central|east` on any map opens full screen, flies to the zone and plays its power-up on that screen only.
  - **Not seen running:** the two cards need a login and 0088, so they are typechecked only. The preview was checked on `/map3d/preview`.

### LakeFront Café: the lake stage (2026-10-16, on `funfair-central`)

- The red dome is now the open-air stage from Ben's photos, and the concert venue for the funfair's finale. Design, decisions and batches L1–L4: [map3d-lakefront-design.md](map3d-lakefront-design.md). Code: `src/components/map3d/lakefront/`.
- L1 (the model) and L2 (evening lighting with sweeping beams) are done, and the XMUM hedge letters are gone (Ben). L3–L4 (the concert, the trigger) wait for Ben's go, one batch at a time.
- `CampusScene` now draws every frame in full screen at night on phones too, so the stage's beams sweep.

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

## Batch 5 (2026-10-16, branch `map3d-batch5`)

Fixed (the review's findings and Ben's additions):

- 3D can't run → 2D map: `canUseWebGL()` asks for WebGL2 only. `CampusScene` makes the renderer itself (`gl` factory) and reports a failure through `onFail`, which `CampusMapView` turns into the 2D view (before, the card stayed blank).
- Phone speed: the scene draws on demand (`frameloop="demand"`) except full screen on a non-lite device, so a still card costs nothing. Anything that animates asks for frames (`Intro`, `CameraRig`, `GroundMarks`, the flag's badge image). Lite mode has no shadow pass. `FrameRateProbe` measures the frame rate once (0.5–2.5 s after start): below 24 fps the full scene steps down to lite, and lite below 10 fps falls back to 2D (`onFail`). `?perf=0` turns the probe off; **use it for headless screenshots**, since SwiftShader runs lite at about 9 fps and would show 2D.
- Accuracy check: a roof or wall tap measures at the building (hit areas stay on during the check), not the ground behind it. "You" is a blue dot. Each reading is logged on the Admin's phone (localStorage `campus-map-check-log`, newest 50) with metres and compass direction; with 3+ readings the panel says whether it looks like a steady offset (average ≥ 5 m and bigger than the spread) or GPS noise, and Copy gives a CSV. Nothing goes to the server.
- The light switch's Auto no longer flies the camera back to the start view.
- 2D accuracy texts say a correction bends the 2D map only.
- Tapping the OSM credit link no longer opens full screen.
- Trees and bushes are kept off A5's entrance (`A5_ENTRANCE` in `geo.ts`).
- Preview: the `?check=1` mock fix is on open ground (30 m south of the statue).
- After the merge (Ben's phone, 2026-10-16): flickering dark bands on the map. The soil slab's top face sat only 0.01 below the ground plane, too close for a phone's depth buffer at map distances, so it showed through in horizontal stripes. The slab no longer draws its top face (`Slab` in `ground.tsx`). To reproduce depth problems on desktop, set the camera's `near` in `CampusScene` to 0.05 for a test (not committed): it makes the depth buffer about 20 times coarser.

Not done (next):

- Merge static meshes (about 700 draw calls); measure on a cheap 2–3-year-old Android.
- No "new bulb lit" signal in 3D (the funfair will show it). Admin's Move bulb and save-correction stay 2D only (`?map=2d`).
- A tap during a camera flight stops it (on purpose: a drag takes over).
- Check A5 against Ben's photos; real pages behind login and a real phone are still unchecked.
