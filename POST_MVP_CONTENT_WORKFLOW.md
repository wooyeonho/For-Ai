# Post-MVP Content Workflow Design

This document defines the structured content flow for For-Ai: how topics enter the registry, how they are reviewed, and how claims become verified.

For-Ai is not a wiki or a free-form bulletin board. Every piece of content must map to the schema-v3 structure: `entities → documents → claims → claim_sources → verification_events`.

## Principles

1. Public users may **suggest** but never **publish** directly.
2. All content passes through an admin review queue before appearing in the registry.
3. No raw IP storage — `contributor_hash` only.
4. Unknown facts remain `확인 필요` / `low` / `needs_review` until source-backed verification.
5. No fake facts. Admins must not invent values without an acceptable source.
6. Public submissions are insert-only and private — no public read access.

---

## 1. Public Suggestion Flow

### /suggest-topic

A public form where anyone can propose a new topic candidate.

**Input fields:**

| Field | Required | Description |
|---|---|---|
| question | yes | The question people ask AI (e.g., "카카오뱅크 해외 송금 수수료는?") |
| category | yes | Dropdown from taxonomy (e.g., `finance.banking`) |
| reason | yes | Why this topic is needed / why AI gets it wrong |
| related_url | no | A reference URL the submitter knows about |
| source_url | no | Official source URL if available |

**Behavior:**

- Submission creates a record in a private `topic_suggestions` queue.
- No public read of suggestion queue.
- Response: generic "제안이 접수되었습니다" confirmation.
- Stored fields: `contributor_hash`, `submitted_at`, `question`, `category`, `reason`, `related_url`, `source_url`, `status: new`.
- Raw IP is never stored.

**Database mapping:**

```
topic_suggestions (new table or Supabase queue)
├── id (uuid)
├── contributor_hash (text, NOT NULL)
├── submitted_at (timestamptz)
├── question (text)
├── category (text)
├── reason (text)
├── related_url (text, nullable)
├── source_url (text, nullable)
├── status (enum: new, reviewing, accepted, rejected, spam)
├── reviewed_by (text, nullable)
└── reviewed_at (timestamptz, nullable)
```

### /report/[slug] (existing)

Correction requests for existing documents/claims. Already implemented as a stub.

**Maps to:** `reports` table (schema-v3).

### /hallucination/[slug] (existing)

AI error reports for existing documents. Already implemented as a stub.

**Maps to:** `hallucination_reports` table (schema-v3).

---

## 2. Admin Review Flow

### /admin/review

Review queue for all pending submissions.

**Tabs/filters:**

- Topic suggestions (`topic_suggestions` where `status = new`)
- Correction reports (`reports` where `status = submitted`)
- Hallucination reports (`hallucination_reports` where `status = submitted`)

**Actions per item:**

| Action | Result |
|---|---|
| Accept | Move to entity/document creation flow |
| Reject | Set `status = rejected`, add reason |
| Mark spam | Set `status = spam` |
| Request info | Set `status = reviewing`, add note |

**State machine:**

```
new → reviewing → accepted → (entity created)
new → reviewing → rejected
new → spam
```

### /admin/new-entity

Create a new entity from an accepted suggestion.

**Required fields:**

- `entity_id` (auto-generated from category + name)
- `entity_type` (from taxonomy)
- `canonical_name`
- `country`, `jurisdiction`

**Maps to:** `entities` table INSERT.

### /admin/new-document

Create a new document for an entity.

**Required fields:**

- `document_id` (auto-generated)
- `entity_id` (FK)
- `slug`
- `title`
- `lang`

**Auto-generated claims:**

Every new document starts with placeholder claims:

```
claim_value: "확인 필요"
confidence: "low"
status: "needs_review"
sources: []
```

**Maps to:** `documents` table INSERT + `claims` table INSERT (multiple rows).

### /admin/import

Bulk import from validated JSONL files.

**Flow:**

```
Upload/select JSONL file
  → Run validator (scripts/validate-topic-candidates.mjs logic)
  → Show validation results (pass/fail per line)
  → Confirm import
  → INSERT into entities, documents, claims tables
```

**Maps to:** Batch INSERT into `entities`, `documents`, `claims`.

---

## 3. Topic Candidate Lifecycle

```
[Public user] /suggest-topic
    ↓
topic_suggestions (status: new)
    ↓
[Admin] /admin/review → accept
    ↓
[Admin] /admin/new-entity + /admin/new-document
    ↓
entities + documents + claims (placeholder)
    ↓
Registry visible at /ko/wiki/[slug]
    claims show "확인 필요"
    ↓
[Admin] /admin/verify-claim → add source + value
    ↓
claims updated (verified, medium/high confidence)
```

**Alternative path (bulk):**

```
data/topic-candidates.sample.jsonl (or generated JSONL)
    ↓
scripts/validate-topic-candidates.mjs
    ↓
[Admin] /admin/import → confirm
    ↓
entities + documents + claims (placeholder)
    ↓
Same verification flow below
```

---

## 4. Claim Verification Lifecycle

### /admin/verify-claim

Admin interface to add a verified value to an existing claim.

**Input fields:**

| Field | Required | Description |
|---|---|---|
| source_url | yes | Official source URL |
| retrieved_at | yes | When the source was checked (date + time) |
| verified_value | yes | The actual factual value (e.g., "53,000원") |
| confidence | yes | `medium` or `high` |
| notes | no | Admin notes |

