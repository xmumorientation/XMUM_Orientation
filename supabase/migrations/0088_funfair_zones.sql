-- Migration 0088: the Vortexa Funfair's zones on the 3D map.
--
-- The funfair on the dorm land has three zones (west, central, east). A zone
-- powers up on every map when its keys are lit: the lightbulbs (projectors)
-- Admin or HOGM tied to it, any one of them or all of them. A manual override
-- forces a zone on or off. See docs/map3d-funfair-design.md, "Data and Admin
-- control".
--
-- * funfair_zones: the setup, one row per zone. Only game leads (Admin, HOGM:
--   is_game_lead(), 0071) can read it: a zone's keys would tell players where
--   the unlit bulbs are.
-- * fn_funfair_state: whether each zone is on, for everyone signed in. It
--   gives no keys away (a lit bulb is public already).
-- * fn_set_funfair_zone: game leads change a zone's keys, rule and override.
--
-- Until this migration is applied the map uses the same defaults in code
-- (src/lib/funfair.ts).

create table if not exists public.funfair_zones (
  zone        text primary key check (zone in ('west', 'central', 'east')),
  name        text not null,
  required    public.projector_location[] not null default '{}',
  rule        text not null default 'any' check (rule in ('any', 'all')),
  -- null: the keys decide; true or false: forced on or off
  manual      boolean,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null
);

insert into public.funfair_zones (zone, name, required) values
  ('west', 'West · Neon Pier', '{A3}'),
  ('central', 'Central · Starlight Midway', '{TF}'),
  ('east', 'East · Big Top', '{B1}')
on conflict (zone) do nothing;

alter table public.funfair_zones enable row level security;
drop policy if exists "game leads read the funfair setup" on public.funfair_zones;
create policy "game leads read the funfair setup" on public.funfair_zones
  for select to authenticated using (public.is_game_lead());
revoke all on public.funfair_zones from public, anon, authenticated;
grant select on public.funfair_zones to authenticated;

-- Game leads' consoles follow changes live (RLS keeps the rows from others).
do $$ begin
  alter publication supabase_realtime add table public.funfair_zones;
exception when others then null; end $$;

-- ── Whether each zone is on (everyone signed in) ─────────────────────────
create or replace function public.fn_funfair_state()
returns table (zone text, powered boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    z.zone,
    coalesce(
      z.manual,
      case
        when cardinality(z.required) = 0 then false
        when z.rule = 'all' then not exists (
          select 1 from unnest(z.required) as k (location)
          where not exists (
            select 1 from public.projectors p where p.location = k.location and p.activated_at is not null
          )
        )
        else exists (
          select 1 from public.projectors p where p.location = any (z.required) and p.activated_at is not null
        )
      end
    ) as powered
  from public.funfair_zones z
  order by array_position(array['west', 'central', 'east'], z.zone);
$$;

revoke all on function public.fn_funfair_state() from public, anon;
grant execute on function public.fn_funfair_state() to authenticated;

-- ── Change a zone (Admin, HOGM) ──────────────────────────────────────────
create or replace function public.fn_set_funfair_zone(
  p_zone text,
  p_required public.projector_location[],
  p_rule text,
  p_manual boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_game_lead() then
    raise exception 'Only Admin and HOGM can change the funfair' using errcode = '42501';
  end if;
  if p_rule is null or p_rule not in ('any', 'all') then
    raise exception 'The rule must be any or all' using errcode = '22023';
  end if;
  update public.funfair_zones
  set required = coalesce(p_required, '{}'),
      rule = p_rule,
      manual = p_manual,
      updated_at = now(),
      updated_by = auth.uid()
  where zone = p_zone;
  if not found then
    raise exception 'Unknown funfair zone: %', p_zone using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.fn_set_funfair_zone(text, public.projector_location[], text, boolean) from public, anon;
grant execute on function public.fn_set_funfair_zone(text, public.projector_location[], text, boolean) to authenticated;
