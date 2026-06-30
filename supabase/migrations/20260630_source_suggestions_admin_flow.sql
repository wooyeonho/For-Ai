-- Source suggestion moderation flow.
-- Public contributors can submit source evidence only; admins decide whether it
-- is accepted and whether to convert it into claim_sources.

do $$ begin
  create type source_suggestion_status as enum ('pending', 'accepted', 'rejected', 'duplicate', 'spam');
exception when duplicate_object then null;
end $$;

create table if not exists source_suggestions (
  id uuid primary key default gen_random_uuid(),
  claim_id text not null references claims(id) on delete cascade,
  contributor_hash text not null,
  source_type source_type not null default 'web',
  url text,
  title text,
  citation text,
  domain text,
  status source_suggestion_status not null default 'pending',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint source_suggestions_evidence_required check (
    nullif(trim(coalesce(url, '')), '') is not null
    or nullif(trim(coalesce(title, '')), '') is not null
    or nullif(trim(coalesce(citation, '')), '') is not null
  )
);

comment on table source_suggestions is 'Public source suggestions for claims. They remain unverified until an admin accepts them and optionally converts them into claim_sources.';
comment on column source_suggestions.contributor_hash is 'Salted non-raw contributor identifier. Never store raw IP addresses.';

create index if not exists source_suggestions_claim_id_idx on source_suggestions(claim_id);
create index if not exists source_suggestions_status_created_idx on source_suggestions(status, created_at);
create index if not exists source_suggestions_contributor_hash_idx on source_suggestions(contributor_hash);

alter table source_suggestions enable row level security;

drop policy if exists source_suggestions_public_insert_only on source_suggestions;
create policy source_suggestions_public_insert_only on source_suggestions for insert to anon
  with check (
    status = 'pending'
    and contributor_hash is not null
  );
