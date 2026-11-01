# 3D map: how it was built (2026-10-15, updated 2026-10-16)

The 3D campus (`src/components/map3d/`) began as a draft on the `map-3d-draft` branch. It is merged, and it now shows on every map page (see [map3d-session-handoff.md](map3d-session-handoff.md) for where things stand). This file records how the campus was built: the data, the scale and Ben's decisions.

The dev page is `/map3d`: development only, no login (one condition in `src/middleware.ts`).

## The campus

- **What it has:**
  - Jiageng-style A1–A5 (curved red-tile roofs, courtyards), and B1;
  - the statue with its flag;
  - the lake with lotus and the duck;
  - tropical planting and the oil-palm ring;
  - sunset, day and night looks, labels, the fly-in, and desktop post-effects.
- **Track (Ben's correction):** not slanted.
  - Its long axis runs along world X (north–south, parallel to the east road), with the north end facing B1.
  - Real 400 m size: 8 lanes, a 105 × 68 m pitch, and red synthetic past the north goal line.
  - Goals, 4 floodlights, and a real-size grandstand on the east side (OSM 616496734).
- **Courts (Ben's correction):**
  - 2×2 in a north-up view: futsal ×3 south-west, basketball ×3 south-east, tennis ×3 north-west, volleyball ×3 north-east.
  - Sizes and gaps come from OpenStreetMap (`COURTS_M` in `geo.ts`). Markings use standard court sizes.
  - Hoops, goals, nets, fences and floodlights are in place. The colours come from Ben's aerial photo.
  - Court labels only show when the camera is close (within 95 units).
- **Around the courts:** B1's service road with parking and cars, a footpath south of basketball, a pad at the north curve, an outdoor gym and a tree belt. Trees, bushes and lamps are kept off all of these (`inKeepOut`).
- **A1, A2, A4 and A5 (Ben's photos, redone 2026-10-31)** (`GableBlock` in `buildings.tsx`):
  - all four alike, in A3's colours: a white gable on each side, red roofs round the corners, the atrium's glass in the middle, and a corner tower with a small red roof at each corner;
  - a porch on the front and the back, alike; A5 has one more on the side facing the track, with steps that fan out;
  - trees and bushes are kept off that porch (`A5_ENTRANCE` in `geo.ts`).
- **Night windows:** `makeA3Facade`, `makeGableFacade` and `makeGridFacade` in `textures.ts` draw emissive maps that light about half the windows. A3's big arched windows and the blocks' glass doors glow as a whole, on purpose.
- **XMUM hedge letters:** removed (Ben, 2026-10-16). The lake stage's amphitheatre stands where they were.

## True scale (Ben approved 2026-10-15)

Ben chose true scale over the Figma layout.

- **Data:** OSM shapes, aligned to the team's GPS points in `src/lib/mapGeo.ts`.
- **World:**
  - 1 unit = 6.73 m, pinned to the track and B1, so the approved sports area did not move;
  - +X is north and +Z is east;
  - `gpsToWorld(lat, lng)` and `fromReal(e, n)` are in `geo.ts`.
- **Where things come from:**
  - A1–A5 and B1 sit on their OSM footprints, at real size, each turned to its own footprint (the A-row bends along an arc). A3 is the big 9-level block. (Since 2026-10-21 B1 uses its outline from imagery: OSM's is about 8 m too far west.)
  - The lake, the lake park, the park footpaths and the statue lawns are from OSM.
  - The footbridge, the LakeFront Café and the statue are at their real positions. The flag keeps its offset from the statue as in the art. The duck sits in the widest open water and is scaled to fit.
  - The outer road, the plantation and the trees are still from the art (phase 2). The art's brown field became the funfair's lawn (2026-10-16).
  - Inside the outer road, the ground is lawn with the walkways: OSM's, plus walks traced from imagery round A3, A4 and A5 (2026-10-17, branch `map3d-footpaths`).
- **Debug:** `?gps=1` shows the GPS points from `src/lib/mapGeo.ts` (`GPS_POINTS`, `LANDMARKS`). The map credits OpenStreetMap at the bottom right.
- **Data check:**
  - All 9 building and court GPS points fall inside their OSM outlines (1–3 m mean offset), so no global shift was applied.
  - One fix: Musical Island (the LakeFront Café) moved about 19 m to match the dome in the imagery.
  - The causeway GPS point is 15 m off the bridge. The bridge midpoint is lat 2.8329767, lng 101.7046295; Ben will decide whether to update main.
- **Not changed:** the A-blocks keep the square courtyard roof. In the imagery they look like cross-shaped roofs; that is a possible change for later.
- **Tan Kah Kee statue** (`statue.tsx`):
  - the real-size bronze in metres: a 3.0 m figure (hat at the chest in the left hand, cane in the right, hair combed back) on a granite pedestal with a gold inscription, about 6.2 m in all;
  - it stands with its back to A3 (`STATUE_ROT_Y` in `geo.ts`);
  - Ben chose the detailed variant, with the bold inscription from another variant and the hair redone from his photo. Bench: `/map3d/statue-lab`.
- **Flag:** one big pole flies a white XMUM flag with `public/xmum-logo-badge.webp` (Ben: one big flag, not two). It is modelled at real size: a 15 m pole and a 3.6 × 2.4 m flag.
- **Landmark scale:** the statue and the flag are drawn 4× larger than real (`LANDMARK_SCALE` in `geo.ts`) so they read at normal zoom. The zoom limit is 6 units, so the statue can be seen up close.
- **Phase 2 (not started; only after Ben approves):**
  - roads (the walkways are drawn since 2026-10-17; the car roads are not), street lamps, the remaining buildings, trees and landscape (OSM has 841 tree points and 101 tree rows);
  - a building style reference: heights from photos and imagery, the D towers (OSM says 7 levels, the photo looks taller), and whether B1 should look like the real building.
- **Data files** (`scripts/map3d/`):
  - `osm_full.json`: the raw Overpass extract;
  - `build_dataset.py`: the generator;
  - `campus.json`: local metres, ODbL.

  `src/components/map3d/campusData.ts` is generated by `python3 -I scripts/map3d/emit_phase1.py`. To regenerate the dataset: `python3 -I scripts/map3d/build_dataset.py scripts/map3d/osm_full.json scripts/map3d/campus.json`. The Esri imagery was used only for checking and is not in the repo.

## Open questions for Ben (not decided)

- Volleyball: 3 courts are drawn (OSM block 55 × 37 m). They are not visible in the photo.
- The 3rd futsal court is OSM's single court tagged basketball (OSM's futsal block is only 40 m wide, room for 2).
- The real track is turned about 11° clockwise from north (OSM pitch, the stand, satellite imagery). It is drawn parallel to the road, as Ben said and as the Figma art draws it.
- ~~Real B1 looks different from the Figma box: a white roof, green planted terraces and orange piers. Restyle it?~~ Done 2026-10-21: B1 is modelled on the real building (`b1.tsx`), on its imagery footprint. See the roadmap's "Done".
- Lay out the rest of the campus at true scale from OSM too? All the footprints are there. The key places already are, and group GPS pins map onto them directly.

## Ben's question: "did the 3D use the known lat/lng for proportions?" (answered 2026-10-15)

At first, no: positions were read off the Figma art. A least-squares fit of those positions to the OSM footprints and the GPS anchors gave:

- on average 1 unit ≈ 7.2 m, with world +X about 8° east of true north. The distortion was local misplacement, not a uniform stretch;
- a typical error of 33 m RMS. The worst was A1 at 55 m; the causeway was 50 m off and B1 45 m;
- the A1–A5 row drawn about 14% too short.

That led to the true-scale layout above. The 2D map's accuracy work (the thin-plate-spline warp in `src/lib/mapGeo.ts`) only places GPS pins onto the stylised art; it shears shapes, so it can't be used to get geometry.

## Reference

- Real metres are measured east and north of the Track & Field GPS point (`src/lib/mapGeo.ts`). The OSM pitch centre is (−3.1, −0.3) and B1's centre is (7.0, 229.0). The court blocks are in `geo.ts` `COURTS_M`.
- To refetch the OSM data (POST with a User-Agent, or the server returns 406):

  ```bash
  curl -A "xmum-map-draft" -X POST https://overpass-api.de/api/interpreter --data-urlencode 'data=[out:json][timeout:60];(way["leisure"~"pitch|track|stadium"](2.8265,101.6990,2.8370,101.7105);way["building"](2.8265,101.6990,2.8370,101.7105);way["natural"="water"](2.8265,101.6990,2.8370,101.7105););out tags geom;' -o osm.json
  ```

- **Screenshot URL parameters:** `?intro=0&mode=day|sunset|night&cam=x,y,z,tx,ty,tz`. A north-up view of the courts: `cam=-19.5,58,27,-16.5,0,27`.
- **Taking screenshots:** see "Useful facts" in [map3d-session-handoff.md](map3d-session-handoff.md).
