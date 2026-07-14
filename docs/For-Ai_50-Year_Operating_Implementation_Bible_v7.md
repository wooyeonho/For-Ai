# For-Ai 50-Year Operating & Implementation Bible v7
## Trust Infrastructure Constitution · Product Strategy · Build Contract · Codex Runbook

**Status:** Canonical single source of truth  
**Effective date:** 2026-07-12  
**Owner:** For-Ai  
**Next mandatory full review:** 2027-07-12  
**Review sooner when:** material law/standard change, critical incident, new country, new high-risk domain, new auto-publication phase, major provider/model change

> 이 문서는 지금까지의 v5/v6, Task 5 v2/v3, A1~A6, 최종 정오표 E1~E6의 비충돌 세부 계약을 모두 통합했다. 앞으로 Codex와 운영자는 이 문서 하나만 사용한다. 별도 정오표를 누적하지 않는다.
>
> 한 PR이 승인·병합·운영 smoke test를 통과하기 전 다음 PR을 시작하지 않는다.
>
> 전체 구현 순서:
>
> **Baseline → Task 0-A → 0-B → 1 → 2 → 3 → 4 → Integration Gate → 5-0 → 5-A → 5-B1 → 5-B2 → 5-F → 5-P1 → 5-D → 5-E**

## 문서 내부 우선순위

1. Book I의 헌법·신뢰 불변식
2. 현재 Phase와 DB에 고정된 versioned policy
3. 해당 Task의 명시적 implementation contract
4. 기존 저장소의 실제 타입·공용 helper·public contract
5. 예시 코드

예시 코드와 저장소가 다르면 임의 중복 타입·테이블을 만들지 않고 기존 구조에 의미를 매핑한다. 단, 헌법과 안전 불변식은 우회하지 않는다.

## 사용법

- 운영자는 Book I~III와 Book VII을 사용한다.
- Codex는 Book IV~VI의 순서·계약·프롬프트를 사용한다.
- PR reviewer는 각 Task의 DoD와 Book VII의 보안·복구 증거를 확인한다.
- 미래 정책은 기존 사건을 조용히 재해석하지 않고 새 version으로 추가한다.

---

---

# Book I. 50년 운영 헌법

## 1. 현실적 약속

이 문서는 부·성공·세계 1위를 보장하지 않는다. 그런 결과를 보장하는 문서는 존재하지 않는다. 대신 다음 확률을 장기간 높이는 운영체계를 정의한다.

- 신뢰가 시간이 갈수록 누적될 것
- 오류가 숨겨지지 않고 복구될 것
- 운영자가 바뀌어도 시스템이 존속할 것
- 기술 공급자와 유행이 바뀌어도 핵심 데이터가 남을 것
- 수익이 신뢰를 훼손하지 않고 반복적으로 발생할 것
- 법·표준·사회 기대가 바뀌면 정책층만 교체할 수 있을 것

For-Ai의 장기 자산은 코드가 아니라 **검증된 claim, provenance, 정정 이력, 공개 신뢰, 기여자 네트워크, 기관 통합, 운영 규율**이다.

## 2. 3층 영속 구조

### 헌법층 — 매우 드물게 변경

- AI는 인간 검증을 대체하지 않는다.
- verified는 절대 진리가 아니라 특정 시점·버전·증거·정책 아래의 검증 상태다.
- 콘텐츠와 광고·후원은 명시적으로 분리한다.
- 정정·반론·quarantine은 발행만큼 중요한 기능이다.
- 개인정보 최소화와 보안 fail-closed를 우선한다.
- 감사 기록과 provenance는 삭제로 문제를 숨기지 않는다.
- 한 공급자·모델·클라우드가 제품의 생존 조건이 되지 않게 한다.

헌법 변경은 최소 두 차례의 독립 리뷰, 영향 분석, migration·rollback 계획, 공개 change note를 필요로 한다.

### 정책층 — 버전 관리

- 검증 정책
- risk policy
- source policy
- freshness policy
- reviewer qualification
- rate limits
- retention
- pricing
- incident SLA

모든 정책은 version, effective_from, owner, reason, test evidence를 가진다. 기존 사건에 소급 적용하지 않는 것을 기본으로 한다.

### 어댑터층 — 자유롭게 교체

- LLM provider
- search provider
- hosting/cloud
- email/notification provider
- analytics
- storage
- rate limiter
- font/rendering

어댑터 교체 시 public contract, IDs, provenance, export format을 보존한다.

## 3. 제품 신뢰 헌법

1. AI-generated content는 AI provenance를 영구 표시한다.
2. verified 상태 변경은 허용된 RPC와 정책만 통과한다.
3. claim text·evidence 변경은 새 version이다.
4. vote·publication은 정확한 version과 snapshot에 결박된다.
5. high/unknown risk는 자동 발행하지 않는다.
6. 공개 claim에는 문제 신고와 correction history가 있다.
7. 외부 URL은 단일 safe fetch 계층만 사용한다.
8. private input은 목적 외 저장하지 않는다.
9. 오류 상태는 정상 상태보다 짧거나 no-store cache를 사용한다.
10. rollback은 history를 삭제하지 않는다.
11. 광고·후원은 검증 결과에 영향을 줄 수 없다.
12. 사용자·검토자에게 중독적 조작을 사용하지 않는다.
13. 중요한 상태는 앱 코드가 아니라 DB에서도 검증한다.
14. 자동화 확대는 calendar가 아니라 측정 가능한 gate로 결정한다.
15. 운영자가 없어도 데이터 export와 복구가 가능해야 한다.

## 4. 50년 기술 독립성

- PostgreSQL 표준 구조와 export 가능한 데이터 모델을 우선한다.
- 모든 핵심 데이터는 정기적으로 open format으로 export한다: SQL/CSV/JSON/NDJSON/XML.
- object storage에는 content hash와 manifest를 둔다.
- provider-specific ID는 canonical internal ID와 분리한다.
- model output은 provider 이름이 아니라 model provenance contract로 저장한다.
- public API는 versioned하고 deprecation window를 둔다.
- domain·DNS·code signing·backup key의 소유권을 법인/재단의 공식 자산으로 관리한다.
- 한 명만 아는 secret, 수동 절차, 결제 계정이 존재하지 않도록 runbook과 break-glass 계정을 둔다.

## 5. 승계와 key-person risk

창업자 1인 운영 단계부터 다음을 준비한다.

- domain registrar, cloud, GitHub, Supabase, payment, email의 소유권 목록
- 비상 접근 절차와 2인 복구 가능 구조
- 암호화된 recovery kit와 정기 복구 시험
- 법인 소유·상표·저작권·데이터 권리 문서
- 운영자 부재 시 claim 신고와 critical incident를 받을 대리 연락망
- annual succession drill
- 운영 권한과 소유권의 분리
- 조직 전환 시 administrator, editor, security, privacy, finance role 분리

## 6. 장기 변경 원칙

- 새 기술을 넣는 이유는 유행이 아니라 명확한 SLO·비용·품질 개선이어야 한다.
- 대규모 rewrite보다 strangler migration을 선호한다.
- 데이터 migration은 expand-first다.
- 사용하지 않는 미래 고위험 코드는 미리 만들지 않는다.
- 실험은 shadow → assisted → canary → expansion 순서다.
- 모든 자동화는 kill switch와 human recovery path를 가진다.

---

# Book II. 세계 수준 기준선과 갱신 체계

## 1. 적용 방식

표준을 “한 번 준수하고 끝나는 체크리스트”로 사용하지 않는다. For-Ai는 각 표준을 control objective로 매핑하고, 매년 공식 최신판·법적 적용 범위·내부 증거를 재검토한다.

현재 기준일: **2026-07-12**.

## 2. Standards registry

| 분야 | 현재 기준선 | For-Ai 적용 |
|---|---|---|
| AI risk | NIST AI RMF 1.0 및 NIST AI 600-1 GenAI Profile | Govern/Map/Measure/Manage, provenance, pre-deployment test, incident disclosure |
| AI management | ISO/IEC 42001:2023 | AI policy, roles, lifecycle, supplier, performance review, continual improvement |
| AI impact | ISO/IEC 42005:2025 | 개인·집단·사회 영향평가, lifecycle update |
| Information security | ISO/IEC 27001:2022 | ISMS risk register, access, supplier, incident, audit |
| Cyber risk | NIST CSF 2.0 | Govern/Identify/Protect/Detect/Respond/Recover |
| Secure SDLC | NIST SP 800-218 SSDF 1.1 | secure requirements, protected build, vulnerability response |
| App security | OWASP ASVS current stable | authentication, access, validation, API, logging verification |
| GenAI security | OWASP GenAI Security Project current risks | prompt injection, output handling, agency, supply chain, data leakage |
| Accessibility | WCAG 2.2 AA | public UI and contributor/admin critical flows |
| Privacy | GDPR principles and applicable local laws | purpose limitation, minimization, retention, rights, DPIA triggers |
| AI regulation | EU AI Act and applicable jurisdictions | role/risk classification, transparency, high-risk trigger review |
| Business continuity | ISO 22301:2019 principles | BIA, recovery objectives, exercises, supplier continuity |
| Software supply chain | SLSA 1.1, SPDX, OpenSSF Scorecard | provenance, pinned builds, SBOM, dependency acceptance |

표준 버전이 바뀌면 바로 구현을 바꾸지 않는다. Standards Review PR에서 영향·gap·우선순위·migration을 승인한 후 정책과 control evidence를 갱신한다.

## 3. Control evidence registry

각 control은 다음을 가진다.

```text
control_id
standard_reference
objective
owner
implementation
machine_test
manual_test
evidence_location
review_frequency
last_reviewed
next_review
exceptions
risk_acceptance
```

“문서에 적혀 있음”은 증거가 아니다. CI output, pgTAP, access review, restore drill, incident exercise, audit sample과 같은 반복 가능한 증거가 필요하다.

## 4. 법·규제 갱신

- 서비스 제공 국가, 사용자 국가, 데이터 처리 위치를 inventory한다.
- 신규 국가 진입 전 privacy·consumer·defamation·AI·accessibility 검토를 수행한다.
- 의료·법률·금융·선거·개인 평판과 같은 고위험 영역은 별도 legal policy 없이는 자동화하지 않는다.
- 법적 요청, correction, right-of-reply, data-subject request의 접수·보존·처리 SLA를 둔다.
- 본 문서는 법률 자문을 대체하지 않으며 적용 지역의 변호사 검토 trigger를 명시한다.

## 5. 접근성 원칙

신규 critical flow는 WCAG 2.2 AA를 출시 gate로 한다. 사이트 전역 legacy remediation은 계획적으로 진행하되 신규 debt를 추가하지 않는다.

