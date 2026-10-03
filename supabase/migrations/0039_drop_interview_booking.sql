-- ============================================================================
-- XMUM Orientation Platform 2026 — Migration 0039
-- Remove the interview booking and performance practice reservation systems.
--
-- The /booking and /reservations pages in this app used in-memory mock data,
-- so no migration here created tables for them. The real interview booking
-- system lives in the `interview-booking` branch (a separate app). If any of
-- its objects were ever run against this database, this drops them.
--
-- Safe to run more than once. Only drops objects unique to the booking system.
-- It does NOT touch profiles, user_role, is_admin(), handle_new_user() or the
-- on_auth_user_created trigger, which this app also uses.
-- ============================================================================

-- Tables (cascade removes their indexes, policies and constraints)
drop table if exists public.bookings       cascade;
drop table if exists public.slots          cascade;
drop table if exists public.track_settings cascade;
drop table if exists public.staff_invites  cascade;

-- Functions: drop every overload by name, since signatures changed over time
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'book_slot',
        'book_slot_public',
        'cancel_booking',
        'cancel_booking_public',
        'reschedule_booking',
        'within_cutoff',
        'available_slots',
        'head_slots',
        'head_bookings',
        'head_cancel_booking',
        'head_update_interview_status',
        'lookup_booking_public',
        'auth_managed_track'
      )
  loop
    execute format('drop function if exists %s cascade', fn.sig);
  end loop;
end $$;

-- Enum types used only by the booking system
drop type if exists public.booking_status cascade;
drop type if exists public.slot_status    cascade;
drop type if exists public.orientation    cascade;
drop type if exists public.track          cascade;
