# For-Ai repository-measured handoff

This handoff is based on direct inspection of the current repository, not on assumptions from a design mockup.

Last measured: 2026-06-28. Reflects state after PR merges #178–#192.

## Most important finding

The public buttons and forms are already wired to real API routes in several places. If they appear to be dead, the most likely root cause is missing runtime configuration:

- `CONTRIBUTOR_SALT` is required by public submission routes that create a `contributor_hash`.
- Missing Supabase variables move some flows into stub mode or make admin endpoints fail.
- `ADMIN_SECRET` must be configured before exposing admin routes.

## Fix order for every AI agent

1. Environment setup and validation.
2. Admin authentication hardening.
3. Locale/link hardcoding cleanup.
4. Remove false-success stub behavior from user-visible flows.
5. Run the full functional audit.
6. Only then do visual/design polish.

Do not start with design. A prettier interface will not fix unavailable database writes, missing secrets, or false success states.

## Status after recent merges

### Fixed (no action needed)

- **Admin review auth bypass**: `/api/admin/review` now uses `requireAdmin` from `lib/admin-api`. An empty `ADMIN_SECRET` correctly denies access. (Fixed in #185)
- **Business profile contributor hashing**: `api/business/profile/route.ts` now uses `makeContributorHashForRequest` from `lib/contributor-hash`. (Fixed in #190)
- **Rate limiting security**: Middleware no longer grants elevated limits based on an unhashed user-provided key prefix. Per-route limits added to documents, entities, index, and raw routes. (Fixed in #189)
- **Community post moderation**: Public submissions now default to `status: "pending"` enforced by RLS. (Fixed in #187)
- **Wiki language switcher**: `app/[locale]/wiki/[slug]/page.tsx` now shows `LOCALE_CONFIG` labels instead of bare `l.toUpperCase()`. (Fixed in #179)
- **Submission length limits**: report and hallucination routes enforce `maxLength` at both API and form levels. (Fixed in #191)

### Remaining bugs (action required)

- **Hardcoded `/ko/wiki` links in production UI** — affects non-Korean users. Files:
  - `app/report/[slug]/ReportForm.tsx`
  - `app/hallucination/[slug]/HallucinationForm.tsx`
  - `app/community/CommunityClient.tsx`
  - `app/admin/candidates/page.tsx`
  - `app/admin/verify-claim/page.tsx`
  - `app/diagnostics/[slug]/page.tsx`
  - Replace all with `documentPageUrl(slug, locale)` from `lib/urls.ts`.

- **False-success in `/api/suggest-topic`**: Returns `{ accepted: true }` even when the Supabase insert fails (falls back to stub silently). If `storage !== "db"`, the response must indicate the submission was not durably stored so the UI can show an honest pending/unconfigured state.

## Files in this handoff

- `ENV_SETUP.md` — required human-provided secrets and local environment checklist.
- `FUNCTIONAL_AUDIT.md` — page-by-page click/form verification checklist.
- `instructions/CLAUDE_CODE.md` — paste-ready Claude Code work order.
- `instructions/CODEX.md` — paste-ready Codex work order.
- `instructions/DEVIN.md` — paste-ready Devin work order.

## Repository facts this handoff is grounded in

- Canonical schema file: `schema-v3.sql`.
- Public topic suggestions call `/api/suggest-topic` and require `CONTRIBUTOR_SALT` before returning success.
- Admin routes all use `lib/admin-api.ts` `requireAdmin` guard as of #185.
- Locale-aware URL helper: `documentPageUrl(slug, locale)` in `lib/urls.ts`.
- Several admin creation/import pages are intentionally stub-like or may show success without durable user-facing persistence guarantees unless Supabase and schema are configured.
