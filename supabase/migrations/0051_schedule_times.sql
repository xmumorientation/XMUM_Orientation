-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0051: starting times for the schedule
--
-- Suggested planned times (event local time, +08:00) for the current
-- schedule items, matched by day and title, so the Welcome page countdown
-- can follow the day. Edit any of them on the Schedule page afterwards.
-- Items not listed here keep their times. Order follows the times.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.schedule_days (day_label, day_date) values
  ('Day 1', '2026-11-28'),
  ('Day 2', '2026-11-29')
on conflict (day_label) do nothing;

with t (day_label, title, starts, ends, sort_order) as (
  values
    -- Day 1 · Sat 28 Nov
    ('Day 1', 'Registration & Check-in',    '2026-11-28 08:00+08', '2026-11-28 09:00+08', 0),
    ('Day 1', 'Opening Ceremony',           '2026-11-28 09:00+08', '2026-11-28 10:00+08', 1),
    ('Day 1', 'Ice-Breaking Activities',    '2026-11-28 10:00+08', '2026-11-28 11:30+08', 2),
    ('Day 1', 'Team Formation & Briefing',  '2026-11-28 11:30+08', '2026-11-28 12:30+08', 3),
    ('Day 1', 'Day 1 Game',                 '2026-11-28 14:00+08', '2026-11-28 16:30+08', 4),
    ('Day 1', 'Dinner',                     '2026-11-28 18:00+08', '2026-11-28 19:30+08', 5),
    -- Day 2 · Sun 29 Nov
    ('Day 2', 'Morning Assembly',           '2026-11-29 08:30+08', '2026-11-29 09:00+08', 0),
    ('Day 2', 'Game Stations Begin',        '2026-11-29 09:00+08', '2026-11-29 09:30+08', 1),
    ('Day 2', 'Day 2 Game',                 '2026-11-29 09:30+08', '2026-11-29 12:00+08', 2),
    ('Day 2', 'Lunch Break',                '2026-11-29 12:00+08', '2026-11-29 13:00+08', 3),
    ('Day 2', 'Final Challenge',            '2026-11-29 13:00+08', '2026-11-29 14:30+08', 4),
    ('Day 2', 'Closing Ceremony & Awards',  '2026-11-29 15:00+08', '2026-11-29 16:30+08', 5)
)
update public.schedule_items s
   set starts_at  = t.starts::timestamptz,
       ends_at    = t.ends::timestamptz,
       time_label = to_char(t.starts::timestamptz at time zone 'Asia/Kuala_Lumpur', 'HH24:MI')
                    || ' – ' ||
                    to_char(t.ends::timestamptz at time zone 'Asia/Kuala_Lumpur', 'HH24:MI'),
       sort_order = t.sort_order
  from t
 where s.day_label = t.day_label and s.title = t.title;
