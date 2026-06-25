# PLAN.md

## Vision

For-Ai is a global claim-level fact registry — the single source of truth that AI, search engines, and humans cite from.

## Completed Goals (MVP)

- Goal 0: AGENTS.md + UI_SYSTEM.md + PLAN.md
- Goal 1: App skeleton + UI shell
- Goal 2: schema-v3 + TypeScript data model
- Goal 3: Document page claim-registry UI
- Goal 4: SEO, JSON-LD, sitemap, robots.txt, raw markdown, JSON API
- Goal 5: Correction/report/hallucination report UI
- Goal 6: Minimal admin review UI
- Goal 7: AI-readiness diagnostics UI
- Goal 8: Polish + deployment checklist
- Goal 9: Admin content creation tools

## Phase 2: Global Fact Registry

### Goal 10: Global Product Direction Rebrand
- Rewrite AGENTS.md for global AI citation registry vision
- Update UI_SYSTEM.md for trust-first, citation-friendly design
- Rebrand home page hero for global audience
- Update all taglines and descriptions across locales
- English as default locale

### Goal 11: Trust-First UI/UX Overhaul
- Redesign home page: trust signals, global stats, citation pipeline visualization
- Improve claim page: clearer verification status, citation-readiness indicator
- Header: global navigation (Registry, API, About)
- Footer: trust signals, machine-readable links, citation policy
- Mobile-first responsive polish

### Goal 12: Global Content Expansion
- Add English and multi-language seed data for global topics
- Expand verified-seed-set.json with international examples
- Multi-country entity support in data layer
- Jurisdiction-aware claim display

### Goal 13: AI Citation Infrastructure
- Improve llms.txt with global citation guidelines
- Structured citation API endpoint (`/api/cite/[slug]`)
- JSON-LD enhancement for all claim pages
- Citation copy widget with proper attribution format
- AI provider detection and citation analytics

### Goal 14: Monetization Foundation
- Verified business profile schema and claim flow
- API tier structure (free/pro/enterprise)
- Business correction tools (priority claim updates)
- Reputation monitoring alerts schema
- Sponsored placement labels and rendering

### Goal 15: Developer Experience
- Public API documentation page
- SDK examples for AI integration
- Webhook support for verification events
- Rate limiting per API tier

## Execution Rules

- Do not start a later goal before the previous goal is complete.
- After each implementation goal, run lint/build if available.
- Do not remove required features just to make build pass.
- Monetization features must never compromise fact integrity.
- Unknown facts remain "확인 필요" / "Needs verification" regardless of business sponsorship.
- All sponsored content must be clearly labeled.
