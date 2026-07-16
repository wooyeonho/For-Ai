# Task 5 — Existing Code Map

**Written against:** `origin/main` @ `b814bc3a6b55fa64795827d8143207317fc43936`
**Purpose:** Bible v7 Book V §1 required brownfield inventory, written before any Task 5-0 code change. Every existing artifact relevant to Task 5 is classified `KEEP` / `HARDEN` / `WRAP` / `MIGRATE` / `DEPRECATE` / `REMOVE` per Book IV §0.2.

## 1. Search commands run

```bash
grep -RIn "claim_versions|claim_evidence|source_snapshot|risk_assessment|publication_state|wanted_claim|notification_outbox|safeFetchExternalSource|CRON_SECRET|SKIP LOCKED" app lib scripts schema-v3.sql supabase
```

**Result: zero matches in application/schema code.** These concepts do not exist anywhere yet except as prose in the Bible document itself and prior review docs. Task 5-0 is additive against a codebase that has no naming or semantic collision to resolve — but it must integrate cleanly with several *adjacent* systems inventoried below.

## 2. Claim create/edit/status — `claims` table and writers

**Schema (`schema-v3.sql:78-117`):**
```sql
create table claims (
  id text primary key,                    -- TEXT, not uuid. All new Task 5 tables that
                                            -- FK to claims must use `claim_id text`.
  document_id text not null references documents(id) on delete cascade,
  entity_id text not null references entities(id) on delete restrict,
  field_path text not null,
  claim_text text not null,
  claim_value text not null,
  ...
  status claim_status not null default 'needs_review',  -- enum: needs_review, verified, disputed, unknown
  ...
);
```
No `risk_class` column exists today (so the Bible's "claim_versions에서 risk_class를 제거" instruction is trivially satisfied — there is nothing to remove; the instruction is a guard against a future PR ever adding one to `claim_versions`).
No `content_origin`, `publication_state`, or AI-provenance marker exists on `claims` or `documents` today.

**Writers:** `app/api/admin/verify-claim/route.ts` — the only claim-status/verified-writer path today. Direct `UPDATE claims SET status = ...` via `supabaseAdmin` (service role), gated by `requireAdmin`. Also writes `contribution_events`, awards gamification points, calls `revalidatePath` (added in Task 3) to invalidate the document page + OG/Twitter image paths.

**Classification: `KEEP`.** This is the legacy admin flow the Bible explicitly protects ("기존 admin flow를 제거하지 마라"). Task 5-0 adds a *new* boundary that applies only to `task5_ai`-origin claims; this route continues to serve `legacy_manual` claims unchanged, indefinitely, until a much later migration PR (out of Task 5-0 scope).

## 3. Admin publication

Same route as above (`app/api/admin/verify-claim/route.ts`) is also the only "publication" surface — setting `documents.status` to `'published'`/`'verified'` is what the existing RLS policies gate public visibility on (see §9 below). There is no separate "publish" action distinct from "set status."

**Classification: `KEEP`** (Task 5-P1 will add `publish_assisted_claim`, an entirely new RPC scoped to `task5_ai` claims only — it does not touch this route).

## 4. Verification events

**Schema (`schema-v3.sql:231-242`):**
```sql
create table verification_events (
  id uuid primary key default gen_random_uuid(),
  claim_id text not null references claims(id) on delete cascade,
  event_type verification_event_type not null,  -- created, reviewed, source_added, source_removed,
                                                   -- source_verified, status_changed, confidence_changed
  previous_status claim_status,
  new_status claim_status,
  previous_confidence confidence_level,
  new_confidence confidence_level,
  note text,
  contributor_hash text,
  created_at timestamptz not null default now()
);
```
This is the append-only event stream Task 4's `get_claim_status_transition_events()` RPC (migration `20260716082314_claim_status_transition_events.sql`) already reads with a `LAG()` window function. Task 5-0's `risk_assessments` table is a **separate, new, append-only table** — it does not touch or extend `verification_events`. Task 5-P1's `publish_assisted_claim` will insert a `verification_events` row in the same transaction as its `claim_versions`/`risk_assessments` writes, exactly like the legacy admin route already does.

**Classification: `KEEP`.**

## 5. Citation status

`lib/citation-status.ts` computes `getDocumentCitationStatus()`/`getClaimCitationStatus()` from `claims.status` + `claim_sources` + freshness TTL. `lib/citation-presentation.ts` maps the closed `ClaimStatus` enum to `{machineLabel, labelKey, color}` — reused unchanged by badge (Task 2), OG images (Task 3), and RSS/changelog (Task 4).

**Classification: `KEEP`.** Task 5 must not introduce a parallel status vocabulary. `risk_assessments.final_result` (`unknown`/`normal`/`high`) is a **distinct axis** (publication risk, not citation trust) and must never be conflated with `ClaimStatus`.

## 6. Source fetch / policy

- `scripts/jobs/check-source-health.mjs`: raw, unguarded `fetch(url, {method:"HEAD", redirect:"follow"})` against **already-curated** `claim_sources.url` values (admin-only cron script, not part of the Next.js app runtime). No SSRF protection (no private-IP block, no redirect cap, no MIME/size check).
- No other external-URL fetch exists in `lib/` or `app/api/` today (`lib/ai-providers.ts`, `lib/admin-client.ts`, `lib/webhooks.ts` all call fixed, operator-configured AI-provider/webhook endpoints — not arbitrary external URLs discovered at runtime).

**Classification: `HARDEN` (deferred to Task 5-B1/5-E, not touched in Task 5-0).** `check-source-health.mjs`'s threat model (re-checking known, admin-curated URLs) is materially different from Task 5-B1's `safeFetchExternalSource` threat model (fetching URLs an AI/search step discovered at runtime, i.e. untrusted input). Task 5-B1 must NOT reuse this script's fetch call as-is. Whether to eventually route `check-source-health.mjs` through `safeFetchExternalSource` too is a Task 5-E decision (source-check unification), out of scope here.

## 7. Search/discovery

`lib/registry-index.ts` — dual-source (static bundle + Supabase) registry index, reused unchanged by sitemap/llms.txt/search. Task 5-A's `wanted_claims` intake is a new, separate table; it does not extend `registry-index.ts`.

`app/suggest-topic/{page,SuggestTopicForm}.tsx` + `app/api/suggest-topic/route.ts` — existing authenticated-optional user "suggest a topic" intake, writing to `topic_suggestions`. This is the closest existing analog to Task 5-A's "explicit authenticated suggestion opens immediately" signal.

**Classification: `KEEP`, informs Task 5-A design** (not wrapped or modified — `wanted_claims`/`wanted_claim_demand_signals` are new tables with their own promotion logic; `topic_suggestions` continues to serve its existing document-authoring intake purpose).

## 8. AI candidate generation (closest existing analog to Task 5-B2)

This is the most important adjacent system for Task 5-B2 to understand and NOT collide with:

- **`topic_candidates`** (`schema-v3.sql:362-397`): whole-document AI-generated candidates with `source='ai_generated'`, `generation_model`, `consensus_score`/`consensus_level`/`agreed_providers` (multi-provider AI consensus — see `lib/consensus.ts`, `lib/ai-providers.ts`), a `claims jsonb` blob (not versioned/evidenced individual claim rows), reviewed via `status` (`new`→`reviewing`→`approved`/`rejected`→`promoted`).
- **`candidate_generation_runs`** (`schema-v3.sql:412-437`): per-run telemetry — `estimated_cost_usd`, `providers_used`, `provider_results jsonb`, `saved_count`/`accepted_count`/`promoted_count`. This is the existing cost/telemetry pattern Task 5-B2's `cost_ledger`/`task5_runs` tables should follow stylistically (reserved vs. actual, per-provider breakdown), even though the schemas are not shared.
- **`topic_candidate_claim_links`**: duplicate/translation-claim review linking.
- Driven by `app/api/admin/generate-candidates/route.ts` (admin-triggered, not cron-triggered).

**Classification: `KEEP` — explicitly NOT reused or extended by Task 5.** This system operates at the whole-document level with an unversioned `claims jsonb` blob and no per-quote evidence binding; it is the admin's manual/semi-automated document-authoring tool and remains the correct path for that workflow. Task 5's `claim_versions`/`claim_evidence`/`risk_assessments` model is a stricter, per-claim, quote-evidenced, version-controlled pipeline specifically for the new *unattended* demand→draft→published flow (Book IV Task 5-B2, cron-driven, `SKIP LOCKED` leasing, no human triggering each run). The two systems will coexist. Task 5 tables and RPCs must use distinct names from anything in this section to avoid confusion (already verified: no name collision in the §1 grep).

## 9. RLS / GRANT model

**Documented intent** (`schema-v3.sql:315-318` comment, verbatim):
> "Core registry RLS: the public site reads these tables with the anon key, so grant READ-only access scoped to human-approved content. All writes flow through service-role API routes (service role bypasses RLS). Without this, anon could INSERT/UPDATE/DELETE documents and claims directly."

**Policies that exist today:**
- `entities`, `documents`, `claims`, `claim_sources`, `verification_events`, `listings`: anon `SELECT`-only, gated on `documents.status in ('published', 'verified')`.
- `edits`, `reports`, `hallucination_reports`: anon `INSERT`-only (`with check (status = 'new')`), no `SELECT` policy.
- `admin_users`, `admin_audit_events`: no public policy at all (service-role only).

**Finding carried forward from Task 4 (already reported in #469, restated here for Task 5 awareness):** despite the RLS-only-reads *intent* documented above, `anon` currently holds raw table-level `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` GRANTs on `claims`/`documents`/`verification_events` (RLS's default-deny neutralizes `INSERT`/`UPDATE`/`DELETE` since no policy permits them, but `TRUNCATE` is not subject to RLS at all in PostgreSQL). Every new Task 5 table/RPC in this PR is designed independently with its own minimal GRANT — it does not inherit or rely on this pre-existing over-grant, and the over-grant does not block Task 5-0.

**Classification: `HARDEN` (pre-existing gap, separate PR, not Task 5-0 scope).**

## 10. AI-generated field / provenance

No `documents` or `claims` column marks AI origin today. `topic_candidates.source = 'ai_generated'` (§8) is the only existing AI-provenance marker, and it lives on a different, whole-document table. Task 5-0 introduces `documents.content_origin` (`legacy_manual` | `task5_ai`, additive column) as the first claim/document-level AI-provenance marker, satisfying Book I's "AI-generated content는 AI provenance를 영구 표시한다" constitutional requirement for the new pipeline.

## 11. Notifications

`watch_subscriptions` (`schema-v3.sql`) is an existing contributor-facing "watch this claim for staleness, get a gamification mission" table — a different concept from Task 5-D's `notification_outbox` (operator/reviewer transactional notifications for the assisted-publication workflow: draft ready, report received, escalation).

**Classification: `KEEP`, not touched.** `notification_outbox`/`notifications` (Task 5-D, later PR) are new, additive tables.

## 12. Cron

No `CRON_SECRET` usage exists anywhere in the codebase today (confirmed via grep). `scripts/jobs/*.mjs` are plain CLI scripts invoked by an external scheduler/operator, with no HTTP endpoint and no shared-secret authentication layer. Task 5-B2 is the first consumer of `CRON_SECRET` as an HTTP-endpoint auth mechanism (if cron moves to HTTP-triggered) or as an external-runner secret (if cron stays CLI-triggered) — this decision belongs to Task 5-B2, not Task 5-0.

## 13. Analytics / audit

`admin_audit_events` (schema-v3.sql:278-289) is the existing admin audit trail — hash-only actor identity, `check` constraint forbidding raw IP/user-agent metadata keys. This is the exact pattern Task 5-P1's `publish_assisted_claim` audit write and Task 5-F's quarantine/restore/withdraw audit writes should follow (reuse `admin_audit_events`, do not create a parallel audit table).

**Classification: `KEEP`, reused by later Task 5 PRs.**

## 14. Cache invalidation

`revalidatePath` pattern established in `app/api/admin/verify-claim/route.ts` (added in Task 3): on any status-changing write, invalidates `/{locale}/wiki/{slug}`, `/{locale}/wiki/{slug}/opengraph-image`, `/{locale}/wiki/{slug}/twitter-image` for all 7 locales. Task 5-P1's `publish_assisted_claim` and Task 5-F's quarantine/restore RPCs must invalidate the same path set on any publication-affecting write.

**Classification: `KEEP`, reused by later Task 5 PRs.**

## 15. Current schema/migration tooling

`schema-v3.sql` is the DB schema SSOT (1146 lines, no Task 5 content yet). `supabase/migrations/*.sql` (29 files, `YYYYMMDD_description.sql` naming, with full timestamps for same-day-multiple-migration disambiguation — Task 5-0 follows this convention). `scripts/check-schema-types.mjs` cross-checks `schema-v3.sql` enum/check values against `lib/types.ts` unions — any new Task 5 enum/check constraint must be mirrored there or the guard fails CI.

## 16. Summary table

| Area | Existing artifact | Classification |
|---|---|---|
| Claim writes | `app/api/admin/verify-claim/route.ts` | KEEP |
| Verification events | `verification_events` table | KEEP |
| Citation status | `lib/citation-status.ts`, `lib/citation-presentation.ts` | KEEP |
| Source fetch (curated) | `scripts/jobs/check-source-health.mjs` | HARDEN (deferred, Task 5-B1/5-E) |
| Search/discovery | `lib/registry-index.ts` | KEEP |
| User suggestion intake | `app/suggest-topic/*`, `topic_suggestions` | KEEP (informs Task 5-A) |
| AI document generation | `topic_candidates`, `candidate_generation_runs` | KEEP, not reused (different layer) |
| RLS/GRANT | anon SELECT-only policies + over-broad table GRANTs | HARDEN (deferred, separate PR) |
| AI provenance | none exists | NEW (Task 5-0 adds `content_origin`) |
| Notifications | `watch_subscriptions` | KEEP, not touched |
| Cron auth | none exists | NEW (Task 5-B2) |
| Audit trail | `admin_audit_events` | KEEP, reused |
| Cache invalidation | `revalidatePath` in verify-claim route | KEEP, reused |

No existing artifact requires `WRAP`, `MIGRATE`, or `REMOVE` for Task 5-0 specifically — this PR is purely additive.
