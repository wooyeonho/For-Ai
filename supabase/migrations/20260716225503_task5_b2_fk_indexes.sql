-- Task 5-B2 follow-up (applied 20260716225503): cover service-only lifecycle foreign keys.

create index if not exists wanted_claims_draft_claim_id_idx
  on public.wanted_claims (draft_claim_id) where draft_claim_id is not null;
create index if not exists wanted_claims_published_claim_id_idx
  on public.wanted_claims (published_claim_id) where published_claim_id is not null;
create index if not exists draft_attempts_source_snapshot_id_idx
  on public.draft_attempts (source_snapshot_id) where source_snapshot_id is not null;
create index if not exists draft_attempts_claim_id_idx
  on public.draft_attempts (claim_id) where claim_id is not null;
create index if not exists cost_ledger_provider_idx
  on public.cost_ledger (provider);
create index if not exists task5_cost_events_attempt_id_idx
  on public.task5_cost_events (attempt_id);
create index if not exists task5_cost_events_provider_idx
  on public.task5_cost_events (provider);
