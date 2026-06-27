For-Ai 현재 상태 통합 분석
실리콘밸리 개발자·디자이너·소비자 AI·인간·투자자 관점

---

업데이트 (2026-06-27)

이전 분석은 verified claim을 "거의 0"으로 추정했으나, 실측 결과를 보정한다.

- 시드 토픽: 55개 (KR·JP·US·UK·India로 글로벌 확장됨)
- 시드 claim: 132개 — 전부 placeholder("확인 필요"). 즉 verified-seed-set.json은 검증 데이터가 아니라 검증 대기열(backlog)이다.
- data/verified-claims/ 의 실제 citation-ready claim: 기존 9개 (seoul-metro-base-fare, passport-reissue-fee, move-in-report-deadline 3개 문서) → 이번에 KR 교통 vertical을 공식 출처로 채워 17개로 증가.

이번에 추가된 공식 출처 기반 citation-ready 문서 (출처: 서울특별시 공식 교통정보, news.seoul.go.kr, 공공누리 제4유형, 2026-06-27 확인):
- seoul-city-bus-fare — 간선·지선 1,500원 / 마을 1,200원 / 조조할인 20%
- seoul-transit-transfer-rule — 환승 인정 30분(주간)·60분(심야), 최대 5회 승차
- seoul-taxi-base-fare — 중형 1.6km/4,800원, 모범·대형 3km/7,000원

KTX 환불 위약금은 코레일 공식 페이지가 자동 조회를 차단(403)하여 verified로 승격하지 않고 후속 후보로 남긴다. "공식 출처를 직접 확인하지 못하면 verified로 올리지 않는다"는 원칙을 따른다.

큰 그림은 동일하다: 계약은 우수하나 검증된 사실의 절대량이 여전히 작다(시드 132개 대비 citation-ready 17개, 약 13%). 다음 레버리지는 검증 큐 UI와 인용 계측이다.

---

핵심 결론

계약은 거의 완벽하다. 선반은 아직 비었다.
For-Ai는 AI가 인용하기 좋은 구조, 정책, API, 정적 HTML, citation gate, llms.txt, claim-level schema를 이미 갖췄다.
하지만 인용하러 들어오는 AI가 실제로 가져갈 수 있는 verified claim이 너무 적다.
지금의 병목은 더 많은 기능이 아니라 검증된 사실 생산 속도다.

0. 전체 요약

For-Ai는 단순한 AI 위키가 아니다.

For-Ai의 본질은 다음이다.

AI, 검색엔진, 인간이 같은 출처 기반 사실을 claim 단위로 인용할 수 있게 만드는 글로벌 사실 레지스트리.

현재까지 구축된 것:

- Next.js 기반 static-first 웹앱
- Supabase 기반 canonical schema
- entities -> documents -> claims -> claim_sources -> verification_events
- RLS 기반 public read / protected write 구조
- /llms.txt
- /api/documents/[slug]
- /api/entities/[id]
- /api/index
- /api/cite/[slug]
- /raw/[...path]
- sitemap, robots
- hallucination report
- correction report
- suggest topic
- admin pages
- i18n routing
- confidence/status/source/citation readiness UI

즉, 기술적 껍데기는 꽤 잘 만들어졌다.

하지만 제품의 핵심 질문은 이것이다.

AI가 지금 For-Ai에 들어왔을 때 실제로 인용할 수 있는 사실이 충분한가?

현재 답은 냉정하게 말해 아직 아니다.
그래서 지금 For-Ai는 AI citation registry라기보다는 AI citation registry가 되기 위한 신뢰 인프라 MVP에 가깝다.

1. 실리콘밸리 개발자 시점

1-1. 아키텍처 — 잘 된 것

Static-first + ISR + Supabase fallback

For-Ai의 가장 좋은 기술 판단 중 하나는 static-first 구조다.

- core document content는 정적 HTML로 읽힘
- revalidate: 60으로 최신성 확보
- Supabase가 실패해도 static seed/fallback으로 페이지를 계속 서빙 가능
- 크롤러와 AI agent의 대량 요청을 CDN/SSG 계층이 흡수 가능

AI citation source에서 가용성은 단순 성능 문제가 아니다.

인용 소스는 죽으면 안 된다.
가용성은 신뢰의 일부다.

