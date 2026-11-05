-- Migration 0124: Add fn_admin_remove_piece to take back a puzzle piece
-- Used by Admin in Live Control -> Game Master (Puzzles tab).

create or replace function public.fn_admin_remove_piece(
  p_group_id integer,
  p_location public.projector_location,
  p_index integer
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_item record;
  v_deleted integer;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not exists (select 1 from public.groups where id = p_group_id) then
    raise exception 'GROUP_NOT_FOUND';
  end if;

  select id into v_item from public.items
   where type = 'puzzle' and puzzle_location = p_location and puzzle_index = p_index;
  if not found then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  delete from public.inventory
   where group_id = p_group_id
     and item_id = v_item.id
     and item_type = 'puzzle';
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    raise exception 'PUZZLE_PIECE_NOT_OWNED';
  end if;

  perform public.audit('inventory.admin_remove_piece', 'group:' || p_group_id,
    jsonb_build_object('location', p_location, 'index', p_index));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fn_admin_remove_piece(integer, public.projector_location, integer) from public, anon;
grant execute on function public.fn_admin_remove_piece(integer, public.projector_location, integer) to authenticated;
