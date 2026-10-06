# Role Permission Matrix

Compiled from the current code: SQL migrations (RLS + RPC, the real permission boundary), the menu config in [AppShell.tsx](../src/components/AppShell.tsx), and the role checks in each page.
This reflects only the migration files in the repo. Any manual changes made to the live database are not included.

## Legend

- ✓ = available / visible
- — = not available
- Own Group / Own Station = limited to the user's own group / station
- View All / Manage = can view everything / can manage
- † = the backend allows it, but there is no menu entry or UI; reachable only by typing the URL or calling the RPC directly
- Enforcement: DB = enforced by the database; UI = hidden in the frontend only; ⚠ = no server-side check

## Matrix

| Function | Freshie | Facilitator | Game Master | Guardian GM | Committee | HOF | HOGM | Admin | Enforcement |
|---|---|---|---|---|---|---|---|---|---|
| **General** | | | | | | | | | |
| Dashboard / Home | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | UI |
| Campus Map / station status | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | DB |
| Group locations on the map | — | Own Group | — | — | View All | View All | View All | View All | DB |
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
| Sell GM Blind Box | — | — | ✓ | ✓ | — | — | — | † | DB |
| Update Station Status | — | — | Own Station | Own Station | — | All † | All † | All | DB |
| Undo Token Transaction (own last one, within 2 minutes) | — | — | Own Actions | Own Actions | — | † | † | † | DB |
| Grant a puzzle piece directly (fn_grant_item, no UI) | — | — | † | † | — | † | † | † | DB |
| **Guardian** | | | | | | | | | |
| Guardian Verification page (dashboard card is the only entry) | — | — | — | ✓ | — | — | — | — | UI |
| Look up a group's puzzle status | — | — | † | ✓ | † | † | † | † | DB |
| Puzzle Set Redemption | — | — | — | ✓ | — | † | † | † | DB |
| Manual Projector Activation | — | — | — | ✓ | — | — | † | † | DB |
| NFC Projector Activation (/activate; Endgame phase; must belong to a group) | ✓ | ✓ | — | — | — | — | — | — | DB |
| **Blind Box** | | | | | | | | | |
| Scan Blind Box QR (/scan) | ✓ | — | — | — | — | — | — | — | DB |
| Personal Blind Box QR (generate / rotate; requires an allocation) | — | — | — | — | Own | Own | Own | Any member | DB |
| Blind Box Allocation config | — | — | — | — | — | — | — | Manage | DB |
| **Attendance / Location** | | | | | | | | | |
| Mark attendance (Attendance Roster) | — | Own Group | — | — | — | All † | All † | Manage All | DB |
| Headcount fallback entry | — | Own Group | — | — | — | † | — | Manage | DB |
| Attendance completion overview | — | Own Group | — | — | View All | View All | View All | Manage All | DB |
| Manual Location Check-in | — | ✓ | — | — | — | — | — | † | DB |
| GPS auto-report | — | ✓ | — | — | — | — | — | — | DB |
| **Committee / Operations** | | | | | | | | | |
| Committee Operations page (/committee) | — | — | — | — | ✓ | ✓ | ✓ | † | UI |
| Group Balance overview | — | — | — | — | View All | View All | View All | View All | DB |
| Freshie group assignment (Committee → Register tab) | — | — | — | — | ✓ | — | — | ✓ | DB |
| Big Screen | — | — | — | — | ✓ | ✓ | ✓ | ✓ | UI + DB |
| Live Ops stats | — | — | — | — | — | † | † | ✓ | DB |
| Audit Log | — | — | — | — | — | † | † | ✓ | DB |
| Freshie control (/admin/freshies: groups, sessions, headcount) | — | — | — | — | — | — | — | ✓ | ⚠ UI |
| **Scoreboard (/token)** | | | | | | | | | |
| View the live group scoreboard (no rules, no log) | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | UI |
| **Token page (/admin/token)** | | | | | | | | | |
| View token rules, scoreboard and log | — | — | — | — | — | — | — | ✓ | UI |
| Set token rules (Day 1 rewards, Day 2 fee per tier) | — | — | — | — | — | — | — | ✓ | DB |
| Edit / delete logs, Reset All | — | — | — | — | — | — | — | ✓ | ⚠ UI |
| **Admin Console (/admin/*)** | | | | | | | | | |
| Phase Control (start / pause / extend / end) | — | — | — | — | — | — | — | ✓ | DB |
| Kill-switches | — | — | — | — | — | — | — | ✓ | DB |
| Users (CSV import; edit role / group / station) | — | — | — | — | — | — | — | ✓ | DB + API |
| Stations config | — | — | — | — | — | — | — | ✓ | DB |
| Puzzles / Items config | — | — | — | — | — | — | — | ✓ | DB |
| Attendance Sessions open / close | — | — | — | — | — | — | — | ✓ | DB |
| Schedule / FAQ management | — | — | — | — | — | — | — | ✓ | DB |
| Brand config | — | — | — | — | — | — | — | ✓ | DB |
| NFC Token generation | — | — | — | — | — | — | — | ✓ | API |
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