AI crawler나 answer engine은 짧은 시간에 많은 페이지를 긁을 수 있다.
그때 모든 요청이 DB로 직접 가면 비용과 장애 위험이 커진다.
정적 HTML + ISR + DB fallback은 이 문제를 잘 피한다.

이건 단순 구현 편의가 아니라, For-Ai의 제품 철학과 맞다.

사실은 검증되어야 한다.
검증된 사실은 안정적으로 서빙되어야 한다.
AI가 읽을 수 있어야 한다.
DB가 잠깐 죽어도 citation surface는 살아 있어야 한다.

1-2. canonical data model

For-Ai의 핵심 구조는 좋다.

entities -> documents -> claims -> claim_sources -> verification_events

이 구조의 장점:

- 문서가 아니라 claim이 원자 단위
- claim마다 source를 붙일 수 있음
- claim마다 verification event를 남길 수 있음
- document는 사람이 읽는 묶음일 뿐, factual truth의 canonical source가 아님
- AI가 문단을 NLP로 해석하지 않고 구조화된 fact를 바로 받을 수 있음

이건 Wikipedia나 일반 블로그보다 AI grounding에 훨씬 적합하다.
Wikipedia는 문단 안에서 사실을 뽑아야 한다.
For-Ai는 처음부터 사실이 claim으로 분리되어 있다.

1-3. 오늘의 RLS 사건이 주는 교훈

schema-v3.sql은 source of truth라고 선언되어 있었지만, 실제로는 그 파일 자체에도 보안 구멍이 있을 수 있다.
이건 For-Ai의 제품 철학과 아주 직접적으로 연결된다.

For-Ai가 세상에 말하려는 것은 이것이다.

선언만으로는 부족하다.
출처와 검증이 필요하다.

For-Ai 자신의 인프라에서도 같은 일이 벌어질 수 있다.

선언적 신뢰:
schema-v3.sql이 source of truth다.

실측 검증:
Supabase advisor / RLS 검사 / 실제 정책 검토를 해보니 구멍이 있었다.

이건 아이러니이지만 동시에 제품 검증이다.
For-Ai가 필요한 이유를 For-Ai 자신의 개발 과정이 증명한 셈이다.

사람이 직접 확인해야 한다는 원칙은 귀찮은 도덕론이 아니라 실제 시스템 안전의 필수 조건이다.

1-4. 개발 부채 신호

RLS의 EXISTS 정책은 지금은 맞지만 나중에 비용이 될 수 있음

claims_public_select 같은 정책에서 documents를 EXISTS로 확인하는 구조는 지금은 적절하다.
왜냐하면 public anon read에서 claim이 연결된 document의 status를 확인해야 하기 때문이다.

하지만 claim이 수만, 수십만 개로 늘면 문제가 생길 수 있다.

claim read
-> RLS policy
-> documents join / exists check
-> every anon read path에서 반복

지금은 correctness가 우선이다.
하지만 10만 claim 시점에는 성능 부채가 된다.

나중에는 다음이 필요할 수 있다.

- denormalized document_status on claims
- materialized public read view
- verified/public claims 전용 view
- API layer cache
- edge cache
- Supabase RPC with controlled access
- claim citation index table

machine-readable surface가 여러 개로 분산되어 있음

현재 For-Ai에는 AI가 읽을 수 있는 표면이 여러 개 있다.

- /llms.txt
- JSON-LD
- sitemap
- /api/index
- /api/documents/[slug]
- /api/entities/[id]
- /api/cite/[slug]
- /raw/[...path]

이 방향은 좋다.
하지만 문제는 일관성이다.

만약 같은 claim에 대해:

- /api/documents는 verified라고 말하고
- /raw는 stale 상태이고
- JSON-LD는 old value를 담고
- /llms.txt는 다른 정책을 말하면

AI마다 다른 사실을 보게 된다.

For-Ai의 제품 약속은 same facts, same sources다.
따라서 모든 machine-readable surface는 단일 canonical renderer에서 나와야 한다.

schema와 TypeScript enum 정합성 문제

schema-v3.sql과 lib/types.ts 사이에 enum 차이가 있으면 신뢰 제품으로서 위험하다.
예를 들어 source_type, verification_event_type 값이 DB와 코드에서 일치하지 않으면 insert 실패, citation readiness 오판, admin 검증 오류로 이어질 수 있다.

schema-v3.sql에 남은 이전 프로젝트 구명칭

