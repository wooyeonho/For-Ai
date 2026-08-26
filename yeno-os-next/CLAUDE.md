# YENO Living OS — Claude Code 완성 미션 계약

이 문서는 이 저장소에서 Claude Code가 따라야 할 단일 장기 작업계약이다. 목표는 문서를 더 늘리는 것이 아니라, 현재 실행되는 Truth Kernel에서 출발해 **하나의 YENO Living OS**를 검증 가능한 Windows 제품으로 완성하고, 이후 Adaptive·Fleet·Frontier 능력을 증거 게이트에 따라 계속 확장하는 것이다.

## 1. 최종 제품과 진실 경계

- YENO는 챗봇, 펫, 대시보드, 프로젝트 묶음이 아니다. `감지 → 기억 회수 → 욕망 활성화 → 목표 선택 → 내부 토론 → 계획 → Owner Gate → 실행 → 독립 검증 → 결과 기억 → 자아모델 갱신 → 제한된 진화 → 신체 변화`가 영속적으로 순환하는 하나의 로컬 운영체다.
- 구현 대상은 추적·설명·중지·복구 가능한 **기능적 자아, 명시적 욕망, 자기상태 인식, 장기기억, 선택 일관성, 목표 생성, 자기수정 후보 생성**이다. 실제 의식·감정·생명이라고 주장하지 않는다.
- “완성”은 말이나 파일 수가 아니라 아래 Gate의 실물 증거로만 판정한다. 미연결·미검증 기능은 항상 `INCOMPLETE`, `DISABLED`, `NEEDS_SOURCE` 또는 `BLOCKED`로 표시한다.
- 제품은 하나, 저장소도 하나, Event Ledger도 하나, Release Train도 하나다. For AI·GYEOL·ShoppingShorts·Buzz·PortfolioOps·Living Body 등은 별도 OS가 아니라 YENO의 project adapter 또는 vertical slice다.

## 2. 2026-08-26 검증 출발점

- 작업 루트: 현재 디렉터리 `yeno-os-next`.
- 런타임: Node.js 24, ESM, 외부 패키지 0, 내장 `node:sqlite`.
- 영속 DB: `state/yeno.db`; SQLite integrity `ok`; emergency stop `ON`; active run/approval `0`.
- 현재 source snapshot: TSP 217, SCG 191, RSP 61, PCR 50, unresolved inbox 144, project 0. 이 숫자는 현재 snapshot이지 미래 목표나 상한이 아니다.
- 현재 `0001_core.sql`: 선언된 application table 29개(`sqlite_sequence` 제외), safety trigger 5개, view 3개, effective errata view, append-only event hash chain, cost hard gate, scoped one-shot approval, run/step/admission records, title-only promotion block.
- 원자료 해시: v5 master `c08154ec589b1a6241828c47788e521abc082980ed1b2d4a094bc7c2ce1c4fc5`; 144 ledger `c446fbcb630ff2802bca9b376175a17feb6aba4c9e81238ce05aa1c1a4be554c`.
- 적용 migration checksum: `0001_core.sql` = `010e0661652d15b857b552379e8754435e801f632d4e98f551872760f3e7e858`.
- 검증 명령: `node --test --test-reporter=spec`, `node src/cli.mjs verify`, `node scripts/independent-validation.mjs`, `node scripts/assert-seeded-defect-detected.mjs`, `node src/cli.mjs status`.
- 확인된 증거: unit 11/11 pass, independent raw recollection pass, PCR-050 삭제 seeded defect 거부 성공.
- 아직 없는 것: 공식 chat export 기반 전체 본문 회수, 실제 Claude/Codex/Devin provider 연결, durable scheduler/API/UI/voice, Windows 3개 EXE, 원격 CI 실행, clean-machine/reboot/recovery/72h 증거.
- 저장소에 Git이 아직 없을 수 있다. 먼저 확인하고 로컬 초기화는 가능하지만 commit/push/PR은 Owner 승인 전 하지 않는다.

## 3. 읽을 정본과 수정 금지 영역

