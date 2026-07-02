# For-Ai 최종 전수 진단 마스터 리포트

감사일: 2026-07-01  
역할: Technical Audit & Core Systems Architect  
범위: AI 합의 엔진, API/RAG 표면, DB 스케일/캐싱, 보안/RLS, 라이브 QA 6대 항목

## 0. 총평

For-Ai는 `entities -> documents -> claims -> claim_sources -> verification_events` 원칙을 스키마와 공개 렌더링 레이어에 상당 부분 반영하고 있다. 특히 관리자 API는 `httpOnly` 세션 쿠키, 브라우저 `x-admin-secret` 차단, 역할 기반 권한, CSRF 검사, 감사 로그를 갖춘 상태다. 반면, AI 후보 합의 엔진은 아직 모델별 신뢰도·출처성·과거 정확도 기반 가중치가 없고, 검색은 `ILIKE '%query%'` 기반이라 대규모 데이터에서 full table scan 위험이 높다. 공개 커뮤니티 제출 API 일부에는 rate limit이 빠져 있어 DB 스팸 적재 위험이 남아 있다.

### 최우선 조치 Top 7

1. `lib/consensus.ts`에 provider reliability, web-search capability, historical acceptance rate, source evidence count를 결합한 weighted consensus를 추가한다.
2. `/api/search`를 PostgreSQL full-text/trigram 검색으로 교체하고 `documents(title)`, `claims(claim_value)`에 GIN 인덱스를 추가한다.
3. `/api/trending`의 hallucination 집계를 전체 accepted row scan 대신 `document_id, status` 인덱스 기반 집계 RPC/materialized view로 전환한다.
4. 공개 `POST /api/posts`에 contributor hash/IP 기반 rate limit과 스팸 텍스트 검사를 추가한다.
5. `/llms.txt`에 “전체 문서 목록” 대신 검증 문서만 노출하는 현재 정책은 안전하지만, RAG 누락 방지를 위해 `/api/index?verification=all` 안내와 machine-readable policy JSON 링크를 더 명시한다.
6. 홈 인기 문서와 `/api/trending`의 AI 인용 정의가 다르므로 `ai_citation_total = ai_citation_count + api_cite_count + citation_copy_count`로 통일한다.
7. 관리자 `/admin` 대시보드 일부 코드가 입력한 secret을 실제 요청 헤더에 싣지 않고 `/api/admin/review`를 호출하므로 httpOnly 로그인 컴포넌트 패턴으로 통일한다.

---

## 1. AI 합의 엔진 및 API/RAG 레이어 정밀 감사

### 1.1 8개 LLM 프로바이더 상태

`AI_PROVIDERS`는 8개 키를 정의한다: `perplexity`, `gemini`, `gpt`, `grok`, `nvidia`, `nvidia_llama_70b`, `nvidia_nemotron_70b`, `nvidia_llama_8b`. Perplexity만 `supportsWebSearch: true`이고 나머지는 false다. 즉, 현재 설계상 출처 탐색 능력이 서로 다른 모델을 한 합의 풀에 넣고 있다.

### 1.2 현재 consensus 알고리즘의 실제 동작

현재 `buildConsensus`는 다음 방식이다.

- provider별 후보를 평탄화한다.
- slug/title 유사도 기준으로 그룹화한다.
- `consensus_score = agreed_provider_count / totalProviders`로 산출한다.
- primary 후보는 Perplexity가 있으면 우선 사용하고, 없으면 첫 후보를 사용한다.
- claims는 질문 문자열 기준으로 병합하며 placeholder는 강제로 `확인 필요`로 둔다.

이 로직은 안전한 후보 생성용으로는 단순하고 예측 가능하지만, “모델별 성능 차이에 따른 가중치 튜닝 알고리즘”은 존재하지 않는다. 모델 정확도, 출처 유무, 도메인 적합성, 과거 승인률, hallucination 이력, 언어별 성능, web-search 지원 여부가 점수에 반영되지 않는다.

### 1.3 다수결의 맹점

현재 방식은 `8개 중 5개 비검색 모델`이 같은 오래된 사실을 반복하면 `majority`로 승격될 수 있다. 반대로 Perplexity 1개가 최신 출처를 제시해도 다른 모델이 다른 slug/title을 만들면 `single`로 떨어진다. 또한 NVIDIA 변형 4개는 같은 계열 모델이므로 독립적 투표자로 보기 어렵다. 같은 provider family를 다수 포함하면 synthetic majority가 생긴다.

