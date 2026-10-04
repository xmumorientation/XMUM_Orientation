create or replace function public.fn_admin_search_audit(p_query text default null,p_action text default null,p_actor uuid default null,p_from date default null,p_to date default null,p_limit integer default 100)
returns setof public.audit_log language plpgsql stable security definer set search_path=public as $$ begin
 if not public.has_permission('logs.audit') then raise exception 'PERMISSION_DENIED'; end if;
 return query select a.* from public.audit_log a where
 (nullif(trim(p_query),'') is null or coalesce(a.target,'') ilike '%'||trim(p_query)||'%' or coalesce(a.detail,'{}'::jsonb)::text ilike '%'||trim(p_query)||'%' or coalesce(a.before_state,'{}'::jsonb)::text ilike '%'||trim(p_query)||'%' or coalesce(a.after_state,'{}'::jsonb)::text ilike '%'||trim(p_query)||'%')
 and (nullif(trim(p_action),'') is null or a.action ilike '%'||trim(p_action)||'%') and (p_actor is null or a.actor=p_actor)
 and (p_from is null or a.created_at>=p_from::timestamptz) and (p_to is null or a.created_at<(p_to+1)::timestamptz)
 order by a.created_at desc limit least(greatest(p_limit,1),500); end $$;
revoke all on function public.fn_admin_search_audit(text,text,uuid,date,date,integer) from public,anon;
grant execute on function public.fn_admin_search_audit(text,text,uuid,date,date,integer) to authenticated;
create index if not exists audit_log_target_time_idx on public.audit_log(target,created_at desc);
