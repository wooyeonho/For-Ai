-- Applied as production migration 20260717074909.
-- Task 5-P1 advisor follow-up: cover publication-ledger and claim-version FKs.

create index if not exists assisted_review_events_admin_user_idx
  on public.assisted_review_events (admin_user_id);
create index if not exists assisted_review_events_risk_idx
  on public.assisted_review_events (risk_assessment_id)
  where risk_assessment_id is not null;
create index if not exists assisted_review_events_policy_idx
  on public.assisted_review_events (verification_policy_version)
  where verification_policy_version is not null;
create index if not exists notification_outbox_recipient_idx
  on public.notification_outbox (recipient_id);

create index if not exists claims_current_claim_version_idx
  on public.claims (current_claim_version_id)
  where current_claim_version_id is not null;
create index if not exists claims_published_claim_version_idx
  on public.claims (published_claim_version_id)
  where published_claim_version_id is not null;
