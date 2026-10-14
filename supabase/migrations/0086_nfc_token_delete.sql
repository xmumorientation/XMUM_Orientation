create or replace function public.fn_admin_delete_nfc_token(p_token_id integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_token public.nfc_tokens%rowtype;
  v_linked boolean;
  v_log_ids jsonb := '[]'::jsonb;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'PERMISSION_DENIED';
  end if;

  select * into v_token from public.nfc_tokens where id = p_token_id for update;
  if not found then
    return jsonb_build_object('ok', true, 'already_deleted', true);
  end if;
  if v_token.used_at is not null or v_token.used_by_group is not null
     or to_jsonb(v_token)->>'used_by_user' is not null
     or upper(to_jsonb(v_token)->>'status') = 'USED' then
    raise exception 'NFC_TOKEN_USED';
  end if;

  if exists (select 1 from pg_attribute
      where attrelid = to_regclass('public.projectors')
        and attname = 'activated_by_nfc_id' and not attisdropped) then
    execute 'select exists (select 1 from public.projectors where activated_by_nfc_id = $1)'
      into v_linked using p_token_id;
    if v_linked then raise exception 'NFC_TOKEN_PROJECTOR_LINKED'; end if;
  end if;

  if exists (select 1 from pg_attribute
      where attrelid = to_regclass('public.nfc_guardian_verifications')
        and attname = 'consumed_by_nfc_id' and not attisdropped) then
    execute 'select exists (select 1 from public.nfc_guardian_verifications where consumed_by_nfc_id = $1)'
      into v_linked using p_token_id;
    if v_linked then raise exception 'NFC_TOKEN_GUARDIAN_LINKED'; end if;
  end if;

  if exists (select 1 from pg_attribute
      where attrelid = to_regclass('public.nfc_logs')
        and attname = 'nfc_id' and not attisdropped) then
    execute 'with detached as (
      update public.nfc_logs set nfc_id = null where nfc_id = $1 returning log_id
    ) select coalesce(jsonb_agg(log_id order by log_id), ''[]''::jsonb) from detached'
      into v_log_ids using p_token_id;
  end if;

  delete from public.nfc_tokens where id = p_token_id;
  perform public.audit('nfc.delete', 'nfc:' || p_token_id,
    jsonb_build_object('token_id', v_token.id, 'label', v_token.label,
      'location', v_token.location, 'log_ids', v_log_ids));
  return jsonb_build_object('ok', true, 'already_deleted', false);
end;
$$;

revoke all on function public.fn_admin_delete_nfc_token(integer) from public, anon;
grant execute on function public.fn_admin_delete_nfc_token(integer) to authenticated;
