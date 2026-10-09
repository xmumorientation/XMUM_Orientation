-- FAQ entries can be limited to some roles. An empty `roles` array means the
-- entry is for everyone. Admin always sees every entry.

alter table public.faq_items
  add column if not exists roles public.user_role[] not null default '{}';

drop policy if exists "all read faq" on public.faq_items;
create policy "read faq by role" on public.faq_items
  for select using (
    auth.uid() is not null
    and (
      cardinality(roles) = 0
      or public.is_admin()
      or public.my_role() = any (roles)
    )
  );

-- Starter entries based on the current system. Edit or delete them on
-- Admin → Settings → FAQ. Each one is added only if its question is missing.
insert into public.faq_items (category, question, answer, sort_order, roles)
select v.category, v.question, v.answer, v.sort_order, v.roles::public.user_role[]
from (values
  ('General', 'How do I log in?',
   'Use the account your organiser gave you. If you cannot log in, ask your Facilitator or the Committee to reset your password.', 0, '{}'),
  ('General', 'Where can I see the schedule and the campus map?',
   'Open Schedule and Map from the menu. The map also shows which game stations are open, busy or closed.', 1, '{}'),
  ('General', 'What is the phase timer on the dashboard?',
   'It shows the current phase of the orientation game. The organisers start, pause and end each phase.', 2, '{}'),
  ('Game', 'What are tokens?',
   'Tokens belong to your group, not to you. Your group earns them at stations and spends them to enter Day 2 challenges. The Token Balance card on the dashboard shows your group''s total.', 0, '{freshie,faci}'),
  ('Game', 'How do I collect puzzle pieces?',
   'Win a Day 2 challenge at a station and the Game Master gives your group a piece. Open Inventory to see which pieces your group owns.', 1, '{freshie,faci}'),
  ('Game', 'How do I open a blind box?',
   'Scan the blind box QR code from the Scan page. Each code works once.', 2, '{freshie}'),
  ('Game', 'How do I use the NFC card at a Lighting Zone?',
   'During the Endgame phase, tap the NFC card with your phone on the Activate page. Your account must belong to a group.', 3, '{freshie,faci}'),
  ('Facilitators', 'How do I mark my group''s attendance?',
   'Open Attendance, choose the open session and mark each Freshie present or absent. If names are missing, use the headcount entry instead.', 0, '{faci}'),
  ('Facilitators', 'How do I set my group''s name and slogan?',
   'Use the checklist on your home page. The group number stays the same.', 1, '{faci}'),
  ('Facilitators', 'How does my group''s location show on the map?',
   'Your phone reports it automatically. If GPS is off, use manual location check-in.', 2, '{faci}'),
  ('Game Masters', 'How do I record a Day 1 result?',
   'Open the Station Panel, choose the groups, record the winner and loser, and confirm. The rewards come from the game config.', 0, '{gm,guardian_gm,hogm}'),
  ('Game Masters', 'How do I run a Day 2 challenge?',
   'In the Station Panel, charge the group''s entry fee, then record win or lose. A win gives the group a piece it does not own yet.', 1, '{gm,guardian_gm,hogm}'),
  ('Game Masters', 'How do I change my station status?',
   'Use the status buttons in the Station Panel (available, in progress, closed). You can only change your own station.', 2, '{gm,guardian_gm,hogm}'),
  ('Game Masters', 'I charged the wrong group. Can I undo it?',
   'Undo your own last token transaction within 2 minutes. After that, ask an Admin to correct it.', 3, '{gm,guardian_gm,hogm}'),
  ('Guardian', 'How do I redeem a puzzle set?',
   'Open the Guardian page from the dashboard card, look up the group, and redeem the set once it has all pieces.', 0, '{guardian_gm}'),
  ('Committee', 'Where can I see every group''s balance and attendance?',
   'Open Committee Operations. It shows group balances and the attendance overview for all groups.', 0, '{committee,hof,hogm}'),
  ('Admin', 'How do I add a user?',
   'Go to Admin → Users and click Add. Pick a staff role. A password is created and shown once, so copy it before you close the box.', 0, '{admin}'),
  ('Admin', 'How do I limit a FAQ entry to some roles?',
   'When you add or edit an entry, tick the roles that should see it. Leave all unticked to show it to everyone.', 1, '{admin}')
) as v(category, question, answer, sort_order, roles)
where not exists (
  select 1 from public.faq_items f where f.question = v.question
);
