# 3D map: handoff for a new conversation (updated 2026-10-21)

Ben may continue this work in a new Claude conversation. This file says where everything stands. Read it before doing anything, then read what you need:

- [map3d-lakefront-design.md](map3d-lakefront-design.md): the lake stage (LakeFront Café), its concert and what starts it;
- [map3d-funfair-design.md](map3d-funfair-design.md): the funfair design;
- [map3d-draft-handoff.md](map3d-draft-handoff.md): how the 3D map itself was built (data, scale, the statue);
- [map3d-implementation-plan.md](map3d-implementation-plan.md): the plan that replaced the 2D map, and its "Progress" log.

## Rules Ben set

- **Push only when Ben asks.** Commits on the working branch are fine once the checks pass.
- **Branches:**
  - `map-3d-draft` (PR #39), `map3d-batch4` (#40), `map3d-batch5` (#41) and `funfair-central` (#44, #45) are merged.
  - The lake stage is on `funfair-central` too (Ben, 2026-10-16: no more new branches).
  - The lawn and the walkways are on `map3d-footpaths` (Ben asked for a new branch for them, 2026-10-17).
  - B1 is on `map3d-b1` (Ben, 2026-10-21).
  - Before a push, merge the latest `origin/main` into it and check that `git merge-tree --write-tree origin/main HEAD` is clean, so its PR merges without conflicts.
- Work in **batches**: finish one, show Ben the results (screenshots, in Chinese), and wait for his go before the next one.
- **Usage limit:** he watches it closely, so keep agents few. If he says the 5-hour limit is above about 85%:
  - start nothing new;
  - stop the optional work first;
  - let the most important step finish and commit.
- The Supabase project in `.env.local` is the **real remote project**. Never write to it: no migrations, no data changes. Check pages with the dev-only preview routes and mock data instead.
- Talk to Ben in Chinese, short and direct.

## Where things stand

### Tennis game on the tennis courts (T1a done 2026-10-22; T1b, T2a and T2b done 2026-10-26, in `main`; T3a and T3b done 2026-10-27, branch `tennis-game`)

- Plan, Ben's decisions and batches T1a–T3b and T1c: [ROADMAP.md](ROADMAP.md), item 9. What each batch built: its "Done". Where to pick up: item 9's "Next session".
- Code: `src/components/map3d/tennis/`. It meets the map in `CampusMap3D.tsx` (`?tennis=demo`, `?tennis=bot`, `?tennis=online`, `?tennis=watch`), in `CampusScene.tsx` (the label's "● LIVE", `tennisLive`) and in `sports.tsx` (the fence cutaway). Court sizes: `courts.ts`.
- Spectators (T3a): `board.ts` (which courts are busy), `watch.ts` (one watcher's replay of a match), `TennisLive.tsx` (the courts in the scene). Headless checks need focus emulation on every tab (see the roadmap's Done).
- The map pages (T3b): `CampusMap3DView` calls `useTennisOnMap` (the switch comes from `CampusMap`'s `useTennisSettings`, `settings.ts`, as the `tennis` scene option). While Admin has the game open, it loads `TennisMap.tsx` (the scene part, the court's card and the match's HUD) and `onMap.ts` (`TennisOnMap`: the page's one transport and courts board, and its seat). A match moves the scene's element into a layer of its own (`matchSlot`), as full screen does.
- Try the map pages without the live project: `/map3d/preview?tennis=1&full=1&cam=-34,18,42,-10.98,0,24.54` in two tabs of one browser (`&role=staff`, `&name=`): the tabs talk over `BroadcastChannel`, and the checkbox under the map is Admin's switch. In headless Chrome, retry the tap on the court: two tabs share one software GPU, and a tap during a stall can be lost.
- The game (T1b): `match.ts` is the rules, pure and stepped by time (`step(t)` takes events in time order); `ball.ts` the flight; `TennisGame.tsx` draws it (`TennisCourt`, in the scene) and lays the HUD over the page (`TennisHud`). `CampusMap3D` imports `TennisGame` only when the URL asks for the game, so the map's own chunk does not grow.
- Online (T2a, T2b): `net.ts` (the transport, and its `BroadcastChannel` version), `realtime.ts` (the Supabase Realtime version, `?net=realtime`), `lobby.ts` (the queue), `link.ts` (one match between two phones), `online.ts` (this phone's seat and match). Each phone runs its own `Match` with its own player as side 0; messages go in the sender's frame and the receiver turns them round. Tests run two (or more) phones on `tests/tennis/hub.ts`, a fake network with latency, clock skew and cut-offs.
- `?net=realtime` talks to the live project (`.env.local`): it writes nothing, but keep checks short. Over Realtime the pairing and the start take a second or two longer than between tabs.
- Shots of a game: `?tennis=bot&auto=1&t=<seconds>` holds the two bots' match (seed 17) at that moment, the same every time. Event times for picking moments: step a `new Match(17, ["bot", "bot"])` in a test and print `drain()`.
- Two tabs in headless Chrome (one profile, so `BroadcastChannel` reaches both): open both, then act and read the DOM; `&lite=1` and small windows. Both tabs share one software GPU, so they stall together for seconds at first draws and at every screenshot; take screenshots at the end, not mid-match.
- **The view is Ben's:** like a TV broadcast (his reference: an Australian Open broadcast), with clear court lines. `courtView()` blends a wide-screen preset (low, 18° lens) and an upright-phone preset (45°, 30° lens). The wide pitch is already as low as `maxPolarAngle` allows.
- The crisp courts (`surface.tsx`) write no depth and use a polygon offset; they fade out beyond 25–45 units, so far views keep the painted courts.
- Views: `/map3d?tennis=demo` (desktop and `390x844m`); night `&mode=night`; mid-distance `&cam=-34,18,42,-10.98,0,24.54`.

### B1, the Student Activity Centre (2026-10-21, branch `map3d-b1`)

- B1 is modelled on the real building from Ben's photos and Esri imagery (`map3d/b1.tsx`). What it has is in the roadmap's "Done".
- **Its front faces west, to the lake.** The stairs and the plaza stand west of the footprint (`B1_FRONT_M` in `geo.ts`, in metres in B1's own frame: x east, z south). `b1Point()` turns that frame into world units.
- **Its footprint is from the imagery** (`B1_PLACE`): OSM's outline is about 8 m too far west. `B1_CENTRE_M` (OSM's centre) still pins `UNITS_PER_M`: leave it.
- Heights are real metres times `LIFT` (1.5). Ben: it is 3–4 storeys, so keep it at least that tall.
- Views: from the west (like Ben's photo) `/map3d?cam=-1,7.4,3.6,-1,2,21`; from the funfair side `cam=28,26,33,-2,0,28`.
- **Roads round B1** (`B1_ROADS_M` in `geo.ts`; painted by `drawB1Grounds`, and `drawB1Crossing` after the service road):
  - Ben's route colours rule here, not the imagery: asphalt for the north road, grey paving with bays for the west road, the orange walk north of it (`B1_NORTH_WALK`).
  - The west road crosses the north road (just covering it) and runs on across the red brick service road (`CARPARK.road`) to the walk to the south. North of the north road the walk carries its line on; the north road does not go on to the dorms.
  - The west road and the stairs run about 10° off B1's west face (`b1StairsFoot`); the stairs keep one depth.
  - OSM's lake walk ends at `B1_WALK_END`, and one walk (`B1_NORTH_WALK`) sweeps from there to the west road; the walk along the lake is whole. Two stub walks are dropped (`DROPPED_WALKS`). Walks are generated data (`campusData.ts`), so they are trimmed and dropped in `geo.ts`.
- **Later:** check the north and east sides against photos (none yet); railings between the brick pillars; the stairs' south end is straight (the imagery shows a curved wall).

### The A-row on raised ground (2026-10-21, branch `map3d-b1`)

- The five blocks stand on raised ground, 4 m above the statue's lawn (Ben: true height). Its flat top is `PLATEAU` in `geo.ts`, and `groundY(x, z)` gives the ground's height anywhere (0 off the A-row). **Anything placed on the A-row must take its height from `groundY`** (vegetation, pins and tags already do). The blocks, their labels and tap areas add `PLATEAU_H`.
- `plateau.tsx` draws it:
  - `plateauSurface()` is a grid mesh of the top and slopes with the flat ground's UVs, so the ground's canvas and `GroundMarks` lie on it.
  - `Plateau` draws the steps: the terrace (`TERRACE`, seat-like tiers with stairs cut through them) and the steps behind the blocks (`NORTH_STAIRS`). It also draws the pale stone walls and a stone base under each block.
- The slopes ease out at their foot (a square in `groundY`), so the mesh stays under the steps laid over it. Keep that if you change the slopes, or the grass pokes through the lowest steps.
- A1, A2, A4 and A5 are drawn square and 4–6 m smaller than their OSM footprint (`courtyardWall` in `geo.ts`, used by `buildings.tsx`), on a plinth (`BLOCK_PLINTH`). Attach anything to the block as drawn, not to the OSM footprint: the back steps first stood 6–8 m off the wall (Ben). They now start at the plinth's edge and climb to its top.
- **A3 is not at OSM's position:** it is moved 15 m toward the statue (`A3_M`, Ben), so its back steps fit before the walk behind it. `BLOCKS` and the block helpers in `geo.ts` read it through `blockM()`. Don't read `BUILDINGS_M.A3` directly.
- **A3 is modelled on Ben's photos** (2026-10-31, branch `feat/a3-entrance`): `FlatBlock` and `a3Geometry` in `buildings.tsx`, wall textures `makeA3Facade` and `makeA3Centre` in `textures.ts`.
  - The front (statue) and the back (lake) are alike, each with a porch (Ben: they must stay the same). Change both through `a3Porch`, which builds the front one and turns a copy round.
  - The long walls stand `A3_RECESS` inside the footprint, so the porches stand on the plinth and the back steps still fit before the walk behind. The back steps are as wide as the porch (`A3_PORCH_HALF_M` in `geo.ts`).
  - The end walls look like the long walls, without a porch. Only the four corners are lower, under small red roofs (Ben: not the whole end).
  - Views: front `cam=-52.2,6,-28.1,-22.85,4.2,-21.87`; back `cam=-1.1,12,-24.9,-22.85,3,-21.87`; front and east end from above `cam=-42.9,20,0.4,-22.85,4,-21.87`.
- Views: like Ben's aerial `/map3d?cam=-72,26,-48,-34,1,-18`; from the statue `cam=-50,3.2,-21.4,-36,2.2,-21.6`; behind A4 `cam=0,9,-2,-20,1,-12`.
- The statue stands where the imagery shows its round bed (`STATUE`), not at the team's GPS point.
- Planting along the walk is `A_FRONT_PLANTS` (palms, shrubs, low lamps); plants.ts drops what falls on paving.
- **Later:** the south gate's guard houses and fence (Ben); A1, A2, A4 and A5's walls as in the photos; palms in planters; up-lights on the terrace.

### Grey paving in front of the A-row (2026-10-21, branch `map3d-b1`)

- Ben: not everything is lawn. The forecourts and steps of A1–A5, the terrace along the arc, the walk past the forecourts, A3's axis to the statue and the statue's plaza are light grey stone from Esri imagery (`A_FRONT` in `geo.ts`, painted by `drawAFront` in `ground.tsx`). Details: the roadmap's "Done".
- The imagery sits about 4 m south of OSM here, so the traces move 4 m north (`A_FRONT_DN`). Forecourts are rectangles square to their block (`A_FORECOURTS_M`) that start under the block, so they meet it wherever OSM put it.
- A3's axis is laid out from the statue (`A_AXIS_M`): its pieces run to wherever the axis meets the terrace's foot, the walk and A3.
- To trace more paving: curl Esri tiles into the scratchpad and classify the pixels (grey stone, red-brown walk, lawn) along lines of constant east or north, in a headless Chrome page with `--allow-file-access-from-files`. Eyeballing the tiles was several metres off.
- **Later:** the red-brown walks in the imagery are still the 2D art's orange.

### Lawn and walkways (2026-10-17, branch `map3d-footpaths`)

- Inside the outer road, the ground is lawn and only the walkways are paved, in the 2D art's colours (an orange walk with a darker outline). The walkways are OSM's, plus walks traced by hand round A3, A4 and A5 (`TRACED_PATHS_M` in `geo.ts`). Details: the roadmap's "Done".
- To add a walk that OSM lacks, trace it on aerial imagery in metres east / north and add it to `TRACED_PATHS_M`. Trees, bushes and lamps keep off it by themselves (`inKeepOut` reads `FOOTPATHS`).
- `PARK`, `GRASS` and the art's track lawn (`GROUND.lawns`) are no longer drawn. They are kept for when lawns and paved areas are told apart again.

### The 3D map on every map page (plan steps 1–6, merged)

- **Where it shows:** `/map`, `/checkin` and `/committee`, through `campus-map/CampusMapView.tsx`. The 3D view loads with `next/dynamic` (`ssr: false`) behind a loading card.
- **When the 2D art shows instead:**
  - the device has no WebGL2;
  - the 3D view throws (an error boundary catches it);
  - the device is too slow (see "Phone speed");
  - the URL has `?map=2d`.
- **The code:**
  - one data hook for both views: `campus-map/useCampusMapData.ts`;
  - the panels: `CampusMapPanels.tsx`;
  - the 2D view: `CampusMap2DView.tsx`;
  - the 3D view: `CampusMap3DView.tsx`, with `map3d/markers.tsx` and `map3d/places.ts`. The scene itself is `map3d/CampusScene.tsx`.
- **Dev preview:** `/map3d/preview`, with mock data. Parameters: `?role=freshie|faci|staff|admin`, `&full=1`, `&map=2d`, `&check=1` (Admin's accuracy check).
- **Lightbulbs (Ben, 2026-10-15):** no lightbulb markers or layer in 3D.
  - The funfair zones show which bulbs are lit, and the location photos on the Items page tell groups where to go.
  - The lightbulb list sits under the 3D map, and Admin keeps Reset there. Move bulb is in the 2D view only.
  - See the funfair design, "How the game reaches the funfair".
- **Light switch:** full screen has Auto / Sunset / Day / Night (top right). Its accent is the group colour, or the Welcome page's cyan.
- **Admin's accuracy check in 3D:** tap the ground to see the GPS error in metres. Nothing is saved. Saved anchors bend the 2D map only.
- **Badge taps on phones:** a touch may move up to 16 px (`isTap` in `markers.tsx`), and a camera flight first plays out the controls' damping.

### Vortexa Funfair (plan step 7, merged)

- **Ben's decisions:**
  - each zone has its own style: west = A Neon Cyber (brightened for daytime), central = C Toy low-poly, east = B Retro carnival;
  - all three share the A-style VORTEXA gate and the A-style powered-off look;
  - put it **straight into the map** (no separate preview for Ben);
  - the land must not look empty;
  - the lightbulbs are shared by everyone; Admin chooses which zone powers up after which key;
  - dorm names stay on the ride labels;
  - fireworks come every few minutes after the finale (the lake stage's concert);
  - there is no sound.
- **What was built:**

  | Batch | Work | Code, extras and cost |
  |---|---|---|
  | F1 | Central zone (style C): LY4 teacups, LY5 bumper cars, LY8 swing ride, LY9 drop tower, the crossing with the Starlight pole and the power box, the north square (fountain, stalls, stage) | `funfair/central.tsx` and `funfair/central/`. Desktop: +28 draw calls, about +118k triangles (shadow pass included). |
  | F2 | West zone (style A): LY3 Vortexa Eye with food stalls, LY1 carousel, LY2 game booths with the duck shoot, LY6 and LY7 spider rides; the shared VORTEXA gate | `funfair/west.tsx` and `funfair/west/` (origin world (35.2, -38.2)); `funfair/gate.tsx` (world (20, -11.5); `power` = share of zones on: pillars at 1/3, letters at 2/3, arch at 1). Extras: a lagoon with a lighthouse and duck boats, a palm grove with a neon dome, a food court. Desktop: West +34 calls / +160k triangles, gate +5 / +7k; lite West +23 / +83k. |
  | F3 | East zone (style B): Canteen D6 Big Top, D4/D5 roller coaster, D2 haunted house, D3 pirate ship, D1 arcade | `funfair/east.tsx` and `funfair/east/` (origin world (29, 18); `onLawn()` in `east/layout.ts`). Since 2026-10-17 every ride stands on its dorm's real middle (`dormCentre`), and the coaster runs a new route with its loop over D5's middle; the arcade's back wall keeps 6–7 m off B1's grey service road. Extras: a helter-skelter, a food court, circus wagons. Desktop +15 calls / +127k triangles; lite +12 / +56k. |
  | F4 | The funfair in the map | See "In the map" below. |
  | F5 | Admin control | Built. Migration `0088` is applied (Ben, 2026-10-17; see "Admin control" below). |

- **The land** (Ben, 2026-10-16): the brown field is gone. The whole dorm land is lawn like the lake park (`FUNFAIR_LAND` in `geo.ts`), reaching west to LY1 and LY6, and the zones may use all of it. Zones have no lawn plate of their own: they add paths and raised plazas on the campus lawn.
- **Depth precision:** `DepthRange` in `CampusScene` moves the camera's near plane out with its distance to the target (2.5%, 1 to 10). Thin layers (paths 0.12 m over the lawn, plaza rims) are then safe on phones at map distances. Still keep stacked flat layers at least 0.08 m apart.
- `usePowerRamp` (`funfair/common.ts`) asks for frames while it ramps, so a power-up plays to the end on a map that draws on demand (the card, lite mode). Rides only move on drawn frames.
- **In the map (F4):**
  - `funfair/Funfair.tsx`: `Funfair` renders the three zones and the gate. `CampusScene` takes `funfair` (each zone 0 or 1, default all off) and renders it.
    - The default key of each zone: east ← B1, west ← A3, central ← TF (`DEFAULT_ZONE_KEYS` in `src/lib/funfair.ts`).
    - `funfairFromBulbs()` turns lit lightbulbs into zone power. `CampusMap3DView` feeds it `data.bulbs`, which every role gets for lit bulbs and which updates live, so a newly lit bulb plays the power-up.
    - The gate gets the share of zones on.
  - Labels:
    - `funfair/labels.ts` has `RIDE_TAGS`, one per dorm with its ride ("LY3 · Vortexa Eye"). They are sprite tags shown when the camera is close, whether or not names are on (`RideTags` in `markers.tsx`).
    - `FUNFAIR_LABEL` "Vortexa Funfair" is shown with the place names (Ben dropped "(game zone)", 2026-10-22).
    - `ZoneSigns` (`markers.tsx`, 2026-10-22): one sign over each zone's middle (`ZONE_CENTERS`, 16 units up) with its key's glyph and colour (`KEY_COLORS`) and code name ("Star"; Ben: the longer "Star · Big Top" was too long on a phone), bright when the zone is on, grey when off. Only with Show names; shown from afar, fading out within about 45–75 units, where the ride tags take over. The names follow `DEFAULT_ZONE_KEYS` (one projector per zone by design); Admin's and HOGM's Funfair cards warn about that (`SIGN_NOTE`).
  - `/map3d` takes `?funfair=1,0,1` (west, central, east; default all on). To view a zone, use `/map3d?cam=…&funfair=…&mode=…`:
    - West: `cam=72,46,10,34,0,-30`.
    - Central: `cam=72,42,28,32,0,-11.5`.
    - East: `cam=68,46,52,29,0,16`.
  - Not done: a painted link path from West's Gate Walk to the gate (the orange strip along the park already joins them).
- **Phones at night (Ben: lit zones were hard to see on his iPhone):**
  - Phones draw lite (no bloom, no point lights), so lit zones barely stood out. Lite makes up for it:
    - bulbs and neon tubes are 1.6× bigger (`LITE_LIGHT_SCALE`; `lightBake()` sets `Bake.widen`);
    - powered paint and paving glow a little at night (`LITE_SELF_LIT`, `LITE_PAVING_LIT`; `uSelf` in each kit's paint shader);
    - the light pools are 1.4× bigger and stronger;
    - soft halos sit over each zone's landmarks (`funfair/glow.tsx`, one draw call per zone, fading out within about 45–110 units of the camera).
  - At sunset, phones show the halos and light pools at about 40% of their night strength (`DUSK_SHARE` in `glow.tsx`), with no self-glow.
  - Desktop and daytime are unchanged.
- **Admin control (F5):**
  - **Migration** `supabase/migrations/0088_funfair_zones.sql`, applied on the project (Ben, 2026-10-17).
    - `funfair_zones`: one row per zone with its keys (`required`), `rule` (any/all) and `manual` override. It is seeded with the default keys. Only `is_game_lead()` can read it, since the keys would give away where the unlit bulbs are.
    - `fn_funfair_state()`: zone and on/off, for everyone signed in.
    - `fn_set_funfair_zone()`: game leads only.
    - Realtime is on for the table.
  - **Map side:**
    - `src/lib/funfair.ts` holds the shared types, the defaults and `funfairMissing()`. It has no 3D code.
    - `useCampusMapData({ loadFunfair })` (3D view only) asks `fn_funfair_state` on load, whenever the lit bulbs change, every 10 s (`FUNFAIR_POLL_MS`; Ben wants changes on the map within 15 s), and when the page comes back into view. The bulbs also reload then, in case the phone missed Realtime events while it slept. If 0088 is missing it stops after the first 404 and uses `funfairFromBulbs()` with the default keys. The result is `data.funfair`; the dev preview's mock fills it from the default keys.
  - **The cards:** `useFunfairZones()` (`src/components/useFunfairZones.ts`) loads and saves for both.
    - Admin → Game → Funfair (3D map) (`/admin/funfair`; was on Live control until 2026-10-22): `components/admin/FunfairZones.tsx`.
    - HOGM → Game control, Funfair tab: `components/staff/game/FunfairSection.tsx`.
    - Each card has keys B1/A3/TF, any/all (when there are two or more keys), override Auto/On/Off, and Preview.
  - **Preview:** `?funfair_preview=west|central|east` on any map opens full screen, flies to the zone and plays its power-up on that screen only.
  - **Not seen running with data:** the two cards need a login, so they are typechecked only (L4 rendered them logged out, with no rows). The previews were checked on `/map3d/preview`.
- **Later (polish; Ben: viewable and usable first, details later):**
  - West: the wheel plaza's night light pool floods it pink; the lighthouse beam is strong under bloom; palm fronds are flat blades; the carousel horses look grey under the canopy; check the gate pillars against Central's south hedge.
  - East: dim (and thin) the cables once a zone is on; the coaster train never stops in the station and its speed is a simple height formula; the loop is a rounded spline and there is no lift chain; ghosts and the prize wheel don't move, and the Big Top's flags don't wave; no searchlights (the material is in `east/kit.ts`, unused); the haunted house's porch post hides part of "HAUNTED" from some angles; no queue rails; the Big Top's inside is a dark box. (The trees on a plain grid are gone: since E2, 2026-10-17, trees grow only along the road sides, and the land holds the midway: see the roadmap's "Done".)
  - All zones: bulb strings and pennants have no wire (they float up close); the bright neon cables at night (pink West, yellow East).

### LakeFront Café: the lake stage (2026-10-16 to 10-17, on `funfair-central`)

- The red dome is now the open-air stage from Ben's photos, lit every evening and holding a concert. Design, decisions and batches L1–L4: [map3d-lakefront-design.md](map3d-lakefront-design.md). Code: `src/components/map3d/lakefront/`.
- **Done:**
  - L1, the model;
  - L2, evening lighting with sweeping beams;
  - L3, the concert;
  - L4, the trigger: the concert plays while all three funfair zones are on, with a "● LIVE" tag on the label, and Admin's and HOGM's Funfair cards preview it (`?funfair_preview=lakefront`);
  - the XMUM hedge letters are gone (Ben).
- Ben accepted the venue; the old `Dome` is deleted (2026-10-17).
- **Next:** check the stage on a real phone.
- `CampusScene` takes `concert`: left out, it follows the funfair; true or false forces it. `/map3d?concert=0|1|flip`.

## Working on the map without breaking it

| What changes | Files | Safe? | Rule |
|---|---|---|---|
| How a building or landmark looks (roofs, colours, windows, the statue, B1, courts, water, trees) | `map3d/buildings.tsx`, `b1.tsx`, `statue.tsx`, `sports.tsx`, `water.tsx`, `vegetation.tsx`, `textures.ts`, `atmosphere.tsx` | Yes | Keep the exported component names and props, and keep the lite-mode branches (phones). |
| Where a building stands or how big it is | `map3d/geo.ts` (`BLOCKS`, `B1_PLACE`, `B1_FRONT_M`, `DOME_PLACE`, `STATUE`), `campusData.ts`, `scripts/map3d/*` | Careful | Station markers and hit areas follow `map3d/places.ts`, which reads these positions. After a move, check `/map3d/preview` (markers on the right buildings) and `inKeepOut` (no trees inside). Don't change `UNITS_PER_M`, the world axes or `gpsToWorld`: group GPS pins depend on them. |
| The funfair and the lake stage | `map3d/funfair/`, `map3d/lakefront/` | Yes | Self-contained. They meet the rest of the map only in `CampusScene.tsx`, and in `geo.ts` (`FUNFAIR_LAND`, `DOME_PLACE`). |
| The map pages and data | `components/CampusMap.tsx`, `components/campus-map/*`, the pages | Careful | Shared by the 3D view and the 2D fallback. Check both (`?map=2d`) on `/map3d/preview` for each role. |

- **One task, one commit.** Commit visual tweaks on their own (for example "style(map3d): …"), and never mix them into a batch commit.
- **When two things run at once,** each agent `git add`s only its own files.
- **After any visual change,** look at `/map3d` (the whole map), `/map3d/preview` (markers still on their buildings) and a phone size (`390x844m`, lite mode).

## Useful facts

- **Dev server:** `npx next dev -p 3000`. If nothing is listening on port 3000, start it. A `next build` while it runs breaks it (pages load, but `main-app.js` and `layout.css` give 404 and nothing runs): restart it.
- **Screenshots:** headless Chrome over the DevTools protocol.
  - Start Chrome with `--headless=new --remote-debugging-port=9222 --user-data-dir=<a temp folder>`.
  - A small script (written in each session's scratchpad, since it does not carry over) opens a tab per shot, emulates the size (phones: touch, DPR 2), waits, saves a PNG, and prints the console's errors and warnings.
  - `/map3d` URL parameters: `?intro=0`, `?mode=day|sunset|night`, `?cam=x,y,z,tx,ty,tz`, `?lite=0|1`, `?perf=0`. In development, `?stats=1` logs draw calls and triangles.
  - **Always use `?perf=0` for headless shots.** Without it, SwiftShader is slow enough that the 3D map gives up and shows 2D.
  - When the dev server can't be used, a Vite preview of `/map3d` works (2026-10-26): Vite ships with vitest. A config in the scratchpad with `root` the repo, `@` aliased to `src`, `process.env.NODE_ENV` defined, `cacheDir` and `envDir` in the scratchpad, and a middleware that serves an HTML page mounting `CampusMap3D`. The map code imports nothing from Next.
- **Checks:**
  - `npx tsc --noEmit -p .` (clean, tests included);
  - `npx eslint <changed files>`;
  - `npx vitest run`. The database tests use embedded Postgres; the lake stage has `tests/lakefront/show.test.ts`.
- **Shaders:** clamp before `pow()`. A NaN from `pow()` of a tiny negative spreads through the desktop bloom into a black frame. Phones have no bloom, so a phone-size shot does not catch it.
- A tap-replay helper (`probe.mjs`: taps, drags and screenshots from a JSON step list) was useful for checking taps on a phone. It lived in a session's scratchpad, so write it again if needed.

## Batch 5 (2026-10-16, merged)

Fixed (the review's findings and Ben's additions):

- 3D can't run → 2D map: `canUseWebGL()` asks for WebGL2 only. `CampusScene` makes the renderer itself (`gl` factory) and reports a failure through `onFail`, which `CampusMapView` turns into the 2D view (before, the card stayed blank).
- **Phone speed:**
  - The scene draws on demand (`frameloop="demand"`), so a still card costs nothing. Anything that animates asks for frames (`Intro`, `CameraRig`, `GroundMarks`, the flag's badge image, power-ups).
  - Full screen draws every frame on a fast device. Phones draw every frame in full screen while a funfair zone is on, at night (the lake stage's beams sweep), and during the concert.
  - Lite mode has no shadow pass.
  - `FrameRateProbe` measures the frame rate once, 0.5–2.5 s after start. Below 24 fps the full scene steps down to lite, and lite below 10 fps falls back to 2D (`onFail`). `?perf=0` turns the probe off.
- Accuracy check:
  - A roof or wall tap measures at the building (hit areas stay on during the check), not the ground behind it. "You" is a blue dot.
  - Each reading is logged on the Admin's phone (localStorage `campus-map-check-log`, newest 50) with metres and compass direction.
  - With 3+ readings, the panel says whether it looks like a steady offset (average ≥ 5 m and bigger than the spread) or GPS noise. Copy gives a CSV. Nothing goes to the server.
- The light switch's Auto no longer flies the camera back to the start view.
- 2D accuracy texts say a correction bends the 2D map only.
- Tapping the OSM credit link no longer opens full screen.
- Trees and bushes are kept off A5's entrance (`A5_ENTRANCE` in `geo.ts`).
- Preview: the `?check=1` mock fix is on open ground (30 m south of the statue).
- Flickering dark bands on Ben's phone:
  - The soil slab's top face sat only 0.01 below the ground plane. That is too close for a phone's depth buffer at map distances, so it showed through in horizontal stripes.
  - The slab no longer draws its top face (`Slab` in `ground.tsx`).
  - To reproduce depth problems on desktop, set the camera's `near` in `CampusScene` to 0.05 for a test (do not commit it). It makes the depth buffer about 20 times coarser.

Still open:

- Merge static meshes (about 700 draw calls); measure on a cheap 2–3-year-old Android.
- Admin's Move bulb and save-correction stay 2D only (`?map=2d`).
- A tap during a camera flight stops it (on purpose: a drag takes over).
- Check A5 against Ben's photos. Real pages behind login and a real phone are still unchecked.
