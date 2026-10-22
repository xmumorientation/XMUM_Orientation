# Role Permission Matrix

Compiled from the current code: SQL migrations (RLS + RPC, the real permission boundary), the menu config in [AppShell.tsx](../src/components/AppShell.tsx), and the role checks in each page.
This reflects only the migration files in the repo. Any manual changes made to the live database are not included.

## Legend

- ✓ = available / visible
- — = not available
- Own Group / Own Station = limited to the user's own group / station
- View All / Manage = can view everything / can manage
- † = the backend allows it, but there is no menu entry or UI; reachable only by typing the URL or calling the RPC directly
- ‡ = HOGM does this on Ops → Game control, after migration 0071 (`is_game_lead()`). Kill-switches and other config keys stay Admin only.
- § = the server still allows HOGM (`is_game_lead()` / `/api/admin/nfc`), but HOGM's Ops page no longer has the control (Game, Tokens and NFC tabs removed 2026-10-19). Admin does it on Live control / Admin → Token / Admin → NFC. Tighten the server check if HOGM must not do it at all.
- Enforcement: DB = enforced by the database; UI = hidden in the frontend only; ⚠ = no server-side check

## Matrix

| Function | Freshie | Facilitator | Game Master | Guardian GM | Committee | HOF | HOGM | Admin | Enforcement |
|---|---|---|---|---|---|---|---|---|---|
| **General** | | | | | | | | | |
| Dashboard / Home | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | UI |
| Campus Map / station status | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | DB |
| Lightbulbs on the map (`fn_map_lightbulbs`) | Lit; unlit after unlock | Lit; unlit after unlock | Lit; unlit after unlock | Lit; unlit after unlock | All | All | All | All, can move | DB |
| Which group lit a lightbulb (map, Items, Guardian; `fn_map_lightbulbs`, `fn_projector_states`; the `projectors` table is Committee tier only, 0096) | Own Group | Own Group | — | — | View All | View All | View All | View All | DB |
| Demo NFC scan (only while NFC demo mode is on) | Own Group | Own Group | — | — | — | — | — | — | DB |
| Reset a lightbulb | — | — | — | — | — | — | — | ✓ | DB |
| Funfair zones on the 3D map, on or off (`fn_funfair_state`, 0088; before 0088 the default keys in code) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | DB |
| Funfair setup: each zone's keys, any/all rule, manual override (`funfair_zones`, `fn_set_funfair_zone`, 0088). Only game leads can read it, because the keys would show where the unlit bulbs are. | — | — | — | — | — | — | ✓ ‡ | ✓ | DB |
| Group locations on the map (`fn_group_positions`; Freshie and Faci own group only, 0094 reverses 0089) | Own Group | Own Group | — | — | View All | View All | View All | View All | DB |
| Phase Timer (view) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | DB |
| Schedule (view) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | DB |
| FAQ (view; sidebar entry for Freshie only) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | DB |
| **Tokens / Puzzles** | | | | | | | | | |
| Token Balance card | Own Group | Own Group | — | — | — | — | — | — | DB |
| Token History (/transactions) | Own Group | Own Group | — | — | — | — | — | — | DB |
| Puzzle Inventory (/inventory) | Own Group | Own Group | — | — | — | — | — | — | DB |
| **Station Panel (/gm)** | | | | | | | | | |
| Station Panel page | — | — | ✓ | ✓ | — | † | † | † | UI |
| Day 1 Token Reward (amount from the token rules) | — | — | ✓ | ✓ | — | † | † | † | DB |
| Day 2 Challenge (charge the tier's entry fee and grant a piece) | — | — | ✓ | ✓ | — | † | † | † | DB |
| Show blind box QR + link on the Station page (own boxes and own station's shared boxes) | — | — | Own | Own | — | — | — | — | DB |
| Set station status: Available / In Progress / Closed (`fn_set_station_status`; Admin → Stations and the Live control list; the GM page sets its own station by itself: In Progress when a Day 2 game starts, Available when it is submitted or cancelled, and the GM can open a Closed one (Open station); never changed by the game timer or by check-ins; changes show live on every page) | — | — | Own Station | Own Station | — | All † | All ‡ | All | DB |
| Undo Token Transaction (own last one in `token_transactions`, within Admin's undo window, default 10 minutes; not a Day 2 entry; the GM confirms what it reverses first; 0093 — the live database ran bonding-session's version, which read `token_logs`) | — | — | Own Actions | Own Actions | — | † | † | † | DB |
| Grant a puzzle piece directly (fn_grant_item, no UI) | — | — | † | † | — | † | † | † | DB |
| **Guardian** | | | | | | | | | |
| Guardian Verification page (dashboard card is the only entry) | — | — | — | ✓ | — | — | — | — | UI |
| Look up a group's puzzle status | — | — | † | ✓ | † | † | † | † | DB |
| Puzzle Set Redemption | — | — | — | ✓ | — | † | † | † | DB |
| Manual Projector Activation | — | — | — | ✓ | — | — | † | † | DB |
| NFC Projector Activation (/activate; Endgame phase; must belong to a group) | ✓ | ✓ | — | — | — | — | — | — | DB |
| **Blind Box** | | | | | | | | | |
| Scan a seller's blind box QR (public page, `fn_bb_seller_public`): a logged-out visitor sees only the seller's name, then picks a group and enters its 4-digit password | anyone with the code | anyone | anyone | anyone | anyone | anyone | anyone | anyone | DB (valid signed code only) |
| BUY a blind box (`fn_bb_buy`, from the scan page: pays the price and takes one box from the seller; a group can buy one per seller and up to the group cap; blocked by the blind-box kill-switch and by frozen tokens) | ✓ | — | — | — | — | — | — | — | DB |
| OPEN a bought box (`fn_bb_open`, from the Items page: rolls the prize and adds the tokens; still allowed when blind boxes are off or tokens are frozen) | ✓ own group | — | — | — | — | — | — | — | DB |
| See the group's bought boxes on the Items page (own claim rows; the prize range is never readable) | Own Group | Own Group (view only) | — | — | View All | View All | View All | View All | DB |
| See own blind box QR + link (ONE QR per seller covering all its box types; Home's "My Blind Box" stop and the /gm card; boxes assigned to the account only, since 0098 stations hold none) | — | — | Own | Own | Own | Own | Own | Own | DB |
| Box types, assigning boxes (to accounts: picked or by role; no stations since 0100), quantities, regenerate / switch off a QR, group cap (Admin → Blind boxes) | — | — | — | — | — | — | — | Manage | DB |
| Spot box (`fn_bb_spot_save`, 0100: one hidden QR that never changes; min / max tokens, pool, on/off). Freshie groups claim it free, once per group, outside the cap | Claim | — | — | — | — | — | — | Manage | DB |
| Token page Reset State (clears token logs and puzzle inventory, zeroes group tokens; only while Rehearsal mode is on) | — | — | — | — | — | — | — | ✓ | DB |
| Blind box Restore boxes (`fn_bb_reset`, scope 'openings' only since 0100; only while Rehearsal mode is on; typed confirmation) | — | — | — | — | — | — | — | ✓ | DB |
| Read box types (range, price, stock) | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | DB |
| Read every assignment and claim | — | — | — | — | Claims only | Claims only | Claims only | ✓ | DB |
| **Attendance / Location** | | | | | | | | | |
| Mark attendance (Attendance Roster) | — | Own Group | — | — | — | All † | All † | Manage All | DB |
| Headcount fallback entry | — | Own Group | — | — | — | † | — | Manage | DB |
| Manual Location Check-in (station check-in; `fn_manual_checkin`, `fn_uncheckin`; 0095) | — | — | Own Station | Own Station | — | All | — | All | DB |
| Manual Location Update: a text-only note of where a GROUP is, sent by any Facilitator in it (status Heading to / Arrived / Other + typed text, a building and an optional comment; no GPS, not linked to the map; `fn_faci_log_location`, table `faci_location_updates`; the group shares the latest update) | — | Own group (add, read) | — | — | Read all | Read all | Read all | Read all + edit a group's latest entry (`fn_admin_edit_faci_location`, marked and audited) | DB |
| Manage the location options Facilitators choose from (add, rename, reorder, delete; `fn_admin_location_option_save` / `_delete` / `_move`, table `faci_location_options`; everyone signed in can read them) | — | Read | Read | Read | Read | Read | Read | Manage | DB |
| GPS auto-report | — | ✓ | — | — | — | — | — | — | DB |
| **Faci Profiles** (`faci_profiles`, migration 0069; no phone or WhatsApp stored) | | | | | | | | | |
| See the Facis of own group with their profile (`fn_group_facis()`: name, Instagram, programme, languages, intro, photo) | Own Group | Own Group | — | — | — | — | — | — | DB |
| Read the `faci_profiles` table directly (select policy) | — | Own row + own group | — | — | View All | View All | View All | View All | DB |
| Edit own profile: photo, Instagram, programme, languages, intro (`fn_set_my_faci_profile`; own row only, audited) | — | Own | — | — | — | — | — | — | DB |
| Upload, replace or delete a photo in the `faci-avatars` bucket (own folder `<user id>/` only; 1 MB; webp, jpeg, png; anyone can read photos) | — | Own | — | — | — | — | — | — | DB |
| Clear a Faci's photo or intro (`fn_admin_clear_faci_profile`; audited) | — | — | — | — | — | — | — | ✓ | DB |
| Insert, update or delete `faci_profiles` rows directly | — | — | — | — | — | — | — | — | DB (no policy; writes go through the RPC) |
| Map accuracy check: report own GPS, save / delete map anchors, see Admins checking | — | — | — | — | — | — | — | ✓ | DB |
| Read map anchors (every map uses them) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | DB |
| Group Facis' sharing status (`fn_group_faci_status`) | — | Own Group, no phones | — | — | All, with phones | All, with phones | All, with phones | All, with phones | DB |
| **Committee / Operations** | | | | | | | | | |
| Committee Operations page (/committee) | — | — | — | — | ✓ | ✓ | ✓ | † | UI |
| Ops tabs Headcount / Location / Freshies (HOF, Committee, Admin; HOGM's Ops is Game control) | — | — | — | — | View All | View All | — | View All | DB |
| Read the groups' 4-digit login passwords (`group_login_codes`, Ops → Freshies; migration 0092) | — | — | — | — | ✓ | ✓ | — | ✓ | DB |
| Group QR links (`GET /api/group-join`: signed with the group number, never change; the Faci's own group on /code) | — | Own Group | — | — | — | — | — | ✓ | API |
| Sign in by scanning a group QR (`POST /api/group-join`: the server signs in with the group's current password) | anyone with the QR | anyone | anyone | anyone | anyone | anyone | anyone | anyone | API (valid signed token only) |
| New passwords for all groups (Admin → Freshies: `/api/admin/group-logins` with `refresh: "all"`; signs out every Freshie phone via `fn_end_user_sessions`, 0099, service role only) | — | — | — | — | — | — | — | ✓ | API |
| Freshie group assignment (Committee → Register tab) | — | — | — | — | ✓ | — | — | ✓ | DB |
| Facilitator group assignment (`fn_admin_set_group_facis`; HOF on Ops → Facilitators, Admin on Ops → Facilitators and Admin → Freshies; `is_faci_lead()`, migration 0080) | — | — | — | — | — | ✓ | — | ✓ | DB |
| Ops → Facilitators: each group's Facilitators and its Faci-related audit entries (Recent changes) | — | — | — | — | — | ✓ | — | ✓ | DB (Committee-tier reads) |
| Live Ops stats | — | — | — | — | — | † | † | ✓ | DB |
| Audit Log (Admin → Audit, every action; the database lets HOF and HOGM read every row (0002), but `/admin/audit` shows them "Admin access required", so only a direct API call reaches it) | — | — | — | — | — | API only | API only | ✓ | DB |
| Game log (Ops → Game control → Log: game actions only, each in words with who did it) | — | — | — | — | — | — | ✓ | — (Admin → Audit) | UI filter; DB allows every row |
| Freshie control (/admin/freshies: groups, sessions, headcount) | — | — | — | — | — | — | — | ✓ | ⚠ UI |
| **Scoreboard (/token)** | | | | | | | | | |
| View the live group scoreboard (no rules, no log) | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | UI |
| **Token page (/admin/token)** | | | | | | | | | |
| View token rules, scoreboard and log | — | — | — | — | — | — | — | ✓ | UI |
| Set token rules (Day 1 rewards, Day 2 fee per tier) | — | — | — | — | — | — | § | ✓ | DB |
| Edit / delete logs | — | — | — | — | — | — | — | ✓ | ⚠ UI |
| Reset All (Rehearsal mode only) | — | — | — | — | — | — | § | ✓ | DB |
| **Admin Console (/admin/*)** | | | | | | | | | |
| Phase Control (start / pause / extend / end, game length: runs the game timer only, station statuses are not changed) | — | — | — | — | — | — | § | ✓ | DB |
| Kill-switches | — | — | — | — | — | — | — | ✓ | DB |
| Users (CSV import; edit role / group / station) | — | — | — | — | — | — | — | ✓ | DB + API |
| Stations config (add / edit / delete, Game Masters) | — | — | — | — | — | — | ✓ ‡ | ✓ | DB |
| Puzzle pictures | — | — | — | — | — | — | ✓ ‡ | ✓ | DB |
| Each projector's place (game_config `projector_place_*`, 0097) | — | — | — | — | — | — | ✓ ‡ | ✓ | DB |
| See a projector's picture and place (`fn_my_projector_clues`, 0098; Freshie and Faci cannot read those config keys) | Own Group: completed key or lit | Own Group: completed key or lit | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | DB |
| Attendance Sessions open / close | — | — | — | — | — | — | — | ✓ | DB |
| Schedule / FAQ management | — | — | — | — | — | — | — | ✓ | DB |
| Brand config | — | — | — | — | — | — | — | ✓ | DB |
| NFC Token generation | — | — | — | — | — | — | § | ✓ | API + DB |
| Seed Test Accounts | Any logged-in user | Any logged-in user | Any logged-in user | Any logged-in user | Any logged-in user | Any logged-in user | Any logged-in user | Any logged-in user | ⚠ No check |

## Issues Found

1. **Seed Test Accounts has no permission check.** The POST handler in [seed-test-accounts/route.ts:35](../src/app/api/admin/seed-test-accounts/route.ts#L35) does not check the caller's role. Any logged-in user can call it, and it creates or resets the passwords of the hardcoded test accounts, including admin.
2. **Migration 0013 opens several tables to everyone.** From [0013_fix_token_logs_rls.sql:218](../supabase/migrations/0013_fix_token_logs_rls.sql#L218) onward, `token_logs`, `puzzle_inventory`, `game_config_rules` and `freshies` use `using (true)` and `grant all ... to anon`. Anyone with the anon key can read and write them without logging in. The `freshies` table holds names, phone numbers and student IDs, and the original "admin only" policy is overridden.
3. **A batch of RPCs have no role check and are granted to anon.** These are `fn_set_total_groups`, `fn_admin_update_freshie` and `fn_admin_delete_freshie`. (Migration 0046 made `fn_update_game_config_rule` admin only, dropped `fn_manual_token_adjust`, and made `fn_day1_record_result`, `fn_day2_deduct_entry` and `fn_day2_award_piece` uncallable.) On the Token System page, "only admin can edit/delete logs" is hidden in the frontend only.
4. ~~**`/api/token` has no role check.**~~ Removed: the route was unused.
5. **Frontend and backend disagree:**
   - The dashboard shows a Register Counter card to Faci and Committee ([dashboard/page.tsx:263](../src/app/(app)/dashboard/page.tsx#L263)), but the page is Admin-only and shows "Admin access required".
   - `/guardian`, `/checkin` and `/transactions` are not in the sidebar and are reachable only from dashboard cards.
   - The `/gm`, `/guardian`, `/attendance` and `/committee` pages have no role guard of their own; they rely entirely on RPCs to reject requests.
6. **The definition of Freshie is inconsistent.** A code comment says freshies have no login accounts (they live in a separate `freshies` table), but login accounts with `role = 'freshie'` also exist and are used for scanning Blind Boxes and viewing Inventory. The Freshie column in the matrix means the role with a login account.
