# Technical Audit Master Report

## Search / Discovery API Audit

### Current behavior

`/api/search` currently accepts any non-empty `q`, caps `limit` at 30, searches document titles and verified claim values with unanchored `ILIKE '%q%'`, and returns document-level results. This is useful for early MVP discovery, but the endpoint must become stricter and more citation-aware before it is treated as an AI citation surface.

### Query length and prefix-search policy

- **Do not allow unrestricted 1-character queries.** A single character has extremely low intent, produces broad result sets in multilingual data, and can trigger expensive scans or noisy trigram matches.
- Recommended behavior:
  - Reject `q` values with normalized length `< 2` with `400` and an actionable error such as `query_too_short`.
  - Allow a 1-character query only when it is explicitly scoped by a **category** or **locale** prefix-search mode, for example `?q=s&lang=en&category=transport&mode=prefix`.
  - For 1-character scoped prefix search, require anchored predicates only, such as `slug ILIKE 's%'`, locale-specific `title ILIKE 's%'`, or category-filtered title prefix matching. Do not run `%s%` claim-value search for 1-character queries.
  - Normalize whitespace, case, and Unicode form before length checks so visually short queries cannot bypass the guard.

### Limit, pagination cost, and cursor migration

- Keep a hard maximum `limit` and document it. The current cap of `30` is acceptable for public autocomplete/search; if API consumers need larger exports, provide a separate authenticated bulk/index endpoint rather than raising search limits.
- Return the applied `limit` in the response metadata so clients can tell when a requested value was capped.
- Avoid deep offset pagination for search. `OFFSET n` becomes more expensive as `n` grows because the database still has to identify and discard preceding rows, and ranking can become unstable when documents or claims are updated between page requests.
- Prefer cursor pagination:
  - Sort by a deterministic ranking tuple, for example `(rank_score DESC, last_verified_at DESC NULLS LAST, document_id ASC)`.
  - Return `next_cursor` containing the last row's ranking tuple, signed or opaque to clients.
  - Fetch the next page with a keyset condition rather than `OFFSET`, keeping latency bounded for large registries.

### Ranking definition

Search ranking should be explicit, explainable, and aligned with For-Ai's claim-level registry model. Recommended ranking order:

1. **Exact slug match** — `slug = normalized_query` should rank first because it indicates a canonical document lookup.
2. **Title prefix match** — locale-specific display title prefix matches rank above fuzzy contains matches because they indicate strong user intent.
3. **Verified document priority** — documents with verified status and verified claim coverage rank above merely published or needs-review documents.
4. **Claim match** — verified claim-value or field-path matches rank after direct document identity/title matches, and the matched claim should be surfaced as an excerpt/snippet.
5. **Freshness / citation-ready status** — break ties by `last_verified_at`, source coverage, and whether the result is citation-ready. Stale or low-confidence results should not outrank fresh verified results even if text similarity is comparable.

An implementation can encode this as a weighted score, but the response should expose enough metadata for users and AI clients to understand why a result is safe to cite.

### `/api/search` response improvement

Search results should include citation-readiness metadata derived from canonical claim and verification state, not from `documents.data` convenience fields. Add these fields to each result:

```json
{
  "type": "document",
  "document_id": "...",
  "slug": "...",
  "title": "...",
  "category": "transport",
  "lang": "en",
  "excerpt": "...",
  "can_cite": true,
  "verification": "verified",
  "confidence": "high",
  "last_verified_at": "2026-07-02T00:00:00.000Z"
}
```

Field semantics:

- `can_cite`: `true` only when the document has at least one verified, source-backed claim suitable for citation and is not stale according to the domain's update policy.
- `verification`: document/result verification state such as `verified`, `partial`, `needs_review`, or `stale`; claim matches should reflect the matched claim's verification when it is stricter than the document aggregate.
- `confidence`: aggregate confidence for the result (`high`, `medium`, `low`), with unknown or unverified facts defaulting to `low`.
- `last_verified_at`: most recent human verification timestamp from `verification_events` for the matched document or claim; use `null` when no verification event exists.

The response envelope should also include pagination metadata:

```json
{
  "results": [],
  "query": "metro fare",
  "total": 10,
  "limit": 30,
  "next_cursor": null
}
```

This keeps `/api/search` useful for humans while making it safer for AI clients that need to decide whether a result is citation-ready.
