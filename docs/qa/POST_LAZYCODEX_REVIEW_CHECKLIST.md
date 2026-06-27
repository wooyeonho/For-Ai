# Post-LazyCodex Review Checklist

Use this checklist for CI and human review after LazyCodex or another coding agent changes the repository.

## Scope control

- Confirm the PR has one narrow purpose.
- Confirm no unrelated files were reformatted, deleted, or regenerated.
- Confirm generated large artifacts are not committed.
- Confirm the change does not add payment, user accounts, complex auth, a chatbot UI, or a large admin system.

## For-Ai product invariants

- For-Ai is presented as a global fact registry, not an AI wiki.
- `schema-v3.sql` remains the source of truth.
- The schema model remains `entities -> documents -> claims -> claim_sources -> verification_events`.
- `documents.data` remains rendering convenience only.
- Unknown facts still show `확인 필요`, confidence `low`, and status `needs_review`.
- No fake facts or invented venue details were introduced.
- Public submissions do not store raw IP addresses and use `contributor_hash` only.
- Private submission queues are not made publicly readable.

## Static-first and machine-readable checks

- Core document content is readable from raw HTML without client-side JavaScript.
- JSON API routes use `/api/documents/[slug]`, not `/api/document/[slug]`.
- Raw Markdown route works for registry documents.
- JSON-LD, sitemap, robots, and `llms.txt` remain consistent with current routes.
- `llms.txt` is secondary and is not treated as the legal basis or citation engine.

## Required local gates

Run these before merge:

```bash
npm run lint
npm run build
npm run ci:guards
npm run ai:lazycodex:doctor
node scripts/validate-topic-candidates.mjs data/topic-candidates.sample.jsonl
node scripts/validate-topic-candidates.mjs data/topic-candidates/long-tail-combination-sample.jsonl
```

If route behavior changed, also smoke-test against a running local server:

```bash
node scripts/smoke-test-routes.mjs http://localhost:3000
```

## Documentation consolidation

- Admin operations content belongs in `docs/operations/ADMIN_OPERATIONS.md`.
- Deployment/discovery checks belong in `docs/operations/DEPLOYMENT_DISCOVERY_CHECKLIST.md`.
- Post-agent review checks belong in this file.
- LazyCodex prompts and review templates belong in `docs/lazycodex/`.
- Duplicate checklist/prompt files should be merged into the canonical file or closed.
