# Post-MVP Long-Tail Combination Catalog

This document extends the topic-catalog strategy from practical administrative facts into broad long-tail knowledge: ordinary objects, infrastructure, medical terminology, clinical pathology, radiology, vehicles, buses, rail, plumbing, insects, hardware, electricity, and otaku-style media classification.

The goal is not to publish AI-generated answers. The goal is to let AI generate many structured topic and claim candidates that humans and source-backed workflows can correct, verify, or reject.

## Principle

Every AI-generated combination starts as a verification candidate:

- `claim_value`: `확인 필요`
- `confidence`: `low`
- `status`: `needs_review`
- `sources`: `[]`
- `last_verified_at`: `null`

A generated candidate may become a real answer only after an acceptable source is attached and a verification event records the status/confidence change.

## Why Long-Tail Combinations Matter

People ask AI about small, boring, technical, and highly specific things:

- subway station structures, transfer passages, platform screen doors, and station-name systems;
- train names, train classes, bus types, low-floor buses, and route contexts;
- toilet types, faucet types, drain traps, bidet types, and other plumbing fixtures;
- insect classes, identification features, and habitat context;
- screws, bolts, driver bits, wrench types, wire standards, outlets, and light-bulb sockets;
- medical terms, blood tests, urine tests, imaging modalities, and radiology terminology;
- car body types, engine types, fuel systems, and EV charging methods;
- anime watch order, manga serialization order, game item categories, character attributes, and figure lineups.

These questions are often too small for a full article but still useful as claim-level registry pages.

## Combination Axes

Generate candidates by combining three axes:

```text
domain -> subject -> facet
```

Examples:

```text
radiology.imaging -> CT 검사 -> 검사 방식
transport.bus -> 저상버스 -> 분류 기준
plumbing.fixture -> 양변기 종류 -> 구성 요소
biology.insect -> 곤충의 종류 -> 식별 특징
otaku.media -> 애니 시청 순서 -> 공식 맥락
```

## Added Long-Tail Taxonomy

Suggested category prefixes:

- `medical.term`
- `clinical_pathology.lab`
- `radiology.imaging`
- `vehicle.car`
- `transport.bus`
- `rail.train`
- `transport.structure`
- `plumbing.fixture`
- `biology.insect`
- `hardware.standard`
- `electricity.fixture`
- `otaku.media`

The taxonomy can later expand to:

- `medical.anatomy`
- `medical.department`
- `clinical_pathology.microbiology`
- `radiology.finding_term`
- `vehicle.ev`
- `transport.subway`
- `object.household`
- `material.plastic`
- `standard.size`
- `game.system`
- `anime.character`
- `manga.series`
- `collectible.figure`

## Safety Boundaries

### Medical, clinical pathology, and radiology

Use `risk_tier: high` and `disclaimer_type: not_medical_advice`.

Allowed:

- terminology candidates;
- classification candidates;
- general test-item candidates;
- modality comparison candidates;
- source suggestions from official, academic, or medical-institution sources.

Not allowed as generated verified facts:

- diagnosis;
- treatment recommendation;
- personal lab-result interpretation;
- personal imaging finding interpretation;
- medication instructions.

### Transport, rail, and buses

Use `check_official_source` for fares, timetables, route contexts, and policy-like claims because they may change.

### Otaku/media topics

Allowed:

- watch-order candidate pages;
- official release-order candidates;
- character attribute candidate pages;
- game item category candidates.

Avoid:

- long copyrighted story reproduction;
- long quoted dialogue;
- rumor-based claims;
- fan speculation presented as fact.

## Sample File

The generated sample file is:

```text
data/topic-candidates/long-tail-combination-sample.jsonl
```

It contains deterministic examples generated from the domain/subject/facet matrix. All claims are unverified.

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

Future AI generation should preserve the same invariant: all generated claims remain `확인 필요` / `low` / `needs_review` until source-backed verification.

## Next Expansion

Recommended next increments:

1. Add a validator that rejects generated facts not marked as unverified.
2. Add daily AI generation behind a manual/cron GitHub Action that creates pull requests, never direct pushes.
3. Add `/suggest-topic` so users can submit boring/technical/otaku topics.
4. Add source-suggestion UI so people can attach official, academic, manufacturer, operator, or publisher sources.
5. Promote only reviewed candidates into public pages and sitemap entries.

## One-click question candidate generation

Use the question-candidate generator when the goal is to create a broad queue of AI/search-worthy questions from word combinations, without publishing answers as facts.

```bash
npm run generate:question-candidates -- --count 1000 --out data/question-candidates/one-click-sample.jsonl
```

The generator is intentionally broad: apparel prices, real-estate prices, transport structures, vehicle types, everyday fixtures, biology, food knowledge, medical terms, sports/rules/history, culture/media, and public administration fees.

Safety invariant:

- generated rows are `internal_candidate` by default;
- generated rows are not verified documents;
- every generated claim uses `claim_value: "확인 필요"`, `confidence: "low"`, `status: "needs_review"`, and empty `sources`;
- realtime/high-risk topics such as prices, real estate, medical, finance, legal-adjacent, and platform policy topics require source-backed verification before public citation.
