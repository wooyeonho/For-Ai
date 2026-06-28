# Claude Code instructions

## Prompt

You are working on For-Ai, a global claim-level fact registry for AI citation. First read `AGENTS.md` and `design_handoff_for_ai/*`. All known runtime bugs are resolved. Work in this order: environment setup → functional audit → design polish.

## Required steps

### 1. Environment (human must do first — AI cannot supply secret values)

Confirm `.env.local` contains all variables from `design_handoff_for_ai/ENV_SETUP.md`. Do not proceed until a human has confirmed Supabase is configured and `CONTRIBUTOR_SALT` is set.

### 2. Run the functional audit

Follow `design_handoff_for_ai/FUNCTIONAL_AUDIT.md` top to bottom. Record pass/fail for each item. Fix any newly discovered failures before moving to design.

### 3. Design polish last

Only after all functional audit items pass, address visual/layout issues.

## Known-good state (do not re-implement)

| Area | Implementation |
|---|---|
| Admin auth | `requireAdmin(request, action)` from `lib/admin-api` |
| Contributor hashing | `makeContributorHashForRequest(request)` from `lib/contributor-hash` |
| Rate limiting | Per-route via `checkRateLimit` / `authenticateApiKey` from `lib/api-rate-limit` |
| Community moderation | `status: "pending"` default, enforced by RLS |
| Locale-aware document URLs | `documentPageUrl(slug, locale)` from `lib/urls.ts` |
| Submission length limits | `lib/submission-limits.ts` constants, enforced at API and form |
| Topic suggestion honesty | Returns `accepted: false, error: "SERVER_UNCONFIGURED"` when DB unavailable |

## Do not

- Do not invent entity facts.
- Do not store raw IP addresses.
- Do not make `documents.data` canonical truth.
- Do not hide broken persistence behind success UI.
- Do not hardcode `/ko/wiki/` — use `documentPageUrl(slug, locale)`.
