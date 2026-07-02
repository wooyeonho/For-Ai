# Technical Audit Master Report

## Implementation Work Packages

### 1. Weighted consensus

**File scope**

- `lib/consensus.ts`
- `lib/ai-providers.ts`
- `app/api/admin/generate-candidates/route.ts`
- New Supabase migration for `ai_provider_performance`

**Acceptance criteria**

- Candidate generation computes consensus from provider-specific weights instead of treating every provider response equally.
- Provider performance is persisted in the new `ai_provider_performance` table with enough fields to audit model/provider reliability over time.
- Consensus output preserves For-Ai's no-fake-facts rule: unsupported or conflicting facts remain low-confidence and marked as needing verification.
- Admin candidate generation exposes enough diagnostic metadata for reviewers to understand which providers supported, contradicted, or omitted each claim.
- Existing candidate-generation behavior remains backward compatible when no provider performance history exists.

### 2. Search scaling

**File scope**

- `app/api/search/route.ts`
- `schema-v3.sql`
- New Supabase migration for search indexes and/or search helper functions

**Acceptance criteria**

- Search queries use database-backed indexes or RPC helpers rather than unbounded in-memory scans for production data paths.
- Search returns stable, paginated results with deterministic ordering for identical relevance scores.
- Search respects the canonical entity/document/claim structure and does not promote `documents.data` into the source of factual truth.
- The schema source of truth and the migration are kept aligned for any new search index, generated column, or helper function.
- Search remains safe for public read access while preserving protected write policies for edits, reports, and hallucination reports.

### 3. Trending aggregation

**File scope**

- `app/api/trending/route.ts`
- New Supabase migration for an RPC function and/or materialized view supporting trending aggregation

**Acceptance criteria**

- Trending results are served from a bounded aggregation path such as an RPC function or materialized view, not repeated full-table scans.
- Aggregation windows and ranking rules are explicit, documented in the migration, and deterministic for equal scores.
- Public trending output contains only safe public fields and never exposes raw IP addresses or private submission metadata.
- The route has a graceful fallback for empty or unavailable aggregation data.
- Refresh or recomputation behavior is documented so operators know how trending data becomes current.

### 4. Public post hardening

**File scope**

- `app/api/posts/route.ts`
- `lib/rate-limit.ts`
- `lib/submission-limits.ts`

**Acceptance criteria**

- Public post submission applies shared rate-limit and submission-limit controls before writing any user-provided content.
- Limits use privacy-preserving identifiers such as `contributor_hash`; raw IP addresses are never stored.
- Validation rejects oversized, malformed, or spam-like payloads with clear non-sensitive error responses.
- Public submissions continue not to require login, while protected write surfaces remain inaccessible to anonymous public reads where required.
- Tests or documented checks cover normal submission, limit exceeded, invalid payload, and privacy-preserving identifier behavior.

### 5. Admin UX gate

**File scope**

- `app/admin/page.tsx`
- `app/admin/AdminSecretProvider.tsx`

**Acceptance criteria**

- Admin-only controls render only after the admin secret gate has been satisfied.
- The default unauthenticated admin page state does not expose privileged actions, secrets, or protected operational data in static HTML.
- Gate state is handled consistently across admin child components through `AdminSecretProvider`.
- Failed or missing secret states provide actionable UX without leaking whether a specific secret value is valid.
- The implementation preserves static-first public content elsewhere and does not weaken API-side authorization checks.
