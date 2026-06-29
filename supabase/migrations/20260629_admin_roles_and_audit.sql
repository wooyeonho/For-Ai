-- Role-based admin authorization and safer audit identity fields.
-- Admin APIs use service-role access to read admin_users; no public policies are
-- added here.

do $$ begin
  create type admin_role as enum ('viewer', 'editor', 'verifier', 'moderator', 'admin');
exception
  when duplicate_object then null;
end $$;

create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role admin_role not null default 'viewer',
  active boolean not null default true,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table admin_users is 'Admin authorization table mapped to Supabase Auth users. Service-role admin APIs enforce these roles.';

alter table admin_users enable row level security;
create index if not exists admin_users_role_idx on admin_users (role);

alter table admin_audit_events
  add column if not exists admin_user_id uuid references admin_users(user_id) on delete set null,
  add column if not exists admin_user_hash text,
  add column if not exists target_id text;

update admin_audit_events
set admin_user_hash = encode(sha256('legacy-admin-audit'::bytea), 'hex')
where admin_user_hash is null;

alter table admin_audit_events
  alter column admin_user_hash set not null;

comment on table admin_audit_events is 'Admin-only audit trail. Do not store raw IP addresses; use admin_user_id/admin_user_hash and safe metadata only.';
comment on column admin_audit_events.admin_user_hash is 'SHA-256 hash of the admin identity or emergency ADMIN_SECRET fallback identity; never a raw IP address.';
comment on column admin_audit_events.metadata is 'Safe request/action metadata only. Raw IP addresses are forbidden.';

create index if not exists admin_audit_events_admin_user_id_idx on admin_audit_events (admin_user_id);
create index if not exists admin_audit_events_target_id_idx on admin_audit_events (target_id);
