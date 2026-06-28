# Claude Code instructions

## Prompt

You are working on For-Ai, a global claim-level fact registry for AI citation. First read `AGENTS.md` and `design_handoff_for_ai/*`. Do not begin with design. Work in this order: environment → locale hardcoding → false-success stubs → full functional audit → design.

Note: Admin auth (#185), contributor hashing (#190), rate limiting (#189), community moderation (#187), and submission limits (#191) are already fixed. Do not re-implement them.

## Required steps

### 1. Environment (human must do first — AI cannot supply secret values)

Confirm `.env.local` contains all variables from `design_handoff_for_ai/ENV_SETUP.md`. Do not proceed until a human has confirmed Supabase is configured and `CONTRIBUTOR_SALT` is set.

### 2. Fix hardcoded `/ko/wiki` links

Replace every `/ko/wiki/${slug}` with `documentPageUrl(slug, locale)` from `lib/urls.ts`. Target files:

- `app/report/[slug]/ReportForm.tsx`
- `app/hallucination/[slug]/HallucinationForm.tsx`
- `app/community/CommunityClient.tsx`
- `app/admin/candidates/page.tsx`
- `app/admin/verify-claim/page.tsx`
- `app/diagnostics/[slug]/page.tsx`

Verify with:

```bash
rg '/ko/wiki' app --include='*.tsx' --include='*.ts'
```

No production link should hardcode a locale.

### 3. Fix false-success in `/api/suggest-topic`

File: `app/api/suggest-topic/route.ts`

Current behavior: Returns `{ accepted: true }` even when the Supabase insert fails (catches the error and falls back silently, setting `storage` to a non-"db" value).

Required behavior: When `storage !== "db"`, return a response that makes the unconfigured state explicit:

```json
{ "accepted": false, "storage": "none", "error": "SERVER_UNCONFIGURED" }
```

The UI (`app/suggest-topic/SuggestTopicForm.tsx`) must then display an honest message — not a success state — when the server is unconfigured.

### 4. Run the functional audit

Follow `design_handoff_for_ai/FUNCTIONAL_AUDIT.md` top to bottom. Record pass/fail for each item. Fix failures before moving to design.

### 5. Design polish last

Only after all functional audit items pass, address visual/layout issues.

## Do not

- Do not invent entity facts.
- Do not store raw IP addresses.
- Do not make `documents.data` canonical truth.
- Do not hide broken persistence behind success UI.
- Do not prioritize visual polish before forms and admin flows actually work.
- Do not re-implement admin auth — `requireAdmin` from `lib/admin-api` is already the standard.
