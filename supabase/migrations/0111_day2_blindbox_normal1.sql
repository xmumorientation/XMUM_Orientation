-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0111: blind boxes on from the Day 2 game's start (run after 0102)
--
-- 0102 kept the Blind box switch off in Normal 1; it now opens with the
-- game. Outside the game ("off") it stays off. Only the default changes:
-- Admin's flips and the kill-switches work as before. Safe to run again.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_day2_off_reason(p_switch text)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  s public.day2_schedule;
  v_seg text := public.fn_day2_segment();
  v_on boolean;
begin
  select * into s from public.day2_schedule where id = 1;
  if s.override_segment = v_seg and s.overrides ? p_switch then
    v_on := (s.overrides ->> p_switch)::boolean;
    return case when v_on then null else 'admin' end;
  end if;
  v_on := case p_switch
    when 'station' then true
    when 'blindbox' then v_seg in ('normal1', 'challenge', 'normal2', 'funfair')
    when 'funfair' then v_seg = 'funfair'
    else true end;
  return case when v_on then null else 'default' end;
end;
$$;

revoke all on function public.fn_day2_off_reason(text) from public;
grant execute on function public.fn_day2_off_reason(text) to anon, authenticated;
