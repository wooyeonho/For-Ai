# Task 2 — Badge Embed Evidence

## Branch sequencing

- Requested branch: `task/2-badge-embed`.
- Local note: this container has no `origin` remote configured, so `git fetch origin main` could not verify the remote production-smoke/merge state. Work continued on a fresh local `task/2-badge-embed` branch from the repository's current checked-out state.

## Existing citation/document loader review

- KEEP: `lib/data.ts#getRegistryBundleBySlug` remains the static-first in-repo loader for seed/verified bundles.
- KEEP: `lib/supabase-documents.ts#getRegistryBundleFromSupabase` remains the runtime database fallback loader.
- KEEP: `lib/render.ts#normalizeCitationSurface` and `lib/render.ts#getCitationPolicyBlock` remain the canonical presentation helpers for machine-readable citation policy and normalized claim-level citation surfaces.
- WRAP: `lib/citation-presentation.ts#loadCitationDocumentBundle` wraps static-first plus Supabase fallback loading so `/api/cite`, `/api/badge`, and `/embed` resolve documents identically.
- WRAP: `lib/citation-presentation.ts#buildCitationPresentation` centralizes derived citation status, claim buckets, source labels, and recommended citation copy so badge/embed surfaces do not fork citation logic.

## Frame policy review

- No pre-existing global `X-Frame-Options` header was found in `next.config.ts`, `middleware.ts`, or route code.
- No pre-existing global CSP `frame-ancestors` header was found in `next.config.ts`, `middleware.ts`, or route code.
- Minimal exception added only for `/embed/:path*`: `Content-Security-Policy: frame-ancestors *`.
- Other routes are untouched, and the badge JSON API remains a normal API response rather than an embeddable document.

## Smoke evidence checklist

- `GET /api/badge/[slug]` returns badge metadata, citation status, canonical URL, and an iframe snippet.
- `/embed/[slug]` renders a static-first badge page using the shared citation presentation wrapper.
- `/embed-fixture/[slug]` is an external-iframe-style fixture page that renders the user snippet.
- The user snippet includes `sandbox`, `loading`, and `referrerpolicy`.
