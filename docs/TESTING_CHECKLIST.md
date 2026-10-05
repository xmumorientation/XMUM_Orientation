# XMUM Orientation Website — Team Testing Checklist

Use a fresh browser session for each role. Record the account, device, time, input, actual result, screenshot, and any related database row for every failure.

## Test preparation

- [ ] Run every migration through `0038_day2_difficulty_presets.sql`.
- [ ] Confirm `.env.local` contains working Supabase values, a permanent `NFC_TOKEN_SECRET`, and the correct site URL.
- [ ] Start the website with `npm.cmd run dev` and keep the terminal open.
- [ ] Prepare Admin, Faci, GM, HOF, HOGM, Committee, and Freshie test identities where applicable.
- [ ] Assign the Faci and Freshie to a test group.
- [ ] Assign the GM to separate Day 1 and Day 2 stations.
- [ ] Create a checkpoint or use disposable test data before correction/reset tests.

## 01 — Foundation and shared data

- [ ] Open the website on two devices and confirm both use the same groups, stations, settings, and current session.
- [ ] Refresh during an operation and confirm authoritative Supabase data remains unchanged.
- [ ] Confirm an unassigned account shows an assignment message rather than guessing a group or station.

Expected: all modules use the current orientation data and survive refreshes.

## 02 — Authentication and permissions

- [ ] Log in and log out with every available test role.
- [ ] Confirm role-specific navigation is shown after login.
- [ ] Attempt restricted URLs manually and confirm access is rejected.
- [ ] Confirm Freshie is read-only and cannot claim/open Blind Boxes or scan NFC.
- [ ] Confirm Faci cannot access another group.
- [ ] Confirm GM cannot act for an unassigned station.
- [ ] Confirm Tech can access all management areas.

Expected: frontend visibility and backend authorization agree.

## 03 — Shared mobile UI and navigation

- [ ] Test hamburger navigation on a narrow phone viewport.
- [ ] Confirm there is only one navigation list.
- [ ] Confirm the red Log out action works.
- [ ] Check buttons, cards, modals, loading states, disabled states, and toasts.
- [ ] Confirm navigation never performs a gameplay mutation.

## 04 — Account registry and allocation

- [ ] Search and filter registered accounts.
- [ ] Assign a Faci to a group and confirm the Save button and success message.
- [ ] Assign a GM to one Day 1 station and one Day 2 station.
- [ ] Enable and disable Guardian GM assignment.
- [ ] Verify HOF can modify only Faci allocation.
- [ ] Verify HOGM can modify only GM/Guardian allocation.
- [ ] Verify Tech can modify both.
- [ ] Test two admins editing the same assignment and confirm conflict handling.

## 05 — Gameplay configuration

- [ ] Modify several General & Gameplay fields and save once.
- [ ] Confirm Day 1 and Day 2 durations save independently.
- [ ] Change replay policy and maximum attempts.
- [ ] Set Token cost and exclusion count once for Easy, Medium, and Hard.
- [ ] Assign different difficulties to several Day 2 stations using the dropdowns.
- [ ] Confirm each station displays the cost and exclusions inherited from its difficulty preset.
- [ ] Confirm the station cards form a readable two-column grid on a phone-sized screen.
- [ ] Save once and confirm the GM Day 2 page receives the corresponding station values.
- [ ] Confirm unchanged sections have disabled Save buttons.
- [ ] Verify HOGM sees gameplay settings but not Tech-only configuration.

Expected: future gameplay uses the saved values without source-code changes.

## 06 — Blind Box database and Admin log

- [ ] Configure Blind Box sources, stock, activation, costs, and reward ranges.
- [ ] Save GM Blind Box settings explicitly; confirm edits do not save on blur.
- [ ] Generate/rotate a source QR and verify the previous QR becomes invalid.
- [ ] Filter Blind Box records by group, source, ID, type, and status.
- [ ] Correct a record and verify correction history remains available.

## 07 — Blind Box claim

- [ ] With an active session, use Faci to scan a valid source QR.
- [ ] Confirm configured Token cost is deducted atomically.
- [ ] Scan the same source again for the same group.
- [ ] Test an invalid, expired, inactive, and sold-out source.
- [ ] Test simultaneous claims from two devices.

Expected: exactly one box is claimed and duplicate charges are impossible.

## 08 — Blind Box inventory and opening

- [ ] Confirm claimed boxes appear in the correct group Inventory.
- [ ] Confirm Freshie can view but cannot open a box.
- [ ] Open a claimed box as Faci and verify the stored reward is revealed.
- [ ] Attempt to open the same box simultaneously on two devices.
- [ ] Verify Token balance and ledger update exactly once.
- [ ] Verify post-session opening follows configuration.

## 09 — Token system and ledger

- [ ] Verify a new group begins at zero and Day 1 balance carries to Day 2.
- [ ] Test authorized credit and debit operations.
- [ ] Confirm insufficient balance is rejected without a ledger row.
- [ ] Test two simultaneous deductions that exceed the balance together.
- [ ] Test the actor's quick undo; only their latest eligible action should reverse.
- [ ] Test HOF/HOGM/Tech correction with a required reason preset.
- [ ] Confirm corrections change real balances and preserve original history.

