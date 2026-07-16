# BASELINE_BEFORE_TASK0

Book VI §2 (Bible v7) Baseline 기록. 코드 변경 없음 — 이 문서만 추가한다.

- **기록일**: 2026-07-13
- **기준 commit**: `34dc099` (origin/main = Merge PR #463, Bible v7 freeze 직후)
- **작업 branch**: `claude/freeze-implementation-bible-v7-8h1fci`
- **git status --short**: clean (미커밋 변경 없음)

---

## 1. 명령 실행 결과

| 명령 | 결과 | 비고 |
|---|---|---|
| `npm ci` | ✅ 통과 | 319 packages |
| `npm run lint` | ✅ 통과 (0 errors) | **39 warnings**: `@typescript-eslint/no-unused-vars`, `react-hooks/exhaustive-deps` (admin/i18n legacy 화면 위주) |
| `npm run test` | ✅ 54/54 통과 | 시간 의존이던 commerce TTL freshness 테스트는 PR #463에서 고정 시각으로 수정됨 |
| `npm run ci:guards` | ❌ **실패** | 아래 "기존 failure" 참조 |
| `npm run build` | ✅ 통과 | 단, `next.config.ts`가 `typescript.ignoreBuildErrors: true`로 타입 오류를 우회 중 (legacy type debt) — build 통과가 타입 안전을 의미하지 않음 |
| `npm run check:mojibake` | ❌ **실패** | 아래 "기존 failure" 참조 |
| `npm run check:citation-surfaces` | ✅ 통과 | 3 fixture slugs |
| `node scripts/check-schema-types.mjs` | ✅ 통과 (exit 0) | 존재하지만 **npm script로 미등록** (`check:schema-types` 없음) |

### 기존 failure (baseline — 이후 PR의 신규 regression으로 취급하지 않음)

1. **`ci:guards` — api-docs route guard 실패**
   - `GET /api/contributor-receipt/:param`이 `app/api/**/route.ts`에 구현되어 있으나 `app/api-docs/page.tsx`에 문서화되지 않음.
   - route guard 자체는 ok. api-docs 동기화 누락 1건.
2. **`check:mojibake` 실패 (false positive)**
   - `scripts/ci-guards.mjs`의 오류 메시지 예시 문자열(의도적으로 mojibake 예시를 보여주는 안내문)이 자체 검사에 걸림. 실제 콘텐츠 mojibake 아님. (stabilization PR에서 예시 문자열을 유니코드 이스케이프로 바꿔 해결)

두 실패 모두 main(34dc099)에 이미 존재한다. 이후 PR에서 이 실패를 악화시키면 해당 PR에서 해결한다.

### BUILD_ERROR_REPORT.md

저장소에 존재하지 않음 (기록할 기존 항목 없음).

---

## 2. Locale / i18n

- **지원 locale**: `ko, en, hi, ar, es, ja, zh` (`lib/i18n/locales.ts`의 `SUPPORTED_LOCALES`) — Bible 전역 불변식과 일치
- fallback locale: `en` (Accept-Language 무매치 시)
- typed dictionary: `lib/i18n/translations.ts`, 라우팅 helper: `lib/i18n/routing.ts`

## 3. Middleware

- 파일: `middleware.ts` (단일)
- **matcher**: `"/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"`
- 코드 내부 skip 경로: `/api/`, `/_next/`, `/admin/`, `/raw/`, `/diagnostics/`, `/report/`, `/hallucination/`, `/suggest-topic`, `/community`, `/llms.txt`, `.` 포함 정적 파일
- 역할: locale prefix 감지·redirect (auth 아님)
- Task 2 참고: `/embed`, `/feed.xml`, `/api/badge`는 아직 없으며 추가 시 최소 exclusion 검토 필요

## 4. next.config.ts

- `redirects()` **없음**, `headers()` **없음** — Task 0-A의 redirect 배열은 신규 추가이며 기존과의 병합 이슈 없음
- `typescript.ignoreBuildErrors: true` (legacy type debt 우회) — 장기적으로 제거 대상

## 5. Routes

### app/[locale] (locale layout 내부)

`ai-wrong-about, bounties, campaigns, challenges, compare, contributors, countries, country, entity, leaderboard, missions, quests, topics, verification-policy, wiki`

- **Task 0-A 대상 legacy gamification route 5종이 모두 실재**: `quests, missions, bounties, challenges, campaigns`
- legacy 참조 잔존 위치(grep): `app/components/CorrectionCTA.tsx`, `lib/i18n/translations.ts`, `lib/i18n/routing.ts` — Task 0-A에서 내부 링크 정리 시 확인 필요. `SiteHeader.tsx`/`SiteFooter.tsx`에는 직접 참조 없음
- sitemap/robots/llms에는 legacy gamification URL 없음

### locale layout 외부

`admin, api, api-docs, business, community, contribute, diagnostics, goal, hallucination, llms.txt, raw, report, robots.ts, sitemap.ts, suggest-topic, tools`

### API routes (44개, `app/api/**/route.ts`)

- admin 16종 (`login, review, verify-claim, candidates, promote-candidate, inbox, import, diagnostics, sponsored, posts, source-suggestions, hallucination-reports, check-source, generate-candidates, new-document, new-entity`)
- documents 5종 (`[slug]`, `[slug]/citation`, `[slug]/cite`, `[slug]/copy-citation`, `[slug]/view`), `cite/[slug]`
- gamification 4종 (`bounties, contributor/[hash], country-quest, leaderboard`)
- business 4종, 기타: `search, suggest-topic, source-suggest, trending, webhooks, keys, coverage, index, posts, report/[slug], hallucination/[slug], contributions/mine, contributor-receipt/[hash]`

## 6. Citation status 구조

- SSOT: `lib/citation-status.ts` — `ClaimCitationStatus`, `DocumentCitationStatus`, `getClaimCitationStatus()`, `getDocumentCitationStatus()`, `getVerifiedClaimViolations()`, freshness policy (`COMMERCE_POLICY_FRESHNESS_TTL_DAYS=30` 등)
- claim status 문자열: `"verified" / "needs_review"` 등이 코드 전반에서 문자열 리터럴로 사용됨
- **Bible Task 1이 요구하는 단일 `CitationStatus` union 타입과 `CitationPresentation` 계층은 아직 없음** — Task 1에서 기존 타입에 매핑해 추가해야 하며 중복 타입 생성 금지
- citation surface guard: `scripts/check-citation-surfaces.mjs` (fixture slug 3종)

## 7. Schema / types guard

- DB schema SSOT: `schema-v3.sql` + `schema-v3-monetization.sql` (repo root)
- migrations: `supabase/migrations/` **29개** (`20260622_topic_candidates.sql` ~ `20260703_rate_limit_counters.sql`)
- types: `lib/types.ts`, `lib/types-monetization.ts`
- guard: `scripts/check-schema-types.mjs` 존재·통과. **npm script 미등록** — 후속 PR에서 `check:schema-types`로 wiring 권장 (Bible §1.1)

## 8. Search / source helper

- 검색: `app/api/search/route.ts` + `lib/registry-index.ts`, `lib/supabase-index.ts` (trgm index: `20260702_search_trgm_indexes.sql`)
- 문서/데이터: `lib/data-source.ts`, `lib/supabase-documents.ts`, `lib/document-resolver.ts`
- source 신뢰/기여: `lib/source-trust.ts`, `lib/source-contributions.ts`, `lib/duplicate-detection.ts`
- **Task 5-B1의 `safeFetchExternalSource` 단일 fetch 계층은 아직 없음**

## 9. Auth / admin helper

- `lib/admin-api.ts`: admin session cookie(`adminSessionValid`, `issueAdminSessionCookie`), `AdminRole = viewer|editor|verifier|moderator|admin`, `ADMIN_AUDIT_TABLE=admin_audit_events`, `ADMIN_USERS_TABLE=admin_users`, `supabaseAdmin()` service-role client
- 감사/권한 migration: `20260629_admin_roles_and_audit.sql`, RLS 강화 migration 다수 (`20260625_lock_rls`, `20260626_enable_core_rls`, `20260629_harden_review_queue_rls` 등)

## 10. Rate limit

- `lib/rate-limit.ts`: in-memory (per-instance)
- `lib/rate-limit-store.ts`: **postgres 기반 distributed limiter** (`20260703_rate_limit_counters.sql` RPC, 실패 시 memory fallback, `backend: "postgres"|"memory"`)
- Task 1 §6.7 요구사항(생산용 distributed guard) 충족 가능한 기반 존재 — `/api/check`에서 재사용 대상

## 11. Cron / jobs

- `vercel.json` 없음 → **Vercel cron 미구성**
- 작업은 npm script 기반 수동/외부 실행: `scripts/jobs/{triage-topic-candidates, find-stale-claims, check-source-health, generate-admin-digest, check-security-baseline}.mjs` (`job:*` scripts)
- `CRON_SECRET` 패턴 미사용 — Task 5-B2에서 신규 도입 필요

## 12. Notifications

- 전용 notification/outbox 구조 **없음** (`lib/types*.ts`에 타입 언급만 존재)
- Task 5-D(notification outbox)는 greenfield

## 13. Sitemap / robots / llms

- `app/sitemap.ts`, `app/robots.ts`, `app/llms.txt/route.ts` 존재
- legacy gamification URL 미포함 → Task 0-A에서 sitemap 정리 부담 없음
- feed(`/feed.xml`)는 아직 없으므로 discovery wiring은 Task 4에서 신규

## 14. Task 1~4 dependency 부재 목록 (open/missing)

| Surface | 상태 |
|---|---|
| `POST /api/check` + `app/[locale]/check` | 없음 (Task 1) |
| sentence segmentation (`Intl.Segmenter`) 사용처 | 없음 (Task 1) |
| claim-similarity fixtures (`test/fixtures/claim-similarity/*`) | 없음 (Task 1) |
| `GET /api/badge/[slug]` | 없음 (Task 2) |
| `app/embed/[slug]` | 없음 (Task 2) |
| `opengraph-image.tsx` / `twitter-image.tsx` | 없음 (Task 3) |
| `app/feed.xml` | 없음 (Task 4) |
| `app/[locale]/changelog` | 없음 (Task 4) |

## 15. Open PR / 미병합 branch

- 원격 branch: `origin/main`, `origin/claude/freeze-implementation-bible-v7-8h1fci` 뿐
- open PR 없음 (PR #463은 merged)

## 16. 요약: 다음 PR(Task 0-A) 진입 조건

- baseline failure 2건(`ci:guards` api-docs 누락, `check:mojibake` false positive)은 분리 기록됨 — Task 0-A의 DoD "4종 명령 통과" 판정 시 이 2건은 baseline으로 취급하되, 가능하면 별도 소규모 PR로 선행 해소 권장
- Task 0-A에 필요한 사전 정보(legacy route 5종 실재, next.config redirects 부재, middleware matcher, locale 목록, 내부 참조 위치) 확보 완료
