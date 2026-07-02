# Technical Audit Master Report

## Observability & Incident Response

For-Ai must treat observability as part of fact-integrity operations: metrics and logs should help operators detect abuse, degraded citation/search experiences, and failed event writes without collecting raw personal network identifiers.

### Metrics to Track

| Area | Metric | Definition | Recommended dimensions |
| --- | --- | --- | --- |
| `/api/search` | p95 latency | 95th percentile end-to-end request duration for completed search requests. | `route`, `status`, `locale`, normalized error code |
| `/api/search` | Error rate | Percentage of `/api/search` requests returning 5xx or normalized application errors. | `route`, `status`, normalized error code |
| `/api/search` | Query count | Total accepted search queries, including zero-result queries. | `route`, `locale`, result-count bucket |
| `/api/trending` | Cache hit/miss estimate | Estimated ratio of requests served from cache versus requests that trigger a fresh Supabase read. | `route`, cache status, `status` |
| `/api/trending` | Supabase query latency | Duration of Supabase reads used to build trending responses when cache misses or refreshes occur. | `route`, query name, `status` |
| `/api/posts` | Pending submission rate | Count/rate of public submissions entering the pending moderation queue. | `route`, `status`, moderation state |
| `/api/posts` | Spam/rejected rate | Count/rate of submissions rejected by spam controls or moderator decisions. | `route`, `status`, rejection reason code |
| `/api/admin/login` | Failed login count | Count of failed admin authentication attempts. | `route`, `status`, normalized error code |
| Document citation/view events | Write failure count | Count of failed writes for citation and view tracking events. | event type, `route`, `status`, normalized error code |

### Example Alert Thresholds

- Trigger a security alert when `/api/admin/login` records **20 or more failed login attempts in 5 minutes**.
- Trigger a search reliability alert when `/api/search` p95 latency is **greater than 1 second for 10 consecutive minutes**.
- Trigger an abuse/moderation alert when the 10-minute average for public submissions is **5x higher than the normal baseline** for the same route and comparable time window.
- Trigger a citation-integrity warning when document citation/view event write failures are non-zero for a sustained 10-minute window, because failed writes reduce the reliability of downstream usage analytics.
- Trigger a trending degradation warning when `/api/trending` cache misses sharply increase while Supabase query latency also exceeds the recent baseline, because this can indicate cache churn or database pressure.

### Privacy-Preserving Logging Rules

- Never log or store raw IP addresses in application logs, analytics events, moderation records, or incident-response exports.
- Use `contributor_hash` as the stable abuse-prevention and rate-limit identifier when a contributor identity is needed.
- Keep request logs limited to `contributor_hash`, `route`, `status`, and normalized error code, plus coarse operational metadata such as duration buckets or cache status when needed.
- Do not include request bodies, free-form user text, raw headers, raw user-agent strings, authorization tokens, cookies, or source URLs that may contain personal data in routine logs.
- Normalize expected failures into bounded error codes such as `VALIDATION_FAILED`, `RATE_LIMITED`, `AUTH_FAILED`, `SUPABASE_TIMEOUT`, and `EVENT_WRITE_FAILED` so incident review does not require storing sensitive payloads.
- Incident runbooks must prefer aggregate metrics first; sample-level investigation should be time-limited, access-controlled, and still exclude raw IP addresses.
