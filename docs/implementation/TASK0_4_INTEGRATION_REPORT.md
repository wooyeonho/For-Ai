# Task 0–4 Integration Gate Report

**Verified against:** `origin/main` @ `d3c331d9d52b714990a3b3c9385bd2f2fb28e4c9`
**Verification date:** 2026-07-16
**Scope:** Bible v7 Book IV §10. No feature code was changed to produce this report — verification only.

This report is required before Task 5 (Book IV §11 onward) may begin. Per the Bible, "Integration Gate 승인 전 Task 5 금지" — this document is that approval record.

## 1. Merged PRs on main (in order)

| Order | PR | Merge commit | Task |
|---:|---|---|---|
| 1 | #464/#465/#466 | `34dc099`/`ae7d0d7`/`0b33bc4` | Baseline + Task 0-A (308 redirects) |
| 2 | #467 | `fd76c7d` | Task 0-B (legacy file removal + contributor streak) |
| 3 | #468 | `3b848b3` | Stabilization (baseline debt cleanup, all guards green) |
| 4 | #473 | `7946553` | Task 1 (AI-answer claim matcher) |
| 5 | #478 | `c009e22` | Task 2 (citation badge + standalone embed) |
| 6 | #479 | `c6c0ed6` | Task 3 (OG/Twitter images) |
| 7 | #484 | `d3c331d` | Task 4 (verified RSS feed + multi-status changelog) — supersedes closed #480 |

Tracker: #469. Task issues: #470 (Task 1), #471 (Task 2), #472 (Task 3, closed as completed).

## 2. Required commands — current main

Run from a clean `npm ci` checkout of `d3c331d`.

| Command | Result |
|---|---|
| `npm run lint` | 0 errors, 38 warnings (at/under the documented 39-warning baseline cap — `docs/implementation/LINT_BASELINE.md`) |
| `npm run typecheck` | clean |
| `npm run test` | 161/161 pass |
| `npm run ci:guards` | all guards pass (route, api-docs, mojibake, artifacts, claims, secrets, no-stub-storage, surfaces, schema-types) |
| `npm run build` | succeeds; no new build issues |
| `npm run check:mojibake` | "No mojibake markers detected." |
| `npm run check:citation-surfaces` | "citation surfaces guard: ok — 3 fixture slugs checked" |
| `npm run check:schema-types` | "schema/type guard: ok" (claim status, confidence level, source type, verification event type all closed and matching `schema-v3.sql`; locale/language and country/jurisdiction correctly skipped — no closed enum exists in schema for those) |
| `node scripts/ai-readiness-doctor.mjs` | 100/100 (12/12 checks), "All P0 standards met." |

No new build issues beyond the pre-existing, documented baseline (39-warning lint cap; the 3 `verified-claims validate` advisory warnings about `documents.data` predate this integration and are informational, not failures).

## 3. Removed routes — 308 (Task 0-A)

Verified against a local production build (`npm run build && npm run start`):

| Path | Result |
|---|---|
| `/en/quests` | 308 → `/en/contributors` |
| `/ko/bounties/example` | 308 → `/ko/leaderboard` |
| `/en/missions` | 308 → `/en/contributors` |
| `/en/challenges/x` | 308 → `/en/leaderboard` |
| `/en/campaigns` | 308 → `/en` |
| `/api/quests` | 404 (not 308 — correct, API is not redirect-matched) |
| `/embed/quests` | 200 (not 308 — correct; resolves as an embed slug lookup, not a redirect) |

All 5 route families 308 correctly; API/embed do not false-positive match.

## 4. Check (Task 1) — privacy / rate / public state

| Check | Result |
|---|---|
| `GET /en/check` | 200 |
| `POST /api/check` with `{}` | 400 (`invalid_request` — schema validation rejects missing `text`) |
| `POST /api/check` with valid body | `Cache-Control: no-store`, `Content-Type: application/json` |
| Privacy | Input text and extracted sentences are never persisted or logged (verified via `test/check-analytics.test.ts` privacy-log spy, part of the 161 passing tests) |
| Public exposure | Header nav gating and distributed rate-limit contract as implemented in #473; no regression introduced by Tasks 2–4 |

## 5. Badge/embed (Task 2) — headers

| Surface | Result |
|---|---|
| `GET /api/badge/seoul-metro-base-fare` | `Content-Type: image/svg+xml; charset=utf-8`, `Cache-Control: public, max-age=600, s-maxage=600`, `X-Content-Type-Options: nosniff` |
| `GET /embed/seoul-metro-base-fare` | `Content-Security-Policy: frame-ancestors *` (exactly one), **no** `X-Frame-Options`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Robots-Tag: noindex, nofollow` |
| `GET /en` (homepage, global scope) | No `Content-Security-Policy` / `X-Frame-Options` present — confirmed `next.config.ts`'s only `headers()` rule targets `/embed/:path*` exclusively; there is no other global CSP/XFO rule anywhere in the repo (`next.config.ts`, `middleware.ts`, no `vercel.json`) to conflict with or leak into embed. No global security regression. |

## 6. OG/Twitter (Task 3) — 7-script smoke

`GET /{locale}/wiki/seoul-metro-base-fare/opengraph-image` for all 7 supported locales:

| Locale | Result |
|---|---|
| ko | 200, `image/png` |
| en | 200, `image/png` |
| hi | 200, `image/png` |
| ar | 200, `image/png` |
| es | 200, `image/png` |
| ja | 200, `image/png` |
| zh | 200, `image/png` |

All 7 locales render (script-supported locale headline, or the documented English-canonical fallback for unsupported scripts per #479's font policy). No tofu/missing-glyph renders (enforced by `test/og-image-renderer.test.ts`'s Hangul-manifest-coverage test, part of the 161 passing tests).

## 7. Feed parse (Task 4)

Verified against **production** (`https://for-ai-e4mm.vercel.app`, post-merge):

