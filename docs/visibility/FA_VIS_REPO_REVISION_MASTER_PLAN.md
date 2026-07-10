# FA-VIS Repo Revision Master Plan

## 0. Why this document exists

This document converts the entire planning thread into a repository revision plan. It is written for three audiences:

1. **Fable 5** — to align visual/product form design before more coding.
2. **Codex / coding agent** — to know exactly what to change in the repo and what not to change.
3. **Founder/operator** — to keep the project tied to the first revenue loop instead of expanding strategy forever.

The plan intentionally covers both product strategy and repository tasks because FA-VIS will fail if the code becomes a generic demo, and it will also fail if the strategy keeps expanding without usable output.

## 1. Final business direction

The final direction is not a tax-accountant tool, not a wedding-hall tool, and not a generic SEO dashboard.

The direction is:

```text
For AI = a global inspection standard for measuring how entities are found, mentioned, cited, and compared in AI answers.
```

Korean shorthand:

```text
For AI는 전세계 엔티티를 위한 AI Visibility Inspection Standard다.
```

The first paid wedge is still local and narrow:

```text
kr-ko-mapo-tax-accountants → FA-D1 preliminary brief → paid FA-R1 detailed report
```

Global standard does **not** mean doing every country now. Global standard means the same forms, metrics, evidence log, and segment config can work for any country, language, category, and entity type later.

## 2. User constraints that must shape repo work

Repository work must respect these constraints:

- Weekly time: 10–15 hours.
- Monthly budget: low, roughly 100,000–300,000 KRW in early phase.
- User is not a developer; repo workflows must remain scriptable and explainable.
- Face exposure should be minimal.
- First revenue deadline was framed around a short window before mid-August, so output must support outreach quickly.
- Avoid generic content/blog/app/outsourcing business.
- Avoid overbuilding SaaS before payment signal.
- Avoid public low-score shaming.
- Avoid guarantee language.
- Prefer physical DM or compliant direct contact over unsolicited mass SMS/email.
- Do not let global-standard work become first-sales avoidance.

These constraints mean the repo should prioritize:

1. one credible FA-D1 brief,
2. one auditable FA-E1 trail,
3. one first-market segment,
4. one paid FA-R1 opportunity.

## 3. Current repo state

### 3.1 What exists

The latest FA-VIS commit added:

- segment fixtures under `data/visibility/segments/`:
  - `kr-ko-mapo-clinics`
  - `kr-ko-mapo-tax-accountants`
  - `kr-ko-seoul-wedding-venues`
  - `us-en-nyc-immigration-lawyers`
- batch scripts under `scripts/visibility/`:
  - `run-batch.mjs`
  - `load-segment.mjs`
  - `parse-response.mjs`
  - `score-entities.mjs`
  - `build-reference-range.mjs`
  - `write-evidence-log.mjs`
  - `render-template.mjs`
  - `render-reports.mjs`
- templates under `templates/visibility/`.
- generated sample outputs under `out/visibility/`.
- npm command:
  - `npm run visibility:batch -- --segment <segment_id>`
- planning docs:
  - `docs/visibility/FA_VIS_V1_EXECUTION_PLAN.md`
  - `docs/visibility/FA_VIS_WORK_QUEUE.md`
  - `docs/visibility/FA_VIS_IMPLEMENTATION_TASKS.md`

### 3.2 What exists but is not production-ready

- FA-D1 exists but is too thin for sales/outreach.
- FA-R1 exists but reads like a generic sample, not a paid report.
- FA-P1 exists but is not yet connected to source-backed For-Ai claim logic.
- FA-S1 exists but source/domain distribution is still shallow.
- FA-Q1 exists but sample packs are only six questions, not real thirty-question packs.
- FA-E1 exists as JSONL but not as a human-auditable CSV/checklist.
- Locale labels exist, but form body copy still contains hardcoded English.
- Citation matching mostly checks homepage domains, not platform profile URLs.
- Generated outputs are committed broadly and may create noisy diffs.

### 3.3 What has not started

