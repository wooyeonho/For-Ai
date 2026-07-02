# For-Ai 전문가 위원회 리뷰 (Advisory Board Review)

> 진단일: 2026-07-02 · 대상 커밋: `c51871b` · 규모: TS/TSX 약 30,089 LOC (`lib/` 44개 모듈, `app/api/` 42개 라우트, 컴포넌트 약 60개)
>
> 본 리포트는 5인 전문가 위원회(수석 개발자 · CISO · UI/UX 수석 · VC · 엔드 유저)의 시각으로 작성되었으며, 모든 지적은 `파일:라인` 근거에 기반한다. 칭찬은 최소화하고 실행 가능한 비판에 집중한다.

---

## 총평 (Executive Summary)

**한 문장 진단: "계약서는 거의 완벽한데, 선반은 아직 비어 있다."**

이 프로젝트는 리포지토리 스스로의 자기평가(`docs/current-state-analysis.md`, 2026-06-28)가 이미 정확하게 짚었다 — 인용 가능한 클레임 25개 / 시드 약 157개(15.9%), 트래픽 트랙션 0, 양면 시장의 콜드스타트 미해결. 위원회의 독립 스캔 결과도 이 진단을 확인한다.

**리더십에 대한 솔직한 평가:**

- **잘한 것:** 아키텍처 규율은 vibe coding 프로젝트치고 놀랍도록 높다. TypeScript `strict:true`에 `any`가 사실상 0개, 관리자 인증은 role 기반으로 중앙집중화(`lib/admin-api.ts`)되어 있고 timing-safe 비교·감사 로그까지 갖췄다. P0~P3 커밋들은 규율 있게 진행됐다 — consensus 변경 시 테스트를 함께 추가했고(`259fef1`), 코드가 참조하던 테이블을 마이그레이션으로 역으로 채웠다(`e6378b8`).
- **놓친 것 (리더십의 사각지대):** **"만들었으나 연결하지 않은 것(built-but-not-wired)"이 프로젝트 전반의 패턴**이다. gamification 페이지는 게이팅했지만 그 API는 안 했고, 모네타이제이션 스키마·가격표·관리자 UI는 다 있는데 결제 코드가 없으며, watcher 알림 파이프라인은 있는데 구독할 UI가 없다. 에이전트에게 "기능 X를 만들어라"를 반복 지시한 결과, 각 기능이 **완결되지 않은 채 절반씩** 쌓였다. 지금 필요한 리더십은 "새 기능 추가"가 아니라 **"기존 기능의 완결과 삭제 결정"**이다.

**위원회 공통 권고:** 향후 8주는 신규 기능을 동결하고, (1) 데이터 소스 오브 트루스 단일화, (2) 보안 구멍 3개 봉합, (3) "유령 코드" 정리, (4) 검증된 클레임 25→500개 확대라는 4개 축에만 집중하라.

---

## 1. 수석 개발자 (Lead Developer) 관점

### 진단: 스파게티는 아니다. 하지만 "일관성 없는 절반의 규율"이 기술 부채로 굳어가고 있다.

**(1) 비즈니스 로직이 라우트 핸들러에 갇혀 있다 — 서비스 레이어 부재**

핵심 도메인 로직 일부는 `lib/`로 잘 추출됐지만(`lib/citation-status.ts` 528줄은 테스트까지 갖춘 모범), 관리자 플로우는 라우트 핸들러 안에 통째로 인라인되어 있다:

- `app/api/admin/verify-claim/route.ts` (652줄)
- `app/api/admin/generate-candidates/route.ts` (605줄)
- `app/api/admin/review/route.ts` (573줄 — 우선순위 스코어링·`countRows`·한국어 리스크 라벨이 13~60줄에 하드코딩)
- `app/admin/verify-claim/page.tsx` (912줄, 단일 컴포넌트에 `useState` 38개)

→ 테스트도 불가능하고 재사용도 안 된다. 이 부분이 커질수록 부채가 복리로 불어난다.

**(2) 중복 로직 — 같은 것을 3곳에서 다르게 구현**

