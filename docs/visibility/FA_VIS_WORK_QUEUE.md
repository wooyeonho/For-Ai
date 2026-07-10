# FA-VIS v1 Work Queue

## 0. Purpose

This document converts the current FA-VIS v1 state into an execution queue. It includes work that is already complete, work that exists but is not production-ready, and work that has not started yet.

The core rule is: **do not expand the standard again until one real segment produces a reviewed FA-D1 brief and at least one paid FA-R1 opportunity.**

## 1. Current state summary

### Done

- FA-VIS v1 has a runnable mock batch command: `npm run visibility:batch -- --segment <segment_id>`.
- Segment packages exist under `data/visibility/segments/`.
- Mock outputs are generated under `out/visibility/<segment_id>/`.
- The current implementation writes:
  - `entity-scores.csv`
  - `fa-e1-evidence-log.jsonl`
  - FA-R1 reports
  - FA-D1 briefs
  - FA-P1 profiles
  - FA-S1 segment stats
  - FA-Q1 question pack manifest
- FA-VIS is intentionally separated from the core For-Ai claim registry.

### Partially done

- Locale labels exist for Korean and English, but report body copy still contains hardcoded English section labels.
- FA-D1 exists, but it is too thin to use as a mailed or QR-based sales brief.
- FA-R1 exists, but it reads like a generic inspection sample rather than a paid detailed report.
- FA-E1 evidence exists, but it is JSONL-first and not convenient for human audit.
- Source citation matching exists, but it only checks the entity homepage domain.
- Reference ranges exist, but sample size is too small for real interpretation.

### Not started

- Real entity list for the first market.
- Real 30-question pack for one segment.
- Real provider measurement.
- Manual audit workflow.
- Print-ready/DM-ready FA-D1.
- First paid FA-R1 report.
- Response and payment tracking.
- Any real evidence dataset.

## 2. Non-negotiable freeze

Do not change these in the next iteration:

- Standard name: `FA-VIS`
- Version: `1.0`
- Question types:
  - `recommendation`
  - `problem`
  - `trigger`
- Metric keys:
  - `direct_mention_rate`
  - `source_citation_rate`
  - `competitor_first_rate`
  - `criteria_connection_rate`
  - `information_accuracy`
- Form IDs:
  - `FA-R1`
  - `FA-D1`
  - `FA-P1`
  - `FA-S1`
  - `FA-Q1`
  - `FA-E1`

Changing these before real measurement starts is scope creep.

## 3. P0 work — unblock first real outreach

### P0-1. Upgrade FA-D1 into a sales-ready brief

**Why:** FA-D1 is the first customer-facing artifact. The current FA-D1 exists but is too thin to send.

**Required changes:**

- Add entity snapshot.
- Add inspection metadata.
- Add score summary.
- Add segment reference comparison.
- Add source-domain snapshot.
- Add three sample questions.
- Add interpretation written in customer language.
- Add locked FA-R1 section.
- Add CTA.
- Add disclaimer.
- Add print-friendly CSS.

**Acceptance criteria:**

- A non-technical business owner can understand it in under 60 seconds.
- It can be printed or opened from a QR link.
- It does not promise visibility, ranking, leads, or revenue.
- It makes FA-R1 feel worth requesting.

### P0-2. Remove hardcoded English body labels

**Why:** Korean segments currently use Korean metric labels, but many body sections still render in English.

**Required changes:**

- Move all form section titles and fixed explanatory copy into the locale label dictionary.
- Cover FA-D1, FA-R1, FA-P1, FA-S1, and FA-Q1 body labels.
- Keep one template system; do not create separate Korean/English templates.

**Acceptance criteria:**

- Korean segments render Korean form body labels.
- English segments render English form body labels.
- No industry-specific templates are added.

### P0-3. Add human-audit output

**Why:** JSONL evidence is useful for machines, but the first sales batch requires human review before sending any brief.

**Required output:**

`out/visibility/<segment_id>/fa-e1-audit.csv`

**Columns:**

- `segment_id`
- `entity_id`
- `entity_name`
- `question_no`
- `run_no`
- `provider`
- `measured_at`
- `mentioned`
- `matched_alias`
- `first_index`
- `mention_rank`
- `cited`
- `via_domain`
- `answer_excerpt`
- `review_status`
- `review_note`

**Acceptance criteria:**

- A human can review false positives and false negatives row by row.
- Every generated FA-D1 can be traced back to auditable rows.

### P0-4. Expand source citation matching beyond homepage

**Why:** AI answers may cite platform profiles instead of official homepages.

**Required changes:**

- Match domains from:
  - `homepage`
  - `primary_platform_url`
  - `secondary_platform_url`
- Add a matched source field that explains which entity URL was matched.
- Preserve `via_domain`.

**Acceptance criteria:**

- Citation detection works for official site and platform profile URLs.
- Existing mock segments still pass.

