# Deployment Discovery Check

This checklist must be completed after every deployment that introduces or changes discoverable GYEOL documents.

## Test Documents

Run this discovery check against two documents:

1. One `verified` document using slug `{new-slug}`.
2. One `needs_review` document using slug `{new-slug}`.

Replace `{new-slug}` with the deployed English slug for each test document. The verified and needs_review checks may use different slugs if needed.

## URLs to Check After Deployment

For each test document, confirm the following URLs are reachable or reference the target document as applicable:

- `/sitemap.xml`
- `/llms.txt`
- `/ko/wiki/{new-slug}`
- `/api/documents/{new-slug}`
- `/raw/{new-slug}.md`
- `/diagnostics/{new-slug}`

## Required Checks Per URL

Each URL must be checked for the following items where the response format applies:

- HTTP 200
- `title` exists
- `entity_id` exists
- claim exists
- `status` exists
- `confidence` exists
- source count exists
- If the claim is `verified`, a source URL exists
- If the claim is `needs_review`, “확인 필요” is displayed

## Failure Classification

Any failure in this deployment discovery check is classified as P0.

P0 failures must be fixed before the next deployment.
