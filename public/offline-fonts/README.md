# Offline Vortexa Fonts

Latin WOFF2 copies of the exact fonts already used by the public Welcome page (`src/components/home/fonts.ts`), extracted from its `next/font` production output on 2026-11-05:

- Outfit — body and controls; `outfit-latin.woff2` (variable weight).
- Alfa Slab One — headings; `alfa-slab-one-latin.woff2`.
- JetBrains Mono — dates, timetable and category labels; `jetbrains-mono-latin.woff2` (variable weight).

Each font's SIL Open Font License is included alongside it, obtained from its directory in https://github.com/google/fonts/tree/main/ofl . These files are unmodified font binaries. The page uses system fallbacks for characters outside the Latin subset.

When the Welcome fonts change, update these copies and their font-face declarations together, then bump the offline shell version. No runtime font CDN is required.
