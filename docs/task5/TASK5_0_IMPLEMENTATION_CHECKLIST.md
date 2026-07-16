# Task 5-0 Implementation Checklist

Source of truth: `docs/For-Ai_50-Year_Operating_Implementation_Bible_v7.md` Task 5-0 contract.

## Scope control

- [ ] Implement **Task 5-0 only**.
- [ ] Write `docs/task5/TASK5_EXISTING_CODE_MAP.md` before implementation.
- [ ] Add characterization tests before implementation changes.
- [ ] Attach code map, characterization, reconciliation output, rollback SQL, and privilege before/after to the PR.

## Schema

- [ ] Add `claim_versions` without `risk_class`.
- [ ] Keep `claim_versions` immutable.
- [ ] Add `unique(claim_id, version)`.
- [ ] Do **not** add `unique(claim_id, text_hash)`.
- [ ] Allow historical same-hash revert.
- [ ] Only reject immediate prior-version same-hash no-op if enforced.
- [ ] Add append-only `risk_assessments`.
- [ ] Query latest risk as `ORDER BY created_at DESC, id DESC LIMIT 1`.
- [ ] Add risk index `(claim_version_id, created_at DESC, id DESC)`.
- [ ] Ensure publish RPC verifies latest `final_result = normal` and current deterministic policy version.
- [ ] Add immutable `source_snapshots` with canonical URL, final URL, `retrieved_at`, hashes, normalized text or private storage pointer.
- [ ] Do **not** expose public full source snapshot text.
- [ ] Add `claim_evidence` linked to claim version and source snapshot.
- [ ] Store quote offset/hash, context hash, relation, and unique relation coordinates.
- [ ] Add append-only `verification_policies` versions.
- [ ] Support policy modes `assisted_operator` and `crowd` while keeping Phase 1 assisted policy only.
- [ ] Add canonical publication columns: `content_origin`, `current_claim_version_id`, `published_claim_version_id`, `publication_state`, `publication_mode`, `published_at`, `freshness_profile`, `valid_from`, `valid_until`.
- [ ] Implement `task5_settings` as the DB SSOT for phase.
- [ ] Allow phase changes only through `set_task5_phase` RPC.
- [ ] Keep `TASK5_EMERGENCY_DISABLE` deny-only.

## Permissions and publication boundary

- [ ] Forbid Task 5 AI direct claim status updates.
- [ ] Forbid Task 5 AI direct publication updates.
- [ ] Enforce the new publication boundary first only for `task5_ai` claims.
- [ ] Preserve the legacy/admin flow during Task 5-0.
- [ ] Do not create a Phase 0 publication path.
- [ ] Do not create `finalize_ai_claim_review` implementation.
- [ ] Do not create a `crowd_auto` creation path.
- [ ] Do not allow high or unknown risk automatic publication.
- [ ] Do not use direct `UPDATE` as the publication path.
- [ ] Use a transactional outbox for publication-side effects.

## Backfill and legacy preservation

- [ ] Backfill current legacy claim text to version 1.
- [ ] Backfill existing claims as `content_origin = legacy_manual` and `publication_mode = manual_legacy`.
- [ ] Preserve existing public status/citation status.
- [ ] Do not change existing claim IDs.
- [ ] Do not change existing slugs.
- [ ] Do not change existing URLs.
- [ ] Do not fabricate historical risk, snapshots, or quotes.
- [ ] Do not delete provenance or audit history.

## External source, AI, report, and downgrade guardrails

- [ ] Use `safeFetchExternalSource` as the only external URL fetch path.
- [ ] Do not grant AI network permissions.
- [ ] Do not grant AI tool permissions.
- [ ] Do not grant AI DB permissions.
- [ ] Ensure reports do not automatically quarantine claims.
- [ ] Ensure source errors do not automatically downgrade citation status.

## CI guard allowlist

- [ ] CI guard blocks `finalize_ai_claim_review` implementation.
- [ ] CI guard blocks `crowd_auto` creation path.
- [ ] Allow only documented exceptions: docs/markdown, future check constraint declarations, explicit `// task5-guard-allow`, and guard allowlist file constants.

## PR body required records per Task 5 PR

- [ ] DB migration summary.
- [ ] RLS changes.
- [ ] GRANT changes.
- [ ] RPC changes.
- [ ] Caller role matrix.
- [ ] Phase gate metrics and human approval status.
- [ ] Confirmation that DB phase was not raised unless quantitative Phase gate was met.
- [ ] Confirmation that the next Task branch is not created until current Task merge and production smoke complete.
