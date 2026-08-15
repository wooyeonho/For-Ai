# CODEX_AGENT.md — For-Ai coding-agent runbook

This file is an execution supplement for Codex and other sandbox coding agents. **Read `AGENTS.md` first.** If this file conflicts with `AGENTS.md`, the active task contract, or later merged migrations/current code, stop and resolve the conflict instead of guessing.

## 0. Non-negotiable rules

- For-Ai is a claim-level fact registry, not an automatic truth generator.
- **Do not treat `schema-v3.sql` as the sole permanent database source of truth.** It is the core historical baseline; later merged migrations extend it. Inspect the latest relevant files under `supabase/migrations/` and their current call sites before changing the database.
- Task 5 introduced additive structures such as `claim_versions`, `source_snapshots`, `claim_evidence`, risk/policy structures, and `task5_settings`. Do not erase or bypass either the legacy model or these extensions.
- Static-first remains a public-content principle: core facts should be readable from raw HTML when practical.
- Never create facts, citations, customers, payments, metrics, successful tests, or production state that were not observed.
- AI-generated candidates remain unverified until the active verification policy and required operator/human gates are satisfied.
- Never store raw IP addresses or expose server-only secrets.
- Never weaken RLS, grants/revokes, SECURITY DEFINER boundaries, or Task 5 fail-closed controls simply to make a test pass.
- Do not rewrite the whole repository. Keep one PR focused on one concern.

## 1. Automatic review personas

Apply these lenses to every task without waiting for the owner to name them:

1. **Critical Path PM** — identify the highest-value current blocker and the smallest reversible fix.
2. **AI Evaluation Scientist** — require reproducible evidence and distinguish model output from ground truth.
3. **Provenance/Data-Integrity Engineer** — protect evidence lineage, immutability, migration history, and claim-version semantics.
4. **AI Search/Citation Researcher** — protect machine readability and discoverability without promising ranking/citation.
5. **B2B Customer-Development Lead** — avoid feature expansion that is disconnected from real buyer evidence.
6. **Security/Privacy Reviewer** — inspect secrets, RLS, RPC privileges, PII, abuse paths, SSRF/fetch boundaries, and fail-closed behavior.
7. **Unit-Economics/Operations Reviewer** — check API cost, maintenance burden, retries, operational load, and rollback path.

For regulated/high-risk facts, add the relevant domain-risk review lens and keep the product informational rather than advisory.

## 2. Source-of-truth check before editing

Before implementing a database- or Task-5-related change:

1. inspect the active branch and base branch;
2. inspect the latest relevant `supabase/migrations/` files;
3. inspect the application/RPC call site that uses the structure;
4. inspect the current task doc under `docs/task5/` when applicable;
5. treat old design docs as historical if later migrations/current code contradict them;
6. if repository documentation disagrees, record the drift and fix the instruction layer in a separate narrow PR when appropriate.

Never create a parallel database model to resolve documentation drift.

## 3. One-blocker loop

```text
1) Observe current state/failure.
2) Choose one P0/blocker.
3) Define acceptance test + rollback.
4) Create/switch to an isolated branch.
5) Make the smallest change.
6) Add or strengthen the relevant test.
7) Run applicable gates.
8) Inspect the diff for unrelated changes/secrets/security regressions.
9) Open/update a Draft PR.
10) Stop at owner-approval gates.
```

If the blocker is a missing production secret, account permission, payment, production migration, or external approval, **do not work around the gate**. Prove the blocker and prepare the exact next action.

## 4. Standard repository gates

Run the gates relevant to the changed surface. The baseline application gates are:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run ci:guards
```

If `npm run ai:lazycodex:doctor` exists and is applicable, run it as an additional readiness check. Do not claim a command passed unless its exit/result was observed.

For database changes, application CI is insufficient. Also require the task-specific database smoke/rollback/privilege tests in an isolated non-production database when the contract calls for them.

## 5. Task 5 database/security gates

For Task 5 work:

- preserve append-only/immutable tables with database enforcement;
- preserve legacy claim/citation behavior unless an explicit reviewed migration changes it;
- keep `task5_settings` phase/draft behavior fail closed;
- SECURITY DEFINER functions must have constrained `search_path` and explicit least-privilege grants;
- test that `anon`/`authenticated` cannot invoke private worker RPCs;
- test that the intended server/service role can invoke required RPCs;
- distinguish temporary fetch failures, blocking/rate limits, content changes, evidence disappearance, and definitive not-found outcomes;
- never let a freshness worker silently change claim verification/confidence/publication unless the active contract explicitly permits it;
- production migration/application happens only after required non-production smoke and owner approval.

## 6. Secrets and CI

- Never commit or print secret values.
- A missing GitHub/Vercel/Supabase secret is an operational configuration blocker, not a reason to hardcode a fallback credential.
- Do not add permissive dummy secrets to production code.
- Tests may use clearly fake local fixtures only where code cannot confuse them with production credentials.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, admin secrets, cron secrets, salts, or tokens to browser bundles.

## 7. Diff containment

- One PR = one concern whenever practical.
- Do not copy an agent sandbox's entire generated tree into the repository.
- Touch only intended paths.
- Do not delete/reformat unrelated core files.
- If two agents produce competing migrations or implementations, compare them and select one; do not merge both mechanically.
- Keep generated large datasets/artifacts out of git unless the repository explicitly requires a bounded fixture.

## 8. Public/product integrity gates

Do not autonomously:

- auto-verify AI-generated facts;
- publish unverified placeholder facts as authoritative;
- turn medical/legal/financial/tax/regulatory facts into professional advice;
- promise AI citation/search ranking/revenue;
- let sponsored or paid content buy a verification status;
- expose private reports/evidence/moderation data publicly.

## 9. Owner-approval hard stops

Stop before:

- merging to `main`;
- production deploy/rollback;
- production DB migrations or destructive changes;
- secret/access/security-policy changes;
- pricing/payment/refund/spend;
- data deletion;
- public announcements or direct customer/partner outreach;
- contracts or legal/tax/regulatory determinations.

Safe preparation, analysis, local/non-production verification, isolated branches, tests, and Draft PRs may proceed.

## 10. PR evidence format

A Draft PR should state:

- observed blocker/failure;
- exact scope and touched files;
- why this is the smallest safe change;
- tests/gates actually run and their results;
- database/runtime checks still outstanding;
- rollback/revert path;
- any owner approval still required.

Do not use “complete”, “fixed”, or “production-ready” when a required gate remains unobserved.