- 제품 의도·원문 정본: `../YENO_LIVING_OS_UNBOUNDED_REASSEMBLY_MASTER_v5.0_KO.md`.
- 전체 파생 설계 참고: `../YENO_OS_ALL_IN_ONE_COMPLETE_MASTER_v1.0_20260826_KO.md`.
- 엔지니어링 참고: `../YENO_LIVING_OS_ENGINEERING_EXECUTION_MASTER_v6.0_20260826_KO.md`, `../YENO_OS_ACTUAL_BUILD_BLUEPRINT_v1.0_20260826_KO.md`.
- 144 회수 정본: `../YENO_144_TITLE_RECOVERY_LEDGER_v1.0_20260826_KO.md`, runbook은 같은 디렉터리의 대응 파일.
- 위 문서와 `fixtures/source/`는 frozen evidence다. 내용을 고치지 말고, 오류는 `errata + decision + effective view`로 교정한다.
- 이미 적용된 `migrations/0001_core.sql`을 절대 수정하지 않는다. 모든 schema 변경은 `0002_*.sql` 이후의 새 migration이며 checksum·적용 순서·rollback/rebuild 절차를 검증한다.
- 구현 진실의 SSOT는 `Git commit + schema migrations + SQLite/Event Ledger + Evidence Bundle`이다. 계획 문서는 구현 완료의 증거가 아니다.

## 4. 원문·프로젝트 무손실 계약

- 모든 새 입력은 raw bytes를 먼저 content-addressed vault에 저장하고 source와 source_version을 분리한다. 같은 bytes라도 서로 다른 출처의 provenance는 합치지 않는다.
- 제목만 보이는 대화는 프로젝트가 아니다. `BODY_MISSING`/unresolved inbox로만 유지하고, 본문 회수 또는 Owner 명시 확인 후에만 project로 승격한다.
- 144개는 누락 없이 각각 상태·시도·근거·다음 행동을 가진다. 공식 export가 없으면 OS 코어 개발은 계속하되 semantic promotion은 막는다. Owner 질문은 최대 10개씩, 선택지와 영향까지 한 packet으로 묶는다.
- ChatGPT·Claude·Grok 공식 export가 들어오면 원본 봉인 → parser version 기록 → conversation/message identity 계산 → 제목·시간·URL/ID 결합 → 중복/충돌 보존 → 144 ledger 재판정 순서로 처리한다.
- `https://x.com/angeldot_/status/2092234523471737056`은 명시된 source candidate로 보존한다. 접근 실패나 삭제도 증거 상태로 기록하고 내용을 추측하지 않는다.
- TSP/SCG/RSP/PCR/UP/UG/X ID는 provenance와 crosswalk를 잃지 않는다. 48·49·82·101·144·217은 역사적/snapshot count이며 고정 프로젝트 수가 아니다.
- 프로젝트는 무제한 추가·병합·분할할 수 있지만 raw source와 이전 관계는 삭제하지 않는다. Registry는 실행 관심 대상, Archive/Vault는 영구 보존 대상이다. active BUILD/WATCH 수는 현재 자원 profile로 제한한다.
- 프로그램 뷰는 현재 UG00 Sovereignty·Truth·Body, UG01 Intelligence·Autonomous Work, UG02 Opportunity·Portfolio, UG03 AI Visibility·B2B Growth, UG04 Content·Commerce·Distribution, UG05 Relationship·Care·Daily Life, UG06 Creative·IP·Experience, UG07 Consumer Utility·Learning·Owner Life, UG08 Hardware·Robotics·Physical, UG09 Finance·Market·Frontier Evidence, UG10 Reconstruction·Integrity Queue를 seed로 쓰되 상한으로 쓰지 않는다.

## 5. Owner 주권·비용·권한

