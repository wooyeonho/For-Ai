# Production operations runbook

Last updated: 2026-07-16

This runbook records the canonical production target, required environment split, scheduled jobs, evidence paths, backup/restore steps, incident controls, operating checklist, and release-report template for For-Ai.

## 1. Canonical production URL and Vercel project decision

### Verified Vercel state (checked directly against the Vercel account, not inferred from repo defaults)

- This GitHub repo's Vercel integration auto-deploys to **two separate real projects** on every push: `for-ai` (`prj_wgH7e3WpNZwH50pOgvK8tyAYUI82`, created 2026-06-19) and `for-ai-e4mm` (`prj_SEEimLTnZIPPACfrvwbfswDNDIY7`, created ~50 minutes later the same day). Both are independent Next.js projects under team `yeonhos-projects-691c1aa2`, not a naming artifact.
- **Neither project has a custom domain attached** (`live: true`) — both currently resolve only via Vercel-assigned `*.vercel.app` subdomains: `for-ai-seven.vercel.app` / `for-ai-yeonhos-projects-691c1aa2.vercel.app` for `for-ai`, and `for-ai-e4mm.vercel.app` / `for-ai-e4mm-yeonhos-projects-691c1aa2.vercel.app` for `for-ai-e4mm`.
- The repo package name (`for-ai`) and the code's URL fallbacks are not, by themselves, evidence of Vercel-side intent — they're values someone typed into source at some point.

### Canonical decision

- **Canonical production project (owner-confirmed):** `for-ai-e4mm` (`prj_SEEimLTnZIPPACfrvwbfswDNDIY7`). This matches the existing code defaults already wired through `lib/urls.ts`, `.env.example`, and `scripts/production-submission-smoke.mjs`, and is the origin all Task 1–4 production smoke evidence in this repo's PR history was collected against — keeping it canonical avoids unnecessary code churn and re-verification risk.
- **Canonical production origin:** `https://for-ai-e4mm.vercel.app` until a custom domain is attached (see follow-up below).
- **Non-canonical project:** `for-ai` (`prj_wgH7e3WpNZwH50pOgvK8tyAYUI82`) must not be treated as a second live production deployment. It should be demoted to preview-only (remove production environment variables and any production domain assignment) or deleted, at the owner's discretion — until then, treat any traffic or data on it as non-production.
- **Follow-up required before a real go-live:** attach a real custom domain (not a `*.vercel.app` subdomain) to `for-ai-e4mm`, and resolve the `for-ai` duplicate (delete or demote) so exactly one project can serve production traffic. Running two independently-deploying, undifferentiated "production-like" projects off the same repo is itself an operational risk (accidental traffic/config drift, doubled attack surface) and should not persist past the MVP stage.

### Duplicate-project resolution record

| Name | Vercel project ID | Production status | Required action |
| --- | --- | --- | --- |
| `for-ai-e4mm` | `prj_SEEimLTnZIPPACfrvwbfswDNDIY7` | **Canonical production (owner-confirmed)** | Keep production env vars, domains, cron, alerts, and smoke evidence here. Attach a real custom domain before go-live — it currently has none. |
| `for-ai` | `prj_wgH7e3WpNZwH50pOgvK8tyAYUI82` | **Non-canonical — resolution still pending** | Confirmed real and independently deployed (not a naming artifact). Owner to delete it, or demote it to preview/staging with separate Supabase resources and no production cron/domain. |

Confirmed against the Vercel account directly (2026-07-16): both projects are real, both currently only resolve via `*.vercel.app` subdomains, neither has a custom domain. Before go-live, attach a real custom domain to `for-ai-e4mm` and resolve the `for-ai` duplicate (delete or demote) so exactly one project can serve production traffic. Record the final custom domain and the `for-ai` disposition in the release report.

## 2. Environment variables by environment

### Production requirements

Set these in the canonical Vercel production project only:

| Variable | Production requirement | Notes |
| --- | --- | --- |
| `CRON_SECRET` | Required if any external scheduler or Vercel cron HTTP endpoint is used. | Generate with `openssl rand -hex 32`; pass as `Authorization: Bearer $CRON_SECRET` or equivalent scheduler secret. Current repo jobs are CLI scripts, so this is an external-runner secret until HTTP cron routes exist. |
| `NEXT_PUBLIC_SUPABASE_URL` | Required. | Must point to the production Supabase project. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required. | Public anon key only; never use service-role key here. |
| `SUPABASE_SERVICE_ROLE_KEY` | Required for admin APIs and jobs. | Server/job only. Must differ from anon key. |
| `SUPABASE_DB_URL` | Deploy/operator shell only. | Do not expose to browser. Used for `npm run db:migrate`. |
| `ADMIN_SECRET` | Required for admin operations and smoke tests. | Rotate after incidents or human sharing. |
| `ADMIN_CSRF_SECRET` | Required for admin session CSRF protection. | Generate separately from `ADMIN_SECRET`. |
| `CONTRIBUTOR_SALT` | Required for public submissions. | Enables `contributor_hash`; raw IP addresses must not be stored. |
| `NEXT_PUBLIC_SITE_URL` | Required for production canonical URLs. | Must equal the canonical production origin, no trailing slash. |
| `NEXT_PUBLIC_APP_URL` | Required/recommended for self-fetching server-rendered pages. | Must equal the canonical production origin, no trailing slash. |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | Required/recommended. | Use `en` unless product decides otherwise. |
| `ADMIN_DIGEST_EMAIL` | Optional until email transport exists. | Included in digest logs only; current script reports email transport as not configured. |
| `SLACK_WEBHOOK_URL` | Required for digest failure/success alerting if Slack is the chosen alert path. | Use a private operations channel. |
| `DISCORD_WEBHOOK_URL` | Optional alternative alert path. | Do not set both Slack and Discord unless duplicate alerts are desired. |
| AI provider keys | Optional. | Only needed for admin candidate generation. Keep disabled if not actively used. |

### Preview requirements

Preview deployments must not mutate production data unless explicitly approved for a release drill.