필수 증거:

- keyboard-only E2E
- screen-reader smoke
- visible focus
- color-independent status
- 200%/400% zoom와 reflow
- reduced motion
- RTL smoke
- locale별 date/number/plural rules
- axe 자동 테스트와 수동 review

---

# Book III. 50년 사업·운영·부의 복리 구조

## 1. 경제적 원칙

For-Ai가 장기적으로 큰 가치를 만들려면 트래픽 자체가 아니라 **신뢰 가능한 구조화 사실 인프라**를 소유해야 한다.

성장 순환:

```text
사용자 질문·검색 수요
→ 검증 가능한 claim 생산
→ citation·badge·feed·API 배포
→ 외부 backlink·기관 이용
→ 더 많은 수요·source·기여자
→ 품질과 coverage 상승
→ 반복 매출과 브랜드 신뢰
```

## 2. 수익 포트폴리오

무료 public registry는 신뢰와 검색 유입의 기반으로 유지한다. 수익은 검증 결과를 판매하는 것이 아니라 **접근성·통합·운영 도구·SLA**에서 만든다.

1. API paid tiers: quota, bulk, history, webhook, SLA
2. Institution subscriptions: newsroom, school, research, compliance team
3. Enterprise verification workflow: private queues, audit export, role control
4. Data licensing: provenance 포함 snapshot·change feed; 공개 권리와 source license 준수
5. Monitoring: watched claim, freshness, correction alerts
6. Verification infrastructure: badge/embed/API를 위한 white-label이 아닌 명확한 For-Ai attribution
7. Grants and public-interest partnerships
8. Sponsor support: 콘텐츠와 명확히 분리, status·ranking·검증 결과에 영향 0

금지:

- 돈을 받은 claim을 verified로 우대
- sponsor를 source independence로 가장
- public correction 숨기기
- 광고 때문에 clickbait demand를 우선
- 사용자 민감 입력 판매

## 3. Unit economics

각 핵심 action의 비용을 측정한다.

```text
cost_per_check
cost_per_draft
cost_per_published_claim
cost_per_source_refresh
cost_per_active_institution
gross_margin_by_plan
support_minutes_per_customer
```

가격은 다음 조건을 만족해야 한다.

```text
price > infrastructure + model + payment + support + risk reserve
```

AI 비용이 매출보다 빠르게 증가하면 모델을 바꾸기 전에 제품 quota·batching·cache·workflow를 먼저 최적화한다.

## 4. 재무 안전장치

- 운영비 최소 12개월 현금 runway를 장기 목표로 둔다.
- 법률·보안 incident reserve를 별도 관리한다.
- 단일 고객 매출 의존도를 점진적으로 낮춘다.
- 단일 LLM/provider 비용 의존도를 낮춘다.
- 모든 paid feature는 usage cap과 hard budget을 가진다.
- 월별 실제 원가와 매출을 reconciliation한다.
- 신뢰 품질을 낮춰 단기 매출을 늘리는 결정은 금지한다.

## 5. North-star와 guardrails

North-star 후보:

```text
월간 외부에서 실제로 사용된 active verified claim 수
```

필수 guardrail:

- correction/rollback rate
- provenance completeness
- freshness overdue
- unsupported evidence
- privacy/security incident
- source diversity
- non-English coverage
- user report SLA
- cost per durable claim

페이지뷰와 streak는 보조 지표이며 품질 guardrail을 이길 수 없다.

## 6. 창업자 운영 리듬

Phase 0~1의 현실적 운영:

### 매일 20~30분

- critical report
- security/cost alert
- stuck job

### 주 2~3회, 회당 30분

- operator-assisted draft review
- high-risk escalation
- correction queue

### 매주 60분

- quality/cost/freshness report
- PR 승인·배포
- backlog 순위

### 매월 2시간

- revenue/unit economics
- access review
- dependency/security review
- source policy exceptions

### 분기별 반나절

- risk register
- disaster recovery sample
- model/prompt regression
- legal/regulatory watch
- standards gap

### 매년 1~2일

- full restore drill
- succession drill
- architecture and vendor exit review
- AI impact assessment update
- transparency report
- strategy and pricing review

“운영만 하면 되는 상태”는 무관심이 아니라 **예외만 처리하는 안정된 자동화**다. Phase 3 전에는 사람의 편집 작업이 의도적으로 남는다.

## 7. 조직화 trigger

| Trigger | 추가 역할/통제 |
|---|---|
| paid customers 10+ | support/on-call ownership 분리 |
| MRR이 창업자 생계비를 안정적으로 초과 | 법인·회계·세무 체계 강화 |
| active contributors 100+ | trust & safety/community 운영 |
| auto publication 500/month | independent quality audit, tamper-evident audit export |
| enterprise SLA 계약 | formal incident/on-call, DR RTO/RPO |
| 여러 국가에서 유의미한 사용 | privacy/legal/localization owner |
| critical source/license 규모 증가 | source rights and content counsel |

## 8. 10·20·30·50년 roadmap

### 0~3년

- 정확성·provenance·correction의 제품 적합성
- API와 institution 첫 반복 매출
- operator-assisted baseline
- community seed

### 3~10년

- 분야별 verification profile
- 다국어 source network
- 기관 integration과 audit export
- 독립 감사와 formal management systems
- provider-independent infrastructure

### 10~20년

- public-interest data institution
- research·media·education 표준 integration
- 장기 archive와 public governance
- 다세대 운영자와 이사회

### 20~30년

- 기술 stack의 두 번째·세 번째 전면 교체를 데이터 손실 없이 완료
- 국제 correction·provenance 표준에 기여
- founder-independent governance

### 30~50년

- 특정 AI·검색·클라우드 회사와 무관한 공공 신뢰 인프라
- 장기 보존·기관 승계·재정적 자립
- 헌법층을 유지하면서 정책과 어댑터를 계속 교체

---

# Book IV. Task 0~5 통합 구현 계약

## 0. 이 문서를 사용하는 방법

### 0.1 PR 단위 실행

각 Task는 별도 PR이다. 각 PR은 다음 순서로 진행한다.

1. 기존 구현 조사
2. 현재 동작 characterization test
3. 변경 범위와 비범위 확정
4. additive implementation
5. migration/backfill이 있으면 reconciliation
6. 보안·권한·개인정보 검증
7. UI·접근성·다국어 검증
8. 4종 명령 실행
9. PR evidence 작성
10. 승인·병합·운영 smoke test
11. 다음 PR 진입

필수 명령:

```bash
npm run lint
npm run test
npm run ci:guards
npm run build
```

저장소에 다음 명령이 존재하면 함께 실행한다.

```bash
npm run check:citation-surfaces
npm run check:mojibake
npm run check:schema-types
```

### 0.2 기존 코드 보존 원칙

For-Ai는 greenfield가 아니다. 이미 Codex가 구현한 코드를 무조건 다시 만들지 않는다.

모든 기존 artifact는 다음 중 하나로 분류한다.

- `KEEP`: 목표와 동일하므로 유지
- `HARDEN`: 구조는 유지하고 검증·권한·테스트 보강
- `WRAP`: 기존 public contract를 유지하며 새 내부 구현으로 연결
- `MIGRATE`: 호출자를 단계적으로 새 contract로 이전
- `DEPRECATE`: 새 호출 금지, 기존 호환만 유지
- `REMOVE`: 대체와 참조 0건이 증명된 뒤 별도 PR에서 제거

금지:

- 동일 의미의 table/RPC/helper/component 중복 생성
- 기존 ID, document slug, public URL 변경
- 기존 verified 데이터를 근거 없이 재분류
- 과거 source snapshot이나 quote provenance 조작
- 기존 테스트 삭제로 통과
- 한 PR에서 additive schema, 전역 권한 회수, legacy 코드 제거를 동시에 수행
- 기존 failure와 신규 regression을 혼합 보고

### 0.3 공통 산출물

각 PR 설명에 다음을 기록한다.

- 기존 코드 조사 결과
- 재사용·보강·wrapper·migration·deprecation 항목
- 변경 파일
- schema/RLS/GRANT/RPC
- caller role
- 개인정보·로그·retention
- migration/backfill
- rollback
- baseline failure와 신규 failure 구분
- 명령 실행 결과
- 수동 smoke test
- 남은 위험과 다음 PR dependency

---

## 1. 전역 불변식

### 1.1 Schema와 타입

- `schema-v3.sql`이 DB schema SSOT다.
- migration 디렉터리가 존재하면 실제 timestamp migration도 반드시 작성한다.
- DB enum/check/RPC 반환 타입 변경 시 `lib/types.ts`를 함께 변경한다.
- `scripts/check-schema-types.mjs` 또는 동등 guard를 통과한다.
- destructive migration 금지. Expand → Backfill → Adapt → Enforce → Contract 순서.

### 1.2 Supabase 권한

신규 table/view/RPC마다 다음을 명시한다.

1. 사용 role: anon / authenticated / server worker / admin / dedicated owner
2. 최소 GRANT
3. exposed schema table의 RLS
4. `SECURITY DEFINER SET search_path = ''`
5. 함수 내부 schema-qualified object
6. public RPC 반환 컬럼 최소화
7. service/secret key client bundle 노출 0
8. 가능한 경우 범용 service role 대신 전용 최소 권한 role

### 1.3 UI와 국제화

- UI_SYSTEM.md 준수
- max-width 960px
- 정부 팩트 DB 톤
- 장식성 UI, 과도한 animation 금지
- verified=green, needs review=yellow, disputed=red, unknown/unavailable=gray
- 지원 locale: `ko`, `en`, `hi`, `ar`, `es`, `ja`, `zh`
- 사용자 UI 문자열 하드코딩 금지
- typed dictionary 또는 typed translator 사용
- RTL에서 layout이 깨지지 않도록 logical properties 우선
- status는 색만으로 전달하지 않음

### 1.4 개인정보

- `/api/check` 입력 원문과 개별 문장을 DB, analytics, error log, trace에 저장하지 않음
- 원시 IP 영구 저장 금지
- URL query에 사용자 문장·민감 데이터를 넣지 않음
- analytics는 aggregate metadata만
- 로그에 request body 금지
- retention은 schema/job/test로 강제
- 외부 LLM provider 입력에는 사용자 식별자를 넣지 않음

### 1.5 접근성 최소선

모든 신규 UI:

- keyboard-only
- visible focus
- color-only status 금지
- `aria-live`/`role=status`는 필요한 곳에만
- async result `aria-busy`
- error와 input 연결
- reduced motion
- 200% zoom smoke test
- 긴 claim wrapping
- 카드 전환 focus 관리
- progress bar ARIA
- 신규 public page axe smoke test 권장

