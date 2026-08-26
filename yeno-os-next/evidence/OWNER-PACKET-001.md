# OWNER PACKET 001 — G0 Baseline Lock 완료, push/PR 승인 요청

- 작성: 2026-08-26
- 현재 Gate: G0 `PASSED` → G1 `IN_PROGRESS`
- baseline: `BASELINE-20260826`, hash `a44a1f19c9bd8f5d35c0e3e25454db71f669f42586e22724bb838d11f123a7df`
- 위치: `/home/ubuntu/repos/yeno-os-next` (git branch `main`, **커밋 0개 — 아직 아무것도 push 안 함**)

## 1. 이번 RUN에서 실제로 한 일

기존 Truth Kernel이 이 환경에 존재하지 않았으므로, §12-1의 baseline 감사를 위조하지 않고
새 커널을 처음부터 빌드하고 그 커널 자체로 baseline을 잠갔습니다.

- Node 24 + ESM + 외부 패키지 0개 + 내장 `node:sqlite`
- `migrations/0001_core.sql` (진실 스키마, append-only 이벤트 원장, 승인/입장/승격 차단 트리거)
- `migrations/0002_release_control.sql` (release_state, gates G0–G14, work_orders, projections, backups)
- `migrations/CHECKSUMS.json` 핀 + drift/불변성 검사
- `src/core/`: db, hash, migrate, events, projections, governor, lease, backup
- `src/cli.mjs`: migrate / status / verify / event append·list·replay / projection rebuild / backup create·verify / restore / stop engage·release
- `scripts/local-ci.mjs`: 10개 머신 체크를 고정 순서로 실행하고 evidence manifest 기록
- `scripts/independent-validation.mjs`: `src/core`를 import하지 않는 독립 검증기
- `scripts/assert-seeded-defect-detected.mjs`: 검증기가 실제로 실패할 수 있음을 증명하는 8개 결함 주입
- `scripts/crash-writer.mjs`: SIGKILL 후 재시작·재생 검증용 결함 주입기
- `.claude/settings.json` + `PreToolUse` / `Stop` 훅: commit·push·PR·설치·배포·secret 열람·적용된 migration 편집을 결정론적으로 차단(우회 시도 포함 테스트)

## 2. 검증 결과 (모두 로컬 실행, 재현 명령 포함)

| 체크 | 명령 | 결과 |
|---|---|---|
| 테스트 | `node --test --test-reporter=spec` | 52 tests / 52 pass / 0 fail |
| 로컬 CI | `node scripts/local-ci.mjs` | 10 steps / 0 failed → `LOCAL_CI_PASS` |
| 커널 verify | `node src/cli.mjs verify` | 14 checks / 0 failed |
| 독립 검증 | `node scripts/independent-validation.mjs` | `INDEPENDENT_VALIDATION_PASS` |
| 결함 주입 | `node scripts/assert-seeded-defect-detected.mjs` | 8 seeded / 8 detected / 0 missed |
| rollback 리허설 | `backup create` → `backup verify` → `restore --to /tmp/yeno-rollback.db` | 복원본에서도 독립 검증 PASS, head hash 동일 |

탐지된 8개 결함: 이벤트 payload 위조, 이벤트 삭제, projection 수동 편집, 적용된 migration 편집,
안전 트리거 삭제, vault 바이트 불일치, 손상된 backup, (대조군) 정상 커널 통과.

## 3. 아직 미검증 / 차단 상태 (표시를 지우지 않았습니다)

- `NEEDS_SOURCE` G2 Unbounded Intake — 공식 대화 export 원본이 없어 144 title 복구 숫자를 만들 수 없음
- `NEEDS_SOURCE` 정본 md 4개 + 144 ledger 2개 — 이 환경에 없음. §2의 snapshot 숫자·해시는 재현 불가로 남김
- `BLOCKED` G5 Agent Team — provider 인증 미연결
- `INCOMPLETE` G10 Windows Product — EXE·트레이·스케줄러·음성·72시간 soak 증거 없음
- G1 Durable Truth는 머신 체크는 통과했으나 장기 soak 증거가 없어 `IN_PROGRESS` 유지

## 4. 비용 · 자원

- 외부 API 호출 0건, 지출 0원 (budget profile `BP-LOCAL`, spent 0 / 300,000 KRW)
- 설치한 것: Node v24.19.0 (nvm). npm 패키지 설치 0개
- Emergency stop: 기본값 `ON` 유지

## 5. 위험 · rollback

- 이 RUN은 전부 로컬. 원격 상태 변경 0건
- rollback: `rm -rf state backups evidence && node scripts/local-ci.mjs && node scripts/record-baseline.mjs` 로 완전 재생성 가능 (위에서 실제로 3회 수행)
- DB rollback: `backups/BKP-*.db` + manifest 로 복원, 손상 시 `--force` 없이는 복원 거부

## 6. 승인이 필요한 경계 (Owner Gate)

지금 막혀 있는 것은 **오직 이 하나**입니다.

1. `yeno-os-next`를 어디에 push할지
   - (a) 새 private repo 생성 (예: `wooyeonho/yeno-os-next`) — repo 생성은 Owner 권한 필요
   - (b) 기존 `wooyeonho/For-Ai` 안의 하위 디렉터리로 PR
   - (c) push 없이 로컬 유지 + zip으로 전달
2. 첫 커밋 범위: 위 파일 전부 (`state/`, `backups/`는 gitignore, `evidence/`는 포함)
3. 승인 후 다음 exact action: 브랜치 `devin/<epoch>-g0-baseline` 생성 → 커밋 → push → PR 생성 → CI 확인

## 7. 승인 없이도 계속할 수 있는 다음 작업 (원하시면 바로 진행)

- G1 강화: 이벤트 재생 성능·대용량 원장 테스트, 백업 회전, WAL 체크포인트 정책
- G3 Governor 확장: 승인 발급 CLI, 입장 거부 리포트, 예산 소비 반영
- G2 준비: intake 파서 골격 + fixture 형식 정의 (실제 원본 없이 형식만, `NEEDS_SOURCE` 유지)
- Windows 대상 사전 작업: 경로/줄바꿈/파일락 이식성 테스트

## 8. 원본 자료 요청 (있으면 G2를 열 수 있음)

- ChatGPT/Claude 공식 export (`conversations.json` 등) 원본 파일
- 정본 md 4개 + 144 title recovery ledger 2개

이 자료가 없으면 G2·144 복구는 계속 `NEEDS_SOURCE`로 남깁니다. 숫자를 추측해서 채우지 않습니다.
