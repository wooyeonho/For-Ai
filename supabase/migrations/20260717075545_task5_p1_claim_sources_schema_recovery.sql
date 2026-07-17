-- Applied as production migration 20260717075545.
-- Task 5-P1 brownfield recovery: production's claim_sources table predates
-- the canonical schema-v3 source review fields. Restore only those additive
-- columns so assisted publication and the existing verification UI share the
-- same source contract. Existing rows keep conservative defaults.

do $$
begin
  create type public.source_authority as enum (
    'primary', 'official', 'regulator', 'legal', 'platform',
    'secondary', 'community', 'unknown'
  );
exception
  when duplicate_object then null;
end;
$$;

alter table public.claim_sources
  add column if not exists source_authority public.source_authority not null default 'unknown',
  add column if not exists source_domain text,
  add column if not exists detected_language text,
  add column if not exists page_type text,
  add column if not exists lang text,
  add column if not exists source_check_status text not null default 'unchecked'
    check (source_check_status in ('unchecked', 'passed', 'warning', 'failed')),
  add column if not exists source_trust_score integer not null default 0
    check (source_trust_score between 0 and 100),
  add column if not exists source_check_notes text;

comment on column public.claim_sources.source_domain is
  'Normalized domain used only for review aids; not canonical factual evidence.';
comment on column public.claim_sources.detected_language is
  'Detected source-page language for review context; does not prove claim truth.';
comment on column public.claim_sources.page_type is
  'Detected page type for review assistance only; cannot publish or verify a claim.';
comment on column public.claim_sources.lang is
  'Original source language; preserve instead of translating source identity.';
