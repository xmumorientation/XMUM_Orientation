# NFC activation → 3D funfair verification, 2026-10-19

Branch: `codex/nfc-map-activation`; latest fetched `origin/main`: `5ecbbba` (merged as `c35059a`). This section records the initial local verification; release checks are listed below. No database migration was applied.

## What changed

- Ordinary signed cards redeem through the existing `fn_nfc_v2_redeem_nfc_card` contract, which consumes the persisted Guardian handover and collected pieces atomically with the projector/card updates. Explicit Admin test-run stickers retain the test-run RPC. Only a missing-function response permits legacy fallback; permission and business errors do not.
- Guardian reads persisted `handover_verified`, verifies via the matching v2 handover function, and refreshes status/projector states every five seconds. It no longer pretends a local success means a legacy redemption row exists. Group/location changes discard stale status.
- Successful activation reads public funfair power before and after, respecting Admin's custom keys, any/all rules and manual overrides. Only newly powered zones are replayed; a duplicate scan or an already-on zone does not invent another unlock.
- Victory animation offers a direct map button and automatically opens `/map?arrival=activation` after the result appears. Navigation prefetches the map. A short-lived per-tab handoff contains zone names only, never the signed NFC URL.
- 3D opens full screen, waits for an actual scene frame and current public power, focuses the affected zone, then reveals its existing power ramp. The temporary visual mask affects this screen only. Other players keep the shared live state. The handoff is consumed after playback. Closing early restores the real scene; connection failures cannot keep a zone masked indefinitely.
- Portrait framing is wider; result text clears map controls. Reduced motion skips the charge and camera travel. Devices using 2D get a success message and automatically open the Lightbulbs layer.
- Dev-only `/activate/preview?location=B1|A3|TF` exercises the same transition into `/map3d/preview`, without remote writes. The existing 3D design intentionally has no new bulb markers: zone lighting plus the public lightbulb list remain the map's status display.

## Verification evidence

1. Controlled authenticated backend test used existing ordinary TF card 23 and retained Group 10 fixture (5/5 collected pieces and verified handover). Faci was temporarily assigned G10 and observer Freshie G2; Central temporarily used Auto.
2. G2 read Central off. G10 Faci redeemed successfully; a second scan with another request ID returned duplicate success. Freshie redemption was denied. G2 then read TF lit by G10 and Central on. Guardian status confirmed redeemed=true, handover_verified=false, projector_activated=true and zero collected pieces.
3. The versioned Admin revert restored all five collected pieces, unconsumed handover and dormant TF. Original assignments, all projector rows and Central override were checked against pre-state. Card 23 was retained.
4. A separate browser test minted one temporary ordinary TF card through the local Admin API. The local app used the real shared backend. Browser Faci login visibly showed Group 10 and a ready TF key. Opening the signed URL showed the success animation, automatically opened the map, focused Central and displayed “Starlight Midway — lit up!”. A separate Freshie login read “Orbit · Track & Field — Lit by Group 10” on its map.
5. The temporary browser card's exact activation was reverted, the unused card removed through guarded Admin deletion, assignments and Central override restored, and all original projector rows compared equal. Audit history and version increments from the test remain intentionally.
6. Desktop and 390×844 previews, reduced-motion automatic transition and forced 2D fallback were browser-checked. Saved screenshots under `/private/tmp/vortexa-nfc-journey/` include `real-activation.png`, `real-map-arrival.png` (Central still dark), `real-mobile-lit.png` (desktop viewport despite its filename), `other-group-map.png`, and mock mobile views.
7. TypeScript validation and 135 tests passed. The production build passed (compile, lint, type validation and route generation). Its only lint warning is the pre-existing `<img>` warning in CampusMap2DView.

## Remaining operational boundaries

- Production frontend is unchanged until this branch is released. Browser verification above used localhost plus the real authenticated backend, and the development visual harness; it was not a production-frontend check.
- No physical NFC radio, Safari/Home Screen session boundary or real-device frame-rate test was performed.
- The live project already has v2 functions from the retained NFC integration work. A migration-only installation without them retains its original legacy behavior. The existing v2 function gates ordinary activation on Day 2 (`phase_active('day2')`); legacy ordinary activation still gates Endgame. This change does not alter either database phase rule.
- All three live funfair zones were manually forced On before testing and were restored to that setting. For a genuine event-time off→on reveal, set the relevant zone override to Auto in Admin → Live → Funfair (or HOGM Game control → Funfair). A forced-On zone correctly stays lit and is not replayed as newly unlocked.
- Group assignment is visible in Admin → Freshies (group Facis) and Admin → Users (individual role/group); HOF can also assign group Facis. Demo Faci was restored to G9 and demo Freshie to no group.

## Release follow-up (2026-10-19)

- Latest team main (`b8fe75a`) was merged into the isolated `codex/nfc-release` branch, preserving the newer East layout, night map, lake stage, login and blind-box changes. The primary workspace's local edits were left intact.
- Reproduced the global logo returning over the map after an initial activation visit (one `.vx-intro` node after redirect). Activation now marks its own entrance as seen; a fresh browser visit to the fixed flow produced zero logo-overlay nodes.
- Activation arrivals skip the ordinary campus swoop and whole-campus framing flight before the zone focus. The arrival mask is present from the first component render.
- Reproduced a slow first 3D load exhausting the 15-second replay safeguard before a scene was visible. That safeguard now begins only after a rendered scene frame, preserving the reveal on a slow initial load.
- Fresh browser flow completed A3 → map → Neon Pier power-up. The existing graphics warnings are unrelated deprecations; no claim is made about physical-phone FPS.
- Full suite after integrating latest main: 12 files / 153 tests passed. The production build and PR deployment checks gate release. No new migration or permanent live game-setting change is part of this release.
- Rollback: revert the release merge if authentication, ordinary activation or public map state regresses. No schema rollback is required. Production verification uses a temporary, guarded TF fixture and restores original assignments, zone override and projector state afterwards.
