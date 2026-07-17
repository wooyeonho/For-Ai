# Task 5-P1 evidence — designated-operator assisted publication

Date: 2026-07-17

Task 5-P1 installs the only publication path for Task 5 AI drafts. It does not activate Phase 1, enable automatic publication, create a production operator, turn on paid drafting, or deliver notifications. Production remains at Phase 0 with drafting disabled until the separately approved observation gate and first-admin bootstrap are complete.

## Contract delivered

| v7 requirement | Implementation evidence |
| --- | --- |
| Designated human operator | Every edit, review action, and publication RPC requires an active `admin_users` identity with editor-or-higher role. A hash-only break-glass identity cannot publish. |
| One publication boundary | `publish_assisted_claim` is the sole Task 5 AI publication writer. Direct changes to status, confidence, value, publication mode/state, published pointer, or timestamps are trigger-blocked. |
| Current immutable version | The RPC locks the claim, requires the submitted UUID to be the current claim version, verifies the stored text hash, and rejects stale/already-published versions. Operator edits create a new append-only version and deliberately do not copy evidence or risk results. |
| Current normal risk | Publication requires the latest effective deterministic policy and the latest risk row to be `normal` for deterministic, model, and final results. High or unknown fails closed. |
| Revalidated evidence | Required support evidence must point to a successful immutable safe-fetch snapshot stored inline. PostgreSQL re-slices JavaScript UTF-16 offsets, verifies quote and context hashes, and requires a unique quote occurrence. |
| AI provenance | A completed draft attempt with non-empty model provenance, model ID, and provider is mandatory. Public receipts expose safe model/prompt provenance but never provider request IDs. |
| Duplicate review | The operator UI displays deterministic lexical candidates and the RPC requires an explicit duplicate-review acknowledgement. No candidate is auto-merged. |
| Atomic publication | Claim/document verification, published-version pointer, public claim source, verification event, assisted-review ledger, wanted-claim lifecycle, admin audit, and notification intent commit in one transaction. |
| Idempotency | Publication, edits, and review actions use unique idempotency keys. A matching replay returns `changed=false`; a conflicting reuse is rejected. |
| AI-origin transparency | Wiki, document API, cite API, raw Markdown, and `/api/publication-receipts/[slug]` expose permanent `task5_ai` / `assisted_operator` disclosure with policy, evidence, and safe model provenance. |
| No private leakage | Public receipts use an explicit projection. They omit operator identity, private reason text, full source snapshots, recipient identities, provider request IDs, IPs, and user agents. |
| Phase continuity | Phase 1 adds assisted publication on top of demand-driven drafting; the B2 lease and app gate accept only Phase 0 or 1. Later phases require their own explicit migration. |
| Multi-claim safety | P1 refuses to mark a document verified if another claim shares that AI draft document. An all-claims atomic contract is required before that restriction can be relaxed. |

## Operator surface

- `/admin/task5-publication` shows phase/gate state, immutable version and hash, fully separated deterministic/model/final risk, evidence URL and retrieval time, quote/context/hash status, safe model provenance, duplicate candidates, and the append-only review history.
- Publish is unavailable when Phase 1 is not active, the emergency flag is set, or any prerequisite is missing.
- Edit, reject, escalate, refetch, and hold are explicit actions. Only publish changes public claim state.
- The normal production path is Supabase Auth plus `admin_users`. Existing secret authentication remains read-only for this surface and cannot mutate or publish.
- The phase route now passes the authenticated admin identity into the atomic database audit instead of emitting a second anonymous application audit row.

## Database migrations and brownfield recovery

- `supabase/migrations/20260717074727_task5_p1_operator_assisted_publication.sql`
- `supabase/migrations/20260717074909_task5_p1_fk_indexes.sql`
- `supabase/migrations/20260717075545_task5_p1_claim_sources_schema_recovery.sql`

The production `claim_sources` table predated the canonical schema-v3 review fields. The first transaction-rolled-back production drill found this mismatch before any live publication. The additive recovery restores the canonical `source_authority` enum and source review/language fields with conservative defaults. It does not rewrite existing rows or broaden browser privileges.

All three versions are present in production migration history. Post-migration checks confirmed:

- Phase 0, drafting disabled, zero Task 5 AI claims, zero active admins, zero review events, and zero notification intents;
- RLS enabled on all three new private tables;
- zero `anon`, `authenticated`, or `PUBLIC` table privileges on the private P1 tables;
- zero browser execution privileges and service-role execution on all three mutation RPCs;
- all P1 foreign keys covered after the advisor follow-up;
- security advisors report only the intentional RLS-with-no-policy informational notices for P1 private tables, with no new public SECURITY DEFINER warning.

## Verification evidence

Local release gates:

```text
npm run typecheck                 PASS
npm test                          PASS — 211/211
npm run ci:guards                 PASS
npm run lint                      PASS — 0 errors, 34 pre-existing warnings
npm run build                     PASS — 2,494 static pages generated
git diff --check                  PASS
```

An isolated PostgreSQL-compatible engine compiled the P1 migration and verified Phase 0 blocking, Phase 1 publication, idempotent replay, document/claim/wanted state, one source, one verification event, one review event, one outbox row, direct-write blocking, and UTF-16 emoji offsets.

The reproducible production drill is `scripts/sql/task5-p1-rollback-smoke.sql`. It passed with:

```text
phase0_blocked=true
first_changed=true
replay_changed=false
claim_status=verified
claim_mode=assisted_operator
document_status=verified
wanted_status=published
review_events=1
outbox_rows=1
verification_events=1
source_rows=1
utf16_quote="fare 😀 is 1500 won"
```

The final rollback verification returned Phase 0/drafting disabled and zero synthetic Auth users, admins, entities, claims, reviews, and outbox rows.

## Activation and operation

P1 code readiness is not authorization to activate it. Before Phase 1:

1. Complete the Bible v7 observation gate: at least 14 days and 50 operator-reviewed samples with documented precision, harmful-error, evidence, latency, and cost results.
2. The owner chooses the first admin email. Create/invite that private identity in Supabase Auth, enable MFA, and bind exactly that existing UUID to `admin_users`; never commit the email, UUID, password, or token.
3. Configure provider credentials and bounded provider budgets, then enable drafting separately. `TASK5_EMERGENCY_DISABLE=1` remains a deny-only containment switch.
4. Raise the DB phase through the audited admin route only after explicit approval. Do not update `task5_settings` directly.
5. Work the queue oldest first; compare the exact quote and context against the retrieved source; confirm risk, version, policy, duplicate review, and public-safe reason before publishing.
6. After each publication, verify the wiki disclosure and receipt/document/cite/raw APIs. Task 5-D must deliver pending outbox rows; until then, monitor the queue manually.

## Rollback and limits

- Code rollback: redeploy the previous Vercel main SHA. Keep additive database structures and immutable ledgers.
- Operational containment: set `TASK5_EMERGENCY_DISABLE=1`, set `draft_enabled=false`, and downgrade the DB phase immediately through the audited route.
- Incorrect public facts use the Task 5-F quarantine/correction workflow; do not delete publication evidence.
- P1 creates durable notification intent but does not send email or push notifications. Delivery/retry/dead-letter behavior belongs to Task 5-D.
- The repository still has broader pre-existing schema drift tracked separately. P1 recovered only the `claim_sources` fields required by the publication and verification contract.
