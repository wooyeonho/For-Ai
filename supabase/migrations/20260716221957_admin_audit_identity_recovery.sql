-- Recover the admin identity/audit schema that the application already writes.
-- This is deliberately additive and safe to run against the drifted production
-- shape where admin_audit_events has only id/action/metadata/created_at.

do $$ begin
  create type public.admin_role as enum ('viewer', 'editor', 'verifier', 'moderator', 'admin');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.admin_role not null default 'viewer',
  active boolean not null default true,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.admin_users is 'Admin authorization table mapped to Supabase Auth users. Service-role admin APIs enforce these roles.';

alter table public.admin_users enable row level security;
create index if not exists admin_users_role_idx on public.admin_users (role);

alter table public.admin_audit_events
  add column if not exists admin_user_id uuid,
  add column if not exists admin_user_hash text,
  add column if not exists target_id text;

do $$ begin
  alter table public.admin_audit_events
    add constraint admin_audit_events_admin_user_id_fkey
    foreign key (admin_user_id) references public.admin_users(user_id) on delete set null;
exception
  when duplicate_object then null;
end $$;

-- Preserve a previously captured safe identity hash when it has the expected
-- SHA-256 form. Older rows receive a deterministic non-identifying marker.
update public.admin_audit_events
set admin_user_hash = coalesce(admin_user_hash, case
      when metadata ->> 'admin_user_hash' ~ '^[0-9a-fA-F]{64}$'
        then lower(metadata ->> 'admin_user_hash')
      else encode(sha256('legacy-admin-audit'::bytea), 'hex')
    end),
    target_id = coalesce(target_id, case
      when jsonb_typeof(metadata -> 'target_id') = 'string'
        then metadata ->> 'target_id'
      else null
    end)
where admin_user_hash is null
   or target_id is null;

alter table public.admin_audit_events
  alter column admin_user_hash set not null;

comment on table public.admin_audit_events is 'Admin-only audit trail. Do not store raw IP addresses; use admin_user_id/admin_user_hash and safe metadata only.';
comment on column public.admin_audit_events.admin_user_hash is 'SHA-256 hash of the admin identity or emergency ADMIN_SECRET fallback identity; never a raw IP address.';
comment on column public.admin_audit_events.metadata is 'Safe request/action metadata only. Raw IP addresses and raw user-agent strings are forbidden; store only hashes or non-identifying action fields.';

create index if not exists admin_audit_events_admin_user_id_idx on public.admin_audit_events (admin_user_id);
create index if not exists admin_audit_events_target_id_idx on public.admin_audit_events (target_id);

alter table public.admin_audit_events enable row level security;

-- New objects must not inherit API access accidentally. Admin API handlers use
-- the service-role client after their own authentication/authorization gate.
revoke all on type public.admin_role from public, anon, authenticated;
grant usage on type public.admin_role to service_role;
revoke all on table public.admin_users from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_users to service_role;
revoke all on table public.admin_audit_events from public, anon, authenticated;
grant select, insert on table public.admin_audit_events to service_role;

-- Keep the phase transition and its audit row atomic after admin_user_hash
-- becomes NOT NULL. The prior drift-compatible function wrote identity fields
-- only inside metadata because the dedicated columns did not exist yet.
create or replace function public.set_task5_phase(
  p_phase integer,
  p_reason text,
  p_admin_user_id uuid default null,
  p_admin_user_hash text default null
)
returns public.task5_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.task5_settings;
  result_row public.task5_settings;
  resolved_admin_user_id uuid;
  resolved_admin_user_hash text;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'set_task5_phase: reason is required';
  end if;
  if p_phase < 0 or p_phase > 4 then
    raise exception 'set_task5_phase: phase must be between 0 and 4';
  end if;

  select * into current_row
  from public.task5_settings
  where id = true
  for update;

  if not found then
    raise exception 'set_task5_phase: task5_settings row is missing; cannot transition phase';
  end if;
  if p_phase > current_row.phase + 1 then
    raise exception 'set_task5_phase: phase may only increase by at most 1 per call (current %, requested %)', current_row.phase, p_phase;
  end if;

  select user_id into resolved_admin_user_id
  from public.admin_users
  where user_id = p_admin_user_id and active = true;

  resolved_admin_user_hash := case
    when p_admin_user_hash ~ '^[0-9a-fA-F]{64}$' then lower(p_admin_user_hash)
    else encode(sha256('unknown-admin'::bytea), 'hex')
  end;

  update public.task5_settings
  set phase = p_phase,
      updated_at = now(),
      updated_by = p_admin_user_id
  where id = true
  returning * into result_row;

  insert into public.admin_audit_events (
    admin_user_id,
    admin_user_hash,
    action,
    target_id,
    metadata
  )
  values (
    resolved_admin_user_id,
    resolved_admin_user_hash,
    'task5.phase_changed',
    'task5_settings',
    jsonb_build_object(
      'previous_phase', current_row.phase,
      'new_phase', p_phase,
      'reason', p_reason
    )
  );

  return result_row;
end;
$$;

comment on function public.set_task5_phase(integer, text, uuid, text) is 'Sole writer of task5_settings.phase. Service-role only. Enforces bounded upgrades, immediate downgrade, mandatory reason, and an atomic structured admin audit row.';

revoke all on function public.set_task5_phase(integer, text, uuid, text) from public, anon, authenticated;
grant execute on function public.set_task5_phase(integer, text, uuid, text) to service_role;
