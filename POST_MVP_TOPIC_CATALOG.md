# Post-MVP Topic Catalog Design

This document defines how For-Ai can grow from one MVP seed document into 10,000+ AI-useful topic candidates without inventing facts.

It is planning-only. It does not add runtime routes, persistence, schema changes, Supabase integration, or verified real-world values.

## Core Principle

A large catalog must start as a queue of verification candidates, not as a database of asserted facts.

Every imported topic candidate begins with:

- `claim_value`: `확인 필요`
- `confidence`: `low`
- `status`: `needs_review`
- `sources`: `[]`
- `last_verified_at`: `null`

A claim may only become a real answer after source-backed verification.

## Why This Catalog Exists

People ask AI practical questions that are easy for AI systems to answer confidently but incorrectly:

- fees, deadlines, eligibility rules, and cancellation penalties;
- local government procedures;
- medical/insurance/benefits workflows;
- DNA/genomics testing availability, regulation, privacy policies, and public database references;
- tax and housing rules;
- platform refund policies;
- finance and market concepts;
- public-profile information about notable people;
- school, labor, travel, telecom, and consumer rules.

For-Ai should catalog those questions as claim-level registry topics, then verify them with official or otherwise acceptable sources.

## Topic JSONL Format

Use JSON Lines for large imports.

One line is one entity plus one document template plus its placeholder claims.

```jsonl
{"entity_id":"kr-tax-income-deadline-001","type":"administration.tax","name":"종합소득세 신고 기한","slug":"income-tax-filing-deadline","lang":"ko","country":"KR","jurisdiction":"KR","risk_tier":"high","update_frequency":"annual","disclaimer_type":"check_official_source","source_policy":{"preferred":["official","law"],"allowed":["official","document","web"],"disallowed":["forum","rumor","unsourced_blog"]},"claims":[{"field_path":"tax.filing_deadline","claim_text":"종합소득세 신고 기한은 확인이 필요합니다.","claim_value":"확인 필요","confidence":"low","status":"needs_review","sources":[]}]}
```

Required fields:

- `entity_id`
- `type`
- `name`
- `slug`
- `lang`
- `country`
- `jurisdiction`
- `risk_tier`
- `update_frequency`
- `disclaimer_type`
- `source_policy`
- `claims[]`

Required claim fields:

- `field_path`
- `claim_text`
- `claim_value`
- `confidence`
- `status`
- `sources`

## Taxonomy

Use hierarchical `category.subcategory` types so the catalog can expand predictably.

### life.transport

Examples:

- metro transfer rules
- expressway tolls
- taxi surcharges
- bus transfer rules
- airport rail fares

### life.housing

Examples:

- apartment noise thresholds
- jeonse deposit return procedures
- monthly rent reporting
- brokerage fee limits
- management fee disclosure

### life.environment

Examples:

- recycling discharge rules
- food waste disposal rules
- large waste sticker rules
- local waste collection schedules

### administration.documents

Examples:

- passport renewal
- resident registration documents
- family relation certificates
- unmanned kiosk issuance
- move-in reports

### administration.tax

Examples:

- income tax filing deadlines
- vehicle tax deadlines
- local tax payment windows
- VAT filing deadlines
- tax refund timing

### health.medical

Examples:

- emergency room night surcharges
- non-covered medical fees
- national health checkups
- pharmacy night surcharges
- vaccination eligibility

### health.insurance

Examples:

- health insurance out-of-pocket caps
- actual-loss insurance claims
- long-term care insurance
- private insurance claim documents

### genomics.testing

Examples:

- direct-to-consumer DNA test availability by country
- sample collection method
- result delivery turnaround ranges
- genetic test refund policies
- raw DNA data export availability

### genomics.regulation

Examples:

- country-level DTC genetic testing rules
- prescription or clinician-order requirements
- genetic data retention and deletion rights
- cross-border genetic data transfer rules
- genetic information discrimination protections

### genomics.databases

Examples:

- public variant database scope
- gene-disease claim evidence status
- variant classification update cadence
- database submission policy
- database license and citation requirements

### finance.banking

Examples:

