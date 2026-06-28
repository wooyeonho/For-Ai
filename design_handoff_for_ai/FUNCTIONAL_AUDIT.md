# Functional audit checklist

Run this after environment setup and before design polish. Record pass/fail with screenshots or terminal output.

## Baseline checks

- `npm install` if dependencies are absent.
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run ci:guards`

## Public pages

### Home and navigation

- Open `/` and each supported locale route.
- Search for a known slug and verify the result link opens a real document.
- Change language and verify the URL locale changes without falling back to hardcoded Korean paths.

### Document pages

- Open `/ko/wiki/myungdong-laluce-parking` and at least one non-Korean locale document if present.
- Confirm core title, claims, sources, verification status, and machine-readable data are visible in raw/static HTML.
- Click copy citation; verify copied text includes title, URL, and citation status.
- Trigger view/cite APIs and confirm stats update or return a clear no-op if DB is unavailable.

### Public submissions

For each route, submit valid and invalid payloads:

- `/suggest-topic`
- `/report/[slug]`
- `/hallucination/[slug]`
- `/community` post submission

Acceptance criteria:

- Missing required fields return validation errors.
- Missing `CONTRIBUTOR_SALT` produces a clear server configuration error, not a fake success.
- With Supabase configured, submissions create rows in the intended table and never store raw IP addresses.
- If Supabase is intentionally unavailable, the UI must explicitly say the submission was not durably stored.
- `/suggest-topic` must NOT return `{ accepted: true }` when DB storage failed. It must return `accepted: false` with `error: "SERVER_UNCONFIGURED"`.

## Admin pages

Run every admin request with no secret, wrong secret, and correct secret:

- `/admin/review`
- `/admin/verify-queue`
- `/admin/verify-claim`
- `/admin/candidates`
- `/admin/generate`
- `/admin/new-entity`
- `/admin/new-document`
- `/admin/import`
- `/admin/posts`

Acceptance criteria:

- Empty or missing `ADMIN_SECRET` never authorizes access. (Already enforced by `requireAdmin` in `lib/admin-api`.)
- Wrong `x-admin-secret` returns 401.
- Correct `x-admin-secret` works only when Supabase admin env is configured.
- Admin writes include CSRF protection as implemented by shared admin helpers.
- User-visible success means data was actually persisted or promoted.

## Locale audit

Search for hardcoded Korean document links and locale fields:

```bash
rg '(/ko/wiki|lang: "ko")' app lib -g '*.ts' -g '*.tsx'
```

Expected findings (still present as of 2026-06-28, require fixes):

| File | Line pattern | Fix |
|---|---|---|
| `app/report/[slug]/ReportForm.tsx` | `/ko/wiki/${slug}` | `documentPageUrl(slug, locale)` |
| `app/hallucination/[slug]/HallucinationForm.tsx` | `/ko/wiki/${slug}` | `documentPageUrl(slug, locale)` |
| `app/community/CommunityClient.tsx` | `/ko/wiki/${p.document_slug}` | `documentPageUrl(p.document_slug, locale)` |
| `app/admin/candidates/page.tsx` | `/ko/wiki/${c.slug}` | `documentPageUrl(c.slug, "ko")` (admin-only, lower priority) |
| `app/admin/verify-claim/page.tsx` | `/ko/wiki/${doc.slug}` | `documentPageUrl(doc.slug, doc.lang ?? "ko")` |
| `app/diagnostics/[slug]/page.tsx` | `/ko/wiki/${document.slug}` | `documentPageUrl(document.slug, locale)` |
| `lib/seo.ts` | `canonicalPath: \`/ko/wiki/${document.slug}\`` | `documentPageUrl(document.slug, document.lang ?? DEFAULT_LOCALE)` |

For each result, decide whether it is a sample fixture or a production bug. Production links must use `documentPageUrl`.

## Stub/false-success audit

Search for stub language and success responses:

```bash
rg '(stub|accepted: true|storage.*none)' app lib -g '*.ts' -g '*.tsx'
```

For each result, classify as:

- Safe explicit fixture/test stub.
- Internal admin draft response.
- Production false-success risk that must be fixed.

## Design audit last

Only after all functional items pass:

- Verify mobile layout at 375px, 768px, and desktop widths.
- Verify focus states and keyboard navigation.
- Verify contrast for status badges, success/error panels, and CTA buttons.
- Take screenshots for perceptible UI changes.
