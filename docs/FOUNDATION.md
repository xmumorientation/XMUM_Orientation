# Big Game shared foundation

This project targets the current XMUM orientation. It is intentionally not a
multi-event platform: future orientations may fork the repository and change
their gameplay model independently.

## Identity and roles

Supabase Auth owns identity. `auth.users.id` maps one-to-one to
`public.profiles.id`. Application authorization has exactly four roles:

- `freshie`
- `faci`
- `gm`
- `admin`

HOF, HOGM, and TECH accounts use the `admin` role. Their optional
`profiles.admin_team` value describes the team but never grants a separate
permission level.

## Allocation boundaries

`user_group_assignments` is the canonical Faci account assignment interface.
Freshie allocation remains in the registration module's `freshies.group_id`
roster because Freshies do not have Auth profiles. Both may validly remain
unassigned until Admin completes allocation.

`gm_station_assignments` is the canonical GM assignment interface. Assignments
are unique per `(user_id, day)`, where day is 1 or 2. Do not infer ownership
from a station ID supplied by a client.

The older `profiles.group_id` and `profiles.station_id` fields remain only for
temporary compatibility while existing screens are migrated section by
section. New server code should use `fn_current_user_context` through
`src/lib/context.ts`.

## Server authority

Ownership-sensitive server operations must resolve the signed-in user and
their allocation on the server. They should reject missing roles, groups,
stations, or invalid days before changing gameplay state.

Shared identifiers use PostgreSQL/TypeScript snake-case at storage boundaries:

- `user_id`
- `group_id`
- `station_id`
- `role`
- `day`
- `request_id`
- `transaction_id`
- `idempotency_key`

## Module boundaries

Modules should communicate through named server interfaces. For example, Blind
Box should call the future Token credit interface instead of directly updating
the group balance. Until a later module exists, use a typed placeholder rather
than temporary gameplay logic.

Configuration remains in `game_config`. Gameplay values must be read through
shared configuration helpers and must not be embedded in shared components or
authorization logic.

## Audit and retry conventions

Important mutations should create a request ID and transaction ID, accept an
idempotency key, and record the actor, reason, and before/after state. The
`idempotency_requests` table reserves `(module, idempotency_key)` uniquely so a
later module can safely return the original result for a retried request.

## Notifications

Shared notification severities are `SUCCESS`, `WARNING`, `ERROR`, and `INFO`.
Targets may be a user, group, station, or role. Later realtime delivery must
route only to the intended target; ordinary gameplay notifications must not be
broadcast globally.
