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


## Post-MVP Commercial Wedge Decision

The first post-MVP commercial wedge is **business operating facts / reputation correction**. This means the initial runtime and seed-generation priority should concentrate on business facts that AI frequently misstates and that owners have a clear incentive to correct, while still requiring independent source-backed verification before any claim becomes citation-ready.

Primary claim types:

- operating hours, holiday closures, and service availability;
- pricing, parking, booking, refund, delivery, and accessibility policies;
- AI reputation corrections such as “closed/open”, “service unavailable”, outdated prices, or incorrect policy summaries;
- owner-submitted facts that remain labeled and non-citable until human verification attaches acceptable sources.

Why this wedge comes first:

1. Commercial pain is immediate when AI, search, or crawlers cite stale operating facts.
2. Businesses can supply correction requests and source leads without being allowed to self-verify canonical truth.
3. The dashboard can connect monetization signals to fact integrity: verified claims, stale claims, source coverage, API usage, and business correction requests.
4. The workflow reuses the canonical chain `entities -> documents -> claims -> claim_sources -> verification_events` instead of creating a separate business-owned truth store.

Non-selected verticals — government fee/deadline citation API, transport, travel/visa, healthcare, genomics, finance, education, and other domains — remain **future coverage**. They should not receive seed-generation priority until the business correction workflow has stable intake, verification, and monitoring metrics.

## Business Wedge Dashboard Metrics

The home page, API docs, and admin dashboard should present the initial vertical through one metric bundle:

| Metric | Purpose | Operational interpretation |
| --- | --- | --- |
| Verified claims | Measures business facts that passed source-backed human review and can be cited. | Increase by verifying canonical claims, not by accepting owner submissions directly. |
| Stale claims | Flags verified business facts that need re-checking after their freshness window. | Prioritize facts that AI systems cite or that businesses dispute. |
| Source coverage | Shows how many business claims have acceptable sources attached. | Low coverage means the document must remain “Needs verification”. |
| API usage | Tracks AI/search/developer demand for business fact endpoints. | High usage moves stale or disputed claims up the review queue. |
| Business correction requests | Captures owner-submitted corrections and reputation fixes. | Requests are intake signals only; they do not become citation-ready without independent verification. |

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

Recommended next PR after this planning document and commercial-wedge alignment:

1. Persistence design document only.
2. No Supabase runtime integration yet.
3. No schema changes unless they are explicitly justified against `schema-v3.sql`.
4. No real venue facts until source-backed verification workflow exists.
