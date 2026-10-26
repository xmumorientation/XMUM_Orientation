# Changelog

Everything merged into `main`, from the first commit (2026-06-22) to 2026-10-25, oldest first and grouped by day.
It is a summary of the git history (`git log`), one or a few lines per piece of work. For details, read the commits, or the "Done" section of [ROADMAP.md](ROADMAP.md).

Planned and unfinished work is in [ROADMAP.md](ROADMAP.md), not here.

**Who:** Ben (`ensonexthree-dot`, `benlew038` and the shared `XMUM Orientation` account), David (`David Yong`), Jiamin (`UJIAMIN`, `ujiamin0512`), Zichien (`yabgzichien`). "Agent" means a commit made by an AI coding agent (Claude or Cursor) under no teammate's name.
PR numbers are in brackets. Migration numbers are the files in `supabase/migrations/`.

---

## June 2026

### 2026-06-22
- Initial commit (David).

## July 2026

### 2026-07-01
- First version of the platform, "Starlight Revival": the full P0 feature set (Agent).

### 2026-07-08
- README update.

### 2026-07-09
- Game mechanics v2, renamed **Vortexa**: risk tiers for Day 2, blind boxes, 5-piece puzzles, a UI that can be rebranded (Agent).
- Vortexa mechanics merged with the polished UI. Login and mobile shell refined; bottom nav replaced by a top nav; responsive sidebar and phone menu; event-day UX for the core roles; Vortexa slogan on the login pages (David).
- Fix: `fn_day2_challenge` failed on a losing challenge (Agent).

### 2026-07-10
- Hardening: error boundaries, speed, accessibility, cleanup (Agent).

