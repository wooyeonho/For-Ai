# Task 5-A — Demand Signals: Test Evidence, Privilege Before/After, Rollback

Required PR attachments per Bible v7 Book VI §10. All DB-level checks below were run live against the project's Supabase instance (`gahjbktjwdeityjvfeet`) inside `begin ... rollback` transactions for anything that inserts synthetic data, or as direct (non-transactional) `information_schema`/`pg_default_acl` reads for privilege verification.

## 1. Test evidence (rolled-back transactions, synthetic data)

| Bible v7 §14 required test | Result |
|---|---|
| One actor, 3 days -> not promoted | PASS — single actor signaling on 3 distinct `bucket_date`s within one epoch left `status='observing'` (`distinct_actors=1` fails the `>=2` requirement) |
| Two actors / 3 days -> promoted | PASS — 2 distinct `actor_key`s across 3 distinct `bucket_date`s, 3 signals, same epoch: `status` moved `observing` -> `open` |
| Epoch boundary not mixed | PASS — a claim with 2 actors' signals split across two different weekly epochs (one epoch has only 1 of the qualifying signals) stayed `observing`; `wanted_claim_maybe_promote` only counts signals inside its own `dedupe_epoch` |
| Duplicate same day same actor -> 1 signal | PASS — calling `submit_wanted_claim_signal` 3 times with identical `(locale, text, source, actor_key)` produced exactly 1 row in `wanted_claim_demand_signals` (`on conflict ... do nothing`) |
| Two suggesters retained | PASS — two distinct `contributor_hash`es submitting the same normalized text via `user_suggestion` produced 2 rows in `wanted_claim_suggesters` |
| Explicit suggestion opens immediately | PASS — a non-risk-flagged `user_suggestion` call moved a brand-new `wanted_claim` straight to `status='open'` on first insert |
| Reputation/crime risk routes to operator queue | PASS — an otherwise-identical `user_suggestion` call with `p_risk_flag=true` stayed `status='observing'` instead of opening immediately (never auto-promoted, regardless of source) |
| Retention deletion | PASS — a signal with `expires_at` backdated to the past was deleted by `cleanup_wanted_claim_signals()`; the parent `wanted_claims` row and its `wanted_claim_suggesters` rows were confirmed untouched |
| No raw IP | PASS by construction — `app/api/wanted-claims/route.ts` computes `contributorHash` via the existing `makeContributorHashForRequest()` (sha256(ip+salt), truncated) before any DB call; the RPC's parameters (`p_actor_key`, `p_contributor_hash`) and the demand-signal/suggester tables never contain a raw IP column, and this was verified by inspecting the actual values written in the test transactions above (all `actorAAA`/`hashSUGG1`-style synthetic hashes, no IP literals) |

## 2. PII/secret and reputation-risk filtering (unit tests, `test/wanted-claims.test.ts`, 11 cases, all passing)

`lib/wanted-claims.ts` rejects (never persists, never logs) text matching email, phone, credit-card-shaped digit runs, or common secret-key shapes (`sk-...`, `AKIA...`, `ghp_...`, long base64/hex runs) — verified for each pattern individually and for a clean pass-through case. A separate, narrow keyword list flags reputation/crime-adjacent phrasing (`arrested`, `convicted`, `indicted`, etc.) as `riskFlag=true` without rejecting the submission — it is passed to the RPC, which uses it only to withhold automatic promotion (§1 above), never to reject or auto-publish.

## 3. Privilege before/after

| Object | Before | After |
|---|---|---|
| `contributors`, `wanted_claims`, `wanted_claim_demand_signals`, `wanted_claim_suggesters` | did not exist | `RLS` enabled, **zero** policies created (default-deny for every role subject to RLS), **and** an explicit `revoke all ... from anon, authenticated` (see §4 finding below) — no client role can read or write these tables under any code path |
| `submit_wanted_claim_signal`, `wanted_claim_maybe_promote`, `cleanup_wanted_claim_signals`, `wanted_claim_normalize_v1`, `wanted_claim_normalized_hash` | did not exist | `EXECUTE` granted to `service_role` only (the two `SECURITY DEFINER` entry points); revoked from `PUBLIC` |
| Every other existing table (`claims`, `documents`, `entities`, etc.) | — | **unchanged** — this migration adds no columns to and no grants on any pre-existing table |

