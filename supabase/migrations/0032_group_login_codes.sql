-- One shared Freshie login per group. The 4-digit code is the secret.
-- Clients that select groups with * must not receive it, so it lives in its
-- own table. Only admin can read the codes. The login page never reads them:
-- it tries the code the Freshie typed.

create table if not exists public.group_login_codes (
  group_id integer primary key references public.groups (id) on delete cascade,
  code text not null check (code ~ '^\d{4}$'),
  auth_user_id uuid not null,
  unique (code)
);

alter table public.group_login_codes enable row level security;

drop policy if exists "admin reads group logins" on public.group_login_codes;
create policy "admin reads group logins" on public.group_login_codes
  for select using (public.is_admin());

-- Names only, so the public Freshie login page can fill the group dropdown.
create or replace function public.fn_list_freshie_groups()
returns table (id integer, name text)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.name from public.groups g order by g.id;
$$;

revoke all on function public.fn_list_freshie_groups() from public;
grant execute on function public.fn_list_freshie_groups() to anon, authenticated;
