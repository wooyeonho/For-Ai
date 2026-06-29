# Post-MVP Long-Tail Combination Catalog

This document extends the topic-catalog strategy from practical administrative facts into broad long-tail combinations where AI answers often become stale: visa requirements, metro fares, passport fees, SaaS pricing, refund policies, and airport transfers.

The goal is not to publish AI-generated answers or verified documents. The goal is to create structured topic candidates that humans and source-backed workflows can correct, verify, or reject before any public factual claim is promoted.

## Principle

Every generated combination starts as a topic candidate, not a verified document. It contains only discovery and triage metadata:

- `canonical_slug`
- `locale`
- `country`
- `category`
- `likely_question`
- `source_search_query`
- `risk_tier`
- `update_frequency`

A topic candidate may become a real answer only after acceptable sources are attached and the normal claim-level verification workflow creates reviewed claims and verification events.

## Why Long-Tail Combinations Matter

People ask AI about small, specific, high-change facts:

- whether one country's citizens need a visa for another country;
- what a city metro operator currently charges;
- how much each passport document type costs in a country;
- what a SaaS product plan costs in a particular currency or market;
- what refund policy applies to a platform in a country;
- how to transfer from an airport to the city center.

These questions are often too narrow for a full article but still useful as claim-level registry seed topics after source-backed review.

## Combination Axes

Generate candidates by combining the requested axes:

```text
visa_requirement -> origin country -> destination country
metro_fare -> city -> transport operator
passport_fee -> country -> document type
saas_pricing -> product -> plan -> currency/country
refund_policy -> platform -> country
airport_transfer -> airport -> city center
```

Examples:

```text
visa_requirement -> United States -> Japan
metro_fare -> London -> Transport for London
passport_fee -> South Korea -> passport renewal
saas_pricing -> GitHub -> business -> USD/US
refund_policy -> Steam -> Canada
airport_transfer -> Incheon Airport -> central Seoul
```

## Added Long-Tail Taxonomy

Current category values:

- `visa_requirement`
- `metro_fare`
- `passport_fee`
- `saas_pricing`
- `refund_policy`
- `airport_transfer`

The taxonomy can later expand to additional high-change domains, but generated rows must remain topic candidates until promoted by source-backed verification.

## Safety Boundaries

### Travel, government, pricing, and commerce

Use `risk_tier: high` for visa requirements because eligibility can change quickly and depends on nationality, destination, date, and traveler circumstances.

Use `risk_tier: medium` for metro fares, passport fees, SaaS pricing, refund policies, and airport transfers because they are operational or commercial facts that can change without notice.

Allowed:

- topic candidates that describe what should be verified;
- source-search queries that point reviewers toward official government, operator, platform, airport, or product pricing sources;
- country and locale metadata for routing and prioritization.

Not allowed as generated verified facts:

- asserting that a visa is or is not required;
- asserting a fare, fee, price, refund window, or transfer time;
- implying that a generated candidate has already been reviewed;
- using blog/forum/rumor content as verification.

## Sample File

The generated sample file is:

```text
data/topic-candidates/long-tail-combination-sample.jsonl
```

It contains deterministic examples generated from the combination matrices. Rows are topic candidates only and do not contain verified claims.

Regenerate it with:

```bash
node scripts/generate-long-tail-combinations.mjs --count 120 --out data/topic-candidates/long-tail-combination-sample.jsonl
```

## Generator Script

The helper script is:

```text
scripts/generate-long-tail-combinations.mjs
```

It intentionally does not call an AI provider. It creates a deterministic starter matrix so AI-based generation can later be compared against a safe baseline.

Future AI generation should preserve the same invariant: generated rows are topic candidates only until source-backed verification promotes them into claim-level documents.

## Next Expansion

Recommended next increments:

1. Add a validator that rejects generated facts not marked as unverified.
2. Add daily AI generation behind a manual/cron GitHub Action that creates pull requests, never direct pushes.
3. Add `/suggest-topic` so users can submit boring/technical/otaku topics.
4. Add source-suggestion UI so people can attach official, academic, manufacturer, operator, or publisher sources.
5. Promote only reviewed candidates into public pages and sitemap entries.
