# APPLY_ALL.md — 순서대로 한 번에 적용 (env → B4 → B3 → B1/B2 → 디자인)

두 가지 방법. **A) 자동 스크립트** 권장, **B) 수동**은 한 단계씩.

---

## A. 자동 스크립트 (5분)

```bash
# 저장소 루트에서
cp -R design_handoff_for_ai/code _forai_apply   # 이 폴더를 루트로 복사
bash _forai_apply/apply.sh                       # env 안내 + B4·B3·B1·B2 + 디자인 일괄
```
스크립트는 idempotent(여러 번 실행 안전)하고, 패턴을 못 찾으면 `[SKIP]`만 출력합니다. 각 파일은 `.bak` 백업이 남고, `git checkout -- .` 로 전체 되돌릴 수 있습니다.

스크립트가 **대신 못 하는 것(사람이 직접):**
1. `.env.local` 값 채우기 — `CONTRIBUTOR_SALT`, Supabase 키, `ADMIN_SECRET`, `ADMIN_CSRF_SECRET` (`openssl rand -hex 32`).
2. Supabase 에 `schema-v3.sql` 실행.
→ 상세: `fixes/SETUP_CHECKLIST.md`. 이걸 안 하면 코드가 맞아도 제출 버튼이 500 으로 먹통입니다.

실행 후:
```bash
npm run lint && npm run build && npm run dev
```
그리고 다른 admin 라우트에 fail-open 잔재가 없는지:
```bash
grep -rn "!ADMIN_SECRET" app/api
grep -rLn "requireAdmin" app/api/admin
```

---

## B. 수동 (단계별 + 커밋 메시지)

### 0) ENV / 스키마 — 코드 커밋 아님
`.env.local` 채우고 Supabase `schema-v3.sql` 실행. (`fixes/SETUP_CHECKLIST.md`)

### 1) B4 — 관리자 인증 fail-closed
- `fixes/app/api/admin/review/route.ts` → `app/api/admin/review/route.ts` 로 교체.
- `grep -rn "!ADMIN_SECRET" app/api` 로 나오는 다른 라우트도 공용 `requireAdmin` 으로 통일.
```
fix(admin): close auth fail-open in admin API routes

review/route.ts used a stale local authorized() that returned true when
ADMIN_SECRET was empty. Replace with shared requireAdmin() (fail-closed
secret + CSRF + rate-limit) from lib/admin-api. Audit other admin routes
for the same pattern.
```

### 2) B3 — locale 하드코딩 제거
- `app/report/[slug]/ReportForm.tsx`, `app/community/CommunityClient.tsx`: `/ko/wiki/` → `/wiki/`.
- `app/api/suggest-topic/route.ts`: `lang: "ko"` → 요청 lang 우선.
```
fix(i18n): remove hardcoded /ko and lang:"ko"

Internal links now go to /wiki/<slug> (middleware redirects to the
visitor's locale). suggest-topic stores the submitted lang instead of
always "ko". Keeps language switching consistent across 7 locales.
```

### 3) B1 · B2 — 거짓 성공 제거
- report/hallucination route: Supabase 미설정 시 503 반환(거짓 성공 금지).
- SuggestTopicForm: `storage:"stub"` 면 에러 표시.
```
fix(submissions): stop reporting success when nothing was persisted

report/hallucination routes returned success:true even in stub mode
(no storage). Return 503 so the form shows an honest failure. Topic
suggestion form now surfaces storage:"stub" as an error.
```

### 4) 디자인 리스킨 (마지막)
- `app/globals.css` 최상단에 폰트 `@import` 추가.
- `globals.reskin.css` 내용을 `app/globals.css` 하단에 붙여넣기.
```
feat(ui): unified paper/ink design system (light + dark)

Token-level reskin of globals.css — IBM Plex Sans KR/Mono, warm paper
background, ink/navy primaries, semantic badges (green=verified,
amber=needs-review, red=disputed). Applies to every page (incl. admin)
via existing CSS classes; light + dark both covered. Markup unchanged.
```

---

## 권장 PR 분리
보안(1)·DB·env 는 사람 리뷰 후 머지. 디자인(4)은 독립 PR 로 — 기능 PR 과 충돌 없음.

## 최종 검증
`../FUNCTIONAL_AUDIT.md` 의 페이지별 버튼 체크리스트를 전수 통과시키면 "모든 버튼·페이지 동작 + 통일 디자인" 완료.
