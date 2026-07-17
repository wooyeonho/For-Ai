# Task 5-E — Evidence Freshness

## Contract

Task 5-E inspects `claim_evidence.id`, not generic source rows. It reuses `safeFetchExternalSource`, re-finds the exact stored quote in current canonical text, and records one of:

`healthy`, `redirected`, `content_changed`, `evidence_missing`, `not_found`, `temporarily_unavailable`, `blocked`, `fetch_error`.

The worker never changes `claims.status`, `claims.confidence`, citation status, publication state, or verification events. Every non-healthy result is an operator input only.

## Safety behavior

- 403 is `blocked`; 429 and 5xx are `temporarily_unavailable`; neither is treated as not-found.
- Quote disappearance is primary. A changed page that still contains the quote is `content_changed`.
- Temporary outcomes require three consecutive attempts before an operator card opens.
- `content_changed`, `evidence_missing`, and `not_found` open a card immediately.
- Cards retain the count of other currently healthy evidence rows so one bad source cannot silently downgrade the whole claim.
- Claims past `valid_until` are leased first.
- Successful fetches update `last_checked_at`; every attempt updates `last_attempt_at`.
- The emergency Task 5 kill switch stops the cron route without mutating evidence state.

## Components

- `lib/task5-freshness.ts` — classification, safe fetch, quote re-validation, worker batch.
- `app/api/cron/task5-freshness/route.ts` — secret-protected worker endpoint.
- `supabase/migrations/20260717153000_task5_e_freshness.sql` — leases, immutable checks, mutable state, operator cards, least privilege.
- `scripts/jobs/check-source-health.mjs` — compatibility wrapper that invokes the safe application worker; direct `HEAD` fetching was removed.
- `test/task5-freshness.test.ts` — result precedence and HTTP classification coverage.

## Verification required before merge

- TypeScript, tests, lint, CI guards, and production build green.
- Migration applied to a non-production database and rollback-only smoke completed.
- Supabase security and performance advisors reviewed.
- Production remains Phase 0 with drafting disabled.
- Production smoke confirms unauthorized cron calls fail closed and the authorized empty-queue run succeeds.
