-- Read-only schema fingerprint for migration reproducibility checks.
-- Safe to run on production because it only reads PostgreSQL catalogs.
-- Do not treat identical output as authorization to mutate migration history.

with target_tables(table_name) as (
  values
    ('community_posts'),
    ('document_stats'),
    ('claim_versions'),
    ('source_snapshots'),
    ('claim_evidence'),
    ('risk_assessments'),
    ('verification_policies'),
    ('task5_settings')
),
columns_fingerprint as (
  select
    c.table_name,
    c.ordinal_position,
    c.column_name,
    c.data_type,
    c.udt_name,
    c.is_nullable,
    c.column_default
  from information_schema.columns c
  join target_tables t using (table_name)
  where c.table_schema = 'public'
),
constraints_fingerprint as (
  select
    cls.relname as table_name,
    con.conname as constraint_name,
    con.contype as constraint_type,
    pg_get_constraintdef(con.oid, true) as definition
  from pg_constraint con
  join pg_class cls on cls.oid = con.conrelid
  join pg_namespace ns on ns.oid = cls.relnamespace
  join target_tables t on t.table_name = cls.relname
  where ns.nspname = 'public'
),
indexes_fingerprint as (
  select
    i.tablename as table_name,
    i.indexname,
    i.indexdef
  from pg_indexes i
  join target_tables t on t.table_name = i.tablename
  where i.schemaname = 'public'
),
policies_fingerprint as (
  select
    p.tablename as table_name,
    p.policyname,
    p.permissive,
    p.roles,
    p.cmd,
    p.qual,
    p.with_check
  from pg_policies p
  join target_tables t on t.table_name = p.tablename
  where p.schemaname = 'public'
),
rls_fingerprint as (
  select
    c.relname as table_name,
    c.relrowsecurity as rls_enabled,
    c.relforcerowsecurity as rls_forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join target_tables t on t.table_name = c.relname
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
),
privileges_fingerprint as (
  select
    g.table_name,
    g.grantee,
    g.privilege_type
  from information_schema.role_table_grants g
  join target_tables t using (table_name)
  where g.table_schema = 'public'
    and g.grantee in ('anon', 'authenticated', 'service_role')
)
select jsonb_pretty(
  jsonb_build_object(
    'tables_present', (
      select coalesce(jsonb_agg(t.table_name order by t.table_name), '[]'::jsonb)
      from target_tables t
      where to_regclass(format('public.%I', t.table_name)) is not null
    ),
    'tables_missing', (
      select coalesce(jsonb_agg(t.table_name order by t.table_name), '[]'::jsonb)
      from target_tables t
      where to_regclass(format('public.%I', t.table_name)) is null
    ),
    'columns', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.table_name, x.ordinal_position), '[]'::jsonb)
      from columns_fingerprint x
    ),
    'constraints', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.table_name, x.constraint_name), '[]'::jsonb)
      from constraints_fingerprint x
    ),
    'indexes', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.table_name, x.indexname), '[]'::jsonb)
      from indexes_fingerprint x
    ),
    'rls', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.table_name), '[]'::jsonb)
      from rls_fingerprint x
    ),
    'policies', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.table_name, x.policyname), '[]'::jsonb)
      from policies_fingerprint x
    ),
    'browser_and_service_privileges', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.table_name, x.grantee, x.privilege_type), '[]'::jsonb)
      from privileges_fingerprint x
    )
  )
) as migration_baseline_fingerprint;