-- Reset all NFC test-mode data without touching production stickers.
-- Test runs, their redemptions, activations and stickers are removed together.

create or replace function public.fn_admin_reset_nfc_test_mode()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_stickers integer := 0;
  v_runs integer := 0;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'PERMISSION_DENIED';
  end if;

  -- Clear every transient effect before removing the test-only source rows.
  update public.projectors
     set activated_by_group = null,
         activated_at = null,
         activated_manually = false,
         test_run_id = null
   where test_run_id is not null;

  if exists (select 1 from pg_attribute
      where attrelid = to_regclass('public.projectors')
        and attname = 'activated_by_nfc_id' and not attisdropped) then
    execute 'update public.projectors set activated_by_nfc_id = null where activated_by_nfc_id in (select id from public.nfc_tokens where test_run_id is not null)';
  end if;

  delete from public.puzzle_redemptions where test_run_id is not null;

  -- Audit logs retain their event while no longer pointing at a deleted sticker.
  if to_regclass('public.nfc_logs') is not null then
    execute 'update public.nfc_logs set nfc_id = null where nfc_id in (select id from public.nfc_tokens where test_run_id is not null)';
  end if;

  if exists (select 1 from pg_attribute
      where attrelid = to_regclass('public.nfc_guardian_verifications')
        and attname = 'consumed_by_nfc_id' and not attisdropped) then
    execute 'update public.nfc_guardian_verifications set consumed_by_nfc_id = null where consumed_by_nfc_id in (select id from public.nfc_tokens where test_run_id is not null)';
  end if;

  delete from public.nfc_tokens where test_run_id is not null;
  get diagnostics v_stickers = row_count;

  delete from public.nfc_test_runs where id is not null;
  get diagnostics v_runs = row_count;

  perform public.audit('nfc.test.reset_all', 'nfc-test-mode',
    jsonb_build_object('stickers_deleted', v_stickers, 'runs_deleted', v_runs));
  return jsonb_build_object('ok', true, 'stickers_deleted', v_stickers, 'runs_deleted', v_runs);
end;
$$;

revoke all on function public.fn_admin_reset_nfc_test_mode() from public, anon;
grant execute on function public.fn_admin_reset_nfc_test_mode() to authenticated;

-- Remove every issued NFC sticker only when an Admin explicitly clears the
-- sticker register. Non-test puzzle progress remains intact.
create or replace function public.fn_admin_clear_nfc_stickers()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_stickers integer := 0;
  v_runs integer := 0;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.projectors
     set activated_by_group = null,
         activated_at = null,
         activated_manually = false,
         test_run_id = null
   where test_run_id is not null;

  if exists (select 1 from pg_attribute
      where attrelid = to_regclass('public.projectors')
        and attname = 'activated_by_nfc_id' and not attisdropped) then
    execute 'update public.projectors
       set activated_by_group = null,
           activated_at = null,
           activated_manually = false,
           test_run_id = null,
           activated_by_nfc_id = null
     where activated_by_nfc_id in (select id from public.nfc_tokens)';
  end if;

  -- Test redemptions exist solely to support an NFC test run; real puzzle
  -- redemptions are preserved even when every sticker is cleared.
  delete from public.puzzle_redemptions where test_run_id is not null;

  if to_regclass('public.nfc_logs') is not null then
    execute 'update public.nfc_logs set nfc_id = null where nfc_id is not null';
  end if;

  if exists (select 1 from pg_attribute
      where attrelid = to_regclass('public.nfc_guardian_verifications')
        and attname = 'consumed_by_nfc_id' and not attisdropped) then
    execute 'update public.nfc_guardian_verifications set consumed_by_nfc_id = null where consumed_by_nfc_id is not null';
  end if;

  delete from public.nfc_tokens where id is not null;
  get diagnostics v_stickers = row_count;

  delete from public.nfc_test_runs where id is not null;
  get diagnostics v_runs = row_count;

  perform public.audit('nfc.stickers.clear_all', 'nfc-stickers',
    jsonb_build_object('stickers_deleted', v_stickers, 'test_runs_deleted', v_runs));
  return jsonb_build_object('ok', true, 'stickers_deleted', v_stickers, 'test_runs_deleted', v_runs);
end;
$$;

revoke all on function public.fn_admin_clear_nfc_stickers() from public, anon;
grant execute on function public.fn_admin_clear_nfc_stickers() to authenticated;
