# CODEX_AGENT.md

Operational rules for Codex/LazyCodex-style loops on GYEOL.

## Product guardrails

- GYEOL is not an AI wiki.
- GYEOL is a local fact registry for AI, search engines, and humans.
- Static-first rendering is mandatory.
- Core document content must be readable from raw HTML without client-side JavaScript.
- `schema-v3.sql` is the source of truth.
- Do not invent a different database model.
- Keep the canonical structure: `entities -> documents -> claims -> claim_sources -> verification_events`.
- `documents.data` is rendering convenience only; it is not the canonical source of factual truth.
- Do not invent facts or venue details.
- Unknown facts must remain `확인 필요` with `low` confidence.
- Do not upgrade confidence unless an explicit source supports the upgrade.
- Public submissions do not require login.
- Never store raw IP addresses; store `contributor_hash` only.
- Do not add payment, user accounts, complex auth, chatbot UI, social features, ads, or a large admin system in the MVP.

## Loop rule

Run small, repeatable loops. Do not run broad rewrites.

1. Start from the latest `main`.
2. Create a narrow branch for one problem.
3. Run the doctor/check step first.
4. Pick exactly one P0 failure.
5. Make the smallest safe fix.
6. Run all required gates.
7. Open a narrow PR with a clear summary, risk note, and exact commands run.
8. Repeat with a new branch for the next P0.

Recommended branch names:

```bash
git checkout main
git pull --ff-only
git checkout -b lazycodex/p0-<short-problem-name>
```

## Doctor step

Run the available doctor before editing:

```bash
npm run ai:lazycodex:doctor
```

If the LazyCodex package cannot be installed in the current environment, record the exact error and continue with local repo gates. Do not ignore the failure silently.

## P0 priority order

Fix only one P0 at a time, in this order:

1. Build or TypeScript failure.
2. Lint failure.
3. Korean mojibake or broken visible text.
4. Route mismatch between UI, diagnostics, API, raw Markdown, sitemap, robots, and `llms.txt`.
5. Static-first rendering gap on core registry pages.
6. Claim/source/confidence inconsistency.
7. Missing machine-readable output required for AI crawlers or RAG.

## Minimal-fix rule

- Prefer editing the smallest number of files.
- Do not refactor unrelated code.
- Do not rename routes unless the task is specifically a route mismatch fix.
- Do not change schema files unless the task explicitly requires schema work.
- Do not introduce new dependencies unless the PR explains why no existing tool is enough.
- Do not modify generated files such as `.next/` outputs or `next-env.d.ts` changes created by local build side effects.

## Diff-size guard

Large rewrite PRs are blocked by default.

A PR must stay under both limits unless explicitly labeled `[large-diff-ok]` in the PR title and justified in the body:

- Maximum changed files: 40.
- Maximum deleted core files: 0.

Core files that must not be deleted in ordinary stabilization PRs:

- `schema-v3.sql`
- `AGENTS.md`
- `CODEX_AGENT.md`
- `AI_OPERATING_MODEL.md`
- `lib/types.ts`
- `lib/seed-data.ts`
- `lib/render.ts`
- `lib/seo.ts`
- `lib/urls.ts`
- `app/ko/wiki/[slug]/page.tsx`
- `app/api/documents/[slug]/route.ts`
- `app/raw/[...path]/route.ts`
- `app/llms.txt/route.ts`
- `scripts/smoke-test-routes.mjs`
- `scripts/check-mojibake.mjs`

Before opening a PR, inspect the diff:

```bash
git status --short
git diff --stat
git diff --name-status
```

If the diff exceeds the guard, split the work into smaller branches instead of asking reviewers to accept a broad rewrite.

## Sandbox-output extraction rule

When an AI tool writes broad sandbox output, extract only the intended files.

1. List the changed files.
2. Identify the files that belong to the current one-P0 scope.
3. Copy or apply only those intended changes.
4. Discard unrelated rewrites, formatting churn, generated files, and opportunistic features.
5. Re-run gates after extraction.

Use this checklist:

```text
Intended files:
- <path>
- <path>

Discarded as out-of-scope:
- <path>: <reason>
- <path>: <reason>
```

## Required merge gates

All six gates are required before merge:

1. Encoding gate:

   ```bash
   npm run check:mojibake
   ```

2. Lint gate:

   ```bash
   npm run lint
   ```

3. Build gate:

   ```bash
   npm run build
   ```

4. Route smoke gate against a running local server:

   ```bash
   npm run start
   node scripts/smoke-test-routes.mjs http://localhost:3000
   ```

5. Machine-readable spot check for the MVP page:

   ```bash
   node -e "Promise.all([fetch('http://localhost:3000/ko/wiki/myungdong-laluce-parking'), fetch('http://localhost:3000/api/documents/myungdong-laluce-parking'), fetch('http://localhost:3000/raw/myungdong-laluce-parking.md'), fetch('http://localhost:3000/llms.txt')]).then(async rs => { if (rs.some(r => r.status !== 200)) process.exit(1); const [html, api, md, llms] = await Promise.all([rs[0].text(), rs[1].json(), rs[2].text(), rs[3].text()]); if (!html.includes('entity_id') || !JSON.stringify(api).includes('kr-weddinghall-laluce-001') || !md.includes('확인 필요') || !llms.includes('Citation policy')) process.exit(1); console.log('machine-readable spot check passed'); })"
   ```

6. Diff-size gate:

   ```bash
   git diff --stat
   git diff --name-status
   ```

## PR requirements

Every PR must include:

- One-sentence problem statement.
- Files changed summary.
- Risk notes.
- Exact commands run.
- Whether LazyCodex doctor passed or failed.
- Confirmation that unknown facts remain `확인 필요` with `low` confidence.
- Confirmation that no fake facts or venue details were added.
- Confirmation that no raw IP storage, login, payment, complex auth, chatbot, social, ads, or large admin scope was added.

## Do not do

- Do not rewrite the whole app.
- Do not convert static-first pages into client-only pages.
- Do not replace `schema-v3.sql` with another schema.
- Do not use `schema-v2.sql`.
- Do not make `documents.data` canonical.
- Do not add fake sources.
- Do not upgrade confidence without explicit sources.
- Do not hide unknown facts behind polished marketing copy.
- Do not make public reports or hallucination reports publicly readable.
- Do not store raw IP addresses.
- Do not add accounts, payment, complex auth, chatbot UI, community features, social features, ads, or a large CMS in the MVP.
- Do not submit a broad PR when a narrow one-P0 PR would work.
