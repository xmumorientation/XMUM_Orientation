-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0010: Freshie Registration & Group Load-Balancing
--
-- Real-time D-Day registration desk. Freshies have NO login accounts —
-- their data lives entirely in public.freshies, separate from
-- public.profiles (staff/committee/admin accounts). Group assignment
-- reuses the existing public.groups table.
--
-- Access is ADMIN-ONLY for now (RLS + every RPC checks public.is_admin()).
-- Loosen the single "admin manages freshies" policy later if desk
-- operators (faci/committee) need direct access.
-- ═══════════════════════════════════════════════════════════════════════

create type public.freshie_gender as enum ('Male', 'Female');
create type public.freshie_nationality as enum ('Local', 'International');

create table public.freshies (
  id           bigserial primary key,
  full_name    text not null,
  phone        text,
  gender       public.freshie_gender not null,
  nationality  public.freshie_nationality not null,
  student_id   text,
  group_id     integer references public.groups (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index freshies_group_idx on public.freshies (group_id);
create index freshies_created_idx on public.freshies (created_at desc);

alter table public.freshies enable row level security;

create policy "admin manages freshies" on public.freshies
  for all using (public.is_admin()) with check (public.is_admin());

-- ── Pre-event configuration: total number of groups ─────────────────────
-- Ensures Group 1..N exist in public.groups (idempotent — reuses any
-- already-named groups) and records the target in game_config so the
-- UI can compute "target average size per group".

create or replace function public.fn_set_freshie_group_count(p_count integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  i integer;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_count is null or p_count < 1 or p_count > 200 then
    raise exception 'INVALID_COUNT';
  end if;

  for i in 1..p_count loop
    insert into public.groups (name) values ('Group ' || i)
    on conflict (name) do nothing;
  end loop;

  insert into public.game_config (key, value, updated_by)
  values ('freshie_total_groups', to_jsonb(p_count), auth.uid())
  on conflict (key) do update set value = excluded.value,
    updated_by = excluded.updated_by, updated_at = now();

  perform public.audit('freshie.set_group_count', 'config:freshie_total_groups',
    jsonb_build_object('count', p_count));

  return jsonb_build_object('ok', true, 'count', p_count);
end;
$$;

-- ── Registration + automatic load-balancing assignment ───────────────────
-- Priority 1: lowest overall headcount.
-- Priority 2 (tiebreak only): the group among those tied that currently
-- has the fewest freshies of the registering freshie's gender.
-- Advisory-locked so concurrent desk submissions can't both read the same
-- "lowest headcount" snapshot and double-assign the same slot.

create or replace function public.fn_register_freshie(
  p_full_name text,
  p_phone text,
  p_gender public.freshie_gender,
  p_nationality public.freshie_nationality,
  p_student_id text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_group_id integer;
  v_group_name text;
  v_freshie_id bigint;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'NAME_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtext('freshie_assignment'));

  if not exists (select 1 from public.groups) then
    raise exception 'NO_GROUPS_CONFIGURED';
  end if;

  select g.id, g.name
    into v_group_id, v_group_name
    from public.groups g
    left join public.freshies f on f.group_id = g.id
   group by g.id, g.name
   order by
     count(f.id) asc,                                       -- Priority 1
     count(f.id) filter (where f.gender = p_gender) asc,     -- Priority 2
     g.id asc                                                -- deterministic
   limit 1;

  insert into public.freshies (full_name, phone, gender, nationality, student_id, group_id)
  values (
    trim(p_full_name),
    nullif(trim(coalesce(p_phone, '')), ''),
    p_gender,
    p_nationality,
    nullif(trim(coalesce(p_student_id, '')), ''),
    v_group_id
  )
  returning id into v_freshie_id;

  perform public.audit('freshie.register', 'freshie:' || v_freshie_id,
    jsonb_build_object('group_id', v_group_id, 'gender', p_gender, 'nationality', p_nationality));

  return jsonb_build_object(
    'ok', true,
    'freshie_id', v_freshie_id,
    'group_id', v_group_id,
    'group_name', v_group_name
  );
end;
$$;

-- ── Live per-group stats (headcount / gender / nationality splits) ──────

create or replace function public.fn_freshie_group_stats()
returns table (
  group_id integer,
  group_name text,
  headcount integer,
  male_count integer,
  female_count integer,
  local_count integer,
  international_count integer
)
language sql stable security definer set search_path = public
as $$
  select
    g.id,
    g.name,
    count(f.id)::integer,
    count(f.id) filter (where f.gender = 'Male')::integer,
    count(f.id) filter (where f.gender = 'Female')::integer,
    count(f.id) filter (where f.nationality = 'Local')::integer,
    count(f.id) filter (where f.nationality = 'International')::integer
  from public.groups g
  left join public.freshies f on f.group_id = g.id
  where public.is_admin()
  group by g.id, g.name
  order by g.id;
$$;

-- ── Manual admin override (soft-warning computed client-side) ───────────

create or replace function public.fn_admin_reassign_freshie(
  p_freshie_id bigint,
  p_new_group_id integer
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_old_group integer;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select group_id into v_old_group from public.freshies where id = p_freshie_id;
  if not found then
    raise exception 'FRESHIE_NOT_FOUND';
  end if;
  if not exists (select 1 from public.groups where id = p_new_group_id) then
    raise exception 'GROUP_NOT_FOUND';
  end if;

  update public.freshies set group_id = p_new_group_id where id = p_freshie_id;

  perform public.audit('freshie.reassign', 'freshie:' || p_freshie_id,
    jsonb_build_object('old_group_id', v_old_group, 'new_group_id', p_new_group_id));

  return jsonb_build_object('ok', true, 'old_group_id', v_old_group, 'new_group_id', p_new_group_id);
end;
$$;

-- ── Realtime ──────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.freshies;
