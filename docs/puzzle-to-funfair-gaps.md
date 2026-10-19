# Puzzle to funfair: the flow and what is missing

Checked on 2026-10-16 against `main` (migrations up to `0088`). Nothing on this list is built yet. When you fix an item, mark it done here and add it to the "Done" section of [ROADMAP.md](ROADMAP.md).

## The flow today

1. **Win a piece at a Day 2 station.** The GM records win or lose on the GM page (`fn_day2_challenge`). The entry fee is paid either way. A win grants a random piece the group does not own yet, from the station's pool: any location at a low-risk station, two locations the GM picks at a medium one, one at a high one. Each location (B1, A3, TF) has 5 pieces. Pieces go into `inventory`.
2. **Redeem the set with the Guardian.** When a group has all 5 pieces of a location and that bulb is still unlit, the Guardian marks the set redeemed (`fn_redeem_puzzle_set`, a row in `puzzle_redemptions`) and hands over the NFC card. There is no phase check here.
3. **Tap the card in the Endgame.** Each card holds a signed link, `/activate?t=…`. Admin or HOGM make the cards on Admin → NFC, and the database keeps only a hash. The server checks the signature, then `fn_activate_projector` checks that:
   - NFC is not paused;
   - the Endgame is on (Rehearsal mode counts as on);
   - the card is unused;
   - this group redeemed this location;
   - the bulb is unlit;
   - the group has not lit another bulb.

   It then sets `projectors.activated_at`, and the phone shows the victory screen. At most three groups win: each bulb lights once, and each group lights one bulb.
4. **Every map hears it.** `projectors` is in Realtime, so open maps reload the bulbs (`fn_map_lightbulbs`) at once.
5. **The funfair powers up.** The 3D map then asks `fn_funfair_state` which zones are on, and asks again every 10 s and when the page comes back into view. It plays the power-up of each zone that came on. The default keys are:
   - B1 → East · Big Top;
   - A3 → West · Neon Pier;
   - TF → Central · Starlight Midway.

   Admin and HOGM can change them (`0088`, applied 2026-10-17).

   When all three zones are on, the lake stage (LakeFront Café) plays its concert, the finale, on every open 3D map.

The funfair also follows a bulb lit in other ways:
- the Guardian's manual activation (for a damaged card);
- an Admin NFC test run;
- NFC demo mode.

Admin's Reset on a bulb turns its zone off again.

## What is missing

### A. Fix before the event (the flow gets stuck)

1. **Tapping the card while logged out is a dead end.** [/activate](../src/app/activate/page.tsx) sends a logged-out phone to the staff login (`/login?next=…`). That page takes an email and password only, and has no link to the group-code login. The [Freshie login](../src/app/login/freshie/page.tsx) always goes to `/dashboard` afterwards, so the card's link is lost and the group has to tap again. Fix: send `/activate` to the Freshie login, and make that page follow `next`.
2. **iPhones will probably hit item 1 every time.** The app can be added to the Home Screen ([manifest.json](../public/manifest.json), `standalone`). On an iPhone, a tapped card opens in Safari, and Safari does not share the Home Screen app's login. Android Chrome usually does. This needs a check on a real iPhone.
3. **The Items key screen still says scanning is not built.** In the Endgame it says "Part-card scanning is added in the NFC step. For now, show this screen to the Guardian.", and "Scan part card" is always disabled ([FreshieItems.tsx](../src/components/freshie/items/FreshieItems.tsx), `KeySheet`). In fact, players tap the card on the back of the phone, and there is no button to press. Replace the text with how to tap:
   - iPhone XS and later: hold the card near the top of the back of the phone;
   - older iPhones: use the NFC reader in Control Center;
   - Android: turn NFC on first.
