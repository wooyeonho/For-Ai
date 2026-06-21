# Deployment Checklist

Deployment checklist for the static-first GYEOL MVP.

## MVP Baseline Status

**Tag:** `v0.1.0-mvp`

| Item | Status |
|---|---|
| Goal 0~9 | Included in main |
| `npm run lint` | Pass |
| `npm run build` | Pass |
| Vercel production | Green |
| All 13 public routes | 200 |
| Supabase runtime integration | Not included |
| Submissions/admin tools | Stubs only (in-memory, no DB persistence) |
| Real venue facts | Not included (seed document only) |
| ESLint enforcement | Restored (PR #11) |

## Required checks

### Build

- [ ] `npm run lint` passes
- [ ] `npm run build` passes

### Route smoke test

Run `node scripts/smoke-test-routes.mjs` or verify manually:

- [ ] `/`
- [ ] `/ko/wiki/myungdong-laluce-parking`
- [ ] `/api/documents/myungdong-laluce-parking`
- [ ] `/raw/myungdong-laluce-parking.md`
- [ ] `/report/myungdong-laluce-parking`
- [ ] `/hallucination/myungdong-laluce-parking`
- [ ] `/diagnostics/myungdong-laluce-parking`
- [ ] `/admin/review`
- [ ] `/admin/new-entity`
- [ ] `/admin/new-document`
- [ ] `/admin/import`
- [ ] `/sitemap.xml`
- [ ] `/robots.txt`

## Privacy and scope checks

- [ ] No raw IP addresses stored anywhere. `contributor_hash` only.
- [ ] No public read access for edits, reports, or hallucination_reports.
- [ ] Public submissions do not require login.
- [ ] No payment, user accounts, or complex auth in the MVP.
- [ ] No invented venue facts. Unknown facts show "확인 필요" with confidence `low`.
- [ ] No Supabase env vars required at runtime.
- [ ] Admin pages are stubs with no DB writes.
