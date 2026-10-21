# Roadmap: Planned Work

This file lists work we have agreed on or are still discussing, but have not built yet.
Read it before starting a new round of development. When a decision changes, update the item.

> **From Ben:** when you finish your work, write down what you completed in the "Done" section at the end of this file, so the next teammate can see it. Do this for partly finished items too: say which parts are done and which are left.

Last updated: 2026-10-22

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

**D2. HOF can call game functions it has no use for.** HOF runs the Facilitators, not the game, and has no UI for these, but the backend still allows them (decided 2026-10-14: remove HOF from them):
- `fn_adjust_tokens`, `fn_grant_item`, `fn_gm_day1_reward`, `fn_day2_challenge`, `fn_undo_last_transaction` (tokens and items),
- `fn_redeem_puzzle_set` (Guardian's job), `fn_clear_station`, `fn_set_station_status` (stations are HOGM's).

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
- Group locations on the map: Freshie, Faci and Committee and above see all groups (0089; before it, Faci and Freshie see only their own).
- Anything else on the map page.

**Figma:** [XMUM campus map](https://www.figma.com/design/3dcEv45KenmKcoTcbaZmQ0/Untitled?node-id=24-2) (frame `XMUM Block Cube_XMUM Map 1`).

**Current state:**
- Pages: `/map` ([map/page.tsx](../src/app/(app)/map/page.tsx)), `/checkin` and `/committee`, all through [CampusMap.tsx](../src/components/CampusMap.tsx) and `campus-map/CampusMapView.tsx`.
- The map is **3D** (`src/components/map3d/`, `CampusScene`): A1–A5 and B1 at true scale from OpenStreetMap, the track and courts, the lake and its park, the statue, the Vortexa Funfair on the dorm land, and the LakeFront Café as the lake stage.
- The **2D art** (`CampusMap2DView`, `public/campus-map.png`) is only the fallback: devices without WebGL2, devices too slow for 3D, or `?map=2d`.
- Where things stand and how to work on the 3D map: [map3d-session-handoff.md](map3d-session-handoff.md).
- Labels: A1–A5, B1, Track & Field, the Tan Kah Kee Statue, the LakeFront Café and the Vortexa Funfair (game zone). The courts are labelled when the camera is close, and so are the rides (with their dorm name, such as "LY3 · Vortexa Eye").
- Station dots and badges show available / in progress / closed, and update from the `stations` table without a refresh. Group pins follow the permission rules below.
- `David-MapPage` colours dots by occupancy (`fn_public_station_occupancy`). That function is not on this branch, so it was not copied. The branch still uses the old rectangle map, not this Figma art.
- Who can see what on the map: see the "Campus Map" and "Group locations" rows in [permission-matrix.md](permission-matrix.md).

**Still open:**
- Seeded stations are removed. New ones are created in Admin → Stations and sit on A1–A5, B1, Track & Field, Tennis Court or Volleyball Court.
- GPS pins: the 3D map places them straight from GPS (true scale); the 2D fallback warps them onto the art (see Done, 2026-10-07 and 2026-10-13). Both still need a real walk-through: stand at each building and court with a phone and check the pin. Admin's Accuracy check (Map page) measures the error.
- Before the event: turn **NFC demo mode** off in Live control, and Reset any bulbs lit while testing.
- Before the event: brief Facis that a phone only shares location while the app is open on screen, and that one phone per group should use Keep tracking with a power bank.
- Admin → Stations "Other…" block: the database only accepts the listed buildings (and TBD), so saving a station with another block name fails.
- The lake stage (LakeFront Café): check it on a real phone, and check against satellite imagery that it faces west. See [map3d-lakefront-design.md](map3d-lakefront-design.md).

## 6. HOF sees every group's name and slogan (Done: Ops → Freshies shows them, read only)

**Owner:** Jiamin

**Done already:** `groups.display_name` and `slogan` (migration `0038`); a Faci sets them for their own group through `fn_set_group_profile` (Faci Home → Checklist → Group Name and Slogan); Admin sees them in Admin → Freshies.

**To do:** show every group's name and slogan to HOF. Admin → Freshies is Admin only, and the Committee page (`/committee`, used by HOF, HOGM and Committee) does not show them yet.
- Note: in `bonding-session`, HOF is an `admin` account with `admin_team` set. Check which role model is in use when you build this.

---

## 7. Faci profiles backend (Built, needs `0069` run and tested)

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

**Release order:** run `0069` in Supabase first, then deploy the frontend. The other order calls functions that do not exist yet. Then add the new table and functions to [permission-matrix.md](permission-matrix.md). (done)

---

---

## Done

### Migrations to run on Supabase for the 2026-10-22 work (Jiamin)
Numbered after main's `0093`-`0096`. Run both **before** deploying the frontend: Admin → Blind boxes calls the new `fn_bb_assign` (no station arguments) and `fn_bb_spot_save`.
- `0097_group_password_refresh.sql`: `fn_end_user_sessions` (service role only).
- `0098_blindbox_spot_no_stations.sql`: the Spot box, no station boxes, Restore only. Deletes unsold station boxes and switches sold ones off. Safe to run again.
- Env: `/api/group-join` signs group QRs with `NFC_TOKEN_SECRET` (already set for blind boxes and NFC). Changing that secret changes every group QR.

### Big screen removed, scoreboards in group order, 2026-10-22 (Jiamin)
- `/bigscreen` is deleted, with every link to it (nav, Staff Home, Ops header, staff dashboard), `Countdown`'s `override` prop and `AccountMenu`'s `links` prop. `/activate` and the `projectors` table stay.
- Every scoreboard (Admin → Token, Scores for GM / Guardian / Committee / HOF / HOGM, the Scores stops on Staff and Freshie Home) lists Group 1 → 10. No rank, medals, Leader chip or sort switch; the group badge leads each row. `fn_scoreboard` still orders by tokens in SQL; the pages sort by id.

### Group QR never changes; Admin can give a group a new password, 2026-10-22 (Jiamin)
Migration `0097`.
- The group QR is `/join?g=<HMAC of the group number>` (`/api/group-join`). The server looks up the group's current password and signs the phone in, so the QR holds no password and stays the same, even after Admin resets the groups. QRs in the old format (`?group3=1234`) work until that group's password changes.
- Admin → Freshies: "New" next to a password picks a new unused 4-digit code and signs out every phone of that group. The printed card shows GROUP N instead of the password; the Faci's `/code` page shows the current password above it.
- `/join` now signs out only this phone before signing in (it used a global sign-out, which ended every phone of the group).
- Tests: `tests/group-join-route.test.ts`.

### Blind box: Spot box, no station boxes, Admin page as steps, new buy page, 2026-10-22 (Jiamin)
Migration `0098`. Planned and agreed with Jiamin first (design rounds in the session).
- **Spot box:** one extra seller with one QR that never changes; print it and hide copies. Admin sets min / max tokens, the pool and on/off (`fn_bb_spot_save`). Free, one per group, outside the group cap. Inside it is a hidden box type (`is_spot`) with one assignment, so buying, opening and Restore work as for any box. Claims carry `spot`.
- **No station boxes:** `fn_bb_assign` takes a role or accounts only; a new station assignment is refused (in the seller trigger, not a check constraint, because the reset updates the kept rows). Sold station boxes stay, switched off, for history. `fn_admin_station_gms` stays (Admin → Stations and HOGM use it), and so does the station-delete "has sales" message, since those kept rows can still block a delete.
- **Reset:** only Restore boxes; "Reset everything" is gone. Restore also refills the Spot and keeps every QR.
- **Admin → Blind boxes:** steps 1 Box types → 2 Assign → 3 Codes & stock → 4 Spot box, with Rules & reset apart. A strip of four numbers. Assign is one form (type, who, how many). Codes & stock has one row per seller with their one QR. The Admin's own QR card is gone from the page. Live control says "Blind box buying paused" and "Blind boxes sold".
- **Buy page (`/blindbox`):** the Freshie night look in the group's colour, the Items page's 3D box, a pill with the group and tokens, the cap as dots, Buy rows, and "You found a hidden blind box" with Claim it for the Spot. Sign-in and error screens use the Welcome look.
- **My Blind Box** (Staff Home) and the GM page card: one centred column: QR, Copy link, then each box type.
- Tests: `tests/blindbox/db.test.ts` applies `0098` after the older tests and checks the station clean-up, people-only assign, Restore only, and the Spot (free, once per group, outside the cap, pool, settings without a new QR, refilled by Restore). `npm test`: 153 pass; `tsc` and `next lint` are clean.
- Checked in the browser: the buy page (normal, Spot, blocked) and the centred My Blind Box, through a temporary route (removed). Not checked in the browser: Admin → Blind boxes, the group QR sign-in and the password change (they need a sign-in and the migrations on a database).

### Migrations to run on Supabase for the 2026-10-19 work
Renumbered after main's own `0079`-`0089`. `0090` and `0091` were already run on the live project under their first names (`0079_blindbox_qr_hardening`, `0080_blindbox_review_fixes`); running them again is safe. `0092` still needs running.
- `0090_blindbox_qr_hardening.sql` (after `0070`). ⚠ Every blind box QR changes when it runs: sellers' cards and Admin show the new one, and any QR already printed or shared stops working.
- `0091_blindbox_review_fixes.sql` (after `0090`). The frontend works before or after it: if `fn_bb_buy_at` does not exist yet, the buy screen falls back to `fn_bb_buy` (without the price check).
Both files are safe to run again if a run fails part-way, and every `UPDATE` has a `WHERE` (some Supabase setups refuse one without).
- `0092_ops_reads_group_logins.sql`: HOF and Committee read the group passwords (Ops → Freshies).

### HOGM's Ops: no Game, Tokens or NFC tab, 2026-10-19
- Game control (HOGM's Ops) now has three tabs: Stations, Puzzles, Funfair; it opens on Stations. The Game tab (start / pause / end each day's game, game length), the Tokens tab (token rules, the Rehearsal reset) and the NFC tab are removed, and their only users, `GameSection.tsx`, `TokensSection.tsx` and `NfcSection.tsx`, are deleted (in git history). Admin still does these on Live control, Admin → Token and Admin → NFC.
- The server still lets HOGM do them (`is_game_lead()` on `fn_phase_control`, `fn_update_game_config_rule` and `fn_reset_tokens_and_puzzles`; `/api/admin/nfc` allows HOGM); marked § in [permission-matrix.md](permission-matrix.md). `AGENTS.md` updated.

### Demo quick login: local dev only, plus HOGM, 2026-10-19
- Demo quick login now shows only on local dev (`npm run dev`), no longer on Vercel preview deployments, and never on production or a production build (`demoLoginsEnabled()` in `src/app/(auth)/login/demo-logins.ts`).
- A **HOGM** button signs in as `hogm.test@xmu.edu.my` (already created by `seed-test-accounts`).

### Ops for HOF and Committee: tabs, group badges and passwords, 2026-10-19
Migration `0092_ops_reads_group_logins.sql` (until it runs, passwords show "—").
- **Ops (`/committee`) for HOF, Committee and Admin** has three read-only, live tabs, one row per group: **Headcount** (Local / International / Total), **Location** (the group's latest manual update, who sent it and when) and **Freshies** (name, slogan and 4-digit password). The Map tab is removed (the same `CampusMap` with group pins as the Map page), and so is Balances (the Scores tab has it). `?view=headcount|location|freshies|facis` opens a tab; the old `?view=attendance` still opens Headcount. HOGM's Ops stays Game control.
- **No blind box QR on Ops any more:** it was above every tab; it is on Home's "My Blind Box" stop (HOF, HOGM, Committee), the GM page and Admin → Blind box. `BlindBoxCard`'s `showEmpty` option went with it (Home's stop has its own "No blind boxes yet").
- **Facilitators tab (HOF and Admin):** `main`'s Faci control page (2026-10-14) is replaced by these tabs; its Facilitator editing moved into the fourth tab (`src/components/staff/faci/FaciAssign.tsx`, was `FaciControl.tsx`). One row per group with its Facilitators: Edit opens the same picker (search, picked first, "moves from Group N") saved with `fn_admin_set_group_facis`, and the clock icon shows the group's recent Faci-related changes. Its headcount, location, name, slogan and password parts are now the other tabs; the CSS only it used is removed.
- **Group badge** (`src/components/GroupBadge.tsx`): the group's number on a disc of its colour (`themeFromColor`, so the number is dark on a light colour). On every Ops tab and on the Scores page (TokenControl) next to the group name. Scores now shows the name the Facilitators set (`display_name`) when there is one. HOF's and HOGM's Scores (`GroupScores`) do not have it yet.
- **Scores on phones (TokenControl):** each row is two lines (rank, badge, name and tokens; then puzzles and the B1 / A3 / TF pieces), so the name is no longer cut to "Grou…". Wider screens keep one line.
- **Permissions (`0092`):** HOF and Committee may read `group_login_codes` (read only; creating and changing passwords stays Admin only). See [permission-matrix.md](permission-matrix.md).
- Checked: the badge colours and contrast in the browser. Not checked in the browser: the Ops tabs and Scores (they need a staff sign-in). `tsc` and `next lint` are clean.

### Blind box review fixes, 2026-10-19
Migration `0091_blindbox_review_fixes.sql`, plus frontend fixes. The rest of the 2026-10-19 review (after "Blind box QR hardening").
- **Database (`0091`):**
  - "Reset everything" also gives every seller a new random QR version, so rehearsal QRs stay dead.
  - "Put tokens back" only undoes what is still in the balances: a box bought before the last Token page reset (`tokens.reset` in the audit log) refunds nothing, and only its prize if it was opened after that reset. Before, a token reset followed by a blind box reset left groups with tokens. Both token resets write `tokens.reset`: main's `fn_reset_tokens_and_puzzles` (`0056`) and `bonding-session`'s `fn_reset_token_state` (its `0024` / `0027`, which the live database may run), so this works with either.
  - Changing a seller account to a role that cannot hold boxes (Faci, Freshie) turns their own boxes off (trigger on `profiles`), so a copy of their QR stops selling; changing the role back turns the same boxes on again (`blind_box_assignments.off_by_role`). If Admin switches an assignment on or off by hand, that choice wins over a later role change. Accounts already in that state are turned off when the migration runs. Station boxes are not affected.
  - New `fn_bb_buy_at(..., p_expected_price)`: BUY at the price the Freshie was shown. If Admin changed it meanwhile, nothing is charged (`BB_PRICE_CHANGED`). `fn_bb_buy` is unchanged.
- **Freshie:** the buy screen uses `fn_bb_buy_at` and reloads after any failed BUY, so balance, stock and price are current. A Freshie account with no group gets "Log in as your group" on `/blindbox` instead of a dead end. "Log in as a Freshie" signs out this device only (`scope: "local"`), not the account's other devices. Opening a box on the Items page reads the sealed boxes fresh and skips one another phone just opened, so one box is never revealed twice.
- **Sellers:** the card ignores an older reload that answers after a newer one (so a dead QR never comes back), follows price and name edits live, says when buying is paused (blind boxes off or tokens frozen) instead of showing a QR that cannot sell. (Its "no boxes yet" message for Ops was dropped when the QR moved to Home's "My Blind Box" stop, which has its own.) The GM page re-reads the GM's station when it opens, when a day starts or ends, and when the phone comes back to the page, so scoring and status follow the day's station.
- **Admin:** an empty quantity field no longer counts as 0, and setting 0 asks first. A removed assignment shows "That assignment no longer exists" instead of the Freshie message. Box type wording is corrected (range and price apply to boxes bought from now on; archiving keeps the seller's QR working for their other types). Assign counts each station's GMs over both days (`fn_admin_station_gms`).
- **Scanner:** in a build without `NEXT_PUBLIC_SITE_URL`, `http://localhost:3000` links are no longer treated as this site.
- **Tests:** `tests/blindbox/db.test.ts` loads `0091` and covers the price check (wrong price charges nothing, a retry still returns the purchase), the role change both ways (and Admin's by-hand choice winning), the refund after a token reset, Reset everything changing every QR version, and what a GM (own and current station only, following a station change) and a Freshie (nothing) can read. New `tests/blindbox/links-route.test.ts` covers `/api/blindbox/links`: refused for Freshie, Faci and signed-out callers, allowed for every seller role, bad ids rejected, one https link per seller whose token verifies. The test stub's `audit_log` gained `created_at`, as in the real schema, and `vitest.config.ts` resolves `@/`. A final review of all the 2026-10-19 blind box changes found nothing further. `npm test`: 115 pass; `tsc` and `next lint` are clean.

### Blind box QR hardening, 2026-10-19
Migration `0090_blindbox_qr_hardening.sql`. Fixes the five worst issues from the blind box review; the rest are in "Blind box review fixes" below.
- **No buying without scanning.** `fn_bb_buy` / `fn_bb_seller_preview` / `fn_bb_seller_public` take (seller id, qr_version) from the QR, and only the Next page checks the signature. Versions were 1, 2, 3, so a Freshie could call `fn_bb_buy` from the browser for every seller without visiting them. `qr_version` is now a random 31-bit number (`bb_new_qr_version()`, from `gen_random_uuid()`), and Regenerate picks a new random one. Function signatures are unchanged.
- **Scanner stays on this site.** `classifyScan` collapses leading slashes, so `https://<site>//evil.com/x` opens `/evil.com/x` on this site instead of `evil.com`. It also fixes codes minted from a site URL that ended in `/`.
- **Regenerate shows at once.** `blind_box_sellers` joins the realtime publication (RLS still limits it to Admin and the seller), and the seller card and Admin page listen to it. Before, the old QR stayed on the GM's phone until a reload.
- **Sold boxes keep their assignment.** A `before delete` trigger refuses to delete an assignment with sold boxes (`BB_HAS_SALES`), including through deleting its station or seller account. Before, the cascade turned sold boxes back into unassigned stock that could be handed out twice. Removing an unsold assignment and the blind box reset work as before. Admin → Stations and HOGM's station delete show a readable message.
- **Seller card follows the GM's current station.** `BlindBoxCard` no longer filters by the station from page load for non-Admins (RLS already uses the current one). It reloads when a phase changes (that is when the day's station switches), when the seller row changes, and when the phone comes back to the page.
- **Tests:** `tests/blindbox/db.test.ts` loads `0090` and checks random versions (guessed versions refused), the delete guard (direct and through deleting the seller) and the realtime publication. `tests/scan-route.test.ts` covers the double-slash cases. `npm test`: 105 pass; `tsc` and `next lint` are clean.
- Run on the live project (as `0079`, before the renumbering); a guessed seller version is refused there.

### Blind box and NFC links always start with https://, 2026-10-19
A scanned blind box QR showed as plain text, because the live `NEXT_PUBLIC_SITE_URL` is set without a scheme (`xmum-orientation.vercel.app`) and the QR held a bare host. New `src/lib/site-url.ts` (`siteUrl()` / `normalizeSiteUrl()`) adds `https://` (or `http://` for a local host) and drops a trailing `/`; blind box links, NFC sticker links and the scanner's own-site check use it. The in-app scanner also opens scheme-less links to this site, so QRs already shown keep working there. `docs/SETUP.md` gives the expected format. No regeneration needed: the token is unchanged, only the address in front of it.

### Big screen header: Vortexa logo and ticket countdown, 2026-10-19
`/bigscreen`: the event-name text is replaced by the Vortexa logo, and the clock by Home's ticket countdown (Freshie Home's `Countdown` in the Welcome colours, `.fh .fh-vx`), sized for a projector (`bigscreen.css`). While a game phase runs it counts that phase ("<PHASE> ENDS IN", red for Endgame) through a new optional `override` prop on `Countdown`; otherwise it shows the event countdown. Checked in the browser at 1600×900 and 375 wide through a temporary public route (removed). Not checked: the Endgame red, because no game was running.

### Faci profiles backend: migration written, 2026-10-13
- `0069_faci_profiles.sql`: table `faci_profiles` (check constraints), select-only RLS, `fn_set_my_faci_profile`, `fn_group_facis` (`avatar_url` is a path relative to the Supabase URL, so the frontend prefixes `NEXT_PUBLIC_SUPABASE_URL`), `fn_admin_clear_faci_profile`, bucket `faci-avatars` (1 MB, webp/jpeg/png, own-folder writes), realtime.
- Frontend done: `faciProfiles.ts` maps the new fields (`FaciRow`, avatar URL helpers); one `useGroupFacis()` in `FreshieHome.tsx` calls `fn_group_facis()` for both Faci and Freshie and reloads on `profiles` / `faci_profiles` changes; `ProfileEditor.tsx` saves Instagram, programme, languages, intro and photo (resized to a 512 px square webp on the phone, uploaded to `faci-avatars/<user id>/<timestamp>.webp` on Save, old file removed); `next.config.ts` allows the Supabase storage host for `next/image`; the sample Facis and "Sample" label are removed.
- Not done: nothing has been run against a Supabase project. Run `0069` first, then deploy, then test the checks listed in item 7. Tell Jiamin `0069` is taken. `tsc` and `next lint` pass.

### Map: the lake stage stays dark until the finale, 2026-10-19 (Ben, branch `lakefront-dark`)
No migration. The LakeFront Café no longer lights up at sunset and night on its own: the ribs, the wash, the uplights, the small lights, the light pools, the beams and the phone halos stay off until all three funfair zones are on. Then the concert's opening starts from the dark stage (follow spot, ribs one by one, bang, show). When a zone goes off the show winds down and the stage is dark again.
- `LakefrontStage.tsx` holds `dim` at 1; putting back `smooth(p / 0.18)` brings the evening light back. `kit.ts`: the small lights now go fully dark with `dim` (they kept 30%). The halos follow the concert's power.

### Map: Freshie and Faci map page in the night look, 2026-10-19 (Ben, branch `freshie-map-night`)
Migration `0089` (applied). Freshie's and Faci's `/map` dropped the white page and now matches Freshie Home and Schedule: the night background, the group's colour (`--fh-*`) and a display-font "Map" title (`freshie/FreshieMap.tsx`).
- CampusMap's markup is unchanged; `.fh-map` in `freshie.css` recolours its cards, lists, chips, the inline map buttons and the 2D Stations / Lightbulbs tabs. The full-screen map keeps its own look, as on the ops crew's map.
- AppShell treats `/map` as a night page for Freshie and Faci, so the light mobile header is hidden there.
- Admin's `/map` and Faci's `/checkin` keep the light design.
- Freshies and Facis see every group's location on the map (Ben: the group pins are public to them). Migration `0089_freshie_group_positions.sql` (applied on the project; Ben, 2026-10-19) lets `fn_group_positions()` return every group to a Freshie or Faci. This also applies to Faci's `/checkin` map.

### Map: East funfair rides on their dorms' real middles, and the midway, 2026-10-17 (Ben, branch `funfair-east-layout`)
No migration. Built on `map3d-footpaths` (the lawn round the funfair's land), so merge that first.
- **Done (E1):** each East ride stands on the real middle of its dorm, the centroid of its OSM outline (`dormCentre` in `east/layout.ts`). They were 0.5–29 m off: the arcade (D1) 24 m, the pirate ship (D3) 16 m and the coaster's loop (D5) 29 m. The coaster has a new route: the station on D4's middle, the lift hill over the walk from Central, a turn round D5's north arm, the loop over D5's middle, then back over the walk into the station. Its old north turn is free land now.
- The arcade's back wall keeps 6–7 m off B1's grey service road (Ben asked that D1 not touch the road). The zone may build south to x = -124 for the arcade and the pirate ship. West, Central and the campus are unchanged.
- **Done (E2):** the land is used better (Ben: trees filled every empty spot). Trees now grow only in a belt along the road sides, plus a few shade trees (`greenery` and `inBelt` in `east/decor.ts`). The new pieces (`east/midway.ts`, placed in `decor.ts`, positions in `layout.ts`):
  - Midway Square, on the coaster's old north turn: a striped mast with bulb strings, a high striker, and the VORTEX Diner with its terrace;
  - the games alley from the North Walk to the square, under a GAMES arch: 12 game booths (ring toss, balloon darts, duck pond, hoop shot) with bulb strings across it;
  - the west lane from the walk from Central to the square, with snack carts;
  - the bandstand lawn: a bandstand, picnic tables, benches and flower beds;
  - the circus ring: sawdust inside a red kerb, bleachers, and the wagons round it;
  - the fortune teller's tent and the hall of mirrors on a new walk from the pirate ship to the arcade;
  - a BIG TOP arch and a ticket booth where the walk from Central comes in;
  - restrooms, first aid, snack carts and flower beds along the new walks.
- Everything lights up with the zone and is baked into the zone's existing meshes, so the draw calls are unchanged. Phones get fewer tables, carts, flowers and bulbs.

### Map: lawn and walkways on the 3D map, 2026-10-17 (Ben, branch `map3d-footpaths`)
No migration.
- Inside the outer road, the 3D map's ground is now lawn (it was orange), so only the walkways are paved. They use the 2D art's colours: an orange walk with a darker outline, and walks that meet join into one (`ground.tsx`). The funfair's land, the outer road and the plantation are unchanged.
- The walkways are OpenStreetMap's (`FOOTPATHS_M` in `campusData.ts`). OSM was fetched again on 2026-10-17. Inside the campus it matches the 2026-10-15 extract in `scripts/map3d/osm_full.json`, so that file is unchanged.
- Walks that OSM lacks, traced by hand from aerial imagery (`TRACED_PATHS_M` in `geo.ts`): the walk along the lake side of A3, A4 and A5 (it carries on OSM's walk along A1 and A2), the walk down A5's east side, and the sidewalk south of the lawn east of A5.
- OSM draws the walk along that lawn's east edge about 11 m into the trees. It is traced again, and `emit_phase1.py` leaves the OSM way out.
- Not drawn: OSM's sidewalks outside the outer road, car roads, and walks on the funfair's land.
- To check on site: the imagery suggests a walk between A3 and A4, under trees. It is not drawn.

### Map: LakeFront Café as the lake stage, 2026-10-16 to 10-17 (Ben, branch `funfair-central`; partly done)
No migration. Design and batches: [map3d-lakefront-design.md](map3d-lakefront-design.md).
- **Done (L1):** the 3D map's red dome is now the real venue from Ben's photos: the red ribbed shell over a round stage, the moat, the walkway, the footbridge, a grass amphitheatre and willows (`src/components/map3d/lakefront/`). The XMUM hedge letters are removed (Ben). Positions, the label, GPS, markers and the 2D map are unchanged.
- **Done (L2):** evening lighting at sunset and night: LED ribs, a washed membrane, small lights, light pools, and sweeping concert beams in haze (Ben asked for the beams every evening, moving). Full screen on phones now draws every frame at night, so the beams move there too.
- **Done (L3):** the concert: a 3 s opening (house lights down, a follow spot, the ribs one by one, a bang) and a 30 s show on the wall clock, the same on every phone: the shell as an LED screen, faster beams with sky beams, arch beams and lasers, about 900 crowd lightsticks, moat fountains, flame jets, confetti, and fireworks over the lake every 2 minutes. At most 2 flashes a second; reduced motion turns the motion off. Viewable on `/map3d?concert=1` (or `=flip` for the opening).
- **Done (L4, 2026-10-17):** the concert plays on every 3D map while all three funfair zones are on (Ben's option A), starting 2 s after the last zone powers up; the "LakeFront Café" label gets a "● LIVE" tag. Admin's and HOGM's Funfair cards have a "Finale · Lake stage concert" row (LIVE or OFF) with a Preview link (`/map?funfair_preview=lakefront`, on that screen only). To start it early, set all three zones' overrides to On. No backend change.
- **Done (2026-10-17):** Ben accepted the venue; the old `Dome` in `buildings.tsx` is deleted. Opening the map with all three zones on replays the zones' power-ups and the concert's opening (Ben keeps this).
- **Left:** check on a real phone.

### Map: changes show within 15 s, 2026-10-17 (Ben, branch `funfair-central`)
No migration. Ben asked that a lit zone and a group's location show on the map within 15 s.
- **Funfair:** the 3D map asks `fn_funfair_state` every 10 s (was 30 s; `FUNFAIR_POLL_MS` in `useCampusMapData.ts`), so Admin's overrides and keys reach every map within about 10 s. A lit bulb still shows at once (Realtime).
- **Group locations:** Faci phones report every 12 s, moving or standing still (was 20 s; `REPORT_INTERVAL_MS` and `HEARTBEAT_MS` in `FaciLocationTracker.tsx`). That stays above the server's 10 s floor and leaves time for the GPS fix and the map's reload. The map gets each report through Realtime about 2 s later. If it misses one, it reloads the pins every 10 s (was 30 s).
- **Coming back to the app:** the map reloads the zones, the bulbs and the pins at once, since a phone in another app pauses its timers and can miss Realtime events.
- The Funfair cards say a change shows within about 10 s.
- Not changed: Admin's accuracy check still reports every 20 s.

### Map: the Vortexa Funfair on the 3D map, 2026-10-16 (Ben, branch `funfair-central`)
Migration `0088_funfair_zones.sql` (applied on the project; Ben, 2026-10-17). Without it the map works, and each zone powers up with its default key: West with A3, Central with Track & Field, East with B1. Admin's and HOGM's Funfair cards then only say that the migration is missing. With it applied, the cards change the setup.
- **Funfair on the land:** three zones (West · Neon Pier, Central · Starlight Midway, East · Big Top) and the VORTEXA gate stand on the dorm land of the 3D map, now lawn. Ride tags carry the dorm names ("LY3 · Vortexa Eye") and show close up.
- **Power:** a zone powers up when its keys (lightbulbs) are lit, with a 2 s power-up animation. The gate lights with the share of zones on.
- **Funfair card:** on Admin → Live control and on HOGM's Game control (Funfair tab). It sets each zone's keys, the any/all rule and a manual on/off override (`fn_set_funfair_zone`, `is_game_lead()`). Preview opens `/map?funfair_preview=<zone>` and plays that zone's power-up on that screen only.
- **Who sees what:** everyone gets only on or off (`fn_funfair_state`). Only game leads read the setup, since a zone's keys would tell players where the unlit bulbs are.
- **How fast it shows:** maps ask again when a bulb is lit (live), every 10 s, and when the page comes back into view, so Admin's changes reach other maps within about 10 s (was 30 s; Ben asked for under 15 s, 2026-10-17).
- **Details:** [map3d-session-handoff.md](map3d-session-handoff.md), "Vortexa Funfair".

### Map: 3D campus map on every map page, 2026-10-16 (Ben, branch `map3d-batch4`)
- `/map`, `/checkin` and `/committee` show the 3D campus (`src/components/map3d/`). The 2D art is the fallback: devices without WebGL, a 3D error, or `?map=2d`. Details: [map3d-implementation-plan.md](map3d-implementation-plan.md), "Progress".
- The 3D map has no Lightbulbs layer: the lightbulb list is under the map (Admin keeps Reset; Move bulb is on the 2D map only). The Items page's "See it on the map" link scrolls to that list.
- Full screen has an Auto / Sunset / Day / Night switch.
- Admin's Accuracy check on the 3D map measures the GPS error in metres and saves nothing. Saved corrections (anchors) only bend the 2D map.

### Map: Admin accuracy check, and location every 20 s, 2026-10-14 (Zichien)
Needs migration `0087_map_accuracy_check.sql` (after `0082`–`0085`). Until it runs, maps keep working with the built-in anchors; only the check fails.
- **Faci phones report every 20 s**, moving or standing still (was 30 s moving, about 60 s still). The server still ignores reports under 10 s apart. (Now every 12 s: see 2026-10-17 below.)
- **Accuracy check** (Admin, Map page → "Accuracy check"): the Admin's phone tracks its GPS and reports it every 20 s to `admin_check_locations` (`fn_report_admin_gps`; only Admins can read it, through `fn_admin_check_locations`; kept apart from group pins; rows older than 1 hour are removed). A blue "You" pin with an accuracy halo shows where the map puts them; other Admins checking show as grey dots.
- **Tap to correct:** tapping the map saves an anchor (`fn_admin_add_map_anchor` into `map_anchors`) from the average of the last 40 s of fixes at ±20 m or better (at least 2; otherwise "GPS too rough"). An anchor within 15 m replaces the old one; a tap more than 25% of the map from where the pin was asks to confirm. Saved anchors show as blue diamonds and can be deleted from the panel (`fn_admin_delete_map_anchor`); both are audit-logged.
- Every map loads `map_anchors` and adds them to the built-in anchors (`setExtraAnchors` in [mapGeo.ts](../src/lib/mapGeo.ts)); one within 15 m of a built-in anchor overrides it. Bad data falls back to the built-in anchors. Other phones pick up new anchors the next time the map loads.

### David, 2026-10-14 (Vortexa projector celebration)
- Replaced the activation circuit animation with five converging light trails, a star burst and an illuminated amusement park, using CSS/SVG and reduced-motion support.
- Added a development-only, backend-free `/activate/preview` for replaying B1/A3/TF. Activation routes skip the global intro so it cannot cover the celebration. Mobile browser preview checked; fixed particle-coordinate hydration mismatch.
- This release contains the celebration only; the separate NFC backend integration remains on `codex/nfc-integration`.

### David, 2026-10-14 (continuous projector ignition)
- Matched the star charge/ignition transforms and synchronized all five trails to the same finish. Ignition now follows the actual CSS charge completion rather than a separate timer, avoiding a hydration-dependent pause. Reduced-motion mode still shows the result immediately.

### David, 2026-10-14 (Admin NFC card deletion)
- Implemented per-card Delete with an in-page confirmation dialog on Admin → NFC. Used cards and visible projector links disable Delete. The database also rejects consumed Guardian links and live-schema `USED` status.
- Migration `0086_nfc_token_delete.sql` adds an Admin-only transactional RPC. It locks the card against activation, preserves NFC logs, and audits the deleted card's ID, label, location and linked log IDs without token hashes or URLs. Unused puzzle requirements follow their existing cascade rule.
- Embedded Postgres tests cover the base and enriched schema, roles, protected cards, retained logs, audit rollback and concurrent activation. This is implemented locally, not deployed. Apply migration `0086` before deploying the frontend. No existing live cards were deleted.

### Map migrations to run (Zichien's map work, 2026-10-13/14)
Renumbered after main's `0081` (and clear of `0069`, kept for Faci profiles). Run in order: `0082_multi_faci_group_position.sql`, `0083_map_lightbulbs.sql`, `0084_nfc_demo_scan.sql`, `0085_lightbulb_spots.sql`, then `0087_map_accuracy_check.sql` (`0086` is David's NFC card deletion). They were already run on the project under their old numbers (0069–0072); running them again is safe (all `create or replace` / guarded), and `0084` must be re-run anyway so Reset also clears `test_run_id`. Optional test data: `supabase/seeds/day2_map_stations.sql`. Before the event: turn off NFC demo mode.

### Map: GPS precision from Google Maps anchors, 2026-10-14 (Zichien)
- A pin between Furong Lake and the courts landed near the track (about 7% of the map off): the warp had no anchors around the lakes.
- Added landmark anchors read off Google Maps satellite view, in `LANDMARKS` in [mapGeo.ts](../src/lib/mapGeo.ts): LakeFront Café (the red dome), the causeway between the two lakes (the red bridge), and the Statue of Tan Kah Kee (the monument). The art is the campus turned about 135° (north points down-right).
- The pin position now uses a thin-plate spline through all anchors instead of a straight fit plus inverse-distance pull: exact at every anchor, smooth in between, no snapping toward the nearest anchor. The same test spot now lands about 1–2% from the right place.
- A lake-centre anchor was tried and dropped: it folded the warp (the art draws the lakes bigger than they are). Use sharp points only.
- Lightbulbs are drawn as a detailed bulb (pear glass, filament, screw base; rays and glow when lit) centred on their building; `0085_lightbulb_spots.sql` moves bulbs still on a default spot to the building centre.
- The Admin walk-and-tap calibration tool is now built (Accuracy check, see above).

### Map: Day 2 stations, building badges, demo NFC scan, 2026-10-14 (Zichien)
Needs migration `0084_nfc_demo_scan.sql`.
- **Day 2 stations only** on every campus map (`/map`, `/checkin`, `/committee`), including the "Available stations" list. Day 1 stations are still managed on Admin → Stations. Stations added from a building on the map are created as Day 2.
- **Building badges:** a building with two or more Day 2 stations shows one disc with the number of open stations (a paler disc behind it means "several stations"), green if any is open, red ring if any is busy, grey cross if all closed. Single dots and badges sit on the building's centre. One station keeps its own dot. Tapping a badge lists that building's stations under the map (Admin: opens the building panel). In full screen, tapping a badge zooms in, and past 2.5× zoom the badges split into station dots.
- **Demo NFC scan:** Live control has a new switch, "NFC demo mode". While it is on, the Key screen on Items shows "Demo scan", which lights that bulb for the user's group for real (`fn_demo_activate_projector`, skips the endgame, puzzle and token checks; still one group per bulb and one bulb per group; audit-logged) and links to `/map?layer=bulbs`.
- **Reset a bulb:** Admin has Reset on each lit bulb in the map's Lightbulbs list (`fn_admin_reset_projector`, audit-logged). It does not free a used NFC token.

### Map: Stations / Lightbulbs switch, 2026-10-13 (Zichien)
Needs migration `0083_map_lightbulbs.sql`.
- A Stations / Lightbulbs switch above the map (and in full screen) on every page that shows the campus map (`/map`, `/checkin`, `/committee`). The choice is remembered on the device. Group pins show in both modes.
- **Stations** is the map as before, without the projector marks drawn on top.
- **Lightbulbs** shows the three lightbulbs (projectors Star/B1, Wheel/A3, Orbit/TF): lit ones glow with the group that lit them and the time; unlit ones are grey with a "?". Read through `fn_map_lightbulbs()`: lit bulbs go to everyone; unlit bulbs only to Committee tier, or to everyone once Admin turns on "Day 2 map layer" (the map unlock). The `projectors` table itself is still readable by any logged-in user (item 3).
- The Lightbulbs tab shows "N lit", and pulses when a bulb is lit while you are in Stations mode, until you open Lightbulbs.
- **Admin moves a bulb** to where its NFC card really is: Lightbulbs → Move, then tap the map (full screen for precision). Saved to `projectors.map_x / map_y`. `PROJECTOR_SPOTS` is removed; the spots come from the table.
- Star/Wheel/Orbit code names now live in `PROJECTOR_CODE_NAMES` (`src/lib/types.ts`), shared with the Items page.

### Map: three Facis per group, courts, and location problems, 2026-10-13 (Zichien)
Needs migration `0082_multi_faci_group_position.sql`.
- **One pin per group.** `fn_group_positions()` takes the best fix across all of the group's Faci phones (smallest accuracy plus 1 m per second of age), plus the group's current station check-in. [groupPosition.ts](../src/lib/groupPosition.ts) draws whichever is newer, except that a check-in from the last 10 min beats a GPS fix worse than 100 m. Groups at the same spot sit side by side. Replaces the separate GPS pin and "G4" check-in tag (`fn_latest_gps_locations` / `fn_latest_locations` are no longer used by the map).
- **Pins never disappear.** Fresh ≤ 2 min, faded ≤ 10 min, then grey. `fn_report_gps` keeps each Faci's newest fix past the 1-hour cleanup. A "Not seen for 10+ min" list (all groups with no usable fix) opens each group's Facis with when their phone last shared, and Call / WhatsApp links for Committee tier (`fn_group_faci_status`; phone numbers are not returned to Facis).
- **Rough fixes** (worse than 100 m) draw with a dashed circle the size of the accuracy; worse than 1 km are stored but not drawn.
- **Faci tracker rewrite** ([FaciLocationTracker.tsx](../src/components/FaciLocationTracker.tsx)): throttles on the attempt, not the success (and the server ignores reports < 10 s apart), so a failing phone no longer reports every second; no double report on start; "imprecise" status; the banner comes back when permission is revoked; a GPS timeout really retries; offline errors explained; a fix is sent on return to the app and when the connection comes back.
- **Location help per phone** ([LocationHelp.tsx](../src/components/LocationHelp.tsx), [browserEnv.ts](../src/lib/browserEnv.ts)): steps for iOS Safari / Chrome and Android Chrome / Samsung for blocked, rough and unavailable location; detects WhatsApp / Instagram / Facebook / WeChat / LINE / TikTok in-app browsers and non-https.
- **Keep tracking** ([FaciTrackingPanel.tsx](../src/components/FaciTrackingPanel.tsx), on the Map page for Facis): holds the screen awake with the Wake Lock API while the app is open, re-taken when the app returns; falls back to Auto-Lock steps when the browser can't. The panel shows which of the group's Faci phones are sharing. A Faci who reopens the app after their group was off the map for 10+ min is told so.
- **Courts:** Tennis Court and Volleyball Court are map buildings and GPS anchors (Tennis 2.831869, 101.706675; Volleyball 2.831859, 101.707253), with 45 m check-in zones. Station codes TC-n and VC-n. Admin → Stations no longer offers the "Courts" block, which the database rejected.
- Realtime map reloads are batched (one every 2 s at most).
- Not tested on real phones yet. Web pages cannot read GPS in the background, so pins still depend on someone having the app open.

### Migrations to run on Supabase for the 2026-10-13 and 2026-10-14 work
Run in this order (each only once; `0054`-`0058` and `0065` must already be there). `main` has its own `0071_hogm_game_control.sql` and `0072_hogm_game_length.sql`; the numbers below are this branch's, renumbered to stay clear of them:
- `0070_blindbox_buy_flow.sql`: one public QR per seller, BUY then open from Items (see "Blind boxes: one QR per seller").
- `0077_fix_admin_station_gms_types.sql`: Admin → Stations showed every station as "Unassigned" after assigning Game Masters, because `fn_admin_station_gms()` declared `day` as integer while the live `gm_station_assignments.day` is smallint (Postgres: "structure of query does not match function result type"). The function now casts the columns, and allows Admin and HOGM so it is safe to run before or after `0071_hogm_game_control.sql`.
- `0078_station_status_manual.sql`: station status is manual only.
- `0073` to `0076`: Manual Location Update, details, per group, Admin-managed locations.
- `0080_hof_faci_control.sql`: HOF assigns Facilitators to groups on Ops → Faci control (`is_faci_lead()`: HOF or Admin). Run before deploying branch `hof-page-setup`.
- `0079_station_gms_game_lead.sql` (run after `0077`): HOGM → Ops → Stations showed "You don't have permission to do that." on load. On the live database `fn_admin_station_gms()` was the only one of 0071's functions without `is_game_lead()`. 0079 switches it to `is_game_lead()` and revokes `anon`. Before 0079, a caller who was not logged in could read every assignment, because `is_admin()` and `my_role()` return NULL for anon and `if not (NULL)` does not raise. Other `if not public.is_admin()` checks have the same NULL hole for anon; see section 3.
- `0081_nfc_test_mode.sql`: Admin can prepare a test-only Guardian redemption, generate test sticker URLs, run the real NFC activation path without Endgame phase gating, reset and re-arm state tagged to that test run, then finish it to invalidate its URLs and clear its test state. The same test sticker can be used again after reset. The NFC kill-switch, group ownership, single-projector limit, and projector availability checks still apply. Run before deploying the updated Admin NFC page.
Branch `jiamin-blind-box-integration` skips `0059`-`0069` on purpose (they live on `main`). The test files `tests/*/stub-schema.sql` are for the local test database only and must never be run on Supabase.

### Manual Location Update + "Headcount and location", 2026-10-14 (changesv4.md)
Migrations `0073_faci_location_updates.sql`, `0074_faci_location_details.sql`, `0075_faci_location_per_group.sql`, `0076_faci_location_options.sql` (run in that order).
- **The location belongs to the GROUP.** Any Facilitator in Group 1 can send Group 1's location; the group shares one latest update (like the headcount). Each entry records which Facilitator sent it. A Facilitator with no group cannot send one.
- **Facilitator page:** a fourth Checklist row, "Manual Location Update" (the lead says "Four things"). Status (Heading to / Arrived / Other; Other shows a text box, up to 60 characters), Building (the options Admin manages) and an optional "Details" comment (up to 200 characters; an update can be sent with it empty). The row shows the group's last update, whoever sent it, including "(edited by Admin)". Text only: no GPS, not the map, not station check-in (row 03 "Update Location" is unchanged).
- **Admin page "Headcount and location"** (menu and title; the URL is still `/admin/freshies/headcount`) is now TWO separate tables, each with Group 1 to 10: **Headcount** (Local / International / Total, always open) and **Location** (status and building on one line, Details under them, and who sent it and when). From md up they are tables (about 560px each); on a phone each group is a compact card with 44px touch targets and no sideways scroll. Updates live. Admin corrects a group's latest update with the dropdowns / Details box and taps Save (marked "edited", audited with before and after); earlier updates are under "History". Admin does not add updates for a group; only Facilitators do. The headcount table on the Groups page is unchanged.
- **Admin manages the location options** (`0076`): a "Locations" card under the Location table to add, rename, reorder (up/down) and delete the options (A1, A3, ...). Seeded with A1-A5, B1, Track & Field. Rename also renames earlier updates; deleting one that updates already used hides it (it leaves the dropdowns, those updates keep the text), deleting an unused one removes it. Everyone signed in reads the options; only Admin changes them (`fn_admin_location_option_save` / `_delete` / `_move`). The Facilitator dropdown and the Admin dropdowns follow them live: they also reload straight after Admin changes something and whenever the tab comes back into view (a page opened before `0076` was run kept showing the built-in list and "No locations yet" until reloaded), and the card says "Run migration 0076" if the table cannot be read.
- **Database:** table `faci_location_updates` (user_id = sender, group_id = the group; no coordinates; status checked; Other needs text; the building is checked against the live options). Nobody writes directly: `fn_faci_log_location` (a Faci, for their group) and `fn_admin_edit_faci_location` (Admin, the group's latest entry). A Faci reads their group's entries; HOF / HOGM / Committee / Admin read all. `0075` moved entries made before it onto their Facilitator's group and removed entries from a Facilitator with no group.
- **Tests:** `tests/faci-location/db.test.ts` (real Postgres + the real migrations, including the 0074 to 0075 data move): any Faci in a group updates the group's latest, another group is untouched, a Faci with no group is refused, Other text rules, optional details, read access by role, no direct writes, Admin edits (mark, audit, only a group's latest entry, validation, role checks), and the options (create, duplicate / invalid names, delete vs hide, rename carries the history, archived building kept on an edit, move, role checks). 32 tests; the test cleanup tolerates Windows keeping the temp folder locked.
- **Checked on your Supabase project** (localhost; test entries removed): the Facilitator sent an update with a comment; Admin changed it and it was saved and marked "edited"; the page checked at 375px with no sideways scroll. Not checked live: the Locations card (needs `0076` run on Supabase).

### Station status is manual only (changesv3.md), 2026-10-14
Migration `0078_station_status_manual.sql`.
- **Timer decoupled:** the trigger from `0049` that opened a day's stations when its game started and closed them all when it ended or expired is dropped. Start / End / Pause / Resume / the countdown (`fn_phase_control`, `fn_game_toggle`, `fn_game_expire`) now only run the timer. The Start/End confirmation says "Station statuses are not changed."
- **Check-ins no longer change the status:** `fn_refresh_station` (the "full = In Progress, else Available" recompute from `0062`) is a no-op. A full station still refuses check-ins (`STATION_FULL`) and a Closed station still refuses them (`STATION_CLOSED`). Stations start Closed, so an Admin or Game Master has to open them. `stations.status_override` is unused now.
- **Admin Stations:** the status badge is a dropdown (Available / In Progress / Closed) that calls `fn_set_station_status`, with live updates (a Game Master's change shows without a refresh). The "n/m stations open" list on Live control stays.
- **Game Master page:** the Status tab has Available / In Progress / Closed ("Busy" renamed), the current one highlighted, and updates live when Admin changes it. A GM can set only their own station (the one `profiles.station_id` points to, which follows the day: Day 1 station, then the Day 2 station). HOF / HOGM / Admin can set any.
- Existing statuses in the database are left as they are.
- **Tests:** `tests/stations/db.test.ts` (real Postgres + the real `0062`, `0064`, `0078`): the old coupling is reproduced first, then after `0078` starting / pausing / ending / resetting games never changes a status; Admin, HOF, GM, Guardian GM and Faci / Freshie permissions; a Closed station refuses check-in; check-in, check-out, clear and a full station never change the status. 13 tests; `npm test` is 49 in total.
- **Checked in the browser** (temporary test station, removed afterwards): GM page shows the three states and highlights the current one; Admin changes it and the GM page updates without a refresh; the GM taps In Progress and the database changes; the Admin Stations dropdown updates live when the GM side changes it, and changing it there is stored. Not checked live: the timer actually leaving statuses alone (needs `0078` run on Supabase and a real game start/end; covered by the database tests).

### HOF / HOGM / Committee home redesign, 2026-10-14
Branch `hogm-home-redesign`. Not merged yet. Do not merge to `main` until the PR is open and reviewed. No migration.
- **New home** for HOF, HOGM and Committee: `StaffHome.tsx`, used by `/dashboard` for `OPS_ROLES`. It has the same layout as the Freshie Home Welcome stop:
  - "Welcome to Vortexa" and "Hi {name} · {role}"
  - the event countdown (follows the Schedule)
  - the PhaseCard while a game phase runs; otherwise a dashed "No game running" line with the next phase
  - an **Ops** button (to `/committee`) and a **More Info ↓** button
  - the organiser and sponsor credits

  More Info scrolls to: Live floor (people checked in, leading group, live map; each tile opens the matching Ops tab through `/committee?view=`), then the full scoreboard (the ferris wheel cabins use the group colours), then Event tools (Big screen, My blind box QR → `/committee#blindbox`, Campus map, Schedule, Scoreboard). Big screen is also in the account menu and in TopNav.
- **Colours**: the Welcome page palette (`VORTEXA_THEME`, `.fh-vx`), not a group colour. Staff subpages now read `--sp-*` variables, and `.staff-vx` switches them for these three roles. GM, Guardian GM, Faci, Admin and their pages keep the navy look and are unchanged.
- **Navigation**:
  - Phones and portrait tablets: the Freshie tab bar with Home, Map, Ops (yellow center button), Scores and Schedule.
  - 1024px and wider: TopNav, with Ops as a yellow pill.
  - The hamburger menu stays on subpages.
  - `/map` for the ops crew now uses the dark staff design, like the map on the Ops page (same `CampusMap` with group pins), instead of the light page. Other roles' map is unchanged.
- The old StaffDashboard text "roster" is now "headcount" (there is no roster view).
- **One timer at a time, every role's home** (Freshie, Faci, ops crew, GM, Guardian GM, Admin):
  - While a game phase is active or paused, the home shows the PhaseCard and hides the event countdown.
  - Otherwise it shows the countdown. The ops crew also gets the "No game running" line under it.
  - That line always says "No game running", with the next pending phase if there is one. There is no "Games are over" text: phases left as "ended" after a rehearsal made it show weeks before Day 1.
  - Only the "no game" case was checked in the browser (HOGM, GM, Freshie). No game was running, and none was started, to avoid writing to the live project.
- Checked in the browser with `hogm.test@xmu.edu.my` (local dev server against the live project, read only) at 390×844, 820×1180 and 1180×820:
  - home, More Info, a floor tile opening the Headcount tab, the subpage menu, `/committee` and `/token`.
  - `tsc` is clean for `src/`. `next lint` shows no new warnings.
- Not done:
  - The HOF and Committee accounts were not opened (they use the same code).
  - Not tested on real phones or iPads.
- Known: the dev console shows a hydration warning on the `next/font` class names. It also shows on `/login`, which this branch does not change.
- Left for later: the Ops page layout itself ("ops will coordinate later").

### Live database runs bonding-session's game timer, 2026-10-14
Found while running 0071 on the live project (orientation-2612). The account's saved SQL snippets `0018`–`0038` are the `bonding-session` branch's migrations, not `main`'s (for example `0035_role_permissions_and_allocations`, `0036_usability_and_gameplay_fixes`). The live database has both sets.

The live `fn_phase_control` is bonding-session's `0036` version (checked by function length), and it differs from this repo's in three ways:
- Start takes the length from `game_config` `bonding_session_duration_day1` / `_day2` (both 150), not from `phases.duration_minutes`.
- It only adds time. A negative extend fails with `INVALID_EXTENSION`.
- Only one game can run at a time. A second Start fails with `ANOTHER_SESSION_ACTIVE`.

Fixed in Admin → Live control and HOGM → Game control:
- The length now saves to both places (`src/lib/gameLength.ts`).
- −5 is removed.
- Start is disabled while the other day's game runs.

`tests/game-lead/bonding-phase-control.sql` is a copy of the live version, and `tests/game-lead/bonding.test.ts` runs 0071 and 0072 against it.

**Before porting `bonding-session`:** compare against the live database, not only this repo. Migrations that run `create or replace` on these functions can silently undo either side.

### HOGM Game control (Ops page), 2026-10-14
Branch `hogm-home-redesign`. Migrations `0071_hogm_game_control.sql` and `0072_hogm_game_length.sql` were run on the live project on 2026-10-14.
- For HOGM only, `/committee` is now **Game control** (`src/components/staff/game/`), in the Welcome page style. HOF and Committee keep the old Ops overview. It has these sections:
  - **Game**: Day 1 and Day 2 game cards with start, end, pause, resume, +5 min and length. Start and End ask for confirmation first. Start is disabled while the other day's game runs.
  - **Stations**: folding cards (closed shows the name and status), with add, edit, delete, status and Game Masters.
  - **Tokens**: token rules, and Reset (only in Rehearsal mode, and you must type RESET).
  - **Puzzles**: upload the picture for each location.
  - **NFC**: generate sticker links and see the issued list.
  - My blind box QR sits under Game.
- **Scores tab (`/token`) for HOGM**: `GroupScores`, every group's token total and puzzle total (out of 15), best first. Tap a group to see its three puzzle keys drawn like the Freshie Items page (`KeyEmblem`), with pieces per key and a Lit tag when that group lit the projector. Live from `groups`, `inventory` and `projectors`. No headcount (that stays on the HOF and Committee Ops page).
- **Schedule tab for HOGM**: the Freshie / Faci schedule (`FreshieSchedule vortexa`) in the Welcome page colours. It has a day switcher and timeline cards with tags, and a NOW tag with a glow on the item that is running (`useEventCountdown`). The NOW tag was not seen in the browser, because nothing was running during the check. Read only; Admin still edits on its own schedule page. Freshie and Faci are unchanged.
- **Header on HOGM subpages** (Ops, Map, Scores, Schedule; phones and portrait tablets): `OpsHeader`, the same logo, role chip and account menu (Big screen, Log Out) as Home, instead of "← Home" with the hamburger menu. The logo goes Home. The running game shows under the header. HOF and Committee keep the old subpage header.
- Navigation: a chip row on phones and portrait tablets, a side rail on landscape tablets and desktops. The sections can be linked with `#game`, `#stations` and so on.
- Not included, as asked: kill-switches, Now on Welcome, Live Ops numbers, the token log, Blind box management, and the map (the map is on the Map tab).
- Backend (0071):
  - New `is_game_lead()` (HOGM or Admin). 0071 takes each installed function and swaps its `is_admin()` check for it, keeping the rest of the live version. It stops without changing anything if a function does not have exactly one check. This applies to `fn_phase_control`, `fn_update_game_config_rule`, `fn_reset_tokens_and_puzzles`, `fn_admin_station_gms` and `fn_admin_set_station_gms`.
  - RLS: HOGM may update `phases` (game length only; no insert or delete), manage `stations`, write to the `puzzle-images` storage bucket, and read `nfc_tokens`.
  - `fn_set_config`: HOGM may set `puzzle_image_*` keys (0071) and `bonding_session_duration_day1/2` (0072) only. Kill-switches and other keys stay Admin only.
  - `/api/admin/nfc` allows Admin and HOGM, and the audit log now records the caller's real role.
- Tests: `tests/game-lead/db.test.ts` runs 0071 on a real Postgres. It checks that HOGM can do each of the above and that HOF, Committee and GM cannot, including the kill-switch keys. `tests/game-lead/bonding.test.ts` does the same against the live `fn_phase_control`. `npm test`: 52 pass. `tsc` and `next lint` are clean.
- Checked in the browser as HOGM at 390×844 and 1180×820 against the live project, before 0071 was run: every section's layout, a station card opened, the Add station sheet, and the Start confirmation (cancelled). Nothing was saved, so a real start, save or upload after 0071 is still untested.

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
- `FaciLocationProvider` in `src/components/FaciLocationTracker.tsx` continuously reports coordinates to `fn_report_gps` (immediately on mount, throttled movement updates via `watchPosition`, heartbeats while stationary (now every 20 s, see 2026-10-14), and instant refresh on returning to the foreground).
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
