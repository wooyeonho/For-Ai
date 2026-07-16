# Task 0~4 Integration Report

Date: 2026-07-15 UTC  
Working branch: `work`  
Commit under test: `fd76c7d feat: complete Task 0-B legacy cleanup and contributor streak (#467)`  
Production target: `https://for-ai-e4mm.vercel.app`

## Gate Verdict

**Gate: FAIL — do not start Task 5.**

Blocking reasons:

1. The local repository has no configured remote and no local `main` branch, so `main` could not be fetched, checked out, or fast-forwarded in this environment. The required command set was rerun on the current branch (`work`) instead.
2. `npm run ci:guards` fails because `app/api/contributor-receipt/[hash]/route.ts` is implemented but `app/api-docs/page.tsx` does not document `GET /api/contributor-receipt/:param`.
3. Task 4 surfaces are absent in the tested build: `/feed.xml`, `/ko/changelog`, and `/en/changelog` return 404 locally and no `app/feed.xml/route.ts` or `app/[locale]/changelog/page.tsx` route exists.
4. Production smoke via the configured proxy failed before reaching Vercel: every attempted production URL returned `CONNECT tunnel failed, response 403` from the proxy. Retrying without proxy failed DNS resolution.

## Branch / Merge Evidence

Command evidence:

```text
$ git status --short --branch
## work

$ git branch --show-current
work

$ git branch -a --no-color
* work

$ git remote -v
(no output)
```

Interpretation:

- Task 4 merge to `main` cannot be confirmed from this checkout because no `main` branch or remote ref is available.
- This report intentionally makes no code changes outside `docs/implementation/TASK0_4_INTEGRATION_REPORT.md`.

## Required Commands Rerun

Because `main` is unavailable, the mandatory checks were rerun on current branch `work` at `fd76c7d`.

| Command | Result | Evidence |
| --- | --- | --- |
| `npm run lint` | PASS with warnings | ESLint completed with `0 errors, 39 warnings`; exit `0`. |
| `npm run test` | PASS | Node test runner: `65` tests passed, `0` failed; exit `0`. |
| `npm run ci:guards` | FAIL | `api-docs route guard FAILED`; missing `GET /api/contributor-receipt/:param` in `app/api-docs/page.tsx`; exit `1`. |
| `npm run ai:doctor` | PASS | Score `100/100 (12/12 checks passed)`; exit `0`. |
| `npm run check:citation-surfaces` | PASS | `citation surfaces guard: ok — 3 fixture slugs checked`; exit `0`. |
| `npm run build` | PASS with warnings | Build generated `2470/2470` static pages; exit `0`. Warnings include the existing `revalidate` export warning for `/api/documents/[slug]/citation/route` and lint warnings. |

## Route Matrix

Local production build was served with:

```text
PORT=3000 npm run start
```

Smoke command:

```text
BASE=http://localhost:3000
curl -sS -I -L --max-time 20 "$BASE$path"
```

| Route | Local status | Notes |
| --- | ---: | --- |
| `/` | 200 | Static homepage; `Content-Type: text/html; charset=utf-8`. |
| `/ko/wiki/seoul-metro-base-fare` | 200 | Locale wiki route reachable. |
| `/en/wiki/seoul-metro-base-fare` | 200 | Locale wiki route reachable. |
| `/hi/wiki/seoul-metro-base-fare` | 200 | Locale wiki route reachable. |
| `/ar/wiki/seoul-metro-base-fare` | 200 | Locale wiki route reachable. |
| `/es/wiki/seoul-metro-base-fare` | 200 | Locale wiki route reachable. |
| `/ja/wiki/seoul-metro-base-fare` | 200 | Locale wiki route reachable. |
| `/zh/wiki/seoul-metro-base-fare` | 200 | Locale wiki route reachable. |
| `/feed.xml` | 404 | Blocking Task 4 gap: RSS route not present. |
| `/ko/changelog` | 404 | Blocking Task 4 gap: localized changelog route not present. |
| `/en/changelog` | 404 | Blocking Task 4 gap: localized changelog route not present. |
| `/robots.txt` | 200 | `content-type: text/plain`. |
| `/sitemap.xml` | 200 | `content-type: application/xml`. |
| `/llms.txt` | 200 | `content-type: text/plain; charset=utf-8`. |
| `/api/documents/seoul-metro-base-fare/citation` | 200 | JSON citation API; `x-citation-status: citation ready`. |
| `/api/cite/seoul-metro-base-fare` | 200 | JSON citation API; `x-citation-status: citation ready`. |

## Response Headers

Representative local headers:

```text
GET /ko/wiki/seoul-metro-base-fare
HTTP/1.1 200 OK
x-nextjs-cache: HIT
Cache-Control: s-maxage=60, stale-while-revalidate=31535940
Content-Type: text/html; charset=utf-8
```

```text
GET /feed.xml
HTTP/1.1 404 Not Found
Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
Content-Type: text/html; charset=utf-8
```

```text
GET /api/documents/seoul-metro-base-fare/citation
HTTP/1.1 200 OK
cache-control: public, s-maxage=60, stale-while-revalidate=300
content-type: application/json
x-citation-status: citation ready
```

## Feed / RSS / Changelog Evidence

Task 4 expected surfaces are not implemented in this tested tree:

- `find app -maxdepth 3 -path '*feed*' -o -path '*changelog*' -print` produced no matching route files.
- `npm run build` route output contains no `/feed.xml` route and no `/[locale]/changelog` route.
- Local smoke returns 404 for `/feed.xml`, `/ko/changelog`, and `/en/changelog`.

