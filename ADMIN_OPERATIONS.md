# Admin Operations

## 최상단 운영 원칙

**확인 필요 문서는 절대 사실값으로 홍보하지 않는다.**

- `확인 필요` 상태의 문서와 claim은 외부 공유, 검색 유입용 홍보, AI 답변 근거, 영업 자료, 안내 문구의 확정 사실값으로 사용하지 않는다.
- 출처가 추가되고 검증 절차를 통과해 `verified`로 승격된 문서만 외부에 공유한다.
- 불확실하거나 오래된 정보는 낮은 confidence와 `확인 필요` 상태를 유지한다.

## 매일 운영 루틴

1. `/admin/generate`에서 신규 후보를 생성한다.
2. `/admin/candidates`에서 생성된 후보를 검토한다.
3. 이상하거나 부정확하거나 출처 확인이 어려운 후보는 `reject`한다.
4. 품질이 좋고 검증 가치가 있는 후보는 `approve`한다.
5. `approved` 후보를 문서/claim 작업 대상으로 `promote`한다.
6. `/admin/verify-claim`에서 각 claim에 신뢰 가능한 source를 추가한다.
7. source와 claim 내용을 검토한 뒤 검증 기준을 충족하는 claim만 `verified`로 승격한다.
8. `verified` 문서만 외부 공유 대상으로 사용한다.

## 매일 QA 루틴

1. LazyCodex discovery review를 실행한다.
2. P0 issue가 있는지 확인하고, 발견되면 일반 운영보다 우선 처리한다.
3. sitemap, `llms.txt`, raw 문서, diagnostics 페이지의 coverage를 확인한다.
4. AI discovery check를 실행해 AI와 검색 엔진이 핵심 문서를 발견할 수 있는지 확인한다.
5. QA 중 발견된 `확인 필요` 문서는 사실값으로 홍보하지 않고 검증 대기 상태로 유지한다.

## 주간 루틴

1. Search Console을 확인한다.
2. 유입 검색어를 확인해 실제 사용자가 찾는 질문과 category를 정리한다.
3. 다음 주에 집중할 새 priority category를 선정한다.
4. 오래된 `verified` claim을 재검증한다.
5. 재검증 중 출처가 사라졌거나 내용이 바뀐 claim은 confidence와 상태를 다시 평가한다.
