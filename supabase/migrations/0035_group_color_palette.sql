-- When groups are created they all start on the factory blue. Give each one
-- a different colour from a fixed palette. A colour an admin already saved
-- is left alone, so they can change any group afterwards.

create or replace function public.fn_assign_freshie_group_colors()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  palette text[] := array[
    '#008CFF', '#FE06AB', '#F2FF0B', '#0DFCFD', '#FC9E3D',
    '#A855F7', '#22C55E', '#FF4D6D', '#6366F1', '#14B8A6'
  ];
  g record;
  taken text[];
  chosen text;
  i integer;
  n integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  n := array_length(palette, 1);

  select coalesce(array_agg(upper(color)), '{}'::text[])
  into taken
  from public.groups
  where upper(color) <> '#008CFF';

  for g in
    select id from public.groups where upper(color) = '#008CFF' order by id
  loop
    chosen := null;
    for i in 0..n - 1 loop
      chosen := palette[(((g.id - 1 + i) % n) + 1)];
      if not (upper(chosen) = any (taken)) then
        exit;
      end if;
      chosen := null;
    end loop;

    if chosen is null then
      chosen := palette[(((g.id - 1) % n) + 1)];
    end if;

    update public.groups set color = upper(chosen) where id = g.id;
    taken := taken || upper(chosen);
  end loop;
end;
$$;

revoke all on function public.fn_assign_freshie_group_colors() from public;
grant execute on function public.fn_assign_freshie_group_colors() to authenticated;

select public.fn_assign_freshie_group_colors();
