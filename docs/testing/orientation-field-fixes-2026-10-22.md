# Orientation field fixes — 22 October 2026

The staff-sharing migration is **applied to production** (final version **0103**). PR #56 is merged and production deployment `dpl_EWycDaQxY4UUKKzqf48No4e6wYnn` is **Ready** at https://xmum-orientation.vercel.app, source `f98c17e`.
The release branch now incorporates `origin/main` at `3b4365d`; the initial field-fix snapshot is `18f8ef5`.
HOF editing Faci assignments is excluded: David confirmed a teammate has fixed it.

## Changes

- Map stations follow the active or paused game day; before games begin, show Day 1; after Day 1 ends, show Day 2. Phase polling and foreground refresh recover missed realtime updates. A change of day clears the old station selection.
- Live control's two GameToggles instances use separate realtime channels. With the old component and the real Supabase client in a local browser harness, selecting All reproduced: `cannot add postgres_changes callbacks for realtime:live-control-stations after subscribe()`. Both controls render after the fix. The Admin error screen also offers a Day 1 recovery button that resets the saved local filter and reloads; it does not change game state.
- A 44px-minimum building picker offers A1/A2/etc. outside the crowded map. It opens that building's station list on either renderer, including the HOF/HOGM map. Transparent portions of 3D sprites no longer consume adjacent marker taps.
- Expanded group Faci details inherit their card's surface instead of a white background in the night theme. This fixes the screenshot's contrast; it does not invent GPS updates for phones that have never reported.
- Sign-out is scoped to the current device. The Supabase client's default is global; shared Freshie accounts could therefore have other phones' refresh sessions invalidated when one phone switched accounts or logged out. Auth redirects preserve refreshed cookies, and temporary Auth/profile-load failures no longer masquerade as a normal sign-out. Live Auth session-lifetime/single-session settings were not inspected.
- Group QR cards render directly to canvas, are cached in memory only (bounded to 12 cards, keyed by label/signed join URL/colour), and are not regenerated on token-balance updates. Generation failures are visible.
- HOF/HOGM get an opt-in location switch. GPS tracking continues across app tabs while the app layout is mounted. It uses a watch plus foreground heartbeat. Stop clears the phone watcher and the server coordinates. Failed pin removal remains visible with a Stop retry. No raw position history is stored. Other staff and Facis can see these pins; Freshies cannot. Unrefreshed pins expire after two minutes. A new browser-page session starts private. Physical-phone GPS/permission/background behaviour still needs on-device verification.
- The Admin heading now distinguishes safety switches from testing overrides. Rehearsal mode bypasses phase gating and unlocks test resets; NFC demo mode lets Freshies/Facis activate projectors without a physical sticker. Neither was toggled on the live service.

## Validation

- Full Vitest suite: **18 files, 184 tests passed**, using embedded PostgreSQL.
- TypeScript check passed.
- Next production build passed. Existing warnings: campus map `<img>` lint advisory and Supabase's Edge Runtime `process.version` advisory.
- Browser harness: original All crash reproduced, fixed All rendered both days, sharing changed Off → Sharing → Off with the expected enable/report/disable calls, and expanded Faci details retained a dark surface. The harness used simulated identities and GPS; it did not call the live database.
- New database tests cover HOF/HOGM opt-in, role denial, direct-table access denial, Freshie read denial, invalid coordinates, stale fixes, per-user stop, coordinate clearing, and a delayed report after Stop.
- Vercel project inspection still returns a team-scope 403 through the connector; CLI inspection reports the specified scope does not exist. The browser Supabase account initially displayed no access to the target project; switching to the XMUM Orientation account restored dashboard access. No live error-stack or deployed-behaviour claim is made.

## Release requirements

1. Review source changes alongside any concurrent teammate work.
2. Apply `supabase/migrations/0103_staff_location_sharing.sql` before deploying the new location UI. This migration creates a separate table and RPCs; it does not reset event data or modify Faci assignments.
3. Deploy the frontend and verify HOF, HOGM, Faci and Admin flows on real phones. Confirm no existing teammate migration also uses 0103; renumber before applying if necessary.
4. Verify simultaneous group-account sessions, switching apps, Day 1/Day 2 changes and location Stop with a second observing device. Confirm the intended live values of Rehearsal mode and NFC demo mode before the event.

## Release preparation follow-up

- Fetched all published branches and checked their migration filenames. `0089_freshie_group_positions.sql` already belongs to a teammate; main reaches `0101_group_positions_everyone.sql`. Renamed this feature to **0103_staff_location_sharing.sql** and updated its database test. Recheck immediately before applying because unpublished teammate work cannot be inspected.
- Integrated current main without reverting the teammate's Faci assignments/profile backend, static signed group QR, GM workflows, map updates or removed bigscreen route. The existing once-per-tab intro remains, including main's activation-to-map exemption.
- Adapted canvas rendering/cache to main's new QR signature; retained visible failure feedback. Restored the expanded Faci surface fix inside main's new animated folding body.
- Added a regression for zone titles: merging a separator change with main's new `zoneTitle()` must keep the area's name rather than display `undefined`.
- Final source verification: 184 tests in 18 files, production build, typecheck and lint. The existing map `<img>` and Supabase Edge Runtime advisories remain.
- **Do not deploy until 0102 is applied and verified.** Apply only this migration in a transaction after confirming the target project and live schema; do not bulk-push all historical migrations. Never run test stub schemas against production.

## Live migration result

- Applied **0102** to Supabase project `yshlczowotyoewzjtdcz` (`orientation-2612`, main/PRODUCTION), after David's confirmation. Wrapped the exact migration and its `supabase_migrations.schema_migrations` entry in one transaction.
- Preflight: table and all three functions were absent; no 0102 or staff-location migration history entry existed. Published main remained `3b4365d`.
- Postflight: table exists; RLS enabled; authenticated direct table read denied; anonymous position RPC denied; authenticated RPC granted; all three functions are security definer; one migration history entry. The table contained **0 rows** after application. No staff GPS was fabricated, and no NFC/event data was reset or deleted.
- Preview deployment `dpl_6Asxk3hyajuVYqiRQVXj72GiKQRC`, source `c8ce19d`, reached **Ready** in 1m 30s.

## Migration number correction — 23 October

The initial cross-branch check missed `origin/fix/log-audit-gaps`'s already-published `0102_admin_token_log_audit.sql`. Staff sharing is therefore **0103_staff_location_sharing.sql**. The SQL body is unchanged; the table and functions must not be created again. Correct only its own migration-history row from version 0102 to 0103, guarded by the exact `staff_location_sharing` name and absence of 0103. Preserve the teammate's 0102 reservation. This corrects the earlier numbering and release instructions; retain the original application record above as chronology.

- Correction completed on production: the guarded transaction found exactly the expected staff-sharing 0102 row and no 0103 row, changed only its version, and returned **0103 / staff_location_sharing**. Table/function definitions, migration statements, names and all user/event rows were untouched. All **184 tests in 18 files** passed again with the new filename.
- Production deployment for PR #56 reached Ready on 23 October, 01:12 MYT (1m 9s); main source `f98c17e`. Real-phone GPS and simultaneous-device behaviour remain unverified.
