# Deployment Checklist

Goal 8 deployment checklist for the static-first For-Ai MVP.

## Required checks

- `npm run lint`
- `npm run build`
- community post moderation migration applied (`supabase/migrations/20260625_post_moderation.sql`)
- `/`
- `/ko/wiki/myungdong-laluce-parking`
- `/api/documents/myungdong-laluce-parking`
- `/raw/myungdong-laluce-parking.md`
- `/report/myungdong-laluce-parking`
- `/hallucination/myungdong-laluce-parking`
- `/diagnostics/myungdong-laluce-parking`
- `/admin/review`
- `/admin/new-entity`
- `/admin/new-document`
- `/admin/import`
- `/sitemap.xml`
- `/robots.txt`


## Production Supabase feature release checklist

Use this checklist before marking the community, topic suggestions, and candidate review features as production-ready. These checks must be performed against the actual deployed production URL, not only against local development.

### 1. Vercel / deployment environment variables

Confirm all required runtime secrets are configured in the production deployment environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_SECRET`
- `CONTRIBUTOR_SALT`

Notes:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are required for public Supabase reads and browser-safe client paths.
- `SUPABASE_SERVICE_ROLE_KEY` is required only on trusted server-side routes; never expose it to client code.
- `ADMIN_SECRET` gates admin APIs. Browser admin UI users submit the password to `/api/admin/login` and then rely on the httpOnly admin session cookie; do not send `x-admin-secret` from browser-origin requests. CLI/internal callers may continue to use `x-admin-secret` with CSRF where required.
- `CONTRIBUTOR_SALT` is required so public submissions store only `contributor_hash` and never raw IP addresses.

### 2. Supabase SQL Editor migrations

In the Supabase SQL Editor, confirm these migrations have been applied to the production database, in dependency order where applicable:

- `supabase/migrations/20260622_topic_candidates.sql`
- `supabase/migrations/20260623_topic_candidates_consensus.sql`
- `supabase/migrations/20260624_community_and_stats.sql`
- `supabase/migrations/20260625_topic_suggestions.sql`
- `supabase/migrations/20260625_post_moderation.sql`
- `supabase/migrations/20260625_lock_rls.sql`

Minimum table/policy smoke checks after migration:

- `topic_candidates` exists and supports public topic suggestions plus admin review operations.
- `community_posts` exists with moderation-aware public insert/select behavior.
- `document_stats` exists for view and AI citation counters.
- RLS remains enabled; public read is not allowed for edits, reports, or hallucination reports.

### 3. Production URL manual route checks

After deployment, open each route once on the actual production URL and confirm it renders or responds as expected:

- `/community` — community page loads, post list/form renders, and public submit path does not expose raw IPs.
- `/suggest-topic` — topic suggestion form loads and can submit a pending candidate.
- `/admin/posts` — admin password flow loads; authenticated admin can review/manage posts.
- `/admin/candidates` — admin password flow loads; authenticated admin can review topic candidates.
- `/api/posts` — public posts API responds without leaking server secrets or unpublished moderation data.

Record the production URL, date/time, checker, and result before closing the release.

## Privacy and scope checks

- Do not store raw IP addresses.
- Store `contributor_hash` only for public submissions.
- Do not expose public read access for edits, reports, or hallucination_reports.
- Do not require login for public submissions.
- Do not add payment, user accounts, or complex auth in the MVP.
- Do not invent venue facts; unknown facts remain “확인 필요” with low confidence.

## MVP Baseline Status (v0.1.0-mvp)

**Tag:** v0.1.0-mvp  
**Head SHA:** aacdba5aed9f8304e4dac1bccf030c0e8fc14aac  
**Tagged:** 2026-06-21  

### Goals Included
- Goal 0: Schema v3 + seed data ✅
- Goal 1: Types + data layer ✅
- Goal 2: Schema v3 SQL ✅
- Goal 3: Claim-registry UI ✅
- Goal 4: SEO, JSON-LD, sitemap, robots.txt ✅
- Goal 5: Correction + hallucination report forms ✅
- Goal 6: Admin review UI ✅
- Goal 7: AI-readiness diagnostics ✅
- Goal 8: Polish (404, home page, CSS) ✅
- Goal 9: Supabase DB integration (stub) ✅

### Route Verification (all 200)
- `/` ✅
- `/ko/wiki/myungdong-laluce-parking` ✅
- `/api/documents/myungdong-laluce-parking` ✅
- `/raw/myungdong-laluce-parking.md` ✅
- `/report/myungdong-laluce-parking` ✅
- `/hallucination/myungdong-laluce-parking` ✅
- `/diagnostics/myungdong-laluce-parking` ✅
- `/admin/review` ✅
- `/admin/new-entity` ✅
- `/admin/new-document` ✅
- `/admin/import` ✅
- `/sitemap.xml` ✅
- `/robots.txt` ✅

### Build Status
- `npm run lint`: pass ✅
- `npm run build`: pass ✅ (TypeScript + Next.js)
- Vercel production deployment: green ✅

### Known Limitations (by design)
- No Supabase runtime integration — submissions are stubs only
- No DB persistence — all data is static seed
- Admin tools are UI stubs only