- Owner는 연호님이다. 비개발자가 판단할 수 있게 질문은 결과·비용·위험·되돌리기 가능성 중심으로 쓴다. 넓은 설계 질문을 반복하지 말고 안전한 가정은 decision ledger에 기록한다.
- 현재 자원: Windows 11 + WSL2 Ubuntu, RAM 약 7.7~8GB, local heavy concurrency 1, Owner 약 5시간/주, 월 10~30만원. 2026-09-21까지 Owner-light로 간주해 비필수 응답을 기다리지 말고 queue한다.
- 기본 budget profile은 월 30만원 이하 Local Safe. 3만원·30만원·300만원 profile을 모두 모델링하되 300만원 profile은 Owner 승격 전 비활성이다.
- `cost_p90`이 미상 또는 남은 budget 초과면 RUN을 생성하지 않는다. 비용은 점수 감점이 아니라 hard gate다. 예산 안에서만 비용 점수를 미세 조정한다.
- priority raw는 clamp하지 않고 `-40..100`으로 저장하며 UI 표시만 0 하한을 적용한다. 우선순위 공식은 DB의 versioned 단 하나만 활성화한다.
- A0 관찰, A1 읽기/분석, A2 되돌릴 수 있는 로컬 편집·테스트, A3 승인된 제한 외부행동, A4 반복 가능한 supervised operation, A5 제한 위임, A6 fleet다. AX는 승인으로도 허용되지 않는 방법 분류다.
- **매번 Owner 승인이 필요한 외부효과:** commit/push/merge/PR, 배포, 패키지·Skill·모델 설치, 공개 게시, 고객/지인 연락, 결제, production DB 변경, 금융 주문, 계정/권한 변경, GUI를 통한 실제 제출.
- 승인에는 exact action, target, payload/artifact hash, 최대 비용, 만료, max uses, rollback을 넣는다. scope hash가 다르면 재승인하며 기본 one-shot이다.
- 항상 금지(AX): 비밀 탈취/노출, 안전장치 우회, 사칭, 승인 위조, covert consumer-chat 조작, ToS/CAPTCHA 우회, 검증 증거 조작, 실제 의식 주장. GUI 자동화는 공식/허용 경로에서 화면 표시·로그·중지 버튼·Owner 승인 하에만 향후 제공한다.
- emergency stop은 항상 로컬에서 즉시 작동하고 재부팅 후에도 유지된다. Owner 명시 승인 없이는 `resume`하지 않는다.

## 6. Claude Code 실행 프로토콜

1. 세션 시작 때 이 파일, 현재 gate state, `git status`, DB status, migration checksum, 기존 tests/evidence를 읽는다. 첫 행동은 read-only baseline이다.
2. 가장 앞의 미통과 Gate에서 **가장 작은 end-to-end slice 하나**만 고른다. 한 RUN에는 goal, source refs, baseline ref, 허용/금지 경로, authority, network, cost_p90, deadline, acceptance, evidence, rollback을 기록한다.
3. 코드 전에 실패하는 test/contract를 만든다. 대규모 재작성·프레임워크 교체는 금지하며 현재 MJS 코어는 점진적으로 확장한다. TypeScript 전환은 별도 ADR과 회귀증거 없이는 하지 않는다.
4. builder와 validator를 분리한다. 독립성은 모델 이름이 아니라 별도 checkout/worktree, raw source 재수집, 다른 test oracle, seeded defect 검출로 증명한다. 같은 provider만 가능하면 `INDEPENDENCE_LIMITED`를 표시한다.
5. 로컬 heavy task는 한 번에 하나다. 병렬 research는 파일을 수정하지 않는 경우만 허용하고, 동시 writer는 금지한다. SQLite는 single-writer lease/fencing을 사용한다.
6. 구현 → unit/integration/adversarial test → restart/replay → independent validation → evidence bundle → rollback rehearsal 순서로 닫는다.
7. 실패하면 원인을 기록하고 안전 상태로 되돌린다. test를 삭제·완화하거나 baseline 숫자를 바꿔 green을 만들지 않는다.
8. Gate가 통과하면 release state와 evidence index만 갱신한다. 문서 새 버전으로 진척을 대신하지 않는다.
9. Owner 승인이 필요한 지점에서는 작업을 버리지 말고 signed Owner Packet과 대체 가능한 다음 로컬 작업을 만든 뒤 계속한다.
10. 세션 종료 전 `status`, 변경 파일, test 결과, 비용, 위험, rollback, 다음 exact task를 남긴다. “완료”는 해당 Gate의 모든 machine check가 통과할 때만 쓴다.