| Variable | Preview requirement | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required only if preview needs live DB features. | Prefer a staging Supabase project. |
| `SUPABASE_SERVICE_ROLE_KEY` | Prefer unset or staging-only. | Never point preview service role at production. |
| `SUPABASE_DB_URL` | Staging only. | Never run preview migrations against production. |
| `ADMIN_SECRET` / `ADMIN_CSRF_SECRET` | Staging values only if admin preview is needed. | Must differ from production. |
| `CONTRIBUTOR_SALT` | Staging value if public submissions are enabled. | Must differ from production to prevent cross-environment correlation. |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` | Preview deployment URL or staging domain. | Do not use the production canonical URL. |
| `CRON_SECRET` | Usually unset. | Preview cron should be disabled unless testing job wiring against staging. |

## 3. Cron and job inventory

There is no committed `vercel.json`; production scheduling is therefore an external scheduler/operator responsibility until cron endpoints are added.

| Job | Command | Suggested cadence | Writes | Evidence | Alert path |
| --- | --- | --- | --- | --- | --- |
| Admin digest | `npm run job:generate-admin-digest` or `npm run admin:digest` | Daily at 09:00 UTC | `admin_audit_events` with `admin.digest.generated`, and delivery-failure events | Script stdout plus `admin_audit_events` rows by `run_id` | Slack via `SLACK_WEBHOOK_URL`; fallback Discord via `DISCORD_WEBHOOK_URL`; operator email is log-only until email transport exists. |
| Source health | `npm run job:check-source-health -- --limit=50 --timeout-ms=8000` | Daily; increase cadence for high-risk domains when needed | `admin_audit_events` action `cron.check_source_health` | Audit metadata includes checked/unhealthy counts and sample unhealthy URLs | Scheduler failure alert plus admin digest. |
| Stale claims | `npm run job:find-stale-claims -- --limit=100` | Daily | `admin_audit_events` action `cron.find_stale_claims`; may insert `watch_subscriptions` | Audit metadata includes stale claim count, scoring model, and watch mission count | Scheduler failure alert plus admin digest. |
| Security baseline | `npm run job:check-security-baseline` | Daily and after env changes | `admin_audit_events` action `cron.check_security_baseline`; exits non-zero on failed baseline | Audit metadata contains boolean checks and failed count | Immediate Slack/Discord alert from scheduler on non-zero exit. |
| Topic candidate triage | `npm run job:triage-topic-candidates -- --limit=100` | Daily or manual batch | `admin_audit_events`; candidate review queue changes if implemented by script | Script stdout and audit event | Admin digest and scheduler failure alert. |

Failure alert rule: any non-zero exit, missing audit event for a scheduled window, or three consecutive delivery failures must page the operator channel. Three consecutive cron failures are an incident and should use the severity table below.

## 4. Required job execution evidence

For each production run, capture these fields in the operations log or final report:

| Job | Minimum evidence |
| --- | --- |
| Admin digest | Command, timestamp, exit code, `run_id`, delivery array, `admin.digest.generated` audit row ID, and any `admin.digest.delivery_failed` row IDs. |
| Source health | Command, timestamp, exit code, `cron.check_source_health` audit row ID, `checked`, `unhealthy`, and top unhealthy sample count. |
| Stale claim | Command, timestamp, exit code, `cron.find_stale_claims` audit row ID, `staleClaims`, `watchMissions`, and queue URL. |
| Security baseline | Command, timestamp, exit code, `cron.check_security_baseline` audit row ID, failed check list, and confirmation that service-role and anon keys differ. |

Evidence must never include raw secrets, raw IP addresses, or full private submission payloads.

## 5. Backup and restore runbook

### Backup scope

- Supabase Postgres schema and data for canonical production.
- Supabase storage objects, if any, with manifest and hashes.
- Vercel environment variable inventory as presence/status only, plus encrypted secret backup managed outside the repo.
- Domain/DNS configuration screenshots or exports.
- Git commit SHA and migration list for every release.

### Backup procedure

1. Confirm production Supabase project ref and canonical Vercel project.
2. Export a database backup using Supabase managed backups or `pg_dump` from a trusted operator machine.
3. Store the encrypted backup in the approved private storage bucket/vault.
4. Record backup timestamp, Supabase project ref, git SHA, migration head, object manifest hash, and operator.
5. Verify the backup file can be listed and checksum-verified from a second machine or CI runner.

### Restore drill

1. Create a new staging Supabase project or isolated restore database.
2. Restore the latest backup into staging.
3. Apply any migrations after the backup timestamp using `npm run db:migrate` with staging `SUPABASE_DB_URL`.
4. Point a preview deployment at staging env vars.
5. Run smoke checks for `/`, representative wiki/raw/API routes, public submission, admin diagnostics, and the four required jobs in `--dry-run` or staging mode.
6. Record RTO, RPO, failed steps, and whether raw IP storage remains absent.

### Recovery objectives

- MVP target RPO: 24 hours or better while Supabase managed backups are used.
- MVP target RTO: 4 hours for restoring read-only citation surfaces; 8 hours for full admin/job recovery.
- Enterprise phase targets must be tightened before paid SLA launch.

## 6. Incident severity and kill switches

| Severity | Examples | First response | Target |
| --- | --- | --- | --- |
| SEV-0 | Secret leak, service-role exposure, raw IP storage, unauthorized claim verification/status changes, database destructive action | Freeze deploys, rotate secrets, disable affected jobs, preserve logs, notify legal/security owner | Immediate response; executive/operator notification. |
| SEV-1 | Production unavailable, admin auth bypass, public writes bypass moderation, canonical URL serves wrong project | Disable risky endpoints/jobs, rollback deployment, restore last known good env | Mitigate within 1 hour. |
| SEV-2 | Three consecutive cron failures, digest delivery down, source-health/stale queue stale for more than 24 hours | Pause dependent automation, rerun jobs manually, repair alerting | Mitigate within 1 business day. |
| SEV-3 | Documentation drift, preview env mismatch, non-critical route smoke failure | File follow-up and fix in normal release flow | Next planned release. |

Kill switches and containment controls:

- Set `AI_GENERATION_DISABLED=true` to stop AI generation budget paths.
- Remove or rotate `SUPABASE_SERVICE_ROLE_KEY` to stop privileged admin/job writes while keeping static-first pages online where possible.
- Rotate `ADMIN_SECRET` and `ADMIN_CSRF_SECRET` to invalidate break-glass/admin sessions.
- Disable external scheduler entries or remove `CRON_SECRET` when cron HTTP endpoints exist.
- Set `FORAI_ENABLE_STUB_STORAGE=false` in production; never rely on stub storage for production facts.
- Roll back to the previous Vercel deployment when code release is suspected.

## 7. Monthly and quarterly operations checklist

### Monthly

- Confirm canonical Vercel production project, production URL, and domain assignments.
- Review production/preview environment variable presence and separation.
- Verify `SUPABASE_SERVICE_ROLE_KEY` differs from anon key and is absent from client bundles.
- Review admin users, admin audit events, and break-glass use.
- Confirm all scheduled jobs produced evidence in the prior month.
- Review stale-claim and source-health queues; sample high-risk domains first.
- Run production smoke checks and record evidence.
- Check Vercel and Supabase usage/cost dashboards against budget caps.
- Confirm no raw IP addresses are stored in public submission tables or logs.

### Quarterly

- Perform a backup restore drill into staging.
- Rotate `ADMIN_SECRET`, `ADMIN_CSRF_SECRET`, `CRON_SECRET`, and webhook URLs where practical.
- Review RLS policies against `schema-v3.sql` and latest migrations.
- Review incident severity table, contacts, and kill-switch execution path.
- Review inactive phase gates before enabling monetization, API tiers, sponsored placement, or auto-publication.
- Reconfirm custom domains, DNS ownership, Vercel project ownership, Supabase owner access, and encrypted backup access.

### Cost cap procedure

1. Record current Vercel plan, usage, spend, and alert threshold.
2. Record current Supabase plan, database size, bandwidth, edge-function usage, and alert threshold.
3. Confirm provider billing alerts are configured to the operator email/channel.
4. Set a monthly human review threshold before increasing plan limits.
5. If usage crosses 80% of budget, disable optional AI generation, reduce job limits/cadence, and review traffic sources.

## 8. Final release report template

Use this template for the final production handoff report.

- **Main SHA:** `<git rev-parse origin/main or deployed commit>`
- **Production URL:** `https://for-ai-e4mm.vercel.app` or confirmed custom domain
- **Canonical Vercel project:** `for-ai-e4mm` with dashboard-confirmed project ID
- **Merged PRs:** list PR numbers/titles included in the deployment
- **Migrations:** list migration files applied and Supabase project ref
- **CI evidence:** commands, commit SHA, CI URL, status, and timestamps
- **Production smoke evidence:** production URL, tested routes, commands, status codes, timestamp, operator
- **Security/privacy evidence:** env presence check, RLS check, no raw IP storage check, service-role separation, admin audit sample
- **Operations evidence:** admin digest, source health, stale claim, security baseline job evidence with audit row IDs
- **Inactive phase gates:** monetization, sponsored placement, AI Citation API, data licensing, and auto-publication remain off unless separately approved
- **Remaining external blockers:** Vercel dashboard confirmation, custom domain/DNS, scheduler ownership, webhook alert channel, Supabase backup access, billing alert access
- **Rollback/recovery:** previous Vercel deployment ID, restore backup timestamp, RTO/RPO, kill switches used or ready
