-- Admin audit log for x-admin-secret API hardening.
create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  target_table text,
  target_id text,
  previous_state jsonb,
  new_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_action_type_idx on admin_audit_logs(action_type);
create index if not exists admin_audit_logs_target_idx on admin_audit_logs(target_table, target_id);
create index if not exists admin_audit_logs_created_idx on admin_audit_logs(created_at desc);

alter table admin_audit_logs enable row level security;