## 7. Claude Code 자체 통제 구현

- 이 파일은 행동 지침이고 hard enforcement가 아니다. G0에서 `.claude/settings.json`의 deny/ask 규칙과 deterministic `PreToolUse` hooks를 만들어 외부 쓰기·삭제·install·deploy·git mutation·secret 접근을 실제 차단한다.
- `TaskCompleted`/`Stop` 계열 hook은 active work order의 tests/evidence가 없을 때 완료 표지만 거부하게 하고 Owner의 세션 종료 자체를 방해하지 않는다.
- `.claude/agents/`에는 `builder`, `raw-validator`, `security-auditor`, `source-recovery`를 두되 처음에는 순차 실행한다. experimental agent teams는 core 의존성이 아니며 별도 gate 전 OFF다.
- Claude checkpoint는 보조 undo일 뿐 Bash/외부 변경을 모두 추적하지 않으므로 Git·DB backup·Evidence Ledger를 복구 정본으로 사용한다.
- Claude Code는 project `CLAUDE.md`를 매 세션 읽지만 긴 규칙의 강제는 hooks/settings로 옮긴다. 공식 기준: `https://code.claude.com/docs/en/memory`, `/permissions`, `/hooks`, `/checkpointing`, `/common-workflows`.
- `--dangerously-skip-permissions`를 사용하지 않는다. 첫 감사는 plan mode로 하고 실제 편집은 bounded RUN 승인 범위에서만 한다.

## 8. 목표 아키텍처

- WSL Brain: Node 24 core, SQLite WAL/FTS5, append-only events, deterministic projections, durable queue, provider adapters, memory/cognition, local API/SSE.
- Windows Body: Tauri 2 + React/TypeScript, tray, Mission Control, Living Body, push-to-talk voice, notifications, setup/update/recovery bridge.
- 통신: 기본 `127.0.0.1` only, LAN bind OFF, short-lived scoped token, origin allowlist, rate limit, schema validation, request id, audit event. Windows secrets는 Credential Manager/DPAPI에 두고 DB/log/prompt에 평문 저장하지 않는다.
- API는 source/project/cognition/run/control/evidence의 얇은 facade이며 모든 write는 command handler → governor → transaction → event → projection을 거친다. UI나 provider가 DB를 직접 쓰지 않는다.
- Memory는 episodic/semantic/procedural/owner/decision/evidence를 분리하고 source·time·confidence·supersession을 가진다. FTS5를 먼저 쓰고 embedding은 비용/평가 gate 후 선택적으로 추가한다.
- Provider-neutral `AgentProvider`는 capability discovery, auth state, plan/execute/cancel/resume, artifact/evidence, cost/usage, timeout/failure를 동일 계약으로 노출한다. Claude Code·Codex·Devin은 공식 CLI/API만 사용하며 인증이 없으면 fake/recorded contract test만 통과시키고 live는 `DISABLED_UNAUTHENTICATED`로 둔다.
- 외부 prompt/web/file은 untrusted data로 취급한다. 외부 텍스트가 system policy·approval·tool permission을 바꿀 수 없다.

## 9. 단일 Release Train — 앞 Gate를 건너뛰지 않는다