### 1.4 대안 코드: weighted consensus 설계

아래 패턴을 `lib/consensus.ts`에 추가할 것을 권장한다. 핵심은 provider vote를 단순 count가 아니라 `baseWeight × sourceEvidence × freshness × familyDiversity × historicalAcceptance`로 계산하는 것이다.

```ts
const PROVIDER_WEIGHTS: Record<AIProviderKey, { base: number; family: string; web: boolean }> = {
  perplexity: { base: 1.25, family: "perplexity", web: true },
  gpt: { base: 1.05, family: "openai", web: false },
  gemini: { base: 1.0, family: "google", web: false },
  grok: { base: 0.9, family: "xai", web: false },
  nvidia: { base: 0.85, family: "nvidia", web: false },
  nvidia_llama_70b: { base: 0.85, family: "nvidia", web: false },
  nvidia_nemotron_70b: { base: 0.9, family: "nvidia", web: false },
  nvidia_llama_8b: { base: 0.65, family: "nvidia", web: false },
};

function evidenceMultiplier(candidate: RawCandidate): number {
  const urls = new Set((candidate.source_hints ?? []).map((s) => s.url).filter(Boolean));
  if (urls.size >= 2) return 1.2;
  if (urls.size === 1) return 1.1;
  return 0.8;
}

function familyDiversityCap(group: (RawCandidate & { _provider: AIProviderKey })[]): number {
  const families = new Set(group.map((c) => PROVIDER_WEIGHTS[c._provider].family));
  return Math.min(1, families.size / Math.max(1, group.length));
}

function weightedConsensusScore(
  group: (RawCandidate & { _provider: AIProviderKey })[],
  selectedProviders: AIProviderKey[],
  historicalAcceptance: Partial<Record<AIProviderKey, number>> = {},
): number {
  const maxScore = selectedProviders.reduce((sum, provider) => {
    const w = PROVIDER_WEIGHTS[provider];
    return sum + w.base * (historicalAcceptance[provider] ?? 1);
  }, 0);

  const groupScore = group.reduce((sum, c) => {
    const w = PROVIDER_WEIGHTS[c._provider];
    return sum + w.base * evidenceMultiplier(c) * (historicalAcceptance[c._provider] ?? 1);
  }, 0);

  return Math.min(1, (groupScore / Math.max(maxScore, 0.01)) * (0.8 + 0.2 * familyDiversityCap(group)));
}
```

추가 정책:

- 동일 family는 1표 이상의 영향력을 갖되 상한을 둔다.
- `source_hints`가 없으면 candidate promotion 우선순위를 낮춘다.
- high-risk category는 최소 1개 공식/규제기관 source hint 없이는 `single/minority`를 `needs_review`로 고정한다.
- admin promotion 이후 provider별 acceptance/rejection 결과를 `topic_candidates` 또는 별도 `ai_provider_performance`에 저장해 weight를 주기적으로 업데이트한다.

### 1.5 JSON-LD/RAG 표면 리스크

Wiki 페이지는 `application/ld+json`, normalized citation JSON, citation policy JSON을 모두 raw HTML에 포함한다. 이는 RAG가 JS 실행 없이도 인용 정책을 읽는 데 유리하다. JSON-LD는 Dataset + ClaimReview graph이며 `can_cite`, `source_count`, `last_verified_at` 같은 속성을 노출한다.

리스크:

- ClaimReview의 `claimReviewed`는 direct answer 중심이라 다중 claim 문서에서 일부 claim만 대표될 수 있다.
- JSON-LD에 모든 claim/source row가 들어가지 않으면 RAG가 페이지 요약만 보고 claim-level nuance를 놓칠 수 있다.
- `/llms.txt`는 verified 문서 중심이라 안전하지만, candidate 문서를 일부러 배제하므로 RAG discoverability 측면에서는 “존재 누락”이 발생할 수 있다. 다만 정책적으로 unverified 문서 미노출은 올바른 안전 선택이다.

개선:

- JSON-LD graph에 claim별 `ClaimReview` node를 배열로 추가하고 각 node에 `claim_id`, `field_path`, `confidence`, `status`, `source_urls`, `last_verified_at`를 포함한다.
- `/llms.txt`의 candidate 제외 문구 옆에 `/api/index?verification=all`과 `/api/index?verification=verified` 예시를 명확히 둔다.
- `/api/documents/[slug]` 응답에 `X-For-Ai-Can-Cite` 헤더가 있으므로 RAG 문서에도 “헤더 우선 확인” 가이드를 추가한다.