Gate impact: **FAIL**. RSS parsing, XML sanitization, verified-only transition filtering, and changelog pagination cannot be validated until Task 4 routes are present.

## OG / Twitter Images Evidence

Local HTML metadata smoke for `/en/wiki/seoul-metro-base-fare` found OG and Twitter text metadata:

```text
<meta property="og:title" content="서울 지하철 기본요금 (2025년) — Verified Source | For-Ai"/>
<meta property="og:description" content="Direct answer: 1,550원. Verified claim sources: 3. For-Ai claim-level fact registry."/>
<meta property="og:url" content="https://for-ai-e4mm.vercel.app/en/wiki/seoul-metro-base-fare"/>
<meta property="og:site_name" content="For-Ai"/>
<meta property="og:locale" content="en_US"/>
<meta property="og:type" content="article"/>
<meta name="twitter:card" content="summary"/>
<meta name="twitter:title" content="서울 지하철 기본요금 (2025년) — Verified Source | For-Ai"/>
<meta name="twitter:description" content="Direct answer: 1,550원. Verified claim sources: 3. For-Ai claim-level fact registry."/>
```

No `og:image` or `twitter:image` tag was observed in this smoke output. If Task 4 requires image cards, this needs a follow-up implementation PR before Task 5.

## Privacy / Logging Evidence

Static schema review confirms privacy constraints and comments are present in the canonical schema:

- Public submission tables use `contributor_hash`; raw IP storage is explicitly forbidden.
- `admin_audit_events.metadata` has a check constraint preventing raw IP and raw user-agent keys such as `ip`, `raw_ip`, `client_ip`, `x_forwarded_for`, `x_real_ip`, `user_agent`, and `raw_user_agent`.
- Topic adoption, watch subscription, contribution, bounty submission, and challenge progress comments reiterate that raw IP addresses must not be stored.

Runtime API smoke did not submit public data because this integration pass is documentation-only and the production proxy was blocked.

## Schema / RLS / GRANT / RPC Evidence

Static schema evidence from `schema-v3.sql`:

- Core registry tables enable RLS: `entities`, `documents`, `claims`, `claim_embeddings`, `document_embeddings`, `claim_sources`, `verification_events`, and `listings`.
- Public intake and moderation-related tables enable RLS, including `edits`, `reports`, `hallucination_reports`, `community_posts`, `topic_suggestions`, `topic_adoptions`, `watch_subscriptions`, `contributors`, `source_candidates`, `contribution_events`, `contributor_points`, `claim_bounties`, and `bounty_submissions`.
- Service-role-only write assumptions remain documented in server code comments and schema comments.

Limitations:

- This pass did not connect to a live Supabase database, so actual production `pg_policies`, GRANT state, installed migrations, and RPC function definitions were not independently queried.
- No Task 4-specific RSS/changelog DB query or RPC could be verified because the route implementation is missing in this checkout.

## Deployment Status

- Local build status: **PASS with warnings**.
- Production smoke status: **BLOCKED by environment/network proxy**.
- Production URL attempted: `https://for-ai-e4mm.vercel.app`.
- Proxy failure observed for all production URLs: `curl: (56) CONNECT tunnel failed, response 403` with `HTTP/1.1 403 Forbidden` from `server: envoy`.
- Retrying with proxy environment variables unset failed with `curl: (6) Could not resolve host: for-ai-e4mm.vercel.app`.

## Production Smoke URLs

Attempted production URLs:

- `https://for-ai-e4mm.vercel.app/`
- `https://for-ai-e4mm.vercel.app/ko/wiki/seoul-metro-base-fare`
- `https://for-ai-e4mm.vercel.app/en/wiki/seoul-metro-base-fare`
- `https://for-ai-e4mm.vercel.app/hi/wiki/seoul-metro-base-fare`
- `https://for-ai-e4mm.vercel.app/ar/wiki/seoul-metro-base-fare`
- `https://for-ai-e4mm.vercel.app/es/wiki/seoul-metro-base-fare`
- `https://for-ai-e4mm.vercel.app/ja/wiki/seoul-metro-base-fare`
- `https://for-ai-e4mm.vercel.app/zh/wiki/seoul-metro-base-fare`
- `https://for-ai-e4mm.vercel.app/feed.xml`
- `https://for-ai-e4mm.vercel.app/ko/changelog`
- `https://for-ai-e4mm.vercel.app/en/changelog`
- `https://for-ai-e4mm.vercel.app/robots.txt`
- `https://for-ai-e4mm.vercel.app/sitemap.xml`
- `https://for-ai-e4mm.vercel.app/llms.txt`
- `https://for-ai-e4mm.vercel.app/api/documents/seoul-metro-base-fare/citation`
- `https://for-ai-e4mm.vercel.app/api/cite/seoul-metro-base-fare`

All production attempts were blocked by the environment proxy before Vercel response validation.

## Follow-up PRs Required Before Task 5

Create separate fix PRs, in this order:

1. **API docs guard fix:** document `GET /api/contributor-receipt/:param` in `app/api-docs/page.tsx` so `npm run ci:guards` passes.
2. **Task 4 implementation/merge fix:** add or merge verified-only `/feed.xml` and localized `/{locale}/changelog` implementation, including XML sanitization, cache headers, discovery metadata, robots/sitemap policy, and tests.
3. **OG/Twitter image fix, if required by gate:** add explicit `og:image` and `twitter:image` metadata or document that text-only summary cards are accepted.
4. **Production smoke rerun:** rerun the full production URL matrix from an environment that can reach Vercel and attach headers/status evidence.

Task 5 must remain blocked until the gate is rerun from `main` and returns PASS.
