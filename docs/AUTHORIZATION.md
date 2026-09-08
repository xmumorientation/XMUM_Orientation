# Authentication and authorization

## Account creation

Authentication and gameplay allocation are separate. Supabase Auth owns the
credential; `profiles` owns the four-role account registry; shared assignment
tables own group and station allocation.

- Freshies are registered in the counter roster and do not receive Supabase
  Auth accounts.
- Faci, GM, and Admin accounts are provisioned by Admin. The default future
  method is `admin_invite`; Section 4 may expose invite and temporary-password
  alternatives without changing authentication.
- Public Auth registration is disabled; a public user cannot choose a role.
- A valid Faci account may have no group, and a GM may have no station
  for one or both days.

## Central permissions

`role_permissions` is the canonical role-to-capability registry.
`fn_current_user_context` returns its permission list with the authenticated
user's canonical group and current-day station. Navigation and middleware
consume that list. Server API routes call `requirePermission`; database RLS and
security-definer RPC checks remain the final data boundary.

Adding a navigation item never grants access by itself. A new module must:

1. define its permission in `src/lib/permissions.ts` and a migration;
2. assign it to the intended roles in `role_permissions`;
3. associate its route prefix in `ROUTE_PERMISSIONS`;
4. check the permission and canonical allocation in backend mutations;
5. enforce record ownership with RLS/RPC validation.

## Authentication audit

The server records `auth.login`, `auth.logout`, and `auth.login_failed`.
Failed attempts store a one-way identifier hash, never the
password or raw identifier. A session on multiple devices is permitted;
gameplay modules remain responsible for database constraints and idempotency.

## Unified Admin area

There is no Committee role or separate Committee navigation. Operations lives
at `/admin/operations`; the legacy `/committee` URL redirects there. HOF,
HOGM, and TECH use the Admin role with optional descriptive `admin_team`
metadata.