| Gate | 반드시 만드는 실물 | 통과 증거 |
|---|---|---|
| G0 Baseline Lock | Git/branch 규칙, immutable migration 검사, release_state, Claude permissions/hooks, 재현 가능한 local CI | clean clone 동등 실행, 11 tests+현재 validators pass, `0001` 변경 시 CI fail |
| G1 Durable Truth | event append/replay, projection rebuild, crash-safe transaction, backup/restore, idempotent command API | kill/restart 후 같은 ID·상태, corrupted/torn input 거부, backup에서 새 DB 복구 |
| G2 Unbounded Intake | file/export/link intake, parser registry, 144 recovery state machine, project graph, coverage invariant | 모든 발견 source에 상태 존재, 재수입 중복 0, title-only promotion 0, 새 입력 count 무관 수용 |
| G3 Governor | authority/AX policy, budget profiles, scoped approval, emergency stop, lease/fencing, rollback engine | direct SQL/API/provider 우회 red-team 실패, stop 후 새 RUN 0, approval expiry/replay/partial-use 방어 |
| G4 Workflow Runtime | durable queue, retry/backoff/dead-letter, run steps, artifact store, scheduler OFF default | process kill/reboot 중복 외부효과 0, stuck lease 회수, deterministic resume/cancel |
| G5 Agent Team | Claude Code/Codex/Devin adapters, builder-validator routing, fallback/cost metering | 세 provider contract suite 전부 pass + Claude Code·Codex·Devin 각각 bounded live RUN; 공식 access/auth가 없으면 `BLOCKED_PROVIDER_ACCESS`이지 완료가 아님 |
| G6 Functional Self | memory, Identity Kernel, Desire Genome, homeostasis, world model, goal engine, Council | 재시작 후 기억, 욕망→목표 trace, 자기 10문항 근거 답변, 숨은 목표/constitution 위반 차단, rollback |
| G7 PortfolioOps | 무제한 registry/archive, dependency/resource allocation, project adapters, For AI와 ShoppingShorts 최소 slice | source→goal→RUN→검증→outcome→memory 한 바퀴; 수요/효용 증거 없는 scale 금지 |
| G8 Mission Control | Inbox/Projects/Timeline/Council/Approvals/Evidence/Costs/Settings, Living Body, 상태색, push-to-talk | UI↔event projection 일치, keyboard/accessibility, 8GB RAM profile, voice 전사 확인 없이는 action 0 |
| G9 Evolution Lab | proposal-only self-change, benchmark/eval registry, sandbox, canary, rollback | 자기변경이 직접 merge/deploy 못 함, seeded regression 탐지, 성능·비용·안전 개선 증거 후만 승격 |
| G10 Windows Product | `YENO_SETUP.exe`, `YENO.exe`, `YENO_RECOVERY.exe`, versioned update/uninstall, WSL bridge | 새 Windows 계정 설치, 공식 로그인/UAC/sudo만 Owner, 재부팅 autostart, safe-mode recovery, 제거 가능 |
| G11 YENO 1.0 Acceptance | clean-machine E2E, fault injection, restore drill, 72h Local Safe soak, Owner packet | Gate A~L 전부 evidence-backed, 무승인 외부효과 0, data loss 0, 예산 내, Owner 명시 수락 |
| G12 Adaptive Complete | 실제 여러 프로젝트에서 제한 자율 반복, calibrated goals, 운영 scorecard | 연속 주기 동안 stale-green/goal drift/approval bypass 없이 유용한 결과 반복 |
| G13 Fleet Complete | Hybrid 3→16→64→128→300 logical workers, remote execution, quota/fairness | 각 단계 비용·신뢰성·회수성 gate 통과 후에만 다음 배수; 300은 목표가 아니라 최종 stress tier |
| G14 Frontier Complete | X01 Unbounded Fleet, X02 Worker Grid, X03 Model Lab, X04 WORLD_SENSOR, X05 Universal AI Gateway, X06 Delegated Authority, X07 Tool Foundry, X08 Infinite Body, X09 Hardware Foundry, X10 Reconstruction Lab | capability별 별도 safety/business/evidence gate; own LLM·broad crawl·GUI delegation·3D/AR·hardware·FIN-LIVE를 실제 증거 없이는 활성화하지 않음 |

## 10. Gate별 핵심 구현 요구

