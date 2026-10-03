-- Public scoreboard for Freshie Home. Members can only select their own
-- group, so this returns every group's name, colour, and token balance.
-- token_balance is the column both admin adjustments and game-master
-- adjustments update.

create or replace function public.fn_scoreboard()
returns table (
  id integer,
  name text,
  color text,
  token_balance integer
)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.name, g.color, g.token_balance
  from public.groups g
  order by g.token_balance desc, g.id;
$$;

revoke all on function public.fn_scoreboard() from public;
grant execute on function public.fn_scoreboard() to authenticated;
