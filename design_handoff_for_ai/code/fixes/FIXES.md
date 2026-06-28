# FIXES.md — 기능 버그 실제 수정 (저장소 실측 diff)

> 대상 `github.com/wooyeonho/For-Ai@main`. 아래 변경은 **이미 읽고 확인한 실제 코드** 기준입니다.
> 디자인(`globals.reskin.css`)과 **독립**입니다 — 디자인은 이미 전 페이지+다크 적용됩니다. 이 문서는 "버튼/기능이 진짜로 동작"하게 만드는 부분.

선행: **`SETUP_CHECKLIST.md` (환경변수 + Supabase 스키마)를 먼저.** 이것만으로 "버튼 먹통" 대부분이 사라집니다. 아래는 그 후에도 남는 코드 버그.

---

## B4 (보안·최우선) — 관리자 인증 fail-open

**원인:** 공용 헬퍼 `lib/admin-api.ts` 의 `requireAdmin()`/`authorized()` 는 이미 **올바름(fail-closed)**. 그런데 `app/api/admin/review/route.ts` 가 **자체 로컬 `authorized()`** 를 따로 두고 있고 그게 fail-open:
```ts
// (버그) ADMIN_SECRET 이 빈 문자열이면 항상 true
return !ADMIN_SECRET || auth === ADMIN_SECRET;
```

**수정:** 동봉한 `fixes/app/api/admin/review/route.ts` 로 **파일 교체**. (로컬 authorized/supabaseAdmin 제거 → 공용 `requireAdmin`+`supabaseAdmin` 사용.)

**나머지 admin 라우트도 점검(필수):** 같은 로컬 fail-open 패턴이 더 있는지 확인.
```bash
grep -rn "!ADMIN_SECRET" app/api          # fail-open 잔재 탐색
grep -rLn "requireAdmin" app/api/admin     # requireAdmin 안 쓰는 admin 라우트
```
발견되면 모두 `import { requireAdmin } from "@/lib/admin-api"` 후 핸들러 첫 줄에:
```ts
const denied = requireAdmin(request, "admin.<action>");
if (denied) return denied;
```
로 통일. (쓰기 라우트는 `requireAdmin` 이 CSRF 까지 처리.)

**Acceptance:** 빈/오입력 `ADMIN_SECRET` 으로 모든 `/api/admin/*` 가 401. 올바른 secret + 동일 출처에서만 동작.

---

## B1 — 정정/환각 신고: 미저장인데 성공 표시

**파일:** `app/api/report/[slug]/route.ts`, `app/api/hallucination/[slug]/route.ts`

**현재(버그):** Supabase 미설정이면 stub 로깅 후에도 `success:true` 반환 → 폼이 "접수 완료" 표시(실제 저장 0).

**수정 diff — report (hallucination 도 동일 패턴):**
```ts
  } else {
-   // Supabase not configured — stub mode (logs only)
-   console.log('[report] STUB mode — not persisted. slug:', slug, 'message:', message.slice(0, 80));
+   // Supabase 미설정 — 저장 불가. 거짓 성공 금지(B1).
+   console.error('[report] storage not configured — submission NOT persisted. slug:', slug);
+   return NextResponse.json(
+     { error: 'submission_storage_unavailable', persisted: false },
+     { status: 503 }
+   );
  }

  return NextResponse.json({ success: true, slug });
```
hallucination 도 `else` 블록을 동일하게 503 반환으로 교체.

**Acceptance:** 저장 가능할 때만 성공 화면. 미설정 시 폼이 정직하게 실패 표시(`ReportForm` 은 이미 `!response.ok` 에서 에러 배너 표시함).

---

## B2 — 토픽 제안: storage 무시 + lang 하드코딩

**파일:** `app/api/suggest-topic/route.ts`, `app/suggest-topic/SuggestTopicForm.tsx`

**(a) lang 하드코딩** — route.ts `topic_candidates.insert` 의 `lang: "ko"`:
```ts
- lang: "ko",
+ lang: typeof body.lang === "string" && body.lang ? body.lang : "ko",
```
폼에서 현재 locale 을 보내려면 SuggestTopicForm 의 fetch body 에 `lang` 추가(선택). 없으면 기본 ko 유지.

**(b) storage 표면화** — route.ts 는 `storage:"db"|"stub"` 를 반환하지만 폼이 무시. SuggestTopicForm `handleSubmit` 의 성공 분기:
```ts
- } else {
-   setSubmitted(true);
- }
+ } else {
+   const data = await res.json().catch(() => ({}));
+   if (data?.storage === "stub") {
+     setError("저장소가 구성되지 않아 제안이 저장되지 않았습니다. 잠시 후 다시 시도해 주세요.");
+   } else {
+     setSubmitted(true);
+   }
+ }
```

**Acceptance:** 실제 저장(`storage:"db"`) 시에만 성공. 관리자 "후보 검토"(`topic_candidates.status=new`)에 노출.

---

## B3 — locale 하드코딩 (`/ko`, `lang:"ko"`)

**(1) `app/report/[slug]/ReportForm.tsx`** — 성공 후 링크:
```tsx
- <a href={`/ko/wiki/${slug}`} className="cta-link">
+ {/* 앞에 locale 이 없으면 middleware 가 Accept-Language 로 알맞은 locale 로 308 리다이렉트 */}
+ <a href={`/wiki/${slug}`} className="cta-link">
    문서로 돌아가기
  </a>
```

**(2) `app/community/CommunityClient.tsx`** — 관련 문서 링크:
```tsx
- <Link href={`/ko/wiki/${p.document_slug}`} className="community-related-link">
+ <Link href={`/wiki/${p.document_slug}`} className="community-related-link">
```
(둘 다 `middleware.ts` 가 `/wiki/...` → `/{detected}/wiki/...` 로 처리. 이미 locale 컨텍스트가 있는 페이지라면 그 `locale` 을 직접 써도 됨.)

**(3) suggest-topic `lang:"ko"`** → B2(a) 에서 처리.

**점검:**
```bash
grep -rn "/ko/wiki\|/en/wiki\|lang: *\"ko\"" app/
```
정당한 경우(언어 스위처 등) 외 0 건이어야 함.

**Acceptance:** 어느 locale 에서 와도 내부 이동/복귀가 사용자 언어를 유지.

---

## 적용 순서
1. `SETUP_CHECKLIST.md` — 환경/스키마 (제출·관리자·통계 살아남)
2. B4 — admin 인증 (배포 전 필수, 동봉 파일 교체 + grep 점검)
3. B3 — locale 하드코딩 (2~3곳 한 줄씩)
4. B1·B2 — 거짓 성공 제거

각각 별도 커밋 권장. 끝나면 `../FUNCTIONAL_AUDIT.md` 체크리스트로 페이지별 검증.
