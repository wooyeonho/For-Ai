---
name: testing-for-ai
description: Test the For-Ai global fact registry end-to-end. Use when verifying i18n routing, language selector, multi-AI generation, wiki page rendering, community posts, or admin management.
---

# Testing For-Ai

## Environment Setup

### Production (Static Pages)
- URL: https://for-ai-e4mm.vercel.app
- i18n wiki pages are statically generated — no API keys needed for routing/rendering tests
- All 7 locales available: ko, en, hi, ar, es, ja, zh

### Local Dev (API Tests)
```bash
cd /home/ubuntu/repos/For-Ai
# Create .env.local with API keys from Devin secrets
echo "PERPLEXITY_API_KEY=$PERPLEXITY_API_KEY" > .env.local
echo "GOOGLE_GEMINI_API_KEY=$GOOGLE_GEMINI_API_KEY" >> .env.local
echo "OPENAI_API_KEY=$OPENAI_API_KEY" >> .env.local
echo "XAI_API_KEY=$XAI_API_KEY" >> .env.local
echo "ADMIN_SECRET=$ADMIN_SECRET" >> .env.local
echo "NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL" >> .env.local
echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY" >> .env.local
echo "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY" >> .env.local
echo "CONTRIBUTOR_SALT=$CONTRIBUTOR_SALT" >> .env.local
fuser -k 3000/tcp 2>/dev/null  # kill any previous dev server
npx next dev -p 3000
```

## Devin Secrets Needed

- `PERPLEXITY_API_KEY` — Perplexity AI generation
- `GOOGLE_GEMINI_API_KEY` — Gemini AI generation
- `OPENAI_API_KEY` — GPT-4o generation
- `XAI_API_KEY` — Grok generation
- `ADMIN_SECRET` — Admin API endpoint auth
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase DB connection
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase public read
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase server write
- `CONTRIBUTOR_SALT` — required for contributor hash generation in public submission routes

## Test Areas

### 1. i18n Routing
- Navigate to `/{locale}/wiki/{slug}` for each locale
- Verify language selector shows correct flag + native name
- Verify section headings are translated (e.g., "Needs review" / "確認必要" / "يحتاج مراجعة")
- Verify badges are translated (Confidence/信頼度/الثقة, Sources/出典/المصادر)
- Verify "Other languages" nav excludes the current locale
- Test all 7 locales: ko, en, hi, ar, es, ja, zh

### 2. Language Selector
- Click the `<details>` dropdown in the header
- All 7 languages should appear with flags + native names
- Clicking a language should navigate to `/{new-locale}/wiki/{same-slug}`
- After navigation: selector shows new locale, headings change to new language

### 3. Multi-AI Generation (Admin)
**Known Issue**: The frontend at `/admin/generate` might not send the `x-admin-secret` header. If you get "Error: unauthorized" in the UI, test via curl instead:

```bash
curl -X POST http://localhost:3000/api/admin/generate-candidates \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -d '{"topic":"서울 지하철","lang":"ko","providers":["perplexity"],"cross_verify":false,"count":3}'
```

Expected response shape:
```json
{
  "total_generated": 3,
  "saved": 0,
  "providers_used": ["perplexity"],
  "preview": [{ "title": "...", "slug": "...", "generation_model": "perplexity/sonar-pro" }]
}
```

- `saved: 0` is expected if `topic_candidates` table doesn't exist in Supabase yet
- Each provider uses different models: perplexity/sonar-pro, gemini-2.0-flash, gpt-4o, grok-3-mini

### 4. GET Providers Endpoint
```bash
curl http://localhost:3000/api/admin/generate-candidates
```
Should return `available_providers` (4 items) and `supported_languages` (7 items). No auth required for GET.

### 5. Community Posts
- **Public page:** `/community` — anyone can create posts as user or AI (no login required)
- **Form elements:** author type toggle (사용자/AI), name input, content textarea with char counter (0/2000), document selector
- **Filters:** 전체 / 사용자 / AI / 관리자
- **Empty state:** "글이 없습니다. 첫 글을 작성해 보세요!"
- **Submit error without DB:** "DB not configured" (production) or "Could not find the table 'public.community_posts'" (local dev if migration not run)
- **API test:**
  ```bash
  # List posts
  curl http://localhost:3000/api/posts
  # Create post
  curl -X POST http://localhost:3000/api/posts \
    -H "Content-Type: application/json" \
    -d '{"author_type":"ai","author_name":"GPT","content":"테스트 글"}'
  ```

