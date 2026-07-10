# FA-VIS v1 Execution Plan

## 0. Current decision

For-Ai should keep the main product identity as a global claim-level fact registry, while the visibility work becomes a separated inspection standard layer named **FA-VIS v1**.

FA-VIS v1 means **For AI Visibility Inspection Standard v1**: a standard for measuring how entities are found, mentioned, cited, and compared in AI answers.

The immediate goal is not to ship a polished SaaS. The immediate goal is to turn the existing mock batch engine and Fable-designed forms into a credible, repeatable inspection workflow that can be used for one real outbound campaign.

## 1. Inputs considered

This plan is based on:

- The existing For-Ai repository state.
- The committed FA-VIS mock batch tooling under `scripts/visibility/`.
- The segment fixtures under `data/visibility/segments/`.
- The generated sample outputs under `out/visibility/`.
- The Fable/Claude output artifacts named by the user:
  - `fa-r1-report.html`
  - `fa-d1-brief.html`
  - `fa-p1-profile.html`
  - `fa-s1-segment-stats.html`
  - `fa-q1-question-pack.html`
  - `fa-vis-v1-design-principles.md`
  - `fa-p1-profile.zip`

The local Windows paths for those artifacts are outside this container, so this repo plan treats them as design references to be imported or manually compared in the next implementation pass.

## 2. What is already useful

The current FA-VIS commit established the right strategic direction:

1. It separates visibility tooling from the core For-Ai registry.
2. It uses segment config instead of hardcoding one industry.
3. It supports Korean and English sample segments.
4. It defines fixed form IDs: FA-R1, FA-D1, FA-P1, FA-S1, FA-Q1, FA-E1.
5. It stores evidence logs and entity scores as generated artifacts.
6. It prevents obvious forbidden guarantee phrases in generated outputs.

These choices should stay.

## 3. What must be corrected before real use

The current implementation is still a mock scaffold. Before it is used for real outreach, it needs these corrections.

### 3.1 Do not treat generated output as source truth

`out/visibility/` is useful for review, but it should not become the canonical asset. The source of truth should be:

- `segment.json`
- `entities.csv`
- `question-pack-v1.json`
- `mock-responses.jsonl` or future provider response logs
- FA-VIS scripts
- templates

Generated HTML, CSV, and JSONL output should be reproducible from source inputs. If examples remain committed, they should be clearly labeled as sample artifacts.

### 3.2 Import Fable form quality into repo templates

The current template system is structurally correct, but the actual forms are too generic. The next implementation pass should compare the repository templates against the Fable artifacts and upgrade them in this order:

1. `FA-D1` first, because it is the outbound/free brief and sales conversion tool.
2. `FA-R1` second, because it is the paid inspection report.
3. `FA-S1` third, because it powers public segment statistics.
4. `FA-P1` fourth, because it becomes the structured entity profile.
5. `FA-Q1` fifth, because it documents the question-pack manifest.

### 3.3 Make FA-D1 the first sales artifact

The first real-world deliverable should not be a full dashboard. It should be an FA-D1 preliminary visibility brief that can be printed, mailed, or opened from a QR landing page.

FA-D1 must answer these questions in one page:

- What entity was inspected?
- What segment was used?
- What was the measurement date?
- How many questions were measured?
- How often did this entity appear?
- How does that compare with the segment reference range?
- What source domains appeared?
- What is locked behind FA-R1?
- How does the customer request the detailed report?

### 3.4 Keep claims separate from visibility observations

FA-VIS observations are not verified factual claims. They are inspection observations under a stated measurement setup.

Every form should distinguish:

- `claim`: source-backed fact in the For-Ai registry.
- `visibility observation`: AI answer behavior observed under a measurement date, question pack, provider, and segment.
- `recommendation`: suggested improvement, not a guarantee.

This protects For-Ai's claim-level truth model.

### 3.5 Make the disclaimers unavoidable

Every generated form must state:

- For AI does not guarantee AI answer visibility.
- Results are based on the stated date, question pack, and measurement provider.
- AI answers may vary by model, time, account, location, and source conditions.
- This is not a public ranking and low-scoring entities should not be publicly named.

## 4. Execution sequence

### Phase 1 — Design alignment

Goal: make the repo output match the Fable standard forms closely enough to use in a customer-facing workflow.

Tasks:

1. Bring the Fable HTML and design-principles artifacts into a local comparison folder, or paste their relevant structure into an implementation note.
2. Compare each Fable form against the current repo template output.
3. Record differences in a checklist:
   - missing sections
   - weak labels
   - weak visual hierarchy
   - missing disclaimer placement
   - missing CTA
   - missing specimen/reference metadata
4. Upgrade templates without making industry-specific templates.

Exit criteria:

