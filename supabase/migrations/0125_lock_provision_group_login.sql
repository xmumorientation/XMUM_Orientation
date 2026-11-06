-- fn_provision_group_login (0034) sets the password of any account by email
-- and is meant for the server only (/api/admin/group-logins, service role).
-- 0034 revoked it from `public` only. Supabase also grants every new function
-- in `public` to anon and authenticated directly, so both could still call it.
-- Applied by hand on the live database on 2026-11-06; this records it.
-- Rule for new security definer functions: revoke from public, anon,
-- authenticated (as 0099 does), then grant only to the roles that need it.

revoke all on function public.fn_provision_group_login(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.fn_provision_group_login(text, text, text, integer)
  to service_role;
