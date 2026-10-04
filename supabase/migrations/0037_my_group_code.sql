-- A facilitator can read the login code for their own group only.
-- Other groups stay hidden. Admin still reads the whole table.

create or replace function public.fn_my_group_code()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if public.my_role() is distinct from 'faci' then
    return null;
  end if;
  if public.my_group_id() is null then
    return null;
  end if;
  select c.code into v_code
  from public.group_login_codes c
  where c.group_id = public.my_group_id();
  return v_code;
end;
$$;

revoke all on function public.fn_my_group_code() from public;
grant execute on function public.fn_my_group_code() to authenticated;
