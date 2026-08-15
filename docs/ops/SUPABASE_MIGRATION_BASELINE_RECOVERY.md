# Supabase Migration Baseline Recovery — Issue #508

Status: **non-production recovery plan only**. This document does not authorize any production migration-history mutation, schema mutation, branch merge, or Task 5-E production apply.

## Gate objective

Restore a database history that can reconstruct the current For-Ai schema from an empty database and on a fresh Supabase branch **without compatibility scaffolding**.

Success requires all of the following:

1. `supabase db reset` from an empty local state completes successfully.
2. A fresh data-less Supabase branch replays the canonical history successfully.
3. Critical schema fingerprints match the intended production contract.
4. Task 5-E base + hardening migrations and both rollback/ACL smokes pass without a branch-only compatibility scaffold.
5. Security/Performance Advisor output is reviewed against the fully reconstructed schema.

Until all five pass, issue #508 remains a production blocker.

## Evidence captured 2026-08-15

### Remote production migration ledger

Connected read-only inspection of production project `gahjbktjwdeityjvfeet` shows the ledger begins with:

- `20260626121227 core_schema_v3`
- `20260626121249 reconcile_community_and_stats`
- `20260626121305 api_keys`
- ... continuing through Task 5-D scheduler migrations.

The ledger does **not** contain `20260624_community_and_stats`.

### Repository prerequisite exists

Repository file `supabase/migrations/20260624_community_and_stats.sql` creates:

- `public.community_posts`
- `public.document_stats`
- community-post indexes
- initial RLS policies for both tables

This is the prerequisite identified by the historical `core_schema_v3`/reconciliation sequence.

### Production object fingerprint

A read-only production fingerprint confirms the two prerequisite tables exist with the expected base columns and indexes.

However, the current policy state is **not identical** to the historical prerequisite file:

- `community_posts_public_insert` currently allows `author_type IN ('user', 'ai')`, whereas the prerequisite file allowed only `author_type = 'user'`.
- `document_stats_public_select` remains.
- the prerequisite file's public INSERT/UPDATE policies for `document_stats` are not present in the current production policy set.

This difference is consistent with later reconciliation/hardening, but it means object existence alone is not sufficient evidence to mark the historical prerequisite as applied.

## Why a blind `migration repair --status applied` is blocked

Supabase documents that `migration repair` changes the migration tracking record only; it does not execute or revert SQL. A repair is appropriate only when the actual schema state corresponding to the migration is already proven correct.

For this repository, simply inserting a missing history row would not prove that a fresh database can reconstruct the same sequence, because:

1. the first recorded migration assumes prerequisite objects already exist;
2. the missing prerequisite includes historical policy state that differs from current production after later changes;
3. branch creation has already demonstrated `MIGRATIONS_FAILED` on fresh replay;
4. the exact historical transition sequence has not yet been reconstructed end-to-end from empty state.

Therefore do **not** mutate production migration history merely because `community_posts` and `document_stats` currently exist.

## Preferred recovery path

Use a disposable local/branch workflow to establish a canonical baseline before changing production history.

### Phase A — capture and compare

1. Fetch/list the current production migration ledger.
2. Pull or dump the current production schema using supported Supabase CLI workflow.
3. Keep production data out of source control.
4. Run `scripts/sql/migration-baseline-fingerprint.sql` against production and save the result as audit evidence outside secrets/PII.
5. Inventory every repository migration whose timestamp/name is absent from the remote ledger and classify it:
   - prerequisite already represented by later remote SQL,
   - real live drift,
   - obsolete/superseded,
   - unknown and requiring call-site/schema review.

### Phase B — build a canonical empty-state history in isolation

Prefer one of these only after evidence review:

**Path 1: targeted history reconstruction**

Use only if the exact missing historical SQL and ordering can be reconstructed without ambiguity. The resulting local history must replay from empty state and produce the expected fingerprint.

**Path 2: new canonical baseline**

Use if historical drift is too broad or ambiguous. Generate a reviewed baseline representing the current production schema, then layer all newer migrations after it in a clean sequence. This is safer than pretending uncertain historical files were applied exactly as written.

No production history mutation occurs in Phase B.

### Phase C — mandatory isolated verification

On the candidate canonical history:

1. Run `supabase db reset` from empty state.
2. Run `scripts/sql/migration-baseline-fingerprint.sql` and compare critical objects.
3. Create a fresh data-less Supabase branch from the candidate history.
4. Require native replay success without compatibility scaffold.
5. Run Task 5-E base + hardening migrations.
6. Run Task 5-E rollback smoke.
7. Run Task 5-E worker ACL smoke.
8. Run current Security and Performance Advisors.
9. Verify browser roles cannot execute private worker/security-definer surfaces not intended for them.

Any mismatch returns this gate to FAIL/BLOCKED.

### Phase D — production reconciliation proposal

Only after Phase C passes, prepare an explicit production change proposal containing:

- exact migration-history rows to add/remove/reconcile, if any;
- exact schema SQL, if any;
- evidence that SQL is already represented in production when using history-only repair;
- rollback/recovery procedure;
- expected branch replay behavior after the change;
- production smoke queries;
- Task 5-E release sequence.

Production execution requires owner approval.

## Hard stops

Do not autonomously:

- run `supabase migration repair` against production;
- delete or rewrite applied production migrations;
- run `supabase db reset --linked` against production;
- squash production history;
- apply Task 5-E to production;
- change production grants/RLS merely to make replay pass;
- copy production user data into a branch, repo, fixture, or log.

## Decision rule

**Current verdict: BLOCKED for production, GO for isolated reconstruction.**

The next safe action is to construct and verify a canonical empty-state history in a disposable environment and compare it with the production fingerprint. Only then can a history repair or baseline cutover be evaluated.