### 1.6 보안

- external URL fetch는 Task 5의 `safeFetchExternalSource` 외 경로 금지
- JSON endpoint는 content type, 실제 byte limit, schema validation
- rate limit은 expensive work 이전
- server/client boundary에서 secret import 금지
- middleware 제외는 최소 경로만
- cacheable trust surface는 오류 상태와 정상 상태의 cache를 분리
- sponsored content는 명시 라벨 없이는 badge/embed/OG/feed에 노출 금지

---

## 2. 전체 PR 순서

| 순서 | PR | 결과 |
|---:|---|---|
| 0 | Baseline | 기존 상태와 failure baseline 고정 |
| 1 | Task 0-A | legacy gamification route 308 redirect |
| 2 | Task 0-B | legacy files 제거 + contributor streak |
| 3 | Task 1 | AI 답변 claim 매칭 검사기 |
| 4 | Task 2 | badge + embed |
| 5 | Task 3 | OG/Twitter image |
| 6 | Task 4 | RSS + changelog |
| 7 | Integration Gate | Task 0~4 안정성 확정 |
| 8 | Task 5-0 | Task 5 구조 기반 |
| 9 | Task 5-A | demand signal |
| 10 | Task 5-B1 | safe fetch + snapshot |
| 11 | Task 5-B2 | shadow AI drafting |
| 12 | Task 5-F | 신고·quarantine·정정 |
| 13 | Task 5-P1 | operator-assisted publication |
| 14 | Task 5-D | notification outbox |
| 15 | Task 5-E | freshness bot |

---

## 3. Baseline PR 또는 작업 전 체크포인트

코드 변경 없이 현재 상태를 기록한다.

```bash
git status
git branch --show-current
git log --oneline --decorate -n 30
npm ci
npm run lint
npm run test
npm run ci:guards
npm run build
```

작성:

```text
docs/implementation/BASELINE_BEFORE_TASK0.md
```

필수 기록:

- 현재 통과·실패 명령
- 기존 BUILD_ERROR_REPORT.md 항목
- 지원 locale
- middleware matcher
- next.config redirects/headers
- sitemap/robots/llms
- claim/document route
- citation status union
- schema/types guard
- source/search helper
- authentication/admin helper
- cron pattern
- notification 구조
- 현재 open PR 또는 미병합 branch

기존 실패는 이후 PR의 신규 regression으로 취급하지 않는다. 단, 신규 변경이 기존 실패를 악화하면 해당 PR에서 해결한다.

---

## 4. Task 0-A — 게이미피케이션 리다이렉트

### 목표

legacy gamification URL을 먼저 안전하게 308 redirect하고, 파일은 아직 삭제하지 않는다.

### 범위

- `/quests` → `/contributors`
- `/missions` → `/contributors`
- `/bounties/**` → `/leaderboard`
- `/challenges/**` → `/leaderboard`
- `/campaigns/**` → locale home

지원 locale에만 적용한다.

### 기존 코드 조사

```bash
grep -RIn \
  "quests\|missions\|bounties\|challenges\|campaigns" \
  app lib scripts test next.config.* middleware.* 2>/dev/null
```

다음에 남은 링크를 확인한다.

- header
- footer
- homepage
- contributor pages
- leaderboard
- sitemap
- robots
- llms
- tests
- analytics
- emails/notifications

### 구현 계약

```ts
import { SUPPORTED_LOCALES } from './lib/i18n/locales';

const LOCALE_PATTERN = SUPPORTED_LOCALES.join('|');

const gone = [
  { from: 'quests', to: 'contributors' },
  { from: 'missions', to: 'contributors' },
  { from: 'bounties', to: 'leaderboard' },
  { from: 'challenges', to: 'leaderboard' },
  { from: 'campaigns', to: '' },
];

async redirects() {
  return gone.map(({ from, to }) => ({
    source: `/:locale(${LOCALE_PATTERN})/${from}/:path*`,
    destination: to ? `/:locale/${to}` : '/:locale',
    permanent: true,
  }));
}
```

- `permanent: true` = HTTP 308
- `:path*` 하나로 base/nested 모두 처리
- locale pattern을 실제 supported locales로 제한
- next.config import 문제 발생 시 literal 복사 가능하나 CI guard로 일치 검사
- 기존 redirects가 있으면 덮어쓰지 말고 병합
- 영구 redirect 적용 전 모든 목적지는 feature flag와 무관하게 HTTP 200이어야 한다.

### 링크 정리

Task 0-A에서 내부 링크는 제거한다. URL files는 Task 0-B까지 유지한다.

### 테스트

- 7개 locale base route
- nested route
- query string 유지
- `/en/quests` → HTTP 308 + `Location: /en/contributors`
- `/ko/bounties/example` → HTTP 308 + `Location: /ko/leaderboard`
- `/api/quests` → **HTTP 308이 아니어야 함**; 기존 API/404 동작 유지
- `/embed/quests` → **HTTP 308이 아니어야 함**; 기존 embed/404 동작 유지
- unsupported locale 오매칭 없음
- sitemap dead route 없음
- navigation dead link 없음
- middleware와 redirect 순서 dev smoke test

### 롤백

redirect 배열만 되돌리면 기존 page file이 남아 있으므로 즉시 복구 가능하다.

### 완료 기준

- [ ] 5 route family 모두 308
- [ ] 정확한 `Location`
- [ ] 모든 redirect 목적지가 feature flag on/off 모두에서 HTTP 200
- [ ] API/embed 오매칭 0
- [ ] 내부 link 0
- [ ] 4종 명령 통과
- [ ] deploy preview에서 curl 확인

---

## 5. Task 0-B — legacy 파일 제거 + Streak 통합

### 선행 조건

Task 0-A가 production 또는 합의된 환경에서 안정 확인됨.

### 제거 범위

```text
app/[locale]/quests
app/[locale]/missions
app/[locale]/bounties
app/[locale]/challenges
app/[locale]/campaigns
```

삭제 전 전용 dependency만 확인한다.

반드시 유지:

```text
lib/point-awards.ts
lib/contributor-streaks.ts
lib/gamification-leaderboard.ts
```

legacy point event enum은 기존 DB 역직렬화를 위해 제거하지 않는다.

### Streak 대상

- 인증된 현재 contributor 본인
- contributors page 상단 1개
- `accepted_contribution`만 표시
- 비로그인 또는 summary 없음: 렌더 안 함
- 각 contributor row에는 표시 안 함

### UTC 상태

- `activeOn`이 UTC 오늘: green status + active today
- 오늘이 아니고 `currentDays > 0`: gray + continue today, 끊김 표현 금지
- `currentDays === 0`: start today
- 기존 streak library의 날짜 기준을 우선 사용
- UTC tooltip

### milestone

```text
3, 7, 30, 100
```

현재 구간 기준 progress:

```ts
const next = MILESTONES.find((m) => m > currentDays);
const prev =
  [...MILESTONES].reverse().find((m) => m <= currentDays) ?? 0;

const progress = next
  ? Math.round(((currentDays - prev) / (next - prev)) * 100)
  : 100;
```

100일 이상은 progress 대신 localized `streak.maxed`.

### typed strings

필요 key:

```text
streak.title
streak.current
streak.longest
streak.active_today
streak.continue_today
streak.start_today
streak.maxed
streak.timezone_note
```

`Record<string,string>` 금지.

### 접근성

- green/gray dot에 visible text
- progressbar ARIA
- tooltip keyboard/touch
- reduced motion에서 transition 제거

### 테스트

- login/no-login
- no summary
- current 0/2/3/7/8/30/100/101
- active today/not today
- UTC date boundary
- leaderboard unchanged
- legacy point event deserialization
- deleted route direct file 없음 + redirects 정상

---

## 6. Task 1 — AI 답변 claim 매칭 검사기

### 제품 정의

이 기능은 진실 판정기가 아니다.

> 사용자의 문장을 registry claim과 매칭하고, 매칭된 claim의 현재 검증 상태를 표시한다.

UI에서 “사실 여부를 판정한다”는 표현 금지.

### 6.1 Citation presentation foundation

Task 1 PR에 포함한다.

```ts
type CitationPresentation = {
  machineLabel: string;
  labelKey: CitationStatusLabelKey;
  color: string;
};
```

schema status mapping은 exhaustive:

```ts
const SCHEMA_PRESENTATION = {
  verified: ...,
  needs_review: ...,
  disputed: ...,
} satisfies Record<CitationStatus, CitationPresentation>;
```

display-only:

```text
unknown
unavailable
```

함수 분리:

```ts
presentationForStatus(status: CitationStatus)
presentationForUnknown(status: string | null | undefined)
presentationForKey(key: PresentationKey)
```

내부 domain code에서 `string` fallback 함수를 사용하지 않는다.

UI는 labelKey 번역, badge/OG/RSS는 machineLabel.

### 6.2 평가 데이터

세트:

```text
test/fixtures/claim-similarity/calibration.json
test/fixtures/claim-similarity/regression.json
test/fixtures/claim-similarity/holdout.json
```

- threshold 결정은 calibration만
- 알려진 bug는 regression
- holdout은 threshold 결정에 사용 금지
- 7 locale smoke
- ko/en은 더 큰 set
- hard negatives:
  - negation
  - number
  - date
  - increase/decrease
  - before/after
  - same entity, different conclusion
  - subject/object reversal

pair test뿐 아니라 고정 registry를 이용한 end-to-end retrieval `Recall@5` test를 추가한다.

핵심 지표:

- Recall@5
- final precision
- hard-negative false-positive rate
- not-found false-negative rate
- locale별 결과

false positive 최소화를 우선한다.

### 6.3 Sentence segmentation

- `Intl.Segmenter(locale, { granularity: 'sentence' })` 우선
- locale은 `SupportedLocale`로 검증
- newline 먼저 분리
- fallback에 `.!?。？！؟।॥`
- CJK min 8 chars
- default min 15 chars
- `MAX_SENTENCES` 설명은 “isAnalyzable을 통과한 문장”

### 6.4 Similarity와 contradiction

lexical similarity는 candidate ranking용이다.

CJK:

```text
max(word Jaccard, char bigram Jaccard)
```

최종 eligibility:

```text
similarity >= MATCH_THRESHOLD
AND contradictionCheck == none
```

contradiction gate:

```text
negation_mismatch
quantity_mismatch
polarity_mismatch
```

quantity는 숫자 문자열만 비교하지 말고 최소한 다음 구조로 추출한다.

