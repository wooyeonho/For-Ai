# FA-VIS Implementation Tasks

## 0. Scope lock

The FA-VIS standard is frozen for this implementation cycle. Do not add a new standard version, new metrics, new question types, new form IDs, new countries, or new entity categories until one real segment has been measured and reviewed.

The next work is implementation hardening, not strategy expansion.

## 1. Task order

### Task 1 — Make FA-D1 sales-ready

**Priority:** P0

**Files to touch:**

- `scripts/visibility/render-template.mjs`
- `scripts/visibility/render-reports.mjs`
- `templates/visibility/fa-d1-brief.html`
- `templates/visibility/base-style.html`

**Requirements:**

- Add a customer-readable entity snapshot.
- Add measurement metadata: segment, question pack, provider, inspection date, specimen ID.
- Add a summary score panel.
- Add segment comparison against median/top25/bottom25 where available.
- Add a source-domain snapshot.
- Add three sample questions.
- Add a locked FA-R1 section.
- Add a paid CTA placeholder.
- Add disclaimer block above the fold or directly before CTA.
- Add print-friendly CSS.

**Done when:**

- A Korean tax-accountant FA-D1 can be understood in under one minute.
- It is usable as a one-page physical DM insert or QR landing page.
- It does not contain guarantee language.

### Task 2 — Move all fixed form body labels into locale dictionaries

**Priority:** P0

**Files to touch:**

- `scripts/visibility/render-template.mjs`
- `scripts/visibility/render-reports.mjs`

**Requirements:**

- No fixed English section labels in Korean output.
- Add dictionary keys for all body section headings and fixed explanatory copy.
- Keep one renderer and one template set.
- Do not create separate Korean or English templates.

**Done when:**

- `kr-ko-*` outputs have Korean body section labels.
- `us-en-*` outputs have English body section labels.

### Task 3 — Add FA-E1 audit CSV

**Priority:** P0

**Files to touch:**

- `scripts/visibility/write-evidence-log.mjs`
- `scripts/visibility/run-batch.mjs`

**New output:**

- `out/visibility/<segment_id>/fa-e1-audit.csv`

**Required columns:**

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

**Done when:**

- A human can review each entity/question/run row without reading raw JSONL.
- `review_status` and `review_note` are present as empty placeholders.

### Task 4 — Match citation domains against platform URLs

**Priority:** P0

**Files to touch:**

- `scripts/visibility/parse-response.mjs`

**Requirements:**

- Citation matching should inspect domains from:
  - `homepage`
  - `primary_platform_url`
  - `secondary_platform_url`
- Output should preserve:
  - `cited`
  - `via_domain`
  - `matched_source_field`
  - `matched_source_url`

**Done when:**

- Existing sample segments still run.
- Platform profile citations can count when they match entity platform URLs.

### Task 5 — Improve FA-R1 paid report content

**Priority:** P1

**Files to touch:**

- `scripts/visibility/render-reports.mjs`
- `templates/visibility/fa-r1-report.html`

**Requirements:**

- Add full question-type breakdown.
- Add evidence notice.
- Add source-domain interpretation.
- Add criteria gap analysis.
- Add improvement priorities in three horizons:
  - immediately verifiable
  - 2–6 week observation
  - long-term observation
- Add re-inspection date.

**Done when:**

- FA-R1 reads like a paid detailed report preview, not a generic sample sheet.

### Task 6 — Decide generated output policy

**Priority:** P1

**Files to touch:**

- `.gitignore` if generated outputs are removed from source control.
- `docs/visibility/FA_VIS_WORK_QUEUE.md` if policy is documented.

**Recommended policy:**

- Keep one sample segment output for review.
- Regenerate all other outputs locally.

**Done when:**

- PR diffs are not dominated by regenerated HTML for every segment unless intentionally reviewed.

### Task 7 — Add validation for real segment readiness

**Priority:** P1

**Files to touch:**

- `scripts/visibility/load-segment.mjs`

**Requirements:**

- Validate entity required columns.
- Validate every question has `no`, `type`, and `text`.
- Validate question type distribution exists across the fixed three types.
- Validate segment `question_pack_size.sample` and `question_pack_size.full` exist.
- Warn or fail clearly when a segment is not outreach-ready.

**Done when:**

- Bad segment input fails with a helpful message.

### Task 8 — Prepare private first-market inputs

**Priority:** P1

**Files to touch:**

- Do not commit private real data.
- Use ignored local files or a private spreadsheet.

**Target segment:**

- `kr-ko-mapo-tax-accountants`

**Requirements:**

- 60 public business entities.
- 30-question pack.
- Alias candidates.
- Public homepage/platform URLs where available.

**Done when:**

- A real measurement batch can be prepared without adding private data to git.

### Task 9 — First measurement run

**Priority:** P2

**Requirements:**

- Use manual or semi-manual provider collection first.
- Store response logs in the FA-E1-compatible JSONL shape.
- Run batch.
- Review audit CSV.
- Generate FA-D1 briefs only after audit.

**Done when:**

- At least one real segment has reviewed evidence and generated briefs.

### Task 10 — First revenue loop

**Priority:** P2

**Requirements:**

- Send FA-D1 through physical DM or a compliant direct channel.
- Track sent date, response, QR visit if available, FA-R1 request, objections, and payment.
- Deliver first paid FA-R1 manually if needed.

**Done when:**

- At least one paid FA-R1 opportunity is created or rejected with a recorded reason.

## 2. Commands required after implementation tasks

Run these before merging any code implementation:

```bash
npm run visibility:batch -- --segment kr-ko-seoul-wedding-venues
npm run visibility:batch -- --segment kr-ko-mapo-clinics
npm run visibility:batch -- --segment kr-ko-mapo-tax-accountants
npm run visibility:batch -- --segment us-en-nyc-immigration-lawyers
rg -n "상위노출 보장|1위 보장|추천 보장|전수 측정|guaranteed ranking|guaranteed AI visibility" data/visibility templates/visibility out/visibility scripts/visibility package.json || true
npm test
```

## 3. Merge gate

Do not merge an implementation PR unless:

- All four sample segment batches pass.
- FA-D1 has Korean and English body labels.
- FA-E1 audit CSV is generated.
- Platform URL citation matching works.
- Generated outputs contain no banned guarantee phrase except inside the guard list.
- Existing For-Ai claim registry behavior is untouched.
