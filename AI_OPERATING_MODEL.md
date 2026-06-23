# GYEOL AI Operating Model

This document defines how to operate LazyCodex, Claude, and Devin on the GYEOL repository without drifting away from the product identity or MVP constraints.

## Core conclusion

Use multiple AI tools, but keep their roles separate:

- **LazyCodex**: continuously running implementation worker for small, bounded technical tasks.
- **Claude**: strategy, product, investor, architecture, AI-crawler, RAG, and trust-policy reviewer.
- **Devin**: final repository cleanup, integration, test hardening, deployment readiness, and commit-ready preparation.

The most important operating rule is:

> Do not run LazyCodex with broad goals. Use small scope, explicit completion criteria, and lint/build verification.

## Non-negotiable GYEOL guardrails

Repeat these rules in prompts for every AI tool:

```text
GYEOL is not an AI wiki.
GYEOL is a local fact registry for AI, search engines, and humans.

schema-v3.sql is the source of truth.
Do not invent a different database model.

The canonical structure is:
entities -> documents -> claims -> claim_sources -> verification_events.

documents.data is rendering convenience only.
documents.data is not the canonical source of factual truth.

Do not invent facts.
Unknown facts must remain "확인 필요" with low confidence.
Do not upgrade confidence unless there is an explicit source.

Static-first rendering is mandatory.
Core document content must be readable from raw HTML without client-side JavaScript.

Do not add payment, user accounts, complex auth, or large admin systems in the MVP.
```

## Tool roles

### LazyCodex

Use LazyCodex for repeatable implementation work:

- Small bug fixes.
- Korean mojibake and encoding fixes.
- Route mismatch fixes.
- Lint/build error fixes.
- AI-readiness improvements.
- JSON API, raw markdown, and JSON-LD consistency.
- Plan-based execution.

LazyCodex workflow:

```text
plan -> execute -> verify
```

Initial terminal setup:

```bash
npm run ai:lazycodex:install
npm run ai:lazycodex:doctor
```

Then initialize repository context inside Codex:

```text
$init-deep
```

Start by asking for a plan only:

```text
$ulw-plan "Review this repository as an AI-readable local fact registry. Create a prioritized implementation plan to fix P0 issues first: Korean encoding/mojibake, machine-readable route mismatches, static-first rendering gaps, and claim/source trust consistency. Do not edit code yet. Write the plan clearly with acceptance criteria."
```

After reviewing the plan, execute it:

```text
$start-work
```

Or execute a named plan:

```text
$start-work <plan-name>
```

### Claude

Use Claude for big-picture review rather than direct implementation:

- Product direction review.
- Investor-perspective evaluation.
- Architecture review.
- AI crawler and RAG readiness review.
- Data trust policy design.
- MVP prioritization.

Recommended Claude prompt:

```text
You are reviewing GYEOL as a Silicon Valley product strategist, senior infrastructure engineer, and seed-stage investor.

GYEOL is a local fact registry for AI, search engines, and humans. It is not an AI wiki. Its canonical model is entities -> documents -> claims -> claim_sources -> verification_events. Static-first rendering is mandatory. Unknown facts must show "확인 필요" with low confidence.

Review:
1. Is this a real AI-era product opportunity?
2. What is the narrowest wedge market?
3. What should the MVP prove in 30 days?
4. What would make this investable?
5. What should not be built yet?
6. What data-quality rules are missing?
7. What should Devin clean up later?

Be brutally honest. Do not propose user accounts, payments, or complex admin systems for MVP.
```

### Devin

Use Devin after multiple LazyCodex and Claude passes, when the repository needs integration cleanup:

- Consolidate changes made by multiple AI tools.
- Remove stale docs.
- Add or strengthen tests.
- Prepare deployment.
- Audit overall repository quality.
- Produce a commit-ready state.

Recommended Devin prompt:

