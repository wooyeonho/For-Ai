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

---

## 부록: 통합 후속 섹션

다음 섹션들은 개별 후속 작업으로 작성된 내용을 본 리포트에 통합한 것이다 (원 PR: #431, #432, #433, #434, #435, #436, #437).

## Top 7 Findings Summary

The Top 7 findings remain the executive summary of the audit: they identify the highest-impact product, reliability, and operational risks without prescribing ownership or delivery sequencing. The remediation matrix below is the execution plan for converting those findings into prioritized work.

## Remediation Priority Matrix

| Issue | Severity | Likelihood | Blast radius | Owner | Suggested milestone | Blocking? |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/posts` public POST rate limit is absent, allowing spam or write-amplification against public submissions. | P0 | High | Public community submissions, moderation queue, database write capacity, contributor trust | Platform / Backend | M0 security hardening before public growth campaigns | Yes |
| API docs drift causes `ci:guards` to fail, weakening release confidence and developer trust in documented endpoints. | P0 | High | CI merge gate, API consumers, release operations | Developer Experience / API | M0 CI unblock and docs-contract reconciliation | Yes |
| `/api/search` can degrade into full table scans as content grows, risking slow responses and database load spikes. | P1 | High | Search UX, database read capacity, crawlers, localized registry discovery | Backend / Data | M1 indexed search baseline with query-plan regression checks | Yes for scale launch |
| `/api/trending` performs request-time aggregation, creating a latency and cost bottleneck under homepage or crawler traffic. | P1 | Medium-High | Homepage widgets, analytics freshness, database CPU, cache efficiency | Backend / Data Platform | M1 precomputed trending snapshots or materialized rollups | Yes for scale launch |
| AI consensus lacks weighted scoring, so model agreement is not calibrated by provider reliability, source quality, or claim risk. | P1 | Medium | Candidate quality, human review load, verified-claim integrity, AI citation trust | AI / Verification | M1 consensus scoring policy and reviewer-visible rationale | Yes for verified automation |
| Public submission abuse controls need end-to-end observability beyond individual endpoint checks. | P2 | Medium | Posts, reports, hallucination submissions, admin triage | Platform / Trust & Safety | M2 abuse dashboard and submission anomaly alerts | No |
| Query performance guardrails are not yet consistently encoded as CI or scheduled checks. | P2 | Medium | Search, trending, index APIs, future registry growth | Data Platform | M2 performance budget checks and EXPLAIN-plan fixtures | No |
| API contract examples should be generated or snapshot-tested to prevent future documentation drift. | P2 | Medium | API docs page, SDK examples, integration partners | Developer Experience | M2 docs-as-contract snapshots | No |
| Consensus decisions need audit trails that explain model inputs, weights, conflicts, and human overrides. | P2 | Medium | Verification events, reviewer accountability, future enterprise/API trust | AI / Verification | M2 consensus audit log schema and admin UI surfacing | No |
| Long-term trending and search optimizations should be tied to product analytics thresholds rather than ad hoc fixes. | P3 | Low-Medium | Roadmap planning, cost forecasting, non-critical optimization work | Product / Data Platform | M3 capacity planning and traffic-triggered optimization policy | No |

## Notes on Matrix Usage

- P0 items are immediate release blockers because they either expose public write surfaces or keep CI from serving as a reliable merge gate.
- P1 items are scale blockers: they may not block every small patch, but they must be resolved before broader launch, crawler exposure, or verified automation expansion.
- P2/P3 items are follow-up controls that keep the same risks from recurring after the initial fixes land.
- This matrix intentionally does not restate the Top 7 narrative. The Top 7 stays as the audit summary; this matrix assigns priority, ownership, milestones, and blocking status.

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

## Observability & Incident Response

For-Ai must treat observability as part of fact-integrity operations: metrics and logs should help operators detect abuse, degraded citation/search experiences, and failed event writes without collecting raw personal network identifiers.

### Metrics to Track

| Area | Metric | Definition | Recommended dimensions |
| --- | --- | --- | --- |
| `/api/search` | p95 latency | 95th percentile end-to-end request duration for completed search requests. | `route`, `status`, `locale`, normalized error code |
| `/api/search` | Error rate | Percentage of `/api/search` requests returning 5xx or normalized application errors. | `route`, `status`, normalized error code |
| `/api/search` | Query count | Total accepted search queries, including zero-result queries. | `route`, `locale`, result-count bucket |
| `/api/trending` | Cache hit/miss estimate | Estimated ratio of requests served from cache versus requests that trigger a fresh Supabase read. | `route`, cache status, `status` |
| `/api/trending` | Supabase query latency | Duration of Supabase reads used to build trending responses when cache misses or refreshes occur. | `route`, query name, `status` |
| `/api/posts` | Pending submission rate | Count/rate of public submissions entering the pending moderation queue. | `route`, `status`, moderation state |
| `/api/posts` | Spam/rejected rate | Count/rate of submissions rejected by spam controls or moderator decisions. | `route`, `status`, rejection reason code |
| `/api/admin/login` | Failed login count | Count of failed admin authentication attempts. | `route`, `status`, normalized error code |
| Document citation/view events | Write failure count | Count of failed writes for citation and view tracking events. | event type, `route`, `status`, normalized error code |

### Example Alert Thresholds

- Trigger a security alert when `/api/admin/login` records **20 or more failed login attempts in 5 minutes**.
- Trigger a search reliability alert when `/api/search` p95 latency is **greater than 1 second for 10 consecutive minutes**.
- Trigger an abuse/moderation alert when the 10-minute average for public submissions is **5x higher than the normal baseline** for the same route and comparable time window.
- Trigger a citation-integrity warning when document citation/view event write failures are non-zero for a sustained 10-minute window, because failed writes reduce the reliability of downstream usage analytics.
- Trigger a trending degradation warning when `/api/trending` cache misses sharply increase while Supabase query latency also exceeds the recent baseline, because this can indicate cache churn or database pressure.

### Privacy-Preserving Logging Rules

- Never log or store raw IP addresses in application logs, analytics events, moderation records, or incident-response exports.
- Use `contributor_hash` as the stable abuse-prevention and rate-limit identifier when a contributor identity is needed.
- Keep request logs limited to `contributor_hash`, `route`, `status`, and normalized error code, plus coarse operational metadata such as duration buckets or cache status when needed.
- Do not include request bodies, free-form user text, raw headers, raw user-agent strings, authorization tokens, cookies, or source URLs that may contain personal data in routine logs.
- Normalize expected failures into bounded error codes such as `VALIDATION_FAILED`, `RATE_LIMITED`, `AUTH_FAILED`, `SUPABASE_TIMEOUT`, and `EVENT_WRITE_FAILED` so incident review does not require storing sensitive payloads.
- Incident runbooks must prefer aggregate metrics first; sample-level investigation should be time-limited, access-controlled, and still exclude raw IP addresses.

## RLS / 거버넌스

운영 DB에서 RLS 정책이 코드베이스의 보안 의도와 일치하는지 확인할 때는 Supabase SQL Editor 또는 `psql`에서 아래 점검 SQL을 실행한다. `schema-v3.sql`을 기준으로 하며, 실제 운영 DB에서는 마이그레이션 적용 누락이나 수동 정책 변경이 있을 수 있으므로 `pg_policies` 결과를 직접 확인한다.

### 1. `pg_policies` 정책 인벤토리 확인

다음 쿼리는 주요 공개 접근 테이블의 RLS policy를 한 번에 확인한다.

```sql
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'document_stats',
    'community_posts',
    'hallucination_reports',
    'documents',
    'claims',
    'claim_sources',
    'verification_events'
  )
