# Roadmap: Planned Work

This file lists work we have agreed on or are still discussing, but have not built yet.
Read it before starting a new round of development. When a decision changes, update the item.

> **From Ben:** when you finish your work, write down what you completed in the "Done" section at the end of this file, so the next teammate can see it. Do this for partly finished items too: say which parts are done and which are left.

Last updated: 2026-10-05

## Status key

- **Ready**: scope is agreed. Build it when there is time.
- **Later**: agreed, but not a priority yet.
- **Deferred**: parked on purpose. Listed here so it is not forgotten.

## Owners

| Owner | Area | Item |
|---|---|---|
| David | **Priority:** bring the important `bonding-session` features into the current code | [Read before merging `bonding-session`](#read-before-merging-bonding-session) |
| David | Merge the design work from the different branches | [4](#4-merge-design-branches-ready) |
| Jiamin | Freshie and staff login pages | [1](#1-separate-login-pages-per-role-ready) |
| Jiamin | Faci updates group name and slogan, HOF can see them | [6](#6-faci-updates-group-name-and-slogan-ready) |
| Zichien | Everything on the map: Figma design, game station status, and so on | [5](#5-map-ready) |
| Ben | Per-group colour themes on Freshie Home | [2](#2-per-group-colour-themes-on-freshie-home-later) |

Item 3 has no owner yet.

---

## Read before merging `bonding-session`

> **From Ben: this is a priority.**
> `bonding-session` grew out of an older `main`, so a direct merge will clash with the newer work in other branches.
> David: bring the important features from `bonding-session` into the current code with your own prompts, instead of merging the branch as it is. Use the "What it adds" list below as the checklist, and read the branch's code and docs for the details.
> When the work is done, push it to `main`.

The `bonding-session` branch (12 commits by `yxyan07-gif`, 2026-10-01, about 90 files and 16 new migrations, `0015` to `0030`) adds most of the Big Game system. It is not merged into `main` yet. It changes some basics that other items in this file depend on, so align with its author before merging it or building on top of it.

This summary comes from the branch's commit messages, its docs (`docs/FOUNDATION.md`, `docs/AUTHORIZATION.md`) and a partial read of the code. Nobody has run or tested the branch as part of writing this.

### What it adds

- **Day 1 GM results:** GMs record PK or single-group results at their station. Winner and loser rewards come from config. Includes a confirmation step, duplicate-submit protection, and notifications to the group and the GM.
- **Day 2 station attempts:** a group pays the entry fee in tokens to start an attempt. Admin sets replay rules and the maximum number of attempts. One active attempt per group. The GM records win or lose, and a win grants a puzzle piece the group does not own yet.
- **Token ledger rewrite:** every credit and debit is recorded. Corrections add a new entry instead of deleting the old one. Who sees which entries is limited by group, role and station. Admin can filter by station, day and date. A reset keeps the history.
- **Puzzle management:** Admin configures the puzzle pool, sees which group owns which piece, and corrects mistakes. No duplicate pieces per group. A token reset no longer deletes puzzle ownership.
- **Blind boxes:** blind box sources, single-use QR claims, opening a box for tokens, and an Admin log. The author notes that physical QR scanning, single-use protection and opening a box for tokens are **not manually tested yet**.
- **NFC puzzle redemption:** single-use NFC cards at the Lighting Zones. This replaces the Guardian's manual check. Admin can configure cards, view logs, reset, and revert an activation.
- **Inventory page:** split into separate Token, Puzzle and Blind Box parts, each loading and updating live on its own.
- **Admin area:** account management, Faci group assignment, GM station assignment per day (Day 1 and Day 2), gameplay config, and a Timer page.
- **Roles and permissions:** a central permission registry (`role_permissions`, `src/lib/permissions.ts`) used by menus, middleware, API routes and the database. Users without access see a `/forbidden` page. Logins, logouts and failed logins are logged.

### Conflicts with this file

1. **Freshies have no login accounts in that branch.** Its docs say Freshies exist only in the registration roster (`freshies` table) and get no Supabase Auth account, and it removes the Freshie test accounts.
   **Decision (Ben): Freshies do log in.** A Freshie reaches Freshie Home in one of two ways:
   - scan their QR code, which goes straight to Freshie Home;
   - log in as a Freshie from the welcome page ("Freshie Login" button, item 1).

   When porting `bonding-session`, keep the Freshie role able to log in. Do not port its "Freshies have no Auth account" model, or the removal of the Freshie test accounts. Features that assume no Freshie login (for example inventory and group lookups) need to work for a logged-in Freshie, too.
2. **There is no Committee role in that branch.** It keeps four roles: `freshie`, `faci`, `gm`, `admin`. Committee, HOF and HOGM become `admin`, with an optional `admin_team` label. Guardian GM becomes `gm`. `/committee` redirects to `/admin/operations`. If it is merged:
   - rename the "Committee and Faci GM Login" button and the staff login page in item 1;
   - update the roles mentioned in item 5 (map);
   - rewrite [permission-matrix.md](permission-matrix.md), which describes eight roles.
3. **Overlapping files.** Both this branch and `bonding-session` change the dashboard, the app shell, the menus and the login page. Expect merge conflicts there (item 4).
4. **Item 3 may already be fixed there.** Its migration `0018` removes the `allow all` policies, revokes `anon` access, and adds role checks to the token and Freshie RPCs. `seed-test-accounts` and `/api/token` now require a permission. Re-check item 3 after merging, and do not reuse migration numbers `0015` to `0030`.

## 1. Separate login pages per role (Ready)

**Owner:** Jiamin

**Goal:** Freshies and staff get different login pages, each with its own design and login method.

**Current state:**
- The phone and tablet menu on the public homepage has two buttons, "Freshie Login" and "Committee and Faci GM Login". See [SiteNav.tsx](../src/components/home/SiteNav.tsx), at the `TODO(auth)` comment.
- Both buttons still go to the shared `/login` page ([login/page.tsx](../src/app/(auth)/login/page.tsx)).

**To do:**
1. Build two pages: `/login/freshie` (Freshie) and `/login/staff` (Committee, Faci, GM). The paths are suggestions, not final.
2. Point each menu button at its own page.
3. **Staff page:** add Google login.
   - Turn on the Google provider in Supabase Auth.
   - Decide whether to allow only school accounts (for example `@xmu.edu.my`).
   - A Google account still needs a row in `profiles` with the right role. Decide how a new staff member gets that role: an admin assigns it, or the account is matched against an imported list.
4. **Freshie page:** a Freshie can reach Freshie Home (`/dashboard`) in two ways:
   1. Log in on the Freshie login page.
   2. Scan a QR code, which logs them in and goes straight to Freshie Home without the login page.
   - **AI note (from Claude, not a team decision):** scanning the code is the same as logging in. Each QR code should log in only one Freshie, be unique to that person, and be hard to guess. Otherwise a forwarded photo or a guessed code would let someone else log in as that Freshie.
   - Related code: [scan/page.tsx](../src/app/(app)/scan/page.tsx), [QrScannerScreen.tsx](../src/components/scan/QrScannerScreen.tsx), [FreshieHome.tsx](../src/components/freshie/FreshieHome.tsx).
5. Decide what happens when someone logs in on the wrong page. For example, a Committee account used on the Freshie page could be rejected, or redirected.
6. Decide whether the desktop top nav also needs these buttons. Today it shows only the yellow "Join the Game" button.

## 2. Per-group colour themes on Freshie Home (Later)

**Owner:** Ben

**Goal:** each of the 10 Freshie groups sees its own colour scheme on the Freshie Home page (`/dashboard`, Freshie role).

**Scope:** colours only. Layout, content and page logic stay the same for every group. Do not build separate pages per group.

**Current state:** [groupTheme.ts](../src/components/freshie/groupTheme.ts) already supports one accent colour and one glow colour per group, keyed by group id. No group has colours filled in yet, so every group shows the default blue.

**To do:**
1. Pick an accent colour and a glow colour for each group. Check that the accent stays readable on the dark background.
2. Fill them in under `GROUP_THEMES`.
3. Check whether other fixed colours on the page should follow the group theme too, for example the pink glow and the sparkles in [FreshieHome.tsx](../src/components/freshie/FreshieHome.tsx).

## 3. Lock down open tables, RPCs and API routes (Deferred)

Parked for now. Fix it before real Freshie data and the live game go on the site. "Why this matters" explains the risk.

**Update:** the `bonding-session` branch appears to fix most of this item. See "Read before merging `bonding-session`" above. This item describes `main` as it is today.

### Why this matters

The Supabase anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) is shipped to every browser, so anyone can copy it from the site.
Today several tables, RPCs and API routes accept requests made with only that key, or from any logged-in user.
No account is needed for most of the problems below.

Migrations 0012 and 0013 caused most of these gaps. They replaced the earlier role-based policies with `using (true)` policies, and granted everything to `anon`.

### What is open, ordered by risk

**A. Personal data in `freshies` is fully open.** Anyone can read, add, change or delete rows. The table holds names, phone numbers and student IDs.
- Source: [0013_fix_token_logs_rls.sql:233-241](../supabase/migrations/0013_fix_token_logs_rls.sql#L233-L241).
- Risk: data leak (a privacy and PDPA issue), and the roster can be edited or wiped.

**B. Admin accounts can be taken over.** `POST /api/admin/seed-test-accounts` does not check the caller's role. Any logged-in user, including a Freshie, can call it. It creates the hardcoded test accounts, or resets their passwords, and the admin test account is one of them.
- Source: [seed-test-accounts/route.ts:35](../src/app/api/admin/seed-test-accounts/route.ts#L35).
- Risk: anyone can reset the admin password and log in as admin.

**C. Game data is fully open.** `token_logs`, `puzzle_inventory` and `game_config_rules` use the same open policies as `freshies`.
- Source: [0013_fix_token_logs_rls.sql:218-240](../supabase/migrations/0013_fix_token_logs_rls.sql#L218-L240).
- Risk: anyone can give a group tokens or puzzle pieces, change game rules, or delete the scoreboard history.
- **Partly fixed (0056):** deleting `token_logs` / `puzzle_inventory` rows is now Admin only, and the Token page's Reset State runs inside the database. Select, insert and update are still open.

**D. RPCs have no role check.** These functions are `security definer`, so they bypass RLS. Postgres lets any role execute a function by default, and 0013 also grants some of them to `anon` explicitly.
- Can wipe data: `fn_set_total_groups`, `fn_set_freshie_group_count`. A lower count deletes the extra groups' tokens, puzzles, attendance and locations.
- Freshie records: `fn_admin_update_freshie`, `fn_admin_delete_freshie`.
- Tokens and game: `fn_day1_record_result`, `fn_day2_deduct_entry`, `fn_day2_award_piece`, `fn_manual_token_adjust`, `fn_update_game_config_rule`.

**E. `/api/token` has no role check.**
- Source: [api/token/route.ts:18](../src/app/api/token/route.ts#L18).

### How to fix

1. Add a new migration. Do not edit 0012 or 0013, because they may already be applied to the live database. Numbers `0015` to `0030` are already used in `bonding-session`, so pick the next free number after those.
2. For each table in A and C:
   - Drop the `allow all ...` policies.
   - Add role-based policies that use `public.my_role()` and `public.my_group_id()`, in the same style as [0002_rls.sql](../supabase/migrations/0002_rls.sql).
   - Revoke the `anon` grants.
3. For each RPC in D:
   - Add a role check at the top, for example `if public.my_role() not in ('admin') then raise exception 'FORBIDDEN'; end if;`.
   - `revoke execute ... from public, anon;`
   - `grant execute ... to authenticated;`
4. Add role checks to the two API routes in B and E. Remove `seed-test-accounts` from production, or allow only admin to call it.
5. Test every page with each role (Freshie, Faci, GM, Guardian GM, Committee, HOF, HOGM, Admin). Some pages may work today only because everything is open, and they will break once the database is locked.
6. Compare the live database with the migrations before you apply the fix. Manual changes made in the Supabase dashboard are not in the repo.

### Decisions needed before step 3

- **Who may operate the Token System?** Today Faci can add and deduct tokens. See [permission-matrix.md](permission-matrix.md), issue 5. Decide the allowed roles for each token RPC.
- **Who may edit Freshie records?** Only Admin, or Committee as well?

Full background: the "Issues Found" section in [permission-matrix.md](permission-matrix.md).

## 4. Merge design branches (Ready)

**Owner:** David

**Task:** merge the design work from the different branches together.

## 5. Map (Ready)

**Owner:** Zichien

**Goal:** own every part of the campus map.

**Scope:**
- Build the map to match the Figma design.
- Game station status on the map (for example open, busy, closed).
- Group locations on the map, with the existing permission rules: Faci sees their own group, Committee and above see all groups.
- Anything else on the map page.

**Figma:** [XMUM campus map](https://www.figma.com/design/3dcEv45KenmKcoTcbaZmQ0/Untitled?node-id=24-2) (frame `XMUM Block Cube_XMUM Map 1`).

**Current state:**
- Map page: [map/page.tsx](../src/app/(app)/map/page.tsx). Map component: [CampusMap.tsx](../src/components/CampusMap.tsx). The illustration is `public/campus-map.png`.
- Labels on the art: A1–A5 along the red-roof row (A1 at the monument end, A5 at the lake end), Track & Field on the pitch, B1 on the white-and-red block.
- Station dots still show available / in progress / closed, and still update from the `stations` table without a refresh. Group pins still follow the permission rules below.
- `David-MapPage` colours dots by occupancy (`fn_public_station_occupancy`). That function is not on this branch, so it was not copied. The branch still uses the old rectangle map, not this Figma art.
- Who can see what on the map: see the "Campus Map" and "Group locations" rows in [permission-matrix.md](permission-matrix.md).

**Still open:**
- Seeded stations are removed. New ones are created in Admin → Stations and sit on A1–A5, B1, or Track & Field.
- GPS pins are drawn on the art (see Done, 2026-10-07). The calibration needs a real walk-through to confirm.
- The lake, monument, and brown field are in the picture and are not labeled.

## 6. Faci updates group name and slogan (Ready)

**Owner:** Jiamin

**Goal:** a Faci can update their group's name and slogan, and HOF can see every group's name and slogan.

**Current state:**
- The `groups` table has a `name` column (unique), but no slogan column yet. See [0001_schema.sql](../supabase/migrations/0001_schema.sql).
- Today only Admin can update `groups`. A Faci can read only their own group.

**To do:**
1. Add a `slogan` column to `groups` in a new migration.
2. Let a Faci update the name and slogan of **their own group only**. Use an RPC that checks the caller is a Faci of that group, rather than opening `groups` for direct updates (the table also holds `token_balance`).
3. Build a simple form for the Faci to edit the name and slogan.
4. Show all groups' names and slogans to HOF.
   - Note: in `bonding-session`, HOF is an `admin` account with `admin_team` set. Check which role model is in use when you build this.

---

## Done

### Facilitator automatic precise location reporting, 2026-10-09
- Facilitators now always ask for and report precise location (`enableHighAccuracy: true`) upon logging in or opening the app, regardless of which page they are on (dashboard, schedule, inventory, code, attendance, etc.).
- `FaciLocationProvider` in `src/components/FaciLocationTracker.tsx` continuously reports coordinates to `fn_report_gps` (immediately on mount, throttled movement updates via `watchPosition`, 60s heartbeats while stationary, and instant refresh on returning to the foreground).
- Prompts facilitator with a floating banner when precise location has not yet been allowed or is blocked, ensuring browser permission can be granted with a single tap.
- Location Check-in page (`/checkin`) now displays the live global GPS status and last report time.

### Full-screen campus map, 2026-10-09
- Tapping the map, or the Full screen button, opens the picture over the whole phone screen. It no longer zooms in on the tap.
- The whole campus is visible first. Drag to move, pinch or use + and − to zoom (up to 8×), and reset to fit the screen again. Close or Esc leaves the viewer. The page underneath does not scroll while it is open.
- Station dots, group pins and building names still work in the viewer. On check-in, the confirm bar stays above the map.

### Token reset moved into the database, 2026-10-09
- `/admin/token` → Reset State now calls `fn_reset_tokens_and_puzzles` (migration `0056_token_reset.sql`). The database checks that the caller is Admin and that Rehearsal mode is on; the button is also greyed out when it is off. Same scope as before: clears `token_logs` and `puzzle_inventory` and sets every group's tokens to 0. It does not touch `token_transactions` or the newer `inventory`. Audited as `tokens.reset`.
- Part of item 3C: deleting rows from `token_logs` and `puzzle_inventory` is now Admin only (it was open to anyone). An Admin can still delete rows directly; only the full reset is guarded by Rehearsal mode. Select, insert and update on those tables, and the open RPCs in item 3D, are unchanged.
- Run `0056` in the SQL editor before deploying: the new button code calls a function that does not exist until then.

### Blind boxes v3, 2026-10-09
- One blind-box system managed from Admin → Blind box. It replaces both the committee QR boxes and the GM "Sell a blind box" button (the GM Box tab and `gm_blindbox_*` config are gone).
- Box types (name, min/max tokens, price, stock, special) are created, edited and deleted by Admin. A type that has been assigned is archived instead of deleted.
- Boxes are assigned to an account (gm, guardian_gm, committee, hof, hogm, admin; not faci or freshie), to a station (its GMs share one pool and one QR), or in bulk by role, to all stations, or to picked stations. Bulk is all-or-nothing against remaining stock. Quantities can be raised or lowered later (not below what was opened).
- QR = HMAC of (assignment id, qr_version), recomputed on demand (`POST /api/blindbox/links`), never stored. Admin previews never invalidate a code; Regenerate does. Every code shows its link with a Copy button.
- Freshie flow: scan → confirm screen (seller, type, price, balance; range hidden) → Open. Opening the link only previews; the price is paid and one box deducted only when Open is tapped (`fn_open_blind_box`, idempotent).
- Limits are per group and enforced in the database: one open per seller (a station is one seller), and a total cap (`blindbox_group_cap`, default 4, editable in Admin → Blind box → Settings).
- Admin page: stock / assigned / unassigned / opened / left, tokens paid in and out, groups at cap. The "My blind box QR" card (now `BlindBoxCard`) is on /committee, /gm and the Admin page.
- Test reset (Admin → Blind box → Settings, migration `0055_blindbox_reset.sql`): "Restore boxes" sets every opened box back to unopened (each seller has their full assigned number again), clears the groups' opens and puts their tokens back; "Reset everything" also deletes assignments and box types. Only works while Rehearsal mode is on, and needs the word RESET typed. Audited. Migration `0057_blindbox_reset_tokens_option.sql` adds a checkbox "Also put the groups' tokens back" (on by default): off leaves group balances and the token log untouched. Migration `0058_blindbox_reset_where.sql` fixes the reset on Supabase: its API rejects a DELETE with no WHERE, so 0055/0057 failed silently. Rule for new SQL: every DELETE and UPDATE needs a WHERE (use `where true` for all rows).
- Migration `0054_blindbox_v3.sql` drops the old blind-box tables and RPCs. Run it BEFORE deploying this code. It aborts if any old claim or sale exists, and refuses to run twice.
- Checked: `tsc`, `next lint`, `next build`, and 83 database checks (stock maths, bulk, caps, idempotency, archiving, RLS) against an in-memory Postgres with the migration applied on a stub of the schema.
- Not done: the migration has not been run on the real Supabase project, and nothing was tested in a browser against it. The in-app scanner on /scan still says "coming soon" (phone camera works). Not load-tested with many groups opening at once.

### Zichien, 2026-10-08
- The campus map is the original Figma export again (`public/campus-map.png`, 3203×1776), including the brown field. The edited cut was removed.
- Building and projector positions match that image.

### Map zoom and bigger check-in zones, 2026-10-07
- The map stayed still until you tapped it, then zoomed to 2× at that spot. That tap now opens the full-screen viewer instead (see the 2026-10-09 note above). While the small map is on the page, scrolling still works. Taps on stations, group pins and buttons do not open the viewer.
- Migration `0064` (renumbered from `0049`): the "you seem far from this station" warning now also accepts the whole building (A1–A5 90 m, B1 140 m, Track & Field 130 m around the real GPS points) and allows for the phone's GPS accuracy (up to 100 m). It still never blocks a check-in. Run `0064` on the live database.

### Live group GPS pins on the map, 2026-10-07
- Faci's phone GPS (the opt-in toggle on the check-in page, one report a minute while the page is open) is drawn as a numbered, coloured pin on the art. Tap a pin for the group name, age and accuracy.
- `src/lib/mapGeo.ts` converts lat/lng to the picture. It uses the real GPS of A1–A5, B1 and Track & Field as anchors (affine fit plus a correction so each anchor is exact). To recalibrate, edit `GPS_POINTS` there. The courts are between B1 and Track & Field but are not on the art, so they are not an anchor.
- Pins fade after 3 minutes and leave the map after 15 minutes. The list under the map still shows the last report. Positions outside the picture are not drawn.
- Migration `0063` (renumbered from `0048`): `fn_latest_gps_locations()` (last hour, Committee tier sees all groups, Faci sees their own, GM and Freshie see none). `fn_report_gps` deletes that group's GPS rows older than 1 hour.
- Left: run migration `0063` on the live database and walk the campus to check the pins. (GPS now auto-reports app-wide for facilitators, see 2026-10-09 note above).

### Station capacity and automatic status, 2026-10-06
- Migration `0062` (renumbered from `0047`): each station has `max_groups` (required in the admin forms; existing stations stay as they are until it is set). When that many groups are checked in the station becomes In progress, otherwise Available. Closed stays manual.
- A group is at one station at a time (`station_occupancy`). Checking in elsewhere moves it. Full station: check-in is rejected (`STATION_FULL`). Faci can leave their own station (`fn_uncheckin`, "Leave station" on the check-in page). GM and admin can clear a station (`fn_clear_station`), which also resets a manual In progress.
- Status dropdown now calls `fn_set_station_status`: In progress is a manual override until the station is cleared or set back to Available.
- Check-in sends the Faci's GPS and warns (never blocks) if outside the station radius. Stations have optional `lat`, `lng`, `radius_m` (default 100 m); none are filled in yet, so no warning appears until an admin sets them.
- Map pins only show a group at a station while it is still checked in there.
- Left: run migration `0062` on the live database, then set "Groups at once" on each station. Real lat/lng for each station.

### Zichien, 2026-10-05
- Campus map now uses the Figma illustration (`public/campus-map.png`) instead of the grey blocks. Labels: A1–A5, Track & Field, B1.
- Station status (available, in progress, closed), the Day 2 projector layer, and group pins still update live.
- Migration `0060` (renumbered from `0045`) deletes the seeded stations (A4-1, CRT-1, and the rest). On the Campus map, an admin clicks a building to add a station there. The short code is generated (A1-1, TF-1). The same panel edits the game and status, or deletes the station.
- Left: GPS pins are still a list; lake, monument, and the brown field are unlabeled.

### David, 2026-10-06
- One primary action: "Join the Game ★" opens the login chooser from the Welcome page, the mobile menu and the desktop top bar. "How to check in" is an outline button everywhere. Removed the separate Freshie and Committee login buttons from the menu, top bar and footer. Menu buttons are 48px tall.
- Login chooser: Freshie Login is the yellow button, Committee, Faci, GM login is outline, with one line of explanation, a close (X) button, scroll lock and the site font.
- Freshie, Committee/Faci/GM, forgot password, reset password and pending approval pages share one dark layout (`AuthShell`): centred Vortexa wordmark, pill inputs, dark selects with a chevron, a disabled style for buttons, `role="alert"` errors. The (auth) layout no longer adds the light "Welcome to XMUM" header. Committee/Faci/GM login puts email sign-in first, with Continue with Google under it and no role picker (main's flow: Admin assigns the role on approval). Freshie login asks "Choose your group" instead of preselecting the first group.
- Demo quick logins show only on local dev and Vercel preview, not on production. Their passwords moved to a server-only file, so they are no longer in the browser bundle. Test accounts unchanged.
- Welcome progress bar: the stop label now has a fixed width, so the bar no longer jumps between Games and Scoreboard; the fill animates smoothly. Credits labels and tab labels are 12px. Logo images have `sizes`.
- Left: Coca-Cola example logo and the Score tab (owner decision).
- Committee, Faci, GM pages share the dark navy design on mobile and desktop: /dashboard, /committee, /gm, /guardian, /schedule, /attendance, /checkin, /code, /token and Ops. The map and Items pages keep their own design. Subpages get a top bar with a back link to Home, the role name and one menu button on the right; the side menu now highlights the current page.
- Token page (TokenControl: the /token scoreboard and /admin/token): 16px inputs, 44px targets, 14px labels, dark selects, light text on navy; sort buttons expose aria-pressed.
- GM: darker green buttons for readable white text; tabs and toggles expose aria-pressed. Faci: lighter group colour text and the checklist lines up with the other blocks. Stale timestamp and status colours readable on dark. Schedule edit and delete buttons are 44px. UI only, behaviour unchanged.

### David, 2026-10-06
- Safari bands follow-up: the closed Welcome menu backdrop stays `display: none` until it opens, so it cannot tint the toolbar. The staff dashboard header pads below the status bar. Staff uses the shell navy `#030b1c`; Welcome and login stay `#07060b`. Light pages keep the paper background.

### David, 2026-10-06
- iPhone Safari was showing white bands above the header and below the tab bar. Safari 26 takes that colour from the page background and ignores theme-color; the root was still the light paper colour, and the blurred bars are not sampled. Dark pages now paint the root with their own dark background, and the staff dashboard keeps its content below the status bar.

### David, 2026-10-06
- Increased staff-menu outside dimming to 88%. Prepared the approved Vortexa UI/dashboard/admin performance work for a local main commit. Unrelated pre-existing notes and separate event-name/migration edits are excluded; no push requested.

### David, 2026-10-06
- Staff menu close moves to the right, matching the trigger side; menu outside area uses a 72% black overlay. Ambient dashboard background fills the shell, with responsive content checked at 320/393/768/1280px (no horizontal overflow).
- Admin Token refresh shares the inventory read, merges in-flight requests and batches realtime bursts, with a 30-second visible-only fallback and immediate post-action refresh. Added sync feedback and admin route loading UI. Network baseline: 15 REST requests over 8 seconds idle; after settled load, 0 over 8.5 seconds. A refresh batch now has four reads rather than five. Mutation/realtime burst behavior and physical-device click latency remain unverified.

### David, 2026-10-06
- Public background now descends from rocket/planets and sparse stars through aircraft/clouds into park balloons, booths and path lights. Celestial stars end before the park region. Added lightweight static SVG decorations; existing content and wheel motion retained.

### David, 2026-10-06
- Staff menu uses a compact top sheet without monogram; dashboard logo reduced and footer centred. Freshie return link matches the staff outlined button. Admin surfaces and shared navigation adopt Vortexa typography/dark palette; mobile group table becomes labelled per-group cards. Existing admin actions and confirmations preserved. Preview checks are read-only; no phase or group mutations performed.

### David, 2026-10-06
- Reverted the last public progress/entrance animation adjustment on request. Progress markup remains in SiteNav.tsx, styles in vortexa.css, section tracking in OrientationHome.tsx.
- Added a shared Vortexa staff dashboard for Faci, GM/Guardian, Committee/HOF/HOGM and Admin, with role-specific primary actions and existing navigation. Faci checklist forms and backend submission logic reused. Dashboard sidebar/drawer follows the dark palette. Admin mobile view and menu interaction checked; other role views and physical devices remain unverified. No commit or push.

### David, 2026-10-06
- Removed the login Sign-in required badge and Items group/sample header row on request; inventory still uses sample data. Schedule dates use commas. Public stopbar progress now follows scroll with a transform rather than a delayed width transition; mobile entrance rise animations removed. Physical-device scroll performance remains unverified.

### David, 2026-10-06
- Schedule restored directly from the original Git version, with only the display heading font added. Freshie account trigger now shows Freshie to avoid repeating group identity. Items timer moved beneath the title into a single phase/status row; sample data and animations preserved.

### David, 2026-10-06
- Restored Schedule card/timeline and filled day tabs, retaining the display heading and keyboard navigation. Dashboard partner logos use a quiet strip with accessible role labels. Items sample label uses the shared body font; phase time has an explicit game-time caption. Inventory timer remains sample data.

### David, 2026-10-06
- Removed Freshie account border and duplicate greeting. Rules show directly; small organiser/sponsor credits now sit beneath the arrival area. Schedule uses plain date tabs with keyboard navigation and a single unconfirmed-times notice. Items keeps animations and structure with shared fonts and plain phase/activity controls. Group avatar upload is a proposal only.

### David, 2026-10-06
- Mobile polish: reserved space for the public ferris wheel, moved scoreboard sparkle upward, made section tracking deterministic and removed conflicting scroll snapping. Login has more top space and plain footer wording.
- Freshie header now has one group menu instead of role pill plus gradient avatar; guide opens from a labelled disclosure. Dashboard uses production copy while Items retains its real sample-data marker. Schedule switches to a simple programme list and scanner copy is shortened.

### David, 2026-10-06
- Freshie dashboard trial: compact group-colour arrival, live phase timer, shared database schedule with retry state, map action, real token balance, shortcuts and lower-page scoreboard. Rules collapse and sponsor credits move down; Items is explicitly a demo. Faci checklist/home preserved.
- Removed Freshie full-screen stops and observer work; below-fold sections use content visibility. Scoreboard retains realtime updates with a 30-second foreground-only reconciliation interval instead of unconditional 4-second polling. Click latency root cause and real-device improvement remain unverified. Backups: /private/tmp/FreshieHome-before-redesign.tsx and /private/tmp/freshie-before-redesign.css.

### David, 2026-10-06
- Restyled `/forgot-password` to reuse the staff login page's Vortexa background, typography, form fields, button and return link. Password reset behavior and email notice remain in place.

### David, 2026-10-06
- Removed the Committee invite activation link from the staff login form. The activation route remains available for invitation flows.

### David, 2026-10-06
- Moved the upper yellow star left, changed check-in device guidance and removed the redundant note. Simplified scoreboard empty-state copy and standardized wristband ticket wording in source text. Web-app icons now use the supplied square Vortexa artwork; existing transparent page logos depict the same identity.

### David, 2026-10-06
- Removed the rejected Welcome coaster trails, keeping the continuous space-to-park background and adding one small static rocket in the upper sky. Freshie login keeps its layout with shared theme lettering and Back to Welcome copy.

### David, 2026-10-06
- Removed Welcome Scroll hint and its measurement effect, restored theme lettering for Welcome To, and added static neon coaster trails behind the hero. Games keeps four steps and drops duplicate explanatory prose.
- Set root/home metadata and web-app manifest to Vortexa with description XMUM 26/12 Orientation. Generated square PNG icons from the existing Vortexa logo and replaced the old route icon. Local changes only.

### David, 2026-10-06
- Welcome visual trial: theme-font section headings, readable Outfit supporting text, sparser stars without the repeating dot grid, and proximity scrolling on mobile. Schedule and Scoreboard can grow with content. Previous background/CSS saved in /private/tmp/xmum-welcome-before-trial for review.
- Removed login logo and changed role copy to "Committee, FACI and GM". Trial remains local pending visual review.

### David, 2026-10-06
- Login-only visual trial: Vortexa logo, compact role line and cyan theme-font Login heading; quieter background glow. Previous login files backed up at /private/tmp/xmum-login-before-trial. Full-site rollout awaits visual review.

### David, 2026-10-06
- Reordered public mobile navigation to Home, Schedule, Games, Score. Simplified Committee FACI GM login to one heading, removed decorative role chips, updated campus-email and Committee invitation copy, and moved demo presets into a collapsed section below the main form. Authentication behavior unchanged.

### David, 2026-10-06
- Welcome UI polish: removed duplicate local stars/glows and the theme introduction, tightened slogan spacing, and added a line break before Discover. Removed the decorative sparkle behind the Schedule tabs.
- Unified login entry labels as "Committee FACI GM login" across the welcome navigation, chooser, footer, check-in copy and login heading.
- Verified TypeScript and a 393px browser preview. Broader welcome/login background redesign remains open; changes are local and have not been committed or pushed.


### Jiamin, 2026-10-06 (live control)
- Live control (`/admin`, menu "Live control"). A big **Day 1 / Day 2** dropdown beside the title shows only that day's schedule (it opens on Day 2 once Day 1 Game has ended). Right beside it: **Start Day N Game** (green) / **End Day N Game** (red), with "n/m stations open" (click for per-station overrides). Endgame has no button; projector revival still needs it (see Left). A running game unlocks its game rules. Starting Day 1 or Day 2 Game opens that day's closed stations; ending it closes them. GMs still toggle Busy / Available.
- **Schedule items run by their planned times by themselves** (no Start button). An item is "on" from its planned start to its live end. **Live schedule** rows show their time and Upcoming / On now / Paused / Done, and open into **1. Session** (Open / Close attendance by hand) and **2. Time** (status only). The item that is on is adjusted in the box below. Times are edited on the Schedule page only.
- **Now on the Welcome page** box at the top of Live control: the same title and countdown the Welcome page shows, with Pause / ±5 / Stop for the item it counts. None of this changes the schedule.
- **Game timer** (beside the game button): set the game's **Length** before Start (default 150 min); while it runs, a countdown with Pause / Resume and −5 / +5, and End. It ends itself when time is up (`fn_game_expire`, migration `0052`: pg_cron every minute if Supabase allows, and any open app page the moment it hits zero), which closes that day's stations and locks its game rules. The sidebar timer, big screen and Freshie game card show its countdown. It is separate from the Welcome page countdown, so keep the game's length and its schedule row roughly in step.
- Schedule editor (`/schedule`, admin): drag rows by the grip (or use ↑/↓) to reorder within a day; that order is used everywhere. The date belongs to the day: set it once and it applies to every item of that day (changing it moves the whole day; migration `0050`, table `schedule_days`). Each row has a planned start and end; the time text Freshies read fills from them and stays editable. Planned times never move when a live timer is adjusted.
- The Welcome page and Freshie Home countdown follow the schedule: "ORIENTATION DAY 1 STARTS IN" (to Day 1's first item), "<ITEM> ENDS IN" while an item is on (its live end, including Live control changes), "<ITEM> PAUSED", "<NEXT ITEM> STARTS IN" between items, "ORIENTATION DAY 2 STARTS IN", then "ORIENTATION COMPLETE". With no planned times yet it counts to the day dates (08:00). The Welcome Schedule day tabs take their dates from the schedule. Game timers elsewhere (sidebar, big screen, Freshie Home game card) show "LIVE" for a running game.
- Admin → Freshies → **Headcount** is one table: a row per group, a column per Live schedule item in schedule order (Not opened / Open / Closed), totals and "n/10 groups" at the bottom. A column takes headcounts once its session is opened in Live control. Old sessions that are not on the schedule are under the "Not on schedule" filter. Filter by day and by item; click a number to correct it (Enter saves). Faci headcounts and sessions opened in Live control appear live (migration `0053`).
- Removed: the old Phase control, the Sessions page (`/admin/freshies/sessions`; past sessions stay in the database and Headcount still uses them), and the Stations page Set status column.
- Migration `0049` (`fn_game_toggle`, stations follow the game, schedule timer and session columns, `fn_schedule_timer`, `fn_schedule_session`). **Run `0046`, `0047`, `0049`, `0050`, `0051`, `0052` in order** (`0051` fills in suggested times for the current items) (if an earlier draft of `0049` was run, run the current `0049` again: it cleans up the draft). Adjust the suggested times on the Schedule page.
- Left: Endgame no longer has a button. Projector revival (`/activate`) only works while Endgame runs (`phase_active('endgame')`), so it can't happen now except in Rehearsal mode. Decide: allow revival during Day 2 Game, or make Endgame the last 30 min of Day 2 Game.

### Jiamin, 2026-10-06 (event countdown)
- One countdown for the whole event ([useEventCountdown.ts](../src/components/useEventCountdown.ts)), used by the Welcome page Overview and Freshie Home. Before Day 1 it counts to D-day (`EVENT.dates.day1`). While a game phase runs it counts down that phase ("DAY 1 GAME ENDS IN"), frozen while paused. After Day 1 it counts to Day 2, shows "<phase> STARTS SOON" while waiting for Admin to start a phase, and "ORIENTATION COMPLETE" at the end. It follows Admin → Phase control live.
- (Superseded by the live control entry above: the countdown now reads the schedule.)

### Jiamin, 2026-10-06 (scoreboard)
- The staff menu item "Token System" (`/token`) is now **Scoreboard**: just the live leaderboard, with no token rules and no transaction log. Admin keeps the full page at `/admin/token`. Both use [TokenControl.tsx](../src/components/token/TokenControl.tsx).
- GM Station page: the Active group card no longer sticks over the tabs, and the tab row has as many columns as there are tabs.

### Jiamin, 2026-10-06 (stations)
- Stations page (`/admin/stations`): Add and Edit (pencil icon) use one form with station name, Day 1 or Day 2, block (pick from the list or type a new one), floor, and risk tier (Day 2 only). The station's code is its location, built from block and floor (for example `A4-1`). There are All / Day 1 / Day 2 tabs, and each row shows its day and assigned GMs. Day 1 rows show "—" for risk and entry fee.
- Delete is blocked when a station has token history (it offers to close the station instead), and it warns when GMs are assigned.
- GM Station page shows only its station's day: the Day 1 tab at Day 1 stations, the Day 2 tab at Day 2 stations. The server enforces this too (`WRONG_DAY_STATION`).
- Migration `0047`: `stations.day` must be 1 or 2, `stations.code` is no longer unique, and `fn_day2_challenge` refuses at Day 1 stations. **Run `0047` after `0046`.** Every existing station starts as Day 1, so set the Day 2 stations in Admin before Day 2.

### Jiamin, 2026-10-06 (token rules)
- One token control panel. The Quick Token Operator and presets on the Token page (`/admin/token`) are replaced by **Token Rules**: Day 1 Win, Day 1 Lose, and the Day 2 entry fee for Easy, Medium and Hard. Admin sets them; everyone else sees them read-only. There is no manual add or deduct any more: tokens change only through the GM Station page (Day 1, Day 2, blind box, undo).
- The GM Station page (`/gm`) reads the rules. Day 1 buttons show the current amounts and call `fn_gm_day1_reward`, which takes the amount from the rules on the server. GMs cannot pick an amount any more.
- The Day 2 fee is set per tier only. `stations.entry_cost` follows the tier's rule automatically and is read-only on the Stations page. The Groups list and "Add group" were removed from the Stations page.
- Migration `0046`. It keeps `groups.current_tokens` equal to `token_balance`. It drops the free-amount token functions `fn_adjust_tokens` and `fn_manual_token_adjust`, makes `fn_update_game_config_rule` admin only, limits writes to `game_config_rules` to admin, and makes the unused `fn_day1_record_result`, `fn_day2_deduct_entry` and `fn_day2_award_piece` uncallable. The unused `/api/token` route was deleted. **Run `0046` in Supabase before deploying this.**
- Left: GM actions still log to `token_transactions`, and admin actions log to `token_logs`. The Token page log does not show GM actions yet; merging the two logs is the next step.

### Ben, 2026-10-06
- New Freshie and Faci Items page (`/inventory`), in [src/components/freshie/items/](../src/components/freshie/items/). **It shows SAMPLE DATA only** ("Sample data" in the header): nothing comes from the game yet.
- Layout: three projector lamps, each over its puzzle key (B1 Star Key, A3 Wheel Key, T&F Orbit Key; 5 slices, one per piece). Until the full map unlocks (`mapUnlocked`), locations show only as code names (Star, Wheel, Orbit) and the Guardian spot stays hidden. Then a shelf with Tokens, Gold box and Standard box. Tapping a key, a tile or Activity opens a sheet. A completed key opens the key and Guardian spot. Faci can open boxes; Freshies only see them.
- When a piece arrives while the page is open, its slice pops in. The 5th piece plays the completion effect (slices flash, ring and sparks, light runs up to the lamp, key banner slides in).
- `/inventory` on its own plays the T&F key completing, with a Replay button. Add `?demo=day1|day2|ready|taken|won` to see the other states.
- Blind box flow ([BlindBox.tsx](../src/components/freshie/items/BlindBox.tsx)): tapping Gold or Standard box asks "Unlock a … box?", then shows a 3D box ("Tap the box to open"), which shakes and opens into a reveal of the tokens or puzzle piece it gave, with "Open another". `onOpenBox` now returns a `BoxReward` (tokens or piece). On live data only Faci can unlock (Freshies see the box and a note); in the sample, Freshies can unlock too for the demo. The key banner now opens its space smoothly instead of jumping in. Sample rule: a gold box gives a missing piece 1 time in 3 on Day 2. Left: confirm with the game team whether real boxes can give pieces (today `fn_scan_blind_box` gives tokens only).
- Left: decide when `mapUnlocked` turns on (for example the final 30 minutes) and read it from the game; read live data from bonding-session (`fn_my_inventory_group`, `fn_my_puzzle_inventory`, `fn_group_blind_boxes`, `fn_lighting_zones`) and keep `?demo` for previews; NFC part-card scanning; a Guardian spot photo that Admin can upload; `/map?focus=` on the map (Zichien).

### Ben, 2026-10-06
- Merged the latest `main` into `David/welcome-login-dashboard` so it can go to `main` by PR. Welcome stop: main's slogan (title case), short intro line, and organiser and sponsor logos; David's glows, sparks and animated Scroll line, plus a few small white stars. Buttons are "Join the Game ★" (opens the login chooser) and "How to check in"; "What's inside" is gone. The Scroll hint hides whenever it would touch the logo row (measured, not a fixed screen height).
- Kept David's section order (Schedule before Games), the two login buttons in the top bar, and the Check-in stop. Removed the Join stop, the scan preview (`ScanPreview.tsx`) and the unused `FreshieDashboard.tsx`.
- Welcome page Schedule now reads `schedule_items`, the same entries Admin edits, and updates live. Migration `0045` lets visitors who are not logged in read the schedule (read only). **Run `0045` in Supabase**; until then the Welcome page shows "Schedule coming soon".
- Middleware no longer runs on `manifest.json`, `robots.txt` and `sitemap.xml`, so the Welcome page no longer errors when Supabase env is missing.

### Jiamin, 2026-10-06
- FAQ by role. Migration `0044` adds `faq_items.roles` (empty means everyone), limits what each role can read, and adds starter entries for Freshie, Faci, GM, Guardian, Committee and Admin. Admin → FAQ has role filter chips, a role picker in the add form, and an edit button. Run `0044` in Supabase before using it. Left: the `/faq` page still lists entries by category only; the database already hides entries from other roles.

### Ben, 2026-10-04
- Freshie Home background redesign ([FreshieSky.tsx](../src/components/freshie/FreshieSky.tsx)). It scrolls with the page instead of staying fixed: night sky, then deeper sky, then a city with a ferris wheel at the last stop. The night colours are the same for every group. The group colour shows only as light: soft lights, windows, wheel rim, lamp bars. The wheel has one cabin per group, coloured from the scoreboard rows, and the viewer's group cabin has a halo. Frontend only, no backend change.
- [groupTheme.ts](../src/components/freshie/groupTheme.ts) now works out `glowStrength`, `glowSpread` and `partner` from `groups.color`. Bright colours (yellow, cyan, green) get a smaller, fainter light and dark colours a wider one, so every group looks about as bright. The partner is a Vortexa colour about a third of the colour wheel away. These are exposed as `--fh-glow-strength`, `--fh-glow-spread` and `--fh-partner`.
- Left: Freshie Schedule (`/schedule`) still uses the old fixed background.
- Public homepage background redesign: one continuous background behind all seven stops ([NightSkyline.tsx](../src/components/home/NightSkyline.tsx)). Near-black night with sparse stars at the top, slowly turning indigo, ending in a city skyline with a slow ferris wheel, a coaster ribbon and neon lamp bars at the Join stop. Per-section glows, sparkles and dot grids were removed from the section files.
- Ticket notches (`.vx-ticket`) are now real cut-outs (CSS mask), so the background colour shows through them.
- Left: the Join and Freshie login pages (`/join`, `/login/freshie`) still use the old per-page glows.

### XMUM, 2026-10-04
- Welcome page on this branch: snap, scroll-line cue, and copy polish. The last public stop is Check-in ("How to check in"), so the skyline city sits behind Check-in.
- Freshie Home opens with one line: "Welcome to Vortexa" and the group name in that group's colour. Facilitators still see the Vortexa lockup and the "you're in" line.

### Jiamin, 2026-10-04
- Admin redesign step A: Admin nav is now 4 sections (Live, Freshies, Game, Settings) with sub-tabs; Freshie control moved to `/admin/freshies` (old `/freshie-control` redirects); admin sidebar can collapse to icons. UI only. Step B done: Users (role chips, group filter, table, CSV import in a pop-up), Audit (action and role chips, table), Control room (phase rows, switches). Step C done: Stations (table, add in pop-up), Blind box (two tabs, table), NFC, Puzzles, FAQ (grouped, add in pop-up), Brand, Tokens (full width, layout only). Admin redesign complete.
- Removed Interview Booking (`/booking`) and Practice Reservations (`/reservations`) for every role: pages, nav, dashboard cards. Migration `0039` drops any leftover booking tables, functions and types.
- Facilitators set a group name and slogan on the home checklist. "Group 1" stays the number. HOF still cannot see the list.

Example:

```
### David, 2026-10-10
- Moved Day 1 and Day 2 GM pages from bonding-session. Pushed to main.
- Blind box not done yet.
```

(No entries yet.)