```text
Audit and clean up this repository after multiple AI-assisted development passes.

Goals:
1. Preserve the product identity:
   - GYEOL is not an AI wiki.
   - GYEOL is a local fact registry for AI, search engines, and humans.
   - schema-v3.sql is the source of truth.
   - Do not invent a new database model.
   - Keep canonical structure: entities -> documents -> claims -> claim_sources -> verification_events.

2. Clean up implementation drift:
   - Remove route mismatches.
   - Fix stale docs.
   - Ensure machine-readable outputs match actual routes.
   - Ensure unknown facts show "확인 필요" and low confidence.
   - Ensure no fake facts were introduced.
   - Ensure public submissions do not store raw IP addresses.

3. Production readiness:
   - Run lint/build/tests.
   - Add missing smoke tests if needed.
   - Check static-first rendering for core registry pages.
   - Verify JSON API and raw markdown outputs.
   - Update deployment checklist.

4. Deliverables:
   - Summary of changed files.
   - Risk notes.
   - Remaining TODOs.
   - Final commit-ready state.
```


## Repository prompt kit

Reusable prompts are checked into `ai-ops/` so each tool can be started from a stable file instead of copying from chat history:

- `ai-ops/lazycodex/master-plan.txt` — first LazyCodex stabilization plan.
- `ai-ops/lazycodex/p0-stabilization.txt` — P0 LazyCodex planning and loops.
- `ai-ops/lazycodex/ai-readiness.txt` — AI-readiness LazyCodex loop.
- `ai-ops/claude/product-review.txt` — Claude product and investor review.
- `ai-ops/claude/source-trust-policy.txt` — Claude trust-policy design.
- `ai-ops/devin/final-cleanup.txt` — Devin final cleanup prompt.

Print any prompt with:

```bash
npm run ai:prompt -- lazycodex:master
npm run ai:prompt -- lazycodex:p0
npm run ai:prompt -- lazycodex:ai-readiness
npm run ai:prompt -- claude:product-review
npm run ai:prompt -- claude:source-trust
npm run ai:prompt -- devin:final-cleanup
```


## Four-hour LazyCodex session protocol

LazyCodex can run for a long session, but GYEOL should still treat that session as a bounded stabilization window, not an open-ended product rewrite. Use the checked-in prompt below when you want a longer run:

```bash
npm run ai:prompt -- lazycodex:four-hour
```

During a four-hour run, keep the scope limited to P0 stabilization and AI-readiness: mojibake, route mismatches, static-first readability, JSON API/raw Markdown/JSON-LD consistency, sitemap/robots/llms.txt discoverability, and small regression checks. The run must not invent facts, change the schema model, add accounts/payments/auth/chatbot scope, or upgrade confidence without explicit sources.

The required end-of-session checks are:

```bash
npm run check:mojibake
npm run lint
npm run build
node scripts/smoke-test-routes.mjs http://localhost:3000
```

After LazyCodex creates a patch, a human reviewer must inspect these files before merge because they define the AI/search discovery surface and static-first registry output:

- `app/sitemap.ts`
- `app/llms.txt/route.ts`
- `app/raw/[...path]/route.ts`
- `app/diagnostics/[slug]/page.tsx`
- `app/ko/wiki/[slug]/page.tsx`
- `app/[locale]/wiki/[slug]/page.tsx`
- `lib/supabase-documents.ts`

The reviewer must run these commands after the patch:

```bash
npm run lint
npm run build
npm run ci:guards
```

If the patch adds a discovery-check script, also run `npm run ai:discovery-check`.

After deployment, verify the real production URLs for both one `verified` document and one `needs_review` document:

- `/sitemap.xml`
- `/llms.txt`
- `/ko/wiki/{new-slug}`
- `/api/documents/{new-slug}`
- `/raw/{new-slug}.md`
- `/diagnostics/{new-slug}`

## LazyCodex task patterns

Good bounded prompts:

```text
$ulw-loop "Fix all Korean mojibake/encoding issues in visible UI strings. Run lint and build. Stop only when both pass. Do not change product scope or data model."
```

```text
$ulw-loop "Fix machine-readable route mismatches so diagnostics, UI links, API URLs, and raw markdown URLs all point to actual implemented routes. Run lint and build. Stop only when both pass."
```

