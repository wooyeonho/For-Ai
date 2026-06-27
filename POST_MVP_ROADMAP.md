# Post-MVP Roadmap

For-Ai `v0.1.0-mvp` is the static-first baseline for the global fact registry.
This document is planning-only. It does not change runtime behavior, schema, seeded facts, or deployment configuration.

## Current MVP Baseline

The MVP includes:

- Static-first Next.js app routes for humans, crawlers, and AI systems.
- One seeded Korean registry document: `/ko/wiki/myungdong-laluce-parking`.
- One canonical MVP entity: `kr-weddinghall-laluce-001`.
- Machine-readable outputs:
  - `/api/documents/myungdong-laluce-parking`
  - `/raw/myungdong-laluce-parking.md`
  - `/sitemap.xml`
  - `/robots.txt`
- Claim-level local data shaped by `schema-v3.sql`.
- Report and hallucination report pages with safe submission stubs.
- Admin review/content creation pages as non-persistent MVP stubs.
- Diagnostics and deployment checklist for route and AI-readiness checks.

## Stubbed or Non-Persistent Areas

These areas are intentionally not production persistence yet:

- Public correction report submissions.
- Public AI hallucination report submissions.
- Admin review queue.
- Admin new entity creation.
- Admin new document creation.
- Admin bulk import.
- Status transitions and audit trail.
- Source-backed claim verification workflow.

Submission and admin flows must continue to follow MVP privacy rules:

- Do not store raw IP addresses.
- Store `contributor_hash` only.
- Do not allow public read access for edits, reports, or hallucination reports.
- Do not require login for public submissions.

## Current Data Quality State

The MVP seed data intentionally does not invent venue facts.

- Unknown facts remain "확인 필요".
- Confidence remains `low` for unknown facts.
- Claim status remains `needs_review` until source-backed verification exists.
- Sources remain empty until verification work adds real citations.

## Phase 1: Persistence Design

Design persistence before wiring runtime database calls.

Scope:

- Map `schema-v3.sql` to the selected database runtime.
- Define migration workflow and rollback plan.
- Confirm RLS policies for public insert-only submission tables.
- Confirm private read access for edits, reports, and hallucination reports.
- Define `contributor_hash` generation and salt handling.
- Keep raw IP addresses out of storage.

Out of scope:

- Changing the canonical schema model.
- Adding user accounts or complex auth.
- Adding payment or unrelated platform features.

## Phase 2: Data Verification Workflow

Build source-backed verification before replacing placeholder facts.

Scope:

- Add source capture workflow for claim-level facts.
- Add claim source review rules.
- Add verification event creation rules.
- Promote claims from `needs_review` only after source-backed validation.
- Preserve unknown facts as "확인 필요" until verified.

Out of scope:

- Inventing venue facts.
- Importing unsupported third-party data without licensing review.

## Phase 3: Admin Review Hardening

Turn admin stubs into a minimal operational workflow after persistence is designed.

Scope:

- Review queue for submitted edits, reports, and hallucination reports.
- Status transitions: `new`, `reviewing`, `accepted`, `rejected`, `spam`.
- Audit trail via verification events or a clearly defined admin event log.
- Safe handling of contributor hashes.
- Clear separation between public insert and private review.

Out of scope:

- Large admin systems.
- Complex auth.
- Public read access to private submission data.

## Phase 4: AI/Search Indexing Validation

Validate that For-Ai is useful to crawlers, search engines, and AI systems.

Scope:

- Submit sitemap to search engines.
- Validate structured data output.
- Validate raw Markdown accessibility.
- Test crawler visibility of static HTML content.
- Evaluate whether `llms.txt` is useful as a secondary discovery aid.

Constraints:

- `llms.txt` is secondary.
- `llms.txt` is not the legal basis.
- `llms.txt` is not the citation engine.

## Phase 5: UX, Accessibility, and Operational Polish

Polish the MVP without changing its claim-level data model.

Scope:

- Mobile visual review.
- Form success and error states.
- Keyboard navigation checks.
- Color contrast checks.
- Lighthouse and basic accessibility checks.
- Route smoke test automation in deployment workflow.

Out of scope:

- Marketing redesign.
- Blog/wiki/community UI patterns.
- Heavy UI libraries.

## Recommended Next Action

Do not start new runtime features immediately.

Recommended next PR after this planning document:

1. Persistence design document only.
2. No Supabase runtime integration yet.
3. No schema changes unless they are explicitly justified against `schema-v3.sql`.
4. No real venue facts until source-backed verification workflow exists.