- **Supabase 클라이언트:** `lib/supabase-server.ts`에 팩토리가 있는데도 raw `createClient(url, key)`가 **12개 파일 19개 지점**에 인라인됨 (`lib/entity-profile.ts:185,265`, `app/components/HomePageContent.tsx:157,205`, `app/api/search/route.ts:47` 등). env 변수도 15개 파일에서 직접 읽음.
- **레이트 리미터가 3개:** `lib/rate-limit.ts`, `lib/api-rate-limit.ts`, 그리고 `lib/admin-api.ts:88` 내부의 사설 버킷. `x-forwarded-for` 파싱이 3곳에 복붙됨.
- **로케일 지식 4곳 중복:** `middleware.ts:4`의 `SUPPORTED_LOCALES` ≠ `lib/i18n/locales.ts:4`; 라우트 루트 목록이 `translations.ts:1830`·`routing.ts:29`·`middleware.ts:15`에 각각 독립적으로 하드코딩.
- **클론 라우트:** `app/api/report/[slug]/route.ts`와 `app/api/hallucination/[slug]/route.ts`는 필드명만 다른 구조적 쌍둥이.

**(3) 가장 위험한 부채 — 데이터 소스 오브 트루스가 3~4중이다** ⚠️

런타임이 참조하는 진실의 출처가 갈라져 있다:

1. 정적 TS 시드 `lib/seed-data.ts` (1,032줄)
2. 정적 JSON 17개 `data/verified-claims/*.json` (`lib/verified-claims.ts:5-24`에서 13갈래 union으로 하나씩 import — 파일 추가 시마다 import+타입 수정 필요)
3. Supabase — **정적 우선(static-first) 병합** (`lib/data.ts:6`, `lib/document-resolver.ts:13`). **정적으로 존재하는 slug를 Supabase에서 수정하면 조용히 무시된다.**
4. 레거시 `registry_documents`/`registry_claims` 테이블 — 코드는 쿼리하는데(`lib/supabase-documents.ts:186`) **어떤 스키마 파일에도 정의가 없다** (검증 완료: schema-v3.sql, monetization, migrations 전부 부재).

게다가 스키마 자체가 모순된다 — `schema-v3.sql`에서 `contributors` 테이블이 **두 번, 서로 다른 형태로** 정의됨 (579줄 `create table if not exists` vs 770줄 `create table` — PK가 `id uuid` vs `contributor_hash text`). `contribution_events`도 마찬가지. **26개 마이그레이션이 schema-v3 + monetization SQL과 겹쳐, 실제 프로덕션 스키마를 서술하는 단일 파일이 없다.**

**(4) 테스트 커버리지 약 2%, 그마저 고아 테스트 존재**

`test/`에 5개 파일(642줄)이 있지만 `npm test`는 3개만 컴파일·실행한다. **`admin-auth.test.ts`(보안 핵심)와 `contributor-streaks.test.ts`는 `npm test`에도 CI에도 연결되지 않은 고아**다. 42개 API 라우트 전체, `lib/gamification.ts`(507줄), `lib/admin-api.ts`(436줄)가 무테스트. `next.config.ts:7`은 `typescript.ignoreBuildErrors: true`로 빌드 단계 타입 안전망도 꺼져 있다.

**(5) 유령 코드**

- P3(`5bbd653`)가 gamification `[locale]` **페이지 7개**를 `notFound()`로 게이팅했지만 **백엔드 API 4개는 게이팅하지 않았다** (검증: `app/api/gamification/**`에 플래그 체크 0건). 페이지는 숨겼는데 데이터는 여전히 공개.
- `LOCALE_ROUTE_ROOTS`(`translations.ts:1830`)는 여전히 그 404 페이지로 향하는 링크를 생성.
- 죽은 3-파일 스텁 체인(`admin-stubs.ts`→`topic-suggestion-stubs.ts`→`submission-stubs.ts`, 약 250줄), 커밋된 `tsconfig.tsbuildinfo`·`goal3-full-page.png`, 루트에 2,697줄짜리 계획 MD 12개.

### 지금 당장 도입해야 할 패턴 (핵심 액션 아이템)

