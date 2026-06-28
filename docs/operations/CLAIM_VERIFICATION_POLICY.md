# Verified Claim Promotion Criteria

This policy defines the minimum bar for promoting a For-Ai claim to `verified`. It applies to every admin review workflow, including `/admin/verify-claim`, imports, generated candidates, and manual corrections.

## Non-negotiable rule

AI-generated candidates are never verified truth by themselves. A claim created, drafted, summarized, translated, or proposed by AI **must not** be promoted to `verified` until a human reviewer checks the claim against acceptable sources, records the source evidence in `claim_sources`, and records the review action in `verification_events`.

## 1. Source priority

Reviewers must prefer sources in this order:

1. **Official source (`official`)** — the entity owner, government agency, regulator, standards body, institution, venue, product owner, or other primary authority for the claim.
2. **Primary platform or registry (`platform`)** — authoritative platform listings, public registries, transit/operator databases, app-store/product listings, or other systems that directly publish the fact when an official page is unavailable or not granular enough.
3. **Official document or filing (`document`)** — PDFs, notices, terms, filings, policies, schedules, rate tables, or archived documents issued by an authoritative body.
4. **Reputable secondary web source (`web`)** — established news, reference, or data sources used only when primary sources are unavailable, stale, or insufficient. Secondary sources should normally cap confidence at `medium` unless corroborated.
5. **Review/community source (`review`)** — user reviews, social posts, forums, or crowd reports. These can support investigation or disputed/unknown handling, but they are not enough by themselves for `verified`.
6. **Other (`other`)** — any source that does not fit above. Treat as supporting evidence only unless an admin documents why it is authoritative for that claim.

If sources conflict, do not choose the most convenient value. Prefer the most authoritative and recent source, mark the claim `disputed` when the conflict is material, and document the conflict in the citation or verification event notes.

## 2. Minimum `claim_sources` requirements

A claim may be promoted to `verified` only when all of the following are true:

- At least one `claim_sources` record exists for the exact claim being verified.
- The source has a traceable URL, title, and `source_type` whenever available.
- The source directly supports the claim value, not just the surrounding topic.
- The citation or review note explains what was checked when the source page is long, ambiguous, generated, translated, or likely to change.
- The reviewer confirms the source is reachable or otherwise records why it was accepted, such as a stable PDF, archived official notice, or offline official document.

Use at least two independent sources when:

- No official or primary source is available.
- The value is high-impact, financial, legal, safety-related, or likely to be cited by many AI systems.
- The available source is secondary, partially outdated, machine-translated, or not specific to the claim jurisdiction.
- There is a recent correction, public dispute, or conflicting evidence.

## 3. `last_verified_at` input criteria

Set `last_verified_at` only when a human reviewer has completed the verification action. The timestamp should represent the time the reviewer actually observed and accepted the evidence, not the date the source was originally published.

Use the current review timestamp when:

- The reviewer opens or otherwise checks the source and confirms the claim value.
- A new `claim_sources` record is added for the verified value.
- A stale verified claim is rechecked and remains correct.
- A previously disputed or unknown claim is resolved by acceptable evidence.

Do not update `last_verified_at` when:

- An AI system merely generated or transformed the claim.
- A batch import copied existing values without human source review.
- Only formatting, translation, slug, or display-title changes were made.
- The reviewer cannot trace the value to an acceptable source.

## 4. Confidence levels

Use confidence as an evidence-quality signal, not as a guess about whether the claim feels plausible.

### `high`

Use `high` only when the claim is directly supported by an official, primary, or authoritative document source; the value is current for the relevant jurisdiction/entity; and there is no unresolved material conflict. `high` claims should normally be eligible for `verified` after human review.

### `medium`

Use `medium` when the claim is supported but has limitations, such as secondary sourcing, partial corroboration, non-critical ambiguity, unclear freshness, jurisdiction caveats, or a source that is authoritative for the topic but not the direct owner of the claim. `medium` claims may be verified only if the limitation is documented and acceptable for the use case.

### `low`

Use `low` when the value is unknown, unconfirmed, AI-generated only, crowd-reported only, stale, disputed, or missing direct source evidence. `low` claims must not be promoted to `verified` unless new human-reviewed source evidence resolves the issue.

## 5. Disputed and unknown handling

### Unknown

If the reviewer cannot confirm a value, keep or set the claim value to `확인 필요` / `Needs verification`, confidence `low`, and status `needs_review`. Do not fill gaps from memory, assumptions, similar entities, AI output, or inferred defaults.

### Disputed

Use `disputed` when credible sources disagree, the official source conflicts with recent observed evidence, or a correction report raises a material conflict that cannot be resolved during review. A disputed claim should include the competing sources where possible, a reviewer note describing the conflict, and confidence no higher than `low` until the conflict is resolved.

### Resolution

Resolve unknown or disputed claims only after a human reviewer verifies acceptable evidence. Record the accepted source in `claim_sources`, record the action in `verification_events`, set `last_verified_at` to the review time, and choose the confidence level according to the evidence quality above.

## 6. AI-generated candidate rule

AI may help identify candidates, draft placeholders, summarize pages, suggest field paths, or prepare review queues. AI may not approve facts. A human reviewer must perform the final source check before any AI-generated candidate, imported candidate, or generated draft becomes `verified`.