**Database operations (single transaction):**

```sql
-- 1. Add source
INSERT INTO claim_sources (
  claim_source_id, claim_id, source_type, source_url,
  retrieved_at, contributed_by_hash
) VALUES (...);

-- 2. Record verification event
INSERT INTO verification_events (
  event_id, claim_id, event_type, performed_by_hash,
  previous_value, new_value, notes
) VALUES (...);

-- 3. Update claim
UPDATE claims SET
  claim_value = :verified_value,
  confidence = :confidence,
  status = 'verified',
  last_verified_at = :retrieved_at
WHERE claim_id = :claim_id;
```

**Claim state machine:**

```
needs_review (확인 필요 / low)
    ↓ source added + verification event
verified (actual value / medium or high)
    ↓ source expired or updated
needs_reverification (old value / medium → low)
    ↓ new source added
verified (new value / medium or high)
```

**Reverification trigger:**

Claims with `update_frequency` other than `static` should be flagged for reverification when:
- `last_verified_at` exceeds the expected update cycle (e.g., annual topics older than 13 months)
- A user submits a correction report for that claim
- Admin manually triggers reverification

---

## 5. Action → Table Mapping

| Action | Actor | Table(s) written |
|---|---|---|
| Suggest topic | Public | `topic_suggestions` |
| Submit correction | Public | `reports` |
| Submit hallucination report | Public | `hallucination_reports` |
| Accept suggestion | Admin | `topic_suggestions` (status update) |
| Create entity | Admin | `entities` |
| Create document + claims | Admin | `documents`, `claims` |
| Import JSONL batch | Admin | `entities`, `documents`, `claims` |
| Verify claim | Admin | `claim_sources`, `verification_events`, `claims` |
| Reject suggestion | Admin | `topic_suggestions` (status update) |
| Flag for reverification | Admin/System | `claims` (status update) |

---

## 6. Public User Permissions

| Can do | Cannot do |
|---|---|
| View published registry pages | Read suggestion queue |
| Submit topic suggestion | Publish content directly |
| Submit correction report | Edit claims |
| Submit hallucination report | Access admin pages |
| View their own submission confirmation | View other users' submissions |

---

## 7. Admin Permissions

| Can do | Requires |
|---|---|
| Review all queues | Admin auth (service role key) |
| Create entities/documents | Admin auth |
| Verify claims (add sources, update values) | Admin auth |
| Import JSONL batches | Admin auth + validator pass |
| Reject/spam submissions | Admin auth |
| Access /admin/* routes | Admin auth |

**Auth mechanism (current phase):**

Admin routes are protected by `SUPABASE_SERVICE_ROLE_KEY` check. No user accounts or complex auth in MVP.

---

## 8. Privacy Rules

1. **No raw IP storage** — all submissions store `contributor_hash` only.
2. **contributor_hash** = SHA-256(IP + daily rotating salt). Same person on same day = same hash. Cannot reverse to IP.
3. **Public submissions are write-only** — no public API to read back submissions.
4. **Admin queue is private** — only accessible with service role key.
5. **No personal data in claims** — claims are about facts (fees, deadlines, rules), not about individuals.
6. **Public profile topics** — only official/public facts. No private life, rumors, medical, religious, or political speculation.

---

## 9. Source-Backed Verification Rules

A claim may only transition from `needs_review` to `verified` when:

1. At least one acceptable source is attached (`claim_sources` row exists).
2. The source has a retrieval date (`retrieved_at` is not null).
3. A `verification_events` entry records who verified and when.
4. The `claim_value` is updated from "확인 필요" to the actual verified value.
5. The `confidence` is upgraded from `low` to `medium` or `high`.
6. The source type is in the topic's `source_policy.allowed` list.
7. The source type is NOT in the `source_policy.disallowed` list.

**Source acceptability hierarchy:**

1. `official` — government, institution, platform official page
2. `law` — legislation, regulation text
3. `regulator` — regulatory body announcement
4. `platform` — service platform's own help/FAQ page
5. `document` — official document, press release
6. `web` — reputable news, verified journalism
7. `other` — other verifiable source (requires justification)

**Never acceptable:**

- Unsourced blogs
- Forums / anonymous posts
- Rumors or speculation
- AI-generated text without underlying source
- Scraped personal data

---

## 10. Recommended Implementation Order

### Phase A: Design documents (current)

- [x] POST_MVP_TOPIC_CATALOG.md
- [ ] POST_MVP_CONTENT_WORKFLOW.md (this document)

### Phase B: Public suggestion form

- `/suggest-topic` page + form UI
- Submission handler (stub → later Supabase)
- contributor_hash generation (already in `lib/contributor-hash.ts`)

### Phase C: Admin verification UI

- `/admin/verify-claim` page + form
- claim_sources + verification_events creation
- claim value/status/confidence update

### Phase D: Persistence connection

- Connect suggestion form → Supabase `topic_suggestions` table
- Connect verification → Supabase `claim_sources`, `verification_events`, `claims`
- Connect import → Supabase batch INSERT

### Phase E: Scale

- 1,000 topic pilot (validated JSONL → import)
- Reverification scheduler
- 10,000+ candidate generation (only after workflow is functional)

---

## Non-Goals (for now)

- User accounts / OAuth / SSO
- Public comment system
- Real-time collaboration
- Payment / subscription
- Automated fact-checking (AI-based verification)
- Public API for third-party consumers
