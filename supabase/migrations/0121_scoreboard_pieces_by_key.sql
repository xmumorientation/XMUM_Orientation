-- 0120 returned only a count per group. Home's Day 2 board now opens a group to
-- show its three keys with the pieces it holds (like HOGM's Scores), so this
-- returns one row per piece held. A player still cannot read other groups'
-- inventory; this is the same data the Scores page shows staff, one row per
-- (group, key, piece number) and nothing else.

drop function if exists public.fn_scoreboard_pieces();

create function public.fn_scoreboard_pieces()
returns table (group_id integer, location public.projector_location, puzzle_index integer)
language sql
stable
security definer
set search_path = public
as $$
  select distinct inv.group_id, i.puzzle_location, i.puzzle_index
    from public.inventory inv
    join public.items i on i.id = inv.item_id
   where i.type = 'puzzle' and i.puzzle_location is not null and i.puzzle_index is not null
   order by 1, 2, 3;
$$;

revoke all on function public.fn_scoreboard_pieces() from public, anon;
grant execute on function public.fn_scoreboard_pieces() to authenticated;
