# Admin Operations

This is the canonical admin operations document for For-Ai. Keep this file as the latest operational source when reconciling admin documentation PRs.

## Product guardrails

- For-Ai is a global fact registry for AI, search engines, and humans, not an AI wiki.
- `schema-v3.sql` is the source of truth.
- Keep the canonical factual model: `entities -> documents -> claims -> claim_sources -> verification_events`.
- `entity_id` is mandatory from MVP; English slugs are stable; display titles are language-specific.
- Static-first rendering is mandatory: core document content must be readable from raw HTML without client-side JavaScript.
- Unknown facts must remain `확인 필요`, confidence `low`, and status `needs_review` until source-backed verification.
- Do not invent facts, venue details, a different database model, payment, user accounts, complex auth, or large admin systems for the MVP.
- Public submissions do not require login, must not be publicly readable, and must store `contributor_hash` only instead of raw IP addresses.

## Admin surface map

| Surface | Role | MVP status |
|---|---|---|
| `/admin/review` | Human review queue for submitted corrections, hallucination reports, and topic suggestions. | Minimal UI |
| `/admin/new-entity` | Create an entity with a stable `entity_id`. | Minimal UI |
| `/admin/new-document` | Create a document for an existing entity and stable slug. | Minimal UI |
| `/admin/import` | Bulk import validated topic/document candidates. | Minimal UI |
| `/admin/verify-claim` | Add source-backed claim values, claim sources, and verification events. | Minimal UI |
| `/admin/candidates` | Review generated/internal topic candidates before promotion. | Minimal UI |
| `/admin/generate` | Generate candidate queues only; generated output is not verified truth. | Minimal UI |

## Operating flow

1. Receive a public suggestion, correction report, hallucination report, generated candidate, or internal candidate.
2. Keep the item private until human review decides whether it belongs in the registry.
3. If accepted, create or update the entity/document using the schema-v3 model.
4. New claims start as placeholders: `확인 필요`, `low`, `needs_review`, and no sources.
5. Verify claims only by adding explicit sources and a verification event.
6. Only source-backed verified claims should become citation-grade public facts.

## Claim verification rules

- Use official or otherwise acceptable sources before changing a claim value from `확인 필요`.
- Add a `claim_sources` record for the source used.
- Add a `verification_events` record for the review action.
- Do not upgrade confidence without explicit source evidence.
- Do not use `documents.data` as canonical factual truth; it is rendering convenience only.

## Merge guidance for documentation PRs

- Keep this document as the latest admin operations source for PR #74-style admin operations content.
- If a PR adds an executable operational script, place it under `scripts/` or `tools/` and document how to run it here.
- Keep human/CI review checklists in `docs/qa/POST_LAZYCODEX_REVIEW_CHECKLIST.md`.
- Keep reusable LazyCodex prompts and templates under `docs/lazycodex/`.
- Close or hold duplicate prompt/checklist PRs that are not used in the actual operating flow.

## Admin review API authentication checks

`GET /api/admin/review` uses the shared `requireAdmin(request, "admin.review")` guard. That means a missing `ADMIN_SECRET` is a closed configuration: every request returns `401` until the secret is configured, and callers must send the exact value in the `x-admin-secret` header.

Run these curl checks against a local or deployed base URL before operating the review queue:

```bash
# 1) ADMIN_SECRET not configured on the server: must return 401.
curl -i "$BASE_URL/api/admin/review"

# 2) ADMIN_SECRET configured, but caller sends the wrong secret: must return 401.
curl -i -H "x-admin-secret: wrong-secret" "$BASE_URL/api/admin/review"

# 3) ADMIN_SECRET configured, and caller sends the correct secret: should return 200 when Supabase admin env is configured.
curl -i -H "x-admin-secret: $ADMIN_SECRET" "$BASE_URL/api/admin/review"
```

If the third check authenticates but the Supabase service role environment is missing, the route may return a server configuration error instead of review data; fix `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` before use.
