-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0031: one color per group
-- Numbers 0015–0030 are reserved for the bonding-session branch.
-- Do not edit 0001. groups stays closed for direct client updates
-- because it also holds token_balance.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.groups
  add column if not exists color text not null default '#008CFF';

alter table public.groups
  drop constraint if exists groups_color_hex;

alter table public.groups
  add constraint groups_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$');

create or replace function public.fn_admin_set_group_color(
  p_group_id integer,
  p_color text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'INVALID_COLOR';
  end if;

  update public.groups
  set color = upper(p_color)
  where id = p_group_id;

  if not found then
    raise exception 'GROUP_NOT_FOUND';
  end if;

  perform public.audit(
    'group.set_color',
    'group:' || p_group_id,
    jsonb_build_object('color', upper(p_color))
  );

  return jsonb_build_object('ok', true, 'group_id', p_group_id, 'color', upper(p_color));
end;
$$;

revoke all on function public.fn_admin_set_group_color(integer, text) from public;
grant execute on function public.fn_admin_set_group_color(integer, text) to authenticated;