- Real 60-entity list for `kr-ko-mapo-tax-accountants`.
- Real 30-question pack for `kr-ko-mapo-tax-accountants`.
- Real or semi-manual Perplexity measurement logs.
- Human audit workflow.
- Sales-ready physical DM package.
- QR landing/web version.
- First paid FA-R1 delivery.
- Re-inspection workflow.
- Monthly monitoring workflow.
- Real evidence dataset.

## 4. Standard freeze

Do not change these in the next implementation cycle:

```text
standard: FA-VIS
standard_version: 1.0
```

Question types remain:

```text
recommendation
problem
trigger
```

Metric keys remain:

```text
direct_mention_rate
source_citation_rate
competitor_first_rate
criteria_connection_rate
information_accuracy
```

Form IDs remain:

```text
FA-R1 = Visibility Inspection Report
FA-D1 = Preliminary Visibility Brief
FA-P1 = Structured Entity Profile
FA-S1 = Segment Statistics Report
FA-Q1 = Question Pack Manifest
FA-E1 = Evidence Log
```

This freeze is important because the strategy already expanded from:

```text
tax accountant report → segment engine → global standard
```

The next movement must be data and delivery, not another standard expansion.

## 5. Product ladder that repo output must support

### 5.1 Free / outbound artifact

```text
FA-D1 Preliminary Visibility Brief
```

Purpose:

- one-page printed DM insert,
- QR/web brief,
- response trigger,
- paid FA-R1 upsell.

### 5.2 Paid first product

```text
FA-R1 Visibility Inspection Report
```

Early price strategy from planning:

- launch/test price can be lower to create first payment,
- normal price can rise later,
- do not encode price into hardcoded templates unless configurable.

### 5.3 Follow-up product

```text
re-inspection / monthly tracking
```

This is where the durable dataset starts.

### 5.4 Long-term asset

```text
standardized evidence dataset
```

The moat is not the HTML. The moat is repeated evidence:

- segment,
- entity,
- question,
- answer,
- citation,
- rank,
- source,
- time,
- audit status.

## 6. Fable 5 consultation agenda

Fable 5 should not be asked to create another pretty landing page. Fable 5 should be asked to make the standard forms usable, credible, and sales-ready.

### 6.1 Fable 5 should review these forms

- FA-D1 first.
- FA-R1 second.
- FA-S1 third.
- FA-P1 fourth.
- FA-Q1 fifth.

FA-E1 is primarily an evidence/audit structure, not a marketing screen.

### 6.2 Fable 5 design constraints

- One standard form system, not separate designs per industry.
- One 780px document layout that works in print and mobile.
- White background, deep navy/deep teal, monospace data blocks.
- Inspection-result feel, not SaaS landing page feel.
- No flashy marketing language.
- No ad-agency feeling.
- Must visually separate:
  - observed AI answer behavior,
  - source-backed facts,
  - suggested improvements,
  - disclaimers.
- Must include visible sample/specimen stamp when using mock/sample output.

### 6.3 Fable 5 must answer these questions

1. Is FA-D1 understandable in under 60 seconds?
2. Does FA-D1 make the recipient want the locked FA-R1?
3. Does FA-R1 feel like a paid report rather than a generic generated page?
4. Does the form look like an inspection standard, not a marketing dashboard?
5. Can the same form hold Korean tax-accountant data and English immigration-lawyer data without redesign?
6. Are disclaimers visible but not visually overwhelming?
7. Does the CTA feel commercial but not scammy?
8. Can the print version fit as a one-page physical DM insert?
9. Are low-scoring competitor names safely anonymized?
10. Is evidence traceability visible enough to build trust?

### 6.4 Fable 5 deliverables to request

- FA-D1 one-page wireframe.
- FA-D1 print version.
- FA-D1 mobile/QR version.
- FA-R1 paid-report structure.
- FA-S1 public-statistics structure.
- UI token guide:
  - colors,
  - typography,
  - spacing,
  - data badge styles,
  - status states.
- Copy hierarchy for Korean and English.
- CTA placement and language.
- Disclaimer placement.

## 7. Repo revision plan by priority

## P0 — Make current scaffold usable for first outreach

