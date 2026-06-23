# Admin Operations

이 문서는 GYEOL 운영자가 매일 후보를 생성하고, 검토하고, claim 단위로 검증해 외부에 공유 가능한 문서로 승격하는 절차를 정의한다.

GYEOL은 AI 위키가 아니라 AI, 검색엔진, 사람이 함께 읽을 수 있는 지역 사실 레지스트리다. 운영자는 반드시 `schema-v3.sql`의 구조와 `entities → documents → claims → claim_sources → verification_events` 흐름을 기준으로 작업한다.

## 핵심 원칙

- 정적 우선 렌더링을 유지한다. 핵심 문서 내용은 클라이언트 JavaScript 없이 raw HTML에서 읽혀야 한다.
- 후보 생성은 사실 발행이 아니다. 후보는 검증 대기열일 뿐이다.
- `documents.data`는 렌더링 편의용이며 사실의 원천이 아니다.
- 사실값은 claim 단위로만 확정한다.
- source 없이 claim value를 만들지 않는다.
- venue, 요금, 시간, 정책, 연락처, 주소 등은 추측하지 않는다.
- 모르는 값은 반드시 `확인 필요`, `confidence: low`, `status: needs_review`로 둔다.
- **“확인 필요” 문서는 절대 사실값으로 홍보하지 않는다.** AI 답변, 외부 공유, SEO 문구, SNS, 운영 보고서에서 확정 사실처럼 표현하면 안 된다.
- 외부 공유는 verified 문서와 verified claim만 대상으로 한다.

## 매일 실행 순서

1. `/admin/generate`에서 후보를 생성한다.
   - 추천 카테고리와 생성 예시를 참고해 AI가 자주 틀릴 수 있는 실용 질문을 만든다.
   - 생성 결과는 후보일 뿐이며, 이 단계에서 사실값을 확정하지 않는다.
2. `/admin/candidates`에서 후보를 검토한다.
   - 중복, 범위 과다, 광고성, 출처 확인 불가, 개인정보 위험이 있는 후보를 확인한다.
3. 부정확한 후보를 reject한다.
   - 질문 자체가 잘못되었거나, GYEOL의 claim-level 구조에 맞지 않거나, 검증 가능한 source가 없으면 reject한다.
4. 괜찮은 후보를 approve한다.
   - entity/document/claim 구조로 승격할 가치가 있고, source 확인 가능성이 있는 후보만 approve한다.
5. approved 후보를 promote한다.
   - promote 후에도 claim은 기본적으로 `확인 필요` 상태에서 시작한다.
   - promote 결과가 `entities`, `documents`, `claims` 구조에 맞는지 확인한다.
6. `/admin/verify-claim`에서 source를 확인한다.
   - 공식 source를 우선한다.
   - 공식 source가 없을 때는 문서, 신뢰 가능한 웹페이지 등 허용된 source policy에 맞는 자료만 사용한다.
7. claim value를 입력한다.
   - source에서 직접 확인 가능한 값만 입력한다.
   - 불명확하거나 최신성이 의심되면 `확인 필요`로 유지한다.
8. source URL/citation을 추가한다.
   - source URL, citation, 확인일, source 유형을 빠짐없이 남긴다.
   - citation은 claim value를 뒷받침하는 최소 단위로 작성한다.
9. verified로 승격한다.
   - claim value와 source가 일치하고, confidence가 정당화될 때만 verified로 바꾼다.
   - verification event가 남는지 확인한다.
10. verified 문서만 외부 공유한다.
    - `확인 필요` claim이 남아 있는 경우, 해당 claim을 확정 사실처럼 공유하지 않는다.
    - 문서 전체가 아직 검증 중이면 외부 배포 목록에서 제외한다.

## “확인 필요” 문서 홍보 금지 규칙

`확인 필요`는 “아직 사실로 등록하지 않았다”는 의미다. 운영자는 다음을 금지한다.

- `확인 필요` 값을 실제 요금, 운영 시간, 주차 가능 여부, 정책, 절차처럼 말하기
- AI 프롬프트, llms.txt, sitemap, SNS, 블로그, 영업 자료에서 미검증 claim을 확정 답변처럼 인용하기
- “대체로 맞을 것 같다”, “일반적으로 그렇다”는 이유로 verified 처리하기
- source가 없는 값을 `documents.data`에만 넣고 사실처럼 렌더링하기

미검증 문서를 언급해야 한다면 반드시 “검증 대기”, “확인 필요”, “source 확인 전”이라고 표시한다.

## 추천 카테고리