| # | 액션 | 근거 |
|---|------|------|
| **P0** | **스키마 단일화.** `schema-v3.sql`의 중복 `contributors`/`contribution_events` 정의 제거, 마이그레이션 기반 단일 진실 파일로 통합, 죽은 `registry_*` 참조 삭제 | `schema-v3.sql:579,770` |
| **P0** | **데이터 접근 레이어 강제.** raw `createClient` 19개 지점을 `lib/supabase-server.ts` 팩토리로 교체하고 ESLint 규칙으로 금지. 정적 vs Supabase 우선순위를 문서화·단일화 | `lib/data.ts:6` |
| **P1** | **레이트 리미터 1개로 통합** (§CISO 참조, 분산 저장소 필요) | 3개 구현 |
| **P1** | **얇은 서비스 레이어 추출.** verify-claim / generate-candidates / review의 로직을 `lib/`로 빼고 라우트는 얇게 | 3개 600줄+ 라우트 |
| **P1** | **고아 테스트 CI 연결** + `ignoreBuildErrors` 제거 | `package.json:10`, `next.config.ts:7` |
| **P2** | 유령 gamification API 게이팅 or 삭제, 죽은 스텁 체인 제거, `.gitignore`에 빌드 아티팩트 | `app/api/gamification/**` |

---

## 2. CISO / 보안 책임자 관점

### 진단: 방어선의 뼈대는 훌륭하다. 하지만 뼈대 사이에 치명적 구멍 몇 개가 있다.

**긍정 (먼저 인정할 것):** 위원회가 가장 우려했던 "익명 사용자가 LLM 비용을 폭증시키는 경로"는 **존재하지 않는다.** 모든 외부 LLM 호출은 `lib/ai-providers.ts`에 격리되어 있고, 도달 경로는 `/api/admin/generate-candidates`(`requireAdmin` + CSRF 보호 + count 1~50 캡) 하나뿐이다. 익명→LLM 트리거가 없다는 것은 이 아키텍처의 큰 강점이다. CSRF 서명 double-submit(`aa1db82`)도 `requireAdmin`을 타는 모든 관리자 라우트에 일괄 적용되어 견고하다.

### 그러나 — "가장 위험한 구멍"

**🔴 #1 (최우선): JSON-LD Stored XSS.** 신뢰의 핵심인 wiki 페이지가 XSS에 열려 있다.

`app/[locale]/wiki/[slug]/page.tsx:130, 135, 140` (그리고 `ai-wrong-about/[slug]:126`, `entity/[id]:53`)에서:
```tsx
<script type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
```
`JSON.stringify`는 `<`, `>`, `</script>`를 **이스케이프하지 않는다.** 문서 제목·인용·클레임 값 중 하나라도 공격자 영향 하의 텍스트(커뮤니티·LLM 생성 필드)에 `</script><script>...`가 들어가면 스크립트 블록을 탈출해 **저장형 XSS**가 성립한다. 신뢰 페이지에서 발생하므로 브랜드 타격이 가장 크다. → `.replace(/</g,'\\u003c')` 이스케이프 필수.

**🔴 #2: 인증 없는 `notify-watchers` 엣지 함수.** `supabase/functions/notify-watchers/index.ts:31`의 `Deno.serve`는 메서드만 확인하고 **service-role 권한 + Resend**로 실행된다. 함수 URL만 알면 누구나 이메일 발송을 트리거할 수 있다(비용·스팸 남용). → 공유 시크릿/JWT 검증 추가.

**🔴 #3: SSRF.** 관리자 `check-source/route.ts:76`과 `lib/webhooks.ts:63`이 사용자 제공 URL을 서버에서 그대로 fetch한다. 내부 IP/메타데이터(`169.254.169.254`, RFC1918) 차단이 없어, 관리자 계정 탈취 시 클라우드 메타데이터 SSRF 가능. → private-IP 차단 allowlist.

**🟡 #4: 레이트 리밋이 실질적 쿼터가 아니다.** 모든 리미터가 **서버리스 인스턴스별 in-memory + `X-Forwarded-For` 키** (`rate-limit.ts:1-6`). Vercel 워커 N개면 실효 제한이 N배로 뻥튀기되고, 콜드스타트마다 리셋되며, IP 로테이션으로 우회 가능. 이 상태에서 익명 insert(community_posts / topic_candidates / source_suggestions / hallucination_reports)를 대량 밀어넣어 **모더레이션 큐·스토리지 flooding**이 가능하다. → Upstash 등 분산 저장소로 단일 리미터 재구현.