```text
$ulw-loop "Improve static-first behavior for core registry pages without changing the schema or inventing a new data model. Preserve claim-level structure. Run lint and build."
```

Avoid broad prompts such as:

```text
$ulw-loop "Make this startup successful"
$ulw-loop "Make everything production ready"
$ulw-loop "Improve the whole repo"
```

## Recommended phases

### Phase 1 — P0 quality stabilization

Plan first:

```text
$ulw-plan "Create a P0 stabilization plan for GYEOL. Focus only on Korean mojibake, route mismatch, static-first gaps, lint/build stability, and preserving schema-v3 claim-level model. Do not edit code."
```

Then execute with one small loop at a time:

```text
$ulw-loop "Fix Korean mojibake in visible UI/SEO/diagnostics strings. Run lint and build. Stop when both pass."
```

```text
$ulw-loop "Fix machine-readable route mismatches across diagnostics, SEO helpers, UI links, API URLs, and raw markdown URLs. Run lint and build."
```

### Phase 2 — AI-readiness

LazyCodex implementation loop:

```text
$ulw-loop "Improve AI-readiness outputs for registry documents: JSON API, raw markdown, JSON-LD, sitemap, diagnostics. Do not change schema-v3. Ensure all links are consistent and all unknown facts remain low confidence."
```

Claude review prompt:

```text
Review whether GYEOL's machine-readable outputs are sufficient for AI crawlers, RAG systems, and search engines. Identify missing metadata, trust signals, and citation requirements.
```

### Phase 3 — data trust policy

Ask Claude for policy first:

```text
Design a source trust policy for GYEOL. Distinguish official, law, regulator, platform, news, user-submitted, phone-confirmed, and unknown sources. Define when a claim can be high, medium, or low confidence.
```

Then ask LazyCodex for an implementation plan:

```text
$ulw-plan "Implement the source trust policy in the existing GYEOL codebase without changing schema-v3 unless absolutely necessary. Identify required type updates, validation helpers, and UI labels."
```

### Phase 4 — Devin cleanup

```text
Clean up this repository after LazyCodex and Claude passes. Preserve GYEOL's product identity and schema-v3. Ensure lint/build pass, docs match implementation, machine-readable routes are correct, and no fake facts or raw IP storage were introduced.
```

## Branching model

Use one branch per AI workstream so changes are traceable and easy to roll back:

```bash
git checkout -b lazycodex/p0-stabilization
```

```bash
git checkout -b claude/product-review-followups
```

```bash
git checkout -b devin/final-cleanup
```

## MVP anti-scope list

Do not build these during the MVP:

- Login.
- Payments.
- Complex admin systems.
- Large CMS features.
- Community features.
- Social features.
- AI chatbot UI.
- Large auth systems.
- Advertising systems.

The priority is proving that GYEOL can be a reliable claim-level fact registry.

## Master LazyCodex planning prompt

```text
$ulw-plan "You are improving GYEOL, a local fact registry for AI, search engines, and humans. GYEOL is not an AI wiki.

Non-negotiable rules:
- Static-first rendering is mandatory.
- Core document content must be readable from raw HTML without client-side JavaScript.
- schema-v3.sql is the source of truth.
- Do not invent a different database model.
- entity_id is mandatory from MVP.
- English slug is stable.
- Display titles are language-specific.
- GYEOL is claim-level.
- Canonical structure: entities -> documents -> claims -> claim_sources -> verification_events.
- documents.data is rendering convenience only.
- No fake facts.
- Unknown facts must show '확인 필요' and confidence low.
- Do not add payments, user accounts, complex auth, or large admin systems in MVP.

Task:
Create a prioritized technical stabilization plan for this repo.
Focus on:
1. Korean mojibake/encoding issues.
2. Machine-readable route mismatches.
3. Static-first rendering gaps.
4. JSON API/raw markdown/JSON-LD consistency.
5. Claim/source trust consistency.
6. Lint/build stability.
7. Minimal tests or smoke checks.

Do not edit code yet.
Write acceptance criteria for each item."
```
