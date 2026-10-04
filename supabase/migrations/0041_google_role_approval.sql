-- Drop the per-person freshies roster. Group login (4-digit codes, groups,
-- profiles) is untouched. Headcount stays on attendance_headcounts.

drop function if exists public.fn_mark_attendance(integer, bigint, public.attendance_status);
drop function if exists public.fn_mark_attendance(integer, uuid, public.attendance_status);
drop function if exists public.fn_bulk_mark_present(integer, integer);
drop function if exists public.fn_register_freshie(text, text, public.freshie_gender, public.freshie_nationality, text);
drop function if exists public.fn_freshie_group_stats();
drop function if exists public.fn_admin_reassign_freshie(bigint, integer);
drop function if exists public.fn_admin_update_freshie(bigint, text, text, public.freshie_gender, public.freshie_nationality, text, integer);
drop function if exists public.fn_admin_delete_freshie(bigint);
drop function if exists public.fn_admin_update_freshie_unchecked(bigint, text, text, public.freshie_gender, public.freshie_nationality, text, integer);
drop function if exists public.fn_admin_delete_freshie_unchecked(bigint);

drop table if exists public.attendance_records cascade;
drop table if exists public.freshies cascade;
drop type if exists public.freshie_gender;
drop type if exists public.freshie_nationality;

-- Google sign-in stores a requested role and stays locked until an admin approves.
-- Existing rows default to approved so current accounts keep working.

alter table public.profiles
  add column if not exists approved boolean not null default true,
  add column if not exists requested_role public.user_role;

create or replace function public.my_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
    from public.profiles
   where id = auth.uid()
     and approved;
$$;

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
    insert into public.profiles
      (id, role, full_name, student_id, email, phone, username, approved)
    values (
      new.id,
      'freshie',
      coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        ''
      ),
      new.raw_user_meta_data ->> 'student_id',
      new.email,
      new.raw_user_meta_data ->> 'phone',
      nullif(new.raw_user_meta_data ->> 'username', ''),
      false
    )
    on conflict (id) do nothing;
    return new;
  end if;

  v_role := (new.raw_app_meta_data ->> 'role')::public.user_role;
  if v_role not in (
    'freshie', 'faci', 'gm', 'guardian_gm', 'hof', 'hogm', 'committee', 'admin'
  ) then
    raise exception 'INVALID_ROLE';
  end if;

  insert into public.profiles
    (id, role, full_name, student_id, email, phone, username, approved)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'student_id',
    new.email,
    new.raw_user_meta_data ->> 'phone',
    nullif(new.raw_user_meta_data ->> 'username', ''),
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- First request wins. An approved account ignores this.
create or replace function public.fn_set_requested_role(p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.profiles
     set requested_role = p_role
   where id = auth.uid()
     and approved = false
     and requested_role is null;
end;
$$;

revoke all on function public.fn_set_requested_role(public.user_role) from public;
grant execute on function public.fn_set_requested_role(public.user_role) to authenticated;

create or replace function public.fn_approve_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select requested_role into v_role
    from public.profiles
   where id = p_user_id
     and approved = false;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;
  if v_role is null then
    raise exception 'ROLE_REQUIRED';
  end if;

  update public.profiles
     set role = v_role,
         approved = true
   where id = p_user_id;

  update auth.users
     set raw_app_meta_data =
           coalesce(raw_app_meta_data, '{}'::jsonb)
           || jsonb_build_object('role', v_role::text)
   where id = p_user_id;

  perform public.audit(
    'users.approve',
    'user:' || p_user_id,
    jsonb_build_object('role', v_role)
  );
end;
$$;

revoke all on function public.fn_approve_account(uuid) from public;
grant execute on function public.fn_approve_account(uuid) to authenticated;
