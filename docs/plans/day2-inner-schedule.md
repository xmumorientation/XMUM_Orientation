# Plan: Day 2 game inner schedule (approved 2026-10-25)

## Segments

Measured from the Day 2 game's real start (manual Start or autostart 0101).

| Segment | Default (min) | Station game (fee + piece) | Blind box | Funfair (light the map) |
|---|---|---|---|---|
| Normal 1 | 0 – 60 | on | off | off |
| CHALLENGE MODE | 60 – 90 | on | on | off |
| Normal 2 | 90 – 120 | on | on | off |
| Funfair | 120 – end | on | on | on |

- Live control: slider over the game's length with 3 handles (challenge start, challenge end, funfair start). Movable during the game.
- +5 min lengthens Funfair (the last segment).
- Start / End button per segment (e.g. Start challenge mode). Works with no game running (tests). Holds until **Back to auto**.
- Switches start at the segment default; an Admin flip lasts until the next segment starts.
- Outside the Day 2 game with no manual segment: blind box off, funfair off, station game as today.
- Admin only (`is_admin()`). Kill-switches (blindbox_disabled, nfc_disabled, tokens_frozen) still win. Rehearsal mode does not bypass.

## No pause anywhere

Remove Pause/Resume: Day 1 and Day 2 games (GameToggles), schedule items (NowOnWelcome, LiveSchedule), and server side (`fn_phase_control` pause/resume, `fn_schedule_timer` pause refused). ±5 and Stop stay.

## What each switch blocks (server enforced)

- **Station game off**: `fn_day2_challenge` refused (no fee, no piece). GM Station Check step shows the reason.
- **Blind box off**: `fn_bb_buy`, `fn_bb_buy_at`, `fn_bb_seller_preview` refused, nothing charged. `fn_bb_open` allowed. HOF/HOGM/Committee QR greyed with reason "Opens in challenge mode" or "Switched off by Admin". Freshie scan shows the reason.
- **Funfair off**: every lighting path refused: real NFC (live `fn_nfc_v2_redeem_nfc_card`), `fn_activate_projector`, `fn_activate_projector_manual`, test cards, demo `fn_demo_activate_projector`. Replaces `phase_active('endgame')` checks (also dropped from `fn_day2_challenge`).

## CHALLENGE MODE display

Big red blinking all-caps "CHALLENGE MODE", no timer, above the countdown (still "DAY 2 GAME ENDS IN"). Steady red under reduced motion. On Welcome, Freshie Home, StaffHome, GM Station, Live control.

## Build

1. Migration 0102: `day2_schedule` single-row table (challenge_start_min, challenge_end_min, funfair_start_min, manual_segment, switch overrides + the segment they were set in). `fn_day2_state()` (anon ok) returns segment, switches, absolute boundary times. `fn_day2_control(action, ...)` Admin only. `fn_day2_allows(switch)` helper used by the gated RPCs; patch live definitions (0071 style).
2. `useDay2State` hook: RPC + realtime on `day2_schedule` and `phases` + 15 s refresh; segment changes locally on time.
3. Live control: Day 2 card (slider, segment buttons, switches); Pause removed.
4. Pages: banner, greyed QR + reason, GM Check reason, lighting refusal messages, demo follows Funfair.
5. Embedded-postgres tests; ROADMAP, permission-matrix, AGENTS.

## Status

Built (uncommitted). 0102 patches the live functions from `pg_get_functiondef` itself, so the paste is optional: `docs/plans/day2-live-defs.sql` prints them if you want to double-check the guards landed.
