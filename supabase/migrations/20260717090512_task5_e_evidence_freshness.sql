-- Bible v7 Task 5-E: claim_evidence-level freshness/health checking.
--
-- Scope decision (Codex rule 9 — minor implementation choices not spelled out
-- in the Bible are recorded here instead of invented silently):
--   - Inspection target is claim_evidence (per-quote Task 5 evidence graph),
--     NOT claim_sources (the legacy admin-curated source list already
--     rechecked by scripts/jobs/check-source-health.mjs). TASK5_EXISTING_CODE_MAP.md
--     §6 explicitly deferred "whether to unify" the two checkers to this task;
--     the decision is: do not unify. The threat model and data model differ
--     (admin-curated URL vs. quote-bound source_snapshot), so this PR adds a
--     new, separate job/table pair instead of touching check-source-health.mjs.
--   - claim_evidence.valid_until is added as a nullable freshness-profile
--     column for queue prioritization, but no writer sets it in this PR
--     (Task 5-B1/5-B2 evidence insert paths are unchanged). A null value
--     simply means "no forced recheck schedule" and does not affect ordering.
--   - This migration never touches claims.status, claims.publication_state,
--     or citation_status. Per Bible Book V §20, freshness checks never
--     auto-downgrade a citation; they only log history and open an operator
--     recheck card.

create type public.evidence_health_result as enum (
  'healthy',
  'redirected',
  'content_changed',
  'evidence_missing',
  'not_found',
  'temporarily_unavailable',
  'blocked',
  'fetch_error'
);

alter table public.claim_evidence
  add column if not exists last_checked_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists consecutive_failure_count integer not null default 0,
  add column if not exists valid_until timestamptz;

comment on column public.claim_evidence.last_checked_at is
  'Set only when a Task 5-E health check reaches a definitive result (healthy/redirected/content_changed/evidence_missing/not_found). Inconclusive/temporary results do not move this timestamp.';
comment on column public.claim_evidence.last_attempt_at is
  'Set on every Task 5-E health check attempt, definitive or not.';
comment on column public.claim_evidence.consecutive_failure_count is
  'Consecutive temporarily_unavailable/blocked/fetch_error results since the last definitive result. Reset to 0 by any definitive result. An operator recheck card opens once this reaches the job''s temporary-failure threshold (3, per Bible Book V §20).';
comment on column public.claim_evidence.valid_until is
  'Optional freshness-profile deadline. When set and overdue, Task 5-E prioritizes this row in its recheck queue ahead of rows ordered only by last_checked_at. Not written by this migration — reserved for a future evidence-writer PR.';

-- =============================================================================
-- evidence_health_checks — append-only per-check history (mirrors the
-- risk_assessments/source_snapshots immutability pattern already established
-- by Task 5-0/5-B1)
-- =============================================================================

create table public.evidence_health_checks (
  id uuid primary key default gen_random_uuid(),
  claim_evidence_id uuid not null references public.claim_evidence(id) on delete cascade,
  result public.evidence_health_result not null,
  is_temporary boolean not null,
  http_status integer,
  detail jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);

comment on table public.evidence_health_checks is
  'Append-only. One row per Task 5-E health-check attempt against a claim_evidence row''s source. Never mutates claims/citation_status; the operator recheck card (evidence_recheck_cards) is the only human-facing surface this feeds.';

create index evidence_health_checks_claim_evidence_idx
  on public.evidence_health_checks (claim_evidence_id, checked_at desc);

create trigger evidence_health_checks_immutable_update
before update on public.evidence_health_checks
for each row execute function public.task5_reject_mutation();

create trigger evidence_health_checks_immutable_delete
before delete on public.evidence_health_checks
for each row execute function public.task5_reject_mutation();

alter table public.evidence_health_checks enable row level security;
revoke all on table public.evidence_health_checks from public, anon, authenticated;
grant select, insert on table public.evidence_health_checks to service_role;

-- =============================================================================
-- evidence_recheck_cards — operator queue. One open card per claim_evidence_id
-- at a time (partial unique index), so repeated failing checks update the
-- existing card's severity signal via the job rather than spamming duplicates.
-- =============================================================================

create table public.evidence_recheck_cards (
  id uuid primary key default gen_random_uuid(),
  claim_evidence_id uuid not null references public.claim_evidence(id) on delete cascade,
  claim_id text not null references public.claims(id) on delete cascade,
  reason public.evidence_health_result not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  other_valid_evidence_count integer not null default 0,
  status text not null default 'open' check (status in ('open', 'resolved')),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  check (
    (status = 'open' and resolved_at is null and resolved_by is null)
    or
    (status = 'resolved' and resolved_at is not null)
  )
);

comment on table public.evidence_recheck_cards is
  'Operator-facing queue opened by Task 5-E when a health check finds a definitive negative result (evidence_missing/not_found) or the temporary-failure threshold is reached. This table itself never changes claim status, publication_state, or citation_status — resolving a card is a manual operator action recorded via admin_audit_events by the resolving route (a later PR), not by this migration.';
comment on column public.evidence_recheck_cards.other_valid_evidence_count is
  'Snapshot, at card-open time, of how many other claim_evidence rows on the same published claim_version were still healthy. Informs operator triage severity only (per Bible Book V §20: "other valid sources prevent whole claim downgrade") — it never suppresses the card and never touches claim status.';

create unique index evidence_recheck_cards_open_unique
  on public.evidence_recheck_cards (claim_evidence_id)
  where status = 'open';

create index evidence_recheck_cards_queue_idx
  on public.evidence_recheck_cards (severity desc, opened_at asc)
  where status = 'open';

alter table public.evidence_recheck_cards enable row level security;
revoke all on table public.evidence_recheck_cards from public, anon, authenticated;
grant select, insert, update on table public.evidence_recheck_cards to service_role;
