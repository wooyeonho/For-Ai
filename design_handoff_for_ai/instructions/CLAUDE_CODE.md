# Claude Code instructions

## Prompt

You are working on For-Ai, a global claim-level fact registry for AI citation. First read `AGENTS.md` and `design_handoff_for_ai/*`. Do not begin with design. Stabilize runtime behavior in this order: environment, admin auth, locale handling, false-success stubs, full functional audit, then design.

## Required steps

1. Inspect actual routes and components before changing code.
2. Use `schema-v3.sql` as the database source of truth.
3. Ensure all admin APIs deny access when `ADMIN_SECRET` is missing or wrong.
4. Ensure public submissions fail clearly when required environment is missing and persist only with Supabase configured.
5. Replace production hardcoded `/ko/wiki` links with locale-aware helpers.
6. Run `FUNCTIONAL_AUDIT.md` and summarize every failure.

## Do not

- Do not invent entity facts.
- Do not store raw IP addresses.
- Do not make `documents.data` canonical truth.
- Do not hide broken persistence behind success UI.
- Do not prioritize visual polish before forms and admin flows actually work.
