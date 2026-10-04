create table if not exists public.notifications (
 notification_id bigserial primary key, notification_type text not null, message text not null,
 scope text not null check(scope in ('GROUP','STATION','GROUP_AND_STATION','ROLE','ALL_PARTICIPANTS','USER','ADMIN_ONLY')),
 target_group_id integer references public.groups(id) on delete cascade,
 target_station_id integer references public.stations(id) on delete set null,
 target_day smallint check(target_day in (1,2)), target_role public.user_role,
 target_user_id uuid references public.profiles(id) on delete cascade,
 reference_type text, reference_id text, source_table text not null, source_id text not null,
 created_at timestamptz not null default now(), unique(source_table,source_id));
create index if not exists notifications_group_time_idx on public.notifications(target_group_id,created_at desc);
create index if not exists notifications_station_time_idx on public.notifications(target_station_id,target_day,created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "authoritative notification recipients" on public.notifications;
create policy "authoritative notification recipients" on public.notifications for select using(auth.uid() is not null and (
 (scope='ADMIN_ONLY' and public.my_role()='admin') or
 (public.my_role()<>'admin' and target_user_id=auth.uid()) or
 (public.my_role() in ('faci','freshie') and target_group_id=public.current_gameplay_group_id()) or
 (public.my_role()='gm' and target_station_id is not null and exists(select 1 from public.gm_station_assignments g where g.user_id=auth.uid() and g.station_id=notifications.target_station_id and g.day=notifications.target_day)) or
 (scope='ROLE' and target_role=public.my_role()) or
 (scope='ALL_PARTICIPANTS' and public.my_role() in ('faci','freshie','gm'))));
create or replace function public.bridge_group_notification() returns trigger language plpgsql security definer set search_path=public as $$ begin
 insert into public.notifications(notification_type,message,scope,target_group_id,reference_type,reference_id,source_table,source_id,created_at)
 values(new.notification_type,new.message,'GROUP',new.group_id,'GROUP_NOTIFICATION',new.reference_id,'group_notifications',new.id::text,new.created_at) on conflict(source_table,source_id) do nothing; return new; end $$;
drop trigger if exists group_notification_bridge on public.group_notifications;
create trigger group_notification_bridge after insert on public.group_notifications for each row execute function public.bridge_group_notification();
create or replace function public.bridge_token_notification() returns trigger language plpgsql security definer set search_path=public as $$ begin
 insert into public.notifications(notification_type,message,scope,target_group_id,target_station_id,target_day,target_user_id,reference_type,reference_id,source_table,source_id,created_at)
 values('TOKEN_UPDATED',new.message,case when new.user_id is not null then 'USER' else 'GROUP' end,new.group_id,new.station_id,new.bonding_day,new.user_id,'TOKEN_TRANSACTION',new.reference_id,'token_notifications',new.id::text,new.created_at) on conflict(source_table,source_id) do nothing; return new; end $$;
drop trigger if exists token_notification_bridge on public.token_notifications;
create trigger token_notification_bridge after insert on public.token_notifications for each row execute function public.bridge_token_notification();
revoke all on public.notifications from anon; grant select on public.notifications to authenticated;
do $$ begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end $$;
