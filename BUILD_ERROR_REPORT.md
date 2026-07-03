# For-Ai 빌드 에러 진단 리포트

작성일: 2026-07-01 · 브랜치: `claude/codebase-review-puutj3` · PR #413

---

## 0. 한 줄 요약

**이건 git 병합 충돌이 아닙니다.** `main` 브랜치 자체가 **모든 커밋에서 CI 실패** 상태였고,
CI가 **Lint 단계에서 멈춰 Test/Build 단계가 아예 실행된 적이 없습니다.** 그래서 빌드·타입
에러가 지금까지 전부 숨어 있었습니다. 이번 PR에서 Lint/Test를 고치자 **빌드가 처음으로 실행**
되면서 누적돼 있던 에러들이 한꺼번에 드러난 것입니다.

---

## 1. 왜 지금 터졌나 (근본 원인)

CI 워크플로(`.github/workflows/ci.yml`)의 순서:

```
Install → Lint → Test → Build → Guards ...
```

- `main`의 최신 커밋(74aa516) CI 로그: **Lint = failure → Test/Build = skipped.**
  즉 `main`은 한 번도 빌드에 성공한 적이 없습니다 (매 커밋 red).
- 이번 PR에서 순서대로 고친 내역:
  1. Lint 에러 2건 수정 (`VerificationMeta` import 누락, `prefer-const`)
  2. Test 컴파일 에러 수정 (`citation-status.ts`의 `SUPPORTED_LOCALES`/`documentPageUrl` import 누락)
- 그 결과 **Lint·Test 통과 → Build 단계가 처음 실행 →** 잠복해 있던 파싱/타입 에러가 노출.

> 핵심: 아래 에러 대부분은 **이번 기능 작업(트렌딩/검색/Q&A)과 무관한 기존 코드베이스의
> 누적 부채**입니다. 빌드가 돌지 않아 그동안 아무도 발견하지 못했을 뿐입니다.

---

## 2. 에러 분류 (webpack 빌드 차단 vs 타입체크)

Next.js `next build`는 두 단계로 실패할 수 있습니다.
- **(A) webpack/SWC 컴파일** — 문법(파싱) 에러면 여기서 즉시 중단. 한 번에 몇 개만 표시됨.
- **(B) 타입체크(tsc)** — 컴파일 통과 후 실행. 순수 타입 에러(이름 못 찾음 등)는 여기서 실패.

전체 tsc 기준 **190개** 에러. 아래는 원인별 정리입니다. (원본 전체 목록: `BUILD_ERRORS_raw.txt`)

### 에러 코드 분포
| 코드 | 개수 | 의미 |
|------|------|------|
| TS2783 | 56 | 객체 리터럴 중복 키 (뒤 값이 앞을 덮어씀) |
| TS2304 | 56 | 이름을 찾을 수 없음 (import 누락 or 미정의) |
| TS2339 | 31 | 타입에 존재하지 않는 속성 접근 |
| TS2300 | 16 | 중복 식별자 (인터페이스 중복 키) |
| TS2717 | 8 | 동일 속성 재선언 타입 불일치 |
| TS7006 | 5 | 파라미터 암시적 any |
| TS2322/2344/2352/2353/기타 | 나머지 | 타입 할당/변환 불일치 |

---

## 3. 원인별 상세

### 🔴 A. webpack 빌드 차단 (어떤 빌드든 반드시 고쳐야 함)

#### A-1. 같은 스코프 변수 중복 선언 — ✅ 이번 PR에서 이미 수정 완료
SWC가 거부하는 파싱 레벨 에러. (커밋 `b788b07`)
- `app/[locale]/bounties/page.tsx` — `const t` 중복
- `app/[locale]/topics/[category]/page.tsx` — `const t` 중복
- `app/hallucination/[slug]/HallucinationForm.tsx` — `const searchParams` 중복
- `app/report/[slug]/ReportForm.tsx` — `const searchParams` + 잉여 `returnHref` 블록