---

## 2. 데이터베이스 스케일 및 캐싱 아키텍처 최적화 검증

### 2.1 `/api/trending`의 사람 조회수와 AI 인용수 분리 증명

`/api/trending`은 `document_stats`에서 `view_count`, `ai_citation_count`, `human_view_count`, `bot_view_count`, `api_cite_count`, `citation_copy_count`를 선택한다. 이후 `aiTrending`은 `ai_citation_count + api_cite_count + citation_copy_count` 합산으로 정렬하고, `humanTrending`은 `human_view_count`만으로 정렬한다. `total_ai_citations`는 현재 `ai_citation_count`만 합산하고 `api_cite_count`, `citation_copy_count`는 제외한다.

판정:

- 랭킹 차원에서는 사람 조회와 AI 인용을 분리한다.
- 총계 차원에서는 AI 관련 세부 카운터 정의가 불일치한다. `total_ai_citations`도 랭킹과 동일한 합산 정의를 써야 한다.
- `human_view_count` fallback이 `s.human_view_count ?? s.view_count`라 legacy row에서는 bot 포함 view가 human으로 오인될 수 있다. migration 이후 row는 분리되지만, 과거 데이터 backfill이 필요하다.

### 2.2 5분 캐싱과 DB 커넥션 병목

`/api/trending`은 `revalidate = 300`과 `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`를 사용한다. 정상적인 Vercel edge/CDN 캐시가 작동하면 5분 단위로 origin query가 줄어든다. 그러나 다음 경우 병목이 가능하다.

- query string `limit`, `lang` 조합별로 캐시 key가 분산된다.
- CDN miss가 동시에 발생하면 Supabase에 같은 query가 여러 번 들어가는 thundering herd가 생긴다.
- 각 요청마다 stats 200 rows, docs `IN`, hallucination_reports 전체 accepted scan의 3개 DB round trip이 발생한다.
- 서버리스 cold start마다 Supabase client가 새 연결/HTTP 세션을 만들 수 있다.

튜닝 가이드:

1. `trending_snapshots` materialized view 또는 table을 1~5분 배치로 갱신한다.
2. `hallucination_reports`는 request-time 전체 row scan 대신 `select document_id, count(*) group by document_id` RPC 또는 materialized count를 쓴다.
3. `limit/lang`를 normalized key로 제한한다. 예: limit은 10/20만 허용.
4. revalidation jitter를 둬 동시 만료를 줄인다.
5. Supabase RPC 하나로 `stats + docs + hallucination_count`를 join하여 반환한다.

### 2.3 검색 알고리즘 대용량화 위험

`/api/search`는 `documents.title ILIKE '%q%'`, `claims.claim_value ILIKE '%q%'`를 사용한다. 접두어가 아닌 contains 검색은 일반 B-tree 인덱스를 못 타므로 데이터가 커질수록 full table scan 또는 느린 sequential scan 위험이 크다.

권장 인덱스:

```sql
create extension if not exists pg_trgm;

create index if not exists documents_title_trgm_idx
  on documents using gin (title gin_trgm_ops)
  where status in ('published', 'verified');

create index if not exists documents_lang_status_idx
  on documents (lang, status);

create index if not exists claims_value_trgm_verified_idx
  on claims using gin (claim_value gin_trgm_ops)
  where status = 'verified';

create index if not exists claims_document_status_idx
  on claims (document_id, status);

create index if not exists document_stats_ai_total_idx
  on document_stats ((ai_citation_count + api_cite_count + citation_copy_count) desc);

create index if not exists document_stats_human_view_idx
  on document_stats (human_view_count desc);

create index if not exists hallucination_reports_status_document_idx
  on hallucination_reports (status, document_id);
```

검색 쿼리 권장 전환:

- 짧은 query(1~2자)는 exact/prefix 또는 category facet으로 제한한다.
- 일반 query는 `websearch_to_tsquery` + weighted `tsvector`를 사용한다.
- fallback contains는 `pg_trgm` similarity score로 정렬한다.

---

## 3. 백엔드 보안 인프라 및 거버넌스 취약점 사냥

### 3.1 관리자 세션 쿠키 감사

