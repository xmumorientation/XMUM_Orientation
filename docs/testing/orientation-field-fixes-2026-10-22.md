# Orientation field fixes — 22 October 2026

These are source changes. They have **not** been deployed or applied to the live database.
HOF editing Faci assignments is excluded: David confirmed a teammate has fixed it.

## Changes

- Map stations follow the active or paused game day; before games begin, show Day 1; after Day 1 ends, show Day 2. Phase polling and foreground refresh recover missed realtime updates. A change of day clears the old station selection.
- Live control's two GameToggles instances use separate realtime channels. With the old component and the real Supabase client in a local browser harness, selecting All reproduced: `cannot add postgres_changes callbacks for realtime:live-control-stations after subscribe()`. Both controls render after the fix. The Admin error screen also offers a Day 1 recovery button that resets the saved local filter and reloads; it does not change game state.
- A 44px-minimum building picker offers A1/A2/etc. outside the crowded map. It opens that building's station list on either renderer, including the HOF/HOGM map. Transparent portions of 3D sprites no longer consume adjacent marker taps.
- Expanded group Faci details inherit their card's surface instead of a white background in the night theme. This fixes the screenshot's contrast; it does not invent GPS updates for phones that have never reported.
- Sign-out is scoped to the current device. The Supabase client's default is global; shared Freshie accounts could therefore have other phones' refresh sessions invalidated when one phone switched accounts or logged out. Auth redirects preserve refreshed cookies, and temporary Auth/profile-load failures no longer masquerade as a normal sign-out. Live Auth session-lifetime/single-session settings were not inspected.
- Group QR cards render directly to canvas, are cached in memory only (bounded to 12 cards, keyed by origin/group/code/colour), and are not regenerated on token-balance updates. Generation failures are visible.
- HOF/HOGM get an opt-in location switch. GPS tracking continues across app tabs while the app layout is mounted. It uses a watch plus foreground heartbeat. Stop clears the phone watcher and the server coordinates. Failed pin removal remains visible with a Stop retry. No raw position history is stored. Other staff and Facis can see these pins; Freshies cannot. Unrefreshed pins expire after two minutes. A new browser-page session starts private. Physical-phone GPS/permission/background behaviour still needs on-device verification.
- The Admin heading now distinguishes safety switches from testing overrides. Rehearsal mode bypasses phase gating and unlocks test resets; NFC demo mode lets Freshies/Facis activate projectors without a physical sticker. Neither was toggled on the live service.

## Validation

- Full Vitest suite: **13 files, 142 tests passed**, using embedded PostgreSQL.
- TypeScript check passed.
- Next production build passed. Existing warnings: campus map `<img>` lint advisory and Supabase's Edge Runtime `process.version` advisory.
- Browser harness: original All crash reproduced, fixed All rendered both days, sharing changed Off → Sharing → Off with the expected enable/report/disable calls, and expanded Faci details retained a dark surface. The harness used simulated identities and GPS; it did not call the live database.
- New database tests cover HOF/HOGM opt-in, role denial, direct-table access denial, Freshie read denial, invalid coordinates, stale fixes, per-user stop, coordinate clearing, and a delayed report after Stop.
- Live Vercel runtime logs returned 403; no live error-stack or deployed-behaviour claim is made.

## Release requirements

1. Review source changes alongside any concurrent teammate work.
2. Apply `supabase/migrations/0102_staff_location_sharing.sql` before deploying the new location UI. This migration creates a separate table and RPCs; it does not reset event data or modify Faci assignments.
3. Deploy the frontend and verify HOF, HOGM, Faci and Admin flows on real phones. Confirm no existing teammate migration also uses 0102; renumber before applying if necessary.
4. Verify simultaneous group-account sessions, switching apps, Day 1/Day 2 changes and location Stop with a second observing device. Confirm the intended live values of Rehearsal mode and NFC demo mode before the event.