**🟡 #5: 단일 `ADMIN_SECRET`의 과부하.** 로그인 비밀번호 + 세션 HMAC 키 + CLI 시크릿을 하나가 겸한다(`login/route.ts:23`, `admin-api.ts:167,198`). 하나만 유출돼도 전부 뚫린다. 로그아웃/세션 무효화 경로도 없어(HMAC 스테이트리스) 유출된 쿠키는 30분 만료까지 유효. 크론도 같은 시크릿 재사용(전용 `CRON_SECRET` 없음). → 키 분리 + 세션 무효화 + `CRON_SECRET`.

**확인 필요:** `community_posts`/`contribution_events`의 anon SELECT 정책이 미승인(pending) 행을 노출하지 않는지(앱 레벨 필터에만 의존 중) — `schema-v3.sql:390,826`.

### 핵심 액션 아이템

| # | 액션 |
|---|------|
| **P0** | JSON-LD `dangerouslySetInnerHTML` 5개 지점 `<`/`</script>` 이스케이프 |
| **P0** | `notify-watchers` 엣지 함수에 인증 추가 |
| **P1** | 레이트 리밋을 분산 저장소(Upstash 등) 단일 구현으로 교체 |
| **P1** | SSRF private-IP 차단 (`check-source`, `webhooks`) |
| **P1** | `ADMIN_SECRET` 역할 분리 + 세션 무효화 + `CRON_SECRET` |
| **P2** | anon SELECT RLS 정책 감사, gamification API RLS 재확인 |

---

## 3. UI/UX 수석 디자이너 관점

### 진단: 스펙(`UI_SYSTEM.md`)은 훌륭하다. 하지만 실제 렌더링은 "세 개의 디자인 시스템이 겹쳐 싸우는" 상태다.

**(1) 가장 거슬리는 문제 — 3중 디자인 시스템이 한 CSS 파일에 쌓임** ⚠️

`app/globals.css`(3,116줄)에 `:root`가 세 번 선언됨:
- 원본 팔레트(1줄, `--accent #24415f` — 스펙과 일치)
- 레이아웃 토큰(612줄, `--max: 960px`)
- **"Design reskin (drop-in)"** 블록(약 2080줄, 페이퍼톤 `--bg #f2f1ec`, `--max:1080px`)

CSS 캐스케이드상 **마지막 reskin이 이긴다** → 앞의 두 토큰 세트는 "살아있지만 그림자 처리된 죽은 코드". 게다가 reskin의 IBM Plex 폰트 `@import`는 나중에 제거됐지만(`7fd51e6`) 팔레트 절반은 남아, **타이포그래피는 되돌려지고 색만 reskin인 어정쩡한 상태**. `.btn-primary`가 3번 정의되고, 죽은 네온 시안(`#00f2ff`) 제출 버튼 규칙이 여전히 남아 있다.

**(2) 픽셀 단위로 당장 고쳐야 할 것 (가장 거슬리는 UI)**

- **플래그십 wiki 문서 페이지에 `<h1>`(문서 제목)이 두 번 렌더된다** — `registry-panel` 헤더 블록이 144줄과 185줄에 거의 동일하게 반복 (DirectAnswerBox 사이에 둠). 신뢰 페이지의 제목 중복은 즉시 교정 대상. (검증 완료)
- **821개의 인라인 `style={{}}`** 이 토큰 시스템을 우회. wiki 페이지는 경고 패널에 raw Tailwind 헥사(`#fff7ed`, `#f97316`, `#e11d48`…) 약 12개를 하드코딩 → **다크모드 미디어쿼리에 적응 불가**(다크모드에서 흰 패널이 그대로 뜸).
- 인라인 스타일이 관리자 페이지 전반(`admin/candidates`, `admin/posts`, `admin/generate`)에 `width:160`, `border:"1px solid #d1d5db"` 리터럴로 산재.

