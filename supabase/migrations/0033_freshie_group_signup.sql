-- The live signup trigger only accepts staff roles, so a shared Freshie
-- account cannot be created. Freshie is added to that allow-list. A signup
-- with no role still fails, which keeps public registration closed.
-- app_metadata.role is set by the service role, not by the visitor.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  if new.raw_app_meta_data ->> 'role' is null then
    raise exception 'STAFF_INVITE_REQUIRED';
  end if;
  v_role := (new.raw_app_meta_data ->> 'role')::public.user_role;
  if v_role not in ('faci', 'gm', 'admin', 'freshie') then
    raise exception 'INVALID_ROLE';
  end if;

  insert into public.profiles
    (id, role, full_name, student_id, email, phone, username)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'student_id',
    new.email,
    new.raw_user_meta_data ->> 'phone',
    nullif(new.raw_user_meta_data ->> 'username', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
