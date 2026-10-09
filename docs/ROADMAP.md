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

### Zichien, 2026-10-08
- The campus map is the original Figma export again (`public/campus-map.png`, 3203×1776), including the brown field. The edited cut was removed.
- Building and projector positions match that image.

### Map zoom and bigger check-in zones, 2026-10-07
- The map stayed still until you tapped it, then zoomed to 2× at that spot. That tap now opens the full-screen viewer instead (see the 2026-10-09 note above). While the small map is on the page, scrolling still works. Taps on stations, group pins and buttons do not open the viewer.
- Migration `0049`: the "you seem far from this station" warning now also accepts the whole building (A1–A5 90 m, B1 140 m, Track & Field 130 m around the real GPS points) and allows for the phone's GPS accuracy (up to 100 m). It still never blocks a check-in. Run `0049` on the live database.

### Live group GPS pins on the map, 2026-10-07
- Faci's phone GPS (the opt-in toggle on the check-in page, one report a minute while the page is open) is drawn as a numbered, coloured pin on the art. Tap a pin for the group name, age and accuracy.
- `src/lib/mapGeo.ts` converts lat/lng to the picture. It uses the real GPS of A1–A5, B1 and Track & Field as anchors (affine fit plus a correction so each anchor is exact). To recalibrate, edit `GPS_POINTS` there. The courts are between B1 and Track & Field but are not on the art, so they are not an anchor.
- Pins fade after 3 minutes and leave the map after 15 minutes. The list under the map still shows the last report. Positions outside the picture are not drawn.
- Migration `0048`: `fn_latest_gps_locations()` (last hour, Committee tier sees all groups, Faci sees their own, GM and Freshie see none). `fn_report_gps` deletes that group's GPS rows older than 1 hour.
- Left: run migration `0048` on the live database and walk the campus to check the pins. (GPS now auto-reports app-wide for facilitators, see 2026-10-09 note above).

### Station capacity and automatic status, 2026-10-06
- Migration `0047`: each station has `max_groups` (required in the admin forms; existing stations stay as they are until it is set). When that many groups are checked in the station becomes In progress, otherwise Available. Closed stays manual.
- A group is at one station at a time (`station_occupancy`). Checking in elsewhere moves it. Full station: check-in is rejected (`STATION_FULL`). Faci can leave their own station (`fn_uncheckin`, "Leave station" on the check-in page). GM and admin can clear a station (`fn_clear_station`), which also resets a manual In progress.
- Status dropdown now calls `fn_set_station_status`: In progress is a manual override until the station is cleared or set back to Available.
- Check-in sends the Faci's GPS and warns (never blocks) if outside the station radius. Stations have optional `lat`, `lng`, `radius_m` (default 100 m); none are filled in yet, so no warning appears until an admin sets them.
- Map pins only show a group at a station while it is still checked in there.
- Left: run migration `0047` on the live database, then set "Groups at once" on each station. Real lat/lng for each station.

### Zichien, 2026-10-05
- Campus map now uses the Figma illustration (`public/campus-map.png`) instead of the grey blocks. Labels: A1–A5, Track & Field, B1.
- Station status (available, in progress, closed), the Day 2 projector layer, and group pins still update live.
- Migration `0045` deletes the seeded stations (A4-1, CRT-1, and the rest). On the Campus map, an admin clicks a building to add a station there. The short code is generated (A1-1, TF-1). The same panel edits the game and status, or deletes the station.
- Left: GPS pins are still a list; lake, monument, and the brown field are unlabeled.

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
