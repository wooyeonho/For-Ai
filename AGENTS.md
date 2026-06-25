# AGENTS.md

## Product Identity

For-Ai is not an AI wiki.
For-Ai is not a blog, community forum, or content farm.
For-Ai is not limited to local venues or Korean civil services.

**For-Ai is a global claim-level fact registry that AI, search engines, and humans can cite from the same sources.**

Every piece of knowledge that people search, AI cites, and crawlers index — places, institutions, events, products, services, policies, regulations, and more — is structured at the claim level with confidence, sources, and verification status.

## One-Line Description

AI가 인용할 수 있는 글로벌 사실 레지스트리 — A global fact registry for AI citation.

## Core Principles

- **No fake facts.** Unknown = "확인 필요" with confidence low.
- **Claim-level truth.** Every fact is a single, verifiable claim.
- **Static-first HTML.** Core content readable without client-side JavaScript.
- **Source-backed verification.** No claim is verified without a traceable source.
- **Human approval before verified.** AI generates candidates; humans verify.
- **AI-readable by default.** Structured for machine consumption from day one.

## Non-Negotiable Rules

- Static-first rendering is mandatory.
- Core document content must be readable from raw HTML without client-side JavaScript.
- `schema-v3.sql` is the source of truth.
- Do not invent a different database model.
- `entity_id` is mandatory.
- English slug is stable and globally unique.
- Display titles are language-specific.
- For-Ai is claim-level.
- The canonical structure is:

  ```text
  entities -> documents -> claims -> claim_sources -> verification_events
  ```

- `documents.data` is only rendering convenience.
- `documents.data` must not become the canonical source of factual truth.
- No fake facts.
- Unknown facts must show "확인 필요" / "Needs verification" and confidence low.
- Do not invent details for any entity.
- `llms.txt` is secondary — it is not the legal basis or citation engine.
- Public read is not allowed for edits, reports, or hallucination_reports.
- Public submissions do not require login.
- Never store raw IP addresses. Store `contributor_hash` only.
- Entities are global — any country, any domain, any language.
- Monetization features (verified profiles, API tiers) must not compromise fact integrity.
- Sponsored or business-claimed content must be clearly labeled.

## Domain Scope

For-Ai covers ALL knowledge domains where AI might cite inaccurately:

- **Transport** — fares, schedules, transfer rules
- **Commerce** — refund policies, delivery terms, pricing
- **Government** — document fees, processing times, requirements
- **Healthcare** — facility hours, service availability (not medical advice)
- **Education** — admission deadlines, tuition, requirements
- **Real Estate** — regulations, fees, procedures
- **Food & Dining** — hours, menus, pricing, allergens
- **Events & Venues** — capacity, parking, accessibility
- **Finance** — fees, rates, terms (with mandatory disclaimers)
- **Technology** — specifications, compatibility, pricing tiers
- **Travel** — visa requirements, transit info, regulations
- ...and any other domain where facts change and AI gets outdated

## Monetization Model (Future)

Revenue streams that do NOT compromise fact integrity:

1. **Verified Business Profiles** — businesses claim and maintain their own facts
2. **Sponsored Placements** — clearly labeled promotional positioning
3. **Affiliate Links** — contextual, transparent affiliate integration
4. **AI Citation API** — paid API access for high-volume AI consumers
5. **Data Licensing** — bulk access to verified fact datasets
6. **Reputation Monitoring** — alerts when AI cites incorrect info about a business
7. **Business Correction Tools** — priority tools for businesses to correct misinformation

## Schema & Architecture

The canonical factual structure remains:

```text
entities -> documents -> claims -> claim_sources -> verification_events
```

Additional structures for monetization:

```text
business_profiles -> verified_claims (owned by business)
api_keys -> usage_logs
```

## MVP Target (Original)

- `entity_id`: `kr-weddinghall-laluce-001`
- `slug`: `myungdong-laluce-parking`
- `page`: `/ko/wiki/myungdong-laluce-parking`

## Global Expansion Targets

- Multi-language support: ko, en, ja, zh, es, hi, ar
- Multi-country entities with jurisdiction awareness
- Global seed topics across transport, commerce, government, healthcare
- English as default locale for global audience