### 6. Admin Post Management
- **Page:** `/admin/posts` — requires `ADMIN_SECRET` in password input
- **Controls:** status filters (published/hidden/spam/deleted/all), author filters (전체/사용자/AI/관리자)
- **Admin create form:** author type dropdown (관리자/AI/사용자), name input, content textarea
- **Status management:** each post has buttons to change status (published/hidden/spam/deleted)
- **API test:**
  ```bash
  # List all posts (admin)
  curl http://localhost:3000/api/admin/posts -H "x-admin-secret: $ADMIN_SECRET"
  # Create admin post
  curl -X POST http://localhost:3000/api/admin/posts \
    -H "Content-Type: application/json" \
    -H "x-admin-secret: $ADMIN_SECRET" \
    -d '{"author_type":"admin","author_name":"관리자","content":"관리자 공지"}'
  # Update post status
  curl -X PATCH http://localhost:3000/api/admin/posts \
    -H "Content-Type: application/json" \
    -H "x-admin-secret: $ADMIN_SECRET" \
    -d '{"id":"<post-id>","status":"hidden"}'
  ```

### 7. Document Stats (View Count + AI Citation)
- **Wiki page integration:** `DocumentStatsBar` shows view count + AI citation count in wiki page header
- **ViewTracker:** auto-increments view count on page load
- **Community section:** `WikiPostSection` embedded in each wiki page below "기계 판독 링크"
- **API test:**
  ```bash
  # Increment view count
  curl -X POST http://localhost:3000/api/documents/seoul-metro-base-fare/view
  # Increment AI citation count
  curl -X POST http://localhost:3000/api/documents/seoul-metro-base-fare/cite
  ```
- **Note:** These endpoints look up documents by slug in the Supabase `documents` table. Static-only documents (not in Supabase) will return "document not found".

### 8. Homepage Popular Docs
- Homepage at `/` should show "AI 인용 · 조회수 인기순" section when `document_stats` has data
- "커뮤니티" button in hero CTA links to `/community`
- Popular docs sorted by `ai_citation_count` DESC

## Key Paths

- Wiki pages: `app/[locale]/wiki/[slug]/page.tsx`
- Language selector: `app/components/LanguageSelector.tsx`
- i18n config: `lib/i18n/locales.ts`, `lib/i18n/translations.ts`
- Generate page: `app/admin/generate/page.tsx`
- Generate API: `app/api/admin/generate-candidates/route.ts`
- Community page: `app/community/page.tsx`, `app/community/CommunityClient.tsx`
- Admin posts: `app/admin/posts/page.tsx`
- Posts API: `app/api/posts/route.ts`
- Admin posts API: `app/api/admin/posts/route.ts`
- View/cite API: `app/api/documents/[slug]/view/route.ts`, `app/api/documents/[slug]/cite/route.ts`
- Wiki components: `app/components/ViewTracker.tsx`, `app/components/DocumentStatsBar.tsx`, `app/components/WikiPostSection.tsx`
- Middleware (locale detection + route bypass): `middleware.ts`
- DB migration: `supabase/migrations/20260624_community_and_stats.sql`
- Schema reference: `schema-v3.sql`

## DB Prerequisites

The community and stats features require two Supabase tables. If they don't exist yet, run this migration in Supabase SQL Editor:
```
supabase/migrations/20260624_community_and_stats.sql
```
Without these tables:
- `/api/posts` returns `{"error":"Could not find the table 'public.community_posts'..."}`
- `/api/documents/.../view` returns `{"error":"document not found"}` for static-only docs
- Community page shows empty state but form submit fails
- Admin posts page shows "글이 없습니다" and creates fail

## Tips

- The site uses static generation (~420 pages = 7 locales x ~56+ docs). Build with `npm run build` to verify all pages generate.
- Doctor score must stay 100/100: run `npm run ai:doctor` to verify.
- CI guards: run `npm run ci:guards` to verify encoding/stale-API checks pass.
- Arabic pages have `dir="rtl"` via `app/[locale]/layout.tsx` wrapper (`<div lang={locale} dir={dir}>`). Verify RTL text alignment visually.
- Port 3000 may already be in use from a previous session. Use `fuser -k 3000/tcp` or run on a different port (`npx next dev -p 3001`).
- Vercel preview returns RSC streaming payload — curl-based text verification is unreliable. Use browser-based testing instead.
- The root `<html lang="ko">` is hardcoded and not locale-aware. This is a known pre-existing limitation — don't report it as a bug.
- SiteFooter is a `"use client"` component that detects locale from `usePathname()`. It renders correct translations in SSR but verify in browser to confirm hydration works.
- When testing i18n, verify both the DOM attributes (`lang`, `dir`) via console AND the visual rendering via screenshots. Console verification catches wrapper issues; visual verification catches CSS/layout issues.
- Available seed slugs for testing: `myungdong-laluce-parking`, `passport-reissue-fee`, `ryu-hyun-jin-current-team`, `son-heung-min-current-team`, `bts-members-agency`.
- Screen recording may fail on some VMs due to FFmpeg issues. Fall back to screenshot-based evidence if `recording_start` fails.
- Production Vercel API routes may return "DB not configured" if server-side env vars (`SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_SECRET`) are not set. Use local dev server for full API testing.
- The `community_posts` RLS allows anon insert only for `status='published'` and `author_type in ('user','ai')`. Admin posts require `service_role` key.
