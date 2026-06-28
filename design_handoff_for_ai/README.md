# For-Ai repository-measured handoff

This handoff is based on direct inspection of the current repository, not on assumptions from a design mockup.

Last measured: 2026-06-28. Reflects state after PR merges #178–#193.

## Most important finding

The public buttons and forms are already wired to real API routes. If they appear dead, the most likely root cause is missing runtime configuration:

- `CONTRIBUTOR_SALT` is required by public submission routes that create a `contributor_hash`.
- Missing Supabase variables move some flows into stub mode or make admin endpoints fail.
- `ADMIN_SECRET` must be configured before exposing admin routes.

## Fix order for every AI agent

1. Environment setup and validation.
2. Run the full functional audit.
3. Design polish last.

## Status — all known runtime bugs resolved

| Fix | PR |
|---|---|
| Admin review auth bypass (`ADMIN_SECRET` empty → allowed) | #185 |
| Business profile contributor hashing (local `createHash` → shared helper) | #190 |
| Rate limiting security (unhashed key prefix in middleware) | #189 |
| Community post moderation (`status` default → `pending`) | #187 |
| Wiki language switcher (bare `l.toUpperCase()` → `LOCALE_CONFIG` labels) | #179 |
| Submission length limits (report and hallucination routes + forms) | #191 |
| Hardcoded `/ko/wiki` links (11 files → `documentPageUrl`) | #193 |
| `suggest-topic` false-success (`accepted: true` on DB failure → `accepted: false`) | #193 |
| LanguageSelector homepage fallback | #193 |

## What still requires a human

- Creating a Supabase project and running `schema-v3.sql`.
- Providing all secrets listed in `ENV_SETUP.md`.
- Running `FUNCTIONAL_AUDIT.md` against a live environment to confirm end-to-end behavior.

## Files in this handoff

- `ENV_SETUP.md` — required human-provided secrets and local environment checklist.
- `FUNCTIONAL_AUDIT.md` — page-by-page click/form verification checklist.
- `instructions/CLAUDE_CODE.md` — paste-ready Claude Code work order.
- `instructions/CODEX.md` — paste-ready Codex work order.
- `instructions/DEVIN.md` — paste-ready Devin work order.
