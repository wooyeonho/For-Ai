-- Public suggestions are private, insert-only intake records.
create table if not exists topic_suggestions (
  id uuid primary key default gen_random_uuid(),
  contributor_hash text not null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  question text not null,
  category text not null,
  reason text not null,
  related_url text,
  source_url text,
  status text not null default 'new' check (status in ('new','triaged','generated','rejected','promoted')),
  reviewed_by text,
  reviewed_at timestamptz
);

alter table topic_suggestions enable row level security;
drop policy if exists topic_suggestions_public_insert_only on topic_suggestions;
create policy topic_suggestions_public_insert_only
  on topic_suggestions for insert to anon
  with check (status = 'new');
