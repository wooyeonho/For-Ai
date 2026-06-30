-- Sponsored placements are monetization surfaces, not fact-verification inputs.
-- They must be operated separately from canonical claims / claim_sources /
-- verification_events and must always display a Sponsored disclosure.

alter table sponsored_placements
  add column if not exists updated_at timestamptz not null default now();

alter table sponsored_placements
  drop constraint if exists sponsored_placements_label_required,
  add constraint sponsored_placements_label_required
    check (lower(display_label) like '%sponsored%' or lower(display_label) like '%ad%');

comment on table sponsored_placements is
  'Sponsored promotional placements. MUST always render with a visible "Sponsored" label. Never blends with verified facts and never affects claim verification status.';
comment on column sponsored_placements.display_label is
  'Disclosure label only. This must not be interpreted as verification_status, source trust, or citation readiness.';
comment on column sponsored_placements.entity_id is
  'Targeting scope for promotional display only; sponsored_placements intentionally has no claim_id and cannot verify claims.';

drop policy if exists sponsored_placements_public_active_select on sponsored_placements;
create policy sponsored_placements_public_active_select on sponsored_placements for select to anon
  using (
    is_active
    and lower(display_label) like '%sponsored%'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

-- Guardrail assertion for reviewers: sponsored_placements has no claim_id column
-- and no trigger/function may promote a claim based on sponsorship. Verified claim
-- promotion remains exclusively guarded by claims_require_human_verification and
-- promote_claim_with_human_verification in schema-v3-monetization.sql.