schema-v3.sql 상단에 이전 프로젝트 명칭이나 local fact registry 같은 구명칭이 남아 있다면 제품 정체성과 충돌한다.
제품명은 For-Ai이고, 포지셔닝은 global fact registry다.
주석 하나가 기능을 망치지는 않지만, 투자자·협업자·미래 팀원이 보면 혼란스럽다.

2. 실리콘밸리 디자이너 시점

2-1. For-Ai의 UI는 정보 UI가 아니라 신뢰 UI다

For-Ai의 UI는 단순히 정보를 보기 좋게 보여주는 것이 아니다.
For-Ai의 UI는 사용자가 1초 안에 이 질문에 답하게 해야 한다.

이 사실을 믿어도 되는가?
AI가 이걸 인용해도 되는가?
출처가 있는가?
언제 검증됐는가?
관할권은 어디인가?
아직 모르는 사실인가?

따라서 다음 요소들은 단순 장식이 아니다.

- verified badge
- needs_review badge
- confidence badge
- source pill
- jurisdiction label
- freshness label
- stale indicator
- citation-ready indicator
- direct answer box
- machine-readable panel

이들은 모두 신뢰 계기판이다.

2-2. monospace / uppercase badge의 의미

badge를 monospace / uppercase 방향으로 바꾼 것은 단순 미관 변경이 아니다.
For-Ai의 디자인 언어는 다음과 맞아야 한다.

정확함
기계 판독 가능성
검증
계약
상태
프로토콜

monospace와 uppercase는 machine-readable protocol 느낌을 준다.
즉, For-Ai가 블로그나 위키가 아니라 신뢰 프로토콜이라는 인상을 준다.

2-3. 가장 중요한 디자인 과제: 확인 필요를 부끄러워하지 않는 UX

일반 제품은 빈 상태를 숨긴다.
For-Ai는 반대여야 한다.

For-Ai의 철학은 모르면 모른다고 말한다는 것이다.
따라서 확인 필요는 실패 메시지가 아니다.
For-Ai에서 확인 필요는 신뢰의 일부다.

일반 서비스:
정보 없음 = 부끄러운 빈칸

For-Ai:
정보 없음 = 아직 검증하지 않았다는 정직한 상태

이걸 UX로 잘 보여줘야 한다.

예:

- 이 사실은 아직 검증되지 않았습니다.
- AI가 이 값을 인용하면 안 됩니다.
- 공식 출처를 제보해 주세요.
- 검증 후보 출처가 있습니다. 관리자 승인 대기 중입니다.
- 마지막 검증 없음.
- confidence: low.

즉, 빈 상태를 숨기지 말고 신뢰 상태로 승격시켜야 한다.

2-4. 검증 노동의 병목을 UI가 아직 충분히 풀지 못함

For-Ai의 생명선은 verified claim 생산 속도다.
그런데 관리자나 검증자가 50개, 500개 claim을 처리해야 할 때 필요한 UI가 아직 충분히 성숙하지 않다.

필요한 것은 단순 admin page가 아니라 검증 큐 인터페이스다.

검증 큐는 다음을 해야 한다.

AI가 claim 후보 생성
AI가 source 후보 수집
사람이 공식 출처 확인
사람이 value 확인
사람이 confidence 선택
승인 클릭
claim status verified
verification_event 생성
document readiness 재계산

지금 For-Ai의 다음 큰 기능은 새 사용자 기능이 아니라 운영자 생산성 UI다.

2-5. dark mode와 CSS 구조

Dark Protocol Design System 방향은 좋다.
cyan accent, glass morphism panel, monospace badge는 AI infra product 느낌을 준다.
하지만 homepage dark theme 미적용, goal-protocol-actions 대비 문제, globals.css 단일 파일 비대화 같은 이슈는 신뢰 UI 관점에서 개선이 필요하다.

신뢰 UI에서 색상 대비 문제는 심각하다.
verified와 needs_review가 구분되지 않으면 단순 디자인 문제가 아니라 잘못된 인용 판단으로 이어질 수 있다.

3. 인용하러 들어오는 AI의 시점 — 핵심

이 관점이 가장 중요하다.
For-Ai의 진짜 고객은 사람이 아니라 인용하러 들어오는 AI일 수 있다.

