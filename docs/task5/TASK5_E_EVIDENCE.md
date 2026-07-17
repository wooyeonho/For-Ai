# Task 5-E — Evidence freshness (Bible v7 Book V §20)

## Implemented contract

- Inspection target is `claim_evidence`, not `claim_sources`. `TASK5_EXISTING_CODE_MAP.md` §6 explicitly deferred whether to unify this with `scripts/jobs/check-source-health.mjs`; the decision recorded in the migration header is: do not unify — different threat model (curated URL recheck vs. quote-bound evidence recheck) and different data model.
- Result taxonomy (`evidence_health_result` enum, matches Book V §20 verbatim): `healthy`, `redirected`, `content_changed`, `evidence_missing`, `not_found`, `temporarily_unavailable`, `blocked`, `fetch_error`.
- `npm run job:check-evidence-freshness` reuses the Task 5-B1 safe-fetch layer (`lib/safe-fetch-external-source.ts`) — compiled ahead of the job run into `.tmp/jobs`, mirroring the existing `npm test` compile pattern — instead of an unguarded `fetch`. Running the bare `.mjs` file without that compile step fails fast with an explicit message.
- HTTP 404 → `not_found`; 403/429 → `temporarily_unavailable` (never `not_found`, per Book V §20).
- Quote disappearance (`verifyQuoteInCanonicalText` throwing `quote_absent`/`quote_multiple`) is the primary signal and maps to `evidence_missing`. A same-URL content-hash change with the quote still intact is the secondary, lower-severity `content_changed` signal.
- `claim_evidence.last_checked_at` updates only on a definitive result (`healthy`/`redirected`/`content_changed`/`evidence_missing`/`not_found`); `last_attempt_at` updates on every attempt, definitive or not.
- `consecutive_failure_count` increments only for inconclusive results (`temporarily_unavailable`/`blocked`/`fetch_error`) and resets to 0 on any definitive result. An operator recheck card in `evidence_recheck_cards` opens only once this reaches 3 (`TEMPORARY_FAILURE_THRESHOLD`), or immediately for `evidence_missing`/`not_found`.
- No automatic citation downgrade: this job never writes `claims.status`, `claims.publication_state`, or anything citation-status related. It only appends to `evidence_health_checks` and opens/queues `evidence_recheck_cards` for a human.
- "Other valid sources prevent whole claim downgrade" is implemented as a severity signal only (`other_valid_evidence_count` on the card, computed from sibling `claim_evidence` rows on the same `claims.published_claim_version_id`) — it downgrades card severity from `high` to `medium`, it never suppresses the card and never changes claim status.
- `claim_evidence.valid_until` is a new nullable freshness-profile column; when set and overdue it sorts ahead of the rest of the recheck queue (`compareQueuePriority`). No writer sets this column in this PR — it is reserved for a future evidence-writer change; a null value has no effect on ordering.

## Files

- `supabase/migrations/20260717090512_task5_e_evidence_freshness.sql` + mirrored append to `schema-v3.sql` (SSOT convention): `evidence_health_result` enum, `claim_evidence` freshness columns, `evidence_health_checks` (append-only, immutable-trigger-protected like `risk_assessments`), `evidence_recheck_cards` (operator queue, one open card per `claim_evidence_id`).
- `scripts/lib/evidence-freshness.mjs` — pure, dependency-free classification/prioritization functions (unit tested).
- `scripts/jobs/check-evidence-freshness.mjs` — the cron job; the only caller that performs I/O.
- `scripts/stub-server-only-for-tests.mjs` — generalized to accept a target directory argument so the same "server-only" stub shadows the compile output for both `.tmp/tests` (existing) and `.tmp/jobs` (new).
- `package.json` — new `job:check-evidence-freshness` script (compile → stub → run); new test file wired into `npm test`.
- `test/evidence-freshness.test.mjs` — 12 cases covering the 404-vs-403/429 distinction, temporary vs. definitive classification, the 3-strike card threshold, severity downgrade from other evidence, and queue prioritization.
- `docs/operations/PRODUCTION_OPERATIONS_RUNBOOK.md` — new job row plus evidence-capture row.

## Verification

- `npm test` — 230/230 passing (12 new).
- `npm run typecheck` — clean.
- `npm run lint` — 0 errors (pre-existing warning count unchanged).
- `npm run ci:guards` — all guards pass, including `schema-types` and `db-privileges` (unaffected — no changes to the enums/checks those guards track).
- Manually ran `npm run job:check-evidence-freshness` end-to-end against no Supabase credentials: compiles `lib/safe-fetch-external-source.ts` into `.tmp/jobs/lib/safe-fetch-external-source.js`, stubs `server-only` there, imports cleanly, and fails only on the expected missing `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (identical failure mode to every other `job:*` script run outside production).
- Manually ran the bare `.mjs` file without compiling first and confirmed the fail-closed guard message.

## Rollback

Pause the cron entry for `job:check-evidence-freshness`. No automatic status changes exist to unwind — `claim_evidence`, `evidence_health_checks`, and `evidence_recheck_cards` are additive/append-only and safe to leave in place. Rollback never deletes audit/provenance history, per Book V §22.
