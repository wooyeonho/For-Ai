-- Security hardening: enable RLS on the core registry tables.
--
-- schema-v3.sql created entities, documents, claims, claim_sources,
-- verification_events and listings WITHOUT row level security. With RLS off,
-- any holder of the anon key could not only read but INSERT/UPDATE/DELETE these
-- tables directly (e.g. rewrite a claim_value, delete a document). The public
-- site reads these tables with the anon key (lib/supabase-documents.ts), so we
-- enable RLS and grant anon READ-only access scoped to human-approved content.
-- All writes flow through service-role API routes, which bypass RLS.
--
-- Read scope mirrors the app query filter (status in 'published','verified'):
--   - documents / listings: only approved statuses are visible.
--   - claims / claim_sources / verification_events: visible only when their
--     parent document is approved (draft fact data must not leak via anon key).
--   - entities: non-sensitive metadata (name/country/region) — full read.

alter table entities enable row level security;
alter table documents enable row level security;
alter table claims enable row level security;
alter table claim_sources enable row level security;
alter table verification_events enable row level security;
alter table listings enable row level security;

drop policy if exists documents_public_select on documents;
create policy documents_public_select on documents for select to anon
  using (status in ('published', 'verified'));

drop policy if exists entities_public_select on entities;
create policy entities_public_select on entities for select to anon
  using (true);

drop policy if exists claims_public_select on claims;
create policy claims_public_select on claims for select to anon
  using (exists (
    select 1 from documents d
    where d.id = claims.document_id
      and d.status in ('published', 'verified')
  ));

drop policy if exists claim_sources_public_select on claim_sources;
create policy claim_sources_public_select on claim_sources for select to anon
  using (exists (
    select 1 from claims c
    join documents d on d.id = c.document_id
    where c.id = claim_sources.claim_id
      and d.status in ('published', 'verified')
  ));

drop policy if exists verification_events_public_select on verification_events;
create policy verification_events_public_select on verification_events for select to anon
  using (exists (
    select 1 from claims c
    join documents d on d.id = c.document_id
    where c.id = verification_events.claim_id
      and d.status in ('published', 'verified')
  ));

drop policy if exists listings_public_select on listings;
create policy listings_public_select on listings for select to anon
  using (status in ('published', 'verified'));