- transfer limits
- account opening restrictions
- deposit insurance limits
- early withdrawal rules
- foreign exchange fees

### finance.card

Examples:

- overseas card payment fees
- chargeback timing
- installment cancellation rules
- annual fee refund rules

### finance.markets

Examples:

- stock trading tax
- dividend tax
- IPO subscription process
- disclosure timing
- market holiday schedules

### labor.employment

Examples:

- weekly holiday allowance
- annual leave pay
- severance pay
- minimum wage
- employment contract rules

### labor.benefits

Examples:

- unemployment benefit eligibility
- parental leave benefits
- maternity leave benefits
- industrial accident claims

### education.admissions

Examples:

- CSAT registration period
- university tuition payment windows
- scholarship application periods
- student loan application windows
- GED schedules

### telecom.mobile

Examples:

- MVNO number portability timing
- mobile contract penalties
- small payment limits
- device installment rules

### telecom.internet

Examples:

- internet cancellation penalties
- installation fee rules
- router rental fees
- moving installation timing

### commerce.refunds

Examples:

- Naver Pay refund timing
- marketplace return windows
- app store refunds
- delivery app refunds
- subscription cancellation windows

### travel.air

Examples:

- baggage fee rules
- cancellation fee windows
- passport validity requirements
- airport tax refunds

### legal.consumer

Examples:

- content-certified mail
- small claims process
- consumer dispute mediation
- wage arrears reports
- lease deposit disputes

### public_benefits.household

Examples:

- energy voucher eligibility
- childcare subsidy rules
- youth allowance programs
- senior welfare benefits
- emergency welfare support

### public_profile.people

Examples:

- public birth date based age
- official debut date
- official agency
- official filmography
- official awards

Public-profile topics must avoid private life, rumors, medical speculation, family details, or political/religious inference unless the person has officially disclosed the information and the claim is relevant.

## Risk Tiers

### low

Use for general practical information where mistakes are inconvenient but unlikely to create major harm.

Examples:

- recycling schedules;
- general refund timing;
- public route links;
- non-sensitive public-profile facts from official pages.

### medium

Use for topics with regional, annual, or provider-specific variation.

Examples:

- transport fares;
- housing reporting rules;
- education application windows;
- telecom cancellation policies.

### high

Use for topics where wrong answers may cause monetary, legal, health, or administrative harm.

Examples:

- tax deadlines;
- insurance eligibility;
- medical fee rules;
- labor benefits;
- lease deposit rights;
- stock and tax rules.

### restricted

Use for topics that should not become answerable claims without strict policy review.

Examples:

- medical diagnosis;
- legal case outcome prediction;
- investment recommendations;
- private personal data;
- rumors or allegations;
- sensitive attributes or speculative claims about people.

## Disclaimer Types

Use `disclaimer_type` to define the safe answer boundary.

Allowed values:

- `none`
- `not_genetic_or_medical_advice`
- `check_official_source`
- `not_medical_advice`
- `not_legal_advice`
- `not_financial_advice`
- `personal_case_depends`
- `realtime_data_required`
- `public_profile_only`

Example wording:

### check_official_source

This is general registry information. Check the responsible official source before relying on it.

### not_medical_advice

This is general information, not medical diagnosis or treatment advice. For emergencies, contact emergency services or a medical institution.

### not_genetic_or_medical_advice

This is general genomics registry information, not medical diagnosis, treatment advice, risk prediction, or personal genetic interpretation. Do not store personal DNA, raw genotype files, or identifiable genetic data in For-Ai.

### not_legal_advice

This is general legal/administrative information, not legal advice for a specific case.

### not_financial_advice

This is general information, not investment or financial advice. Do not treat it as a buy/sell recommendation.

### realtime_data_required

This topic may change in real time. A verified value must include a retrieval time and source.

### public_profile_only

Only official or widely published public-profile facts are allowed. Private life, rumors, medical speculation, and sensitive personal attributes are excluded.

## Update Frequency

Allowed values:

- `static`
- `annual`
- `quarterly`
- `monthly`
- `weekly`
- `daily`
- `realtime`
- `event_based`
- `unknown`