**(3) i18n가 신뢰를 깬다 (엔드유저와 겹치는 치명적 지점)**

- 한국어가 **84개 tsx 중 71개**에 하드코딩. 홈(`HomePageContent.tsx`)이 `getTranslations`를 아예 호출하지 않아 **`/en`에도 한국어 질문 카드("AI가 자주 틀리는 질문…")가 뜨고, `/ko`에는 영어 히어로가 뜬다.**
- 문장이 스크립트를 섞음: "STALE · 재검증 필요", "DO NOT CITE · 확인 필요". 미확인 센티넬 `"확인 필요"`가 전 로케일에 노출.
- **RTL 반쪽 배선:** `app/[locale]/layout.tsx:17`은 내부 `<div>`에만 `dir`을 걸고, 루트 `app/layout.tsx:24`의 `<html>`은 `dir="rtl"`도 실제 언어도 못 받는다 → 아랍어 레이아웃 깨짐.

**(4) 반응형 — 마크업과 CSS가 따로 논다**

브레이크포인트가 560/700/720/760/860px 5종으로 뒤섞임. 커밋 `24d6d3d`는 매칭 CSS 규칙이 **아예 없는** 클래스(`is-active`)를 커뮤니티 필터에 붙여, 필터 선택 시 시각 피드백이 0이었다(API는 동작). → **비주얼 리그레션 테스트 부재의 직접 증거.**

### 핵심 액션 아이템

| # | 액션 |
|---|------|
| **P0** | wiki 페이지 중복 `<h1>` 제거 (`wiki/[slug]/page.tsx:144` or `:185`) |
| **P0** | 홈 및 미배선 페이지 `getTranslations` 연결 — `/en`의 한국어 카드 제거 |
| **P1** | `globals.css` 3중 `:root` 정리 → reskin 팔레트로 토큰 단일화, 죽은 시안 버튼 삭제 |
| **P1** | wiki 경고 패널 raw 헥사 → `--warning`/`--danger` 토큰化 (다크모드 대응) |
| **P1** | `<html dir/lang>` 를 로케일 기반으로 (RTL 완성) |
| **P2** | 인라인 스타일 → 클래스 마이그레이션 (관리자부터), 브레이크포인트 표준화 |

---

## 4. 벤처캐피탈 투자자 (VC) 관점

### 진단: API 비용은 문제가 아니다. 문제는 "해자(moat)도, 공급도, 수요도, 결제도" 없다는 것이다.

**(1) 비용/확장성 — 걱정할 필요가 없다 (그런데 그게 좋은 신호만은 아니다)**

다중 LLM 합의 엔진이 비용을 태울까 봐 걱정했다면, 안심하되 다른 각도로 봐야 한다:
- AI 호출은 **하루 크론 1회(8개 모델) + 관리자 수동 실행**뿐. 공개 페이지는 정적 우선 + `revalidate:60`. **월 API 비용은 무시할 수준.**
- consensus 엔진(`lib/consensus.ts`, `259fef1`)은 정교하다 — 벤더 그룹 가중치 캡 1.5로 NVIDIA 4모델이 패널을 못 뒤집게 하고, 최소 2개 벤더 요구, 웹서치 미동의 시 등급 하향.
- **그러나:** AI는 사실을 **검증하지 않는다.** 후보만 제안하고(`placeholder_value:"확인 필요"`, `confidence:low`), 인간이 승격시킨다. 즉 "다중 LLM 합의"는 마케팅 서사이지 아직 자동화된 해자가 아니다. **비용이 낮은 이유는 곧 자동화·볼륨이 없다는 뜻**이기도 하다.

**(2) 비즈니스 모델 — 완벽하게 배관된 빈 파이프**

`schema-v3-monetization.sql`(402줄) + Pro **$49/mo** 티어(`types-monetization.ts:149`) + API 키/스폰서/비즈니스 관리자 UI가 다 있다. **그런데 결제 코드가 없다** (package.json 의존성 4개, Stripe/billing 부재). 공개 비즈니스 가입 경로도 없다. → **아무도 $49를 낼 방법이 없다.**

**(3) 리포 자신의 투자자 진단이 이미 정확하다**

