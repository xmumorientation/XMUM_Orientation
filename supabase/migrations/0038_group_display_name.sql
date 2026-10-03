-- The groups.name column is the number label ("Group 1").
-- display_name and slogan are what a facilitator chooses for that group.

alter table public.groups
  add column if not exists display_name text,
  add column if not exists slogan text;

create unique index if not exists groups_display_name_unique
  on public.groups (lower(display_name))
  where display_name is not null;

create or replace function public.fn_set_group_profile(
  p_display_name text,
  p_slogan text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(btrim(p_display_name), '');
  v_slogan text := nullif(btrim(p_slogan), '');
begin
  if public.my_role() is distinct from 'faci' then
    raise exception 'FACI_ONLY';
  end if;
  if public.my_group_id() is null then
    raise exception 'NOT_IN_GROUP';
  end if;
  if v_name is null then
    raise exception 'GROUP_NAME_REQUIRED';
  end if;
  if char_length(v_name) > 40 then
    raise exception 'NAME_TOO_LONG';
  end if;
  if v_slogan is not null and char_length(v_slogan) > 80 then
    raise exception 'SLOGAN_TOO_LONG';
  end if;

  update public.groups
     set display_name = v_name,
         slogan = v_slogan
   where id = public.my_group_id();
exception
  when unique_violation then
    raise exception 'NAME_TAKEN';
end;
$$;

revoke all on function public.fn_set_group_profile(text, text) from public;
grant execute on function public.fn_set_group_profile(text, text) to authenticated;
