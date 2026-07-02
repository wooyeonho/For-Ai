-- P1 scale: replace full/sequential scans in /api/search with trigram indexes.
--
-- app/api/search/route.ts filters with `ILIKE '%q%'` on documents.title and
-- claims.claim_value. A leading '%' disables B-tree indexes, so as the registry
-- grows every search becomes a sequential scan. pg_trgm GIN indexes make
-- unanchored ILIKE index-searchable with no query rewrite required.

create extension if not exists pg_trgm;

create index if not exists documents_title_trgm_idx
  on documents using gin (title gin_trgm_ops);

create index if not exists claims_value_trgm_idx
  on claims using gin (claim_value gin_trgm_ops);
