# Hallucination Report Clustering Design

This design keeps hallucination report clustering as an admin-only triage aid. It does not create verified truth, does not rewrite `claims`, and does not bypass the canonical `entities -> documents -> claims -> claim_sources -> verification_events` review path.

## Inputs and extraction pipeline

The clustering job reads private intake rows from `hallucination_reports` and `reports`, plus existing `claims` and `topic_candidates` for matching context.

1. **Normalize private report text** from hallucination report `prompt`, `ai_answer`, `expected_correction`, and general report `message` fields.
2. **Detect and redact personal data first** before storing derived snippets or embeddings. The job should mask likely email addresses, phone numbers, account IDs, postal addresses, personal names when not needed for the claim, and free-form identifiers.
3. **Extract triage fields** only after redaction:
   - `entity`: the named place, institution, product, service, regulation, policy, or other entity-like text.
   - `domain`: the knowledge domain such as transport, commerce, government, healthcare, genomics/DNA, education, travel, finance, or technology.
   - `claim_like_phrase`: the smallest factual phrase that appears to be wrong or missing.
4. **Persist only review-safe derivatives** in `hallucination_reports.extracted_entity_text`, `hallucination_reports.extracted_domain`, and `hallucination_reports.extracted_claim_like_phrase`. Raw prompt/answer/correction fields remain private and get a `raw_text_expires_at` deadline.
5. **Hash normalized text** into `hallucination_report_cluster_members.normalized_text_hash` so duplicate or near-duplicate submissions can be counted without storing repeated raw text in the cluster table.

## Embedding and possible-match search

The pipeline creates a report embedding from the redacted normalized text and stores embedding metadata in `hallucination_reports.report_embedding`. If the database later uses a native vector extension, `report_embedding` can be migrated to a vector column, but the privacy rules stay the same.

For each report or cluster, the matcher searches:

- existing `claims` by claim text, field path, value, entity, jurisdiction, domain/category, and embedding similarity;
- existing `topic_candidates` by title, category, generated claim JSON, source hints, and embedding similarity.

Candidate matches are inserted into `hallucination_report_possible_matches` with `target_type = 'claim'` or `target_type = 'topic_candidate'`, a bounded `similarity_score`, and a human-readable `match_reason`.

## Admin review behavior

Possible matches are displayed only in the admin review queue. They are labels such as “possible existing claim match” or “possible topic candidate match,” not automated decisions.

The system must not automatically:

- change `claims.claim_value`, `claims.status`, `claims.confidence`, or `claims.last_verified_at`;
- add `claim_sources`;
- create `verification_events`;
- promote `topic_candidates`;
- publish private report text.

A human reviewer may use the match to open the existing claim/topic candidate and then follow the normal source-backed verification policy.

## Cluster priority signal

Repeated reports raise priority only as a triage signal. The clustering job updates `hallucination_report_clusters.report_count`, `repeated_signal_score`, and `review_priority_score`; it may also add a bounded contribution to `claims.review_priority_score` or `topic_candidates.review_priority_score` when a possible match is strong enough for admin visibility.

Priority score inputs should be transparent and bounded, for example:

- number of distinct `contributor_hash` values in a cluster;
- recency of submissions;
- similarity confidence;
- high-risk domain/disclaimer category;
- whether the target claim is stale, low-confidence, disputed, or needs review.

A high `review_priority_score` means “review sooner.” It never means “the crowd is correct.”

## Retention and anonymization

Raw user text may contain personal data. Retention must follow these rules:

- never store raw IP addresses; use `contributor_hash` only;
- redact before embedding and before writing extracted snippets;
- set `raw_text_expires_at` when the report is received or when the clustering job first processes it;
- delete or anonymize raw free-text fields within 180 days after final status unless the specific text is retained as accepted provenance;
- keep cluster-level aggregate data only when it contains no raw personal data;
- purge embeddings with raw text because embeddings can leak sensitive content;
- expose clusters, members, matches, embeddings, and raw report text only through service-role/admin routes.

