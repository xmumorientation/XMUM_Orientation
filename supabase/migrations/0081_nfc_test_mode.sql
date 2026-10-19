create table public.nfc_test_runs (
  id uuid primary key default gen_random_uuid(),
  group_id integer not null references public.groups(id),
  location public.projector_location not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  reset_at timestamptz,
  closed_at timestamptz
);

alter table public.nfc_test_runs enable row level security;
create policy "admin reads nfc test runs" on public.nfc_test_runs
  for select using (public.is_admin());
revoke all on public.nfc_test_runs from public, authenticated, anon;
grant select on public.nfc_test_runs to authenticated;

alter table public.nfc_tokens
  add column test_run_id uuid references public.nfc_test_runs(id);
alter table public.puzzle_redemptions
  add column test_run_id uuid references public.nfc_test_runs(id);
alter table public.projectors
  add column test_run_id uuid references public.nfc_test_runs(id);

create or replace function public.fn_nfc_test_start(
  p_group_id integer,
  p_location public.projector_location
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_run public.nfc_test_runs;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'PERMISSION_DENIED';
  end if;
  if exists (select 1 from public.nfc_test_runs
             where group_id = p_group_id and location = p_location and closed_at is null) then
    raise exception 'TEST_RUN_EXISTS';
  end if;
  if exists (select 1 from public.puzzle_redemptions
             where group_id = p_group_id and location = p_location) then
    raise exception 'SET_ALREADY_REDEEMED';
  end if;
  if exists (select 1 from public.projectors
             where location = p_location and activated_at is not null) then
    raise exception 'PROJECTOR_ALREADY_ACTIVATED';
  end if;
  if exists (select 1 from public.projectors
             where activated_by_group = p_group_id) then
    raise exception 'GROUP_ALREADY_ACTIVATED';
  end if;

  insert into public.nfc_test_runs (group_id, location, created_by)
  values (p_group_id, p_location, auth.uid()) returning * into v_run;
  insert into public.puzzle_redemptions (group_id, location, redeemed_by, nfc_note, test_run_id)
  values (p_group_id, p_location, auth.uid(), 'NFC test run ' || v_run.id, v_run.id);
  perform public.audit('nfc.test.start', 'nfc-test:' || v_run.id,
    jsonb_build_object('group_id', p_group_id, 'location', p_location));
  return jsonb_build_object('id', v_run.id, 'group_id', p_group_id, 'location', p_location);
end;
$$;

create or replace function public.fn_nfc_test_reset(p_test_run_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_run public.nfc_test_runs;
  v_tokens integer;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'PERMISSION_DENIED';
  end if;
  select * into v_run from public.nfc_test_runs where id = p_test_run_id for update;
  if not found then raise exception 'TEST_RUN_UNKNOWN'; end if;
  if v_run.closed_at is not null then raise exception 'TEST_RUN_CLOSED'; end if;
  update public.nfc_tokens
     set used_at = null, used_by_group = null
   where test_run_id = v_run.id;
  get diagnostics v_tokens = row_count;
  update public.projectors
     set activated_by_group = null, activated_at = null,
         activated_manually = false, test_run_id = null
   where test_run_id = v_run.id;
  delete from public.puzzle_redemptions where test_run_id = v_run.id;
  insert into public.puzzle_redemptions (group_id, location, redeemed_by, nfc_note, test_run_id)
  values (v_run.group_id, v_run.location, auth.uid(), 'NFC test run ' || v_run.id, v_run.id);
  update public.nfc_test_runs set reset_at = now() where id = v_run.id;
  perform public.audit('nfc.test.reset', 'nfc-test:' || v_run.id,
    jsonb_build_object('tokens_reset', v_tokens));
  return jsonb_build_object('ok', true, 'tokens_reset', v_tokens);
end;
$$;

create or replace function public.fn_nfc_test_finish(p_test_run_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_run public.nfc_test_runs;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'PERMISSION_DENIED';
  end if;
  select * into v_run from public.nfc_test_runs where id = p_test_run_id for update;
  if not found then raise exception 'TEST_RUN_UNKNOWN'; end if;
  if v_run.closed_at is not null then
    return jsonb_build_object('ok', true, 'already_closed', true);
  end if;
  update public.projectors
     set activated_by_group = null, activated_at = null,
         activated_manually = false, test_run_id = null
   where test_run_id = v_run.id;
  delete from public.puzzle_redemptions where test_run_id = v_run.id;
  update public.nfc_test_runs set closed_at = now() where id = v_run.id;
  perform public.audit('nfc.test.finish', 'nfc-test:' || v_run.id,
    jsonb_build_object('group_id', v_run.group_id, 'location', v_run.location));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fn_activate_projector(p_token_hash text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_group integer := public.my_group_id();
  v_token public.nfc_tokens;
  v_proj public.projectors;
  v_test_run public.nfc_test_runs;
begin
  if public.config_bool('nfc_disabled', false) then raise exception 'NFC_DISABLED'; end if;
  if v_group is null then raise exception 'NOT_IN_GROUP'; end if;
  select * into v_token from public.nfc_tokens where token_hash = p_token_hash for update;
  if not found then raise exception 'TOKEN_UNKNOWN'; end if;
  if v_token.used_at is not null then raise exception 'TOKEN_USED'; end if;

  if v_token.test_run_id is not null then
    select * into v_test_run from public.nfc_test_runs
     where id = v_token.test_run_id and closed_at is null for update;
    if not found then raise exception 'TEST_RUN_RESET'; end if;
    if v_test_run.group_id <> v_group or v_test_run.location <> v_token.location then
      raise exception 'TEST_RUN_MISMATCH';
    end if;
  else
    if not public.phase_active('endgame') then raise exception 'NOT_ENDGAME'; end if;
    if not exists (select 1 from public.puzzle_redemptions
                    where group_id = v_group and location = v_token.location) then
      raise exception 'SET_NOT_REDEEMED';
    end if;
  end if;

  select * into v_proj from public.projectors
   where location = v_token.location for update;
  if v_proj.activated_at is not null then raise exception 'ALREADY_ACTIVATED'; end if;
  update public.projectors
     set activated_by_group = v_group, activated_at = now(), activated_manually = false,
         test_run_id = v_token.test_run_id
   where location = v_token.location;
  update public.nfc_tokens set used_at = now(), used_by_group = v_group where id = v_token.id;
  perform public.audit('projector.activate', 'projector:' || v_token.location,
    jsonb_build_object('group_id', v_group, 'token_id', v_token.id,
                       'test_run_id', v_token.test_run_id));
  return jsonb_build_object('ok', true, 'location', v_token.location, 'group_id', v_group);
exception
  when unique_violation then raise exception 'GROUP_ALREADY_ACTIVATED_ONE';
end;
$$;

create or replace function public.fn_activate_projector_manual(
  p_location public.projector_location,
  p_group_id integer
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_test_run_id uuid;
begin
  if coalesce(public.my_role() not in ('guardian_gm', 'hogm', 'admin'), true) then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not exists (select 1 from public.puzzle_redemptions
                  where group_id = p_group_id and location = p_location) then
    raise exception 'SET_NOT_REDEEMED';
  end if;
  select id into v_test_run_id from public.nfc_test_runs
   where group_id = p_group_id and location = p_location and closed_at is null;

  update public.projectors
     set activated_by_group = p_group_id, activated_at = now(),
         activated_manually = true, test_run_id = v_test_run_id
   where location = p_location and activated_at is null;
  if not found then raise exception 'ALREADY_ACTIVATED'; end if;
  perform public.audit('projector.activate_manual', 'projector:' || p_location,
    jsonb_build_object('group_id', p_group_id, 'test_run_id', v_test_run_id));
  return jsonb_build_object('ok', true);
exception
  when unique_violation then raise exception 'GROUP_ALREADY_ACTIVATED_ONE';
end;
$$;

revoke all on function public.fn_nfc_test_start(integer, public.projector_location) from public, anon;
revoke all on function public.fn_nfc_test_reset(uuid) from public, anon;
revoke all on function public.fn_nfc_test_finish(uuid) from public, anon;
revoke all on function public.fn_activate_projector(text) from public, anon;
revoke all on function public.fn_activate_projector_manual(public.projector_location, integer) from public, anon;
grant execute on function public.fn_nfc_test_start(integer, public.projector_location) to authenticated;
grant execute on function public.fn_nfc_test_reset(uuid) to authenticated;
grant execute on function public.fn_nfc_test_finish(uuid) to authenticated;
grant execute on function public.fn_activate_projector(text) to authenticated;
grant execute on function public.fn_activate_projector_manual(public.projector_location, integer) to authenticated;
