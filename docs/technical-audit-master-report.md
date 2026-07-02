# Technical Audit Master Report

## RLS / 거버넌스

운영 DB에서 RLS 정책이 코드베이스의 보안 의도와 일치하는지 확인할 때는 Supabase SQL Editor 또는 `psql`에서 아래 점검 SQL을 실행한다. `schema-v3.sql`을 기준으로 하며, 실제 운영 DB에서는 마이그레이션 적용 누락이나 수동 정책 변경이 있을 수 있으므로 `pg_policies` 결과를 직접 확인한다.

### 1. `pg_policies` 정책 인벤토리 확인

다음 쿼리는 주요 공개 접근 테이블의 RLS policy를 한 번에 확인한다.

```sql
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'document_stats',
    'community_posts',
    'hallucination_reports',
    'documents',
    'claims',
    'claim_sources',
    'verification_events'
  )
order by tablename, policyname, cmd;
```

기대 기준:

- `document_stats`: `anon` 대상 `INSERT`, `UPDATE`, `DELETE` policy가 없어야 한다. 공개 사용자는 카운터를 읽을 수만 있고, 조회수/인용수 증가는 service-role 경로에서만 수행되어야 한다.
- `community_posts`: public/`anon` insert policy는 `with_check`가 `status = 'pending'` 조건을 포함해야 한다. 운영 정책은 사용자가 직접 `published` 상태로 게시물을 만들 수 없도록 해야 한다.
- `hallucination_reports`: public/`anon` `SELECT` policy가 없어야 한다. 공개 제출은 가능하더라도 신고 내용은 관리자 검토용이며 공개 조회되면 안 된다.
- `documents`: public/`anon` `SELECT` policy의 `qual`이 `status in ('published', 'verified')` 조건에 묶여야 한다.
- `claims`: public/`anon` `SELECT` policy의 `qual`이 부모 `documents` 레코드의 `status in ('published', 'verified')` 조건에 묶여야 한다.
- `claim_sources`: public/`anon` `SELECT` policy의 `qual`이 연결된 `claims` 및 부모 `documents` 레코드의 `status in ('published', 'verified')` 조건에 묶여야 한다.
- `verification_events`: public/`anon` `SELECT` policy의 `qual`이 연결된 `claims` 및 부모 `documents` 레코드의 `status in ('published', 'verified')` 조건에 묶여야 한다.

### 2. 운영 DB RLS 회귀 점검 SQL

아래 쿼리는 정책 인벤토리를 사람이 읽는 것과 별개로, 필수 거버넌스 조건을 PASS/FAIL 형태로 요약한다. FAIL이 하나라도 나오면 운영 DB 정책을 즉시 재검토한다.

```sql
with policy_rows as (
  select
    tablename,
    policyname,
    cmd,
    roles::text as roles_text,
    coalesce(qual, '') as qual,
    coalesce(with_check, '') as with_check
  from pg_policies
  where schemaname = 'public'
), checks as (
  select
    'document_stats has no anon insert/update/delete policy' as check_name,
    not exists (
      select 1
      from policy_rows
      where tablename = 'document_stats'
        and cmd in ('INSERT', 'UPDATE', 'DELETE')
        and roles_text like '%anon%'
    ) as passed
  union all
  select
    'community_posts anon insert only allows pending posts' as check_name,
    exists (
      select 1
      from policy_rows
      where tablename = 'community_posts'
        and cmd = 'INSERT'
        and roles_text like '%anon%'
        and with_check ilike '%status%pending%'
    )
    and not exists (
      select 1
      from policy_rows
      where tablename = 'community_posts'
        and cmd = 'INSERT'
        and roles_text like '%anon%'
        and with_check not ilike '%status%pending%'
    ) as passed
  union all
  select
    'hallucination_reports has no anon select policy' as check_name,
    not exists (
      select 1
      from policy_rows
      where tablename = 'hallucination_reports'
        and cmd = 'SELECT'
        and roles_text like '%anon%'
    ) as passed
  union all
  select
    'documents anon select is scoped to published/verified' as check_name,
    exists (
      select 1
      from policy_rows
      where tablename = 'documents'
        and cmd = 'SELECT'
        and roles_text like '%anon%'
        and qual ilike '%status%published%'
        and qual ilike '%status%verified%'
    ) as passed
  union all
  select
    'claims anon select is scoped by parent published/verified document' as check_name,
    exists (
      select 1
      from policy_rows
      where tablename = 'claims'
        and cmd = 'SELECT'
        and roles_text like '%anon%'
        and qual ilike '%documents%'
        and qual ilike '%document_id%'
        and qual ilike '%status%published%'
        and qual ilike '%status%verified%'
    ) as passed
  union all
  select
    'claim_sources anon select is scoped by parent published/verified document' as check_name,
    exists (
      select 1
      from policy_rows
      where tablename = 'claim_sources'
        and cmd = 'SELECT'
        and roles_text like '%anon%'
        and qual ilike '%claims%'
        and qual ilike '%documents%'
        and qual ilike '%claim_id%'
        and qual ilike '%status%published%'
        and qual ilike '%status%verified%'
    ) as passed
  union all
  select
    'verification_events anon select is scoped by parent published/verified document' as check_name,
    exists (
      select 1
      from policy_rows
      where tablename = 'verification_events'
        and cmd = 'SELECT'
        and roles_text like '%anon%'
        and qual ilike '%claims%'
        and qual ilike '%documents%'
        and qual ilike '%claim_id%'
        and qual ilike '%status%published%'
        and qual ilike '%status%verified%'
    ) as passed
)
select
  check_name,
  case when passed then 'PASS' else 'FAIL' end as result
from checks
order by check_name;
```

### 3. Supabase migration 적용 목록 확인 절차

운영 DB에 어떤 migration이 적용되었는지 먼저 확인한 뒤, RLS 관련 migration이 누락되지 않았는지 비교한다.

1. Supabase Dashboard에서 대상 프로젝트를 연다.
2. **SQL Editor**를 열고 운영 DB를 대상으로 아래 쿼리를 실행한다.
3. 결과의 `version`, `name`, `executed_at`을 로컬 `supabase/migrations/*.sql` 파일명과 대조한다.
4. RLS/거버넌스 관련 migration이 빠져 있으면 배포 절차를 중단하고, 누락 원인과 적용 순서를 먼저 확인한다.

```sql
select
  version,
  name,
  executed_at
from supabase_migrations.schema_migrations
order by version;
```

Supabase 프로젝트/CLI 버전에 따라 컬럼 구성이 다를 수 있으면 다음 쿼리로 실제 migration table 구조를 먼저 확인한다.

```sql
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'supabase_migrations'
  and table_name = 'schema_migrations'
order by ordinal_position;
```
