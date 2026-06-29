# Topic Watch / Adoption Design

Topic watch/adoption lets contributors steward a slice of the For-Ai fact registry without changing the canonical fact model. The canonical factual path remains:

```text
entities -> documents -> claims -> claim_sources -> verification_events
```

`topic_adoptions` records contributor intent. `watch_subscriptions` records derived work items and notification state when claims go stale or source updates are needed.

## Scope model

A contributor can adopt one or more of these scopes:

- `entity_id`: steward all documents/claims for one canonical entity.
- `document_id`: steward one registry document.
- `category` + `country`: steward a domain slice such as `transport` in `KR` or `commerce` in `GLOBAL`.

Anonymous contributors use `contributor_hash` only. Authenticated contributors may use `contributor_id`. Raw IP addresses must never be stored.

## Workflow

1. **Adopt**: a user adopts a topic/country/category slice, creating a `topic_adoptions` row with `notification_preference`.
2. **Detect stale claims**: the stale-claim job scans claim freshness and matches stale claims to active adoptions.
3. **Create missions**: when a source update is needed, the job creates `watch_subscriptions` rows with `event_type = 'source_update_needed'`, `source_update_needed = true`, and `mission_status = 'open'`.
4. **Notify**: notification workers send in-app/email/webhook messages according to `notification_preference` and stamp `notification_sent_at`.
5. **Reward verified fixes**: after a human-approved verification event resolves the stale claim, service-role logic updates the watch row to `event_type = 'verified_fix'`, `mission_status = 'resolved'`, and records `awarded_badge` / `awarded_points`.

## Privacy and RLS

- `topic_adoptions` allows public insert for anonymous in-app adoption, but has no public select policy.
- `watch_subscriptions` has no public policies because it can reveal contributor interests, notification preferences, missions, and reward history.
- Email/webhook preferences require authenticated or service-role flows, not anonymous direct writes.

## Claim integrity rules

- Adoption never verifies a claim by itself.
- A reward is only recorded after a human-approved verified fix.
- Source-update missions are work queues, not facts.
- `documents.data` remains rendering convenience only; claim truth stays in `claims`, `claim_sources`, and `verification_events`.