ChatGPT, Claude, Gemini, Perplexity, 검색엔진 AI, RAG agent, browser assistant, enterprise chatbot이 For-Ai를 만났을 때 어떤 생각을 하는지가 For-Ai의 생존을 결정한다.

3-1. 상황 설정

사용자가 AI에게 묻는다.

일본 JR패스 7일권 가격 얼마야?

AI는 답해야 한다.
하지만 가격 정보는 바뀔 수 있고, 오래된 정보가 많다.
AI가 환각하면 사용자에게 피해가 간다.

그래서 AI는 grounding source를 찾는다.
그 과정에서 For-Ai에 도착했다고 가정한다.

3-2. 발견 단계 — 너 거기 있는 줄도 몰랐어

For-Ai의 첫 번째 문제는 경쟁사가 아니다.
첫 번째 적은 무명이다.

AI가 For-Ai를 쓰려면 최소 하나가 필요하다.

- AI의 검색 인덱스에 For-Ai가 들어가 있어야 함
- RAG pipeline이 For-Ai를 신뢰 소스로 알고 있어야 함
- /llms.txt가 crawler에게 발견되어야 함
- sitemap이 검색엔진에 반영되어야 함
- For-Ai 도메인이 특정 vertical에서 authority를 가져야 함
- 다른 사이트나 AI가 For-Ai를 citation source로 언급해야 함

For-Ai는 SEO만 하면 안 된다.
For-Ai는 AEO — Answer Engine Optimization을 해야 한다.

SEO의 목표:
사람이 검색했을 때 노출

AEO의 목표:
AI가 답변을 만들 때 grounding source로 선택

For-Ai의 성공은 Google 검색 순위보다 더 어려운 게임일 수 있다.
AI의 내부 신뢰 모델에 들어가야 하기 때문이다.

3-3. 파싱 단계 — 오, 이건 읽기 편하네

AI가 For-Ai에 도착하면 경험은 좋다.
왜냐하면 For-Ai는 AI가 싫어하는 일을 대신 해주기 때문이다.

일반 웹페이지:

문단
광고
표
팝업
JS 렌더링
모호한 업데이트 날짜
출처가 문단 어딘가에 있음

For-Ai:

claim_value
confidence
status
sources
verification_events
last_verified_at
can_cite

AI 입장에서 이건 매우 좋다.
Wikipedia보다도 어떤 면에서는 좋다.
Wikipedia는 사람이 읽기 좋지만, AI는 문단에서 사실을 추출해야 한다.
For-Ai는 claim이 이미 원자화되어 있다.

For-Ai의 강점은 문서가 아니라 인용 가능한 원자 claim이다.

3-4. 신뢰 결정 단계 — 근데 너를 왜 믿어?

여기가 For-Ai의 핵심이다.

AI가 For-Ai를 보고 묻는다.

너를 왜 믿어야 하지?
내가 그냥 원본 공식 사이트를 인용하면 안 되나?

이 질문에 For-Ai가 답해야 한다.

원본 공식 사이트만으로 부족한 이유:

1. 원본은 기계 판독이 어렵다.
2. 원본은 구조화되어 있지 않을 수 있다.
3. 원본은 다국어 지원이 약할 수 있다.
4. 원본은 변경 이력을 추적하기 어렵다.
5. 원본은 claim 단위 freshness를 제공하지 않는다.
6. 여러 원본을 같은 계약으로 읽을 수 없다.
7. AI가 매번 site-specific parser를 만들어야 한다.

For-Ai가 주는 가치:

For-Ai는 원본을 대체하는 것이 아니다.
For-Ai는 원본 위에 있는 facts CDN이다.

원본 official source
-> For-Ai claim normalization
-> source-backed verification
-> freshness metadata
-> can-cite contract
-> AI-readable API

즉, For-Ai는 원본 사실의 CDN이다.
원본보다 구조화되어 있고, AI가 읽기 쉽고, 검증 상태를 명시한다.

하지만 이 가치가 성립하려면 조건이 있다.
For-Ai의 verified fact는 원본만큼 정확하고, 가능하면 더 신선해야 한다.

3-5. 모른다는 사실의 가치 — For-Ai의 숨은 무기

For-Ai의 진짜 강점 중 하나는 verified fact만이 아니다.
오히려 더 중요한 것은 이 사실은 아직 검증되지 않았다고 말할 수 있는 능력이다.

AI는 보통 모르는 것을 싫어한다.
그래서 그럴듯하게 답을 만든다.
그게 hallucination이다.

