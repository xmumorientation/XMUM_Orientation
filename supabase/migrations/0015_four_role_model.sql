-- XMUM Orientation: consolidate the operational role model to four roles.
--
-- Existing assignments are migrated as follows:
--   guardian_gm                    -> gm
--   hof / hogm / committee         -> admin
--
-- The original enum labels remain in PostgreSQL for migration compatibility
-- with historical functions/audit rows, but profiles are constrained so new
-- and updated users can only hold freshie, faci, gm, or admin.

update public.profiles
set role = case
  when role = 'guardian_gm' then 'gm'::public.user_role
  when role in ('hof', 'hogm', 'committee') then 'admin'::public.user_role
  else role
end
where role in ('guardian_gm', 'hof', 'hogm', 'committee');

-- Keep Auth app_metadata aligned with the authoritative profile role so a
-- future profile recreation cannot restore one of the retired roles.
update auth.users
set raw_app_meta_data = jsonb_set(
  coalesce(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  to_jsonb(
    case raw_app_meta_data ->> 'role'
      when 'guardian_gm' then 'gm'
      when 'hof' then 'admin'
      when 'hogm' then 'admin'
      when 'committee' then 'admin'
      else raw_app_meta_data ->> 'role'
    end
  ),
  true
)
where raw_app_meta_data ->> 'role' in
  ('guardian_gm', 'hof', 'hogm', 'committee');

alter table public.profiles
  drop constraint if exists profiles_role_four_allowed;

alter table public.profiles
  add constraint profiles_role_four_allowed
  check (role in ('freshie', 'faci', 'gm', 'admin'));

-- Legacy policies call is_committee(). Retain the helper name so deployed
-- policies remain valid, but make its meaning the new admin-only ops tier.
create or replace function public.is_committee()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.my_role() = 'admin';
$$;

-- A signed-in user may edit their contact fields through the existing update
-- policy, but must never promote themselves or change allocations.
create or replace function public.protect_profile_assignment()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() = old.id and public.my_role() <> 'admin' and (
    new.id is distinct from old.id
    or new.role is distinct from old.role
    or new.group_id is distinct from old.group_id
    or new.station_id is distinct from old.station_id
  ) then
    raise exception 'PERMISSION_DENIED';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_assignment on public.profiles;
create trigger protect_profile_assignment
  before update on public.profiles
  for each row execute function public.protect_profile_assignment();

-- Guardian duties now belong to GMs; Admin retains emergency access.
create or replace function public.fn_redeem_puzzle_set(
  p_group_id integer,
  p_location public.projector_location,
  p_nfc_note text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_status jsonb;
begin
  if public.my_role() not in ('gm', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;

  v_status := public.fn_puzzle_status(p_group_id, p_location);
  if not (v_status ->> 'complete')::boolean then
    raise exception 'SET_INCOMPLETE';
  end if;
  if (v_status ->> 'projector_activated')::boolean then
    raise exception 'PROJECTOR_ALREADY_ACTIVATED';
  end if;

  insert into public.puzzle_redemptions (group_id, location, redeemed_by, nfc_note)
  values (p_group_id, p_location, auth.uid(), coalesce(p_nfc_note, ''));

  perform public.audit('puzzle.redeem', 'group:' || p_group_id,
    jsonb_build_object('location', p_location, 'nfc_note', p_nfc_note));

  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    raise exception 'ALREADY_REDEEMED';
end;
$$;

create or replace function public.fn_activate_projector_manual(
  p_location public.projector_location,
  p_group_id integer
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if public.my_role() not in ('gm', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not exists (select 1 from public.puzzle_redemptions
                  where group_id = p_group_id and location = p_location) then
    raise exception 'SET_NOT_REDEEMED';
  end if;

  update public.projectors
     set activated_by_group = p_group_id, activated_at = now(), activated_manually = true
   where location = p_location and activated_at is null;
  if not found then
    raise exception 'ALREADY_ACTIVATED';
  end if;

  perform public.audit('projector.activate_manual', 'projector:' || p_location,
    jsonb_build_object('group_id', p_group_id));

  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    raise exception 'GROUP_ALREADY_ACTIVATED_ONE';
end;
$$;
