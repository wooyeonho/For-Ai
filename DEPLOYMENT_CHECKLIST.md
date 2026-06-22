# Deployment Checklist

Goal 8 deployment checklist for the static-first GYEOL MVP.

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
