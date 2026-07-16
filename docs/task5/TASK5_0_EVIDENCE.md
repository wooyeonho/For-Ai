# Task 5-0 — Reconciliation, Test Evidence, Privilege Before/After, Rollback

Required PR attachments per Bible v7 Book VI §10. All DB-level checks below were run live against the project's Supabase instance (`gahjbktjwdeityjvfeet`) — either as real (non-transactional) queries against the actual post-migration state, or inside a `begin ... rollback` transaction for anything that inserts synthetic test data.

## 1. Reconciliation output (post-migration, real query, no rollback)

```
claims_missing_current_version         : 0
active_claims_missing_published_version: 0
legacy_accidentally_task5_ai           : 0
duplicate_versions                     : 0
orphan_versions                        : 0
legacy_text_hash_drift                 : 0
settings_row_count                     : 1
settings_phase                         : 0
settings_draft_enabled                 : false
```

`total_claims = 0` in production today (all live content is served from static bundles; Supabase `claims` is currently empty — this predates Task 5-0 and was already noted during Task 4's production smoke). All reconciliation counts are trivially satisfied at zero rows, but the query itself, the trigger logic, and the RLS policies were additionally verified with synthetic data in rolled-back transactions (§2) so the invariants are proven correct independent of current row count.

## 2. Test evidence (rolled-back transactions, synthetic data)

| Bible v7 required test | Result |
|---|---|
| Immutable versions (UPDATE rejected) | PASS — `claim_versions_immutable_update` trigger raised, caught, no mutation occurred |
| Consecutive no-op blocked | PASS — inserting the same `text_hash` as the immediately preceding version raised `claim_versions: no-op insert rejected` |
| Revert allowed | PASS — inserting version 3 with the same hash as version 1 (not the immediately preceding version 2) succeeded |
| Latest risk deterministic order | PASS — two `risk_assessments` rows inserted out of chronological order; `ORDER BY created_at DESC, id DESC LIMIT 1` correctly returned the later (`high`) result, not insertion order |
| Policy immutable | PASS — `UPDATE verification_policies SET mode = 'crowd'` raised, caught, no mutation occurred |
| task5 settings transition | PASS — see §3 below (all 5 sub-cases) |
| Direct task5 AI status update denied | PASS — a synthetic `content_origin='task5_ai'` claim's direct `UPDATE claims SET status = 'verified'` raised `task5_ai claims cannot be directly updated...`, caught, no mutation occurred |
| Legacy characterization unchanged | PASS — in the same transaction, an ordinary `content_origin='legacy_manual'` claim's direct `UPDATE claims SET status = 'verified'` succeeded exactly as it does today via `app/api/admin/verify-claim/route.ts` — the new trigger has zero effect on the existing admin flow |

## 3. `set_task5_phase` transition rule evidence

All five required behaviors verified in one rolled-back transaction:

| Case | Call | Result |
|---|---|---|
| Reason required | `set_task5_phase(1, null)` | Rejected: "reason is required" |
| Max +1 upgrade | `set_task5_phase(2, ...)` while at phase 0 | Rejected: "phase may only increase by at most 1 per call" |
| Legitimate +1 | `set_task5_phase(1, 'promote to phase 1 for testing')` while at phase 0 | Succeeded, phase → 1 |
| Idempotent same-phase | `set_task5_phase(1, 'idempotent retry')` while at phase 1 | Succeeded, phase stays 1 |
| Immediate downgrade | `set_task5_phase(0, 'emergency downgrade')` while at phase 1 | Succeeded, phase → 0 (no +1 restriction applies to downgrades) |
| Audit trail | — | 3 `admin_audit_events` rows written (one per successful transition), each with `action='task5.phase_changed'` and `previous_phase`/`new_phase`/`reason` in `metadata` |

All of the above ran inside a `begin ... rollback` block; production `task5_settings.phase` was confirmed to remain `0` after the transaction rolled back.

## 4. Privilege before/after

| Object | Before | After |
|---|---|---|
| `claim_versions`, `risk_assessments`, `claim_evidence`, `verification_policies` | did not exist | `SELECT` granted to `anon`/`authenticated` (RLS-scoped to published/verified documents); no `INSERT`/`UPDATE`/`DELETE` grant to any client role; `UPDATE`/`DELETE` additionally rejected unconditionally by trigger (defense-in-depth beyond GRANT) |
| `source_snapshots` | did not exist | **No** `SELECT`/`INSERT`/`UPDATE`/`DELETE` grant to `anon`/`authenticated` at all — server-only, per Book V §4.3 ("공개 API는 전체 본문을 반환하지 않음") |
| `task5_settings` | did not exist | `SELECT` granted to `anon`/`authenticated`; all writes revoked from `anon`/`authenticated`; the sole writer is `set_task5_phase`, `EXECUTE` granted to `service_role` only |
| `claims` (existing table) | no publication-boundary columns | 9 new nullable/defaulted columns added (expand-only); existing `SELECT`/`INSERT`/`UPDATE`/`DELETE` grants to any role are **unchanged** by this PR (the pre-existing `anon` over-grant on `claims`, found during Task 4 and tracked in #469, is untouched — out of scope here) |
| `set_task5_phase` | did not exist | `EXECUTE` granted to `service_role` only; revoked from `PUBLIC` |

## 5. Migration-drift finding (discovered while writing `set_task5_phase`, reported separately)

While testing the audit-log write inside `set_task5_phase`, the insert failed with `column "admin_user_id" of relation "admin_audit_events" does not exist`. Investigation confirmed: the live `admin_audit_events` table has only `(id, action, metadata, created_at)` — the `admin_user_id`/`admin_user_hash`/`target_id` columns that `schema-v3.sql` documents and that migration `20260629_admin_roles_and_audit.sql` adds have **never been applied** to this production database.

Broadening the check confirmed this is a wide, pre-existing gap: `rate_limit_counters`, `contributor_streaks`, `community_challenges`, `sponsored_placements`, `candidate_generation_runs`, `watch_subscriptions`, `contributors`, `source_candidates`, `claim_bounties`, `bounty_submissions` are **all missing from production** despite being documented in `schema-v3.sql` with corresponding migration files present in `supabase/migrations/`. Only the earliest core schema (from the squashed `core_schema_v3` migration) plus Task 4's and this PR's own migrations are confirmed live.

**Concretely dangerous consequence already found:** `lib/rate-limit-store.ts`'s `persistentRateLimited()` — the function Task 1's `/api/check` route (already merged, already in production) uses for its "production distributed rate limit" requirement — calls the `increment_rate_limit` RPC, which does not exist. Per that module's own documented graceful-degradation design, this silently falls back to the in-memory limiter, which the code comment itself states is "effectively bypassable" on serverless. **This means Task 1's public Check endpoint currently has no real distributed rate limiting in production.**

This PR does not attempt to fix this — the scope, risk, and correct remediation order of applying ~20 unreviewed-in-this-session migrations to production is a decision requiring explicit owner review, not something to bundle into Task 5-0. `set_task5_phase` was adapted to write only into the columns that actually exist on `admin_audit_events` today (folding admin identity into `metadata` instead), so this PR's own functionality is correct against reality regardless of when the broader gap is closed. Reported in full in the tracker (#469) and directly to the user.

## 6. Rollback

- Revert this PR's commit. All new tables/columns/functions/triggers are additive; no existing table, column, row, ID, slug, URL, or `citation_status` was altered.
- To roll back the live database changes independently of a code revert: `drop table claim_evidence, source_snapshots, risk_assessments, claim_versions cascade; drop table verification_policies, task5_settings cascade; alter table claims drop column content_origin, drop column current_claim_version_id, drop column published_claim_version_id, drop column publication_mode, drop column publication_state, drop column published_at, drop column freshness_profile, drop column valid_from, drop column valid_until; drop function set_task5_phase, task5_guard_ai_claim_write, task5_reject_mutation, task5_reject_noop_claim_version;` — this is safe because no other table has a foreign key into any of these new structures yet (no later Task 5 PR has landed).
- `task5_settings.phase` cannot be raised above 0 without an explicit `set_task5_phase` call providing a reason, and that call is service-role-only — there is no path for this PR to accidentally enable any automation.