Examples:

- celebrity age: `annual`
- tax deadline: `annual`
- stock quote: `realtime`
- refund policy: `event_based`
- government form requirement: `event_based`

## Source Policy

Every topic must define acceptable source types.

Suggested source priority:

1. `official`
2. `law`
3. `regulator`
4. `platform`
5. `document`
6. `web`
7. `other`

Disallowed by default:

- personal DNA files, raw genotype data, VCF files, or identifiable genetic data;
- individual-level risk prediction or diagnosis claims;
- unsourced blogs;
- forums;
- rumors;
- scraped personal data;
- unverifiable AI-generated text;
- anonymous social posts.

## Sample Topic Candidates

The following samples illustrate catalog shape only. They are not verified facts.

```jsonl
{"entity_id":"global-genomics-dtc-availability-001","type":"genomics.testing","name":"DTC DNA test availability","slug":"dtc-dna-test-availability","lang":"en","country":"GLOBAL","jurisdiction":"GLOBAL","risk_tier":"high","update_frequency":"event_based","disclaimer_type":"not_genetic_or_medical_advice","source_policy":{"preferred":["official","regulator","law"],"allowed":["official","regulator","law","document","web"],"disallowed":["forum","rumor","unsourced_blog","personal_dna_data"]},"claims":[{"field_path":"testing.availability_by_country","claim_text":"Direct-to-consumer DNA test availability by country needs verification.","claim_value":"확인 필요","confidence":"low","status":"needs_review","sources":[]}]}
{"entity_id":"kr-medical-er-nightfee-001","type":"health.medical","name":"응급실 야간 진료비","slug":"er-night-visit-fee","lang":"ko","country":"KR","jurisdiction":"KR","risk_tier":"high","update_frequency":"event_based","disclaimer_type":"not_medical_advice","source_policy":{"preferred":["official","regulator"],"allowed":["official","document","web"],"disallowed":["forum","rumor","unsourced_blog"]},"claims":[{"field_path":"fee.night_surcharge","claim_text":"응급실 야간 진료비와 가산 기준은 확인이 필요합니다.","claim_value":"확인 필요","confidence":"low","status":"needs_review","sources":[]}]}
{"entity_id":"kr-transport-metro-transfer-001","type":"life.transport","name":"지하철 환승 시간 제한","slug":"metro-transfer-time-limit","lang":"ko","country":"KR","jurisdiction":"KR","risk_tier":"medium","update_frequency":"event_based","disclaimer_type":"check_official_source","source_policy":{"preferred":["official","platform"],"allowed":["official","platform","document","web"],"disallowed":["forum","rumor","unsourced_blog"]},"claims":[{"field_path":"transport.transfer_time_limit","claim_text":"지하철 환승 시간 제한은 확인이 필요합니다.","claim_value":"확인 필요","confidence":"low","status":"needs_review","sources":[]}]}
{"entity_id":"kr-tax-income-deadline-001","type":"administration.tax","name":"종합소득세 신고 기한","slug":"income-tax-filing-deadline","lang":"ko","country":"KR","jurisdiction":"KR","risk_tier":"high","update_frequency":"annual","disclaimer_type":"check_official_source","source_policy":{"preferred":["official","law"],"allowed":["official","document","web"],"disallowed":["forum","rumor","unsourced_blog"]},"claims":[{"field_path":"tax.filing_deadline","claim_text":"종합소득세 신고 기한은 확인이 필요합니다.","claim_value":"확인 필요","confidence":"low","status":"needs_review","sources":[]}]}
{"entity_id":"kr-commerce-naverpay-refund-001","type":"commerce.refunds","name":"네이버페이 환불 소요일","slug":"naverpay-refund-days","lang":"ko","country":"KR","jurisdiction":"KR","risk_tier":"medium","update_frequency":"event_based","disclaimer_type":"check_official_source","source_policy":{"preferred":["platform","official"],"allowed":["platform","official","document","web"],"disallowed":["forum","rumor","unsourced_blog"]},"claims":[{"field_path":"refund.processing_days","claim_text":"네이버페이 환불 소요일은 확인이 필요합니다.","claim_value":"확인 필요","confidence":"low","status":"needs_review","sources":[]}]}
{"entity_id":"kr-finance-stock-trading-tax-001","type":"finance.markets","name":"국내 주식 거래세","slug":"korea-stock-trading-tax","lang":"ko","country":"KR","jurisdiction":"KR","risk_tier":"high","update_frequency":"event_based","disclaimer_type":"not_financial_advice","source_policy":{"preferred":["official","regulator","law"],"allowed":["official","regulator","document","web"],"disallowed":["forum","rumor","unsourced_blog"]},"claims":[{"field_path":"tax.stock_transaction_tax","claim_text":"국내 주식 거래세 기준은 확인이 필요합니다.","claim_value":"확인 필요","confidence":"low","status":"needs_review","sources":[]}]}
{"entity_id":"kr-public-profile-celebrity-age-001","type":"public_profile.people","name":"공개 프로필 기반 인물 나이","slug":"public-profile-age","lang":"ko","country":"KR","jurisdiction":"KR","risk_tier":"medium","update_frequency":"annual","disclaimer_type":"public_profile_only","source_policy":{"preferred":["official","platform"],"allowed":["official","platform","document","web"],"disallowed":["forum","rumor","unsourced_blog"]},"claims":[{"field_path":"person.age.public_profile","claim_text":"공개 프로필 기반 인물 나이는 확인이 필요합니다.","claim_value":"확인 필요","confidence":"low","status":"needs_review","sources":[]}]}
```