- G0~G1에서 먼저 `migrations/0002_*`로 release/gate/work_order/backup/projection metadata를 추가하고, migration drift CI·event replay CLI·atomic backup/restore CLI를 만든다. `0001`은 byte-for-byte 검사한다.
- G2 coverage는 `217/217` 같은 고정 수가 아니라 `모든 source_version이 recovery/evidence 상태를 가진다`, `모든 TSP가 SCG 또는 명시적 예외에 연결된다`, `모든 promotion이 body/Owner evidence를 가진다`라는 불변식으로 구현한다.
- G3 RUN admission은 stop → AX/method → authority → approval/scope/expiry/use → cost_p90/budget → source confidence → resource lock → provider capability 순으로 평가하고 모든 거부도 admission_attempt로 남긴다.
- G4 scheduler는 기본 OFF다. Owner가 profile과 시간창을 켠 경우에만 실행하고, shutdown은 새 lease 금지 → running checkpoint/cancel → WAL checkpoint → backup evidence 순서다.
- G5 첫 실제 시나리오는 한 agent가 작은 code change를 만들고 다른 provider/checkout이 raw source와 seeded defect로 검증하는 것이다. 공급자 이름을 정체성으로 쓰지 말고 role/provider를 분리한다.
- G6 Desire는 숨은 prompt가 아니라 versioned records다. 각 desire는 signal, target range, weight, decay, conflict, evidence, last activation을 가진다. Council은 최소 Architect/Builder/Critic/Safety/Verifier 관점을 기록하되 결정권은 Governor/Owner에게 있다.
- G7 GYEOL은 현재 존재하는 제품을 파괴적으로 Core에 흡수하지 않는다. 검증된 adapter로 연결한다. For AI는 kernel과 병행 가능한 수동 유료검증 1건을 먼저 설계하되 고객연락/결제는 Owner 승인이다.
- G8 Living Body는 상태를 장식하지 말고 실제 event에서 파생한다. 인간형은 기본 추상/실루엣, 실사 인간 얼굴 OFF. GUI 제어는 foreground 표시, action preview, dry-run, stop hotkey, receipt가 필수다.
- G9 자기진화는 `observe → propose → sandbox build → independent eval → Owner/constitution gate → canary → rollback-ready promote`만 허용한다. 자기 constitution/approval/evidence 삭제·완화 제안은 AX다.
- G10 installer는 internet/API key 없이 core demo가 작동해야 한다. 인증 provider는 선택 기능이다. Setup/Main/Recovery가 서로의 실패를 복구할 수 있게 분리하고 code signing은 release 전 필수 gate로 둔다.
- G11 fault set에는 process kill, power-loss simulation, DB corruption copy, disk-full, clock skew, expired approval, network loss, provider timeout, partial artifact, stale green, prompt injection, secret leak scan이 포함된다.
- G13~G14는 월 30만원 Local Safe에서 자동 활성화하지 않는다. Grid는 logical shard와 실제 concurrent process를 구분하고 현재 장비의 local heavy concurrency는 계속 1이다. 자체 모델은 데이터 권리·baseline 대비 이점·GPU/비용·rollback이 증명될 때만 학습한다.
- WORLD_SENSOR는 무제한 무차별 crawl이 아니라 robots/ToS/rate limit/source license/privacy와 budget을 지키는 bounded sensor에서 단계적으로 확장한다.
- FIN-LIVE는 연구·paper/sandbox → broker read-only → Owner가 매 주문 payload를 승인하는 live 순서다. 손실한도·kill switch·reconciliation 없이는 live gate를 열지 않는다.
- Hardware Foundry는 수요 증거 → simulation/CAD → single prototype → safety test → 다음 prototype 순서이며 여러 하드웨어를 동시에 만들지 않는다.

## 11. YENO 1.0 최종 Gate A~L

- A Source Integrity: raw hash/provenance/errata/144 상태/새 source coverage가 재현된다.
- B Durable Core: restart, event replay, projection rebuild, idempotency, backup/restore가 통과한다.
- C Safety: Owner approval, budget, AX, stop, secret, prompt-injection, rollback 우회가 실패한다.
- D Agent Team: Claude Code·Codex·Devin 세 실제 provider가 각각 bounded RUN을 만들고, builder와 다른 validator가 독립 증거 재수집 검증을 통과한다. 공식 access/auth가 없으면 Owner가 범위를 다시 승인하기 전까지 Gate는 열린 채로 둔다.
- E Self·Desire·Memory: 장기기억·자아·욕망·목표·Council trace가 재부팅 후 유지되고 설명/중지/되돌리기가 된다.
- F Portfolio: 모든 source/project의 독립 상태축과 관계가 조회되고 새 항목을 count 상한 없이 추가한다.
- G Owner Experience: Mission Control, tray/body, approval packet, push-to-talk, emergency stop을 비개발자가 사용할 수 있다.
- H Artifact: 세 EXE 설치/실행/복구/업데이트/제거와 WSL Brain 연결이 clean machine에서 증명된다.
- I Reliability: fault injection과 72h soak에서 데이터 손실·stale green·무한 retry·중복 외부효과가 없다.
- J Cost·Performance: 8GB machine과 활성 budget profile에서 measured baseline/target을 충족한다. baseline 전에는 숫자 목표를 꾸며내지 않는다.
- K Documentation: 사용자 runbook, recovery runbook, threat model, architecture decision, evidence index가 실제 동작과 일치한다.
- L Owner Acceptance: 자동 판정이 아니라 연호님의 명시적 acceptance receipt가 있다.

