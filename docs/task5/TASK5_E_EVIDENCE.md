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
- Check history is append-only: UPDATE and DELETE are rejected by the shared Task 5 immutability trigger.
- The emergency Task 5 kill switch stops the cron route without mutating evidence state.

## Components

- `lib/task5-freshness.ts` — classification, safe fetch, quote re-validation, worker batch.
- `app/api/cron/task5-freshness/route.ts` — secret-protected worker endpoint.
- `supabase/migrations/20260717153000_task5_e_freshness.sql` — leases, checks, mutable scheduling state, operator cards, and least privilege.
- `supabase/migrations/20260717153100_task5_e_freshness_hardening.sql` — append-only history triggers and explicit private-table revokes.
- `scripts/jobs/check-source-health.mjs` — compatibility wrapper that invokes the safe application worker; direct `HEAD` fetching was removed.
- `test/task5-freshness.test.ts` — result precedence and HTTP classification coverage.

## Completed application validation

- GitHub CI #906: pass.
- TypeScript: pass.
- Unit/integration tests: pass.
- Lint: pass.
- Production build: pass.
- Repository guards: pass.
- Both Vercel preview deployments: pass.
- Competing implementation #499: reviewed and closed as superseded; no migration from it was applied.
- Task 5-D scheduler repository drift: recovered and merged through #500 before resuming this PR.

## Remaining database and production gates

- Apply both migrations to a non-production Supabase branch.
- Verify `SKIP LOCKED` leasing and expired-lease recovery.
- Verify temporary failures 1 and 2 do not open a card and failure 3 does.
- Verify `content_changed`, `evidence_missing`, and `not_found` open a card immediately.
- Verify another healthy evidence row is counted without changing the claim status.
- Verify check-history UPDATE and DELETE fail.
- Verify anon/authenticated table and RPC privileges are absent.
- Review Supabase security and performance advisors.
- Confirm production remains Phase 0 with drafting disabled.
- After merge, apply production migrations and confirm unauthorized cron calls fail closed and the authorized empty-queue run succeeds.
