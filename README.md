# XMUM Orientation Platform 2026 — "Starlight Revival"

Unified web platform for XMUM Orientation 2026: main orientation website
(auth, roles, attendance, location tracking) + Big Game system (token
economy, inventory, gacha, puzzle verification, NFC projector activation,
live event control).

**Stack:** Next.js (App Router) + Tailwind CSS + Supabase (Postgres, Auth,
Realtime) · deployed on Vercel.

📄 See [`docs/SETUP.md`](docs/SETUP.md) for the full setup guide
(Supabase migrations, env vars, first admin, NFC stickers).

## Quick start

```bash
cp .env.example .env.local   # fill in Supabase keys + NFC secret
npm install
npm run dev
```

## Project layout

```
supabase/migrations/   SQL: schema → RLS → game RPCs → seed (run in order)
src/app/(auth)/        login / register / password reset
src/app/(app)/         authenticated app (role-gated by RLS + layout)
  dashboard/           role-aware home
  map/                 live campus map (stations, Day-2 projector layer)
  inventory/           puzzle sets & facility cards (Freshie)
  transactions/        token history (dispute prevention)
  attendance/          Faci roster marking + headcount fallback
  checkin/             manual location check-in + GPS auto-report
  gm/                  GM panel: tokens / items / gacha / station status
  guardian/            Guardian GM: puzzle verification + manual activation
  committee/           live ops map, attendance dashboard, register counter
  admin/               war room, users CSV import, gacha config, NFC, audit
src/app/activate/      NFC sticker landing page (signed one-time tokens)
src/app/api/           server routes (service-role: user import, NFC mint)
src/components/        shared UI (map, timer, gacha/victory animations)
src/lib/               supabase clients, types, NFC signing, utils
```

## Core principles

- **Server-authoritative:** every token mutation, gacha roll, grant and
  activation is a Postgres RPC with role checks, atomicity, idempotency
  keys and audit logging. The client never computes outcomes.
- **RLS everywhere:** UI hiding is presentation only; Postgres row-level
  security is the real permission boundary.
- **No Web NFC:** stickers carry plain NDEF URLs with signed one-time
  tokens — works on iOS (background tag read) and Android alike.
- **Everything configurable:** stations, gacha weights, phases and
  kill-switches are editable live from the Admin console — no redeploys
  on D-day.
