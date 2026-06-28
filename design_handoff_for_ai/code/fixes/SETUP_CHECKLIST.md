# SETUP_CHECKLIST.md — 기능을 살리는 환경 설정 (사람이 직접)

> 코드는 이미 버튼·폼이 API 에 연결돼 있습니다. **대부분의 "안 먹힘"은 환경변수/DB 미설정**입니다.
> 아래 값은 비밀이라 AI 가 넣을 수 없습니다 — 직접 설정하세요. 로컬은 `.env.local`, 배포는 Vercel → Settings → Environment Variables.

## 1. `.env.local` (`.env.example` 복사 후 채움)

```bash
cp .env.example .env.local
openssl rand -hex 32   # 아래 3개 secret 각각 생성
```

| 변수 | 없으면 |
|---|---|
| `CONTRIBUTOR_SALT` | 모든 공개 제출(커뮤니티·정정·환각·제안) **500 → 버튼 먹통** |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 커뮤니티·통계·동적 문서 빈값 |
| `SUPABASE_SERVICE_ROLE_KEY` | `/admin/*` 데이터 500 |
| `ADMIN_SECRET` | 관리자 인증 불가(+ 수정 전 보안 구멍) |
| `ADMIN_CSRF_SECRET` | 관리자 쓰기 CSRF 가드 |
| `NEXT_PUBLIC_SITE_URL` | 인용/SEO URL 기본 도메인 |

## 2. Supabase 스키마
1. Supabase 프로젝트 생성.
2. SQL Editor 에서 **`schema-v3.sql`** 실행(루트). 필요 시 `schema-v3-monetization.sql`.
3. URL/anon/service-role 키를 위 변수에 입력.
4. 공개 제출이 RLS 에 막히지 않는지 확인(`SUPABASE_DESIGN.md`). insert 정책이 anon/service-role 경로와 일치해야 함.

## 3. 동작 확인
```bash
npm install && npm run dev
```
- [ ] `/suggest-topic` 제출 → 성공 + `topic_suggestions`/`topic_candidates` row
- [ ] `/report/<slug>` 제출 → 성공 + `reports` row (미설정 시 정직하게 실패 — B1 적용 후)
- [ ] `/hallucination/<slug>` → `hallucination_reports` row
- [ ] `/community` 글쓰기 → `posts` row(pending)
- [ ] `/admin/review` 에 `ADMIN_SECRET` 입력 → count 로드 (빈 secret 은 401 — B4 적용 후)

## 4. 배포(Vercel)
- 같은 변수들을 Production/Preview 에 등록 → 재배포.
- `NEXT_PUBLIC_*` 는 빌드시 인라인되므로 변경 후 **재배포 필요**.