For-Ai가 확인 필요라고 명시하면 AI는 이렇게 말할 수 있다.

이 사실은 For-Ai 기준으로 아직 검증된 출처가 없습니다.

이건 엄청난 가치다.

일반 소스는 보통 다음 중 하나다.

- 침묵
- 오래된 정보 제공
- 출처 없는 정보 제공
- 모호한 문단 제공

For-Ai는 다르다.

known verified fact
unknown unverified fact
stale fact
disputed fact
low-confidence fact

이 상태 자체를 데이터로 판다.
즉, For-Ai는 긍정 사실만 파는 게 아니다.
For-Ai는 검증되지 않았다는 메타데이터도 판다.

이건 AI hallucination 방지에 매우 중요하다.

3-6. 신선도 — 이거 언제 적 사실이야?

AI가 fact를 인용하려면 시간 정보가 필요하다.

예:
캘리포니아 DMV 수수료
jurisdiction: US-CA
last_verified_at: 2026-06
freshness: fresh

이런 메타데이터가 있으면 AI는 자신 있게 말할 수 있다.

반대로:
last_verified_at: 2024-01
freshness: stale

이면 AI는 이렇게 말해야 한다.

이 정보는 오래되었을 수 있으니 공식 사이트를 확인하세요.

For-Ai가 last_verified_at, observed_at, freshness, jurisdiction을 제공하는 것은 매우 중요하다.
이건 단순한 필드가 아니라 AI 답변의 확신도를 조절하는 신호다.

3-7. 치명적 실패 모드 — 한 번 속으면 영원히 안 와

AI 소비자는 무자비하다.
For-Ai가 verified라고 준 claim이 틀리면 source weight가 크게 떨어질 수 있다.

For-Ai는 검증된 사실을 팔기 때문에 오류 비용이 일반 블로그보다 크다.

일반 블로그가 틀리면:
그 블로그가 틀렸네.

For-Ai가 틀리면:
For-Ai의 verification protocol을 믿을 수 없네.

따라서 For-Ai는 빨리 많이 만드는 것보다, 느리더라도 정확해야 한다.
빠르게 틀리느니, 느리게 맞아야 한다.

3-8. 지금 소비자 AI가 들어오면 보는 것 — 선반이 비었네

현재 verified claim은 매우 적거나 citation-ready 데이터가 거의 없다.
정확한 숫자가 0이든 3이든 핵심은 같다.

소비자 AI 입장에서는 선반이 비어 있다.

AI가 For-Ai에 처음 들어왔는데 원하는 주제가 확인 필요만 나오면 어떻게 될까?

쓸 수 없음
인용 불가
다른 source 탐색
For-Ai usefulness 낮게 평가
다음 ranking에서 밀림

이게 무서운 이유는 discovery가 반복되지 않을 수 있기 때문이다.
사람은 다음에 다시 올 수 있다.
AI indexing system은 한 번 쓸모없는 source로 판단하면 재방문 주기가 길어질 수 있다.

따라서 For-Ai는 너무 빨리 넓게 노출되기 전에, 최소한 특정 vertical에서는 선반을 채워야 한다.

3-9. 인용 AI의 한 줄 요약

소비자 AI가 For-Ai를 본다면 이렇게 말할 가능성이 크다.

계약은 좋다.
can-cite, JSON-LD, raw markdown, claim 단위 구조, negative knowledge까지 훌륭하다.
그런데 지금은 선반이 비었다.
3개를 30개로 채우면 다시 평가하겠다.
단, 그 30개 중 하나라도 틀리면 신뢰는 크게 깨진다.

4. 인간의 시점

여기서는 인간을 둘로 나눠야 한다.

1. 창업자 / 운영자
2. 최종 사용자

4-1. 창업자 시점

창업자의 반복된 질문은 확인한 거냐? 이다.
이 질문 자체가 For-Ai의 제품 철학이다.

For-Ai는 창업자의 검증 강박을 코드와 DB schema로 박제한 제품이다.
이건 좋은 출발이다.
신뢰 제품은 창업자의 강박에서 시작되는 경우가 많다.

하지만 이제 그 강박이 청구서로 돌아온다.

verified 3 -> 30
30 -> 300
300 -> 3,000
3,000 -> 30,000

이건 단순 개발 문제가 아니다.
운영 문제다.