order by tablename, policyname, cmd;
```

기대 기준:

- `document_stats`: `anon` 대상 `INSERT`, `UPDATE`, `DELETE` policy가 없어야 한다. 공개 사용자는 카운터를 읽을 수만 있고, 조회수/인용수 증가는 service-role 경로에서만 수행되어야 한다.
- `community_posts`: public/`anon` insert policy는 `with_check`가 `status = 'pending'` 조건을 포함해야 한다. 운영 정책은 사용자가 직접 `published` 상태로 게시물을 만들 수 없도록 해야 한다.
- `hallucination_reports`: public/`anon` `SELECT` policy가 없어야 한다. 공개 제출은 가능하더라도 신고 내용은 관리자 검토용이며 공개 조회되면 안 된다.
- `documents`: public/`anon` `SELECT` policy의 `qual`이 `status in ('published', 'verified')` 조건에 묶여야 한다.
- `claims`: public/`anon` `SELECT` policy의 `qual`이 부모 `documents` 레코드의 `status in ('published', 'verified')` 조건에 묶여야 한다.
- `claim_sources`: public/`anon` `SELECT` policy의 `qual`이 연결된 `claims` 및 부모 `documents` 레코드의 `status in ('published', 'verified')` 조건에 묶여야 한다.
- `verification_events`: public/`anon` `SELECT` policy의 `qual`이 연결된 `claims` 및 부모 `documents` 레코드의 `status in ('published', 'verified')` 조건에 묶여야 한다.

### 2. 운영 DB RLS 회귀 점검 SQL

아래 쿼리는 정책 인벤토리를 사람이 읽는 것과 별개로, 필수 거버넌스 조건을 PASS/FAIL 형태로 요약한다. FAIL이 하나라도 나오면 운영 DB 정책을 즉시 재검토한다.

```sql
with policy_rows as (
  select
    tablename,
    policyname,
    cmd,
    roles::text as roles_text,
    coalesce(qual, '') as qual,
    coalesce(with_check, '') as with_check
  from pg_policies
  where schemaname = 'public'
), checks as (
  select
    'document_stats has no anon insert/update/delete policy' as check_name,
    not exists (
      select 1
      from policy_rows
      where tablename = 'document_stats'
        and cmd in ('INSERT', 'UPDATE', 'DELETE')
        and roles_text like '%anon%'
    ) as passed
  union all
  select
    'community_posts anon insert only allows pending posts' as check_name,
    exists (
      select 1
      from policy_rows
      where tablename = 'community_posts'
        and cmd = 'INSERT'
        and roles_text like '%anon%'
        and with_check ilike '%status%pending%'
    )
    and not exists (
      select 1
      from policy_rows
      where tablename = 'community_posts'
        and cmd = 'INSERT'
        and roles_text like '%anon%'
        and with_check not ilike '%status%pending%'
    ) as passed
  union all
  select
    'hallucination_reports has no anon select policy' as check_name,
    not exists (
      select 1
      from policy_rows
      where tablename = 'hallucination_reports'
        and cmd = 'SELECT'
        and roles_text like '%anon%'
    ) as passed
  union all
  select
    'documents anon select is scoped to published/verified' as check_name,
    exists (
      select 1
      from policy_rows
      where tablename = 'documents'
        and cmd = 'SELECT'
        and roles_text like '%anon%'
        and qual ilike '%status%published%'
        and qual ilike '%status%verified%'
    ) as passed
  union all
  select
    'claims anon select is scoped by parent published/verified document' as check_name,
    exists (
      select 1
      from policy_rows
      where tablename = 'claims'
        and cmd = 'SELECT'
        and roles_text like '%anon%'
        and qual ilike '%documents%'
        and qual ilike '%document_id%'
        and qual ilike '%status%published%'
        and qual ilike '%status%verified%'
    ) as passed
  union all
  select
    'claim_sources anon select is scoped by parent published/verified document' as check_name,
    exists (
      select 1
      from policy_rows
      where tablename = 'claim_sources'
        and cmd = 'SELECT'
        and roles_text like '%anon%'
        and qual ilike '%claims%'
        and qual ilike '%documents%'
        and qual ilike '%claim_id%'
        and qual ilike '%status%published%'
        and qual ilike '%status%verified%'
    ) as passed
  union all
  select
    'verification_events anon select is scoped by parent published/verified document' as check_name,
    exists (
      select 1
      from policy_rows
      where tablename = 'verification_events'
        and cmd = 'SELECT'
        and roles_text like '%anon%'
        and qual ilike '%claims%'
        and qual ilike '%documents%'
        and qual ilike '%claim_id%'
        and qual ilike '%status%published%'
        and qual ilike '%status%verified%'
    ) as passed
)
select
  check_name,
  case when passed then 'PASS' else 'FAIL' end as result