```ts
type Quantity = {
  normalizedValue: string;
  unit:
    | 'percent'
    | 'year'
    | 'date'
    | 'currency'
    | 'people'
    | 'count'
    | 'unknown';
};
```

Unicode decimal digit normalization을 적용한다.

### 6.5 Candidate 선택

최고 lexical candidate 하나만 gate한 뒤 종료하지 않는다.

상위 후보 모두 평가:

```ts
const evaluated = candidates.map((candidate, searchRank) => ({
  candidate,
  searchRank,
  similarity: claimSimilarity(sentence, candidate.claim_text),
  gate: contradictionCheck(sentence, candidate.claim_text),
}));

const eligible = evaluated
  .filter(
    (item) =>
      item.gate === 'none' &&
      item.similarity >= MATCH_THRESHOLD,
  )
  .sort(
    (a, b) =>
      b.similarity - a.similarity ||
      a.searchRank - b.searchRank ||
      a.candidate.claim_id.localeCompare(b.candidate.claim_id),
  );

const match = eligible[0] ?? null;
```

no match reason contract:

```ts
type NoMatchReason =
  | 'no_candidates'
  | 'below_threshold'
  | 'negation_mismatch'
  | 'quantity_mismatch'
  | 'polarity_mismatch';
```

휴리스틱 gate이므로 UI는 “모순 확인”이라고 표현하지 않는다.

예:

```text
숫자 표현이 달라 안전하게 연결하지 못했습니다.
```

### 6.6 API

```text
POST /api/check
```

request:

```ts
{
  text: string;
  locale?: SupportedLocale;
}
```

limits:

```text
actual body bytes: 32KB
text: 5,000 chars
analyzable sentences: 50
candidate per sentence: 5
search concurrency: 5
deadline: 10s
```

실제 body stream byte를 제한한다. `Content-Length`는 빠른 reject 보조일 뿐 보안 경계가 아니다.

검증 순서:

1. rate limit — IP는 요청 처리 중 또는 짧은 TTL의 abuse guard에서만 사용하며 영구 저장·일반 로그를 금지한다. DB/Supabase limiter가 필요하면 회전 salt HMAC으로 변환하고 TTL deletion을 적용한다.
2. Content-Length fast reject
3. streaming byte limit
4. UTF-8 decode
5. JSON parse
6. object/schema validation
7. text length
8. locale validation
9. sentence split
10. sentence count
11. dedup normalized sentence
12. search
13. match
14. aggregate
15. privacy-safe analytics

오류:

```text
400 invalid_json
400 invalid_request
400 unsupported_locale
400 text_too_long
413 payload_too_large
422 no_analyzable_sentences
422 too_many_sentences
429 rate_limited + Retry-After
504 check_timeout
```

부분 결과는 반환하지 않는다.

deadline은 `AbortSignal`을 search layer까지 전달한다. 가능하면 DB statement timeout도 사용한다.

응답 계약의 `CitationStatus`, `ConfidenceLevel`, `SupportedLocale` 등은 계약상 의미를 나타내는 이름이다. 저장소의 실제 타입명이 다르면 기존 타입을 사용하고 PR에 매핑을 기록한다. 동일 의미의 신규 중복 타입을 만들지 않는다.

response:

```ts
{
  sentences: Array<{
    sentence: string;
    match: null | {
      claim_id: string;
      document_slug: string;
      claim_text: string;
      status: CitationStatus;
      confidence: ConfidenceLevel;
      similarity: number;
    };
    no_match_reason: NoMatchReason | null;
  }>;
  summary: {
    total: number;
    verified: number;
    needs_review: number;
    disputed: number;
    not_found: number;
  };
}
```

summary sum = total.

headers:

```text
Cache-Control: no-store
Content-Type: application/json
```

### 6.7 Rate limit 공개 조건

생산용 distributed guard가 있으면 재사용한다.

없으면 선택:

- Supabase atomic rate-limit RPC
- 외부 distributed limiter
- 또는 Check 기능을 auth/feature flag 뒤에 두고 header nav에서 숨김

인메모리 limiter만으로 public feature를 열지 않는다.

### 6.8 Privacy analytics

기록 가능:

- sentence count
- processing duration
- match/not-found counts
- gate counts
- error code

기록 금지:

- input text
- sentence text
- claim query
- raw IP
- request body

### 6.9 UI

files:

```text
app/[locale]/check/page.tsx
app/[locale]/check/CheckClient.tsx
```

- server wrapper + client interaction
- semantic form
- disabled/in-flight control
- AbortController
- result `aria-live`
- `aria-busy`
- visible status label
- locale-aware document URL
- not_found suggestion은 query string 사용 금지
- sessionStorage 또는 explicit POST
- privacy note
- copy summary button
- clipboard success/failure status
- locale-aware check URL
- public readiness gate가 충족된 경우만 header nav 표시

### 6.10 테스트

- 3 fixture set
- 7 locale sentence split
- Arabic/Hindi punctuation
- newline no punctuation
- 32KB actual stream
- no Content-Length oversized body
- invalid UTF-8
- timeout cancellation
- all candidate gate selection
- E2E Recall@5
- analytics failure still 200
- privacy log spy
- distributed rate limit or feature flag behavior

---

## 7. Task 2 — Citation badge + embed

### 7.1 Badge

```text
GET /api/badge/[slug]
```

bundle loader는 cite API 기존 pattern 재사용.

status:

- existing document: schema status
- missing: unknown
- data error: unavailable

HTTP status는 image break 방지를 위해 200.

cache:

| result | Cache-Control |
|---|---|
| normal | `public, max-age=600, s-maxage=600` 또는 ETag revalidation |
| unknown | `public, max-age=300, s-maxage=300` |
| unavailable | `no-store` |

SVG에는 presentation whitelist machineLabel만 사용한다.

- XML valid
- `nosniff`
- known status snapshot
- arbitrary string injection 경로 없음

### 7.2 Embed

```text
app/embed/[slug]/page.tsx
```

- locale layout 밖
- header/footer 없음
- JS 최소
- title
- status
- representative claim 1~2
- view link
- missing=unknown card
- data error=unavailable card
- 기본 404 iframe 금지
- robots noindex,nofollow
- `X-Robots-Tag` 권장

### 7.3 Middleware

기존 matcher를 조사하고 최소 exclusion만 추가한다.

새로 API 전체를 exclude하지 않는다.

필요 경로:

```text
/embed
/feed.xml
/api/badge  // 실제 middleware 역할에 따라 최소 제외
```

기존 auth/security middleware를 우회하지 않도록 route별 판단.

### 7.4 Frame headers

전역 rule이 embed를 match하지 않게 재구성한다.

embed response:

```text
X-Frame-Options 없음
CSP 정확히 1개
frame-ancestors *
전역 frame-ancestors 'self' 잔존 없음
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

`<meta http-equiv>` 대체 금지.

### 7.5 Snippet

Markdown:

```md
[![For-Ai fact status](BADGE_URL)](DOCUMENT_URL)
```

iframe:

```html
<iframe
  src="EMBED_URL"
  width="360"
  height="140"
  title="For-Ai fact status"
  loading="lazy"
  sandbox="allow-popups allow-popups-to-escape-sandbox"
  referrerpolicy="strict-origin-when-cross-origin"
