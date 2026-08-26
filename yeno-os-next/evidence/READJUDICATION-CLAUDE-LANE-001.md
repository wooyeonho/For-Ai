# READJUDICATION-CLAUDE-LANE-001 — Claude lane G1~G4 재판정

- 판정일: 2026-08-26
- 대상(읽기 전용): `/home/ubuntu/claude-yeno` (Owner 제공 zip `yenoosnext20260826.zip`, Windows `C:\Users\우연호\원앙` 원본 git repo)
- 판정 도구: `scripts/readjudicate-external-lane.mjs` (이 lane의 승격 기준을 그쪽 DB·migration·CLI에 적용)
- 기계 판정 원본: `evidence/READJUDICATION-CLAUDE-LANE-001.json`
- 대상 lane은 한 바이트도 수정하지 않았다. 쓰기를 시도하는 probe는 전부 `state/yeno.db`의 임시 사본에서 실행했다.

## 1. 결과

| Gate | Claude lane 주장 | 내 검증기 재판정 | 거부 사유 |
|---|---|---|---|
| G0 | PASSED | **UPHELD** | — (checksum 13개 재계산 일치, `0001_core.sql` 변조 시 자체 verify가 exit≠0, permissions/hook 존재) |
| G1 | PASSED | **REFUSED** | 스키마 append-only 부재(raw UPDATE/DELETE 통과), 100-cycle durability floor 미달 |
| G2 | PASSED | **REFUSED** | 실제 공식 export 수입 0건, title-only 승격 스키마 미차단, 회수 provenance 미강제 |
| G3 | PASSED | **REFUSED** | emergency stop fail-open, 신규 설치에서 미승인 RUN 통과, 없는 evidence로 G11 PASSED, approval 재사용/게이트 수동변경 가능, 스키마 비용 gate 부재 |
| G4 | PASSED | **REFUSED** | fencing token 부재, raw SQL로 lease 탈취 가능 |

즉 **G0만 살아남고 G1~G4는 살아남지 못한다.** 다만 이는 "그쪽 구현이 동작하지 않는다"가 아니라 "그쪽 증거가 내 승격 기준을 만족하지 않는다"는 뜻이다.

## 2. Claude lane이 실제로 통과한 것 (부정하지 않는다)

- 적용된 migration 13개의 checksum을 내가 다시 계산해 전부 일치했다.
- `0001_core.sql`을 내가 변조하자 그쪽 `verify`가 스스로 실패했다 — immutability 검사는 진짜다.
- live 16 events의 hash chain을 genesis부터 독립 재계산해 전부 일치했다.
- 그쪽 테스트 149개를 이 머신 Node 24에서 재실행해 149 pass / 0 fail.
- 그쪽 CLI로 본문 없는 project 승격을 시도하면 `error: promotion requires evidence_ref`로 거부한다 — JS 레벨 가드는 실재한다.
- `runs.idempotency_key`가 UNIQUE이고, DONE=3으로 큐가 실제로 돌았고, 만료된 stuck lease는 0건이다.
- `.claude/settings.json`과 deterministic hook이 존재한다.

## 3. 거부의 근거 (측정값)

### G1 — 원장이 스키마가 아니라 JS에만 보호된다
```
UPDATE events SET payload = '{"tampered":true}' WHERE seq = 1   → 1 row changed, 거부 없음
DELETE FROM events WHERE seq = 1                                 → 1 row changed, 거부 없음
```
그쪽 DB의 trigger는 0개다. `appendEvent()`를 우회하는 writer(다른 프로세스, sqlite3 CLI, 미래의 버그) 하나로 원장이 조작된다. hash chain은 재계산하면 깨진 것을 **탐지**할 수 있지만, 쓰기 자체를 **막지는** 못한다. 내 기준에서 G1은 "탐지 가능"이 아니라 "불가능"을 요구한다.

durability: `soak_sessions`/`durability_probes` 테이블 자체가 없다. 증거는 테스트 안의 150 append + SIGKILL 1회이고, 기록된 cycle별 증거·restore count가 없다. 내 floor는 100 cycle 이상 + 실패 probe 0이다.

### G2 — 수입된 원본이 0건이다
```
sources = 0, source_versions = 0, projects = 0, chat_export sources = 0
```
coverage invariant는 성립하지만 **0행 위에서 공허하게 성립**한다. 그쪽 evidence 문서도 이 사실을 정직하게 적어두었다 — 문제는 그럼에도 `STATUS.md`가 G2 PASSED라고 쓴 것이다.

스키마 가드도 없다(probe를 위해 내가 project/source_version 행을 먼저 심고 시도했다 — 0행 위의 공허한 통과를 피하기 위해):
```
UPDATE projects SET status='PROMOTED' WHERE id='probe-proj'                 → 1 row changed
UPDATE source_versions SET recovery_status='RECOVERED' WHERE id='probe-sv'  → 1 row changed
```
제목만 있는 대화가 본문·승인 없이 project가 되고, 본문 없는 source가 회수 시도 기록 없이 RECOVERED가 된다.

### G3 — 안전장치가 fail-open이다
```js
// src/governor.mjs
if (!row) return false;   // emergency_stop.set 이벤트가 없으면 = OFF
```
새 DB를 migrate한 직후 stop은 **OFF**다. 그리고 실제로:
```
run-admit local.edit src/x.mjs 100  → exit 0, {"admitted":true,"reason":"ADMITTED"}
```
새로 설치한 기계에서 Owner가 아무 것도 승인하지 않았는데 RUN이 통과한다. 내 기준은 fail-closed — 새 DB는 `emergency_stop.engaged = 1`을 **저장된 상태**로 가지고 시작한다.

