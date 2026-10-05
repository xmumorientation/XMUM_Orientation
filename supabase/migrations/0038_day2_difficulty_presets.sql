-- Day 2 difficulty presets: HOGM/Tech configure cost and exclusions once,
-- then assign stations to EASY, MEDIUM or HARD in the website.

insert into public.game_setting_definitions
  (setting_key, value_type, min_value, max_value, allowed_values, description)
values
  ('day2_easy_token_cost', 'integer', 0, null, null, 'Token entry cost for Easy Day 2 stations'),
  ('day2_easy_exclusion_limit', 'integer', 0, null, null, 'Location exclusions for Easy Day 2 stations'),
  ('day2_medium_token_cost', 'integer', 0, null, null, 'Token entry cost for Medium Day 2 stations'),
  ('day2_medium_exclusion_limit', 'integer', 0, null, null, 'Location exclusions for Medium Day 2 stations'),
  ('day2_hard_token_cost', 'integer', 0, null, null, 'Token entry cost for Hard Day 2 stations'),
  ('day2_hard_exclusion_limit', 'integer', 0, null, null, 'Location exclusions for Hard Day 2 stations')
on conflict (setting_key) do update set
  value_type = excluded.value_type,
  min_value = excluded.min_value,
  max_value = excluded.max_value,
  allowed_values = excluded.allowed_values,
  description = excluded.description;

insert into public.game_config(key, value) values
  ('day2_easy_token_cost', '2'),
  ('day2_easy_exclusion_limit', '0'),
  ('day2_medium_token_cost', '4'),
  ('day2_medium_exclusion_limit', '1'),
  ('day2_hard_token_cost', '6'),
  ('day2_hard_exclusion_limit', '2')
on conflict (key) do nothing;

create or replace function public.can_manage_game_setting(p_key text)
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_permission('configuration.manage')
    or (
      public.has_permission('configuration.gameplay.manage')
      and p_key in (
        'day1_win_reward', 'day1_lose_reward', 'allow_station_replay',
        'max_station_attempts', 'puzzle_pool_exhaustion_policy',
        'bonding_session_duration_day1', 'bonding_session_duration_day2',
        'day2_easy_token_cost', 'day2_easy_exclusion_limit',
        'day2_medium_token_cost', 'day2_medium_exclusion_limit',
        'day2_hard_token_cost', 'day2_hard_exclusion_limit'
      )
    )
$$;

revoke all on function public.can_manage_game_setting(text) from public, anon;
grant execute on function public.can_manage_game_setting(text) to authenticated;