## 4. New finding: default-privilege auto-grant (fixed in this migration, tracked project-wide in #487)

Immediately after creating the four new tables, `information_schema.role_table_grants` showed `anon` and `authenticated` holding full `SELECT/INSERT/UPDATE/DELETE` on all of them — despite the migration never granting anything to those roles. `pg_default_acl` confirmed the cause: this project has `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ... TO anon, authenticated` (and a second, wider one for `supabase_admin` that additionally includes `TRUNCATE`) already configured — so **every** newly created table in `public` picks up these grants automatically, regardless of what its own migration says.

With RLS enabled and zero policies, normal DML (`SELECT`/`INSERT`/`UPDATE`/`DELETE`) from `anon`/`authenticated` already resolves to zero affected rows — but Postgres's `TRUNCATE` bypasses RLS entirely, so the raw grant was a real gap, not just noise. This migration adds an explicit `revoke all on contributors, wanted_claims, wanted_claim_demand_signals, wanted_claim_suggesters from anon, authenticated;` as its last statement, verified (re-queried `role_table_grants` afterward: zero rows for `anon`/`authenticated` on all four tables).

This is the same class of issue already tracked in #469/#487 for `claims`/`documents`/`verification_events`, but confirms it is a **project-level default**, not specific to those three tables — any future migration that creates a new table must either explicitly revoke from `anon`/`authenticated` (as done here) or rely solely on RLS and accept the TRUNCATE gap. Recommend the eventual hardening PR fix the default ACL itself (`ALTER DEFAULT PRIVILEGES ... REVOKE ALL ON TABLES FROM anon, authenticated`) so future tables are safe without each migration needing to remember this step.

## 5. Migration-drift dependency note (see also #487)

`wanted_claim_suggesters.contributor_id` requires a `contributors` table. The pre-existing `supabase/migrations/20260629_source_contributions.sql` already defines one, but that file also creates `source_candidates`, which depends on the `source_authority` enum type — confirmed **not present** on production (`select typname from pg_type where typname='source_authority'` returns zero rows), even though `schema-v3.sql:17` documents it as part of the earliest "core" schema. This migration therefore defines its own minimal, self-contained `contributors` table with no dependency on `source_authority` or any other drifted object, rather than pulling in the full (partially-inapplicable) source-contribution system. Full details and a broader information_schema audit recommendation are in issue #487.

## 6. Rollback

- Revert this PR's commit. All new tables/columns/functions are additive; no existing table, column, row, or grant was altered.
- To roll back the live database changes independently of a code revert: `drop table wanted_claim_suggesters, wanted_claim_demand_signals, wanted_claims cascade; drop table contributors cascade; drop function submit_wanted_claim_signal, wanted_claim_maybe_promote, cleanup_wanted_claim_signals, wanted_claim_normalized_hash, wanted_claim_normalize_v1;` — safe because no other table has a foreign key into any of these (no later Task 5 PR has landed).
- `wanted_claims.status` cannot be set to anything beyond `observing`/`open` by this PR's code paths — `drafting`/`drafted`/`published`/`rejected_editorial`/`closed_infra_failure` are allowed by the `check` constraint (so later tasks don't need a migration to use them) but nothing in this PR ever writes them.
- Per the Bible v7 rollback matrix: "disable signal hooks; retain private rows" — removing the `app/api/wanted-claims/route.ts` route (or reverting the whole commit) fully disables new signal intake while leaving all existing `wanted_claims`/`wanted_claim_demand_signals`/`wanted_claim_suggesters` rows in place, since none of them are ever exposed publicly (zero `anon`/`authenticated` grants, RLS-backed).
