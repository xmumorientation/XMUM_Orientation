-- Read-only. Run in Supabase SQL Editor, then copy the whole result column back.
select p.proname, pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('fn_nfc_v2_redeem_nfc_card', 'fn_day2_challenge', 'fn_activate_projector',
     'fn_activate_projector_manual', 'fn_demo_activate_projector', 'fn_bb_buy', 'fn_bb_buy_at',
     'fn_bb_seller_preview', 'fn_schedule_timer', 'fn_phase_control')
 order by p.proname;
