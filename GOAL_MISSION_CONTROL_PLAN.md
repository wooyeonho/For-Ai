# GYEOL `/goal` Mission Control Plan

## Purpose

`/goal` must not be a simple marketing page.

`/goal` should become GYEOL's public Mission Control: a static-first trust dashboard that tells humans, developers, search engines, and AI crawlers what GYEOL is collecting, what is verified, what is still only a candidate, and what must not be cited yet.

The page must reinforce the product identity:

- GYEOL is not an AI wiki.
- GYEOL is not a generated-answer farm.
- GYEOL is a claim-level local fact registry.
- Generated content is a candidate queue, not verified truth.
- Only source-backed claims may become citation-grade facts.

## Non-negotiable constraints

Follow `AGENTS.md` and `schema-v3.sql`.

- Static-first rendering is mandatory.
- Core content must be readable in raw HTML without client-side JavaScript.
- `schema-v3.sql` is the source of truth.
- Do not invent a new database model.
- Canonical factual structure remains:

  ```text
  entities -> documents -> claims -> claim_sources -> verification_events
  ```

- `documents.data` is rendering convenience only.
- Generated candidates must not become verified facts.
- Unknown/generated claims remain:
  - `확인 필요`
  - confidence `low`
  - status `needs_review`
  - sources `[]`
- Medical, legal-adjacent, finance, tax, real-estate, realtime price, and platform-policy topics require source-backed verification before public citation.
- No raw IP storage.
- Use `contributor_hash` only for future public submissions.

## Target outcome

After this work, `/goal` should answer these questions without requiring JavaScript:

1. What is GYEOL?
2. What is GYEOL not?
3. How many candidates exist now?
4. How many verified/citation-grade claims exist now?
5. Which generated content must not be cited?
6. What is the lifecycle from AI/user question to verified claim?
7. What risk categories are guarded?
8. What should builders do next?
9. What do AI crawlers need to know before citing GYEOL?

## Recommended implementation PR

Title:

```text
Expand /goal into public mission control dashboard
```

Scope:

- Add metrics helper.
- Expand `/goal` content.
- Strengthen route validation.
- Keep everything static-first.
- Do not add persistence yet.
- Do not add user accounts.
- Do not publish generated candidates as verified documents.

## Files to add

### `lib/goal-metrics.ts`

Create a no-dependency helper that reads or imports existing local data and returns static metrics for `/goal`.

Recommended output shape:

```ts
export type GoalMetric = {
  label: string;
  value: string | number;
  detail: string;
};

export type GoalMetrics = {
  generatedQuestionCandidates: number;
  longTailTopicCandidates: number;
  verifiedSeedTopics: number;
  candidateClaims: number;
  needsReviewClaims: number;
  verifiedClaims: number;
  citationReadyClaims: number;
  highRiskCandidates: number;
  medicalCandidates: number;
  realtimeCandidates: number;
};

export function getGoalMetrics(): GoalMetrics;
export function getTrustReadiness(): GoalMetric[];
```

Important metric rules:

- `generatedQuestionCandidates` comes from `data/question-candidates/one-click-sample.jsonl` line count.
- `longTailTopicCandidates` comes from `data/topic-candidates/long-tail-combination-sample.jsonl` line count.
- `verifiedSeedTopics` comes from `data/verified-seed-set.json` item count.
- `verifiedClaims` should be `0` unless source-backed verified local seed data exists.
- `citationReadyClaims` should be `0` until verified claims with sources exist.
- Do not count `verified-seed-set.json` as verified; it is a verification queue.

If direct filesystem reads are unsuitable for Next.js runtime, generate metrics as static constants via a small script instead. Keep the output static-first.

## Files to modify

### `app/goal/page.tsx`

Expand the page into the following sections.

#### 1. North Star

Copy direction:

```text
GYEOL exists to make AI-citable facts verifiable at the claim level.
```

Korean:

```text
GYEOL은 AI가 인용할 수 있는 사실을 claim 단위로 검증 가능하게 만드는 레지스트리입니다.
```

#### 2. What GYEOL is / is not

Include both lists.

GYEOL is:

- local fact registry
- claim-level source tracker
- verification queue
- machine-readable evidence surface

GYEOL is not:

- AI wiki
- generated answer farm
- unsourced encyclopedia
- legal/medical/financial advice engine
- SEO content farm

#### 3. Current Registry State

Show a metrics grid:

- Generated question candidates
- Long-tail topic candidates
- Verified seed topics
- Needs-review claims
- Verified claims
- Citation-ready claims
- High-risk candidates
- Realtime candidates

The language must be honest. Example:

```text
Verified claims are intentionally low until source-backed verification is implemented.
```

#### 4. Data lifecycle

Render this as an ordered list or visual pipeline:

```text
AI/user generated question
→ internal_candidate
→ topic_candidates persistence
→ admin/source review
→ public_unverified
→ source-backed verification
→ verified claim
→ sitemap/API/AI citation
```

#### 5. AI Citation Policy

Add explicit do/don't guidance.

AI may cite:

- claims with status `verified`
- claims with source-backed `claim_sources`
- claims with `last_verified_at`
- pages intentionally included in verified sitemap policy

AI must not cite:

- `internal_candidate`
- `needs_review`
- `확인 필요`
- low confidence without source
- generated question candidates
- medical/legal/finance/realtime price/real-estate candidates before source-backed verification

#### 6. Risk policy

Group by risk.

Low risk:

- everyday objects
- food categories
- biology taxonomy
- vehicle types

