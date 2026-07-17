# Task 5-D — notification delivery evidence

## Outcome

Task 5-D turns the transaction-bound intents created by Task 5-P1 into an actual private in-app inbox. It does not activate Task 5 drafting/publication, send email, expose recipient contact data, or weaken the publication gate.

Email is deliberately not represented as delivered: no verified email transport or cost approval exists. The durable outbox can fan out to a future provider without changing publication transactions or the inbox contract.

## Contract coverage

| Bible v7 requirement | Implementation |
| --- | --- |
| Transactional outbox | Task 5-P1 inserts the intent in the publication transaction; 5-D leases that durable row. |
| One event/recipient row | Both outbox and inbox enforce `unique(event_id, recipient_id)`. |
| Reasons aggregation | `task5_merge_notification_reasons` sorts and de-duplicates reasons; proposer/reviewer overlap stays one row. |
| Worker-only insert | Browser roles have no outbox/inbox insert permission. Lease, complete, and failure RPCs are service-role only. |
| Idempotent retry | `complete_notification_outbox` upserts the inbox row and marks delivery in one DB transaction; a successful replay returns `changed=false`. |
| Retry and DLQ | `SKIP LOCKED` leases, lease expiry recovery, 30-second bounded exponential backoff, five attempts by default, and a private dead-letter row. |
| Unread RLS | Authenticated users can select only notifications whose contributor `account_id` is their `auth.uid()`; they receive column-level update permission for `read_at` only. |
| Actual unread indicator | The site header reads the RLS-filtered unread count and displays a data-backed dot. `/notifications` supports sign-in, list, per-item read, and mark-all-read. |
| Privacy | No email, provider response body, raw IP, user agent, password, or private operator identity is stored in a notification. |

## Files

- `supabase/migrations/20260717083314_task5_d_notifications.sql`
- `schema-v3.sql`
- `lib/task5-notifications.ts`
- `lib/supabase-browser.ts`
- `app/api/cron/task5-notifications/route.ts`
- `app/components/NotificationBell.tsx`
- `app/notifications/page.tsx`
- `scripts/sql/task5-d-rollback-smoke.sql`
- `test/task5-notifications.test.ts`

## Worker operation

The worker endpoint accepts `GET` or `POST` and fails closed unless a 32+ character `CRON_SECRET` is configured and provided as `Authorization: Bearer ...` or `x-cron-secret`. `TASK5_EMERGENCY_DISABLE=1` pauses it.

Recommended invocation frequency after the cron operations track is approved: every five minutes, limit 25. Alerts should fire when a dead-letter row exists, an eligible pending row is older than 15 minutes, or a processing lease is expired. The API response exposes only counts and sanitized error codes.

The repository does not add a schedule in this PR because production cron ownership and `CRON_SECRET` are still an explicit operations-track gate. Until that is configured, a trusted operator can invoke the endpoint manually after publication. No publication is lost: intents remain durable and due.

## Verification gates

- TypeScript: `npm run typecheck` — pass.
- Tests: `npm test` — 218/218 pass.
- Lint: `npm run lint` — 0 errors; 34 pre-existing warnings within the 39-warning baseline.
- Repository guards: `npm run ci:guards` — pass.
- Production build: `npm run build` — pass; the pre-existing citation-route `revalidate` warning remains unchanged.
- Live migration: `20260717083314 task5_d_notifications` applied successfully.
- Transactional live drill: one outbox row and one inbox row for two aggregated reasons; first completion changed state, replay did not; authenticated RLS update set `read_at`; a separate one-attempt failure created exactly one dead letter; rollback removed every synthetic row.

Live drill result:

```text
outbox_rows_for_first_event=1
notification_rows=1
aggregated_reasons=[assisted_review_held,wanted_claim_published]
first_changed=true
replay_changed=false
read_at_set_through_authenticated_rls=true
dead=true
dead_letters=1
```

Post-rollback state: Phase 0, drafting disabled, active admins 0, notification/outbox/dead-letter rows 0, synthetic Auth users 0. All three private tables have RLS. Browser worker-RPC grants are 0; service worker-RPC grants are 3; authenticated users have exactly the intended inbox SELECT and `read_at` column update. Supabase security advisors report only the intentional RLS-with-no-policy INFO notices for the private outbox/DLQ; no Task 5-D warning or error was introduced. New indexes are unused only because the live queues are empty.

## Rollback and containment

1. Set `TASK5_EMERGENCY_DISABLE=1` or stop the cron caller. Existing outbox rows remain durable.
2. Do not delete pending/dead rows during an incident.
3. Inspect sanitized `last_error_code`, retry age, and dead-letter counts; recipient contact data is not available to the worker by design.
4. Roll back the application UI/route independently if needed. The RLS-protected inbox and already delivered rows are safe to retain.

## Activation state

Task 5 stays at Phase 0 with drafting disabled until the separate operator/bootstrap and Phase 0→1 gate are approved. Task 5-D can remain installed safely with an empty queue.
