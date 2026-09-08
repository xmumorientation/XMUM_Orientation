-- Section 2: authentication policy and centralized role permissions.

create table public.role_permissions (
  role        public.user_role not null,
  permission  text not null,
  created_at  timestamptz not null default now(),
  primary key (role, permission),
  check (role in ('freshie', 'faci', 'gm', 'admin'))
);

insert into public.role_permissions (role, permission) values
  ('faci', 'dashboard.view'),
  ('faci', 'inventory.view'),
  ('faci', 'map.view'),
  ('faci', 'map.update'),
  ('faci', 'lighting.view'),
  ('faci', 'timer.view'),
  ('faci', 'group.resources.view'),
  ('faci', 'blindbox.claim'),
  ('faci', 'blindbox.open'),
  ('faci', 'nfc.scan'),
  ('faci', 'attendance.manage'),
  ('faci', 'token.view'),

  ('gm', 'dashboard.view'),
  ('gm', 'gameplay.day1'),
  ('gm', 'gameplay.day2'),
  ('gm', 'gameplay.puzzle_verify'),
  ('gm', 'lighting.view'),
  ('gm', 'timer.view'),
  ('gm', 'token.view'),
  ('gm', 'token.play'),

  ('admin', 'dashboard.view'),
  ('admin', 'admin.access'),
  ('admin', 'operations.manage'),
  ('admin', 'accounts.manage'),
  ('admin', 'allocation.manage'),
  ('admin', 'configuration.manage'),
  ('admin', 'timer.manage'),
  ('admin', 'logs.token'),
  ('admin', 'logs.puzzle'),
  ('admin', 'logs.blindbox'),
  ('admin', 'logs.nfc'),
  ('admin', 'logs.game'),
  ('admin', 'logs.audit'),
  ('admin', 'corrections.manage'),
  ('admin', 'nfc.recovery'),
  ('admin', 'map.view'),
  ('admin', 'lighting.view'),
  ('admin', 'timer.view')
  ,('admin', 'token.view')
  ,('admin', 'token.manage')
on conflict do nothing;

alter table public.role_permissions enable row level security;
create policy "authenticated reads role permissions" on public.role_permissions
  for select using (auth.uid() is not null);

create or replace function public.has_permission(p_permission text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.role_permissions
    where role = public.my_role() and permission = p_permission
  );
$$;

create or replace function public.my_station_id(p_day smallint default null)
returns integer
language sql stable security definer set search_path = public
as $$
  select station_id
  from public.gm_station_assignments
  where user_id = auth.uid()
    and day = coalesce(p_day, public.current_game_day());
$$;

-- Existing gameplay RPCs still read profiles.station_id while their dedicated
-- sections are migrated. Keep that compatibility field synchronized to the
-- active/paused day so those RPCs enforce the correct daily assignment now.
create or replace function public.sync_current_gm_stations()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_day smallint := public.current_game_day();
begin
  if v_day is not null then
    update public.profiles p
       set station_id = gsa.station_id
      from public.gm_station_assignments gsa
     where p.id = gsa.user_id and p.role = 'gm'
       and gsa.day = v_day
       and p.station_id is distinct from gsa.station_id;
    update public.profiles p
       set station_id = null
     where p.role = 'gm'
       and not exists (
         select 1 from public.gm_station_assignments gsa
         where gsa.user_id = p.id and gsa.day = v_day
       )
       and p.station_id is not null;
  end if;
  return null;
end;
$$;

drop trigger if exists sync_gm_station_on_phase on public.phases;
create trigger sync_gm_station_on_phase
  after insert or update of state on public.phases
  for each statement execute function public.sync_current_gm_stations();

drop trigger if exists sync_gm_station_on_assignment on public.gm_station_assignments;
create trigger sync_gm_station_on_assignment
  after insert or update or delete on public.gm_station_assignments
  for each statement execute function public.sync_current_gm_stations();

-- Replace the Section 1 resolver so every layer consumes the same permission
-- source. DROP is required because PostgreSQL cannot replace a return shape.
drop function public.fn_current_user_context();
create function public.fn_current_user_context()
returns table (
  user_id uuid,
  role public.user_role,
  group_id integer,
  station_id integer,
  day smallint,
  admin_team text,
  permissions text[]
)
language sql stable security definer set search_path = public
as $$
  select
    p.id,
    p.role,
    uga.group_id,
    gsa.station_id,
    public.current_game_day(),
    p.admin_team,
    coalesce(
      (select array_agg(rp.permission order by rp.permission)
       from public.role_permissions rp where rp.role = p.role),
      array[]::text[]
    )
  from public.profiles p
  left join public.user_group_assignments uga on uga.user_id = p.id
  left join public.gm_station_assignments gsa
    on gsa.user_id = p.id and gsa.day = public.current_game_day()
  where p.id = auth.uid()
    and p.role in ('freshie', 'faci', 'gm', 'admin');
$$;

-- Freshie registration uses the dedicated roster/counter workflow. Only
-- Faci, GM, and Admin are authentication accounts.
insert into public.game_config (key, value) values
  ('freshie_registration_mode', '"counter_roster"'::jsonb),
  ('staff_registration_mode', '"admin_invite"'::jsonb)
on conflict (key) do nothing;

-- Auth users must be provisioned by Admin with an explicit staff role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role public.user_role;
begin
  if new.raw_app_meta_data ->> 'role' is null then
    raise exception 'STAFF_INVITE_REQUIRED';
  end if;
  v_role := (new.raw_app_meta_data ->> 'role')::public.user_role;
  if v_role not in ('faci', 'gm', 'admin') then
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

create index if not exists audit_log_auth_action_idx
  on public.audit_log(action, created_at desc)
  where action in ('auth.login', 'auth.logout', 'auth.login_failed', 'auth.register');
