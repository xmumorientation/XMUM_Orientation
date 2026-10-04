-- The user_role enum already includes hof and hogm. A later check on
-- profiles only allowed freshie, faci, gm, and admin, so saving HOF or HOGM
-- failed. Drop that check. guardian_gm and committee are allowed again too.

alter table public.profiles
  drop constraint if exists profiles_role_four_allowed;
