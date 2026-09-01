-- Migration 0011: Admin Attendance taking, Late status, Bulk marking, and Audit Logging

-- 1. Extend attendance_status enum to support 'late'
alter type public.attendance_status add value if not exists 'late';

-- 2. Extend attendance_sessions to support starts_at and ends_at (FR-C1)
alter table public.attendance_sessions add column if not exists starts_at timestamptz;
alter table public.attendance_sessions add column if not exists ends_at timestamptz;

-- Recreate attendance_records table with freshie_id referencing public.freshies(id)
drop table if exists public.attendance_records cascade;

create table public.attendance_records (
  id         bigserial primary key,
  session_id integer not null references public.attendance_sessions (id) on delete cascade,
  freshie_id bigint not null references public.freshies (id) on delete cascade,
  group_id   integer not null references public.groups (id) on delete cascade,
  status     public.attendance_status not null,
  marked_by  uuid references public.profiles (id) on delete set null,
  marked_at  timestamptz not null default now(),
  unique (session_id, freshie_id)
);

create index if not exists attendance_records_session_idx on public.attendance_records (session_id, group_id);

-- Enable RLS and recreate policies
alter table public.attendance_records enable row level security;

create policy "faci reads own group attendance" on public.attendance_records
  for select using (
    public.my_role() = 'faci' and group_id = public.my_group_id()
  );

create policy "committee reads all attendance" on public.attendance_records
  for select using (public.is_committee());

-- 3. Drop and recreate fn_mark_attendance to log audit logs for closed edits (FR-C6)
drop function if exists public.fn_mark_attendance(integer, uuid, public.attendance_status);
drop function if exists public.fn_mark_attendance(integer, bigint, public.attendance_status);

create or replace function public.fn_mark_attendance(
  p_session_id integer,
  p_freshie_id bigint,
  p_status public.attendance_status
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.user_role := public.my_role();
  v_freshie_group integer;
  v_closed boolean;
begin
  if v_role not in ('faci', 'hof', 'hogm', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;

  select closed into v_closed from public.attendance_sessions where id = p_session_id;

  -- FR-2.4: closed sessions are immutable except for Admin
  if v_role <> 'admin' and v_closed then
    raise exception 'SESSION_CLOSED';
  end if;

  select group_id into v_freshie_group from public.freshies where id = p_freshie_id;
  if v_freshie_group is null then
    raise exception 'FRESHIE_HAS_NO_GROUP';
  end if;
  if v_role = 'faci' and v_freshie_group is distinct from public.my_group_id() then
    raise exception 'NOT_YOUR_GROUP';
  end if;

  insert into public.attendance_records (session_id, freshie_id, group_id, status, marked_by)
  values (p_session_id, p_freshie_id, v_freshie_group, p_status, auth.uid())
  on conflict (session_id, freshie_id)
  do update set status = excluded.status, marked_by = excluded.marked_by, marked_at = now();

  -- FR-C6: Record edit history / audit trail if session is closed and marked by Admin
  if v_closed then
    perform public.audit(
      'attendance.edit_closed',
      'freshie:' || p_freshie_id,
      jsonb_build_object('session_id', p_session_id, 'status', p_status)
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- 4. Create fn_bulk_mark_present function (FR-C4)
create or replace function public.fn_bulk_mark_present(
  p_session_id integer,
  p_group_id integer
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.user_role := public.my_role();
  v_closed boolean;
  v_freshie record;
begin
  if v_role not in ('faci', 'hof', 'hogm', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;

  select closed into v_closed from public.attendance_sessions where id = p_session_id;

  -- FR-2.4: closed sessions are immutable except for Admin
  if v_role <> 'admin' and v_closed then
    raise exception 'SESSION_CLOSED';
  end if;

  if v_role = 'faci' and p_group_id is distinct from public.my_group_id() then
    raise exception 'NOT_YOUR_GROUP';
  end if;

  for v_freshie in (
    select id from public.freshies
    where group_id = p_group_id
  ) loop
    insert into public.attendance_records (session_id, freshie_id, group_id, status, marked_by)
    values (p_session_id, v_freshie.id, p_group_id, 'present', auth.uid())
    on conflict (session_id, freshie_id)
    do update set status = excluded.status, marked_by = excluded.marked_by, marked_at = now();
  end loop;

  -- FR-C6: Record edit history / audit trail if session is closed and marked by Admin
  if v_closed then
    perform public.audit(
      'attendance.bulk_present',
      'group:' || p_group_id,
      jsonb_build_object('session_id', p_session_id)
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- 5. Drop and recreate fn_record_headcount to support optional group_id parameter (FR-C10)
drop function if exists public.fn_record_headcount(integer, integer);

create or replace function public.fn_record_headcount(
  p_session_id integer,
  p_count integer,
  p_group_id integer default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_group integer;
  v_role public.user_role := public.my_role();
  v_closed boolean;
begin
  if v_role not in ('faci', 'hof', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;

  if v_role = 'admin' then
    if p_group_id is null then
      raise exception 'GROUP_ID_REQUIRED_FOR_ADMIN';
    end if;
    v_group := p_group_id;
  else
    v_group := public.my_group_id();
    if v_group is null then
      raise exception 'NOT_IN_GROUP';
    end if;
  end if;

  select closed into v_closed from public.attendance_sessions where id = p_session_id;

  if v_closed and v_role <> 'admin' then
    raise exception 'SESSION_CLOSED';
  end if;

  insert into public.attendance_headcounts (session_id, group_id, headcount, marked_by)
  values (p_session_id, v_group, p_count, auth.uid())
  on conflict (session_id, group_id)
  do update set headcount = excluded.headcount, marked_by = excluded.marked_by, marked_at = now();

  if v_closed then
    perform public.audit(
      'attendance.headcount_closed',
      'group:' || v_group,
      jsonb_build_object('session_id', p_session_id, 'headcount', p_count)
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