### P0-5. Keep generated output policy explicit

**Why:** `out/visibility/` is useful for review, but it should not become canonical source truth.

**Required decision:**

Choose one of these before the next large output change:

1. Keep only one sample output segment committed.
2. Move generated outputs to a `_samples` folder.
3. Gitignore all generated outputs and rely on batch regeneration.

**Recommendation:**

Keep one sample output segment for review and regenerate the rest locally.

## 4. P1 work — prepare first real segment

### P1-1. Create the real first segment package privately

**First target:** `kr-ko-mapo-tax-accountants`

**Do not commit private or unverified personal data.** Use a private working spreadsheet or ignored data folder for real outreach inputs.

**Required fields:**

- `id`
- `name`
- `representative`
- `address`
- `postal_code`
- `homepage`
- `primary_platform_url`
- `secondary_platform_url`
- `aliases`
- `grade`

**Acceptance criteria:**

- 60 public business entities are prepared.
- Alias coverage is good enough for first measurement.
- Private phone numbers or non-public personal data are not committed.

### P1-2. Build the real 30-question pack

**Target structure:**

- 10 recommendation questions
- 10 problem questions
- 10 trigger questions

**Acceptance criteria:**

- Questions match real purchase/search intent.
- Each question has one of the three fixed FA-VIS question types.
- Question pack version remains `v1` until after the first real batch.

### P1-3. Decide measurement mode for first batch

Options:

1. Manual Perplexity collection.
2. Semi-manual response export into JSONL.
3. Live provider API later.

**Recommendation:**

Use manual or semi-manual measurement first. Do not connect paid APIs until FA-D1 and FA-E1 audit outputs are accepted.

### P1-4. Run the first real measurement

**Acceptance criteria:**

- Every response has:
  - prompt
  - answer text
  - cited domains where available
  - measured_at
  - provider
  - run_no
- Raw answers are stored.
- No FA-D1 is sent before audit.

### P1-5. Generate and audit FA-D1 briefs

**Acceptance criteria:**

- Every entity brief has a corresponding audit trail.
- False positives and obvious false negatives are corrected before sending.
- The result does not name low-scoring competitors publicly.

## 5. P2 work — first revenue loop

### P2-1. Create a physical DM package

Package contents:

- One-page FA-D1 brief.
- QR link to the web version.
- Short explanation of FA-R1.
- Clear disclaimer.
- Clear paid CTA.

### P2-2. Track response data

Track:

- entity id
- sent date
- opened/visited if known
- QR visit if available
- reply
- call
- FA-R1 request
- payment
- objection
- follow-up date

### P2-3. Deliver first FA-R1

FA-R1 should include:

- full question-level results
- evidence excerpts
- source-domain analysis
- criteria gap analysis
- practical improvement priorities
- re-inspection date
- disclaimers

### P2-4. Re-inspection

Re-inspection should happen only after:

- FA-R1 was delivered, or
- profile/source improvements were actually made.

## 6. P3 work — after first paid signal

Only start this after at least one paid FA-R1 or multiple qualified requests.

- Live Perplexity integration.
- PDF generation.
- Supabase persistence.
- Basic customer-facing landing page.
- Monthly monitoring report.
- Segment statistics content.
- Partner/agency packaging.

## 7. Work that should not start yet

Do not start these now:

- FA-VIS v2.
- More countries.
- More languages.
- More entity types.
- Admin dashboard.
- Login.
- Payment flow.
- API product.
- Public leaderboard.
- Public ranking of low-scoring entities.
- Medical segment outreach before legal/advertising review.

## 8. Next implementation PR checklist

The next code PR should include:

- Sales-ready FA-D1.
- Improved FA-R1.
- Locale-complete labels for form bodies.
- FA-E1 audit CSV.
- Platform URL citation matching.
- Regenerated output for all sample segments or one agreed sample policy.
- Batch success for all four current sample segments.
- Forbidden-phrase check.

## 9. Definition of readiness for real outreach

FA-VIS is ready for first outreach only when:

- `kr-ko-mapo-tax-accountants` has a 30-question pack.
- A real or semi-real entity list exists outside committed source control.
- Measurement responses are collected.
- FA-E1 audit has been reviewed.
- FA-D1 briefs are generated.
- FA-D1 copy is understandable in Korean.
- The brief has a clear FA-R1 paid CTA.
- The disclaimer is visible.
- No low-scoring competitors are publicly named.

## 10. Immediate instruction to the next coding agent

Do not rebuild the engine. Improve the current one.

Start with:

1. `scripts/visibility/render-template.mjs`
2. `scripts/visibility/render-reports.mjs`
3. `scripts/visibility/parse-response.mjs`
4. `scripts/visibility/write-evidence-log.mjs`
5. `templates/visibility/base-style.html`

The goal is not more features. The goal is one credible FA-D1 brief and one auditable FA-E1 trail.