></iframe>
```

frameborder는 obsolete이므로 CSS 또는 필요 시 호환 속성으로만 사용.

### 7.6 테스트

- all presentation keys SVG XML
- missing/error
- headers
- external origin iframe
- link popup
- middleware no locale redirect
- no global security regression
- snippet copy

---

## 8. Task 3 — OG/Twitter image

### 콘텐츠

headline:

1. representative claim
2. first verified claim
3. document title

90 chars:

```text
87 + ellipsis
```

source count:

- active claim-evidence relation
- unique source ID
- duplicate source counted once

status presentation mapping exhaustive.

### Route files

```text
og-renderer.tsx
opengraph-image.tsx
twitter-image.tsx
```

각 route file에 literal config 직접 선언:

```ts
export const runtime = 'nodejs';
export const revalidate = 600;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'For-Ai claim verification status';
```

공용 renderer만 공유한다.

### Fonts

기본 구현 전략은 하나로 고정한다.

1. **Latin + Hangul subset만 ImageResponse bundle에 포함한다.**
2. headline에 Arabic(`\u0600-\u06FF`), Devanagari(`\u0900-\u097F`), Han/Kana(`\u3040-\u30FF`, `\u3400-\u9FFF`)가 포함되면 locale 문서의 **영어 canonical 제목**으로 명시적으로 fallback한다.
3. 영어 canonical 제목이 없으면 안정적인 generic English registry title을 사용한다.
4. tofu·누락 glyph 렌더는 어떤 경우에도 허용하지 않는다.
5. 5-script 전체 subset은 총 ImageResponse 자산 예산 500KB 이내임을 build artifact로 증명한 경우에만 허용한다. 반나절 이상 최적화하지 말고 기본 전략으로 복귀한다.

Integration test는 7개 locale 모두에서 다음 중 하나를 확인한다.

- locale headline 정상 렌더
- 의도된 English fallback 정상 렌더

### Metadata

- manual `openGraph.images` 충돌 제거
- `twitter.card=summary_large_image`
- HTML head에 OG/Twitter image 확인
- unknown gray
- no bundle overflow

### Cache

`revalidate=600`.

상태 변경 경로에 origin path invalidation을 추가한다.

외부 social platform cache 즉시 제거는 보장하지 않는다.

---

## 9. Task 4 — RSS + changelog

### 9.1 Query

```ts
getRecentClaimStatusEvents({
  statuses?: CitationStatus[];
  limit: number;
  cursor?: EventCursor;
})
```

상태 transition은 DB에서 계산한 뒤 pagination.

순서:

1. 전체 claim events에서 `LAG(status)`
2. 실제 transition filter
3. requested current status filter
4. sort `created_at DESC, event_id DESC`
5. limit/cursor

status filter를 LAG 전에 적용하지 않는다.

### 9.2 RSS

```text
app/feed.xml/route.ts
```

- verified transition only
- latest 50
- zero event valid
- invalid timestamp item 제외 + structured warning
- current time으로 item timestamp 조작 금지
- XML 1.0 invalid control 제거
- unpaired surrogate 처리
- escape all dynamic value
- Atom self link
- lastBuildDate
- multilingual channel이므로 `<language>` 생략
- `application/rss+xml; charset=utf-8`
- `revalidate=600`
- cache 600
- ETag/Last-Modified 권장

### 9.3 Changelog

```text
app/[locale]/changelog/page.tsx
```

- verified/needs_review/disputed transitions
- UTC grouping
- localized labels
- stable cursor pagination 권장

build simplicity가 필요하면 초기 누적 limit을 사용할 수 있으나 다음 조건:

- hard cap 300
- URL parameter validation
- duplicates 없음
- 후속 cursor migration note

### 9.4 Discovery

- root metadata `alternates.types`
- footer `/feed.xml`, localized changelog
- llms.txt
- robots에서 feed 차단 금지
- feed는 sitemap 제외
- embed/badge 제외
- check/changelog sitemap 포함

### 9.5 Tests

- XML parser
- XML control chars
- invalid timestamp
- empty feed
- LAG ordering
- same timestamp tie-breaker
- UTC boundary
- status filter
- discovery link
- middleware exclusion

---

## 10. Task 0~4 Integration Gate

Task 5를 시작하기 전에 작성:

```text
docs/implementation/TASK0_4_INTEGRATION_REPORT.md
```

필수:

- 모든 PR merged commit
- 4종 명령 현재 main에서 통과
- removed routes 308
- check privacy/rate/public state
- badge/embed headers
- OG 7-script smoke
- feed parse
- sitemap/robots/llms
- citation surface guard
- schema/types
- 신규 build issue 0 또는 승인된 baseline
- Task 5 dependency:
  - search helper
  - suggest flow
  - cache invalidation
  - verification events
  - URLs
  - citation presentation

Integration Gate 승인 전 Task 5 금지.

---

## 11. Task 5 Phase model

### DB SSOT

```sql
create table task5_settings (
  id boolean primary key default true check (id),
  phase integer not null default 0 check (phase between 0 and 4),
  draft_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
```

5-0 migration에서 단일 행을 idempotent하게 시드한다.

```sql
insert into task5_settings (id, phase, draft_enabled, updated_by)
values (true, 0, false, null)
on conflict (id) do nothing;
```

- phase helper는 행 부재 시 오류를 기록하고 phase 0·draft disabled로 fail closed한다.
- 발행 RPC는 행이 없으면 거부한다.
- 테스트에서 settings 행을 삭제한 뒤 `publish_assisted_claim`을 호출해 거부를 확인한다.

- 단일 행
- 변경은 `set_task5_phase` admin RPC만
- 상승 최대 +1
- 하강 즉시
- same phase idempotent
- reason 필수
- audit same transaction
- 직접 UPDATE 금지
- initial seed 때문에 `updated_by` nullable 또는 system actor

활성화 phase의 SSOT는 DB 단일 행이다. 다음 과거 환경변수 기반 phase 설정은 삭제한다:

```text
TASK5_PHASE
CROWD_REVIEW_ENABLED
AUTO_FINALIZE_ENABLED
AUTO_FINALIZE_RATIO
```

Phase 0~1에는 만들지 않는다.

선택적 deny-only:

```text
TASK5_EMERGENCY_DISABLE=1
```

기능을 켤 수 없고 끌 수만 있다.

### Phase

| Phase | 기능 |
|---|---|
| 0 | demand + AI draft, publication 0 |
| 1 | designated operator assisted publication |
| 2 | crowd triage, operator publication |
| 3 | evidence crowd + 5% auto canary |
| 4 | controlled expansion |

Phase 0~1에서는 다음 구현 금지:

```text
finalize_ai_claim_review
crowd_auto publication path
crowd reviewer weight
gold cards
Stage 1/2 crowd UI
```

CI guard 적용.

---

## 12. Task 5 Brownfield 공통 규칙

PR 5-0 전:

```text
docs/task5/TASK5_EXISTING_CODE_MAP.md
```

필수 inventory:

- claim create/edit/status
- admin publication
- verification events
- citation status
- source fetch/policy
- search/discovery
- notifications
- cron
- analytics/audit
- cache invalidation
- RLS/GRANT
- AI-generated field
- current schema/migration

characterization tests 작성 후 변경한다.

Legacy backfill:

```text
content_origin=legacy_manual
publication_mode=manual_legacy
publication_state=active for existing public claims
claim version 1
```

- existing status/ID/slug/URL unchanged
- fake risk normal 금지
- unavailable historical snapshot/quote 조작 금지
- Task 5 AI claim만 새 boundary 강제
- legacy writer는 inventory/migration까지 유지
- 전역 권한 회수는 후속

---

## 13. Task 5-0 — Structural foundation

### Schema

#### claim_versions

- `risk_class` 없음
- immutable
- `unique(claim_id, version)`
- `unique(claim_id,text_hash)` 없음
- 과거 same hash revert 허용
- 직전 version same hash no-op만 거부 가능

#### risk_assessments

append-only.

latest:

```sql
ORDER BY created_at DESC, id DESC
LIMIT 1
```

index:

```text
(claim_version_id, created_at DESC, id DESC)
```

publish RPC는 latest final_result normal과 현재 deterministic policy version을 검증.

#### source_snapshots

- immutable
- canonical/final URL
- retrieved_at
- hashes
- normalized text 또는 private storage pointer
- public full text 반환 금지

#### claim_evidence

- claim version
- source snapshot
- quote offset/hash
- context hash
- relation
- unique relation coordinates

#### verification_policies

- append-only version
- mode assisted_operator/crowd
- Phase 1 assisted policy only

#### publication

canonical row에:

```text
content_origin
current_claim_version_id
published_claim_version_id
publication_state
publication_mode
published_at
freshness_profile
valid_from
valid_until
```

#### task5_settings

A4 적용.

### Permissions

Task 5 AI claim status/publication direct update 금지.

legacy flow는 단계적으로 보존.

### CI guard

금지 대상:

- `finalize_ai_claim_review` implementation
- `crowd_auto` creation path

allowlist:

- docs/markdown
- future check constraint declaration
- explicit `// task5-guard-allow`
- guard allowlist file constants

### Backfill

- current legacy text → version 1
- legacy manual origin/mode
- existing public status unchanged
- current/published pointer
- risk fabricated 0
- source snapshot only if real historical data exists

### Reconciliation

필수 0:

```text
claims missing current version
active claims missing published version
legacy accidentally task5_ai
verified status changed
fabricated risk
duplicate version
orphan
legacy canonical/version text hash drift
```

legacy drift 규칙:

- `current_claim_version_id`가 가리키는 `text_hash`와 canonical claim의 현재 text hash가 다르면 drift로 보고한다.
- 자동 수정하지 않고 operator task를 생성한다.
- operator는 확인 후 canonical text로 새 version을 append하고 audit event를 남긴다.
- legacy edit 경로의 자동 version append는 후속 PR이며 5-0에서는 기존 flow를 침습하지 않는다.
- `task5_ai` origin claim은 canonical text 직접 수정이 DB에서 거부되어야 한다.

### Tests

- immutable versions
- revert allowed
- consecutive no-op blocked
- latest risk deterministic order
- policy immutable
- task5 settings transition
- direct task5 AI status update denied
- legacy characterization unchanged

---

## 14. Task 5-A — Demand signals

### Tables

```text
wanted_claims
wanted_claim_demand_signals
wanted_claim_suggesters
```

wanted status:

```text
observing
open
drafting
drafted
published
rejected_editorial
closed_infra_failure
```

unique:

```text
(locale, normalization_version, normalized_hash)
```

### Signals

```text
source
bucket_date
dedupe_epoch
actor_key
expires_at
```

unique:

```text
(wanted_claim_id, source, bucket_date, dedupe_epoch, actor_key)
```

same epoch promotion:

```text
distinct days >= 3
distinct actors >= 2
signals >= 3
```

- search gap starts observing
- explicit authenticated suggestion opens immediately
- raw IP not stored/logged
- actor HMAC 8-day retention
- user 10/day
- PII/secret filters
- reputation/crime risk routes to operator queue
- normalization version migration note

### RLS

- anon no read
- authenticated own suggestion via RPC only
- worker write
- raw queue private

### Tests

- one actor 3 days not promote
- two actors/3 days promote
- epoch boundary not mixed
- duplicate same day same actor 1
- two suggesters retained
- retention deletion
- no raw IP

---

## 15. Task 5-B1 — Safe fetch + snapshots

`safeFetchExternalSource` is sole external fetch entry.

### Network requirements

- HTTPS
- no userinfo
- port 443
- IDN canonicalization
- DNS A/AAAA/CNAME
- private/link-local/loopback/metadata/mapped IPv6 block
- fetch-time pin/revalidation
- manual redirect max 2
- each hop full validation
- TLS validation
- timeout 10s
- decompressed 5MB
- HTML/XHTML only
- MIME sniff
- no auth/cookie/referrer
- no JS execution
- Retry-After
- structured errors

### Source snapshot

canonical text extractor, boilerplate removal, hashes, storage size policy.

### Quote

LLM quote is re-found in canonical text.

- exact or controlled whitespace normalization
- unique occurrence
- offset/hash
- absent/multiple reject

### Tests

SSRF full regression, DNS rebind, redirect, compression, MIME, quote.

---

## 16. Task 5-B2 — Shadow AI drafting

### Flow

```text
open wanted
→ atomic lease
→ search/source discovery
→ safe fetch
→ excerpt
→ LLM structuring
→ quote offset validation
→ risk assessments
→ version/evidence
→ drafted
```

LLM URL generation prohibited.

### Cron

- CRON_SECRET
- task5 DB phase and draft_enabled
- emergency deny-only env
- lease `FOR UPDATE SKIP LOCKED`
- attempt/idempotency
- stale recovery
- retry category
- cost reservation/reconcile
- calls/tokens/cost/day

### Risk

deterministic + model:

```text
any high => high
any unknown/error => unknown
both normal => normal
```

risk classifier failure is fail-closed.

### Phase 0

publication path 0.

### Gate to Phase 1

14 days plus measurable conditions:

- unrecovered cron failure 0
- duplicate draft 0
- stuck lease 0
- budget overshoot 0
- SSRF regression 0
- unsupported quote stored 0
- 50 operator sample review
- clearly unrelated claim 0
- obvious high-risk miss 0
- raw input/IP log 0

---

## 17. Task 5-F — Report, quarantine, correction

Phase 1 publication 전에 필수.

### Public report

- auth not required
- rate limit
- max bytes/chars
- category
- claim/version included server-side
- optional private contact
- no automatic quarantine

### Operator RPCs

```text
quarantine_claim
restore_quarantined_claim
withdraw_claim
```

적용 범위는 `content_origin`과 무관하게 `publication_state`를 가진 **모든 발행 claim**이다. `legacy_manual`도 신고·quarantine·restore·withdraw 대상이다. 단, legacy claim의 기존 `citation_status`는 재분류하지 않고 publication-state overlay만 변경한다.

- lock
- reason
- authorization
- audit/correction event
- notification if applicable
- origin cache invalidation
- idempotency

### Public surface

- warning rather than hidden 404
- correction history
- right-of-reply path
- reporter private data not public
- badge/embed no stale verified from origin
- external platform cache limitation documented

---

## 18. Task 5-P1 — Operator-assisted publication

### Conflict resolution

“single account cannot publish” is refined:

> AI, client, cron, general contributor, and ordinary app code cannot publish AI claim alone. A designated editor may publish a normal-risk claim through the audited assisted RPC during Phase 1.

### publish_assisted_claim

validates:

- DB phase >=1
- editor role
- current claim version
- AI provenance
- evidence
- offset/hash
- snapshot
- latest risk normal
- current deterministic risk policy
- assisted policy version
- idempotency
- not already published

same transaction:

- active
- verified
- assisted_operator
- published version
- event
- audit
- notification outbox
- wanted published

high/unknown blocked.

### UI

- version
- risk evidence
- sources/publisher/date
- snapshot date
- quote/context
- model provenance
- duplicate search
- edit creates new version
- publish/reject/escalate/refetch/hold

### Transparency

AI-origin label remains after publication.

---

## 19. Task 5-D — Notifications

- transactional outbox
- `unique(event_id, recipient_id)`
- `reasons[]`
- proposer/reviewer same recipient one notification
- worker role only insert
- retries idempotent
- DLQ
- unread RLS
- actual unread dot

---

## 20. Task 5-E — Freshness

inspection target:

```text
claim_evidence_id
```

results:

```text
healthy
redirected
content_changed
evidence_missing
not_found
temporarily_unavailable
blocked
fetch_error
```

- safe fetch reuse
- 403/429 not not-found
- 3 temporary failures before card
- quote disappearance primary
- hash secondary
- success updates last_checked
- fail updates last_attempt
- no automatic citation downgrade
- operator recheck card
- other valid sources prevent whole claim downgrade
- `valid_until` overdue prioritizes queue

---

## 21. Task 5 Phase 1 operational definition

Operator work:

1. critical report/escalation
2. draft approval batch 2~3 times/week
3. weekly report

“Hands-off” is not Phase 1. It is earned after Phase 3 evidence.

Alerts:

- cron 3 consecutive failures
- budget 80%
- overshoot
- source error 3x week-over-week
- verified rollback
- critical report
- escalation >20 or oldest >72h
- provenance reconciliation failure
- stuck lease/outbox

---

## 22. Rollback matrix

| PR | rollback |
|---|---|
| 0-A | remove redirects; old files still present |
| 0-B | restore files from git; redirects can remain |
| 1 | hide nav/feature, disable route; schema additive |
| 2 | remove widget links; badge/embed routes independent |
| 3 | fall back to static OG |
| 4 | remove discovery links; keep empty feed route if needed |
| 5-0 | Task 5 disabled; legacy reader fallback |
| 5-A | disable signal hooks; retain private rows |
| 5-B1 | disable external fetch consumers |
| 5-B2 | draft_enabled=false; recover leases |
| 5-F | keep operator emergency DB access; fix RPC |
| 5-P1 | phase downgrade to 0; publication disabled |
| 5-D | pause outbox worker |
| 5-E | pause cron; no automatic status changes |

Rollback never deletes audit/provenance history.

---

## 23. Final Definition of Done

### Task 0~4

- [ ] removed routes 308
- [ ] streak correct
- [ ] Check is privacy-safe and public guard satisfied
- [ ] hard negative false positives blocked by tests
- [ ] badge/embed secure
- [ ] 7 locale OG smoke: 정상 script render 또는 명시적 English fallback
- [ ] RSS valid
- [ ] changelog stable
- [ ] sitemap/robots/llms correct
- [ ] citation surfaces guard
- [ ] 4 commands current main

### Task 5 Phase 0~1

- [ ] DB phase SSOT
- [ ] no auto finalize code
- [ ] task5_ai direct publish denied
- [ ] claim/evidence version binding
- [ ] immutable version/snapshot
- [ ] risk latest assessment
- [ ] revert allowed
- [ ] raw IP 0
- [ ] HMAC retention
- [ ] external fetch wrapper bypass 0
- [ ] duplicate lease/draft 0
- [ ] quote validation
- [ ] budget hard stop
- [ ] report/quarantine/correction
- [ ] assisted RPC only
- [ ] unknown/high publication 0
- [ ] notification duplicate 0
- [ ] evidence freshness
- [ ] reconciliation
- [ ] runbook and PLAN.md
- [ ] Phase gate approved by human

---

## 24. Codex 행동 규칙

Codex는 각 PR에서 다음을 지킨다.

1. 기존 파일명·함수명을 추정하지 말고 조사한다.
2. 기존 helper가 있으면 재사용한다.
3. 문서 예시와 실제 schema가 다르면 actual schema 기준으로 invariant를 구현한다.
4. 삭제보다 adapter를 우선한다.
5. 직접 HTTP loopback 금지.
6. service key client import 금지.
7. test를 삭제하지 않는다.
8. Phase 2·3 기능을 미리 구현하지 않는다.
9. 질문 없이 임의 정책을 만들지 않는다. 문서에 없는 사소한 구현 선택은 최소 변경·fail-closed로 결정하고 PR에 기록한다.
10. 다음 PR을 자동 시작하지 않는다.

---

# Book V. Task 5 상세 데이터·마이그레이션 계약

## 1. Brownfield 조사 산출물

PR 5-0에서 코드 수정 전에 다음을 만든다.

```text
docs/task5/TASK5_EXISTING_CODE_MAP.md
```

필수 조사:

```bash
git status
git log --oneline --decorate -n 50

grep -RIn \
  "claim_versions|claim_evidence|source_snapshot|risk_assessment|publication_state|publication_mode|wanted_claim|notification_outbox|safeFetchExternalSource|CRON_SECRET|SKIP LOCKED|citation_status|verification_event|ai_generated|service_role" \
  app lib scripts test schema-v3.sql supabase migrations 2>/dev/null

grep -RIn \
  "update.*status|status.*update|citation_status.*=" \
  app lib scripts test supabase migrations 2>/dev/null
```

각 artifact는 `KEEP`, `HARDEN`, `WRAP`, `MIGRATE`, `DEPRECATE`, `REMOVE` 중 하나로 분류한다. 기존 public contract가 사용 중이면 wrapper를 먼저 만들고 호출자를 단계적으로 이전한다.

## 2. Characterization test

다음을 변경 전에 고정한다.

- 기존 claim 생성·수정·검증
- 기존 admin status 변경
- citation status 계산
- verification event
- source 조회·fetch
- notification과 읽음 처리
- cron 인증
- cache invalidation
- RLS·GRANT
- 기존 AI-generated 표시

기존 실패는 baseline으로 기록하고 신규 회귀와 분리한다.

## 3. Expand → Backfill → Adapt → Enforce → Contract

### Expand

기존 구조를 제거하지 않고 additive하게 version, snapshot, evidence, risk, policy, settings, publication pointer를 추가한다.

### Backfill

- 기존 claim text → version 1
- `content_origin='legacy_manual'`
- `publication_mode='manual_legacy'`
- 기존 공개 claim → `publication_state='active'`
- ID·slug·URL·citation status 유지
- 과거 risk를 normal로 조작하지 않음
- 실제 과거 snapshot이 없으면 현재 fetch 결과를 과거 snapshot으로 위장하지 않음
- quote offset을 복원할 수 없으면 versioned evidence를 조작하지 않음

### Adapt

전환기 read:

```text
published_claim_version_id가 있으면 version text
없으면 legacy canonical text
```

Task 5 AI writer는 version API만 사용한다. legacy writer는 inventory와 migration이 끝날 때까지 제한적으로 유지한다.

### Enforce

모든 Task 5 writer, characterization, reconciliation, rollback이 확인된 뒤에만 권한을 강화한다. 우선 `task5_ai` origin에만 직접 publication/status update 금지를 강제한다.

### Contract

기존 필드·함수 제거는 repository reference 0, production usage 0, rollback window 종료 후 별도 PR에서만 수행한다.

## 4. 최소 상세 Schema 계약

실제 저장소에 같은 의미의 기존 구조가 있으면 중복 생성하지 않고 이름을 매핑한다.

### 4.1 claim_versions

```sql
create table claim_versions (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id),
  version integer not null check (version > 0),
  text text not null,
  text_hash text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (claim_id, version)
);
```

- `risk_class` 없음
- UPDATE/DELETE 금지
- `unique(claim_id,text_hash)` 금지
- 직전 version과 같은 hash의 no-op insert만 거부 가능
- 과거 version과 동일한 내용으로 revert 허용

### 4.2 risk_assessments

```sql
create table risk_assessments (
  id uuid primary key default gen_random_uuid(),
  claim_version_id uuid not null references claim_versions(id),
  deterministic_result text not null check (deterministic_result in ('unknown','normal','high')),
  model_result text not null check (model_result in ('unknown','normal','high')),
  final_result text not null check (final_result in ('unknown','normal','high')),
  deterministic_policy_version text not null,
  model_id text,
  prompt_version text,
  failure_reason text,
  created_at timestamptz not null default now()
);
```

```sql
create index on risk_assessments
  (claim_version_id, created_at desc, id desc);
```

최신 risk는 `created_at DESC, id DESC LIMIT 1`. 한쪽 high면 high, 한쪽 unknown/error면 unknown, 둘 다 normal일 때만 normal.

### 4.3 source_snapshots

```sql
create table source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id),
  canonical_url text not null,
  final_url text not null,
  retrieved_at timestamptz not null,
  http_status integer not null,
  content_type text not null,
  content_hash text not null,
  normalized_text_hash text not null,
  normalized_text text,
  storage_path text,
  etag text,
  last_modified text,
  created_at timestamptz not null default now(),
  check (
    (normalized_text is not null and storage_path is null)
    or (normalized_text is null and storage_path is not null)
  )
);
```

- immutable
- full normalized text는 server-only
- 공개 API는 전체 본문을 반환하지 않음
- 데이터 최소화와 저작권 정책에 따라 필요한 범위만 보존

### 4.4 claim_evidence

```sql
create table claim_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_version_id uuid not null references claim_versions(id),
  source_snapshot_id uuid not null references source_snapshots(id),
  quote_start integer not null check (quote_start >= 0),
  quote_end integer not null check (quote_end > quote_start),
  quote_hash text not null,
  context_hash text,
  relation text not null check (relation in ('supports','qualifies','contradicts')),
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (claim_version_id, source_snapshot_id, quote_start, quote_end)
);
```

서버는 canonical text에서 quote를 다시 찾고 유일성·offset·hash를 검증한다. 실패 또는 다중 match면 저장하지 않는다.

### 4.5 verification_policies

```sql
create table verification_policies (
  version integer primary key,
  mode text not null check (mode in ('assisted_operator','crowd')),
  rules jsonb not null,
  effective_from timestamptz not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
```

UPDATE/DELETE 금지. Phase 1에는 assisted policy만 사용한다.

### 4.6 task5_settings

```sql
create table task5_settings (
  id boolean primary key default true check (id),
  phase integer not null default 0 check (phase between 0 and 4),
  draft_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into task5_settings (id, phase, draft_enabled, updated_by)
values (true, 0, false, null)
on conflict (id) do nothing;
```

- enablement SSOT는 DB
- admin-only `set_task5_phase(p_phase,p_reason)`만 변경
- 상승 최대 +1, 하강 즉시, 같은 phase idempotent
- 행 부재는 phase 0으로 fail closed하고 발행 거부
- 선택적 `TASK5_EMERGENCY_DISABLE=1`은 deny-only

### 4.7 wanted_claims

```sql
create table wanted_claims (
  id uuid primary key default gen_random_uuid(),
  locale text not null,
  normalization_version integer not null,
  normalized_text text not null,
  normalized_hash text not null,
  status text not null default 'observing' check (status in (
    'observing','open','drafting','drafted','published',
    'rejected_editorial','closed_infra_failure'
  )),
  draft_failure_count integer not null default 0,
  draft_claim_id uuid,
  published_claim_id uuid,
  lease_owner text,
  lease_expires_at timestamptz,
  last_demand_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (locale, normalization_version, normalized_hash)
);
```

normalization version 상향 시 기존 observing/open row를 재정규화·병합하는 migration note를 작성한다.

### 4.8 wanted_claim_demand_signals

```sql
create table wanted_claim_demand_signals (
  id uuid primary key default gen_random_uuid(),
  wanted_claim_id uuid not null references wanted_claims(id),
  source text not null check (source in ('user_suggestion','search_gap')),
  bucket_date date not null,
  dedupe_epoch date not null,
  actor_key text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (wanted_claim_id, source, bucket_date, dedupe_epoch, actor_key)
);
```

같은 epoch에서 distinct days ≥3, distinct actor ≥2, signal ≥3이면 search gap을 open으로 승격한다. actor signal은 8일 후 삭제한다.

### 4.9 wanted_claim_suggesters

```sql
create table wanted_claim_suggesters (
  wanted_claim_id uuid not null references wanted_claims(id),
  contributor_id uuid not null references contributors(id),
  created_at timestamptz not null default now(),
  notification_sent_at timestamptz,
  primary key (wanted_claim_id, contributor_id)
);
```

### 4.10 draft attempts와 비용 ledger

최소 필드:

```text
draft_attempts:
  id, wanted_claim_id, worker_id, prompt_version, idempotency_key,
  state, attempt_number, lease_expires_at, provider_request_id,
  error_class, error_code, started_at, completed_at

task5_runs:
  id, run_type, scheduled_for, started_at, completed_at,
  state, leased_count, success_count, failure_count, correlation_id

cost_ledger:
  usage_date, provider, reserved_calls, completed_calls,
  reserved_input_tokens, reserved_output_tokens,
  actual_input_tokens, actual_output_tokens,
  reserved_cost, actual_cost, updated_at
```

호출 전에 atomic reserve, 완료 후 actual reconcile. calls/tokens/cost 세 상한을 모두 적용한다.

### 4.11 notifications와 outbox

```text
notification_outbox:
  id, event_id, recipient_id, reasons[], status,
  attempts, next_attempt_at, created_at, delivered_at,
  unique(event_id, recipient_id)

notifications:
  id, recipient_id, event_id, reasons[], claim_id,
  created_at, read_at,
  unique(event_id, recipient_id)
```

제안자와 검토자가 같으면 하나의 알림에 reasons를 병기한다.

### 4.12 source_checks

대상은 `claim_evidence_id`다.

```text
id, claim_evidence_id, source_snapshot_id, attempted_at,
succeeded_at, http_status, result, content_hash,
normalized_text_hash, evidence_quote_hash, etag,
last_modified, error_code, run_id
```

result:

```text
healthy / redirected / content_changed / evidence_missing /
not_found / temporarily_unavailable / blocked / fetch_error
```

### 4.13 issue reports

최소 필드:

```text
id, claim_id, claim_version_id, category, severity,
message, private_contact, status, created_at, triaged_at,
resolved_at, resolution_event_id
```

public surface에는 private contact와 내부 메모를 반환하지 않는다.

## 5. Legacy drift

매일 reconciliation에서 canonical claim text hash와 `current_claim_version_id.text_hash`를 비교한다. drift 발견 시 자동 수정하지 않고 operator task를 만든다. operator는 현재 canonical text로 새 version을 append하고 audit event를 남긴다. `task5_ai` claim은 직접 canonical edit가 DB에서 거부된다.

## 6. CI guard

- `finalize_ai_claim_review`가 app/lib/migration/schema에 구현되면 Phase 0~1 build 실패
- `crowd_auto` 생성 코드 금지
- check constraint의 미래 허용값과 방어 helper는 `// task5-guard-allow`
- allowlist는 guard script 상수로 관리
- docs와 Markdown은 검색 대상에서 제외

## 7. Reconciliation 결과

필수 0:

```text
claims missing current version
active claims missing published version
legacy accidentally task5_ai
verified status changed
fabricated risk
version number duplicate
orphan row
Task 5 AI direct publication
settings row missing
```

추적·운영 처리:

```text
legacy canonical/version drift
legacy unversioned evidence relation
outbox long pending
expired lease
source-check/pointer mismatch
```

## 8. Rollback

- Task 5 phase 0, draft disabled
- deny-only emergency switch 가능
- legacy reader fallback 유지
- additive row는 즉시 삭제하지 않음
- 권한 rollback SQL 준비
- provenance/audit history 삭제 금지

---

# Book VI. Codex 순차 실행 명령과 PR 검수


---

## 1. 공통 Codex 프롬프트 머리말

각 PR 프롬프트 앞에 붙인다.

```text
For-Ai 50-Year Operating & Implementation Bible v7을 유일한 실행 SSOT로 사용하라. 이 문서 안의 Constitution → current policy → task contract 순으로 적용하고, 외부의 과거 지시서를 별도 해석하지 마라.

이번 요청의 PR 범위만 수행하고 다음 PR을 시작하지 마라.
코드 변경 전에 기존 구현을 조사하고 characterization test를 먼저 추가하라.
동일 의미의 기존 코드가 있으면 KEEP/HARDEN/WRAP/MIGRATE 중 하나를 선택해 재사용하라.
기존 ID, slug, URL, 공개 상태를 임의로 변경하지 마라.

완료 전 다음을 실행하라:
npm run lint
npm run test
npm run ci:guards
npm run build

PR 설명 형식으로 다음을 보고하라:
- 조사한 기존 코드
- 재사용/보강/wrapper/migration
- 변경 파일
- schema/RLS/GRANT/RPC
- 개인정보·로그
- 테스트 결과
- 수동 smoke test
- rollback
- 남은 위험
```

---

## 2. Baseline

```text
코드 변경 없이 저장소 baseline을 조사하라.
docs/implementation/BASELINE_BEFORE_TASK0.md를 작성하라.
현재 lint/test/ci:guards/build 결과와 기존 failure를 기록하고, middleware, next.config, schema/types, locale, routes, search/source/auth/admin/notification/cron 구조를 요약하라.
```

검수:

- 문서만 변경됐는가
- 기존 failure가 분리됐는가
- 현재 open/missing dependency가 드러났는가

---

## 3. PR Task 0-A

```text
Task 0-A만 구현하라.
legacy gamification page 파일은 삭제하지 말고, 지원 locale에 한해 308 redirect를 추가하라.
내부 navigation/footer/sitemap의 legacy links를 제거하라.
기존 redirects와 병합하고 API/embed route가 오매칭되지 않도록 테스트하라.
```

승인 후 deploy preview:

```bash
curl -I /en/quests                 # 308, Location: /en/contributors
curl -I /ko/bounties/example       # 308, Location: /ko/leaderboard
curl -I /api/quests                # 308이면 실패
curl -I /embed/quests              # 308이면 실패
```

---

## 4. PR Task 0-B

```text
Task 0-A 병합 상태에서 Task 0-B만 구현하라.
legacy route folders와 전용 dependency를 제거하되 point-awards, contributor-streaks, gamification-leaderboard와 legacy event union을 유지하라.
authenticated current contributor의 accepted_contribution streak만 contributors page에 통합하라.
typed i18n, UTC 상태, milestone 구간 진행률, 접근성 테스트를 포함하라.
```

---

## 5. PR Task 1

```text
Task 1만 구현하라.
citation presentation foundation, 3-way evaluation fixtures, 7-locale sentence segmentation, lexical similarity, structured quantity/negation/polarity contradiction gate, all-candidate selection, privacy-safe API, real streaming byte limit, cancelable deadline, UI를 구현하라.

production distributed limiter가 없으면 Check를 public nav에 노출하지 말고 auth/feature flag 뒤에 두어라.
입력 원문·문장·raw IP를 저장하거나 로그하지 마라.
pair test뿐 아니라 fixed registry end-to-end Recall@5 test를 추가하라.
```

특별 검수:

- 반대 주장/숫자/증감 mismatch
- second candidate가 valid일 때 match
- no Content-Length oversized body
- analytics payload에 text 없음
- public exposure 조건

---

## 6. PR Task 2

```text
Task 2만 구현하라.
badge와 embed를 기존 cite loader, citation presentation, URL helpers로 구현하라.
middleware에서는 필요한 경로만 최소 제외하고 API 전체를 새로 제외하지 마라.
embed의 global XFO/CSP 충돌을 제거하고 외부 iframe E2E를 추가하라.
sandbox/loading/referrerpolicy가 포함된 snippet을 제공하라.
```

---

## 7. PR Task 3

```text
Task 3만 구현하라.
OG/Twitter route config를 각 파일에 literal로 선언하고 renderer만 공유하라.
headline/source count/status mapping을 공용 helper로 테스트하라.
7 locale smoke: 정상 script render 또는 명시적 English fallback을 구현하라.
기존 metadata image 충돌을 정리하고 revalidate 600을 적용하라.
```

---

## 8. PR Task 4

```text
Task 4만 구현하라.
DB 단계에서 전체 이벤트에 LAG를 계산한 후 transition/status/pagination을 적용하라.
verified-only RSS와 multi-status changelog를 구현하라.
XML 1.0 sanitize, invalid timestamp exclusion, multilingual feed language omission, discovery metadata, sitemap/robots 정책을 적용하라.
```

---

## 9. Task 0~4 Integration Gate

```text
Task 0~4 코드 변경은 하지 말고 통합 검증만 수행하라.
docs/implementation/TASK0_4_INTEGRATION_REPORT.md를 작성하고 main에서 모든 명령과 route/header/feed/OG/privacy/schema 검증을 수행하라.
Task 5 dependency readiness를 판정하라.
```

Gate 문서 승인 전 Task 5 금지.

---

## 10. PR Task 5-0

```text
Task 5-0만 구현하라.
먼저 docs/task5/TASK5_EXISTING_CODE_MAP.md와 characterization tests를 작성하라.

claim_versions에서 risk_class를 제거하고 immutable하게 유지하라.
unique(claim_id,text_hash)를 만들지 말고 revert를 허용하라.
latest risk_assessments를 created_at DESC, id DESC로 조회하라.
task5_settings를 phase의 DB SSOT로 구현하고 set_task5_phase RPC만 변경을 허용하라.
TASK5_EMERGENCY_DISABLE은 deny-only로만 허용한다.

기존 claim은 legacy_manual/manual_legacy로 additive backfill하되 ID, slug, URL, citation status를 바꾸지 마라.
과거 risk, snapshot, quote를 조작해 생성하지 마라.
새 publication boundary는 우선 task5_ai claim에만 강제하고 기존 admin flow를 제거하지 마라.
```

필수 첨부:

- code map
- characterization
- reconciliation output
- rollback SQL
- privilege before/after

---

## 11. PR Task 5-A

```text
Task 5-A만 구현하라.
observing/open 상태, locale+normalization version hash, dedupe epoch HMAC signal, suggesters, private rollup, retention cron, RLS를 구현하라.
한 actor가 3일 요청해도 승격되지 않고 2 actors/3 days 조건을 만족해야 한다.
raw IP와 actor key를 DB 외 로그에 남기지 마라.
```

---

## 12. PR Task 5-B1

```text
Task 5-B1만 구현하라.
safeFetchExternalSource를 외부 fetch의 단일 진입점으로 만들고 SSRF, DNS rebinding, redirect, compressed-size, MIME, timeout을 방어하라.
source snapshot과 canonical text, quote offset/hash 검증을 구현하라.
direct external fetch CI guard를 추가하라.
```

---

## 13. PR Task 5-B2

```text
Task 5-B2만 구현하라.
Phase 0 shadow drafting만 구현하고 publication path는 만들지 마라.
SKIP LOCKED lease, attempts, idempotency, CRON_SECRET, cost reserve/reconcile, prompt/model provenance, risk fail-closed를 구현하라.
LLM이 URL을 생성하거나 network/tool/DB 권한을 갖게 하지 마라.
```

---

## 14. PR Task 5-F

```text
Task 5-F만 구현하라.
public issue report, severity routing, right-of-reply, quarantine/restore/withdraw RPC, correction history, origin cache invalidation을 구현하라.
report가 자동으로 quarantine을 일으키면 안 된다.
외부 SNS cache 즉시 삭제를 보장한다고 문서화하지 마라.
```

---

## 15. PR Task 5-P1

```text
Task 5-P1만 구현하라.
DB phase 1에서 지정 editor만 publish_assisted_claim RPC로 normal-risk Task5 AI claim을 발행하게 하라.
direct UPDATE나 unknown/high risk 발행을 금지하라.
claim version, latest risk policy, evidence snapshot/offset/hash, assisted policy, idempotency를 RPC에서 재검증하라.
AI-origin transparency receipt를 공개 surface에 표시하라.
```

Phase 0→1 gate 문서가 승인되지 않았다면 settings phase를 올리지 않는다.

---

## 16. PR Task 5-D

```text
Task 5-D만 구현하라.
transactional outbox, unique(event_id,recipient_id), reasons aggregation, retry/DLQ, RLS unread inbox를 구현하라.
제안자와 검토자가 같은 사람이어도 알림은 하나여야 한다.
```

---

## 17. PR Task 5-E

```text
Task 5-E만 구현하라.
claim_evidence 단위 source check, quote disappearance detection, source result taxonomy, temporary failure threshold, freshness profile, operator recheck task를 구현하라.
자동 citation downgrade를 만들지 마라.
```

---

## 18. PR 검수 질문

각 PR 리뷰에서 확인한다.

1. 기존 코드를 조사했는가
2. 같은 기능을 중복 생성하지 않았는가
3. public contract를 불필요하게 깨지 않았는가
4. fail-open 경로가 있는가
5. DB와 app 중 SSOT가 둘인가
6. permission을 너무 일찍 전역 회수했는가
7. migration rollback이 가능한가
8. 로그에 원문·IP·secret이 있는가
9. 테스트가 실제 실패 시나리오를 재현하는가
10. 다음 Phase 기능이 몰래 들어갔는가

---

## 19. Codex 결과를 받을 때 요구할 형식

```text
### Summary
### Existing code reused
### Existing code hardened
### Compatibility/migrations
### Files changed
### Database and permissions
### Tests
### Manual verification
### Security/privacy
### Rollback
### Known limitations
### Next PR dependencies
```

PR diff와 CI 결과 없이 “완료” 선언을 승인하지 않는다.

---

# Book VII. 운영·보안·복구 Runbook

## 1. SLO 체계

초기 목표값은 baseline 후 확정하되 측정 정의를 먼저 고정한다.

```text
availability
p95 latency
job success rate
queue oldest age
freshness overdue
critical report time-to-triage
quarantine origin propagation
provenance completeness
cost budget overshoot
restore success
```

SLO 변경은 목표를 낮춰 문제를 숨기지 말고 risk acceptance를 기록한다.

## 2. Incident severity

| 등급 | 예시 | 행동 |
|---|---|---|
| SEV-0 | 대규모 개인정보 유출, status 무단 변경, 내부망 SSRF | 즉시 kill switch, 비상 연락, 보존, 법적 검토 |
| SEV-1 | 잘못된 고위험 claim 발행, publication integrity 깨짐 | 즉시 quarantine, auto 기능 off, 24h 내 초기 보고 |
| SEV-2 | cron/outbox 장기 실패, source refresh 대규모 오류 | 담당자 경보, 하루 내 완화 |
| SEV-3 | 개별 링크 오류, 비핵심 UI defect | 정규 queue |

모든 SEV-0/1은 blameless postmortem과 control 개선을 요구한다.

## 3. Backup과 DR

- DB point-in-time recovery 확인
- 일일 logical export
- object storage manifest와 hash backup
- secrets와 infra config의 별도 encrypted backup
- domain/DNS recovery
- 매월 sample restore
- 매년 full environment restore
- enterprise 전 RPO/RTO 계약화

백업 성공 로그가 아니라 실제 restore가 증거다.

## 4. Supply chain

- lockfile 유지
- dependency update automation
- dependency review
- SBOM 생성·보관
- build provenance
- least-privilege CI token
- branch protection·required review
- signed release 또는 attestations 단계적 도입
- OpenSSF Scorecard와 SLSA gap 정기 측정
- 새 dependency는 maintenance, license, vulnerabilities, transitive risk 검토

## 5. Secret와 접근

- secret은 코드·클라이언트·로그에 없음
- 최소 권한, 짧은 수명 credential 우선
- admin·production access MFA
- 분기별 access review
- 퇴사·역할 변경 즉시 revoke
- break-glass 사용 audit
- service role 범용 사용 최소화

## 6. Model/vendor change

변경 전:

- regression set
- quality/cost/security comparison
- privacy/retention terms
- provider outage behavior
- prompt injection tests
- shadow traffic

변경 후:

- model provenance
- canary
- rollback
- quality drift monitoring

## 7. Data lifecycle

모든 table/class는 다음을 정의한다.

```text
purpose
controller/owner
public/private
retention
deletion/anonymization
backup retention
export
legal hold
```

retention cron도 일반 production job과 동일하게 SLO·alert·reconciliation 대상이다.

## 8. 연간 standards update 절차

1. 공식 standards registry 확인
2. 법·표준 변경 목록
3. control gap 분석
4. 위험·비용·고객 영향
5. 정책 version 또는 implementation PR
6. regression·migration·training
7. public transparency note 필요 여부
8. 다음 review date

---

# Appendix A. 공식 기준 참고 목록

이 목록은 설명을 위한 registry이며 표준 원문을 복제하지 않는다. 조직 규모와 적용 지역에 따라 전문 감사·법률 검토를 추가한다.

- NIST AI Risk Management Framework: https://www.nist.gov/itl/ai-risk-management-framework
- NIST AI 600-1, Generative AI Profile: https://doi.org/10.6028/NIST.AI.600-1
- ISO/IEC 42001:2023: https://www.iso.org/standard/42001
- ISO/IEC 42005:2025: https://www.iso.org/standard/42005
- NIST Cybersecurity Framework 2.0: https://www.nist.gov/cyberframework
- NIST SP 800-218 SSDF 1.1: https://csrc.nist.gov/pubs/sp/800/218/final
- ISO/IEC 27001:2022: https://www.iso.org/standard/27001
- ISO 22301:2019: https://www.iso.org/standard/75106.html
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- OWASP GenAI Security Project: https://genai.owasp.org/
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- GDPR: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- EU AI Act: https://eur-lex.europa.eu/eli/reg/2024/1689/oj
- SLSA 1.1: https://slsa.dev/spec/v1.1/
- SPDX: https://spdx.dev/learn/overview/
- OpenSSF Scorecard: https://securityscorecards.dev/

# Appendix B. 문서 유지 규칙

- 이 문서는 repository의 `docs/` 아래 canonical filename으로 보관한다.
- 변경은 PR로만 한다.
- 각 변경은 `Document Change Log`를 수정한다.
- 구현 세부와 충돌하는 별도 errata를 만들지 않고, 이 문서에 즉시 통합한다.
- 임시 결정은 ADR에 기록하고 다음 정기 개정에서 본문에 반영한다.
- 분기별로 stale path·type·command를 자동 검사한다.
- 매년 major review, 필요 시 minor revision.
- 표준·법률·provider 정보에는 `last_verified_at`을 기록한다.

# Appendix C. Document Change Log

| Version | Date | Change |
|---|---|---|
| 7.0 | 2026-07-12 | v6, sequential guide, Task 5 v3/A1~A6, final errata E1~E6, long-term governance/business/operations integrated into one SSOT |
