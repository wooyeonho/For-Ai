# For-Ai homepage operating plan

Last updated: 2026-07-17

## 1. Current launch posture

The website is technically deployable but is not ready for broad public acquisition.

Current production baseline:

- Task 5 Phase 0.
- AI drafting disabled.
- No active production administrator account.
- No production `claims`, `claim_versions`, or `claim_evidence` rows.
- Notification delivery is active, with no outbox backlog or dead letters.
- The canonical project is `for-ai-e4mm`; the duplicate `for-ai` project still needs to be deleted or demoted.
- A custom production domain is not yet attached.

The homepage currently mixes two different positioning choices:

1. the hero and Korean examples emphasize public fees and civic deadlines;
2. the registry grouping treats business operating facts and reputation correction as the primary commercial vertical.

The homepage must not present these as one undifferentiated launch promise.

## 2. Recommended operating model

Use a two-lane model with one clear homepage promise.

### Public trust lane — homepage and acquisition

Lead with:

> AI가 자주 틀리는 생활·행정 정보를 공식 출처로 검증합니다.

Initial public coverage should be Korean civic facts that are useful, source-verifiable, and frequently stale:

- passport and resident-ID fees;
- move-in reporting deadlines;
- vehicle-tax payment windows;
- common certificate fees and validity periods;
- public-service eligibility and application windows.

This lane earns trust, search traffic, corrections, and citation usage. It should remain free to read.

### Paid operations lane — separate business page

Business policy and reputation correction should be a separate `/business` offering rather than competing with the homepage hero.

Potential paid value:

- monitoring business hours, refund rules, availability, parking, and service policies;
- alerts when public AI answers conflict with verified business facts;
- structured API or webhook delivery;
- correction workflow and evidence packaging;
- response-time or monitoring SLAs.

Payment may buy monitoring, workflow, distribution, and service levels. It must never buy a verified outcome or suppress contrary evidence.

## 3. Homepage product changes before acquisition

### Required

1. Make the primary CTA a question/search action, not a registry index jump.
2. Keep one secondary CTA: report outdated information or suggest a missing fact.
3. Move API, community, and developer links below the first screen.
4. Show `last checked`, source authority, jurisdiction, and verification state on every featured answer.
5. Display only real production metrics. Static bundle counts must be clearly labelled as seed/demo coverage or replaced with database-backed metrics.
6. Hide the “Most cited by AI” section until real citation telemetry exists. Do not substitute unrelated verified documents under that headline.
7. Remove or rewrite empty-state sections that make the site appear unfinished.
8. Add a compact public status area showing coverage, recent corrections, and known gaps.
9. Resolve the public-civic versus business-policy positioning conflict in copy and navigation.

### Later

- dedicated `/business` page;
- saved watches and alerts;
- public freshness history;
- organization/API plans;
- multilingual expansion after Korean operating quality is stable.

## 4. Content launch gate

Do not run broad promotion with an empty production registry.

Minimum launch inventory:

- 20–30 verified claims in one narrow Korean civic vertical;
- at least two independent or one authoritative primary source per high-impact claim where feasible;
- explicit `valid_until` or freshness profile for time-sensitive claims;
- source snapshot and quote binding for every Task 5 claim;
- no unsupported quote or obvious high-risk miss in the launch set;
- correction/report path tested on each public claim template.

A smaller coherent dataset is preferable to a large mixed registry.

## 5. Operator bootstrap and release sequence

1. Create the first production Supabase Auth user.
2. Insert that user into `admin_users` with the minimum required role; reserve `admin` for account and emergency management.
3. Verify normal Supabase-auth admin access with production break-glass fallback disabled.
4. Seed and verify the initial 20–30 claim set manually.
5. Complete Task 5-E database smoke and merge.
6. Attach a custom domain to `for-ai-e4mm`.
7. Delete or demote the duplicate `for-ai` Vercel project and remove production secrets from it.
8. Run backup and restore drill into staging.
9. Observe Phase 0 automation for 7–14 days.
10. Approve limited Phase 1 only after measurable gates pass.

## 6. Phase 1 operating limits

Phase 1 remains operator-assisted, not hands-off.

Initial limits:

- drafting enabled only after human approval of the phase gate;
- 3–5 draft candidates per week;
- every publication requires an editor action;
- high or unknown risk remains blocked;
- no automatic status downgrade from freshness checks;
- no automated expansion to new jurisdictions or high-risk domains;
- immediate downgrade to Phase 0 on duplicate publication, unsupported quote, budget overshoot, or unexplained worker failure.

## 7. Operating cadence

### Daily — 10 to 15 minutes

- confirm homepage and representative claim/API routes return successfully;
- check notification backlog, dead letters, and failed cron runs;
- inspect new reports, corrections, and critical operator cards;
- confirm Phase and emergency-switch state;
- review deployment and security alerts.

### Two or three times per week — 30 to 60 minutes

- review draft and evidence batches;
- resolve freshness/recheck cards;
- verify new sources and quote bindings;
- publish only normal-risk claims through the assisted publication path;
- record rejected or held drafts with reasons.

### Weekly — 60 minutes

- review coverage added, corrections, stale evidence, unresolved cards, and oldest queue age;
- sample at least five published claims end-to-end;
- inspect search terms and missing-fact submissions;
- publish a short changelog or coverage update;
- choose the next narrow content batch.

### Monthly

- access and admin-role review;
- cost and budget review;
- backup verification;
- custom-domain, DNS, Vercel, and Supabase ownership check;
- RLS/advisor review after schema changes;
- public metrics and positioning review;
- decide whether to hold, expand, or reduce Phase 1 volume.

## 8. Dashboard metrics

### Trust and quality

- verified claims with current evidence;
- evidence overdue rate;
- correction rate and median correction time;
- unsupported quote count;
- high/unknown-risk publication count, target zero;
- open freshness cards and oldest age;
- public reports older than SLA.

### Product use

- successful searches;
- zero-result or missing-fact searches;
- claim detail views;
- source-link clicks;
- report/suggestion conversion;
- repeat visitors and API consumers.

### Operations

- cron success rate;
- notification backlog and DLQ;
- stuck leases;
- admin review throughput;
- cost per verified claim;
- monthly infrastructure and model spend.

Do not optimize page views at the expense of correction quality, source quality, or review discipline.

## 9. Go-live gate

Broad public promotion requires all of the following:

- one canonical Vercel production project;
- custom domain and canonical URL configured;
- first production admin configured and tested;
- at least 20 verified, source-backed claims in one coherent vertical;
- Task 5-E installed and passing smoke;
- notification and freshness jobs stable for at least seven days;
- backup/restore drill completed;
- critical reports and dead letters at zero;
- no unresolved SEV-0 or SEV-1 issue;
- homepage metrics and claims reflect production data rather than placeholder or seed-only counts.

## 10. Immediate next actions

1. Recover and merge the missing Task 5-D scheduler migration file.
2. Complete Task 5-E isolated-database smoke after branch-cost approval.
3. Merge Task 5-E and verify production migration/scheduler behavior.
4. Bootstrap the first administrator.
5. Create the first 20–30 Korean civic claims.
6. Simplify the homepage around the public trust lane.
7. Resolve the duplicate Vercel project and attach a custom domain.
8. Begin a measured Phase 0 operating week before any promotion.