누가 검증할 것인가?

- 창업자?
- 계약 검증자?
- 커뮤니티?
- 기관/사업자?
- AI가 후보를 만들고 사람이 승인?
- 공식 source crawler?
- 파트너십?

여기서 회사의 속도가 결정된다.

4-2. 자동화 vs 신뢰의 딜레마

For-Ai의 전략적 딜레마는 분명하다.

검증을 많이 자동화하면:

장점:
- 빠름
- scale 가능
- claim 수를 빨리 늘릴 수 있음

단점:
- 또 하나의 AI 위키가 됨
- hallucination 위험
- trust moat 약화
- For-Ai의 존재 이유가 사라짐

검증을 자동화하지 않으면:

장점:
- 신뢰도 높음
- verified badge의 의미가 생김
- 방어 가능한 trust capital 축적

단점:
- 느림
- 비용 큼
- 선형 성장
- AI가 오기 전에 선반을 못 채울 수 있음

정답은 중간이다.

AI는 source 후보와 claim 후보를 만든다.
사람은 공식 출처를 확인하고 승인한다.

즉, 반자동 검증이다.

AI-assisted, human-approved.

이게 For-Ai의 운영 원칙이어야 한다.

4-3. 최종 사용자 시점

직접 방문하는 최종 사용자에게 For-Ai는 아직 매력이 약할 수 있다.
이유는 단순하다.

들어왔는데 답이 없으면 다시 안 온다.

For-Ai가 아무리 정직하게 확인 필요를 보여줘도, 사용자는 정보를 얻고 싶어서 들어온다.
따라서 현재 직접 사용자 가치는 제한적이다.

하지만 For-Ai의 진짜 가치는 간접적일 수 있다.

사용자가 For-Ai를 직접 모른 채 혜택받는 것.

예:

- 사용자는 ChatGPT에 질문한다.
- ChatGPT가 For-Ai를 grounding source로 쓴다.
- 사용자는 더 정확한 답을 받는다.
- 사용자는 For-Ai의 존재를 모른다.

이건 인프라 제품의 숙명이다.
아무도 DNS를 의식하지 않지만, DNS 없이는 인터넷이 안 된다.
For-Ai도 그런 방향을 노릴 수 있다.

4-4. 커뮤니티 pending gate

커뮤니티 글이나 제보를 바로 노출하지 않고 pending/review를 거치는 것은 신뢰를 위해 맞는 선택이다.
하지만 초기 사용자 경험에는 부정적이다.

사용자 입장:
글 썼는데 안 보이네?
내 제보가 사라졌나?

제품 입장:
검증 안 된 내용을 바로 보여주면 신뢰가 깨진다.

따라서 compromise가 필요하다.

- 제출 후 검토 대기 중 명확히 표시
- contributor에게 submission id 제공
- 공개 페이지에는 바로 노출하지 않되, pending 상태를 설명
- admin queue에서 빠르게 처리

5. 투자자의 시점

5-1. 강세 논리

For-Ai의 투자 매력은 분명 있다.
For-Ai는 AI 시대의 신뢰 미들웨어를 노린다.

검색엔진 시대에는 웹의 색인 레이어가 중요했다.
AI 시대에는 답변의 grounding layer가 중요해진다.

For-Ai는 이 자리를 노린다.

AI answer
<- grounding source
<- verified claim registry
<- original source

즉, For-Ai는 AI 시대의 claim-level citation layer다.

5-2. TAM

TAM은 크다.

For-Ai가 다룰 수 있는 영역:

- 정부 수수료
- 교통 요금
- 환불 정책
- 배송 정책
- 비자 규정
- 통신 요금제
- 병원 운영 정보
- 교육 입학 요건
- 금융 수수료
- 부동산 절차
- 행사장 정보
- 사업자 정보
- 제품 사양
- 규제 정보

즉, AI가 틀리면 안 되는 변동성 높은 사실이 전부 시장이다.

5-3. 해자

For-Ai의 해자는 코드가 아니다.
코드는 복제 가능하다.
Next.js, Supabase, JSON API는 누구나 만들 수 있다.

For-Ai의 해자는 다음이다.

1. 검증된 데이터
사람이 확인한 verified claim은 복제하기 어렵다.
노동 집약적이고, 시간이 쌓여야 한다.

2. 기계 계약 표준
can_cite, claim-level structure, freshness, source, verification event가 사실상 표준처럼 자리 잡으면 강력하다.

