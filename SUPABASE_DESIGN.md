# GYEOL v0.2.0 — Supabase Persistence 설계 문서

**작성일:** 2026-06-21  
**대상 버전:** v0.2.0  
**선행 버전:** v0.1.0-mvp (static-first, no DB persistence)

---

## 1. 개요

v0.1.0-mvp는 완전한 정적 렌더링으로 동작한다. 모든 데이터는 `lib/seed-data.ts`에 하드코딩되어 있고, report/hallucination 제출은 stub 함수로 처리된다.

v0.2.0에서는 **사용자 제출(report, hallucination_report, correction)을 Supabase DB에 실제로 저장**한다. 읽기 경로(위키 페이지)는 여전히 정적 우선을 유지한다.

---

## 2. 테이블 매핑 (schema-v3.sql → Supabase)

schema-v3.sql이 Source of Truth이며, Supabase에 그대로 적용한다.

### 2.1 핵심 계층 구조

```
entities
  └── documents         (entity_id FK)
        └── claims      (document_id, entity_id FK)
              ├── claim_sources     (claim_id FK, cascade delete)
              └── verification_events (claim_id FK, cascade delete)
```

### 2.2 제출 테이블 (v0.2.0에서 실제 insert 대상)

| 테이블 | 목적 | v0.2.0 write |
|--------|------|-------------|
| `corrections` | 팩트 정정 제출 | ✅ |
| `reports` | 일반 신고 | ✅ |
| `hallucination_reports` | AI 할루시네이션 신고 | ✅ |
| `entities` | 새 장소 등록 | ❌ (admin only) |
| `documents` | 문서 등록 | ❌ (admin only) |
| `claims` | 클레임 등록 | ❌ (admin only) |
| `claim_sources` | 출처 등록 | ❌ (admin only) |
| `verification_events` | 검증 이력 | ❌ (admin only) |
| `listings` | 목록 인덱스 | ❌ (admin only) |

### 2.3 각 제출 테이블 컬럼 요약

**corrections**
```
id              uuid PK default gen_random_uuid()
document_id     text → documents(id) ON DELETE SET NULL
entity_id       text → entities(id) ON DELETE SET NULL
field_path      text
proposed_value  text
reason          text
contributor_hash text  -- sha256(IP + SALT).slice(0,16)
status          submission_status DEFAULT 'new'
created_at      timestamptz DEFAULT now()
```

**reports**
```
id              uuid PK
document_id     text → documents(id)
entity_id       text → entities(id)
report_type     text DEFAULT 'correction'
message         text NOT NULL
contributor_hash text
status          submission_status DEFAULT 'new'
created_at      timestamptz
```

**hallucination_reports**
```
id                  uuid PK
document_id         text → documents(id)
entity_id           text → entities(id)
ai_service          text NOT NULL
prompt              text
ai_answer           text
expected_correction text
contributor_hash    text
status              submission_status DEFAULT 'new'
created_at          timestamptz
```

---

## 3. contributor_hash 처리

### 규칙 (AGENTS.md 필수 준수)
- **절대 raw IP를 저장하지 않는다**
- `contributor_hash = sha256(IP + CONTRIBUTOR_SALT).slice(0, 16)`
- SALT는 환경 변수 `CONTRIBUTOR_SALT`로 관리 (Vercel secret)

### 구현 위치
`lib/contributor-hash.ts` (신규 파일, v0.2.0에서 생성):

```typescript
import { createHash } from 'crypto';

export function makeContributorHash(ip: string, salt: string): string {
  return createHash('sha256')
    .update(ip + salt)
    .digest('hex')
    .slice(0, 16);
}
```

### Next.js Route Handler에서 사용

```typescript
const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
const contributorHash = makeContributorHash(ip, process.env.CONTRIBUTOR_SALT ?? '');
```

---

## 4. Migration 계획

### 4.1 Supabase 프로젝트 설정

1. Supabase dashboard에서 프로젝트 생성 (또는 기존 사용)
2. SQL Editor에서 `schema-v3.sql` 전체 실행
3. 환경 변수 설정:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-side write용, client 노출 금지)
   - `CONTRIBUTOR_SALT` (random 32자 이상)

### 4.2 시드 데이터 migration

`scripts/seed-supabase.sql` (신규 작성 예정):

```sql
INSERT INTO entities (id, type, canonical_name, country, city) VALUES
  ('kr-weddinghall-laluce-001', 'wedding_hall', '라루체 명동', 'KR', '서울');

INSERT INTO documents (id, entity_id, slug, lang, title, category, template, status, confidence) VALUES
  ('doc-laluce-parking-ko', 'kr-weddinghall-laluce-001',
   'myungdong-laluce-parking', 'ko',
   '라루체 명동 주차 정보', 'parking', 'parking-v1', 'ai_draft', 'low');
-- claims, claim_sources 이어서...
```

---

## 5. Row Level Security (RLS) 정책

### 제출 테이블 (corrections, reports, hallucination_reports)

```sql
ALTER TABLE corrections ENABLE ROW LEVEL SECURITY;

-- 공개 insert 허용 (로그인 불필요)
CREATE POLICY "public_insert_corrections"
  ON corrections FOR INSERT TO anon WITH CHECK (true);

-- 공개 select 금지 (policy 없음 = anon select 불가)
-- service_role은 RLS 우회하므로 별도 정책 불필요
```

### 핵심 데이터 테이블 (entities, documents, claims)

```sql
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_entities"
  ON entities FOR SELECT TO anon USING (true);
-- write는 policy 없음 = anon write 불가
```

---

## 6. Supabase 클라이언트

`lib/supabase-server.ts` (server-side only):

```typescript
import { createClient } from '@supabase/supabase-js';

export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
```

패키지: `npm install @supabase/supabase-js`

---

## 7. 읽기 경로 (Static-first 유지)

| 경로 | 데이터 소스 |
|------|------------|
| `/ko/wiki/[slug]` | lib/seed-data.ts (정적 빌드) |
| `/api/documents/[slug]` | lib/seed-data.ts (정적) |
| `/api/report/[slug]` POST | **Supabase insert (v0.2.0 신규)** |
| `/api/hallucination/[slug]` POST | **Supabase insert (v0.2.0 신규)** |

DB 연결 없이도 위키 페이지는 정상 동작. Supabase 장애 시 제출 API만 503.

---

## 8. v0.2.0 구현 체크리스트

- [ ] `lib/contributor-hash.ts` 작성
- [ ] `lib/supabase-server.ts` 작성
- [ ] `@supabase/supabase-js` 패키지 추가
- [ ] `app/api/report/[slug]/route.ts` → Supabase insert 전환
- [ ] `app/api/hallucination/[slug]/route.ts` → Supabase insert 전환
- [ ] Supabase에 `schema-v3.sql` 실행 + RLS 적용
- [ ] `scripts/seed-supabase.sql` 작성 및 실행
- [ ] Vercel 환경 변수 설정 (CONTRIBUTOR_SALT 포함)
- [ ] smoke test로 제출 → DB 기록 확인
- [ ] 두 번째 베뉴 entity/document/claims 추가

---

## 9. 보안 주의사항

1. `SUPABASE_SERVICE_ROLE_KEY`는 server-side Route Handler에서만 사용
2. `NEXT_PUBLIC_*` 변수만 클라이언트에 노출됨 — anon key만 여기에 둠
3. anon key로는 제출 insert만 가능, select/update/delete 불가 (RLS 강제)
4. raw IP는 로그에도 남기지 않는다

---

*이 문서는 v0.2.0 개발 시작 전 설계 기준이며, 구현 중 변경될 수 있습니다.*
