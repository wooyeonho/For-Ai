-- AI generation safety controls: kill switch config and admin-actor usage ledger.
-- Public/anon clients must not read or write these operational controls.

create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_generation_usage (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  admin_actor_hash text not null,
  provider text not null,
  model text not null,
  requested_count integer not null check (requested_count > 0),
  generated_count integer check (generated_count is null or generated_count >= 0),
  max_output_tokens integer not null check (max_output_tokens > 0),
  status text not null check (status in ('reserved', 'completed', 'failed', 'blocked')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists ai_generation_usage_actor_created_idx
  on public.ai_generation_usage (admin_actor_hash, created_at desc);

create index if not exists ai_generation_usage_request_idx
  on public.ai_generation_usage (request_id);

insert into public.app_config (key, value, description)
values ('ai_generation_disabled', 'false'::jsonb, 'Emergency kill switch for admin AI candidate generation.')
on conflict (key) do nothing;

alter table public.app_config enable row level security;
alter table public.ai_generation_usage enable row level security;

drop policy if exists "service role manages app config" on public.app_config;
create policy "service role manages app config"
  on public.app_config
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages ai generation usage" on public.ai_generation_usage;
create policy "service role manages ai generation usage"
  on public.ai_generation_usage
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
