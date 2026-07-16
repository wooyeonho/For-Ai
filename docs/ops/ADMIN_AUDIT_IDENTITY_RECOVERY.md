# Admin audit identity recovery

## Scope

This recovery closes the schema drift between the admin API and the production
audit table without applying unrelated historical migrations.

- creates the missing `admin_role` type and service-only `admin_users` table
- adds `admin_user_id`, `admin_user_hash`, and `target_id` to
  `admin_audit_events`
- preserves a valid hash/target carried in legacy JSON metadata and assigns a
  deterministic non-identifying marker otherwise
- keeps both admin tables behind RLS with no `anon` or `authenticated` table
  privileges
- updates `set_task5_phase` so its phase write and structured audit insert
  remain atomic after `admin_user_hash` becomes required

The recovery intentionally does not apply the other drifted community,
gamification, source-contribution, or Task 5-B2 tables.

## Preflight evidence

Before the forward migration, production had:

- one small `admin_audit_events` row and RLS enabled
- only `id`, `action`, `metadata`, and `created_at` on that table
- no `admin_users` table or `admin_role` type
- no grants for `anon` or `authenticated` on the audit table
- the service-role-only `set_task5_phase(integer,text,uuid,text)` function

This makes the additive/backfill operation bounded while preserving the
existing least-privilege boundary.

## Verification contract

After applying the migration, verify all of the following against the live
database:

1. Both admin tables have RLS enabled and zero public policies.
2. `anon` and `authenticated` have no table privileges on either admin table.
3. `service_role` can read admin users and insert/read audit rows.
4. Every audit row has a non-null 64-character SHA-256 identity hash.
5. The three recovered columns and their two lookup indexes exist.
6. `set_task5_phase` remains executable only by `service_role`.
7. A same-phase RPC smoke call succeeds, writes a structured audit row, and
   does not change the configured phase.

The smoke row should use an explicit operations reason and may be retained as
part of the forensic trail.

## Operational use

Admin membership remains an explicit operation: insert an existing
`auth.users.id` into `admin_users`, choose the least-powerful role, and keep
`active = true` only while access is required. Never grant direct API access to
the table and never store raw IP addresses or raw user-agent strings in audit
metadata.

If an audit insert fails, treat it as an operational error. Do not weaken the
NOT NULL identity requirement or grant browser roles direct table access.

## Applied result

Migration `20260716221957_admin_audit_identity_recovery` was applied on
2026-07-17 KST. Live verification passed the complete contract:

- both tables have RLS enabled and zero policies
- browser roles have no table access and cannot execute the phase RPC
- service role has the intended table access and sole RPC execution privilege
- no audit row has a missing or malformed identity hash
- all recovered columns and indexes exist
- a same-phase phase-0 smoke call completed atomically and wrote its structured
  `task5_settings` audit record without changing the configured phase
