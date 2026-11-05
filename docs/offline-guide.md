# Offline Guide

## Scope

A public, read-only guide at `/offline.html`: timetable, existing campus reference map and recovery instructions. Linked from the Welcome menu and footer. The app registers `/sw.js`; its offline notice opens the guide in a new tab so a GM can keep the original submission page open.

## Before the Event

1. Open the site with internet access on each phone/browser that will be used.
2. Open **Offline Guide** and check that the guide and map are saved.
3. Choose **Update Saved Schedule** and check the saved date (Malaysia time).
4. Switch off Wi-Fi and mobile data, refresh and check the timetable and map. Reopen the site in a new tab too.
5. Restore connectivity, choose **Try Again** and check any pending/rejected results on the original GM page.

First-time visitors cannot load the site without a network. Private mode, storage restrictions, cleared site data or browser eviction can remove the guide. Save screenshots or printed references as a separate fallback.

## Network and Storage

- Nine guide assets are precached (about 430 KB total): the standalone page, styles, two scripts, labelled reference map, existing Vortexa logo, and Latin copies of the three existing Welcome fonts. No 3D model, signed-in HTML, personal information, scores or inventory are cached. Font provenance and licenses are in `public/offline-fonts/`.
- `/api/offline-guide` uses the anonymous Supabase client to select public timetable fields only, without cookies or a service key. It has a 60-second HTTP/CDN cache; successful snapshots show the response's timestamp, not the time an old copy is opened.
- Preparation requests a new snapshot when the saved one is at least 15 minutes old. There is no background polling. An explicit update bypasses the service-worker fallback. Failed updates retain the last successful snapshot.
- Ordinary navigations try the network first, falling back after network failure, an eight-second timeout, or gateway/unavailable responses. API requests, auth callbacks, external origins and non-GET requests are not replaced with a guide.
- Client-side Next.js navigation still depends on the network; use the offline notice's guide link when it fails.
- Game result queues remain owned by the existing GM implementation. This feature neither changes nor guarantees those queues. Live actions need connectivity.

## Updates and Verification

Bump `SHELL` in `public/sw.js` and its matching readiness check in `public/offline-setup.js` whenever changing a guide asset, including the map. To refresh the still image, start `npm run dev`, then run `node scripts/build-offline-map.mjs` (requires Playwright with Chromium and cwebp). It captures the dev-only `/map3d/offline-reference` surface, which renders the existing CampusScene using the same exported `fitCamera()` as the online map, without live data or station states. `OFFLINE_MAP_PLAYWRIGHT` may point to a separately installed Playwright module; `OFFLINE_MAP_BASE_URL` overrides the local origin. Ship only the resulting `public/campus-reference.webp`; the export route returns not-found in production. Installation caches the whole shell before activation; activation removes only this guide's obsolete caches. Keep the data cache name unless its schema changes. Never cache authenticated pages or generic API responses.

Automated boundary checks: `npx vitest run tests/offline/service-worker.test.ts`.

Physical-phone and venue Wi-Fi verification remains required before the event. Local browser tests are not venue evidence.

## Local Verification — 2026-11-05

Production build, typecheck, changed-file ESLint and four boundary tests passed. Chromium mobile (412×915) and desktop (1280×900) checks covered homepage auto-preparation, offline refresh, offline new tab, saved timetable/map, failed refresh retaining the saved timestamp, retry after reconnect and the app-wide notice. Verified cache contents contain only the nine public guide assets and public timetable snapshot. A fresh browser with no saved files cannot open the site while offline, as expected. The existing 2D-map image lint warning remains outside this change. No detector suppressions were added.

## Vortexa Visual Alignment — 2026-11-05

Matched the existing Welcome page and staff styling: actual Vortexa logo; Outfit, Alfa Slab One and JetBrains Mono; near-black surfaces, night-sky background, yellow primary action, cyan navigation, shared-style date picker, timeline cards and category tags. The guide has a three-item mobile bottom navigation and desktop section navigation. Staff help uses expandable sections. The app offline notice now uses the same night palette.

