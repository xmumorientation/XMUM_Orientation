-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0004: Seed data
-- All values are Admin-editable at runtime (SRS A-1: game design may still
-- change, so nothing is hardcoded in the app).
-- Station count/IDs pending OPEN DECISION D-2 — edit freely in Admin console.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Groups (8–10 groups; seeding 10) ─────────────────────────────────────

insert into public.groups (name) values
  ('Group 1'), ('Group 2'), ('Group 3'), ('Group 4'), ('Group 5'),
  ('Group 6'), ('Group 7'), ('Group 8'), ('Group 9'), ('Group 10');

-- ── Stations (12 GM groups → 12 stations across A4/A5/B1/Courts) ────────

insert into public.stations (code, name, area, map_x, map_y) values
  ('A4-1', 'Station A4-1', 'A4', 22, 30),
  ('A4-2', 'Station A4-2', 'A4', 30, 26),
  ('A4-3', 'Station A4-3', 'A4', 26, 38),
  ('A5-1', 'Station A5-1', 'A5', 48, 24),
  ('A5-2', 'Station A5-2', 'A5', 56, 30),
  ('A5-3', 'Station A5-3', 'A5', 52, 38),
  ('B1-1', 'Station B1-1', 'B1', 72, 48),
  ('B1-2', 'Station B1-2', 'B1', 78, 42),
  ('B1-3', 'Station B1-3', 'B1', 76, 56),
  ('CRT-1', 'Tennis Court', 'Courts', 30, 70),
  ('CRT-2', 'Volleyball Court 1', 'Courts', 42, 74),
  ('CRT-3', 'Volleyball Court 2', 'Courts', 52, 70);

-- ── Projectors (3 victory objectives) ────────────────────────────────────

insert into public.projectors (location, name, map_x, map_y) values
  ('B1', 'Projector — B1', 80, 50),
  ('A3', 'Projector — A3', 14, 22),
  ('TF', 'Projector — Track & Field', 68, 82);

-- ── Items ────────────────────────────────────────────────────────────────
-- 9 puzzle pieces: 3 per projector location.

insert into public.items (type, name, description, puzzle_location, puzzle_index) values
  ('puzzle', 'B1 Puzzle Piece 1', 'Fragment 1 of the B1 projector blueprint', 'B1', 1),
  ('puzzle', 'B1 Puzzle Piece 2', 'Fragment 2 of the B1 projector blueprint', 'B1', 2),
  ('puzzle', 'B1 Puzzle Piece 3', 'Fragment 3 of the B1 projector blueprint', 'B1', 3),
  ('puzzle', 'A3 Puzzle Piece 1', 'Fragment 1 of the A3 projector blueprint', 'A3', 1),
  ('puzzle', 'A3 Puzzle Piece 2', 'Fragment 2 of the A3 projector blueprint', 'A3', 2),
  ('puzzle', 'A3 Puzzle Piece 3', 'Fragment 3 of the A3 projector blueprint', 'A3', 3),
  ('puzzle', 'TF Puzzle Piece 1', 'Fragment 1 of the Track & Field projector blueprint', 'TF', 1),
  ('puzzle', 'TF Puzzle Piece 2', 'Fragment 2 of the Track & Field projector blueprint', 'TF', 2),
  ('puzzle', 'TF Puzzle Piece 3', 'Fragment 3 of the Track & Field projector blueprint', 'TF', 3);

-- 10 facility cards; exactly one hidden Gala Night card (FR-7.4).

insert into public.items (type, name, description, is_gala) values
  ('facility_card', 'Ferris Wheel',        'Theme park facility card', false),
  ('facility_card', 'Roller Coaster',      'Theme park facility card', false),
  ('facility_card', 'Carousel',            'Theme park facility card', false),
  ('facility_card', 'Haunted House',       'Theme park facility card', false),
  ('facility_card', 'Bumper Cars',         'Theme park facility card', false),
  ('facility_card', 'Water Slide',         'Theme park facility card', false),
  ('facility_card', 'Sky Drop Tower',      'Theme park facility card', false),
  ('facility_card', 'Mirror Maze',         'Theme park facility card', false),
  ('facility_card', 'Candy Pavilion',      'Theme park facility card', false),
  ('facility_card', 'Starlight Stage (Gala Night)', 'The hidden Gala Night card', true);

