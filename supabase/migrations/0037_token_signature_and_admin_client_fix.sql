-- Follow-up for PostgreSQL overload resolution in Day 1/Day 2 gameplay.
-- Existing gameplay functions pass literal day numbers (integer), while the
-- atomic Token primitive intentionally stores bonding_day as smallint.

create or replace function public.fn_token_apply_unchecked(
  p_group_id integer,
  p_amount integer,
  p_transaction_type varchar,
  p_reference_type text,
  p_reference_id text,
  p_station_id integer,
  p_bonding_day integer,
  p_notes text,
  p_notify boolean
) returns jsonb language sql security definer set search_path=public as $$
  select public.fn_token_apply_unchecked(
    p_group_id,p_amount,p_transaction_type,p_reference_type,p_reference_id,
    p_station_id,p_bonding_day::smallint,p_notes,p_notify
  )
$$;

revoke all on function public.fn_token_apply_unchecked(integer,integer,varchar,text,text,integer,integer,text,boolean)
  from public,anon,authenticated;
