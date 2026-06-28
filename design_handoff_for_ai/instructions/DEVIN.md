# Devin instructions

## Objective

Bring the For-Ai repository to a deployable functional baseline. Treat this as a stabilization project, not a redesign project.

## Plan

1. Repository discovery: read `AGENTS.md`, `PLAN.md`, `schema-v3.sql`, and all files in `design_handoff_for_ai/`.
2. Environment validation: confirm required `.env.local` variables from `ENV_SETUP.md` and report missing values without inventing them.
3. Security pass: make every admin endpoint require a non-empty configured `ADMIN_SECRET`; prefer shared helpers in `lib/admin-api.ts`.
4. Internationalization pass: eliminate production-only `/ko/wiki` and `lang: "ko"` hardcoding where the current locale is available.
5. Persistence pass: remove false-success behavior from public/admin flows. If data is not stored, the UI/API response must say so.
6. Functional audit: execute `FUNCTIONAL_AUDIT.md`, capture command output, and file issues for remaining failures.
7. Design pass: only after functional acceptance is met.

## Deliverables

- Code changes with tests or clear verification notes.
- A short report mapping each changed route/page to the audit item it fixes.
- No fabricated facts or schema deviations.
