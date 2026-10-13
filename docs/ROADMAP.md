# Roadmap: Planned Work

This file lists work we have agreed on or are still discussing, but have not built yet.
Read it before starting a new round of development. When a decision changes, update the item.

> **From Ben:** when you finish your work, write down what you completed in the "Done" section at the end of this file, so the next teammate can see it. Do this for partly finished items too: say which parts are done and which are left.

Last updated: 2026-10-13

## Status key

- **Ready**: scope is agreed. Build it when there is time.
- **Later**: agreed, but not a priority yet.
- **Deferred**: parked on purpose. Listed here so it is not forgotten.

## Owners

| Owner | Area | Item |
|---|---|---|
| David | **Priority:** bring the important `bonding-session` features into the current code | [Read before merging `bonding-session`](#read-before-merging-bonding-session) |
| David | Port or delete the branches not merged into `main` | [4](#4-branches-not-merged-into-main-ready) |
| Jiamin | HOF sees every group's name and slogan | [6](#6-hof-sees-every-groups-name-and-slogan-ready) |
| Zichien | Everything on the map: Figma design, game station status, and so on | [5](#5-map-ready) |
| _To assign_ | Backend for Faci profiles (the UI is built) | [7](#7-faci-profiles-backend-ready) |

Items 3 and 7 have no owner yet.

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
   - log in as a Freshie from the welcome page ("Freshie Login" button, `/login/freshie`).

   When porting `bonding-session`, keep the Freshie role able to log in. Do not port its "Freshies have no Auth account" model, or the removal of the Freshie test accounts. Features that assume no Freshie login (for example inventory and group lookups) need to work for a logged-in Freshie, too.
2. **There is no Committee role in that branch.** It keeps four roles: `freshie`, `faci`, `gm`, `admin`. Committee, HOF and HOGM become `admin`, with an optional `admin_team` label. Guardian GM becomes `gm`. `/committee` redirects to `/admin/operations`. If it is merged:
   - rename the staff login button in [JoinChooser.tsx](../src/components/home/JoinChooser.tsx) and the staff login page (`/login`);
   - update the roles mentioned in item 5 (map);
   - rewrite [permission-matrix.md](permission-matrix.md), which describes eight roles.
3. **Overlapping files.** Both this branch and `bonding-session` change the dashboard, the app shell, the menus and the login page. Expect merge conflicts there (item 4).
4. **Item 3 may already be fixed there.** Its migration `0018` removes the `allow all` policies, revokes `anon` access, and adds role checks to the token and Freshie RPCs. `seed-test-accounts` and `/api/token` now require a permission. Re-check item 3 after merging, and do not reuse migration numbers `0015` to `0030`.

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

## 4. Branches not merged into `main` (Ready)

**Owner:** David

The design branches are merged. These remote branches are still not in `main` (checked 2026-10-13). For each, port what is still wanted, then delete the branch:
- `bonding-session` (2026-10-05): see "Read before merging `bonding-session`" above.
- `cursor/david-next-tasks-cee6` (2026-10-06)
- `feature/login-neon-redesign-from-Ben` (2026-09-16)
- `David-MapPage` (2026-08-24): occupancy colours on the map (item 5).
- `preview/red-white-soft` (2026-07-29)
- `interview-booking` (2026-07-01)

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

## 6. HOF sees every group's name and slogan (Ready)

**Owner:** Jiamin

**Done already:** `groups.display_name` and `slogan` (migration `0038`); a Faci sets them for their own group through `fn_set_group_profile` (Faci Home → Checklist → Group Name and Slogan); Admin sees them in Admin → Freshies.

**To do:** show every group's name and slogan to HOF. Admin → Freshies is Admin only, and the Committee page (`/committee`, used by HOF, HOGM and Committee) does not show them yet.
- Note: in `bonding-session`, HOF is an `admin` account with `admin_team` set. Check which role model is in use when you build this.

---

## 7. Faci profiles backend (Ready)

**Owner:** to assign. The UI is built and in `main` (Ben); this item is the backend only.

**Goal:** a Faci edits their own profile (photo, name, Instagram, programme, languages, intro). Their partner Faci and the Freshies in their group see it.

**Current state (frontend, already built):**
- Faci Home "You & Your Partner" lists the group's real Facis by reading `profiles` directly (allowed by the "faci reads own group members" policy), live on `profiles` changes for that group.
- Freshie Home "Your Facilitator" calls `fn_group_facis()`. It does not exist yet, so the page falls back to sample profiles marked "Sample".
- Edit Profile sheet ([ProfileEditor.tsx](../src/components/freshie/ProfileEditor.tsx)): **name already saves** (`profiles.full_name`). Photo, Instagram, programme, languages and intro show as "Soon" (disabled).
- Instagram chip: grey and inactive with no handle; with a real handle it links to instagram.com.
- **No WhatsApp or phone number anywhere** (decision 2026-10-13). Do not add one.

**Decisions taken:**
- Profile details live in a **new table**, not new columns on `profiles`. `profiles` is tightly locked (only `full_name` and `phone` are user-updatable, Committee reads all rows), and this keeps profile data separate.
- Freshies never read the table directly. They go through `fn_group_facis()`, so the backend decides which fields they get.
- Photos are not reviewed before they show. Admin can clear a bad photo or intro afterwards.

**To do (one migration, `0069_faci_profiles.sql`; tell Jiamin the number first so it does not collide):**
1. Table `faci_profiles`: `user_id` (PK, references `profiles.id`, cascade delete), `instagram` text (handle without @; letters, digits, `.` and `_`, at most 30), `programme` text (≤ 80), `languages` text[] (≤ 6 items), `intro` text (≤ 160), `avatar_path` text, `updated_at`. Put the format and length rules in `check` constraints.
2. RLS on `faci_profiles`, select only: the row's owner; a Faci whose `my_group_id()` equals the owner's group; Committee and Admin. No insert, update or delete policies (writes go through the RPC).
3. `fn_set_my_faci_profile(p_instagram, p_programme, p_languages, p_intro, p_avatar_path)`: security definer; caller must be `faci`; upserts the caller's own row only; validates again; `audit('faci_profile.set', ...)`.
4. `fn_group_facis()`: security definer, no arguments. Returns `id uuid, full_name text, instagram text, programme text, languages text[], intro text, avatar_url text` for every `profiles.role = 'faci'` in the caller's group (`my_group_id()`), ordered by `full_name`. Callable by freshie and faci; no rows for a caller with no group. The frontend already calls it and maps `id`, `full_name`, `instagram`; the other columns are picked up when the frontend step below is done.
5. `fn_admin_clear_faci_profile(p_user_id, p_fields text[])`: Admin only; clears `avatar_path` and/or `intro`; audited.
6. Storage bucket `faci-avatars`, public read (same pattern as the puzzle images bucket in [0005_v2_mechanics.sql](../supabase/migrations/0005_v2_mechanics.sql)). Insert, update and delete only by a Faci into their own folder: `(storage.foldername(name))[1] = auth.uid()::text`. Bucket limits: 1 MB, `image/webp`, `image/jpeg`, `image/png`.
7. Add `faci_profiles` to the `supabase_realtime` publication so a partner's edits show live on Faci Home.
8. `revoke all ... from public; grant execute ... to authenticated` on each new function.

**Frontend step after the migration (small):**
- [faciProfiles.ts](../src/components/freshie/faciProfiles.ts) `faciFromProfile()`: map `programme`, `languages`, `intro`, `avatar_url`.
- `useGroupFacis()` in [FreshieHome.tsx](../src/components/freshie/FreshieHome.tsx): switch to `fn_group_facis()` and also listen to `faci_profiles` changes.
- `ProfileEditor.tsx`: enable the "Soon" fields and the photo button; save through `fn_set_my_faci_profile`; resize the photo on the phone (square, 512 px, webp) before uploading to `faci-avatars/<user id>/`.
- `next.config`: allow the Supabase storage host for `next/image`.
- Remove the sample fallback in `useFreshieFacis()` once `fn_group_facis()` is live.

**Test before running it on the live project** (on a test Supabase project): a Faci cannot change another Faci's row; a Freshie cannot select from `faci_profiles`; another group's members get nothing from `fn_group_facis()`; a Faci can upload only into their own avatar folder; Admin can clear a profile.

**Release order:** run `0069` in Supabase first, then deploy the frontend. The other order calls functions that do not exist yet. Then add the new table and functions to [permission-matrix.md](permission-matrix.md).

---

## Done

### Manual Location Update + "Headcount and location", 2026-10-14 (changesv4.md)
Migrations `0073_faci_location_updates.sql`, `0074_faci_location_details.sql`, `0075_faci_location_per_group.sql`, `0076_faci_location_options.sql` (run in that order, after `0071` and `0072`).
- **The location belongs to the GROUP.** Any Facilitator in Group 1 can send Group 1's location; the group shares one latest update (like the headcount). Each entry records which Facilitator sent it. A Facilitator with no group cannot send one.
- **Facilitator page:** a fourth Checklist row, "Manual Location Update" (the lead says "Four things"). Status (Heading to / Arrived / Other; Other shows a text box, up to 60 characters), Building (the options Admin manages) and an optional "Details" comment (up to 200 characters; an update can be sent with it empty). The row shows the group's last update, whoever sent it, including "(edited by Admin)". Text only: no GPS, not the map, not station check-in (row 03 "Update Location" is unchanged).
- **Admin page "Headcount and location"** (menu and title; the URL is still `/admin/freshies/headcount`) is now TWO separate tables, each with Group 1 to 10: **Headcount** (Local / International / Total, always open) and **Location** (status and building on one line, Details under them, and who sent it and when). From md up they are tables (about 560px each); on a phone each group is a compact card with 44px touch targets and no sideways scroll. Updates live. Admin corrects a group's latest update with the dropdowns / Details box and taps Save (marked "edited", audited with before and after); earlier updates are under "History". Admin does not add updates for a group; only Facilitators do. The headcount table on the Groups page is unchanged.
- **Admin manages the location options** (`0076`): a "Locations" card under the Location table to add, rename, reorder (up/down) and delete the options (A1, A3, ...). Seeded with A1-A5, B1, Track & Field. Rename also renames earlier updates; deleting one that updates already used hides it (it leaves the dropdowns, those updates keep the text), deleting an unused one removes it. Everyone signed in reads the options; only Admin changes them (`fn_admin_location_option_save` / `_delete` / `_move`). The Facilitator dropdown and the Admin dropdowns follow them live.
- **Database:** table `faci_location_updates` (user_id = sender, group_id = the group; no coordinates; status checked; Other needs text; the building is checked against the live options). Nobody writes directly: `fn_faci_log_location` (a Faci, for their group) and `fn_admin_edit_faci_location` (Admin, the group's latest entry). A Faci reads their group's entries; HOF / HOGM / Committee / Admin read all. `0075` moved entries made before it onto their Facilitator's group and removed entries from a Facilitator with no group.
- **Tests:** `tests/faci-location/db.test.ts` (real Postgres + the real migrations, including the 0074 to 0075 data move): any Faci in a group updates the group's latest, another group is untouched, a Faci with no group is refused, Other text rules, optional details, read access by role, no direct writes, Admin edits (mark, audit, only a group's latest entry, validation, role checks), and the options (create, duplicate / invalid names, delete vs hide, rename carries the history, archived building kept on an edit, move, role checks). 32 tests; the test cleanup tolerates Windows keeping the temp folder locked.
- **Checked on your Supabase project** (localhost; test entries removed): the Facilitator sent an update with a comment; Admin changed it and it was saved and marked "edited"; the page checked at 375px with no sideways scroll. Not checked live: the Locations card (needs `0076` run on Supabase).

### Station status is manual only (changesv3.md), 2026-10-14
Migration `0072_station_status_manual.sql` (run `0071`, the Game Master list fix, first if you have not; this branch has `0070`, `0071`, `0072`).
- **Timer decoupled:** the trigger from `0049` that opened a day's stations when its game started and closed them all when it ended or expired is dropped. Start / End / Pause / Resume / the countdown (`fn_phase_control`, `fn_game_toggle`, `fn_game_expire`) now only run the timer. The Start/End confirmation says "Station statuses are not changed."
- **Check-ins no longer change the status:** `fn_refresh_station` (the "full = In Progress, else Available" recompute from `0062`) is a no-op. A full station still refuses check-ins (`STATION_FULL`) and a Closed station still refuses them (`STATION_CLOSED`). Stations start Closed, so an Admin or Game Master has to open them. `stations.status_override` is unused now.
- **Admin Stations:** the status badge is a dropdown (Available / In Progress / Closed) that calls `fn_set_station_status`, with live updates (a Game Master's change shows without a refresh). The "n/m stations open" list on Live control stays.
- **Game Master page:** the Status tab has Available / In Progress / Closed ("Busy" renamed), the current one highlighted, and updates live when Admin changes it. A GM can set only their own station (the one `profiles.station_id` points to, which follows the day: Day 1 station, then the Day 2 station). HOF / HOGM / Admin can set any.
- Existing statuses in the database are left as they are.
- **Tests:** `tests/stations/db.test.ts` (real Postgres + the real `0062`, `0064`, `0072`): the old coupling is reproduced first, then after `0072` starting / pausing / ending / resetting games never changes a status; Admin, HOF, GM, Guardian GM and Faci / Freshie permissions; a Closed station refuses check-in; check-in, check-out, clear and a full station never change the status. 13 tests; `npm test` is 49 in total.
- **Checked in the browser** (temporary test station, removed afterwards): GM page shows the three states and highlights the current one; Admin changes it and the GM page updates without a refresh; the GM taps In Progress and the database changes; the Admin Stations dropdown updates live when the GM side changes it, and changing it there is stored. Not checked live: the timer actually leaving statuses alone (needs `0072` run on Supabase and a real game start/end; covered by the database tests).

### Blind boxes: one QR per seller, BUY then open from Items, 2026-10-13
Branch `jiamin-blind-box-integration`. Migration `0070_blindbox_buy_flow.sql` (this branch skips `0059`-`0069` on purpose: they live on `main`; run `0054`-`0058` first).
- **One public QR per seller** (account or station): `/blindbox?t=<token>`, token kind `bb3` = HMAC of (seller id, qr_version), stable and recomputed on demand. Works until the seller's boxes are all sold; Admin Regenerate kills it. If the seller has several box types the buyer picks one on the page. The old per-type links (`bb2`) stop working. New table `blind_box_sellers`; `blind_box_assignments.seller_id`.
- **`/blindbox` is public** (middleware). Signed-in Freshie group: straight to the buy screen. Logged out: the seller's name, then group + 4-digit password inline, then the same URL shows the buy screen (no staff-login redirect, nothing to scan twice). Signed in as staff/Faci: "Log in as a Freshie" button.
- **BUY** (`fn_bb_buy`): shows which group is buying, balance, each box type with price and stock. Charges the price, takes one box from stock, saves the prize range hidden (`blind_box_claim_ranges`, no policy) and records an owned box in `blind_box_claims` (`status` owned/opened). One box per seller per group and the group cap now count bought boxes. Group row then assignment row are locked, so simultaneous buys never oversell; a retry with the same key charges once. Blocked by the blind-box kill-switch and frozen tokens.
- **OPEN** (`fn_bb_open`, from the Items page): rolls the prize from the saved range, adds the tokens. Always allowed for a bought box (also when boxes are off or tokens frozen). Opening twice returns the same prize.
- **Items page**: the blind box shelf is live (grouped by box type, realtime, prize hidden until opened) on top of main's live Items data (`useItemsData`); the buy and open token changes show in Activity through the token log. `?demo=` keeps the sample. Only a Freshie group login opens boxes; a Faci sees them.
- **In-app scanner** (`/scan`) is now general: links to this site open in the app (also recognises `NEXT_PUBLIC_SITE_URL`), `/join` and login links are refused, links to other sites show the address with an "Open link" button, plain text shows with Copy (`src/lib/scan-route.ts`).
- **Admin / seller card**: "Opened" columns now say "Sold"; reset clears bought boxes and refunds only what was paid for unopened ones; the "My blind box QR" card is one card per seller.
- **Tests** (`npm test`): `tests/blindbox/db.test.ts` runs the real `0054` + `0070` in a real Postgres (embedded-postgres) with a small Supabase stub: BUY/OPEN rules, limits, idempotency, kill-switches, regenerate, reset, and real concurrency (12 groups on a 3-box seller: exactly 3 succeed; 8 simultaneous taps by one group buy once; 10 simultaneous opens pay once). `tests/scan-route.test.ts` covers the scanner routing and the token. 36 tests pass; `tsc` and `next lint` are clean.
- Checked live on the project after `0070` was run (localhost, rehearsal data, since restored): a logged-out scan of the seller link, group login on the page and BUY; re-scan while logged in ("Already bought"); the box on the Items shelf and opening it (+tokens, balance updated); the in-app route (client-side navigation to the link as Group 3 went straight to the buy screen and BUY worked); 6 groups buying one last box at once (exactly 1 succeeded, the rest "sold out"). Not done: the phone camera scan itself (camera scanning needs HTTPS or a phone), the Admin pages after the wording change, and the two-phones-at-once check on real devices. Merged with `main` (live Items data, Faci profiles `0069`); `tsc`, `next lint` and the tests pass after the merge, but the merged result was not re-run in the browser.

### Items page on live data: tokens and puzzle pieces, 2026-10-13
- `/inventory` (Freshie and Faci) now shows the group's real data through `useItemsData()` ([useItemsData.ts](../src/components/freshie/items/useItemsData.ts)): tokens (`groups.token_balance`, same as Admin), puzzle pieces per key and piece number (`inventory` + `items`, written by a Day 2 station win), projectors lit and by whom (`projectors` + `fn_scoreboard`), phase and time left (Live control's `phases`), Day 2 entry costs (`stations`), and history (the group's `token_transactions`, pieces and lit projector). Live updates on all of them. Each group reads only its own rows (RLS); Admin, HOF, HOGM and Committee read all.
- Freshie Home's Puzzle Pieces card reads the same hook, so Home and Items always match. The "Sample" labels are gone.
- The map unlocks (real location names instead of Star / Wheel / Orbit) in the endgame.
- **Replay demo is always on the live Items page**: it shows the sample for about 7 seconds (marked "Sample data"), the T&F key going from 4 to 5 pieces, then returns to the group's live data. The other samples stay at `?demo=day1|day2|ready|taken|won|complete`.
- Admin → Tokens now counts puzzle pieces from `inventory` (it read `puzzle_inventory`, which the game never writes, so it always showed 0). Mapped B1 = 1, A3 = 2, TF = 3.
- Blind boxes on Items are live now (see "Blind boxes: one QR per seller"); Guardian spot text is still the sample. Left for the backend / token owner: Admin → Tokens' history reads the old `token_logs`, so it does not show GM rewards from `token_transactions`; Admin's Reset State clears `puzzle_inventory`, not the real pieces in `inventory`. A GM on `/token` cannot read `inventory` (RLS), so their scoreboard shows no pieces.

### Top text nav instead of the sidebar on landscape tablets and desktops, 2026-10-13
- At 1024px and wider (iPad landscape, desktop), every role gets `TopNav` ([TopNav.tsx](../src/components/TopNav.tsx), [topnav.css](../src/components/topnav.css)) instead of the left sidebar, in the public Welcome page's nav style: logo, the role's links as text (current page underlined in the group colour, else cyan), the live phase pill ("NOW Day 2 Game 1:13:58"), the role chip and an account menu (Log Out; Facis also get Edit Profile, which opens the editor on Home, via `/dashboard?edit=profile` from other pages).
- Option A from the mockup: on Freshie / Faci Home the page's own header and stop bar are hidden at this width; each stop fills the screen below the nav, and the live phase card in Welcome is hidden (the nav pill shows it). Staff Home hides its own header and phase card too. Phones and iPad portrait are unchanged.
- Removed: the sidebar and Admin's collapse-to-icons toggle, and the `16rem` offsets (sky, toasts, location banner).

### iPad Chrome: no blank band under the tab bar, 2026-10-13
- iPad Chrome reports `env(safe-area-inset-bottom)` as about 80px while its toolbar is open (its open/closed height difference), so the tab bar left a blank band under it after a Freshie login. The bottom inset is capped at 34px (the most a real device needs) on `.fh-tabbar` and in `--fh-bottom`. Checked on iPad Chrome.
- Diagnostics: add `?vp=1` to any URL to see the heights the browser reports (innerHeight, visualViewport, 100vh/dvh/svh/lvh, fixed bottom, safe-area bottom) and two markers for the bottom ([ViewportDebug.tsx](../src/components/ViewportDebug.tsx)). Invisible without the parameter.
- Left: other `env(safe-area-inset-bottom)` uses (staff page padding, bottom sheets, map controls, Scan screen, the public Welcome tab bar) are not capped yet; on iPad Chrome they leave about 60px extra space. Plan: one `--safe-bottom` variable in `globals.css` used everywhere.

### Tab bar stays put on iPad and iPhone, 2026-10-13
- On iPad Safari the bottom tab bar (and the Freshie Home header) could sit mid-screen while scrolling, and fixed things (tab bar, "Replay demo", the logo intro) could stop short of the screen bottom: Safari's area for `position: fixed` can be shorter than the screen.
- On pages with the tab bar (Freshie and Faci), AppShell's content column is one screen high: header, then the scroller (`.app-scroll`), then the tab bar **in normal flow, not fixed**. The document never scrolls, so Safari's toolbars stay put; snap sits on `.app-scroll`. `main` no longer has `min-h-dvh` there, so short pages do not scroll.
- The logo intro covers at least `100lvh` and cannot be dragged.
- Side effect: no pull-to-refresh on those pages on iOS. GM, Committee and Admin pages are unchanged.
- Checked on iPad (Safari and Chrome).

### Vortexa logo intro on opening the site and after login, 2026-10-13
- `VortexaIntro` ([VortexaIntro.tsx](../src/components/VortexaIntro.tsx), [vortexa-intro.css](../src/components/vortexa-intro.css)), mounted once in the root layout: a dark cover, the Vortexa logo sharpens in, a light band sweeps across it, then the cover fades out (about 2.7 s). Same idea as the interview site's `HomeIntro`.
- Plays on every full page load: opening the site on any page, a refresh, and after every login (password, Freshie, QR join and Google all end in a full load). Not on in-app navigation. Off with reduced motion.
- No "Click to skip" text; a tap still ends it early. Also plays on `/bigscreen` when that page is opened or refreshed.

### Faci Home on the Vortexa scroll design, 2026-10-13
- Facilitators now get the same scroll home as Freshies (`/dashboard` → `FreshieHome`); GM, Committee and Admin keep `StaffDashboard`. Its Faci workspace is no longer reached.
- Faci stops: Welcome (Hi <name> · you're in <group>, Group Code, My Group → Checklist), Checklist, You & Your Partner, Your Progress, Scores, How It Works.
- "You & Your Partner" uses the Freshie Facilitator cards and lists the group's **real** Facis: `profiles` with `role = 'faci'` and the same `group_id`, as Admin assigns them in Freshie Control (`fn_admin_set_group_facis`). Read under the existing "faci reads own group members" policy, live on `profiles` changes; no migration. The Faci's own card comes first, marked YOU, with an edit pencil when open. Only names are stored, so open cards say "No profile details yet". With no partner, a line says Admin assigns Facilitators in Freshie Control.
- **Edit Profile** (Faci): from the header avatar menu or the pencil on their own card, a bottom sheet (`ProfileEditor.tsx`). **Name saves for real** (`profiles.full_name`; users may already update their own name under RLS) and shows at once in the header, Welcome and their card; partners see it live. Photo, Instagram, programme, languages and intro show but are disabled ("Soon") until the profile backend exists.
- The header avatar is the same `FaciAvatar` as the Faci's card (photo, else initials on the group colour), so a future photo shows in both.
- Freshie "Your Facilitator" calls `fn_group_facis()`. **Backend to do (not built yet):** a security-definer RPC, no arguments, returning `id uuid, full_name text, instagram text` for every `profiles.role = 'faci'` in the caller's group (`my_group_id()`), ordered by name; callable by freshie and faci; `instagram` may be null until profile fields exist. Until it exists the call fails with "function not found" (PGRST202) and the page falls back to the sample profiles, marked Sample; once it ships, Freshies see real Facis with no frontend change. No realtime for Freshies; the list reloads when the page comes back into view. Also left: profile fields (photo, Instagram, programme, languages, intro) and the editor.
- **No WhatsApp anywhere** (decision 2026-10-13): Faci cards show Instagram only. The Instagram chip always shows; with no handle yet it is grey and inactive. Real handles link to instagram.com; Freshies' sample handles do not link.
- Checklist rows are Title Case (Group Name and Slogan, Take Attendance, Update Location), with more space in the forms. "Update Location" opens station check-in (`/checkin`), not the map.
- Take Attendance counts Local and International with − / + steppers (or typed); Total is their sum and is shown, not typed. Saves all three through `fn_set_headcount`, the same row Admin > Headcount and `/attendance` use. A blank side saves as 0. The row's subtitle shows "24 people · 18 Local · 6 International".

### Freshie Home back to the Vortexa scroll design, 2026-10-13
- New "Your Facilitator" stop (Freshie only) between Welcome and Your Progress: collapsible cards (photo or initials, name, Instagram; tap to open programme, intro and languages, one at a time, animated). "My Group" on Welcome scrolls here. Sample data from `faciProfiles.ts` until `fn_group_facis()` exists (item 7). Left: profile fields for Faci (photo, Instagram, programme, languages, intro), a page for Faci to edit them, and `faciProfilesFor()` reading the group's real Facis. Real Instagram handles then link out, and photo hosts need adding to `next.config` images.
- Freshies get the full-screen stops again, in this order: Welcome, Your Facilitator, Your Progress, Scores, How It Works. Scroll snapping and the stop bar are back. The group dashboard trial (`GroupDashboard.tsx`, `.gd-*` and `.fh-operational` styles) is removed.
- Welcome uses the facilitator lockup (WELCOME TO Vortexa) with "Welcome <group> Freshie!" (the Faci-set name if there is one), a FRESHIE chip, "Scan a QR" and "My group".
- "Your pass" (the ticket card) is replaced by "Your progress": a Tokens card (live balance, opens Token history), a Puzzle pieces card, and an FAQ row. The puzzle card reuses the Items page's key strip (`ProjectorKeys`) and, since the Items live data work, its live data (`useItemsData()`), so it always matches what Items shows.
- The Today stop (placeholder rundown) is removed from the home. The programme is only on the Schedule page.
- No migration. (Faci Home moved to this design later; see "Faci Home on the Vortexa scroll design".)

### Admin Live control, Headcount and Game Master assignment, 2026-10-12
- **Live schedule section removed** from Live control (`LiveSchedule.tsx` deleted; `scheduleTimer` moved to `src/lib/scheduleTimer.ts`). The "Now on the Welcome page" box and all schedule data stay.
- **Headcount is one number per group, always open** (no sessions, no open/close). New table `group_headcounts`, RPCs `fn_set_headcount` / `fn_clear_headcount` (audit-logged). Used by Admin → Headcount, `/attendance`, `/committee` and the Freshie Home checklist. Old `attendance_headcounts` / `attendance_sessions` are untouched; the latest value per group was copied over.
- **Live control Day filter** is All / Day 1 / Day 2 and drives the game toggles; Admin → Stations opens on the same choice.
- **Game Masters are assigned on Admin → Stations** (multi-GM per station, one station per GM per day) through `gm_station_assignments`. Removed the Station column from Admin → Users. `profiles.station_id` is kept in sync as the GM's current station so the GM game functions keep working.
- Migration `0065`. **Run `0065` in Supabase.** Left: GM RPCs still read `profiles.station_id`; moving them to `gm_station_assignments` directly would remove the sync trigger. `fn_schedule_session` and the old session tables are now unused.

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
