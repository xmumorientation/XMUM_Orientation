-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0081: HOF and Committee read the group passwords
--
-- Ops (/committee) has a Freshies tab for HOF and Committee: each group's
-- number, colour, name, slogan and 4-digit password, so they can help a group
-- that forgot it. Until now only Admin could read group_login_codes (0032).
-- Read only: creating or changing passwords stays Admin only.
-- ═══════════════════════════════════════════════════════════════════════

drop policy if exists "ops reads group logins" on public.group_login_codes;
create policy "ops reads group logins" on public.group_login_codes
  for select using (public.my_role() in ('hof', 'committee'));
