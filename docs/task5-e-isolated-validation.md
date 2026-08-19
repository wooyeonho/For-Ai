# Task 5-E isolated database validation

Date: 2026-08-15 KST
Status: **Task 5-E logic validated in an isolated Supabase sandbox; native full migration replay remains blocked**
Production mutation: **none**

## Environment

- Production project: `gahjbktjwdeityjvfeet`
- Development branch name: `task5-e-strict-smoke`
- Development branch id: `9456dcd5-a773-442c-8aca-f9152d8e7e97`
- Branch project ref: `rrwmbxizakmoznftkuby`
- Production data copy: disabled (`with_data=false`)

## Native branch replay result

Supabase branch creation reached `MIGRATIONS_FAILED` before Task 5-E was applied.

The branch migration ledger contained only:

- `20260626121227 core_schema_v3`

while the production project records migrations through `20260717090607 task5_d_database_scheduler`.

The failed branch therefore did not contain later production structural objects required by Task 5-E, including `claim_versions`, `claim_evidence`, `source_snapshots`, and `task5_reject_mutation()`.

This is tracked separately in **#508**. It is a database reproducibility/release-process blocker and must not be disguised as a Task 5-E pass.

## Controlled sandbox recovery used for logic validation

Production was queried **read-only** for the exact structural contract required by Task 5-E: enum labels, columns, foreign keys, and the immutable-mutation helper definition.

A minimal branch-only compatibility scaffold was then created in the failed development branch solely so the exact PR #498 Task 5-E migrations could be exercised.

The scaffold:

- contains no production data;
- is not a production migration;
- is not a substitute for repairing migration replay;
- must not be merged into production schema history.

## Task 5-E migration result

The Task 5-E base migration and hardening migration both applied successfully in the isolated sandbox after the compatibility scaffold.

The hardening migration contains the completion-time publication recheck:

- claim must still be `publication_state = active`;
- evidence must still belong to `published_claim_version_id`;
- otherwise inspection history is retained, but no review card is opened/refreshed.

## Rollback smoke result

The repository rollback smoke completed successfully and returned:

`task5_e_rollback_smoke_passed`

Validated behaviors:

1. first two temporary failures do not open a review card;
2. third temporary failure opens exactly one card;
3. a definitive `not_found` opens a card immediately;
4. another healthy evidence item is counted correctly;
5. freshness inspection does not mutate claim status/confidence/publication state;
6. append-only inspection history rejects UPDATE and DELETE;
7. publication change after lease suppresses the stale review card while preserving inspection history;
8. browser roles cannot read Task 5-E private worker tables;
9. worker lease RPC is not executable by browser roles after ACL hardening.

## ACL defect discovered by the real smoke

The first smoke run failed at the worker privilege gate.

Observed ACLs showed explicit grants:

- `anon=X/postgres`
- `authenticated=X/postgres`
- `service_role=X/postgres`

on the Task 5-E worker functions.

Therefore `REVOKE ... FROM public` alone was insufficient for this Supabase project configuration.

The PR hardening migration was updated to explicitly revoke worker/helper execution from:

- `public`
- `anon`
- `authenticated`

and to retain required execution only for `service_role`.

A dedicated `scripts/sql/task5-e-worker-acl-smoke.sql` was added and passed with:

`task5_e_worker_acl_smoke_passed`

It checks the seed helper, lease RPC, completion RPC, and required service-role privileges.

## Advisor interpretation

Security Advisor on the recovered sandbox reports RLS errors on older/core tables because the native branch stopped after `core_schema_v3` and the compatibility scaffold intentionally did not recreate the full production RLS migration chain.

Those findings are evidence of **#508 / incomplete native replay**, not evidence that Task 5-E should bypass its own release gate.

Task 5-E's own worker tables remain private by explicit grants/RLS, and the worker ACL smoke passed.

Performance Advisor results are also not suitable for production parity conclusions on this partial/scaffolded branch. A fresh **natively replayed** branch is still required for final advisor acceptance.

## Release decision

### PASS

- Task 5-E functional database behavior in isolated sandbox.
- publication-race suppression.
- append-only history.
- worker/browser ACL after explicit role revocation.

### BLOCKED

Production apply remains blocked until:

1. #508 is resolved and a fresh Supabase branch replays the full production migration chain natively;
2. Task 5-E migrations + both SQL smokes pass again on that native branch without compatibility scaffolding;
3. Security/Performance Advisors are rerun on the natively reproduced current schema;
4. production migration/rollback plan is reviewed;
5. production scheduler/empty-queue smoke is performed only after approved migration.

Do not describe this validation as a full production-schema branch pass. It is a Task 5-E logic/ACL pass plus a separately identified migration-reproducibility failure.