Reverified production build, four boundary tests, JavaScript syntax and clear design detector. Chromium checks covered 320px/412px widths and 1280px desktop, day switching with retained keyboard focus, local fonts before and after offline refresh, map, failed-update retention, new tab, retry and reconnect. No new dependencies or detector ignores were added. Physical-phone/venue verification and deployment remain pending.

## Concise Offline State — 2026-11-05

Removed the duplicated status panel, introductory paragraphs, repeated caveats and duplicate schedule action. The first screen now uses a Wi-Fi-off illustration, **You’re Offline**, one short explanation and **Try Again**. Timestamps retain a short stale-data warning; staff instructions are collapsed. Update feedback stays beside the timetable. The app banner is reduced to an icon, status and guide link.

Navigation fallback marks its saved HTML with `data-network-fallback`, without embedding the requested URL or any credentials. This lets the page distinguish a failed connection while `navigator.onLine` is true (**Connection Lost**) from an actual device-offline event (**You’re Offline**). On an online event it shows **Connection Detected**, not a claim of confirmed internet access. Shell version is v3; the public timetable data cache remains v1.

Production build and four boundary tests passed. Chromium checked actual offline and a simulated 503 while online, reconnect state, collapsed help, 320/412/1280px layouts, offline fonts/map, saved timetable, day-button focus, failed-update retention, new-tab fallback, retry and the shortened app banner. Detector clear; no ignores. Existing 2D-map image lint warning remains outside this change. Still local; physical-phone/venue testing remains pending.

## Map Direction and Technical Help — 2026-11-05

Replaced the old isometric illustration and its brown empty area with a static WebP captured from the existing 3D campus scene, using the online map's actual default camera. The A-row is in front and the lake/funfair behind, matching the online direction. The source map's camera behavior is unchanged; only its existing helper is exported for reuse. No live group, station or score data is in the image. The guide keeps visible OpenStreetMap attribution.

Added an always-visible help note directing GMs, Committee and Facilitators to the Technical Development Team for technical issues. The shell version is v4 so existing saved guides refresh the map.

Validation: changed-file ESLint, typecheck, production build, four offline boundary tests and the design detector passed. Chromium verified the 1600×1000 WebP loads after offline refresh, opens full-size, uses the v4 cache without the old SVG, and the Technical Development Team reminder is visible without expanding details. Layout checked at 320/412/765/1280px; local screenshots reviewed. Not deployed.

Copy refinement: the Technical Development Team reminder applies to everyone; the staff help heading is **Committees, FACIs and GMs**. Shell version v5 refreshes the saved wording.

Header refinement: removed the redundant Offline Guide badge, slightly increased the hero heading tracking and vertical gaps, and shortened the disconnected message to “You have no internet connection.” The online guide uses a conditional “No internet?” prompt instead of falsely reporting an active outage. Removed middle-dot separators from guide copy. Shell version v6.

## Release Checks — 2026-11-05

Full-suite baseline is origin/main `de2ad5c4`. The release was then rebased onto `84092f85` to retain the latest projector celebration update, with a fresh production build. Production build passed; the existing CampusMap2DView image lint warning remains. The full suite ran with its isolated local PostgreSQL databases: 392 passed, one failed. The failure in `tests/admin-ui/live-control.test.tsx` expects a button named `+5`, while the unchanged UI names it `+5mins`. Reproduced the identical failure on a clean origin/main copy; it is not introduced by this release. The four offline boundary tests pass.

Final Chromium checks on the production build passed: automatic preparation from Home, approved copy, offline refresh, saved timetable/map/fonts, failed refresh preserving the snapshot, new-tab fallback, reconnect/retry, app notice and public-only cache contents. Production deployment and public-origin checks are performed after push. Venue and real-phone checks remain outstanding.

### Rollback

If the guide interferes with navigation, publish a cleanup version at `/sw.js` that deletes only `vortexa-guide-*` caches and unregisters itself on activation; then revert the feature commit. Keep the worker URL available during rollback so returning clients can receive cleanup. Do not delete site storage or the GM result queue. A plain code revert alone does not remove an already installed service worker.
