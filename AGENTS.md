# AGENTS.md

## Product Identity

GYEOL is not an AI wiki.

GYEOL is a local fact registry for AI, search engines, and humans.

## Non-Negotiable Rules

- Static-first rendering is mandatory.
- Core document content must be readable from raw HTML without client-side JavaScript.
- `schema-v3.sql` is the source of truth.
- If `schema-v3.sql` is not yet present, it must be added in Goal 2 before database integration.
- Do not use `schema-v2.sql`.
- Do not invent a different database model.
- `entity_id` is mandatory from MVP.
- English slug is stable.
- Display titles are language-specific.
- GYEOL is claim-level.
- The canonical structure is:

  ```text
  entities -> documents -> claims -> claim_sources -> verification_events
  ```

- `documents.data` is only rendering convenience.
- `documents.data` must not become the canonical source of factual truth.
- No fake facts.
- Unknown facts must show “확인 필요” and confidence low.
- Do not invent venue details.
- `llms.txt` is secondary.
- `llms.txt` is not the legal basis.
- `llms.txt` is not the citation engine.
- Public read is not allowed for edits, reports, or hallucination_reports.
- Public submissions do not require login.
- Never store raw IP addresses.
- Store `contributor_hash` only.
- Do not add payment, user accounts, complex auth, or large admin systems in the MVP.

## MVP Target

- `entity_id`: `kr-weddinghall-laluce-001`
- `slug`: `myungdong-laluce-parking`
- `page`: `/ko/wiki/myungdong-laluce-parking`