#### A-2. 서버 전용 모듈 `fs`가 클라이언트 번들에 유입 — ❌ 미수정
```
app/contribute/ContributeClient.tsx   ("use client")
  └─ import { BADGES } from lib/gamification.ts
        └─ import ... from lib/goal-metrics.ts
              └─ import fs from "fs"   ← 브라우저에 없음 → 빌드 실패
```
`ContributeClient`는 순수 데이터 상수 `BADGES`만 필요한데, `gamification.ts`가 최상위에서
`goal-metrics.ts`(파일시스템 사용)를 import하는 바람에 서버 코드 전체가 브라우저 번들로 끌려옴.
- **원인**: 클라이언트/서버 모듈 경계 미분리.
- **수정 방향**: `Badge`/`BADGES`/`POINT_VALUES`를 `lib/badges.ts`로 분리하고
  `ContributeClient`는 거기서 import. `gamification.ts`는 재-export로 하위호환 유지. (저위험)

---

### 🟠 B. 타입체크 에러 (컴파일 통과 후 빌드 차단)

#### B-1. `lib/i18n/translations.ts` — 80개 (전체의 42%) 🔵 단일 원인, 저위험
`UITranslations` 인터페이스가 다음 8개 키를 **두 번** 선언:
- 33~40행: `topics/country/bounties/challenges/leaderboard/quests/compare/aiWrongAbout`
  를 `Record<string, string>` 스텁으로 선언
- 94~111행: 같은 키들을 **상세 객체 형태**로 다시 선언

→ 인터페이스 중복(TS2300), 재선언 타입 불일치(TS2717), 각 로케일 데이터 객체의 중복 키(TS2783).
- **수정 방향**: 33~40행의 `Record<string,string>` 스텁 블록 삭제 + 각 로케일 데이터의
  중복 키 정리. **80개 에러가 이 한 파일 수정으로 해결.** (저위험)

#### B-2. import 누락 — TS2304 중 "함수는 존재하는데 import만 빠진" 케이스 🟡 기계적, 중간 규모
아래 이름들은 **실제로 존재**하며 해당 파일에 import 문만 추가하면 됨:

| 미정의 이름 | 실제 위치 |
|-------------|-----------|
| `adminErrorResponse` | `lib/admin-api.ts` |
| `formatAdminError` | `app/admin/admin-error.ts` |
| `getFreshnessTtlDays`, `ageInDays`, `isStale` | `lib/citation-status.ts` |
| `calculateDocumentQuality` | `lib/document-quality.ts` |
| `AdminRecommendation` | `lib/admin-recommendations.ts` |
| `getAllTopicCategorySlugs`, `isKnownCategory`, `formatCategoryTitle`, `CATEGORY_DESCRIPTIONS`, `getBundlesForCategory` | `lib/topic-categories.ts` |
| `SupportedLocale` | `lib/i18n` |

주요 영향 파일 (~15개):
`app/api/admin/candidates/route.ts`, `app/api/admin/review/route.ts`,
`app/api/admin/verify-claim/route.ts`, `app/api/admin/hallucination-reports/route.ts`,
`app/admin/new-document/page.tsx`, `app/admin/new-entity/page.tsx`,
`app/admin/verify-claim/page.tsx`, `app/[locale]/topics/[category]/page.tsx` 등.
- **수정 방향**: 각 파일에 누락 import 복구. 단순하지만 파일 수가 많음. (저~중위험)

#### B-3. 아예 정의되지 않은 이름 — TS2304 중 "어디에도 없음" ⛔ 고위험, 도메인 판단 필요
| 미정의 이름 | 위치 | 성격 |
|-------------|------|------|
| `selectDefaultProvider`, `fallbackUsed` | `app/api/admin/generate-candidates/route.ts` | AI 프로바이더 선택 로직 — 구현 추측 필요 |
| `secondConfirmation`, `documentRow` | `app/api/admin/verify-claim/route.ts` | 고위험 검증 흐름 변수 |
| `DuplicateDetection` | `app/admin/candidates/page.tsx` | 타입 정의 누락 |
| `stale`, `doc` | `app/admin/verify-claim/page.tsx` | 로컬 변수 스코프 깨짐 |
| `loginAdmin`, `authMessage` | `app/admin/AdminSecretProvider.tsx` | 객체 shorthand 미정의(TS18004) |
- **수정 방향**: 원래 의도를 알아야 안전하게 복구 가능. **잘못 추측하면 admin 검증/AI 생성
  로직에 버그 유발.** 별도 검토 권장. (고위험)