from checks
order by check_name;
```

### 3. Supabase migration 적용 목록 확인 절차

운영 DB에 어떤 migration이 적용되었는지 먼저 확인한 뒤, RLS 관련 migration이 누락되지 않았는지 비교한다.

1. Supabase Dashboard에서 대상 프로젝트를 연다.
2. **SQL Editor**를 열고 운영 DB를 대상으로 아래 쿼리를 실행한다.
3. 결과의 `version`, `name`, `executed_at`을 로컬 `supabase/migrations/*.sql` 파일명과 대조한다.
4. RLS/거버넌스 관련 migration이 빠져 있으면 배포 절차를 중단하고, 누락 원인과 적용 순서를 먼저 확인한다.

```sql
select
  version,
  name,
  executed_at
from supabase_migrations.schema_migrations
order by version;
```

Supabase 프로젝트/CLI 버전에 따라 컬럼 구성이 다를 수 있으면 다음 쿼리로 실제 migration table 구조를 먼저 확인한다.

```sql
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'supabase_migrations'
  and table_name = 'schema_migrations'
order by ordinal_position;
```

## RLS / Governance

For-Ai keeps public intake tables private by default: anonymous clients may submit allowed rows through RLS-scoped insert policies, while review, status changes, and deletion/anonymization are handled by service-role admin paths only. Public reads must not expose private intake queues unless a table has an explicit moderation-aware public-read policy.

### Privacy Retention

#### Hash-only contributor identity

- Store only `contributor_hash` for abuse prevention, rate limiting, contributor streaks, and moderation correlation.
- Do not store raw IP addresses or raw user-agent strings in public intake tables, admin audit payloads, logs intended for product analytics, or exported review data.
- If an HTTP request requires IP/user-agent data to derive `contributor_hash`, use it only in memory for one-way hashing with `CONTRIBUTOR_SALT`, then discard the raw values before persistence.
- When `contributor_hash` is unavailable or cannot be safely generated, keep the row with a null contributor identity rather than storing raw network identifiers.

#### Public intake retention schedule

| Table | Default retention | Accepted / published outcome | Rejected, spam, or deleted outcome |
| --- | --- | --- | --- |
| `hallucination_reports` | Review within 90 days; retain pending rows for at most 180 days from `created_at`. | If accepted and used as claim-quality provenance, retain the minimal report record while the linked claim/document remains active; remove free-text that is not needed for provenance after 365 days. | Delete or anonymize within 30 days of final status. Keep only aggregate counters and non-identifying moderation reason codes if needed. |
| `topic_suggestions` | Review within 90 days; retain pending rows for at most 180 days from `submitted_at`. | If promoted into an entity/document/candidate workflow, retain the minimal topic metadata needed to trace the promotion for up to 365 days after promotion. | Delete or anonymize within 30 days of final status. Do not retain rejected free-text pitches beyond aggregate taxonomy metrics. |
| `source_suggestions` | Review within 90 days; retain pending rows for at most 180 days from `created_at`. | If accepted as a source candidate or attached to a claim, retain the normalized URL/domain and source-review metadata as provenance while the claim/source remains active; remove contributor-private notes after 365 days. | Delete or anonymize within 30 days of final status. For spam URLs, retain only a normalized domain/hash denylist entry when required for abuse defense. |
| `community_posts` | Pending posts must be moderated within 30 days; retain unresolved pending rows for at most 90 days from `created_at`. | Published posts may remain while relevant to the linked document/claim, subject to user deletion/moderation requests and periodic stale-content review every 365 days. | Hide immediately from public views; delete or anonymize author text and contributor linkage within 30 days of rejected/spam/deleted status unless needed for an active abuse investigation. |

#### Rejected / spam / deleted disposal criteria

- **Delete** rows when they contain no reusable claim provenance, no active abuse investigation value, and no legal/operational hold.
- **Anonymize** rows instead of deleting only when aggregate moderation analytics, duplicate detection, or abuse defense still needs a non-identifying record.
- Anonymization must remove or null contributor linkage (`contributor_hash`), free-text that may contain personal data, contact fields, and any request-derived metadata. Retained fields should be limited to table name, final status, coarse reason code, normalized entity/document/claim reference when safe, timestamps rounded to day-level where possible, and aggregate-safe category/domain hashes.
- Spam handling may retain a normalized URL/domain hash or coarse pattern signature, but must not keep the original submitter identity or raw request metadata.
- Deleted community content must not remain readable through public RLS policies, static generation, search indexes, `llms.txt`, or API cache layers.

#### `CONTRIBUTOR_SALT` rotation impact

Rotating `CONTRIBUTOR_SALT` intentionally changes future `contributor_hash` values for the same person or network context. Operations must treat rotation as a contributor-identity boundary with these effects:

- Existing contributor streaks, leaderboard credit, duplicate-source caps, and rate-limit buckets keyed only by `contributor_hash` will not automatically join to the new hash.
- A rotation can temporarily reset rate-limit history for recurring submitters and can break streak continuity unless a private, time-limited migration map is generated before rotation.
- If continuity is required, create a service-role-only rotation job that rewrites eligible current-window hashes, then destroy the mapping material immediately after verification; never export old/new hash pairs to analytics or public reports.
- If privacy risk is the reason for rotation, prefer no backfill: freeze old streak windows, start new rate-limit buckets, and document the rotation date in admin operations notes.
- Admin dashboards should annotate the rotation window so moderators understand sudden drops in streaks, duplicate detection matches, or contributor-level spam history.

## Search / Discovery API Audit

### Current behavior

`/api/search` currently accepts any non-empty `q`, caps `limit` at 30, searches document titles and verified claim values with unanchored `ILIKE '%q%'`, and returns document-level results. This is useful for early MVP discovery, but the endpoint must become stricter and more citation-aware before it is treated as an AI citation surface.

### Query length and prefix-search policy

- **Do not allow unrestricted 1-character queries.** A single character has extremely low intent, produces broad result sets in multilingual data, and can trigger expensive scans or noisy trigram matches.
- Recommended behavior:
  - Reject `q` values with normalized length `< 2` with `400` and an actionable error such as `query_too_short`.
  - Allow a 1-character query only when it is explicitly scoped by a **category** or **locale** prefix-search mode, for example `?q=s&lang=en&category=transport&mode=prefix`.
  - For 1-character scoped prefix search, require anchored predicates only, such as `slug ILIKE 's%'`, locale-specific `title ILIKE 's%'`, or category-filtered title prefix matching. Do not run `%s%` claim-value search for 1-character queries.
  - Normalize whitespace, case, and Unicode form before length checks so visually short queries cannot bypass the guard.

### Limit, pagination cost, and cursor migration

- Keep a hard maximum `limit` and document it. The current cap of `30` is acceptable for public autocomplete/search; if API consumers need larger exports, provide a separate authenticated bulk/index endpoint rather than raising search limits.
- Return the applied `limit` in the response metadata so clients can tell when a requested value was capped.
- Avoid deep offset pagination for search. `OFFSET n` becomes more expensive as `n` grows because the database still has to identify and discard preceding rows, and ranking can become unstable when documents or claims are updated between page requests.
- Prefer cursor pagination:
  - Sort by a deterministic ranking tuple, for example `(rank_score DESC, last_verified_at DESC NULLS LAST, document_id ASC)`.
  - Return `next_cursor` containing the last row's ranking tuple, signed or opaque to clients.
  - Fetch the next page with a keyset condition rather than `OFFSET`, keeping latency bounded for large registries.

### Ranking definition

Search ranking should be explicit, explainable, and aligned with For-Ai's claim-level registry model. Recommended ranking order:

1. **Exact slug match** — `slug = normalized_query` should rank first because it indicates a canonical document lookup.
2. **Title prefix match** — locale-specific display title prefix matches rank above fuzzy contains matches because they indicate strong user intent.
3. **Verified document priority** — documents with verified status and verified claim coverage rank above merely published or needs-review documents.
4. **Claim match** — verified claim-value or field-path matches rank after direct document identity/title matches, and the matched claim should be surfaced as an excerpt/snippet.
5. **Freshness / citation-ready status** — break ties by `last_verified_at`, source coverage, and whether the result is citation-ready. Stale or low-confidence results should not outrank fresh verified results even if text similarity is comparable.

An implementation can encode this as a weighted score, but the response should expose enough metadata for users and AI clients to understand why a result is safe to cite.

### `/api/search` response improvement

Search results should include citation-readiness metadata derived from canonical claim and verification state, not from `documents.data` convenience fields. Add these fields to each result:

```json
{
  "type": "document",
  "document_id": "...",
  "slug": "...",
  "title": "...",
  "category": "transport",
  "lang": "en",
  "excerpt": "...",
  "can_cite": true,
  "verification": "verified",
  "confidence": "high",
  "last_verified_at": "2026-07-02T00:00:00.000Z"
}
```

Field semantics:

- `can_cite`: `true` only when the document has at least one verified, source-backed claim suitable for citation and is not stale according to the domain's update policy.
- `verification`: document/result verification state such as `verified`, `partial`, `needs_review`, or `stale`; claim matches should reflect the matched claim's verification when it is stricter than the document aggregate.
- `confidence`: aggregate confidence for the result (`high`, `medium`, `low`), with unknown or unverified facts defaulting to `low`.
- `last_verified_at`: most recent human verification timestamp from `verification_events` for the matched document or claim; use `null` when no verification event exists.

The response envelope should also include pagination metadata:

```json
{
  "results": [],
  "query": "metro fare",
  "total": 10,
  "limit": 30,
  "next_cursor": null
}
```

This keeps `/api/search` useful for humans while making it safer for AI clients that need to decide whether a result is citation-ready.

## QA

### Evidence Checklist

QA pass/fail decisions must be based on concrete evidence, not visual impressions alone. Use the checklist below to attach the expected proof for each item, clarify what can be automated, and identify where manual screenshots are still required for review artifacts.

| QA item | Pass evidence definition | Automation possible? | Manual screenshot required? |
| --- | --- | --- | --- |
| Mobile GNB | On `/ko/wiki/myungdong-laluce-parking` in a mobile viewport, the global navigation menu opens and closes from the mobile control; every visible navigation link resolves with HTTP 200 or the expected in-app route state without client-side route errors. | Yes — Playwright or equivalent can set a mobile viewport, toggle the menu, enumerate links, and assert 200/route success. | Yes — capture the opened mobile menu state for reviewer confirmation. |
| i18n synchronization | For all 7 supported locales (`ko`, `en`, `ja`, `zh`, `es`, `hi`, `ar`), the page heading, status/badge labels, body copy, and language selector state are synchronized to the active locale with no mixed-language regression except intentional proper nouns or stable slugs. | Yes — route matrix tests can visit each locale, assert localized strings/selectors, and detect missing translations. | Yes — capture one screenshot per locale or a combined proof sheet showing heading, badge/body text, and language selector state. |
| Community inline form | After submitting the inline community form, the user sees a pending/review 안내 message; the newly submitted item remains absent from the public list until moderation or approval exposes it. | Yes — end-to-end tests can submit fixture content, assert the pending message, and query the public list/API for non-exposure. | Yes — capture the post-submit pending state and the unchanged public list when validating a release manually. |
| Status guidance boxes | `stale`, `high-risk`, and `needs verification` states each render the correct status guidance box, copy, visual severity treatment, and claim-level confidence/verification messaging without inventing facts. | Partially — component/page tests can assert text, status classes, and data-driven rendering for each state. | Yes — capture each status variant because severity treatment and guidance clarity are visual QA requirements. |
| Category chips | Category chips apply the active class to the selected category and expose `aria-current` on the active chip only; inactive chips remain navigable and do not advertise current state. | Yes — DOM/a11y tests can assert class names, `aria-current`, focus order, and route updates. | No — screenshots are optional unless the visual active state changed. |
| Admin login | A POST to `/api/admin/login` succeeds with valid admin credentials, sets an `httpOnly` cookie, and subsequent admin API calls succeed using cookie-based auth without exposing the secret to client-readable storage. | Yes — integration tests can call login, inspect `Set-Cookie` attributes, and call an authenticated admin API endpoint with the cookie jar. | No — screenshots are optional; HTTP transcript or automated test output is stronger evidence. |
