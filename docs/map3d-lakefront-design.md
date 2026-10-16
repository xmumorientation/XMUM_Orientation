# LakeFront Café: the lake stage (design, 2026-10-16)

The 3D map's LakeFront Café was a plain red dome. It is now the real venue from Ben's photos: an open-air stage under a red ribbed shell, in a moat at the lake's west tip, with a grass amphitheatre in front. At night it will also be the funfair's finale venue, with concert lighting.

Status: built in batches on branch `funfair-central`. L1 (the model) and L2 (the evening lighting and the beams) are done; L3–L4 follow, each after Ben's go.

## Ben's decisions

- **When the concert plays (option A, 2026-10-16):** the stage goes LIVE when all three funfair zones are on (the finale). No backend change. Admin can start it early by switching the three zones on in the existing Funfair card (manual override).
- **XMUM hedge letters:** removed from the 3D map (Ben, 2026-10-16). They stood about 30 m north of the stage, where the amphitheatre now wraps round.
- **Shell height (confirmed):** drawn 1.4 times its real height, so it reads next to the A-blocks, which are drawn tall too (`SHELL.lift`). The footprint stays at true size.
- **Label (confirmed):** stays "LakeFront Café"; a "● LIVE" tag joins it while the concert plays (L4).
- **Beams every evening, and they move (Ben, 2026-10-16, from a concert photo):** moving-head beams fan up from the stage at sunset and night, not only during the concert, and they sweep. The concert (L3) makes them faster and adds more.

## The venue (from the photos)

- **Shell:** seven red tube ribs, all springing from two feet on the stage's north and south sides, fanned back like a scallop shell. The front arch is the tallest and thickest; the last rib lies low over the back wall. Thin red slats run between the ribs over a white membrane; six cross tubes tie the ribs.
- **Stage:** a round dark wooden deck (22 m across) with a white balustrade round the front, and a white back wall with a door under the shell.
- **Moat and walkway:** a water ring round the stage, a beige walkway round the moat, and a low kerb closing the moat on the lake side. A white footbridge crosses the moat on the north-west.
- **Amphitheatre:** seven grass terraces with grey stone strips, four red-brick aisles, and a grass bank down to the lawn. It sits inside the park's ring footpath.
- **Willows:** six weeping willows along the shore, as in the photos.
- **Orientation:** the opening faces west, towards the amphitheatre; the lake is behind (east). This follows the OSM footprint (31 m north-south) and the ring footpath round the west side. Not yet checked against satellite imagery.

## Code

`src/components/map3d/lakefront/`, modelled in metres round the stage's centre (x north, y up, z east; the audience is on −z), placed on `DOME_PLACE` from `geo.ts`:

- `layout.ts`: sizes, angles, the shell's shape (`shellPoint`, `shellUnderside`), the willows' spots, the light pools, the beams (`beams()`) and the haze.
- `build.ts`: bakes the venue (one flat-colour mesh, with the beams' fixtures), the small lights (one mesh), the steel (ribs and cross tubes), the shell's skin and the moat's water.
- `kit.ts`: materials, and the evening looks (`applyLook`: day, sunset, night). The skin is one double-sided surface: anti-aliased slats outside (they blend to pinkish red from far away instead of shimmering), the membrane inside.
- `beams.ts`: the beams and the haze in one draw call. Each beam is a quad turned about its axis to face the camera, with a bright core, soft edges and a fade; the sweep runs in the shader.
- `LakefrontStage.tsx`: the component, rendered by `CampusScene` in place of the old `Dome`.

Unchanged: `DOME_PLACE`, `DOME`, the label, `inKeepOut`, the GPS anchor in `mapGeo.ts`, station markers and pins, the 2D map, the backend. Nothing (trees, bushes, lamps) stood within 50 m of the stage, and the lake's lotus pads already keep 33 m away.

The old `Dome` stays in `buildings.tsx` until Ben accepts the new venue (rolling back is one line in `CampusScene`); delete it then.

**Cost (desktop):** 7 meshes, 3 of them in the shadow pass; the old dome had 4 and 3. About +22k triangles (+44k with the shadow pass). Removing the letters saved 26 draw calls. Whole map at night: 800 calls, 944k triangles at 1440×900; lite at 390×844: 419 calls, 390k triangles. Lite also has one halo draw call.

## Evening lighting (L2)

No concert running: set when the look changes, except the beams' sweep.

- **Night:** the ribs are LED lines from cyan at the feet to lilac at the top; the membrane under the shell is washed pink to violet, strongest low down; uplights warm the shell's red outside from below. Warm bulbs stand on the balustrade, cyan dots run along the walkway, each aisle step has a light, and a dim strip runs under each terrace's stone edge. Light pools lie on the deck, on the moat and on the lake behind.
- **Sunset:** the same, warm (amber ribs) and weaker. **Day:** all off; the lights show as fixtures, and the terrace strips vanish into the risers.
- **Beams:** six moving heads on the stage's front edge and four floor fixtures by the shell's feet (phones: four and two, wider and stronger), cyan and blue with pink and lilac, in blue and purple haze. Seen from the audience they fan out sideways like a V and cross. The front row swings like scissors (the two halves mirror each other); the floor fixtures pan and cross. The sweep follows the wall clock, so every map shows the same move.
- **Phones (lite):** no bloom or point lights there, so the beams and pools are stronger, and two halos (the shell, the stage) show from map distances (`funfair/glow.tsx`).
- **Frames:** the beams only sweep where the map draws every frame. `CampusScene` now draws every frame in full screen at night on phones too (before: only on fast devices, or while a funfair zone is on). Cards still draw on demand, and their beams stand still. With `prefers-reduced-motion` the beams stand still.
- **Watch out:** in these shaders, clamp before `pow()`. A NaN from `pow()` of a tiny negative spreads through the bloom into a black frame (desktop only; phones have no bloom).

**Views:** `/map3d?intro=0&mode=sunset&cam=…` with:

- front (audience): `7.4,4.5,-47.5,8.87,1.6,-34.67`
- high, from the south-west: `-6,22,-56,8.87,1,-34.67`
- from the lake: `12.5,6,-19,8.87,1.4,-34.67`
- from the north: `23,9,-30,8.87,1.4,-34.67`

## Batches

| Batch | Work | State |
|---|---|---|
| L1 | The model (day look), in the map | **Done** |
| L2 | Evening lighting (sunset and night, no concert): LED ribs, membrane wash, uplights, small lights, light pools, and sweeping beams in haze (Ben's photo) | **Done** |
| L3 | The concert: a power-up opening (house lights out, a follow spot, the ribs light from the front arch back, then a bang), and a looping show synced to the wall clock (120 BPM, intro / build / drop / breakdown): the shell as an LED screen, the beams faster and on the beat, sky beams, lasers, crowd lightsticks, moat fountains, flame jets, fireworks over the lake every couple of minutes. Phones: thicker lights, halos, fewer fixtures. At most 3 flashes a second; with `prefers-reduced-motion`, no flashes and only slow colour changes. | To do |
| L4 | Wire the finale trigger, `?concert=0\|1` on `/map3d`, `?funfair_preview=lakefront`, the "● LIVE" tag, docs | To do |