## 10 — GM Day 1 gameplay

- [ ] Activate the Day 1 timer and submit a PK result.
- [ ] Submit a single win and a single loss.
- [ ] Use `-` as an empty field.
- [ ] Reject blank/blank and identical winner/loser groups.
- [ ] Confirm errors appear above the open confirmation dialog.
- [ ] Double-click Confirm and verify rewards are applied once.
- [ ] Verify configured rewards appear in labels, confirmation, and ledger.
- [ ] Confirm submission does not return a missing `fn_token_apply_unchecked` signature error.

## 11 — Day 2 station attempt

- [ ] Activate Day 2 and confirm the assigned station configuration loads.
- [ ] Start an attempt for a valid group and verify configured deduction.
- [ ] Reject invalid group, inactive station, insufficient Tokens, and unassigned GM.
- [ ] Test one-attempt and replay-enabled policies.
- [ ] Double-click Confirm and verify one deduction and one attempt.
- [ ] Confirm errors remain visible over the confirmation dialog.

## 12 — Puzzle configuration and pool

- [ ] Edit several pieces in one location and save the location once.
- [ ] Upload an image for each individual piece and verify it appears in Inventory when owned.
- [ ] Enable/disable pieces and change pool policy.
- [ ] Confirm the same Puzzle can belong to different groups.
- [ ] Confirm one group can never receive the same Puzzle twice, including after redemption.
- [ ] Filter ownership history and test dependency warnings on corrections.

## 13 — Day 2 Puzzle reward

- [ ] Complete Easy, Medium, and Hard attempts with their configured exclusion limits.
- [ ] Confirm WIN produces exactly one historically new eligible Puzzle.
- [ ] Confirm LOSE produces no Puzzle.
- [ ] Confirm CLEAR changes only unsubmitted selections and does not refund entry cost.
- [ ] Double-submit and verify no duplicate reward.
- [ ] Test the configured pool-exhaustion behavior.

## 14 — Group Inventory

- [ ] Confirm the correct group name, Token balance, Puzzles, and Blind Boxes load independently.
- [ ] Temporarily force one section to fail and confirm the others still render.
- [ ] Confirm successful actions refresh only the required information.
- [ ] Confirm arbitrary group IDs in the browser cannot expose another group.

## 15 — NFC and Puzzle redemption

- [ ] Generate a card URL after setting the permanent NFC secret and deployed site URL.
- [ ] Write/tap the card using an HTTPS-capable phone.
- [ ] Confirm Freshie cannot redeem and Faci can redeem for their group.
- [ ] Reject missing Puzzle requirements, invalid tokens, reused cards, and disabled NFC mode.
- [ ] Confirm redemption changes Puzzle status without deleting history.
- [ ] Test Admin reset and full linked rollback separately.

## 16 — Lighting Zones

- [ ] Confirm inactive and activated Zone cards display correctly.
- [ ] Redeem NFC and confirm the Zone shows the activating group.
- [ ] Observe the same Zone state on multiple connected devices.
- [ ] Disable effects and confirm ownership still commits correctly.
- [ ] Revert activation and confirm all viewers update.

## 17 — Timer and session control

- [ ] Before starting, confirm each day shows its configured countdown instead of `00:00`.
- [ ] Confirm the active day selector/card turns green and paused state turns amber.
- [ ] Confirm the currently selected day keeps a clear contrasting outline, including while active.
- [ ] Confirm Start becomes disabled and faded once running.
- [ ] Test Start, Pause, Resume, Extend, End, and Reset.
- [ ] Press End and confirm the status remains ENDED while the configured duration is shown for the next run.
- [ ] Confirm the final 30 minutes display red.
- [ ] Compare two devices for consistent remaining time.
- [ ] Confirm ended/paused sessions block normal gameplay mutations.

## 18 — Logs, corrections, and audit

- [ ] Confirm the hamburger contains one `Logs & Corrections` entry rather than separate log links.
- [ ] Use the top tabs to open Overview, Token, Puzzle, Blind Box, NFC, Audit, and Reasons where permitted.
- [ ] Verify HOF, HOGM, and Tech see only the log tabs allowed by their permissions.
- [ ] Combine available filters and verify results.
- [ ] Perform one safe correction in each domain.
- [ ] Confirm actual state changes, dependency warnings appear, and original history remains.
- [ ] Test concurrent edits and confirm stale updates are rejected.

## 19 — Realtime, notifications, and integration

- [ ] Keep two devices open for the same group and perform Token, Puzzle, Blind Box, NFC, Zone, and Timer actions.
- [ ] Confirm relevant pages converge without manual refresh.
- [ ] Confirm notifications target only the affected group and involved GM.
- [ ] Confirm Admin does not receive ordinary participant gameplay toasts.
- [ ] Disconnect and reconnect one device; confirm it reloads authoritative state.
- [ ] Run a complete Day 1 to Day 2 journey without resetting the group balance.

## Defect report template

- Section / test:
- Role and account:
- Device and browser:
- Preconditions:
- Steps performed:
- Expected result:
- Actual result:
- Error message:
- Screenshot/video:
- Relevant group, station, item, request, or transaction ID:
- Reproducible: Always / Sometimes / Once