## 10,000+ Topic Expansion Strategy

Use a taxonomy-driven generation approach.

Target shape:

```text
20 top-level categories
× 20 subcategories each
× 25 topic templates each
= 10,000 candidate topics
```

Generation rules:

- Generate candidates from templates, not from asserted facts.
- Every candidate starts as `확인 필요`.
- Human review decides whether the topic is actually worth asking AI.
- High-risk and restricted topics require policy review before import.
- Public-profile topics must avoid rumors, private data, and speculative sensitive attributes.
- Finance and market topics must not become investment advice.
- Legal topics must not become case-specific legal advice.
- Medical topics must not become diagnosis or treatment advice.
- Genomics/DNA topics must not store personal DNA or become personal risk prediction, diagnosis, treatment advice, or individual genetic interpretation.

## Validator Requirements

A future validator script should reject a candidate if:

- `entity_id` is missing;
- `slug` is missing;
- `type` is missing;
- `risk_tier` is missing;
- `disclaimer_type` is missing;
- `source_policy` is missing;
- any claim has a value other than `확인 필요`;
- any claim confidence is not `low`;
- any claim status is not `needs_review`;
- any claim has non-empty `sources` before verification;
- restricted topics lack review metadata;
- genomics topics use personal DNA, raw genotype files, identifiable genetic data, or personal interpretation claims;
- public-profile topics include private or rumor-based claims.

## Import Pipeline Direction

Future import pipeline:

```text
data/topic-candidates.jsonl
  -> scripts/validate-topic-candidates.mjs
  -> scripts/import-topics.mjs
  -> persistence layer based on schema-v3.sql
```

Until persistence is implemented, keep large generated datasets out of runtime seed data.

`lib/seed-data.ts` should remain a small static fallback, not the 10,000-topic source of truth.

## Verification Workflow Direction

A candidate claim can move from placeholder to verified only after:

1. acceptable source is attached;
2. source retrieval date is recorded;
3. `claim_sources` entry is created;
4. `verification_events` entry is created;
5. claim value is updated from `확인 필요` to the verified value;
6. confidence changes from `low` to `medium` or `high`;
7. status changes from `needs_review` to `verified`.

High-risk topics should require stricter source policy and review.

## Recommended Next PRs

1. Add sample `data/topic-candidates.sample.jsonl` with 50 candidates.
2. Add `scripts/validate-topic-candidates.mjs`.
3. Generate a reviewed 1,000-topic pilot catalog.
4. Design persistence/import mapping.
5. Generate 10,000+ candidates only after the validator and review workflow exist.