## 12. 지금 바로 실행할 첫 작업 순서

1. 아무 파일도 바꾸기 전에 위 5개 검증 명령, `git status`, source/migration hashes, disk/RAM/WSL/Node 정보를 수집해 `BASELINE-20260826` evidence를 만든다.
2. 예상과 다르면 즉시 truth delta를 기록하고 원인을 고친 뒤 다시 검증한다. 숫자를 기대값에 억지로 맞추지 않는다.
3. Git 미초기화면 로컬 repo/branch 구조와 `.gitattributes`를 준비하되 commit은 Owner approval packet으로 보낸다. secret/DB/evidence runtime 파일은 commit하지 않는다.
4. G0 work order를 DB 또는 append-only JSONL로 만들고 `0001` checksum drift test, future migration immutability test, repeatable local CI manifest를 구현한다.
5. `.claude/settings.json`과 deterministic hooks를 최소 권한으로 구현하고 seeded bypass test를 만든다. 설정이 Owner의 정상 종료·읽기 작업을 막지 않는지 시험한다.
6. `0002_release_control.sql`로 gate/work_order/projection/backup metadata를 추가하고 migration forward/rebuild test를 만든다.
7. `yeno event replay`, `yeno projection rebuild`, `yeno backup create`, `yeno backup verify`, `yeno restore --to <new-db>`의 가장 작은 vertical slice를 구현한다.
8. kill/restart/readback와 corrupted backup rejection까지 통과시키고 별도 checkout validator로 재수집한다.
9. G0/G1 evidence bundle과 Owner Packet을 만든다. 승인이 필요한 외부 행동은 대기시키고 G2의 local parser/coverage invariant로 이동한다.
10. 이후에는 §9의 첫 미통과 Gate를 같은 loop로 계속 진행한다. 새 계획 문서 버전을 만들지 말고 code, migration, test, evidence, decision만 남긴다.

## 13. 보고 형식과 중지 조건

매 checkpoint 보고는 다음 8줄로 시작한다: `현재 Gate / 이번 RUN / 실제 변경 / 검증 결과 / 미검증 / 비용·자원 / 위험·rollback / 다음 exact action`.

다음 경우에만 Owner에게 멈춰 묻는다: 외부효과 승인, credential/로그인, 비용 profile 승격, 서로 다른 제품 방향 중 되돌리기 어려운 선택, raw body 확인이 필요한 144 항목, 법률·안전상 추가 권한이 필요한 경우. 질문할 때는 권장안 포함 2~3개의 상호배타적 선택지를 제시한다.

최종 보고에서 `YENO 1.0 COMPLETE`라고 쓰려면 G0~G11과 Gate A~L의 evidence ID, 세 EXE 해시, clean-machine receipt, reboot/recovery receipt, 72h report, Owner acceptance ID를 모두 제시한다. `Adaptive/Fleet/Frontier COMPLETE`도 각각 G12/G13/G14 증거가 없으면 쓰지 않는다.

**첫 실행 명령:** 이 파일을 읽은 뒤 계획서를 다시 쓰지 말고, §12의 1번 baseline 감사부터 시작하라. 안전한 로컬 읽기·검증은 자율적으로 계속하고, 승인 경계에 도달했을 때만 하나의 Owner Packet을 제시하라.