4. **The Guardian's spot is sample text.** `GUARDIAN` in [sampleData.ts](../src/components/freshie/items/sampleData.ts) holds made-up places such as "B1 lobby, beside the east staircase", and the photo shows "Photo coming soon". It needs the real places and photos, or a field Admin can fill in.
5. **A rehearsal cannot be cleaned up.** Token → Reset State (`fn_reset_tokens_and_puzzles`, [0056](../supabase/migrations/0056_token_reset.sql)) clears only `token_logs`, the old `puzzle_inventory` table and the token balances. These stay:
   - the real pieces (`inventory`);
   - the redemptions;
   - the lit bulbs;
   - the used cards.

   Today there are only two ways out:
   - delete every group;
   - Reset each bulb on the map, then delete and remake the used cards.

   Admin NFC test runs (`0081`) do clean up after themselves.

### B. It works, but players lose the thread

6. **The victory screen is a dead end.** [VictoryTakeover.tsx](../src/components/VictoryTakeover.tsx) has no button to Home or to the map, and it does not say which funfair zone came on.
7. **"Show on map" opens the default view.** Items links to `/map?focus=B1`, but no map code reads `focus`.
8. **Three sets of names are never joined.** Keys are Star / Wheel / Orbit (`PROJECTOR_CODE_NAMES`), bulbs are B1 / A3 / TF, and zones are West / Central / East (`FUNFAIR_ZONE_NAMES`). Nothing tells players which key powers which zone. Also, the Star key powers the Big Top, while Starlight Midway is powered by Orbit.
9. **Nobody is told when a zone comes on.** Only someone looking at the 3D map at that moment sees the power-up. Home and Items show no notice such as "Group 3 lit Star: the Big Top is open".
10. **The 2D map has no funfair.** Some phones never see the result: those without WebGL, and those moved to 2D for being too slow. `loadFunfair` is set for the 3D map only ([CampusMap.tsx](../src/components/CampusMap.tsx)).
11. **A tap after the Endgame says "Too early!"** (`NOT_ENDGAME` on `/activate`). It should say the Endgame is over.
12. **The big screen shows the race only** ([bigscreen](../src/app/(screen)/bigscreen/page.tsx)). Playing the funfair's power-up there would make a finale. Nice to have.

### C. Guardian and Admin

13. **The Guardian page does not update live** ([guardian/page.tsx](../src/app/(app)/guardian/page.tsx)). After the group taps the card, the page still says the group should tap it, until the Guardian picks the group again.
14. **The Guardian page makes mistakes easy:**
    - The location is picked each time (B1 by default), so a Guardian at A3 can redeem B1 by mistake.
    - A set redeemed for the wrong group cannot be undone.
    - The page does not warn that a group already lit another bulb, so that group's card will fail.
15. **The manual activation skips two checks.** `fn_activate_projector_manual` (`0081`) does not check that the Endgame is on, or that NFC is not paused. Only staff can use it, but a Guardian can light a bulb, and its zone, early.
16. **There is no pre-event checklist.** Before the event, someone has to:
    - turn off demo mode and Rehearsal mode;
    - make the cards for all three bulbs;
    - fill in the Guardian spots.

    Today this list is only in the docs. A Live control card could show what is not ready.
17. **Unlit bulbs are not really secret.** Any logged-in user can read the `projectors` table, including where the unlit bulbs are (`map_x`, `map_y`). That also weakens the way `0088` hides the zone keys. This is ROADMAP item 3 (Deferred).
18. ~~**Until `0088` runs, the funfair setup cannot change.**~~ Done: `0088` is applied (Ben, 2026-10-17).

## Next steps

| Owner | Items |
|---|---|
| Ben (branch `funfair-central`) | 1, 3, 6, 7, 11, and the zone names from 8 on the victory screen and Items. For 5, a rehearsal clean-up function (migration file only; the team runs it). |
| Ben | Test 2 on a real iPhone: put the app on the Home Screen, then tap a card. |
| HOGM team | The real Guardian spots and photos for 4. |
| David | Before 13–15: `bonding-session` plans NFC redemption to replace the Guardian's check (see ROADMAP, "Read before merging `bonding-session`"). Decide on that first. |
| To assign | 9, 10, 12 and 16, if there is time. Item 17 stays under ROADMAP item 3. |