`/api/admin/login`은 `ADMIN_SECRET`을 timing-safe compare로 검증하고 `issueAdminSessionCookie`를 호출한다. 세션 쿠키는 `for_ai_admin_session`, `httpOnly`, `secure`, `sameSite: strict`, path `/`, maxAge 1800초다. 쿠키 payload는 `expiresAt.nonce.signature`이고 signature는 `HMAC-SHA256(ADMIN_SECRET, expiresAt.nonce)`이다.

강점:

- 클라이언트 JS가 쿠키 값을 읽을 수 없다.
- 만료 시간이 서버 검증된다.
- 브라우저에서 `x-admin-secret`을 보내는 요청은 거부한다.
- mutating admin API는 CSRF 토큰 또는 same-origin 검사를 요구한다.
- 역할 기반 action mapping이 존재한다.

무력화 가능성/잔여 리스크:

- 세션 revoke list가 없다. `ADMIN_SECRET` 회전 전에는 발급된 30분 토큰을 개별 폐기할 수 없다.
- `ADMIN_CSRF_SECRET`이 없으면 임의의 non-empty `x-admin-csrf`만으로 통과한다. `sameSite=strict`와 same-origin 검사로 CSRF 위험은 낮지만, XSS 발생 시 방어력이 약하다.
- in-memory admin rate limit은 서버리스 인스턴스별로 분산되어 전역 brute-force 방어가 아니다.
- `/admin` page 단위 접근은 middleware에서 차단하지 않고, API 호출 시점에만 보호한다. 비밀 데이터 SSR 노출은 현재 없어 보이나, 관리자 UI 자체 숨김을 원하면 middleware gate가 필요하다.

권장:

- `admin_sessions` table에 nonce hash를 저장하고 logout/revoke 지원.
- 로그인 실패 rate limit을 Supabase/Upstash Redis 기반 전역 limiter로 변경.
- `ADMIN_CSRF_SECRET` 필수화 또는 double-submit cookie 패턴 도입.
- `/admin/:path*` middleware에서 cookie signature를 검증해 login page 외 라우팅을 차단.

### 3.2 퍼블릭 API Rate Limit/Validation 전수 소견

양호:

- `/api/trending`, `/api/search`, `/api/documents/[slug]`는 공통 `checkRateLimit`를 사용한다.
- `/api/documents/[slug]/view`, `/cite`는 IP+slug 기반 in-memory rate limit이 있다.
- `/api/suggest-topic`은 honeypot, spam 검사, URL 검증, contributor hash 기반 시간당 제한이 있다.
- `/api/source-suggest`는 claim 존재 검증, URL 검증, contributor+claim 일일 제한이 있다.
- `/api/hallucination/[slug]`는 honeypot, 길이 제한, spam 검사, contributor rate limit을 사용한다.

취약:

- `/api/posts` public POST는 content 길이/author_type/claim relation 검증은 있으나 rate limit이 없다.
- `/api/posts`는 `inspectSubmissionText`를 사용하지 않아 스팸성 content가 `pending`으로 계속 적재될 수 있다.
- in-memory limiter들은 서버리스 다중 인스턴스에서 전역 한도가 아니다.

권장 코드:

```ts
import { inspectSubmissionText } from "@/lib/submission-limits";
import { rateLimited } from "@/lib/rate-limit";

if (rateLimited("community-post", contributorHash, 10, 60 * 60 * 1000)) {
  return NextResponse.json({ error: "rate_limited" }, { status: 429 });
}
const spamCheck = inspectSubmissionText([authorName, content]);
const status = spamCheck.status === "spam_suspected" ? "spam" : "pending";
```

### 3.3 RLS/거버넌스

스키마는 public read/write 경계를 상당히 엄격히 의식한다. `documents`, `claims`, `claim_sources`, `verification_events`는 public select만 허용하고 intake성 table은 insert-only 성격을 갖는다. `document_stats` 초기 migration에는 anon insert/update가 있었지만 lock migration이 이를 제거하고 public select만 유지한다.

주의:

- migration 순서가 적용되지 않은 환경에서는 오래된 `document_stats_public_insert/update` 정책이 남을 수 있다. 운영 DB에서 `pg_policies` 확인이 필요하다.
- `schema-v3.sql`와 migrations 간 community/status 정책 차이가 있으므로 `schema-v3.sql`을 최신 migration 결과로 갱신하는 체계가 필요하다.

---

## 4. 라이브 서버 QA 6대 항목 및 징검다리 코드 크로스 체크

