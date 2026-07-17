-- Task 5-E defense in depth for immutable inspection history and private queues.
-- Runs immediately after 20260717153000_task5_e_freshness.sql.

create trigger evidence_freshness_checks_immutable_update
before update on public.evidence_freshness_checks
for each row execute function public.task5_reject_mutation();

create trigger evidence_freshness_checks_immutable_delete
before delete on public.evidence_freshness_checks
for each row execute function public.task5_reject_mutation();

revoke all on table public.evidence_freshness_state
  from public, anon, authenticated;
revoke all on table public.evidence_freshness_checks
  from public, anon, authenticated;
revoke all on table public.freshness_review_cards
  from public, anon, authenticated;

comment on table public.evidence_freshness_checks is
  'Append-only Task 5-E inspection history. UPDATE and DELETE are rejected by trigger; freshness results never automatically change claim verification or publication state.';
comment on table public.freshness_review_cards is
  'Private operator recheck queue. A card is an investigation input only and never automatically downgrades a claim.';
