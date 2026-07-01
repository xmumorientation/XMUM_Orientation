# Setup Guide — XMUM Orientation Platform

Follow these steps once you have access to the team's Supabase project.

## 1. Supabase project

1. Open the Supabase Dashboard → your project.
2. Go to **SQL Editor** and run the four migration files **in order**:
   1. `supabase/migrations/0001_schema.sql` — tables, enums, triggers
   2. `supabase/migrations/0002_rls.sql` — row-level security policies
   3. `supabase/migrations/0003_functions.sql` — game logic RPCs
   4. `supabase/migrations/0004_seed.sql` — groups, stations, items, pools
3. **Auth settings** (Dashboard → Authentication):
   - Providers → Email: enabled. Decide on email confirmation
     (recommended ON for production; OFF speeds up testing).
   - Sessions: set JWT expiry so sessions last ≥48h across both game days
     (FR-1.4) — e.g. access token 1h with refresh tokens enabled (default
     behaviour covers this).
   - URL configuration: add your Vercel domain to Site URL + redirect URLs
     (needed for password-reset links).
4. **Realtime**: migration 0001 already adds the tables to the
   `supabase_realtime` publication. Verify under Database → Replication.

## 2. Environment variables

```bash
cp .env.example .env.local
```

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → service_role (**server only — never expose**) |
| `NFC_TOKEN_SECRET` | `openssl rand -hex 32` — keep stable once stickers are written! |
| `NEXT_PUBLIC_SITE_URL` | Your production URL (used inside NFC sticker URLs) |

> ⚠️ **NFC_TOKEN_SECRET must not change after stickers are written** —
> a rotated secret invalidates every sticker in the field.
> ⚠️ Set `NEXT_PUBLIC_SITE_URL` to the final production domain *before*
> minting sticker tokens.

On Vercel, add the same variables under Project → Settings →
Environment Variables.

## 3. First admin account

1. Run the app (`npm run dev`), register a normal account via `/register`
   (any email pattern works only for `@xmu.edu.my` — for your own admin
   account, temporarily register with an XMUM address or insert via SQL).
2. Promote it in the SQL editor:

```sql
update public.profiles set role = 'admin' where email = 'you@xmu.edu.my';
```

3. Log out and back in. The Admin tab appears.

## 4. Staff import (FR-1.1)

Admin → Users → paste CSV:

```csv
name,email,role,group,station
Alice Tan,alice@xmu.edu.my,faci,1,
Bob Lim,bob@xmu.edu.my,gm,,3
Carol Ng,carol@xmu.edu.my,guardian_gm,,7
Dave Ho,dave@xmu.edu.my,hof,,
```

Always **Dry run** first; then **Import**. Generated passwords are shown
exactly once — export and distribute them centrally.

## 5. NFC stickers (FR-9.x)

1. Deploy to production first (URLs embed the domain).
2. Admin → NFC → pick projector location → generate tokens
   (3–5 per projector including spares).
3. Write each URL to a physical NTAG213/215 sticker using the
   **NFC Tools** Android app → Write → Add a record → URL.
4. Test on ≥3 iPhones (XS or later; background tag reading) and
   ≥3 Androids before D-day (NFR-3).

## 6. Rehearsal / testing mode

Admin → War room → **Rehearsal mode ON** bypasses phase gating so you can
test token deductions and NFC activation outside Endgame. Turn it OFF for
the real event.

## 7. D-day runbook pointers

- Kill-switches (freeze tokens / disable gacha / disable NFC) are in
  Admin → War room, each independent (FR-11.5).
- Phase control (start/pause/extend Day 1, Day 2, Endgame) same page.
- Audit log: Admin → Audit. HOF/HOGM also have read access via API.
- Supabase Pro upgrade for November (proposal §8): Dashboard → Billing.
