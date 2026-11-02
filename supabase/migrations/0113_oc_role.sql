-- Commit this enum addition before applying 0114 (Postgres enum visibility).
alter type public.user_role add value if not exists 'oc';