| 카테고리                   | 설명                                        | 우선 검증 source                              |
| -------------------------- | ------------------------------------------- | --------------------------------------------- |
| `life.transport`           | 교통 요금, 환승, 주차, 공항/역 접근         | 공식 교통기관, 지자체, 시설 공지              |
| `life.housing`             | 전월세, 관리비, 중개수수료, 주거 신고       | 정부/지자체, 법령, 공공기관                   |
| `life.environment`         | 재활용, 음식물쓰레기, 대형폐기물, 배출 요일 | 지자체 공지, 공공 안내문                      |
| `administration.documents` | 여권, 주민등록, 가족관계증명서, 민원서류    | 정부24, 구청/시청, 법령                       |
| `administration.tax`       | 신고 기한, 납부 기간, 세율, 감면            | 국세청, 위택스, 법령                          |
| `consumer.refund`          | 환불, 취소, 위약금, 플랫폼 정책             | 공식 약관, 고객센터 문서                      |
| `health.insurance`         | 건강보험, 진료비, 급여 기준                 | 국민건강보험, 심평원, 보건복지부              |
| `local.venue`              | 예식장/시설의 주차, 위치, 이용 안내         | 공식 홈페이지, 시설 공지, 지도 업체 정보 보조 |

## 생성 예시

아래 예시는 후보 생성용이다. 사실값을 포함하지 않으며 모든 claim은 검증 전 상태로 시작한다.

```json
{
  "entity_id": "kr-weddinghall-laluce-001",
  "type": "local.venue",
  "name": "명동 라루체 주차",
  "slug": "myungdong-laluce-parking",
  "lang": "ko",
  "country": "KR",
  "jurisdiction": "KR",
  "risk_tier": "medium",
  "update_frequency": "quarterly",
  "claims": [
    {
      "field_path": "venue.parking.availability",
      "claim_text": "명동 라루체 주차 가능 여부는 확인이 필요합니다.",
      "claim_value": "확인 필요",
      "confidence": "low",
      "status": "needs_review",
      "sources": []
    }
  ]
}
```

추가 후보 예시:

- `administration.documents`: “여권 재발급에 필요한 서류는 무엇인가?”
- `life.environment`: “서울 중구 대형폐기물 스티커 신청 방법은?”
- `administration.tax`: “자동차세 연납 신청 기간은 언제인가?”
- `consumer.refund`: “공연 예매 취소 수수료는 언제부터 붙는가?”
- `life.transport`: “공항철도 직통열차 환불 규정은?”

## 장애 대응 체크리스트

### provider 없음

- [ ] 환경 변수에 후보 생성 provider 설정이 있는지 확인한다.
- [ ] `/admin/generate`에서 provider 미설정 메시지가 명확히 표시되는지 확인한다.
- [ ] provider가 없으면 수동 후보 작성으로 전환하고, 사실값은 입력하지 않는다.
- [ ] 생성 실패 후보를 approve/promote하지 않는다.

### Supabase 저장 실패

- [ ] Supabase URL/key 환경 변수가 설정되어 있는지 확인한다.
- [ ] 네트워크 또는 권한 오류인지 로그를 확인한다.
- [ ] public read가 금지된 queue/report 계열 테이블의 RLS 정책을 확인한다.
- [ ] 저장 재시도 전 중복 insert 가능성을 확인한다.
- [ ] 실패한 후보는 운영 로그에 남기고 verified로 간주하지 않는다.

### promote 실패

- [ ] 후보 상태가 `approved`인지 확인한다.
- [ ] `entity_id`, `slug`, `lang`, claim 필수 필드가 있는지 확인한다.
- [ ] `schema-v3.sql`의 `entities → documents → claims` 관계를 기준으로 오류를 확인한다.
- [ ] 중복 slug 또는 중복 entity_id 여부를 확인한다.
- [ ] promote가 부분 성공했으면 orphan document/claim이 없는지 점검한다.

### verify 저장 실패

- [ ] claim id가 존재하는지 확인한다.
- [ ] claim value, confidence, status, source URL/citation이 모두 저장 요청에 포함되었는지 확인한다.
- [ ] source URL 형식과 citation 길이를 확인한다.
- [ ] `claim_sources`와 `verification_events`가 함께 기록되는지 확인한다.
- [ ] 저장 실패 시 화면의 verified 표시를 신뢰하지 말고 다시 조회한다.

### sitemap/llms 누락

- [ ] verified 문서가 sitemap에 포함되는지 확인한다.
- [ ] `llms.txt`는 보조 색인일 뿐 citation engine이나 법적 근거가 아님을 확인한다.
- [ ] 미검증 `확인 필요` claim이 외부 공유용 문구에 섞이지 않았는지 확인한다.
- [ ] `/ko/wiki/[slug]` raw HTML에서 핵심 문서 내용이 JavaScript 없이 읽히는지 확인한다.
- [ ] 누락이 있으면 배포 전 sitemap/llms 생성 로직과 route 캐시를 점검한다.

## 운영 종료 전 일일 확인

- [ ] 오늘 생성한 후보 중 reject/approve 상태가 명확히 분리되었다.
- [ ] promote된 문서는 모두 placeholder claim에서 시작했다.
- [ ] verified claim은 source URL/citation과 verification event를 가진다.
- [ ] `확인 필요` 문서는 외부 공유 목록에서 제외했다.
- [ ] 장애 또는 수동 조치 내역을 운영 로그에 남겼다.
