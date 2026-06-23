# CODEX_AGENT.md — GYEOL용 Codex 작업 지시문

이 문서는 **Codex(및 Devin 등 샌드박스 에이전트)** 가 GYEOL 저장소에서
"LazyCodex 스타일"의 자가 점검·수정 루프를 **안전하게** 돌리기 위한 운영
지시문입니다. `AGENTS.md`(제품 비전·불변 규칙)를 먼저 읽고, 이 문서의
가드레일을 반드시 지키세요.

---

## 0. 절대 규칙 (AGENTS.md 요약 + 추가)

- GYEOL은 AI 위키가 아니라 **claim 단위 로컬 팩트 레지스트리**다.
- `schema-v3.sql`이 Source of Truth. 다른 DB 모델을 만들지 말 것.
- 정적 우선(static-first). 핵심 문서 내용은 JS 없이 raw HTML에서 읽혀야 한다.
- 검증되지 않은 사실은 **반드시** `확인 필요` / `confidence: low` /
  `status: needs_review` / `sources: []` 로 시작한다. AI 생성물도 예외 없음.
- 가짜 사실 금지. 출처 없는 값을 verified로 올리지 말 것.
- 제출(edits/reports/hallucination_reports)은 공개 읽기 금지, raw IP 저장 금지
  (`contributor_hash`만).
- **전체 저장소 재작성 PR 금지.** 의도한 파일만 좁게 수정한다.

---

## 1. LazyCodex 루프 (한 번에 P0 하나)

```
1) 최신 main에서 브랜치를 딴다.
2) `npm install`
3) `npm run ai:lazycodex:doctor` 를 실행해 실패한 P0 체크를 확인한다.
4) 실패 항목 "하나"를 고른다 (한 PR = 한 관심사).
5) 가장 작은 수정으로 그 항목을 고친다.
6) 아래 게이트를 모두 통과시킨다 (섹션 3).
7) 좁은 범위의 커밋 + 좁은 범위의 PR을 만든다.
8) 다음 실패 항목으로 반복. 더 이상 실패가 없으면 멈춘다.
```

모호하면 추측하지 말고 PR 설명에 질문을 남기거나 사람 검토를 요청하세요.

---

## 2. P0 표준 (doctor가 강제하는 항목)

`npm run ai:doctor`(= `ai:lazycodex:doctor`)가 다음을 점검합니다. 100점 만점,
하나라도 실패하면 exit 1:

- 인코딩: `app/`·`lib/`에 mojibake 없음 (한글은 실제 UTF-8, 예 `확인 필요`).
- 라우트: `/api/document`(단수) 금지, `/api/documents`만 허용.
- `/llms.txt` 라우트 존재 + citation policy 포함.
- `sitemap`에 `/llms.txt` 포함.
- `robots`에 sitemap + host 노출.
- raw Markdown에 인용 가이드(Citation guidance) 포함.
- 문서 페이지가 JSON-LD `Dataset` + `generateMetadata` 출력.
- layout에 `lang`, title template, 사이트 헤더/푸터.
- 공개 페이지에 title 메타데이터.
- 커스텀 404 존재.
- `.gitignore`가 `.next/`·`node_modules/` 무시.
- 빌드 산출물/거대 덤프 커밋 안 됨.

새 표준을 추가하려면 `scripts/ai-readiness-doctor.mjs`에 체크를 추가하세요.

---

## 3. 머지 전 필수 게이트 (모두 통과해야 함)

```bash
npm run lint
npm run build
npm run ci:guards          # route / mojibake / artifact / diff-size
npm run ai:lazycodex:doctor
node scripts/validate-topic-candidates.mjs data/topic-candidates.sample.jsonl
node scripts/validate-topic-candidates.mjs data/topic-candidates/long-tail-combination-sample.jsonl
```

CI(`.github/workflows/ci.yml`)가 동일 게이트를 PR마다 실행합니다. 로컬에서
먼저 초록불을 만든 뒤 PR을 여세요.

---

## 4. 전체-재작성 PR 방지 (가장 중요)

이전에 샌드박스 에이전트가 트리 전체를 재생성해 충돌 PR을 만들었습니다.
다음을 반드시 지키세요:

- **샌드박스 출력 전체를 머지하지 말 것.** 의도한 새/변경 파일만 추출해서
  최신 `main` 위 새 브랜치에 적용한다.
- `diff-size` 가드: 변경 파일 수가 한도(현재 40)를 넘거나 핵심 파일
  (`app/`·`lib/`·`scripts/`·`schema-v3.sql`·`AGENTS.md`·`package.json`)을
  삭제하면 실패한다. 의도된 대규모 변경이면 최신 커밋 메시지에
  `[large-diff-ok]`를 넣어 명시적으로 통과시킨다.
- 핵심 파일을 삭제·대량 재포맷하지 말 것. 무관한 파일은 건드리지 말 것.
- 생성된 대용량 JSONL은 git에 커밋하지 말 것. 작은 샘플만 유지하고 전체는
  DB/오브젝트 스토리지로.

### 샌드박스 출력에서 유효 파일만 추출하는 절차

```
1) 최신 main 체크아웃 → 새 브랜치.
2) 샌드박스가 만든 "의도한 경로"만 복사 (allowlist). 전체 patch/tree 적용 금지.
3) npm install && 섹션 3 게이트 실행.
4) 통과 시에만 좁은 PR 생성.
```

---

## 5. 커밋 / PR 규칙

- 한 PR = 한 관심사. 작고 검토 가능한 단위.
- 커밋 메시지는 무엇을·왜를 명확히. 모델 식별자/내부 메타데이터를 커밋·PR에
  넣지 말 것.
- PR 설명에: 어떤 P0를 고쳤는지, 실행한 게이트 결과, 범위(touched files)를 적기.
- 사람이 명시적으로 요청하기 전에는 PR을 자동 머지하지 말 것.

---

## 6. 지금 하지 말아야 할 것

- 검증 워크플로/CI 없이 1k·10k 후보 대량 생성.
- 사용자 계정·결제·댓글·복잡한 auth 추가.
- AI 기반 자동 "검증"으로 high/restricted(의료·법률·금융 등) 사실을
  verified로 승격.
- 미검증 placeholder 페이지를 sitemap에 넣어 색인되게 하기.

---

## 7. 빠른 명령 레퍼런스

```bash
npm run dev                  # 로컬 개발
npm run build                # 프로덕션 빌드
npm run lint                 # eslint
npm run ci:guards            # 가드 4종 일괄
npm run ai:lazycodex:doctor  # AI-readiness 닥터 (P0 점수)
node scripts/ai-readiness-doctor.mjs --with-build   # lint+build 포함 풀 점검
```
