-- Admin createUser writes the role after the insert, and the signup trigger
-- rejects that insert. This provisions the shared Freshie account in one
-- statement so the role is present when the trigger runs. Callers pass the
-- stored password, not the 4 digits shown to the group.

create or replace function public.fn_provision_group_login(
  p_email text,
  p_password text,
  p_name text,
  p_group_id integer
) returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_id uuid;
begin
  if p_email is null or p_password is null or length(p_password) < 8 then
    raise exception 'INVALID_GROUP_LOGIN';
  end if;

  select id into v_id from auth.users where email = p_email;

  if v_id is null then
    v_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_id,
      'authenticated',
      'authenticated',
      p_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')),
      now(),
      jsonb_build_object(
        'provider', 'email',
        'providers', jsonb_build_array('email'),
        'role', 'freshie'
      ),
      jsonb_build_object('full_name', coalesce(p_name, '')),
      now(),
      now(),
      '', '', '', '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(),
      v_id,
      v_id::text,
      jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true),
      'email',
      now(), now(), now()
    );
  else
    update auth.users
    set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'freshie'),
        updated_at = now()
    where id = v_id;
  end if;

  update public.profiles
  set role = 'freshie',
      full_name = coalesce(p_name, full_name),
      group_id = p_group_id
  where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.fn_provision_group_login(text, text, text, integer) from public;
grant execute on function public.fn_provision_group_login(text, text, text, integer) to service_role;
