
create table admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  target_table text not null,
  target_id text not null,
  previous_state jsonb,
  new_state jsonb,
  actor_type text not null default 'x-admin-secret',
  request_path text,
  created_at timestamptz not null default now()
);

create index admin_audit_events_target_idx on admin_audit_events(target_table, target_id, created_at desc);
create index admin_audit_events_action_idx on admin_audit_events(action_type, created_at desc);

alter table admin_audit_events enable row level security;

-- No public policies: admin audit events are written through service_role API routes only.
