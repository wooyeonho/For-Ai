# Task 5-B2 — Phase-0 shadow drafting

## Implemented contract

- The internal cron endpoint requires a configured 32+ character `CRON_SECRET`, accepts only a bounded batch of 1–5, and has a deny-only `TASK5_EMERGENCY_DISABLE=1` switch.
- B2 originally restricted drafting to Phase 0. Task 5-P1 extends the same fail-closed lease to Phase 0 or 1 with `draft_enabled=true`, so assisted publication does not exhaust a fixed backlog; later phases remain blocked without a new migration.
- Provider budgets are independently enabled and atomically reserved before every paid call. Reservations are idempotent per attempt/stage, then reconciled with actual provider usage.
- Work leasing uses `FOR UPDATE SKIP LOCKED`, a bounded lease, unique attempt keys, retry counts, and expired-lease recovery.
- Source URLs come only from provider search citations. Every candidate goes through Task 5-B1 safe fetch; model-authored URL fields are rejected.
- Evidence quotes are re-found in canonical snapshot text before their offsets, quote hash, and context hash are persisted.
- Deterministic and model risk checks fail closed: either high result produces high risk, and an unknown result remains unknown.
- Completion creates only an `ai_draft` document and `needs_review` claim with `content_origin=task5_ai` and `publication_mode=assisted_operator`. No publication RPC, trigger, pointer update, or public grant is introduced.
- Prompts, model IDs, providers, provider request IDs, usage, safe error codes, attempts, and runs are retained without storing raw wanted text in operational logs.

## Database and privilege evidence

The two B2 migrations were applied to production before application deployment. Post-migration verification returned:

| Check | Result |
|---|---|
| New control-plane tables | 5 present; RLS enabled on all 5 |
| Browser table privileges | 0 for `anon`, `authenticated`, and `PUBLIC` |
| Browser RPC privileges | 0 across all 9 B2 RPCs |
| Service-role RPC privileges | all 9 present |
| Claim linkage types | both `wanted_claims` link columns aligned to canonical text claim IDs |
| Claim linkage foreign keys | 2 present |
| Foreign-key indexes | added for B2 lifecycle and cost-ledger relations |
| Drafting state after migration | Phase 0, draft disabled |
| Provider budgets after migration | GPT and Perplexity both disabled |
| Synthetic run/attempt/cost rows | 0 |
| Expired leases recovered at verification | 0 |

RLS-with-no-policy advisor notices for the new tables are intentional: these are service-only tables with explicit browser-role revocations. Pre-existing advisor findings outside the B2 objects are not changed by this task.

## Test evidence

- Fail-closed deterministic/model risk combination.
- Rejection of model-authored URL/source/citation/link fields.
- Cron secret and emergency-disable behavior.
- Mocked full batch with provider citations only, safe snapshot persistence, quote offset verification, three budgeted model stages, and provenance recording.
- Provider failure during risk classification produces `unknown`, never a normal-risk fallback.
- Migration guards for `SKIP LOCKED`, idempotent cost events, service-only grants, claim-ID alignment, and absence of a publication writer.
- Full repository suite: 197 tests passed; typecheck, lint policy, CI guards, and production build passed.

## Activation and rollback

B2 is deployed dark. Activation requires all of the following independent operator actions: configure the cron secret and provider credentials, set explicit provider budgets, enable the selected providers, and toggle `draft_enabled=true`. This PR performs none of those actions.

Emergency rollback is non-destructive: set `TASK5_EMERGENCY_DISABLE=1`, set `draft_enabled=false`, and disable both provider budgets. Existing private attempts, evidence, and cost records remain available for audit. Application code can then be reverted without deleting database records.