### P0-1. Upgrade FA-D1 into a sales-ready brief

Files:

- `scripts/visibility/render-template.mjs`
- `scripts/visibility/render-reports.mjs`
- `templates/visibility/fa-d1-brief.html`
- `templates/visibility/base-style.html`

Required FA-D1 sections:

1. Header:
   - For AI Visibility Inspection Brief
   - FORM FA-D1
   - entity name
   - category
   - region
   - inspection date
   - question pack
   - provider
   - specimen ID
2. Score summary:
   - direct mention rate
   - source citation rate
   - competitor first rate
   - criteria connection rate
   - information accuracy status
3. Segment comparison:
   - entity value
   - median
   - top25
   - bottom25
4. Three sample questions.
5. Source-domain snapshot.
6. Interpretation in customer language.
7. Locked FA-R1 section:
   - full question transcripts
   - competitor source analysis
   - evidence excerpts
   - criteria gap analysis
   - improvement priorities
   - re-inspection plan
8. CTA placeholder.
9. Disclaimer.
10. No-public-ranking notice.

Acceptance criteria:

- Korean segment output reads naturally in Korean.
- English segment output reads naturally in English.
- It is printable.
- It can be sent as physical DM or QR brief.
- It makes FA-R1 feel worth requesting.

### P0-2. Move all fixed form body labels into locale dictionaries

Files:

- `scripts/visibility/render-template.mjs`
- `scripts/visibility/render-reports.mjs`

Problem:

Current outputs have Korean metric labels but English body headings such as `One-line problem`, `Three sample questions`, `Top notice`, `Basic entity information`, and similar fixed copy.

Required:

- All body headings and fixed explanatory copy must come from label dictionaries.
- No Korean/English separate templates.
- No industry-specific templates.

Acceptance criteria:

- `kr-ko-*` outputs render Korean body copy.
- `us-en-*` outputs render English body copy.

### P0-3. Add FA-E1 audit CSV

Files:

- `scripts/visibility/write-evidence-log.mjs`
- `scripts/visibility/run-batch.mjs`

New output:

```text
out/visibility/{segment_id}/fa-e1-audit.csv
```

Columns:

```text
segment_id
entity_id
entity_name
question_no
run_no
provider
measured_at
mentioned
matched_alias
first_index
mention_rank
cited
via_domain
matched_source_field
matched_source_url
answer_excerpt
review_status
review_note
```

Rules:

- `answer_excerpt` should be short enough for spreadsheet review.
- `review_status` and `review_note` are blank placeholders.
- No FA-D1 is considered sendable until this audit file is reviewed.

### P0-4. Expand citation matching beyond homepage

File:

- `scripts/visibility/parse-response.mjs`

Current issue:

Citation matching checks homepage domain only. That misses platform citations.

Required matching fields:

- `homepage`
- `primary_platform_url`
- `secondary_platform_url`

Output fields:

- `cited`
- `via_domain`
- `matched_source_field`
- `matched_source_url`

Acceptance criteria:

- Platform profile citation can count.
- Existing mock segments still pass.
- Source matching remains explainable in FA-E1.

### P0-5. Make disclaimers unavoidable

Files:

- all form render paths.

Every form must include:

```text
For AI does not guarantee AI answer visibility.
This result reflects observations under the stated date, question pack, and measurement provider.
AI answers may vary by time, model, account, location, and source conditions.
This is not a public ranking; low-scoring entities are not publicly named.
```

Korean equivalent must be natural and visible.

### P0-6. Keep forbidden phrase guard

File:

- `scripts/visibility/run-batch.mjs`

Keep scanning generated artifacts for guarantee phrases.

Forbidden concepts:

- guaranteed ranking,
- guaranteed AI visibility,
- 상위노출 보장,
- 1위 보장,
- 추천 보장,
- 전수 측정 when the measurement is not truly exhaustive.

## P1 — Make outputs credible enough for a real segment

### P1-1. Improve FA-R1 paid report structure

Files:

- `scripts/visibility/render-reports.mjs`
- `templates/visibility/fa-r1-report.html`
- `templates/visibility/base-style.html`

