---
name: testing-gyeol
description: Test the GYEOL global fact registry end-to-end. Use when verifying i18n routing, language selector, multi-AI generation, or wiki page rendering.
---

# Testing GYEOL

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

## Key Paths

- Wiki pages: `app/[locale]/wiki/[slug]/page.tsx`
- Language selector: `app/components/LanguageSelector.tsx`
- i18n config: `lib/i18n/locales.ts`, `lib/i18n/translations.ts`
- Generate page: `app/admin/generate/page.tsx`
- Generate API: `app/api/admin/generate-candidates/route.ts`
- Middleware (locale detection): `middleware.ts`

## Tips

- The site uses static generation (361 pages = 7 locales x ~49 docs). Build with `npm run build` to verify all pages generate.
- Doctor score must stay 100/100: run `npm run ai:doctor` to verify.
- CI guards: run `npm run ci:guards` to verify encoding/stale-API checks pass.
- Arabic pages should eventually have `dir="rtl"` for proper RTL layout (not yet implemented at page level).
