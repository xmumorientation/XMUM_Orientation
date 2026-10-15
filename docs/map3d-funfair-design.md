# Vortexa Funfair: design (draft, 2026-10-15)

The empty land in the dorm area of the 3D map becomes a funfair. It is part of the game. Each zone stays **powered off** (dark and still) until the key or keys that Admin assigns to it are unlocked at the lightbulbs. The zone then **powers up**: neon comes on and the rides move.

Layout: [map3d-funfair-layout.svg](map3d-funfair-layout.svg). North is up. The footprints are the real dorm positions from OpenStreetMap, stored in `scripts/map3d/campus.json`.

Status: design only. No code yet. It is step 7 of [map3d-implementation-plan.md](map3d-implementation-plan.md), after the 3D map replaces the 2D one.

## Ben's decisions

- The lightbulbs are **shared by everyone**. When any group unlocks one, every viewer sees its zone light up.
- **Admin chooses which zone powers up** after which key or keys are unlocked. This is not fixed.
- Draft rides on a separate preview page for Ben to pick from, the same way as the statue.
- The rides follow the dorm layout: the LY blocks hold some, the D blocks others. Positions are approximate. Each ride only has to sit on the empty land.

## Zones and rides

Each ride sits on the footprint of the dorm it replaces. An X-shaped LY block suits a ride with four arms, and the round Canteen D6 suits a circus tent.

| Zone | Dorms | Rides |
|---|---|---|
| **West · Neon Pier** (pink) | LY1, LY2, LY3, LY6, LY7 | **LY3: Vortexa Eye**, the Ferris wheel and the tallest landmark (about 40 m), with food stalls round it (LY3 has the restaurant icon). LY1: carousel. LY2: game booths, including a duck shoot that matches the lake's crowned duck. LY6 and LY7: spider rides (four spinning arms, like the X footprint). |
| **Central · Starlight Midway** (cyan) | LY4, LY5, LY8, LY9 | LY9: drop tower. LY8: swing ride (chair-o-plane). LY4: teacups. LY5: bumper cars pavilion. |
| **East · Big Top** (yellow) | D1–D5, Canteen D6 | **Canteen D6: Big Top**, a striped circus tent on the oval footprint. D4 and D5: roller coaster (station at D4, loop over D5). D2: haunted house. D3: pirate ship (swinging boat). D1: arcade and prize stand. |
| Shared | — | **VORTEXA neon gate** between the lake park and LY4/LY5, the entrance from the park side. One **power box** (generator) per zone; it sparks when its zone powers up. |

- The car park to the north-east of the D blocks stays a car park. It is not part of the funfair.
- The lake park, the lake and the LakeFront Café are unchanged.

## Look (the website's Vortexa concept)

The colours follow the Welcome page ([vortexa.css](../src/components/home/vortexa.css)):

- yellow: main highlight, the gate and the Big Top;
- cyan: "you are here" type accents, and the Central zone;
- pink, lilac and orange: decoration only.

### Powered off

- Dark grey metal frames.
- Unlit bulb strings.
- No motion.
- Faint "closed" boards.
- A dim red standby light on the zone's power box, so people can tell something is waiting to be switched on.

### Power-up (about 2 s, when a zone's key or keys unlock)

1. Sparks at the power box.
2. Lights run along the cables from the power box to each ride.
3. The bulb strings switch on one after another.
4. The rides start turning.

### Powered on

- Neon outlines.
- Thousands of small bulbs.
- Rides moving: the wheel turns, the carousel spins, the drop tower rises and falls, the pirate ship swings, a coaster car runs.
- Light pools on the ground.
- At **night** it is the brightest part of the map, with bloom on desktop.

### All zones powered (the finale)

The gate lights up fully, a short burst of fireworks plays over the funfair, and after that the fireworks repeat now and then.

## Wayfinding

The dorms are real. Freshies need to find LY3 or D4.

- Labels keep the dorm name with the ride, for example "LY3 · Vortexa Eye".
- The funfair has a clear "Vortexa Funfair (game zone)" label, so nobody thinks it is a real fair.

## Data and Admin control

The lightbulbs are global:

- table `projectors`;
- location type `ProjectorLocation` = `B1 | A3 | TF`;
- `activated_by_group` and `activated_at` on each row;
- read through `fn_map_lightbulbs`;
- already sent live on the map's Realtime channel.

New pieces, as a sketch for the migration:

- **Table `funfair_zones`**:

  | Column | Meaning |
  |---|---|
  | `zone` | Text, primary key: `west`, `central` or `east` |
  | `name` | Display name |
  | `required` | `ProjectorLocation[]`: the keys this zone needs |
  | `rule` | `any` or `all` |
  | `manual` | Nullable boolean: Admin's override (on or off) |
  | `updated_at` | Last change |

- **When a zone is powered**:
  - if `manual` is set, `manual` decides;
  - otherwise, when `required` is empty the zone stays off;
  - otherwise it is on when `any` (or `all`) of its `required` lightbulbs are activated.

  Computing this in a function such as `fn_funfair_state()` keeps it consistent for everyone.
- **Defaults** (Admin can change all of them):

  | Zone | Key | Why |
  |---|---|---|
  | east | B1 | The nearest lightbulb |
  | west | A3 | |
  | central | TF | |

- **Who can edit**: Admin and HOGM, through `is_game_lead()` (migration 0071), because it is a game control (AGENTS.md: decide for every new game control). Everyone else can only read.
- **Admin UI**: a "Funfair" card in the game console (Admin, and the HOGM Ops page).
  - For each zone: pick its key or keys and the any/all rule, see whether it is on now, and set a manual on/off override.
  - A preview button that plays the power-up animation for that zone, for testing during setup.
- **Realtime**: changes to `funfair_zones` and `projectors` update every open map immediately. The animation plays only when a zone switches from off to on while the map is open. Anyone who opens the map later sees the zone already on.

## Build notes

- **Code location**: `src/components/map3d/funfair/`, one component per ride, each taking a `power` value from 0 (off) to 1 (on) that it animates towards.
- **Placement**: from `campus.json`, using `fromReal` and the footprint's rotation. Rides are modelled in metres, like the statue. Sizes are near real; only the Ferris wheel is the big landmark.
- **Bulbs and neon**: instanced meshes with emissive materials. No real point lights except one or two per zone on desktop. The phone lite mode keeps slow rotation, drops the bulb flicker and bloom, and lowers the bulb count.
- **Preview page**: a dev-only bench, `/map3d/funfair-lab`, the same idea as `/map3d/statue-lab`. It switches each zone on and off and shows two or three ride styles for Ben to choose from.
- **Screenshot parameter**: `?funfair=1,0,1` (west, central, east) forces the zone states on `/map3d`.

## Decided (Ben accepted the recommendations)

1. Keep the dorm name on each ride's label? (yes)
2. Fireworks after the finale: forever, or only for a few minutes? (a burst every couple of minutes)
3. Sound when a zone powers up? (no, the app is used in lectures and halls)
