# 3D map: replacing the 2D Figma map (plan, 2026-10-15)

Branch: `map-3d-draft` (Ben: stay on this branch). In progress: see "Progress" at the end.

## Goal

Replace the 2D Figma map (`src/components/CampusMap.tsx`, `public/campus-map.png`) with the 3D map (`src/components/map3d/`) on every page that uses it:

- `/map`: the map page for each role
- `/checkin`
- `/committee`

The Welcome page section `src/components/home/sections/CampusMap.tsx` is a separate abstract map, not the Figma art, so it is out of scope.

Related components to check:

- `src/app/(app)/admin/stations/page.tsx`
- `src/components/staff/game/StationsSection.tsx`
- `GroupStatusList.tsx`
- `FaciTrackingPanel.tsx` and `FaciLocationTracker.tsx`
- `BuildingStationPanel.tsx`
- `AccuracyCheck.tsx`
- `StationEditDialog.tsx`
- `src/lib/mapGeo.ts`, `mapBuildings.ts`, `groupPosition.ts` and `faciLocation.ts`

## Ben's decisions

- Stay on `map-3d-draft`.
- Keep the 2D map as a fallback, used only when the device can't run 3D (no WebGL, or it is too slow).
- Leave the dorms and other buildings that are not modelled unmodelled for now. Don't touch them. A simple marker is enough where a station or pin needs one.
- Admin map anchors (`map_anchors`, the 2D warp): not used by the 3D map (`gpsToWorld` is exact); kept only for the 2D fallback (Ben accepted the recommendation).
- Funfair: keep the dorm name in ride labels, fireworks every few minutes after the finale, no sound (Ben accepted the recommendations).
- Ben approved starting the plan on 2026-10-15. Each step is committed on `map-3d-draft` when its checks pass (no push), and its status is recorded under "Progress" below.

## Approach: keep the logic, replace only the map view

`CampusMap.tsx` is about 1900 lines and has three parts. Only the map view changes.

1. **Data and state**:
   - stations, lightbulbs (`fn_map_lightbulbs`), group positions (`fn_group_positions`) and station counts;
   - Realtime channel `map-live`, permissions and localStorage keys.

   Keep these as they are, moved into a shared hook (for example `useCampusMapData`).
2. **Panels and lists**: `BuildingStationPanel`, `GroupStatusList`, `LightbulbList`, `StationEditDialog`, and the projector reset and move tools. Keep them as they are.
3. **Map view**: the image with overlays at percent positions, zoom and pan, and fullscreen. Replace this with a 3D renderer that has the same props as `CampusMap`: `showGroupPins`, `onStationTap`, `highlightStationId`, `canManageStations` and `hasSelection`.

## Coordinates

| Item | 2D today | 3D |
|---|---|---|
| Buildings A1–A5 and B1 | Percent positions on the art | True-scale positions (`BLOCKS`, `B1_PLACE` in `geo.ts`) |
| Stations | `stationPosition()` in `mapBuildings.ts`, relative to the building on the art | Attached to the 3D building they belong to (offset around its footprint) |
| Group GPS pins | GPS warped onto the art by the thin-plate spline in `mapGeo.ts` | `gpsToWorld(lat, lng)` directly, with no warp |
| Accuracy ellipses | `accuracyAxes()` in metres to percent | A circle on the ground: metres × `UNITS_PER_M` |
| Lightbulbs / projectors | Percent positions | The same places, as glowing markers in 3D |
| Places not modelled (dorms etc.) | Drawn on the art | A flat marker only. No building model for now. |

## How each feature carries over

| 2D feature | 3D |
|---|---|
| Station markers and cluster badges | Floating markers next to the buildings; tapping one opens the same panel |
| Group pins with fresh/faded/stale state and the accuracy area | 3D pins in the group colour (`groupPinColor`, `--fh-*` variables), with a ground circle |
| Stations / Lightbulbs layer tabs, the "new lit" pulse | Same tabs; the bulbs glow in 3D |
| Zoom, pan, fullscreen viewer | 3D camera controls; a card on the page that expands to fullscreen |
| Admin: add/edit stations, reset/move projectors | Kept, using the same dialogs |
| Admin anchors (2D warp) | Not needed in 3D (pending Ben). Kept for the 2D fallback. |
| Admin accuracy check | Kept: compare the GPS reading with the true position in metres |

## Phone performance

- **Lite mode by default on phones:**
  - no post-processing;
  - fewer trees and lower shadow resolution;
  - DPR capped at about 1.5;
  - a smaller ground texture.
- **Loading:** load the 3D map only when needed (`next/dynamic`, `ssr: false`), and show a loading state.
- **Fallback:** if WebGL is missing or creating the context fails, render the 2D `CampusMap` view.

## Theming (from AGENTS.md)

- Freshie and Faci pages: group colours come from the `--fh-*` CSS variables. Never hardcode a hex value.
- HOF, HOGM and Committee pages: the Vortexa colours (`VORTEXA_THEME`, `--sp-*`).

## Steps (each can be checked on its own)

1. **Make the 3D map embeddable.** Split `CampusMap3D.tsx` into:
   - a scene component that fits its container (a card or fullscreen) and has no demo header or mode buttons;
   - the `/map3d` demo page, which keeps them.
