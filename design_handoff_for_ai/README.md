# For-Ai repository-measured handoff

This handoff is based on direct inspection of the current repository, not on assumptions from a design mockup.

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

## Files in this handoff

- `ENV_SETUP.md` — required human-provided secrets and local environment checklist.
- `FUNCTIONAL_AUDIT.md` — page-by-page click/form verification checklist.
- `instructions/CLAUDE_CODE.md` — paste-ready Claude Code work order.
- `instructions/CODEX.md` — paste-ready Codex work order.
- `instructions/DEVIN.md` — paste-ready Devin work order.

## Repository facts this handoff is grounded in

- Canonical schema file: `schema-v3.sql`.
- Public topic suggestions call `/api/suggest-topic` and require `CONTRIBUTOR_SALT` before returning success.
- Admin routes are mixed: most use `lib/admin-api.ts`, but `/api/admin/review` has its own local auth helper that currently allows access when `ADMIN_SECRET` is empty.
- Several public links still hardcode `/ko/wiki/...` even though the app uses `[locale]` routes.
- Several admin creation/import pages are intentionally stub-like or may show success without durable user-facing persistence guarantees unless Supabase and schema are configured.
