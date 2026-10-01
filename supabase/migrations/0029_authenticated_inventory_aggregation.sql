-- SECTION 14: authenticated, group-isolated Inventory read interfaces.
-- Token, Puzzle, and Blind Box remain independent modules.

create or replace function public.fn_my_inventory_group()
returns table(group_id integer,group_name text,token_balance integer)
language plpgsql stable security definer set search_path=public as $$
declare v_group_id integer;
begin
  if auth.uid() is null or public.my_role() not in ('faci','freshie')
    or not public.has_permission('inventory.view') then raise exception 'PERMISSION_DENIED'; end if;
  v_group_id:=public.current_gameplay_group_id();
  if v_group_id is null then raise exception 'GROUP_NOT_ASSIGNED'; end if;
  return query select g.id,g.name,coalesce(g.current_tokens,g.token_balance,0) from public.groups g where g.id=v_group_id;
end $$;

create or replace function public.fn_my_puzzle_inventory()
returns table(
  inventory_id bigint,status text,obtained_at timestamptz,redeemed_at timestamptz,
  puzzle_id integer,puzzle_code text,puzzle_name text,
  puzzle_location public.projector_location,puzzle_index integer
) language plpgsql stable security definer set search_path=public as $$
declare v_group_id integer;
begin
  if auth.uid() is null or public.my_role() not in ('faci','freshie')
    or not public.has_permission('inventory.view') then raise exception 'PERMISSION_DENIED'; end if;
  v_group_id:=public.current_gameplay_group_id();
  if v_group_id is null then raise exception 'GROUP_NOT_ASSIGNED'; end if;
  return query
    select inv.id,inv.status,inv.created_at,inv.redeemed_at,
      i.id,i.puzzle_code,i.name,i.puzzle_location,i.puzzle_index
    from public.inventory inv join public.items i on i.id=inv.item_id
    where inv.group_id=v_group_id and inv.item_type='puzzle'
    order by inv.created_at desc;
end $$;

revoke all on function public.fn_my_inventory_group(),public.fn_my_puzzle_inventory() from public,anon;
grant execute on function public.fn_my_inventory_group(),public.fn_my_puzzle_inventory() to authenticated;
