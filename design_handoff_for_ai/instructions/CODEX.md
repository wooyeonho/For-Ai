# Codex instructions

Paste this into Codex at the repository root.

## Mission

Stabilize For-Ai as a global claim-level fact registry. Work from measured repository behavior, not assumptions. Do not redesign first.

## Order of work

1. Read `AGENTS.md`, `schema-v3.sql`, `design_handoff_for_ai/README.md`, `ENV_SETUP.md`, and `FUNCTIONAL_AUDIT.md`.
2. Verify environment behavior around `CONTRIBUTOR_SALT`, Supabase variables, and `ADMIN_SECRET`.
3. Fix admin auth bypasses first. In particular, any admin route must deny when `ADMIN_SECRET` is empty.
4. Replace hardcoded `/ko/wiki/...` production links and `lang: "ko"` defaults with locale-aware behavior unless the occurrence is a sample fixture.
5. Remove or relabel false-success stub flows. User-visible success must mean durable storage or explicitly say it is a non-durable local/stub response.
6. Run the functional audit and record results.
7. Do visual polish only after the above is complete.

## Acceptance criteria

- `npm run lint`, `npm run test`, and `npm run build` pass or failures are documented with exact causes.
- Public submissions never store raw IP addresses.
- Public submissions require `CONTRIBUTOR_SALT` for contributor hashes.
- Admin routes reject missing/empty/wrong secrets.
- Static document content remains readable without client-side JavaScript.
- `schema-v3.sql` remains the source of truth.