그리고 그쪽 CLI 자체가 없는 파일을 증거로 받아들였다:
```
gate-pass G11 evidence/DOES-NOT-EXIST.md  → gate G11 PASSED, evidence_ref=evidence/DOES-NOT-EXIST.md
```
G11은 YENO 1.0 최종 수락 게이트다. 이것이 존재하지 않는 파일 경로 하나로 PASSED가 된다.

raw SQL red team:
```
INSERT INTO events (emergency_stop.set, on:false)  → 유효한 chain hash로 stop을 OFF로 뒤집음
UPDATE approvals SET used_count=0, max_uses=99      → 2 rows changed (소진된 one-shot 승인 부활)
UPDATE gates SET status='PASSED', evidence_ref=NULL → 1 row changed
```
비용도 스키마 gate가 아니라 `admitRun()` 호출자에만 의존한다.

### G4 — lease가 보호되지 않는다
`runs`에는 `lease_owner`/`lease_expires_at`만 있고 fencing token이 없다. lease가 만료된 뒤 되살아난 worker가 쓰는 write를 stale로 식별할 방법이 없다.
```
UPDATE runs SET lease_owner='attacker', status='LEASED'  → 6 rows changed
```

## 4. 판정기가 내 lane에도 똑같이 적용되는지 (자기 검증)

기준이 남의 것만 떨어뜨리면 그것은 증거가 아니라 편향이다. 같은 probe 11개를 내 lane에 그대로 쏘았다 — `scripts/self-adversarial-probes.mjs`, 결과 `evidence/SELF-PROBES-001.json`:

```
PASS  event_ledger_append_only_in_schema          YENO_SAFETY: events are append-only
PASS  event_ledger_delete_refused_in_schema       YENO_SAFETY: events cannot be deleted
PASS  gate_state_not_settable_by_hand             YENO_SAFETY: an earlier gate has not passed yet
PASS  approval_use_count_not_rewindable           YENO_SAFETY: approval scope is immutable
PASS  vault_bytes_immutable                       YENO_SAFETY: vault blobs are immutable
PASS  title_only_promotion_refused_in_schema      YENO_SAFETY: title-only promotion requires body or owner evidence
PASS  cost_hard_gate_enforced_in_schema           YENO_SAFETY: cost_p90 unknown or exceeds remaining budget
PASS  ax_method_refused_in_schema                 YENO_SAFETY: AX method class is never admissible
PASS  emergency_stop_defaults_ON_on_a_fresh_install  fresh migrate → engaged = 1 (저장된 상태)
PASS  cli_refuses_gate_pass_without_real_evidence    evidence file ... does not exist in the repository
PASS  durability_soak_floor_100_cycles               300 cycles / 300 SIGKILL / 300 restore / 1800 probes / 0 failure
SELF_PROBES_PASS: 11/11
```
이 probe는 이제 `scripts/local-ci.mjs`의 고정 단계이므로, 앞으로 내가 이 성질 하나를 잃으면 내 CI가 먼저 실패한다.

### 자기 검증에서 발견하고 고친 판정기 결함

첫 실행에서 내 lane probe 3개가 잘못된 이유로 결과를 냈다.

1. `events`의 컬럼명을 `payload_json`으로 잘못 써서 "거부됨"이 아니라 "그런 컬럼 없음"으로 통과했다.
2. `blobs`·`inbox_items`가 빈 테이블이어서 `UPDATE`/`INSERT`가 **0행을 바꾸고 성공**했고, 그래서 실재하는 trigger 2개가 없는 것처럼 FAIL로 보고됐다.

두 번째 결함은 Claude lane 판정에도 그대로 있었다 — 그쪽 `projects`·`source_versions`도 0행이므로 G2 probe 2개가 공허했다. 그래서 판정기를 고쳤다: probe는 필요한 행을 먼저 심고, `changes === 0`이면 PASS도 FAIL도 아닌 **UNVERIFIABLE**로 기록한다. 0행을 건드린 문장은 아무 것도 증명하지 않는다. 위 §3의 G2 수치는 모두 행을 심은 뒤 재측정한 값이고, 재측정 후에도 G1~G4 판정은 바뀌지 않았다.

## 5. 이 판정이 뜻하지 않는 것

- Claude lane을 버려야 한다는 뜻이 아니다. provider adapter 4종, durable queue의 retry/dead-letter, FTS5 기억·욕망 감쇠·world model 같은 **넓이**는 내 lane에 아직 없다.
- 그쪽 G5 live codex RUN 성공은 내가 재현할 수 없다(Owner 머신에만 인증이 있음). 내 lane의 G5는 계속 `BLOCKED_PROVIDER_ACCESS`, G6는 `PREP_ONLY`다. 이 판정으로 바뀌지 않는다.
- 어느 저장소도 병합하지 않았고 PR #513도 merge하지 않았다.

## 6. 결론

게이트 상태는 **이전할 수 없고 다시 벌어야 한다**. 코드는 이전할 수 있다. 두 lane을 합칠 때 옳은 방향은 그쪽 `STATUS.md`의 G1~G4 PASSED를 승계하는 것이 아니라, 그쪽 breadth(provider adapter, queue, memory/world model)를 이 저장소로 옮기고 여기 스키마 강제·fail-closed 기본값·soak floor 아래에서 각 게이트를 다시 통과시키는 것이다. 저장소는 계속 하나다(CLAUDE.md §1).