`docs/current-state-analysis.md`: 인용 가능 클레임 25/157(15.9%), **트랙션 0**, 양면 콜드스타트, "누가 먼저 돈 내나?" 미해결, OpenAI/Google이 자체 그라운딩을 만들면 플랫폼 리스크. 시뮬레이션 투자자 평결: *"6개월 안에 검증 클레임을 500개로 늘리고, 실제 대형 AI가 For-Ai를 인용한 로그 하나를 보여줘라 — 아니면 아름다운 사이드 프로젝트다."*

### 킬러 기능 vs 버릴 기능 (핵심 액션 아이템)

**➕ 추가해야 할 킬러 기능:**
1. **"인용 증명(Citation Proof)" 계기판** — 실제 ChatGPT/Perplexity/Gemini가 For-Ai를 인용한 로그를 수집·전시. 이것이 유일하게 투자자·공급자·수요자를 동시에 설득할 자산. 현재 홈의 "Most Cited by AI"는 데이터가 없어 오히려 신뢰를 깎는다(§엔드유저).
2. **공급 자동화 파이프라인** — 인간 승격이 병목. AI 후보 → 소스 자동 대조 → 반자동 승격으로 25→500 클레임을 6개월에 달성할 처리량 확보.
3. **API를 진짜 상품으로** — 결제(Stripe) 연결 + `/api/cite`, `/llms.txt`를 개발자 우선 상품으로. B2B(팩트를 인용해야 하는 AI 스타트업)가 첫 지불자 후보.

**➖ 버리거나 동결할 것:**
1. **gamification 전체를 재평가.** 유령 페이지 7개 + 살아있는 `/contribute` 이코노미(`lib/gamification.ts` 507줄)는 **로그인 없는 IP 해시 유저**를 대상으로 한다 — 리텐션 장치로서 근본적으로 약하다(§엔드유저). 500 클레임 목표에 기여하지 않으면 동결.
2. **모네타이제이션 UI 확장 중단.** 결제가 붙기 전엔 스키마·UI를 더 늘리지 말 것. 배관만 늘어난다.
3. **7개 로케일 동시 유지 재고.** i18n가 절반만 작동(§UI/UX)하는데 7개를 끌고 가는 건 분산. ko+en 2개를 완성하고 나머지는 보류.

---

## 5. 엔드 유저 (일반 사용자) 관점

### 진단: 처음 온 사람은 "여기가 뭐 하는 곳인지"는 알겠는데, "내가 뭘 얻는지"는 모른다. 그리고 곳곳에서 신뢰가 샌다.

**(1) 첫인상 — 존재하지 않는 데이터를 광고한다**

홈(`HomePageContent.tsx`)은 개발자/사람/AI 3개 오디언스 카드와 3단계 설명으로 컨셉은 전달한다. 그러나:
- **"Most Cited by AI" 섹션이 대개 "Not enough data" / "Citation stats are not available yet" 배지**를 띄운다 → 없는 텔레메트리를 광고하는 꼴, 첫 방문 신뢰 하락.
- 대부분 문서가 빨간 **"DO NOT CITE · 확인 필요"** 패널을 띄운다(25개만 인용 가능) → "믿을 수 있는 곳"이라 왔는데 "믿지 마라"를 먼저 본다.
- 홈 통계 스트립은 **정적 시드만** 카운트 → Supabase 현실과 괴리.
- `/en`에 한국어 카드가 뜨는 언어 혼재(§UI/UX)가 첫인상을 결정적으로 깬다.

**(2) 글쓰기·검증·포인트 플로우 — 매끄럽지도, 재미있지도 않다**

- **계정이 없다** (설계상). 포인트는 `contributor_hash` = SHA-256(IP+salt)에 붙는다 → **IP 바뀌면 정체성·포인트 리셋**, 로그인 대시보드도 없다. "내 기여"를 축적하는 감각이 성립하지 않는다.
- 제출 폼(suggest-topic/report/hallucination/community)은 로그인 없이 잘 동작하지만, **검증이 인간 게이트**라 기여자는 즉각 피드백 루프를 못 받는다. "글 쓰고 → 며칠 뒤 어쩌면 승인" = 도파민 없음.
- watcher 알림 파이프라인은 존재하는데 **구독할 UI가 없다** — 죽은 파이프라인. "이 팩트 업데이트되면 알려줘"라는 자연스러운 리텐션 훅이 배관만 있고 손잡이가 없다.

