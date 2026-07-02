# Technical Audit Master Report

## RLS / Governance

For-Ai keeps public intake tables private by default: anonymous clients may submit allowed rows through RLS-scoped insert policies, while review, status changes, and deletion/anonymization are handled by service-role admin paths only. Public reads must not expose private intake queues unless a table has an explicit moderation-aware public-read policy.

### Privacy Retention

#### Hash-only contributor identity

- Store only `contributor_hash` for abuse prevention, rate limiting, contributor streaks, and moderation correlation.
- Do not store raw IP addresses or raw user-agent strings in public intake tables, admin audit payloads, logs intended for product analytics, or exported review data.
- If an HTTP request requires IP/user-agent data to derive `contributor_hash`, use it only in memory for one-way hashing with `CONTRIBUTOR_SALT`, then discard the raw values before persistence.
- When `contributor_hash` is unavailable or cannot be safely generated, keep the row with a null contributor identity rather than storing raw network identifiers.

#### Public intake retention schedule

| Table | Default retention | Accepted / published outcome | Rejected, spam, or deleted outcome |
| --- | --- | --- | --- |
| `hallucination_reports` | Review within 90 days; retain pending rows for at most 180 days from `created_at`. | If accepted and used as claim-quality provenance, retain the minimal report record while the linked claim/document remains active; remove free-text that is not needed for provenance after 365 days. | Delete or anonymize within 30 days of final status. Keep only aggregate counters and non-identifying moderation reason codes if needed. |
| `topic_suggestions` | Review within 90 days; retain pending rows for at most 180 days from `submitted_at`. | If promoted into an entity/document/candidate workflow, retain the minimal topic metadata needed to trace the promotion for up to 365 days after promotion. | Delete or anonymize within 30 days of final status. Do not retain rejected free-text pitches beyond aggregate taxonomy metrics. |
| `source_suggestions` | Review within 90 days; retain pending rows for at most 180 days from `created_at`. | If accepted as a source candidate or attached to a claim, retain the normalized URL/domain and source-review metadata as provenance while the claim/source remains active; remove contributor-private notes after 365 days. | Delete or anonymize within 30 days of final status. For spam URLs, retain only a normalized domain/hash denylist entry when required for abuse defense. |
| `community_posts` | Pending posts must be moderated within 30 days; retain unresolved pending rows for at most 90 days from `created_at`. | Published posts may remain while relevant to the linked document/claim, subject to user deletion/moderation requests and periodic stale-content review every 365 days. | Hide immediately from public views; delete or anonymize author text and contributor linkage within 30 days of rejected/spam/deleted status unless needed for an active abuse investigation. |

#### Rejected / spam / deleted disposal criteria

- **Delete** rows when they contain no reusable claim provenance, no active abuse investigation value, and no legal/operational hold.
- **Anonymize** rows instead of deleting only when aggregate moderation analytics, duplicate detection, or abuse defense still needs a non-identifying record.
- Anonymization must remove or null contributor linkage (`contributor_hash`), free-text that may contain personal data, contact fields, and any request-derived metadata. Retained fields should be limited to table name, final status, coarse reason code, normalized entity/document/claim reference when safe, timestamps rounded to day-level where possible, and aggregate-safe category/domain hashes.
- Spam handling may retain a normalized URL/domain hash or coarse pattern signature, but must not keep the original submitter identity or raw request metadata.
- Deleted community content must not remain readable through public RLS policies, static generation, search indexes, `llms.txt`, or API cache layers.

#### `CONTRIBUTOR_SALT` rotation impact

Rotating `CONTRIBUTOR_SALT` intentionally changes future `contributor_hash` values for the same person or network context. Operations must treat rotation as a contributor-identity boundary with these effects:

- Existing contributor streaks, leaderboard credit, duplicate-source caps, and rate-limit buckets keyed only by `contributor_hash` will not automatically join to the new hash.
- A rotation can temporarily reset rate-limit history for recurring submitters and can break streak continuity unless a private, time-limited migration map is generated before rotation.
- If continuity is required, create a service-role-only rotation job that rewrites eligible current-window hashes, then destroy the mapping material immediately after verification; never export old/new hash pairs to analytics or public reports.
- If privacy risk is the reason for rotation, prefer no backfill: freeze old streak windows, start new rate-limit buckets, and document the rotation date in admin operations notes.
- Admin dashboards should annotate the rotation window so moderators understand sudden drops in streaks, duplicate detection matches, or contributor-level spam history.
