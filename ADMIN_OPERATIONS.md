# Admin Operations

## 최우선 규칙

확인 필요 문서는 절대 사실값으로 홍보하지 않는다. `확인 필요` 상태이거나 confidence가 low인 문서는 내부 검토 대상으로만 다루며, 외부 공유·검색 유입용 홍보·AI 답변 근거로 사용하지 않는다.

## 매일 운영 루틴

1. `/admin/generate`에서 신규 후보를 생성한다.
2. `/admin/candidates`에서 생성된 후보를 검토한다.
3. 이상하거나 근거가 부족하거나 GYEOL 범위에 맞지 않는 후보는 reject한다.
4. 좋은 후보는 approve한다.
5. approved 후보는 문서 후보로 promote한다.
6. `/admin/verify-claim`에서 claim별 source를 추가한다.
7. 충분한 source와 검증 기록이 있는 claim만 verified로 승격한다.
8. verified 문서만 외부에 공유한다.

## 매일 QA 루틴

1. LazyCodex discovery review를 실행한다.
2. P0 issue가 있는지 확인한다.
3. sitemap, llms, raw, diagnostics coverage를 확인한다.
4. AI discovery check를 실행한다.
5. QA에서 발견한 문제는 P0/P1/P2로 분류하고, verified 문서 외부 공유 전에 P0를 먼저 해결한다.

## 주간 루틴

1. Search Console을 확인한다.
2. 유입 검색어를 확인한다.
3. 검색어와 운영 목표를 기준으로 새 priority category를 선정한다.
4. 오래된 verified claim을 재검증한다.
5. 재검증 결과 source가 약하거나 오래된 claim은 verified 상태를 유지할 수 있는지 다시 판단한다.