#### B-4. 타입 정의와 실제 사용의 불일치 — TS2339/2322/2352/2353 (~35개) 🟠 중~고위험
타입이 사용처와 어긋나 존재하지 않는 속성에 접근:
- `lib/verified-claims.ts` (21개): `VerifiedClaimFile`에 `city`/`canonical_slug`/`localized_title`
  없음, union 타입에서 `last_verified_at`/`verification_event` 접근 불가.
- `app/api/admin/verify-claim/route.ts`: `ClaimRow`/`DocumentRow`에 `confidence` 속성 없음,
  readonly 튜플에 `.has()` 호출(TS2339).
- **수정 방향**: 의도한 타입 스키마 파악 후 타입 정의 갱신. (중~고위험)

---

### 🟡 C. 이번 PR이 신규 생성/수정한 파일의 이슈 (구분해서 표기)

| 파일 | 에러 | 성격 | 조치 |
|------|------|------|------|
| `app/api/search/route.ts:73` | TS2352 Supabase join 결과 캐스팅 오류 (`documents`가 배열로 반환) | **이번 PR 신규** | 수정 예정 |
| `app/community/CommunityClient.tsx:52,54` | `SUPPORTED_COMMUNITY_LOCALES` 미정의 | **기존 파일의 기존 버그** (내가 편집한 파일이지만 원래 있던 문제) | B-3와 함께 복구 |
| `app/components/HomePageContent.tsx:504` | `string`을 `SupportedLocale` prop에 전달 | 기존 타입 갭 (HomeSearch prop 타입) | 캐스트로 수정 |
| `supabase/functions/notify-watchers/index.ts` | Deno 전역/`esm.sh` import 관련 8개 | **거짓 양성** — Deno 런타임 파일이며 Next 빌드 그래프에 미포함. `next build`·`eslint .` 영향 없음(로케일 tsc 전체 검사에서만 표시) | 조치 불필요 |

---

## 4. 권장 수정 순서 (저위험 → 고위험)

| 순서 | 작업 | 예상 효과 | 위험 |
|------|------|-----------|------|
| 1 | ✅ 중복 선언 4곳 (완료) | webpack 파싱 통과 | - |
| 2 | `translations.ts` 중복 키 제거 | **-80 에러** | 저 |
| 3 | `fs`-in-client 분리 (`lib/badges.ts`) | webpack 빌드 통과 | 저 |
| 4 | B-2 import 누락 ~15파일 복구 | -30~40 에러 | 저~중 |
| 5 | `search/route.ts` 캐스팅 수정 (이번 PR 것) | -1 | 저 |
| 6 | B-4 타입 스키마 정합 | -35 에러 | 중~고 |
| 7 | B-3 미정의 함수/변수 복구 | 나머지 | **고 (도메인 판단)** |

1~5는 안전하게 진행 가능. 6~7은 원 저자의 의도 확인이 필요합니다
(특히 admin verify-claim, AI provider 선택 로직).

---

## 5. 결론

- **원인**: `main`이 Lint에서 막혀 빌드가 한 번도 안 돌았고, 그 뒤 단계의 에러가 전부 누적.
  이번 PR이 앞 단계를 고쳐 빌드가 돌자 노출됨.
- **책임 소재**: 190개 중 대다수는 기존 부채. 이번 PR 신규 이슈는 3건(§C)뿐.
- **완전 그린 빌드**를 원하면 §4의 2~7을 진행해야 하며, 6~7은 도메인 결정이 필요합니다.

전체 원본 에러 목록: **`BUILD_ERRORS_raw.txt`** (190행) 참고.