-- A clue card for Idea 2's first stage.
insert into public.items (type, name, description) values
  ('facility_card', 'Bounty Clue Card', 'Clue card revealing a bounty challenge');

-- ── Gacha pools (FR-7.1) ─────────────────────────────────────────────────

-- Idea 1: Bankruptcy Protection — HOGM/HOF triggered.
-- Payout = +2 tokens (bonus_tokens) + 1 random facility card from the
-- remaining pool of 10 (9 normal + 1 Gala; each qty 1).
insert into public.gacha_pools (key, name, description, cost_tokens, bonus_tokens, allowed_roles) values
  ('idea1', 'Bankruptcy Protection', 'HOGM/HOF special draw: +2 tokens and one facility card',
   0, 2, '{hogm,hof,admin}');

insert into public.gacha_pool_entries (pool_id, label, kind, item_id, weight, remaining)
select p.id, i.name, 'facility_card', i.id, 1, 1
  from public.gacha_pools p, public.items i
 where p.key = 'idea1' and i.type = 'facility_card' and i.name <> 'Bounty Clue Card';

-- Idea 2 stage 1: Bounty Hunter clue draw — GM triggered, costs 2 tokens.
insert into public.gacha_pools (key, name, description, cost_tokens, bonus_tokens, allowed_roles) values
  ('idea2_clue', 'Bounty Hunter — Clue Draw', 'Costs 2 tokens; yields a clue card',
   2, 0, '{gm,admin}');

insert into public.gacha_pool_entries (pool_id, label, kind, item_id, weight, remaining)
select p.id, 'Bounty Clue Card', 'clue', i.id, 1, null
  from public.gacha_pools p, public.items i
 where p.key = 'idea2_clue' and i.name = 'Bounty Clue Card';

-- Idea 2 stage 2: resource draw on challenge success.
-- 20% → 0 tokens · 70% → 2 tokens · 10% → 6 tokens (Admin-editable).
insert into public.gacha_pools (key, name, description, cost_tokens, bonus_tokens, allowed_roles) values
  ('idea2_resource', 'Bounty Hunter — Resource Draw', 'Drawn after challenge success',
   0, 0, '{gm,admin}');

insert into public.gacha_pool_entries (pool_id, label, kind, token_amount, weight, remaining)
select p.id, x.label, x.kind, x.amount, x.weight, null
  from public.gacha_pools p,
       (values ('Empty-handed…', 'nothing', 0, 20.0),
               ('2 Tokens',      'tokens',  2, 70.0),
               ('Jackpot! 6 Tokens', 'tokens', 6, 10.0)
       ) as x(label, kind, amount, weight)
 where p.key = 'idea2_resource';

-- ── Phases (FR-10.1) ─────────────────────────────────────────────────────

insert into public.phases (key, name, duration_minutes, is_endgame, sort_order) values
  ('day1',    'Day 1 Game',  150, false, 1),
  ('day2',    'Day 2 Game',  150, false, 2),
  ('endgame', 'Endgame',      30, true,  3);

-- ── Config defaults / kill-switches ──────────────────────────────────────

insert into public.game_config (key, value) values
  ('tokens_frozen',    'false'),       -- kill-switch: freeze all token mutations
  ('gacha_disabled',   'false'),       -- kill-switch: disable gacha
  ('nfc_disabled',     'false'),       -- kill-switch: disable NFC endpoint
  ('rehearsal_mode',   'false'),       -- bypass phase gating for testing (FR-10.3)
  ('gala_reveal_mode', '"hidden"'),    -- D-3: 'immediate' | 'hidden'
  ('day2_map_layer',   'false');       -- FR-4.3: admin toggles Day 2 projector layer

-- ═══════════════════════════════════════════════════════════════════════
-- BOOTSTRAP THE FIRST ADMIN
-- After you sign up your own account through the app, promote it:
--
--   update public.profiles set role = 'admin'
--    where email = 'you@example.com';
-- ═══════════════════════════════════════════════════════════════════════
