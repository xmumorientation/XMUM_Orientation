-- Home's Tokens board (Day 2 view) shows how many puzzle pieces each group
-- holds. A Freshie or GM may not read other groups' inventory (0002 RLS) and
-- fn_puzzle_status is staff only, so this returns just the count per group,
-- like fn_scoreboard() returns just the tokens. It does not say which pieces.

create or replace function public.fn_scoreboard_pieces()
returns table (group_id integer, pieces integer)
language sql
stable
security definer
set search_path = public
as $$
  select g.id,
         coalesce((
           select count(distinct (i.puzzle_location, i.puzzle_index))::integer
             from public.inventory inv
             join public.items i on i.id = inv.item_id
            where inv.group_id = g.id and i.type = 'puzzle'
         ), 0)
    from public.groups g
   order by g.id;
$$;

revoke all on function public.fn_scoreboard_pieces() from public, anon;
grant execute on function public.fn_scoreboard_pieces() to authenticated;
