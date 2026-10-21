-- Admin → Freshies "New password": after a group's password changes, every
-- phone signed in to that group is signed out (the old password may have
-- leaked). Deleting the sessions ends them: refresh tokens go with them, and
-- the auth server refuses an access token whose session is gone.
-- Called only by /api/admin/group-logins with the service role.

create or replace function public.fn_end_user_sessions(p_user_id uuid)
returns void
language sql
security definer
set search_path = auth, public
as $$
  delete from auth.sessions where user_id = p_user_id;
$$;

revoke all on function public.fn_end_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.fn_end_user_sessions(uuid) to service_role;
