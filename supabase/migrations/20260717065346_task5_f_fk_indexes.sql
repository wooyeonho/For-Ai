-- Task 5-F advisor follow-up: cover report and correction-ledger foreign keys
-- before these queues accumulate production volume.

create index if not exists reports_document_id_idx
  on public.reports (document_id) where document_id is not null;
create index if not exists reports_entity_id_idx
  on public.reports (entity_id) where entity_id is not null;
create index if not exists claim_correction_events_db_claim_id_idx
  on public.claim_correction_events (db_claim_id) where db_claim_id is not null;
create index if not exists claim_correction_events_claim_version_id_idx
  on public.claim_correction_events (claim_version_id) where claim_version_id is not null;
