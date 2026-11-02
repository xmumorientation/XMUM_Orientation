-- OC has HOF's access, while my_role(), profiles and audit records retain OC.
-- Patch the installed definitions rather than replaying older bodies: production
-- has additional NFC/context functions and newer guards not present in this checkout.
-- CREATE OR REPLACE preserves the existing owner, ACL and security properties.
-- 0113 must be committed first so 'oc' is a usable enum value.
-- Extend additional installed role checks without removing their restrictions.
do $migration$
declare
  c record;
  definition text;
begin
  for c in select oid, conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
  loop
    definition := pg_get_constraintdef(c.oid);
    if definition like '%''hof''::%user_role%' then
      if definition not like '%ARRAY[%''hof''::%' then
        raise exception 'OC_UNSUPPORTED_PROFILE_CONSTRAINT: %', c.conname;
      end if;
      definition := regexp_replace(definition, ',\s*''oc''::(public\.)?user_role', '', 'g');
      definition := regexp_replace(definition, '''hof''::(public\.)?user_role',
        '''hof''::public.user_role, ''oc''::public.user_role', 'g');
      execute format('alter table public.profiles drop constraint %I', c.conname);
      execute format('alter table public.profiles add constraint %I %s', c.conname, definition);
    end if;
  end loop;
end;
$migration$;

do $migration$
declare
  f record;
  definition text;
  without_role_lists text;
  changed integer := 0;
begin
  for f in
    select p.oid, p.proname from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and p.prosrc like '%''hof''%'
    order by p.proname, p.oid
  loop
    -- Every HOF literal must occur in an IN role list. Fail instead of guessing
    -- if an installed function uses a different authorization expression.
    definition := pg_get_functiondef(f.oid);
    without_role_lists := regexp_replace(definition, '\min\s*\([^)]*\)', '', 'gi');
    if position('''hof''' in without_role_lists) > 0 then
      raise exception 'OC_UNSUPPORTED_ROLE_CHECK: %', f.proname;
    end if;
    -- Normalize a previous OC addition before extending the HOF list again.
    definition := regexp_replace(definition, '''hof''\s*,\s*''oc''', '''hof''', 'g');
    definition := replace(definition, '''hof''', '''hof'', ''oc''');
    execute definition;
    changed := changed + 1;
  end loop;
  if changed = 0 then raise exception 'OC_HOF_FUNCTIONS_MISSING'; end if;
end;
$migration$;

-- Preserve the rest of each installed policy, including any additional guards.
do $migration$
declare
  p record;
  expression text;
  clause text;
begin
  for p in select * from pg_policies where schemaname = 'public'
    and (qual like '%''hof''::%user_role%' or with_check like '%''hof''::%user_role%')
  loop
    clause := '';
    if p.qual is not null then
      expression := regexp_replace(p.qual, ',\s*''oc''::(public\.)?user_role', '', 'g');
      expression := regexp_replace(expression, '''hof''::(public\.)?user_role',
        '''hof''::public.user_role, ''oc''::public.user_role', 'g');
      -- Current policies use role arrays. Reject an equality check rather than
      -- generating a comma-separated expression outside an ARRAY constructor.
      if p.qual like '%''hof''::%' and p.qual not like '%ARRAY[%''hof''::%' then
        raise exception 'OC_UNSUPPORTED_POLICY: %', p.policyname;
      end if;
      clause := clause || ' using (' || expression || ')';
    end if;
    if p.with_check is not null then
      expression := regexp_replace(p.with_check, ',\s*''oc''::(public\.)?user_role', '', 'g');
      expression := regexp_replace(expression, '''hof''::(public\.)?user_role',
        '''hof''::public.user_role, ''oc''::public.user_role', 'g');
      if p.with_check like '%''hof''::%' and p.with_check not like '%ARRAY[%''hof''::%' then
        raise exception 'OC_UNSUPPORTED_POLICY: %', p.policyname;
      end if;
      clause := clause || ' with check (' || expression || ')';
    end if;
    execute format('alter policy %I on %I.%I%s', p.policyname, p.schemaname, p.tablename, clause);
  end loop;
end;
$migration$;

-- HOF-scoped content and the legacy explicit permission registry inherit access.
update public.faq_items set roles = array_append(roles, 'oc'::public.user_role)
  where 'hof'::public.user_role = any(roles) and not ('oc'::public.user_role = any(roles));
update public.gacha_pools set allowed_roles = array_append(allowed_roles, 'oc'::public.user_role)
  where 'hof'::public.user_role = any(allowed_roles) and not ('oc'::public.user_role = any(allowed_roles));
do $migration$
begin
  if to_regclass('public.role_permissions') is not null then
    execute $permissions$
      insert into public.role_permissions (role, permission)
      select 'oc'::public.user_role, h.permission from public.role_permissions h
      where h.role = 'hof'::public.user_role and not exists (
        select 1 from public.role_permissions o
        where o.role = 'oc'::public.user_role and o.permission = h.permission
      )
    $permissions$;
  end if;
end;
$migration$;