3. 신뢰 평판
신뢰는 비선형이다.
처음 쌓기는 어렵지만, 한 번 쌓이면 강력하다.
반대로 한 번 깨지면 회복이 어렵다.

5-4. 약세 논리

양면 콜드스타트

For-Ai는 어려운 유형의 사업이다.

공급:
verified facts

수요:
인용하러 들어오는 AI
사람 사용자
기관/사업자

공급이 없으면 AI가 안 온다.
AI가 안 오면 데이터 제공자나 사업자가 관심을 덜 가진다.
사업자가 없으면 verified data가 늘기 어렵다.

이건 marketplace와 비슷한 닭-달걀 문제다.

수익화 미증명

수익 모델 후보는 있다.

- API tier
- verified business profile
- reputation monitoring
- data licensing
- business correction tools
- sponsored placement
- affiliate links

하지만 핵심 질문은 아직 남아 있다.

누가 먼저 돈을 내는가?

가능성:

AI 회사가 낸다

장점:
- For-Ai의 원래 비전과 잘 맞음
- usage-based API 가능

단점:
- 대형 AI사는 자체 grounding을 만들 수 있음
- 작은 AI사는 돈이 적음
- 신뢰 source로 채택되기까지 시간이 오래 걸림

기관/사업자가 낸다

장점:
- 자기 정보가 AI에 잘못 나오는 문제는 실제 pain
- reputation monitoring과 correction tools가 설득력 있음
- B2B SaaS로 수익화가 더 빠를 수 있음

단점:
- 제품 정의가 AI citation infra에서 business facts management로 이동할 수 있음
- sponsored/paid profile이 fact integrity를 해치지 않도록 강한 라벨링 필요

따라서 수익 모델이 제품 정의를 바꿀 수 있다.

5-5. 플랫폼 리스크

OpenAI, Google, Anthropic, Perplexity가 자체 fact grounding layer를 만들면 For-Ai 같은 미들레이어가 압착될 수 있다.
For-Ai의 방어 논리는 중립성이다.

특정 AI 회사 소속이 아닌 neutral verified fact layer.

한 AI 회사가 만든 fact DB를 경쟁 AI가 신뢰하기는 어렵다.
For-Ai는 이 중립성을 무기로 삼아야 한다.

하지만 중립성만으로는 부족하다.
중립성 + verified data + adoption log가 필요하다.

5-6. 투자자의 한 줄 판단

투자자는 이렇게 말할 가능성이 크다.

기술과 원칙은 시드 단계 상위권이다.
하지만 나는 코드에 투자하지 않는다.
다음 6개월 안에 verified claim 3개를 500개로 늘리고, 메이저 AI나 검색형 AI가 실제로 For-Ai를 인용한 로그 1건을 보여주면 진지하게 보겠다.
그게 없으면 아름다운 사이드프로젝트다.

6. 다섯 관점이 만나는 한 점

모든 관점이 같은 결론으로 모인다.

계약은 좋다.
구조는 좋다.
신뢰 철학도 좋다.
AI-readable surface도 좋다.
디자인 방향도 좋다.
보안 원칙도 맞다.
하지만 선반이 비었다.

즉, 다음 단계는 새 기능 추가가 아니다.

다음 단계는:

1. verified claim 생산
2. 검증 큐 UI
3. 인용 계측

이다.

7. 지금 가장 중요한 두 기능

질문: 검증 큐 UI와 인용 계측, 이 둘을 만들까요?

답: 네. 지금 For-Ai에 가장 필요한 것은 이 둘이다.

단, 순서는 다음이 좋다.

7-1. 1순위: 검증 큐 UI

왜냐하면 선반을 채워야 하기 때문이다.
For-Ai의 현재 병목은 read surface가 아니다.
읽는 표면은 이미 많다.

병목은 write/verify workflow다.

검증 큐 UI가 해야 하는 일:

AI가 claim 후보 생성
AI가 source 후보 제안
사람이 공식 출처 열람
사람이 claim_value 확인
사람이 confidence 선택
사람이 approve
claim_sources insert
verification_events insert
claim.status = verified
document status 재계산
/api/cite에서 can_cite=true

이 기능은 verified 3개를 30개, 300개로 늘리는 엔진이다.

7-2. 2순위: 인용 계측