2. **Split `CampusMap.tsx` into a data hook, panels and a 2D view.** Behaviour must not change. Check that the 2D map still works on `/map`, `/checkin` and `/committee`.
3. **Build the 3D view:**
   - station markers and clusters;
   - group pins with the accuracy circle;
   - lightbulbs;
   - tapping a building or marker;
   - highlighting the selected station.
4. **Switch the three pages to the 3D view, with the 2D view as the fallback.**
5. **Admin tools in 3D:**
   - station add/edit;
   - projector reset/move;
   - the accuracy check;
   - the anchors decision.
6. **Check:**
   - `npx tsc --noEmit -p .`
   - `npx eslint` on the changed files
   - the existing tests in `tests/`
   - screenshots for each role (Freshie, Faci, HOF/HOGM/Committee, Admin) at phone and desktop sizes.

7. **Vortexa Funfair game zone** on the empty dorm land. Design: [map3d-funfair-design.md](map3d-funfair-design.md), layout: [map3d-funfair-layout.svg](map3d-funfair-layout.svg). Zones power up when the lightbulbs (keys) Admin assigns to them are unlocked. Lightbulbs are shared by everyone. Start this step only after steps 1–6, and after Ben picks ride styles on a preview page.

## Notes for whoever resumes

- Ben is credit-sensitive. Keep each step small, and show results before moving to the next step.
- Screenshots: headless Chrome through the DevTools protocol, run with `node --experimental-websocket`. The `?cam=` and `?mode=` URL parameters work on `/map3d`.
- No push. Ben pushes the branch himself.

## Progress

- 2026-10-15, step 1 done: `map3d/CampusScene.tsx` is the embeddable scene. It fills its parent and draws the OSM attribution itself. Props: `mode`, `lite` (default `prefersLite()`: viewport 768px or narrower, or 4 or fewer cores, or 4 GB memory or less), `camera` (start view, read once on mount; the default depends on container width), `intro`, `labels`, `controlsRef`, and `children` (rendered inside the Canvas, for markers and pins). `map3d/webgl.ts` has `canUseWebGL()` for step 4. `CampusMap3D.tsx` is now only the `/map3d` demo. It adds `?lite=0|1` and `?stats=1` (development only; logs one frame's draw calls and triangles as a `[map3d stats]` warning). Lite mode has no Effects or Stars, DPR up to 1.5, a 1024 shadow map, no tree shadows, half the estate palms and two thirds of the campus trees, and a ground canvas at 10 px per unit instead of 20. Measured (shadow and effect passes included): 1440x900 full 714 calls / 479k tris, lite 638 / 245k; 390x844 full 703 / 480k, lite 627 / 246k. Draw calls barely drop, most likely because they come from the many separate building and court meshes, drawn again in the shadow pass. If phones are slow, merge static meshes or turn shadows off in lite mode.
- 2026-10-15, step 2 done: `CampusMap.tsx` is split with no behaviour change. `campus-map/useCampusMapData.ts` holds all data and state (queries, RPCs, the `map-live` channel, timers, localStorage keys, selection, admin actions) and returns `CampusMapData`. It also exports pure helpers (`buildClusters`, `buildStationSpots`, `buildGroupPins`, `spreadPins`, `clusterStatus`) so a preview can build the same derived data from mock rows. `campus-map/CampusMapPanels.tsx` has `LayerSwitch`, `MapToolbar` (accuracy check, move-bulb notice), `MapLegend`, `MapInfoCard` (full-screen selection card) and `CampusMapPanels` (lists, dialogs and cards under the map). `campus-map/CampusMap2DView.tsx` is the image, overlays, zoom/pan and full-screen viewer; its props type `CampusMapViewProps` is what a 3D view should take too. `CampusMap` owns `fullscreen` and composes hook, view and panels. Checked with a temporary harness (old file from git vs new, Supabase answered by mocks inside the headless browser, nothing reached the real project): the DOM, portal, body scroll lock, focus and localStorage were identical after each of 35 clicks/zoom/drag/wheel/Escape steps for a committee-like, an Admin and a check-in setup, and so were the Supabase requests (paths and bodies). One harmless difference: with Admin's building panel open, zooming the full-screen map no longer refetches `station_purposes` (the view's zoom state no longer re-renders the panel).
- 2026-10-15 step 3: `CampusMap3DView` (station markers and badges, group pins with accuracy circles, lightbulbs, building hit areas, camera flights, fullscreen) plus `map3d/markers.tsx`, `map3d/places.ts`, and the dev-only `/map3d/preview` with mock data (`?role=freshie|faci|staff|admin`, `?full=1`, `?view=2d`). The phone fullscreen start view was too far away (fit distance about 570 against the controls' maximum of 420); it is now capped at 360 and framed as 3:4 on tall screens. **Known issue:** on a phone in fullscreen, tapping a station badge does not always centre on the building; check this in batch 4. Lightbulb markers and the layer are to be removed from 3D in batch 4 (Ben's decision; see the funfair design).
- 2026-10-15 decision for batch 4: add Sunset / Day / Night buttons to the 3D map's fullscreen view (default: automatic by time of day).
