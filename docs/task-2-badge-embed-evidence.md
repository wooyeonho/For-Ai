# Task 2 — Badge and embed evidence

## Sequencing and reuse

- Rebased onto `main` after Task 1 was merged at `7946553`.
- Kept the client-safe schema presentation map in `lib/citation-presentation.ts`.
- Added the server-only static-first/Supabase-fallback loader and citation aggregation in `lib/citation-badge.ts`; `/api/cite`, `/api/badge`, and `/embed` reuse it.
- This split prevents the client-side Task 1 check UI from importing Supabase/server-only modules.

## Badge contract

- `GET /api/badge/[slug]` always returns HTTP 200 and valid `image/svg+xml`.
- Existing documents use a schema-backed presentation key.
- Missing documents render the whitelisted `Unknown` label and cache for 300 seconds.
- Loader failures render the whitelisted `Unavailable` label with `Cache-Control: no-store`.
- Normal badges cache for 600 seconds.
- The SVG renderer accepts only the closed presentation-key union; document titles and request strings are never interpolated into SVG.
- Responses include `X-Content-Type-Options: nosniff`, `X-For-Ai-Status`, and `X-For-Ai-Can-Cite`.

## Embed and frame policy

- `/embed/[slug]` lives outside locale layout and is server-rendered without the site header/footer.
- Existing cards show status, up to two representative claims, and a popup-safe registry link.
- Missing and loader-error states render `Unknown`/`Unavailable` cards rather than a default 404 iframe.
- Metadata and response headers set `noindex, nofollow`.
- The only frame exception is `/embed/:path*`, with exactly one `Content-Security-Policy: frame-ancestors *` header.
- Embed responses also receive `X-Content-Type-Options: nosniff` and `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- No `X-Frame-Options` header or global `frame-ancestors 'self'` rule exists.
- Middleware explicitly bypasses locale handling for `/embed/` while leaving the remaining security middleware behavior unchanged.

## Snippet safety

- Iframe snippets use a 360×140 frame, lazy loading, strict-origin referrer policy, and `sandbox="allow-popups allow-popups-to-escape-sandbox"`.
- Slugs are URL-encoded and HTML attribute values are escaped.
- Markdown and iframe examples are published in `/api-docs`.
- The old same-origin `embed-fixture` route was removed: it neither proved an external-origin frame nor belonged on the production surface.

## Verification gate

- Unit coverage includes all presentation keys, SVG output, missing/error behavior, cache policy, frame headers, middleware non-redirect, snippet injection resistance, and Markdown output.
- Production smoke must still verify the deployed headers, a known badge, a missing badge, an embed card, and a real different-origin iframe before this task is marked PASS.