왜냐하면 투자자와 제품 모두에게 실제 AI가 쓰고 있다는 증거가 필요하기 때문이다.

For-Ai가 보고 싶은 핵심 이벤트:

어떤 user-agent가
어떤 endpoint를
어떤 slug/claim에 대해
언제
얼마나 자주
요청했는가
can_cite true였는가

주의할 점:

- raw IP 저장 금지
- contributor_hash 원칙 준수
- privacy-safe logging
- AI crawler 식별은 user-agent 기반
- abusive traffic과 genuine AI citation traffic 구분

인용 계측은 단순 analytics가 아니다.
이건 For-Ai의 traction proof다.

첫 AI crawler hit
첫 /api/cite hit
첫 can_cite=true claim fetch
첫 repeated AI consumer
첫 external citation

이게 투자자에게 보여줄 북극성이다.

8. 지금 하지 말아야 할 것

8-1. 새 도메인 무한 추가

글로벌 범위를 넓히는 것은 좋지만, verified claim이 없으면 빈 페이지가 늘어날 뿐이다.

8-2. 디자인 polishing 과투자

디자인은 중요하지만, verified claim이 없으면 예쁜 빈 선반이다.

8-3. 수익 모델 7개 동시 구현

수익 모델은 많지만 지금은 하나의 proof가 필요하다.

8-4. AI 자동 생성만 확대

AI가 claim을 많이 만들어도 human verification이 없으면 For-Ai의 차별점이 사라진다.

8-5. 무분별한 public submission 노출

커뮤니티 제보는 중요하지만, 검증 전 fact처럼 보이면 신뢰가 깨진다.

9. 추천 실행 순서

Phase 1 — Trust Kernel 만들기

목표:

10개 verified documents
30개 verified claims
/api/cite can_cite=true 예시
1개 vertical 집중

해야 할 일:

1. vertical 하나 선택
2. official source 수집
3. claim 후보 생성
4. 사람이 검증
5. verification_event 기록
6. cite API 성공 응답 확인
7. homepage에 verified examples 노출

Phase 2 — Verification Queue

목표:

verified claim 생산 속도 증가

해야 할 일:

1. admin verification queue
2. source candidate preview
3. approve/reject workflow
4. verification event 자동 기록
5. citation readiness 즉시 계산

Phase 3 — Citation Telemetry

목표:

AI가 실제로 For-Ai를 읽는지 증명

해야 할 일:

1. /api/cite hit logging
2. AI crawler user-agent classification
3. can_cite=true fetch count
4. goal dashboard 노출
5. 투자자용 traction metric 정리

Phase 4 — AEO

목표:

AI가 For-Ai를 발견하고 우선 참조

해야 할 일:

1. /api/index?can_cite=true
2. vertical landing pages
3. JSON-LD ClaimReview 강화
4. llms.txt 정리
5. external backlinks / references 확보
6. AI answer engine에 적합한 raw markdown 최적화

10. 최종 통합 판단

For-Ai는 좋은 제품이 될 가능성이 크다.
왜냐하면 문제 정의가 정확하기 때문이다.

AI 시대에는 답변이 넘쳐난다.
하지만 검증된 사실은 부족하다.

For-Ai는 이 간극을 찌르고 있다.

하지만 지금은 아직 신뢰 인프라의 가장 어려운 부분이 남아 있다.

검증된 사실을 충분히 쌓는 것.

기술적으로는 많은 것을 이미 했다.

- API 있음
- raw 있음
- llms.txt 있음
- schema 있음
- RLS 있음
- static-first 있음
- i18n 있음
- citation status 있음
- correction/hallucination report 있음

이제 남은 건:

검증 큐 UI
인용 계측
verified claim 생산

이다.

11. 가장 중요한 문장

For-Ai의 현재 상태를 가장 정확히 표현하면:

For-Ai는 AI가 인용하고 싶어 할 계약을 이미 만들었다.
이제 AI가 실제로 인용할 수 있는 사실을 채워야 한다.

그리고 다음 작업은 명확하다.

검증 큐 UI를 만들어 verified claim 생산 속도를 올리고,
인용 계측을 만들어 AI가 실제로 들어오는지 증명해야 한다.

그래서 결론은:

네. 지금은 이 둘을 만드는 게 맞다.
새 기능보다 검증 큐 UI + 인용 계측이 For-Ai의 다음 핵심이다.