### 2026-07-12
- GM offline queue: failures are visible, and flushing is safe from races (Agent). [#3]
- Committee big-screen live leaderboard, `/bigscreen` (Agent).
- Blind box tokens stored as a hash only, with a QR that rotates on demand (Agent).
- Vercel Speed Insights (David).

### 2026-07-13
- Faster move from login to the dashboard (Agent). [#6]

### 2026-07-18
- Remaining optimisation work merged. [#5]

### 2026-07-27
- Design system rebuilt on brand colour tokens with Radix and Lucide parts (David). [#4]

### 2026-07-28
- Visual language redesign: spec, dense form layout pattern, token plan (David).
- "War room" renamed "Control room". Fix: the blind box kill-switch did nothing (David).

## August 2026

### 2026-08-03
- `AdminWarRoomPage` renamed `AdminControlRoomPage`; Lucide nav icons instead of two-letter monograms (David).
- Phone menu, touch animations and plain wording on the Freshie pass (David).
- One set of entry points per system; test account seed script with `xmu.edu.my` demo logins (David).
- Login page redesign: quick demo buttons, show-password toggle (David).

## September 2026

### 2026-09-01
- Registration counter and attendance (Jiamin). [#9]
- Fixes: dashboard redirect loop, env vars trimmed, roster lint error (Jiamin).
- Token system: one token system, live scoreboard, custom presets, audit log (Jiamin).

### 2026-09-02
- Migrations `0012` and `0013`: token tables, scoreboard, RLS and grants, `fn_set_total_groups`. Ten groups by default (Jiamin). [#11]
- Registration counter: create, read, edit, reassign and delete Freshies (Jiamin).

### 2026-09-03
- Token system function fix (Jiamin). [#12]

### 2026-09-18
- "Enter the Park" cinematic 3D prototype on `/park` (Agent).
- `/` becomes the public cinematic Orientation home page with the NEXUS '26 content: plays once, one continuous page (Agent).

### 2026-09-19
- Vortexa cinematic home page v1 finished (David).

### 2026-09-29
- "Night Ticket" home page redesign and a web QR scanner UI (Ben).
- Mobile menu: blurred backdrop and scroll lock (David).

### 2026-09-30
- Role permission matrix, `docs/permission-matrix.md` (Ben).
- Welcome page: SEO, wording, pre-event states, CTA paths, empty states; no public scan (David).
- Vortexa-styled Freshie Home with a bottom tab bar (Ben).
- Welcome Phase 2, neon login, D-day demos, Freshie dashboard (David).

## October 2026

### 2026-10-01
- Freshie mobile UX: adaptive bottom nav, wristband pass, touch effects and a holographic sheen (David).
- Security: signed, expiring group pass; `/group` middleware tightened (David).

### 2026-10-02
- Freshie Home: the night-ticket Home inside David's shell; `/dashboard` becomes a day-of hub; account button instead of the menu drawer (Agent).

### 2026-10-03
- Welcome page redesign: Vortexa shimmer, logo in the Freshie header, both login buttons in the phone menu and desktop header, halfway snap between sections, Scoreboard and Schedule centred (Ben, Agent). [#16]
- `docs/ROADMAP.md` started: the `bonding-session` summary and merge warnings, the decision that Freshies log in, the Done log, the group name and slogan task (Ben).
- Freshie group login, group colours, Admin schedule editor (Jiamin). [#17]
- A Freshie group-password login was added and then reverted (Agent, David).

### 2026-10-04
- Faci shares the Freshie night home and live scoreboard; Faci Home checklist (rows open on tap); attendance removed from the nav (Jiamin).
- Admin: Freshie control (groups, sessions, headcount, reset), a redesigned Admin area, full user management (Jiamin). [#20]
- Google sign-up needs approval; HOF and HOGM roles allowed; Google logo on the button (Jiamin). [#21]
- Freshie Home: one welcome line; SiteNav's Freshie login goes to `/login/freshie` (Agent).

### 2026-10-05
- Home: one continuous night-to-city background; the ferris wheel stays on screen at every width; organiser and sponsor logos (Ben).
- Freshie Home: a scrolling sky lit in the group's colour (Ben).
- Fix: each `useConfig` realtime channel gets a unique name (Ben).

### 2026-10-06
- Admin: the real error shows when creating a user fails; FAQ entries filtered by role (Jiamin). [#22]
- Welcome: glows fade into Overview, more stars (Ben). [#23]
- Items page with puzzle keys and the blind box unlock flow, on sample data; projector places hidden until the map unlocks (Ben). [#24]
- One Vortexa event UI for staff dashboards; invite link removed from login; one password recovery design; one "Join the Game" CTA; demo logins hidden in production; Committee, Faci and GM pages on the dark design (David).
- Fix: white bands around the dark pages on iOS Safari (Agent).

### 2026-10-07
- Token rules in one panel; read-only staff scoreboard (Jiamin).
- Stations belong to a day, and the GM page follows the day (Jiamin).
- Live control runs the event from the schedule; games get a timer (Jiamin).
- Schedule: planned times, one date per day, drag to reorder (Jiamin).
- Headcount: one live table of every group per session, columns follow the schedule (Jiamin).
- Google sign-in moved under Sign in, role picker removed (Jiamin).
- Merged: iOS Safari fix, login CTA, Committee/Faci/GM pages. [#26] [#27] [#28]

### 2026-10-09
- Blind boxes integrated: opening animation and poster (Jiamin). [#29]
- Map: the illustrated campus map and automatic Faci GPS tracking; map migrations renumbered `0059`–`0064` (Zichien).

### 2026-10-12
- Station assignment update (Jiamin).

### 2026-10-13
- Faci assignment and headcount update (Jiamin).
- Freshie Home back on the Vortexa scroll design, with a "Your Facilitator" stop (Ben). [#30]
- Faci Home on the Vortexa scroll design, with profile editing; the Vortexa logo intro on opening the site and after login (Ben). [#31]
- Tab bar fixed on iPad and iPhone; no blank band under it in iPad Chrome; top text nav instead of the sidebar on landscape tablets and desktops (Ben).
- Items page on live data: tokens and puzzle pieces (Ben).
- Faci profiles linked to the backend (migration `0069`); blind box fixes and buy flow (Jiamin). [#32] [#33]

### 2026-10-14
- HOF, HOGM and Committee get the Vortexa home, tab bar and Welcome colours (Ben). [#34]
- HOGM: Game control on the Ops page (migrations `0071`, `0072`), Scores with each group's tokens and keys, the night Schedule (Ben).
- Manual location update (Jiamin). [#35]
- HOGM can read station Game Masters (migration `0079`); HOGM Ops nav, blind box stop on Home, map restyle (Ben). [#36]
- HOF: Faci control on Ops, station board on the map, HOGM's Scores and Schedule (Ben). [#37]
- NFC: Vortexa park animation on activation, Admin NFC test mode, smoother projector ignition, safe deletion of unused cards (migration `0086`) (David). [#38]
- Map: several Facis per group pin, Lightbulbs view, Day 2 badges, better GPS fit; Admin accuracy check; location every 20 s (Zichien).

### 2026-10-15
- 3D campus map draft: true-scale track and courts, buildings laid out from OpenStreetMap, the Tan Kah Kee statue and one XMUM flag (Ben). [#39]
- A3 redesigned from a photo (two-tier Chinese roof); detailed A5 with its entrance facing the track (Ben).
- `CampusScene` can be embedded, with a lite mode for phones; `CampusMap` split into a data hook, panels and a 2D view (Ben).

### 2026-10-16
- The 3D map on `/map`, `/checkin` and `/committee`, with 2D as the fallback; draws only on demand, falls back on slow devices, no dark bands on phones (Ben). [#40] [#41]
- The Vortexa Funfair on the map, zone by zone: Central, West (Neon Pier) and the VORTEXA gate, East (Big Top) (Ben). [#42] [#43] [#44] [#45]
- Admin and HOGM choose which keys power each funfair zone (migration `0088`) (Ben). [#46]
- LakeFront Café becomes the lake stage: evening lighting, sweeping beams, the concert (Ben).

### 2026-10-17
- The lake stage's concert plays at the funfair's finale; the old LakeFront dome deleted (Ben). [#47]
- Funfair changes reach every map in about 10 s, group locations in 15 s (Ben).
- Lawn and outlined walkways on the 3D map (Ben).

### 2026-10-18
- East funfair rides on their dorms' real middles, and a midway instead of filler trees (Ben). [#48]

### 2026-10-19
- Freshie and Faci map in the night look, with group locations (Ben). [#49]
- The lake stage stays dark until the funfair's finale (Ben).
- HOF and HOGM Ops page update; blind box code link fix (Jiamin). [#50]
- NFC activation connected to the 3D funfair reveal; the Vortexa logo intro plays once per tab (David). [#52]

### 2026-10-20
- GM pages in the Welcome page look (Ben). [#53]
  - Day 2 on the Station page in three steps: Check, Play, Submit. The game sets the station status.
  - Admin sets the undo window; the GM confirms what Undo reverses (migration `0093`).
  - Day 1 rewards ask before giving tokens; the GM can open a closed station.
  - Scores shows each group's puzzle piece counts.
  - GM and Guardian GM no longer hold blind boxes in the app.
- Blind box work merged (Jiamin). [#51]

### 2026-10-21
- B1 modelled on the real building; the roads round B1 join up, in Ben's route colours (Ben). [#54]
- The A-row on raised ground with steps, grey paving in front, the statue in its round flower bed, the planting; A3 moved 15 m toward the statue (Ben).
- Station check-in only for Game Masters, removed from Faci (Zichien).

### 2026-10-22
- Blind box: Spot box, no station boxes, Restore only; Admin's blind box page as steps; buy page in the group's colour with the poster (migration `0100`) (Jiamin). [#55]
- Big screen removed; scoreboards list Group 1 to 10 (Jiamin).
- Group QR never changes; Admin can give one group, or all groups, a new password (migration `0099`) (Jiamin).
- Admin's funfair card moved from Live control to a Game tab (Jiamin).
- Projectors: places set by Admin and HOGM; the picture and place are a group's reward; which group lit one is hidden; wording "projector" and "lit" (migrations `0096`–`0098`) (Ben).
- Funfair zones carry their key's code name on the 3D map (Ben).
- Ops: one look for HOF, Committee, Admin and HOGM; HOGM's Log table; a group's Recent changes on the Faci & Status tab; the running game as a pill in the bar; Stations by day (Ben).
- Map: no check-in on the map; one Group locations list; a Day 2 game shows on the maps; every role sees every group (migration `0108_group_positions_everyone`, first numbered 0101) (Ben). One station badge per building, last seen at a building (Zichien).
- Folding cards animate; Home says "Tokens" (Ben).
- Blind box: the Vortexa Unlock card and the bought receipt (Ben).
- 3D map tennis T1a: players, a looping rally and a TV broadcast view on `/map3d?tennis=demo` (Ben).
- Field fixes and opt-in staff location sharing (David).

### 2026-10-23
- Faster Faci Group Code loading, reusing the QR link (David). [#58]
- Staff location sharing moved to migration `0103_staff_location_sharing`, keeping `0102` for Jiamin (David). [#57]
- NFC and map activation merged (David). [#56]

### 2026-10-24
- Admin map in the Ops style; the default 3D view looks from the A-row toward the funfair (David). [#59]
- Projector activation: the gathering-magic focal point centred on screen (David).

### 2026-10-25
- Profile navigation fix; Committee sees the Overview read only (migration `0104`); Committee test account uses the `cmt` email (David).
- Games start themselves at their planned time (migration `0101_game_autostart`); no more Pause; HOGM Tokens tab (Jiamin).
- Day 2 inner schedule, Admin only (migration `0102`) (Jiamin).
- Admin Game master on Live control: give tokens, puzzle pieces and blind boxes (migration `0107_admin_game_master`, first numbered 0103) (Jiamin). [#60]
- Admin and HOGM can pick a group and light a key for it, with no card tap (migration `0105`); Admin can reset the whole funfair (migration `0106`) (Jiamin). [#61]
- One blind box QR per box type (Jiamin). [#62]