Required FA-R1 sections:

1. Header and specimen metadata.
2. Summary metrics.
3. Question-type breakdown.
4. Question-level result table.
5. Cited source domains.
6. Evidence notice.
7. Interpretation.
8. Criteria gap analysis.
9. Improvement priorities:
   - immediately verifiable,
   - 2–6 week observation,
   - long-term observation.
10. Re-inspection date.
11. Disclaimer.

### P1-2. Improve FA-P1 without pretending it is verified

Files:

- `scripts/visibility/render-reports.mjs`
- `templates/visibility/fa-p1-profile.html`

Required:

- State clearly that FA-P1 is a structured entity profile sample unless connected to source-backed claims.
- Separate AI-readable summary from verified claim status.
- Include `needs verification` / `확인 필요` where appropriate.
- Do not turn `documents.data` style convenience into factual truth.

### P1-3. Improve FA-S1 public statistics report

Files:

- `scripts/visibility/render-reports.mjs`
- `templates/visibility/fa-s1-segment-stats.html`

Required:

- Segment title.
- Sample size.
- Question pack version.
- Median/top25/bottom25.
- Source-domain distribution.
- No public ranking notice.
- Disclaimer.

Rules:

- Public version must not name low-scoring entities.
- Do not use `전수` unless truly exhaustive.

### P1-4. Improve FA-Q1 question-pack manifest

Files:

- `scripts/visibility/render-reports.mjs`
- `templates/visibility/fa-q1-question-pack.html`

Required:

- Segment metadata.
- Question type explanation.
- Question list.
- Repetition count.
- Measurement provider.
- Version history.
- Sample/full pack size.

### P1-5. Add segment readiness validation

File:

- `scripts/visibility/load-segment.mjs`

Validate:

- segment required fields,
- `question_pack_size.sample`,
- `question_pack_size.full`,
- entity required columns,
- every question has `no`, `type`, `text`,
- every fixed question type appears at least once,
- metrics are exactly the v1 metric keys.

### P1-6. Decide generated output policy

Current issue:

`out/visibility/` contains many generated files. This is okay for initial review but noisy long-term.

Recommended policy:

- Keep one sample segment output committed for review.
- Regenerate all other outputs locally.
- Or move generated samples to `out/visibility/_samples/`.

Do not let generated HTML dominate every PR.

## P2 — Prepare first real measurement segment

### P2-1. Prepare private entity list

Target:

```text
kr-ko-mapo-tax-accountants
```

Data should be prepared privately, not committed if it contains sensitive or unverified personal data.

Need 60 public business entities with:

```text
id
name
representative
address
postal_code
homepage
primary_platform_url
secondary_platform_url
aliases
grade
```

Rules:

- Use public business info only.
- Avoid private phone numbers.
- Avoid raw IP collection.
- Do not commit private outreach data.

### P2-2. Build real 30-question pack

Target structure:

```text
10 recommendation questions
10 problem questions
10 trigger questions
```

Question examples should reflect real purchase/search intent:

- tax accountant recommendation,
- bookkeeping,
- freelancer income tax,
- corporate conversion,
- inheritance/gift/capital gains tax,
- tax audit response,
- location-specific questions.

Keep question type fixed to one of:

```text
recommendation
problem
trigger
```

### P2-3. Decide first measurement mode

Do not connect live API yet unless forms/audit are ready.

Acceptable first modes:

1. manual Perplexity collection,
2. semi-manual copy into FA-E1 JSONL,
3. later API connection.

First goal is not automation. First goal is a reviewed evidence dataset.

### P2-4. Run first real measurement

Every response record must have:

```text
standard
form
segment_id
question_no
run_no
provider
measured_at
prompt
answer_text
cited_domains
raw_response
```

No FA-D1 should be sent before audit.

## P3 — First revenue loop

### P3-1. Generate FA-D1 briefs

After audit, generate one FA-D1 per entity.

Use:

- physical DM,
- QR link,
- compliant direct channel.

Avoid unsolicited mass SMS/email as first contact.

### P3-2. Track outreach

Track outside git:

```text
entity_id
sent_date
channel
qr_visit
reply
call
FA-R1_request
payment
objection
follow_up_date
```

### P3-3. Deliver first paid FA-R1

FA-R1 can be manually refined if needed. Do not wait for perfect automation.

### P3-4. Schedule re-inspection

Re-inspection matters because the durable dataset is time-series evidence.

## P4 — Only after paid signal

Do not start these until at least one paid FA-R1 or multiple qualified requests:

- Perplexity API integration.
- Supabase persistence.
- PDF generation.
- Login.
- Payment flow.
- Admin dashboard.
- Monthly monitoring page.
- Public segment index.
- Agency/partner packaging.
- Additional countries/languages/entity types.

## 8. Fable 5 handoff checklist

Before coding FA-D1/FA-R1 polish, show Fable 5 this checklist.

Ask Fable 5 to decide:

1. FA-D1 information hierarchy.
2. FA-D1 print layout.
3. FA-D1 mobile QR layout.
4. FA-R1 paid-report page structure.
5. CTA wording in Korean and English.
6. Disclaimer placement.
7. Status colors and visual states.
8. How to show `sample`, `needs review`, `verified`, and `not assessed`.
9. How to show reference ranges without implying public ranking.
10. How to make the same form work for tax accountants, clinics, wedding venues, and immigration lawyers.

Fable 5 should not change:

- metric names,
- question types,
- form IDs,
- standard version,
- segment config structure.

Fable 5 should produce design guidance that maps to these repo files:

```text
templates/visibility/base-style.html
templates/visibility/fa-d1-brief.html
templates/visibility/fa-r1-report.html
templates/visibility/fa-p1-profile.html
templates/visibility/fa-s1-segment-stats.html
templates/visibility/fa-q1-question-pack.html
scripts/visibility/render-template.mjs
scripts/visibility/render-reports.mjs
```

## 9. Codex implementation checklist after Fable 5

After Fable 5 alignment, implement in this order:

1. Expand label dictionaries.
2. Refactor body copy to use labels.
3. Upgrade FA-D1.
4. Add audit CSV.
5. Expand citation matching.
6. Upgrade FA-R1.
7. Regenerate sample outputs.
8. Run all batch commands.
9. Run forbidden phrase scan.
10. Run tests.

## 10. Required commands before merging implementation

```bash
npm run visibility:batch -- --segment kr-ko-seoul-wedding-venues
npm run visibility:batch -- --segment kr-ko-mapo-clinics
npm run visibility:batch -- --segment kr-ko-mapo-tax-accountants
npm run visibility:batch -- --segment us-en-nyc-immigration-lawyers
rg -n "상위노출 보장|1위 보장|추천 보장|전수 측정|guaranteed ranking|guaranteed AI visibility" data/visibility templates/visibility out/visibility scripts/visibility package.json || true
npm test
```

The forbidden phrase scan may find the guard list itself in `run-batch.mjs`; that is acceptable if no generated output/data/template contains the phrases.

## 11. Merge gate

Do not merge the next implementation PR unless:

- all four sample batches pass,
- FA-D1 is usable as a sales brief,
- Korean FA-D1 body copy is Korean,
- English FA-D1 body copy is English,
- FA-E1 audit CSV exists,
- platform URL citation matching works,
- FA-R1 has paid-report sections,
- disclaimers are visible,
- no low-scoring entity names are exposed publicly,
- For-Ai core claim registry pages are untouched.

## 12. Definition of first real readiness

FA-VIS is ready for first real outreach only when:

- `kr-ko-mapo-tax-accountants` has a real 30-question pack,
- a private 60-entity list exists,
- measurement logs exist,
- audit CSV has been reviewed,
- FA-D1 briefs are generated,
- DM/QR package is ready,
- paid FA-R1 CTA is clear,
- legal/advertising disclaimers are visible,
- response tracking sheet exists.

## 13. Final instruction

The next repo work should not create a bigger vision. The vision is big enough.

The next repo work should create:

```text
one credible FA-D1
one auditable FA-E1
one improved FA-R1
one first real segment path
```

Everything else waits.