| Surface | Result |
|---|---|
| `GET /feed.xml` | 200, `application/rss+xml; charset=utf-8`, `Cache-Control: public, max-age=600, s-maxage=600`; well-formed XML with `<atom:link rel="self">`, `<lastBuildDate>`, no `<language>`; 39 real verified-transition items rendered from the static bundle content |
| `GET /api/changelog?limit=3` | 200, `application/json`; correct `items`/`limit`/`next_cursor`/`lag_policy` shape; base64url keyset cursor present |
| `GET /en/changelog` | 200; renders "Claim changelog" heading and real transition rows (e.g. `toronto-ttc-fares`) |
| `GET /changelog.xml` | Verified locally: well-formed XML, Atom self-link, no `<language>` |

Zero-event validity, invalid-timestamp exclusion, LAG-before-filter ordering, and the same-timestamp tie-breaker are covered by `test/changelog.test.ts` and `test/feed-changelog-routes.test.ts` (18 new tests, part of the 161 passing).

## 8. Sitemap / robots / llms.txt

| Check | Result |
|---|---|
| `/sitemap.xml` includes `/{locale}/check` | yes, all 7 locales |
| `/sitemap.xml` includes `/{locale}/changelog` | yes, all 7 locales |
| `/sitemap.xml` excludes `feed.xml`/`changelog.xml` | yes (0 matches) — RSS feeds are advertised via `alternates.types` instead, per contract |
| `/sitemap.xml` excludes `/embed`, `/api/badge` | yes — no `flatMap` source in `app/sitemap.ts` ever emits embed/badge/API paths |
| `/robots.txt` | `Allow: /` globally, no `Disallow` rule exists anywhere — feed/changelog are not blocked; `Sitemap:` field correctly lists only `sitemap.xml` (not the RSS feeds, which are a different discovery mechanism) |
| `/llms.txt` | Lists `/feed.xml`, `/changelog.xml`, `/api/changelog`, and `/en/changelog` as entry points |

## 9. Citation surfaces guard / schema-types

Both pass on current main (§2 above). The schema/type guard confirms `claim_status`, `confidence_level`, `source_type`, and `verification_event_type` enums in `schema-v3.sql` are exhaustively mirrored in `lib/types.ts` — this is the exact invariant Task 5's `risk_assessments`/`claim_versions`/`task5_settings` additions must preserve when they land.

## 10. Task 5 dependency readiness

| Dependency | Status | Location |
|---|---|---|
| Search/registry helper | ready | `lib/registry-index.ts` (dual-source static+Supabase pattern Task 5 tables should follow) |
| Suggest flow | ready | `app/suggest-topic/{page,SuggestTopicForm}.tsx`, `app/api/suggest-topic/route.ts` — existing user-demand-signal intake Task 5-A's `wanted_claims`/`wanted_claim_demand_signals` will sit alongside |
| Cache invalidation | ready | `revalidatePath` pattern established in `app/api/admin/verify-claim/route.ts` (Task 3 wired origin + OG/Twitter image path invalidation on verification writes) — Task 5-P1's `publish_assisted_claim` should invalidate the same paths |
| Verification events | ready | `verification_events` table (schema-v3.sql) is the append-only event stream Task 4's LAG RPC reads; Task 5-0's `risk_assessments`/`claim_versions` are additive alongside it, not a replacement |
| URLs | ready | `lib/urls.ts` (`siteUrl`, `documentPageUrl`, etc.) — single canonical URL-building module, reused unchanged since Task 0 |
| Citation presentation | ready | `lib/citation-presentation.ts` — closed `CitationStatus` → `{machineLabel, labelKey, color}` mapping, reused identically by badge (Task 2), OG (Task 3), and RSS/changelog (Task 4); Task 5-F's report/quarantine UI and Task 5-P1's publication UI must reuse this same module rather than inventing a parallel status vocabulary |

## 11. Findings carried forward (not blocking, tracked)

- **Security (flagged during Task 4, unfixed):** `anon` role holds table-level `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` GRANTs on `claims`/`documents`/`verification_events` with no RLS policy backing them (only a `SELECT` policy exists). `INSERT`/`UPDATE`/`DELETE` are effectively blocked by RLS's default-deny, but `TRUNCATE` bypasses RLS entirely in PostgreSQL. Needs a dedicated least-privilege hardening PR — tracked in #469. This does not block Task 5, since Task 5's own contract (Book IV §1.2) requires new tables/RPCs to declare minimal GRANTs independently; it is not inherited from these pre-existing tables.
- **Operations (open, owner decision required):** canonical Vercel production project (`for-ai` vs `for-ai-e4mm`) — draft PR #483, evidence gathered, awaiting owner decision. Does not block the Book IV code track.
- **Lint baseline:** 38 of the original 39 warnings remain (one was resolved incidentally by Task 1–3 work). No new warnings were introduced; the cap in `package.json` (`--max-warnings 39`) has not been lowered since this remains a correct upper bound, not a target.

## 12. Gate verdict

**PASS.** All required commands are green on `origin/main` @ `d3c331d`. All Task 0–4 contract checks (redirects, privacy/rate/public state, badge/embed headers, 7-script OG smoke, feed parse, discovery wiring, citation-surfaces/schema-types guards) verified against a local production build and/or live production. Task 5 dependencies (search helper, suggest flow, cache invalidation, verification events, URLs, citation presentation) are all present and ready to be built on additively, per Book IV §0.2's KEEP/HARDEN/WRAP/MIGRATE/DEPRECATE/REMOVE classification discipline.

Task 5-0 may begin.