Medium risk:

- platform policies
- public profiles
- transport fares
- education deadlines

High/restricted:

- medical
- legal-adjacent
- finance
- tax
- real-estate prices
- realtime prices
- labor benefits

#### 7. Trust Readiness

Show status labels:

```text
Candidate volume: high
Verification density: low
Citation safety: guarded
Machine readability: ready
Human usefulness: early
Persistence: not connected
```

This section should be intentionally candid. The goal is to build trust by showing limitations clearly.

#### 8. Today's next best actions

Show the immediate build queue:

1. Keep CI green.
2. Validate candidate files.
3. Validate routes.
4. Add `topic_candidates` persistence.
5. Persist `/suggest-topic` submissions.
6. Add admin candidate queue.
7. Verify the first 50 seed topics with official/platform/regulator/medical sources.
8. Add verified-only sitemap and public browse.

#### 9. Builder commands

Show commands that developers/AI agents should run:

```bash
npm run validate:candidates
npm run validate:routes
npm run generate:question-candidates -- --count 1000 --out data/question-candidates/one-click-sample.jsonl
npm run lint
npm run build
```

## Validator updates

### `scripts/validate-routes.mjs`

Strengthen route validation so it fails if `/goal` is missing critical trust-policy content.

Add required phrases or markers:

- `What GYEOL is`
- `What GYEOL is not`
- `Current Registry State`
- `Data lifecycle`
- `AI Citation Policy`
- `AI must not cite`
- `internal_candidate`
- `needs_review`
- `확인 필요`
- `Trust Readiness`
- `topic_candidates persistence`
- `source-backed verification`

Keep the validator simple and deterministic. It does not need a DOM parser.

## Optional validator updates

### `scripts/validate-candidate-files.mjs`

Add summary counts to output:

- total JSONL rows
- high-risk rows
- realtime rows
- medical rows
- rows with empty sources
- rows blocked from verified status

Do not change candidate behavior. This script should still reject:

- any generated candidate with `status: verified`
- any generated candidate with `visibility: verified_document`
- any generated claim with a value other than `확인 필요`
- any generated claim with confidence other than `low`
- any generated claim with status other than `needs_review`
- any generated claim with non-empty `sources`

## Testing requirements

Run all of these locally before committing:

```bash
npm run validate:candidates
npm run validate:routes
npm test
npm run generate:question-candidates -- --count 25 --out /tmp/gyeol-question-candidates-goal-test.jsonl
npm run lint
npm run build
```

Expected:

- Candidate validation passes.
- Route validation passes.
- `npm test` passes.
- Generator smoke test passes.
- Lint passes.
- Build passes and includes `/goal` as a route.

## Acceptance criteria

The PR is acceptable only if:

- `/goal` is still static-first and readable without client JS.
- `/goal` clearly says generated candidates are not verified facts.
- `/goal` includes current registry metrics.
- `/goal` includes AI citation policy.
- `/goal` includes data lifecycle.
- `/goal` includes risk policy.
- `/goal` includes trust readiness.
- `/goal` includes today's next best actions.
- Route validation enforces these sections.
- Candidate validation still passes.
- Lint and build pass.

## Night-run prompt for Claude / Devin / Codex

Use this prompt as-is for an overnight implementation run:

```text
You are working on GYEOL, a static-first claim-level local fact registry for AI, search engines, and humans.

Your task is to expand `/goal` into a public Mission Control dashboard.

Do not turn GYEOL into an AI wiki. Do not publish generated facts as verified facts. Do not change the canonical schema model. Do not add auth, payments, or large admin systems.

Read:
- AGENTS.md
- schema-v3.sql
- app/goal/page.tsx
- scripts/generate-question-candidates.mjs
- scripts/validate-candidate-files.mjs
- scripts/validate-routes.mjs
- data/question-candidates/one-click-sample.jsonl
- data/topic-candidates/long-tail-combination-sample.jsonl
- data/verified-seed-set.json

Implement:
1. Add a metrics helper, preferably `lib/goal-metrics.ts`, that computes static counts from existing data files or static imports.
2. Expand `app/goal/page.tsx` with these sections:
   - North Star
   - What GYEOL is / is not
   - Current Registry State
   - Data lifecycle
   - AI Citation Policy
   - Risk policy
   - Trust Readiness
   - Today's next best actions
   - Builder commands
3. Update `scripts/validate-routes.mjs` so `/goal` must include the trust-policy sections and key safety phrases.
4. Optionally enhance `scripts/validate-candidate-files.mjs` to print summary counts.
5. Keep the page static-first and readable from raw HTML.
6. Do not add persistence yet.
7. Do not mark any generated candidate as verified.

Run:
- npm run validate:candidates
- npm run validate:routes
- npm test
- npm run generate:question-candidates -- --count 25 --out /tmp/gyeol-question-candidates-goal-test.jsonl
- npm run lint
- npm run build

Commit only the minimal necessary files.
PR title: Expand /goal into public mission control dashboard
```

## Do not do in this PR

- Do not connect Supabase.
- Do not add login.
- Do not add payments.
- Do not add a large admin system.
- Do not publish generated candidates into sitemap as verified pages.
- Do not create fake claim values.
- Do not change `schema-v3.sql` unless absolutely necessary.

## Next PR after `/goal` Mission Control

After `/goal` is upgraded, the next best PR should be:

```text
Add topic_candidates persistence design and migration
```

That PR should introduce the pre-fact queue where generated/user/admin candidates can accumulate without becoming canonical verified facts.
