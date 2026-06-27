# Deployment Checklist

Goal 8 deployment checklist for the static-first For-Ai MVP.

## Required checks

- `npm run lint`
- `npm run build`
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