### 4.1 모바일 GNB 라우팅

`SiteHeader`는 locale을 pathname에서 추출하고 nav link를 locale prefix로 구성한다. 모바일 메뉴는 같은 `navLinks`를 사용하며 클릭 시 `close()`를 호출한다.

판정: 구현 존재. 다만 `localeHref(locale, "/community")`로 만든 `/ko/community`가 다시 `withLocaleLink`에 들어갈 때 중복 locale이 생기지 않는지 helper의 테스트가 필요하다. `middleware`는 `/community`를 locale 처리에서 제외하므로 실제 community page는 root `/community`도 존재한다. locale-prefixed community route가 없다면 모바일 GNB 링크가 404가 될 수 있다.

### 4.2 i18n 본문 번역 동기화

Wiki page는 locale validation 후 `getTranslations(locale)`와 `getEntityLabels(locale)`를 사용한다. 그러나 정적 seed bundle 자체의 `document.title` 및 claim values가 locale별로 완전히 번역된 별도 document인지, 같은 slug의 같은 bundle을 locale wrapper에 표시하는지는 데이터 구조에 의존한다.

판정: UI label 번역은 구현됨. 본문 factual text의 locale별 동기화는 claim `lang/original_claim_id/translation_status` 스키마는 있으나, 현재 page가 locale별 translated claim을 강제 조회한다는 증거는 약하다.

### 4.3 커뮤니티 인라인 폼 확장성

`WikiPostSection`은 claim selector, user/AI toggle, pending status optimistic display, 승인 후 공개 안내 메시지를 갖는다. `/api/posts`는 public submission을 `pending`으로 저장하고 public GET은 `published`만 읽는다.

판정: 기본 확장성은 양호. 단, rate limit 미비로 대량 pending spam에 취약하다.

### 4.4 상태 안내 박스 가독성

Wiki page는 stale/high-risk/citation safety/status blocks를 raw HTML에 렌더링한다. `DirectAnswerBox`와 `VerificationLevelBadge`가 상단에 배치되어 citation 상태를 빠르게 확인할 수 있다.

판정: 구현 존재. 단, inline style이 많아 디자인 토큰/접근성 대비 검사를 자동화하기 어렵다.

### 4.5 카테고리 칩 활성화 피드백

홈/토픽 UI에는 category/vertical 그룹과 status badge가 존재한다. 다만 “활성화된 카테고리 칩”에 대한 명시적 `aria-current`, `is-active`, keyboard focus state를 전수 확인할 별도 컴포넌트 경계가 약하다.

판정: 부분 구현. 활성화 피드백을 CSS class와 ARIA로 표준화해야 “100% 버그 제로”라고 말할 수 있다.

### 4.6 관리자 로그인 게이트

API 보안 게이트는 강하다. `/api/admin/*`는 `requireAdmin` 사용 패턴이 다수 존재하고 login route는 httpOnly cookie를 발급한다. 반면 `/admin/page.tsx`의 대시보드 자체는 입력한 secret을 `/api/admin/review` 요청에 전달하지 않고, httpOnly login provider도 직접 쓰지 않는다. 사용자가 이미 `/api/admin/login`으로 로그인한 cookie가 있으면 동작하지만, 페이지 내 password field만으로는 review API 인증에 실패할 수 있다.

판정: API 게이트는 합격, 관리자 UX 게이트는 일부 불일치. `AdminSecretField`를 대시보드에도 적용하거나 `/admin/page.tsx`의 fetch가 cookie login flow를 명시적으로 사용해야 한다.

---

## 5. 결론

현재 For-Ai는 “정적 우선 + claim-level + source-backed + admin review”라는 핵심 철학을 상당히 잘 지키고 있다. 하지만 글로벌 fact registry로 트래픽과 문서 수가 커질 경우 가장 먼저 병목이 될 부분은 검색 full scan, trending runtime aggregation, in-memory rate limit, 단순 다수결 AI consensus다. 보안은 평균 이상이지만 public community post rate limit과 admin session revoke가 다음 단계 필수 과제다.

“100% 버그 제로”는 코드만으로 증명할 수 없다. 현재 코드 감사 기준으로는 모바일 GNB, inline community, status boxes, API admin gate는 구현되어 있으나, locale-prefixed community route, 본문 factual translation selection, category chip active ARIA, admin dashboard login UX는 추가 E2E 검증 및 소규모 리팩토링이 필요하다.