- One shared template system still serves all locales and segments.
- Korean and English output differ by labels and config only.
- FA-D1 is good enough to send as a sample brief.

### Phase 2 — Sales-ready FA-D1

Goal: make one real sample brief for `kr-ko-mapo-tax-accountants`.

Tasks:

1. Expand `kr-ko-mapo-tax-accountants` from 3 sample entities to at least 10 mock-safe entities for layout testing.
2. Add stronger FA-D1 sections:
   - entity snapshot
   - score summary
   - segment comparison
   - three sample questions
   - source-domain snapshot
   - locked FA-R1 section
   - CTA
   - disclaimer
3. Add an optional print-friendly mode through CSS.
4. Make the form readable at 780px and on mobile.

Exit criteria:

- The brief can be printed or opened by QR.
- It does not look like a generic SaaS landing page.
- It looks like an inspection result sheet.

### Phase 3 — Real batch preparation

Goal: prepare the system for a real, low-cost local batch without connecting paid APIs in this PR.

Tasks:

1. Add a real-data placeholder segment folder for the first outbound market, but do not commit private or unverified personal data.
2. Document the required CSV columns for real use.
3. Document how to replace `mock-responses.jsonl` with provider response logs later.
4. Add validation for required fields:
   - entity id
   - canonical name
   - aliases
   - homepage or primary platform URL
   - segment metadata
   - question type distribution

Exit criteria:

- A non-developer can prepare a segment folder from a spreadsheet.
- The batch script fails clearly when required inputs are missing.

### Phase 4 — Evidence and audit hardening

Goal: make false positives and false negatives easier to catch before outreach.

Tasks:

1. Add an audit output file per segment.
2. Include for each entity/question/run:
   - mentioned true/false
   - cited true/false
   - matched alias
   - first index
   - mention rank
   - cited domain
   - answer excerpt
   - review status placeholder
3. Add a human review checklist to FA-E1 or a companion CSV.
4. Keep raw response text available for audit.

Exit criteria:

- No sales brief should be sent before audit review.
- Alias misses are easy to spot.

### Phase 5 — Operating plan for the first paid test

Goal: connect the standard to a real revenue attempt without overbuilding.

Tasks:

1. Choose one segment for first outreach, likely `kr-ko-mapo-tax-accountants`.
2. Prepare a small real entity list from public business information.
3. Run a first measurement batch.
4. Review false positives manually.
5. Generate FA-D1 briefs.
6. Send physical mail or a direct non-spam channel, not mass unsolicited email/SMS.
7. Offer FA-R1 detailed report as a paid follow-up.

Exit criteria:

- One real outreach batch is sent.
- Response, payment, and objections are recorded.

## 5. What to avoid

Do not do these yet:

- Do not add login.
- Do not add payment.
- Do not add Supabase persistence for visibility data.
- Do not add Perplexity API connection before mock forms are accepted.
- Do not add PDF generation until HTML forms are stable.
- Do not create tax-accountant-specific templates.
- Do not create Korean-only templates.
- Do not market FA-VIS as guaranteed ranking or guaranteed visibility.
- Do not publish low-scoring entity names.

## 6. Recommended next PR

The next PR should be narrow:

**Title:** Upgrade FA-VIS forms toward sales-ready standard briefs

Scope:

1. Add a design/reference note derived from the Fable artifacts.
2. Upgrade FA-D1 and FA-R1 template content quality.
3. Add audit-friendly evidence excerpts.
4. Add stronger locale label coverage.
5. Add tests or script checks for required FA-VIS sections and forbidden phrases.

Do not connect live providers in that PR.

## 7. Definition of done for the next PR

A next PR is acceptable only if:

- `npm run visibility:batch -- --segment kr-ko-mapo-tax-accountants` succeeds.
- `npm run visibility:batch -- --segment us-en-nyc-immigration-lawyers` succeeds.
- FA-D1 includes a clear CTA and locked FA-R1 section.
- FA-R1 includes summary metrics, question-type breakdown, cited domains, interpretation, improvement priorities, evidence notice, disclaimer, and re-inspection date.
- FA-S1 includes a no-public-ranking notice.
- FA-P1 states that profile facts need source-backed verification.
- FA-Q1 preserves standard question types.
- Generated outputs contain no banned guarantee phrases.
- Existing For-Ai public pages and claim registry behavior are not changed.

## 8. Practical first-market plan

Even though FA-VIS is global by design, the first market should remain local and narrow.

Recommended first market:

```text
segment_id: kr-ko-mapo-tax-accountants
entity_type: business
category: tax_accountant
language: ko
provider: mock first, then one measured provider
first deliverable: FA-D1 preliminary brief
paid follow-up: FA-R1 detailed visibility inspection report
```

The global standard matters because it prevents rebuilding the workflow for every industry. The first sale still comes from one segment, one entity list, one question pack, and one brief.