**(3) 가장 이탈하기 쉬운 병목**

> **홈 → 문서 클릭 → 빨간 "DO NOT CITE" 패널** 이 구간이 최대 이탈점.

사용자는 신뢰를 기대하고 왔는데 첫 문서에서 "인용하지 마라"를 만난다. 이건 정직함의 표현이지만, UX적으로는 **"이 사이트는 아직 비어 있다"는 신호**로 읽힌다.

### 핵심 액션 아이템

| # | 액션 |
|---|------|
| **P0** | 데이터 없는 "Most Cited by AI" 섹션을 숨기거나, 검증된 25개를 전면에 큐레이션해 "빈 선반"이 아니라 "엄선된 선반"으로 보이게 |
| **P0** | `/en` 한국어 카드 제거(§UI/UX P0와 동일) — 언어 혼재는 첫인상 킬러 |
| **P1** | 미검증 문서의 "DO NOT CITE"를 "검증 진행 중 · N개 소스 대조 중"처럼 **진행형 프레이밍**으로 |
| **P1** | 기여 즉시 피드백: 제출 직후 "리뷰 큐 N번째 · 예상 M일" 표시로 도파민 루프 |
| **P2** | watcher 구독 UI 노출 (배관 재활용, 리텐션 훅) — 단, gamification 재평가(§VC)와 함께 결정 |

---

## 통합 액션 아이템 (Cross-Persona Priority)

### 🔴 P0 — 이번 주 (신뢰·보안 직결)
1. **JSON-LD XSS 이스케이프** (5개 지점) — CISO
2. **`notify-watchers` 엣지 함수 인증** — CISO
3. **스키마 단일화** (`contributors` 중복 정의 제거, `registry_*` 삭제) — Lead Dev
4. **wiki 중복 `<h1>` 제거** + **`/en` 한국어 카드 제거** — UI/UX + 엔드유저
5. **홈 "Most Cited by AI" 빈 섹션 처리** — 엔드유저

### 🟡 P1 — 이번 달 (부채·확장성)
1. 레이트 리밋 분산 저장소 단일 구현 — CISO + Lead Dev
2. `ADMIN_SECRET` 역할 분리 + `CRON_SECRET` + 세션 무효화 — CISO
3. SSRF private-IP 차단 — CISO
4. Supabase 접근 팩토리 강제(19개 지점) + 고아 테스트 CI 연결 + `ignoreBuildErrors` 제거 — Lead Dev
5. `getTranslations` 배선 완성 + `<html dir/lang>` RTL — UI/UX
6. **"Citation Proof" 계기판 착수** (실제 AI 인용 로그 수집) — VC

### 🟢 P2 — 이번 분기 (전략·정리)
1. 서비스 레이어 추출(600줄+ 라우트 3개) — Lead Dev
2. 유령 gamification API/페이지 게이팅 or 삭제, 죽은 스텁 체인 제거 — Lead Dev
3. `globals.css` 3중 토큰 정리, 인라인 스타일 → 클래스 — UI/UX
4. **기능 동결 결정:** gamification·모네타이제이션 UI 확장 중단, 7→2 로케일 집중, 검증 클레임 25→500 파이프라인에 리소스 집중 — VC

---

### 위원회 최종 메시지

> 당신의 리더십은 **아키텍처 규율**에서 A를, **기능 완결성**에서 C를 받는다. vibe coding으로 여기까지 온 것은 인상적이지만, 지금부터의 리더십은 "에이전트에게 더 만들라고 시키는 것"이 아니라 **"무엇을 완결하고 무엇을 죽일지 결정하는 것"**이다. 다음 8주, 새 기능을 하나도 추가하지 말고 위 P0·P1을 닫아라. 그러면 "아름다운 사이드 프로젝트"와 "인용되는 인프라"의 갈림길에서 후자로 방향을 튼 것이다.
