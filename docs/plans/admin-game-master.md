# Admin → Live control → Game master (emergency tools)

Status: plan and design preview only. Nothing is built yet.

## What it is

A section on Admin → Live control for D-day backup. Admin picks a group once, then can:

| Tab | Does | Day |
|---|---|---|
| Tokens | add or deduct tokens, with a reason | any |
| Puzzle | give a puzzle piece the group does not own | any |
| Blind box | give a blind box; it shows on the Freshie Items page, unopened | any |
| Funfair | the zone keys and overrides (moved here from Admin → Game → Funfair) | any |

"Always live": none of it depends on the Day 1 / Day 2 games running, the schedule, the Day filter or the Day 2 inner switches.

## Decisions to confirm

1. **Kill-switches still win.** "Freeze token mutations" still blocks Tokens (a banner says so). Phases, the schedule and the Day 2 switches are ignored. Is that right, or should the freeze also be bypassed?
2. **Gift boxes are not sales.** A gifted box does not use a seller's quantity or the type's stock, and is not counted in "Blind boxes sold". The Admin blind box log shows it as "Gift". Is that what "no consider sold" means?
3. **Admin only.** HOGM keeps its own Funfair card in Game control. Should HOGM get the Game master tools too (then `is_game_lead()`)?
4. **Give only for puzzle pieces.** A wrong piece is removed on the Puzzles page, as today.

## What exists and what is missing

- `fn_adjust_tokens` (free amount) was dropped in 0046, and `fn_day2_award_piece` was revoked. New Admin-only functions are needed.
- A blind box claim has `status = 'owned'` (bought, not opened) and the Freshie Items page already lists it (`useBlindBoxes`). A gift is an owned claim with price 0. The seller check `bb_claim_one_seller` needs a `gift` kind (as `spot` was added in 0100), and gifts must not hit the one-box-per-seller unique indexes.
- `FunfairZones` and `useFunfairZones` are reused as they are.

## Server (migration 0107, Admin only through `is_admin()`)

- `fn_admin_token_adjust(p_group_id, p_delta, p_reason, p_idempotency_key)`: limit ±50, ledger row with reason `ADMIN BACKUP: …`, keeps `groups.current_tokens` equal to `token_balance` (as 0046 does), audit entry.
- `fn_admin_give_piece(p_group_id, p_location, p_index, p_idempotency_key)`: inserts the inventory row with source `admin_grant`; a duplicate piece is refused.
- `fn_admin_give_blindbox(p_group_id, p_type_id, p_quantity, p_idempotency_key)`: quantity 1 to 5, owned claim, `gift = true`, price 0.
- `fn_live_ops`: "Blind boxes sold" leaves gifts out.

## Front end

- New [GameMaster.tsx](../../src/components/admin/GameMaster.tsx) and `game-master.css`, placed on Live control above the kill-switches, shown on both days.
- Remove the Funfair entry from Admin → Game; `/admin/funfair` redirects to Live control.
- Update the notes in `AGENTS.md` and `docs/permission-matrix.md` once built.

## Design

Style: Ethereal Glass on the admin shell's `--sp-*` colours, double-bezel plate, spring-eased motion (same family as the Day 2 inner schedule).
Layout: asymmetric split. Left, a group rail (colour dot, name, token balance). Right, the action panel with four tabs. On a phone the rail becomes a horizontal strip above the panel.

- Folded by default behind a pill, **Game master · emergency tools**, so it never clutters a normal day.
- **Two steps for every action.** Press an action, and a summary strip shows what will change (for example "Group 3 · +5 tokens · 12 → 17"). Press Confirm to apply.
- **Undo.** After an apply, a toast shows "Undo" for 10 seconds (tokens and gift boxes).
- **Tokens:** big balance, Add / Deduct, reason presets, and the group's last five transactions. The amount presets follow the token settings (`game_config_rules`, read with `fn_token_rule`), so a change on the Token page shows here too:
  - **Add** shows the Day 1 rules: Day 1 win (`DAY1_WIN_TOKENS`, 2) and Day 1 lose (`DAY1_LOSE_TOKENS`, 1).
  - **Deduct** shows the Day 2 entry fees: Easy (`EASY_COST`, 2), Medium (`MEDIUM_COST`, 4) and Hard (`HARD_COST`, 6).
  - Both end with **Custom**, a − / + stepper (1 to 50) for amounts the presets don't cover.
- **Puzzle:** three lightbulb locations as piece grids. Owned pieces are filled, missing ones can be tapped to give.
- **Blind box:** type chips (live types only), quantity stepper, a note that the group opens it on its Items page.
- **Funfair:** the existing zone cards (keys, any/all rule, Auto / On / Off).
