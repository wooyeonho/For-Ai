-- Community posts: users, AI (aiai), and admins can all leave posts.
-- Posts can optionally link to a document.
create table community_posts (
  id              uuid primary key default gen_random_uuid(),
  document_id     text,
  author_type     text not null default 'user'
                  check (author_type in ('user', 'ai', 'admin')),
  author_name     text not null default '익명',
  content         text not null,
  contributor_hash text,
  status          text not null default 'pending'
                  check (status in ('pending', 'published', 'hidden', 'spam', 'deleted')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index community_posts_document_id_idx on community_posts(document_id);
create index community_posts_status_idx      on community_posts(status);
create index community_posts_created_idx     on community_posts(created_at desc);
create index community_posts_author_type_idx on community_posts(author_type);

alter table community_posts enable row level security;

-- Public anon: can submit user/ai posts for review and read published posts.
create policy community_posts_public_insert
  on community_posts for insert to anon
  with check (status = 'pending' and author_type in ('user', 'ai'));

create policy community_posts_public_select
  on community_posts for select to anon
  using (status = 'published');

-- Document stats: track view_count and ai_citation_count per document.
create table document_stats (
  document_id       text primary key,
  view_count        bigint not null default 0,
  ai_citation_count bigint not null default 0,
  updated_at        timestamptz not null default now()
);

alter table document_stats enable row level security;

-- Public anon: can read stats and upsert (for incrementing counters).
create policy document_stats_public_select
  on document_stats for select to anon
  using (true);

create policy document_stats_public_insert
  on document_stats for insert to anon
  with check (true);

create policy document_stats_public_update
  on document_stats for update to anon
  using (true)
  with check (true);
