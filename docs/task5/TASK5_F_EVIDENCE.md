# Task 5-F evidence — report, quarantine, correction

Date: 2026-07-17

Task 5-F is the mandatory correction-control gate before Phase 1 publication. This change does not enable Phase 1, AI auto-publication, monetization, sponsored placement, or licensing.

## Contract delivered

| v7 requirement | Implementation evidence |
| --- | --- |
| Public, unauthenticated report | `POST /api/report/[slug]` accepts bounded reports and continues to use the distributed contributor rate limit, honeypot, and spam inspection. |
| Bounded input and category | Request body is capped at 16 KiB before JSON parsing; message and contact lengths are bounded; categories are allow-listed. |
| Server-bound claim and version | The server resolves the slug and selected claim. Database claims bind to the published/current version UUID; static claims bind to a deterministic `static-sha256:` content reference. Client-supplied versions are not trusted. |
| Optional private contact | Contact is optional, requires explicit consent, is service-role-only, is excluded from public correction APIs, expires after 90 days, and has a runnable cleanup job. |
| No automatic quarantine | A report insert only assigns severity and review SLA. Publication state can change only through an authorized operator RPC. |
| Severity routing | A database trigger assigns critical/high/medium/low and review deadlines from the issue category. Harmful reports are critical with a four-hour review target. |
| Operator actions | Service-only `quarantine_claim`, `restore_quarantined_claim`, and `withdraw_claim` RPCs enforce role, reason, row locking, idempotency, report/version binding, audit, and correction-event writes. |
| All published claims | Database claims use `claims.publication_state`; static `legacy_manual` claims use the controlled `legacy_claim_publication_overrides` bridge because production currently serves the static registry while the database registry is empty. Citation status is never reclassified. |
| Warning and history | Wiki pages retain historical context, display an explicit warning for quarantined/withdrawn claims, expose public-safe correction history, and link to correction/right-of-reply reporting. |
| Citation propagation | Wiki, document API, cite API, raw Markdown, badge, embed, OG/Twitter, diagnostics, hallucination, and AI-error pages use publication-state-aware loaders or citation computation. Quarantined/withdrawn values cannot remain origin-verified. |
| Overlay availability | Static-registry publication overlay failures are fail-closed in production/preview: affected claims become non-citable rather than falling back to a stale historical verified value. |
| Cache handling | Operator actions invalidate all locale wiki/OG/Twitter origins plus document, cite, badge, corrections, embed, and raw origin paths. External search/social caches are explicitly outside the origin's immediate control. |

## Brownfield finding and compatibility decision

The production database contains no `documents` or `claims`, while public pages are served from the repository's static registry. The old report route attempted to insert static claim/document identifiers into database foreign keys, so a real production report could fail before it reached the review queue.

Task 5-F keeps existing URLs and static registry data intact. New nullable database foreign keys are used when a database claim exists; immutable server-bound text references cover static claims. The legacy publication overlay is intentionally narrow: service-role writes only, one row per claim, and no citation-status mutation.

## Database and permissions

Migrations:

- `supabase/migrations/20260717064831_task5_f_report_quarantine_correction.sql`
- `supabase/migrations/20260717065104_task5_f_source_suggestions_permissions.sql`
- `supabase/migrations/20260717065346_task5_f_fk_indexes.sql`

- Public and authenticated roles have no direct table access to private reports, correction-event storage, or legacy publication overrides.
- Public reporting is mediated by the application route and service role so validation, rate limiting, binding, and privacy rules cannot be bypassed through the Data API.
- Direct `claims.publication_state` writes are rejected unless the controlled RPC sets the transaction-local gate.
- Only the service role may execute publication-state or contact-retention RPCs; the application separately enforces moderator/admin permissions.
- Audit metadata contains hashes and identifiers, never reporter contact, raw IP, or raw user-agent data.

## Operator workflow

1. Open `/admin/claim-corrections` using an active production admin identity.
2. Work critical/high reports in `review_due_at` order and inspect the private contact only when a reply is needed.
3. Enter a public-safe reason that contains no contact details or other private report content.
4. Quarantine immediately when a published value is unsafe or materially unreliable; use withdraw only for a final admin decision.
5. Restore only after the underlying source/value is corrected and the public reason explains the resolution.
6. Confirm the wiki warning/history and `/api/corrections/[slug]`, then check cite/badge/raw outputs.
7. Run `npm run job:cleanup-report-contacts` daily. Use `-- --dry-run` to count due contacts without deleting them.

The page uses Supabase Auth plus the active `admin_users` role table as its normal production path. The existing `ADMIN_SECRET` UI is retained only inside an emergency section and remains disabled unless the explicit production break-glass flag is enabled. At verification time the production project had zero Auth users and zero active admins, so the owner must choose the first admin email before this operator UI can be used without break-glass.

First-admin bootstrap:

1. The owner chooses the email; do not infer it from GitHub metadata.
2. Create or invite that identity through the private Supabase Auth dashboard and enable MFA.
3. In the private SQL editor, bind exactly that existing user to `public.admin_users` as `admin`; require exactly one affected row. Never commit the email, password, token, or raw user UUID.
4. Verify the normal login, then disable `ALLOW_BREAK_GLASS_ADMIN` after any documented recovery window.

## Verification

Required local release checks:

```text
npm run typecheck
npm run lint
npm test
npm run ci:guards
npm run build
git diff --check
```

Completed database evidence:

- An isolated PostgreSQL-compatible engine compiled all three migrations and passed critical severity routing, quarantine, idempotent replay (`changed=false`), restore, final `active`, two-event ledger, zero anon source-queue access, and zero public source-queue policies.
- The canonical production Supabase migration history records all three repository versions.
- Production verification confirmed RLS on reports/correction events/legacy overrides; no anon/authenticated table access; no anon publication/retention RPC execution; and service-role execution on all four controlled RPCs.
- A production transaction-rolled-back drill passed critical routing, quarantine, idempotent replay, restore, final `active`, and two correction events. The final query confirmed zero persistent smoke reports, events, or overrides.
- The first two pre-validation DDL attempts failed during function compilation and rolled back atomically. The corrected migration was applied only after isolated compilation and behavior verification.
- Supabase security advisors report the four private Task 5-F queues as RLS-with-no-policy `INFO`, which is the intentional deny-by-default design. No Task 5-F security-definer function is reported as anon/authenticated executable. The source-queue broad-policy drift found on the first advisor pass was removed.
- Supabase performance advisors report no uncovered Task 5-F report/correction foreign key after the index follow-up. Unused-index notices are expected while the new production tables contain no traffic.

Release evidence still required before completion:

- green GitHub PR checks and merged main SHA;
- canonical Vercel deployment and non-mutating route smoke evidence.

## Rollback and limitations

- Code rollback: redeploy the previous Vercel main SHA. Database additions are backward-compatible and should remain in place to preserve correction history.
- Emergency containment: quarantine the affected claim, disable privileged service-role writes if authorization is suspect, and preserve audit/correction events.
- External platforms may retain an old social card, snippet, or cached response until their own refresh cycle. The product guarantees origin-state propagation, not third-party cache deletion.
- Reports do not trigger notifications in this change because no verified notification transport is configured; operators must monitor the queue and SLA. This is documented rather than represented as delivered.
- Phase remains 0. Task 5-P1 cannot be enabled until its separate controls are implemented and the existing 14-day/50-sample Phase 1 gate passes.
