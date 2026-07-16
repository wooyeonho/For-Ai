-- Task 5-0: structural foundation (Bible v7 Book IV section 13, Book V).
-- Expand-only. No existing table/column is altered destructively; no existing
-- claim ID/slug/URL/citation_status is changed. All new writers are additive
-- and scoped to task5_ai origin claims only; the legacy admin flow
-- (app/api/admin/verify-claim/route.ts) is untouched and continues to own
-- legacy_manual claims exactly as before.

-- =============================================================================
-- 1. New enums
-- =============================================================================

create type content_origin_type as enum ('legacy_manual', 'task5_ai');
create type publication_mode_type as enum ('manual_legacy', 'assisted_operator', 'crowd_auto');
create type claim_publication_state as enum ('active', 'quarantined', 'withdrawn');
create type risk_result_type as enum ('unknown', 'normal', 'high');
create type claim_evidence_relation as enum ('supports', 'qualifies', 'contradicts');
create type verification_policy_mode as enum ('assisted_operator', 'crowd');

-- =============================================================================
-- 2. claim_versions — immutable per-claim text history
-- =============================================================================

create table claim_versions (
  id uuid primary key default gen_random_uuid(),
  claim_id text not null references claims(id) on delete cascade,
  version integer not null check (version > 0),
  text text not null,
  text_hash text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (claim_id, version)
);

comment on table claim_versions is 'Immutable per-claim text history. No risk_class column by design (risk lives in risk_assessments). No unique(claim_id,text_hash) by design — reverting to a past version''s exact text is allowed; only a no-op re-insert of the immediately preceding hash is rejected (enforced by trigger, not a unique index).';

create index claim_versions_claim_id_idx on claim_versions (claim_id, version desc);

-- Reject only a no-op insert (same text_hash as the immediately preceding
-- version for this claim). Reverting to an EARLIER, non-immediately-preceding
-- version's hash remains allowed, per contract.
create or replace function task5_reject_noop_claim_version() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  previous_hash text;
begin
  select cv.text_hash into previous_hash
  from public.claim_versions cv
  where cv.claim_id = NEW.claim_id
  order by cv.version desc
  limit 1;

  if previous_hash is not null and previous_hash = NEW.text_hash then
    raise exception 'claim_versions: no-op insert rejected (identical text_hash as the immediately preceding version for claim %)', NEW.claim_id;
  end if;

  return NEW;
end;
$$;

create trigger claim_versions_reject_noop
before insert on claim_versions
for each row execute function task5_reject_noop_claim_version();

-- True immutability: reject UPDATE/DELETE unconditionally, including for
-- service_role, as defense-in-depth beyond GRANT (service_role is not
-- necessarily the table owner and PostgreSQL triggers fire regardless of
-- role for non-owner-bypassing operations).
create or replace function task5_reject_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only/immutable; % is not permitted', TG_TABLE_NAME, TG_OP;
end;
$$;

create trigger claim_versions_immutable_update
before update on claim_versions
for each row execute function task5_reject_mutation();

create trigger claim_versions_immutable_delete
before delete on claim_versions
for each row execute function task5_reject_mutation();

-- =============================================================================
-- 3. risk_assessments — append-only, latest by (created_at desc, id desc)
-- =============================================================================

create table risk_assessments (
  id uuid primary key default gen_random_uuid(),
  claim_version_id uuid not null references claim_versions(id) on delete cascade,
  deterministic_result risk_result_type not null,
  model_result risk_result_type not null,
  final_result risk_result_type not null,
  deterministic_policy_version text not null,
  model_id text,
  prompt_version text,
  failure_reason text,
  created_at timestamptz not null default now()
);

comment on table risk_assessments is 'Append-only. Latest assessment for a claim_version_id is ORDER BY created_at DESC, id DESC LIMIT 1. final_result combination: either side high => high; either side unknown/error => unknown; both normal => normal.';

create index risk_assessments_claim_version_latest_idx on risk_assessments (claim_version_id, created_at desc, id desc);

create trigger risk_assessments_immutable_update
before update on risk_assessments
for each row execute function task5_reject_mutation();

create trigger risk_assessments_immutable_delete
before delete on risk_assessments
for each row execute function task5_reject_mutation();

-- =============================================================================
-- 4. source_snapshots — immutable external-fetch record (Task 5-B1 writer)
-- =============================================================================

create table source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id text,
  canonical_url text not null,
  final_url text not null,
  retrieved_at timestamptz not null,
  http_status integer not null,
  content_type text not null,
  content_hash text not null,
  normalized_text_hash text not null,
  normalized_text text,
  storage_path text,
  etag text,
  last_modified text,
  created_at timestamptz not null default now(),
  check (
    (normalized_text is not null and storage_path is null)
    or (normalized_text is null and storage_path is not null)
  )
);

comment on table source_snapshots is 'Immutable. Written only by Task 5-B1''s safeFetchExternalSource pipeline (not yet implemented in this PR). Full normalized_text is server-only; no public API returns it in full.';
comment on column source_snapshots.source_id is 'Free-text reference to an existing claim_sources.id (text) when applicable. Nullable: Task 5-B1 may discover sources not yet represented as a claim_sources row.';

create index source_snapshots_canonical_url_idx on source_snapshots (canonical_url);

create trigger source_snapshots_immutable_update
before update on source_snapshots
for each row execute function task5_reject_mutation();

create trigger source_snapshots_immutable_delete
before delete on source_snapshots
for each row execute function task5_reject_mutation();

-- =============================================================================
-- 5. claim_evidence — quote-level binding between a claim_version and a source_snapshot
-- =============================================================================

create table claim_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_version_id uuid not null references claim_versions(id) on delete cascade,
  source_snapshot_id uuid not null references source_snapshots(id) on delete restrict,
  quote_start integer not null check (quote_start >= 0),
  quote_end integer not null check (quote_end > quote_start),
  quote_hash text not null,
  context_hash text,
  relation claim_evidence_relation not null,
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (claim_version_id, source_snapshot_id, quote_start, quote_end)
);

comment on table claim_evidence is 'The server re-finds the quote in source_snapshots.normalized_text and verifies uniqueness/offset/hash before insert (app-layer responsibility, Task 5-B1/5-B2) — not re-validated by this table alone.';

create index claim_evidence_claim_version_idx on claim_evidence (claim_version_id);
create index claim_evidence_source_snapshot_idx on claim_evidence (source_snapshot_id);

-- =============================================================================
-- 6. verification_policies — append-only versioned policy
-- =============================================================================

create table verification_policies (
  version integer primary key,
  mode verification_policy_mode not null,
  rules jsonb not null,
  effective_from timestamptz not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

comment on table verification_policies is 'Append-only. Phase 1 uses assisted_operator mode only; crowd mode is reserved for a later phase and must not be referenced by any Phase 0-1 code path.';

create trigger verification_policies_immutable_update
before update on verification_policies
for each row execute function task5_reject_mutation();

create trigger verification_policies_immutable_delete
before delete on verification_policies
for each row execute function task5_reject_mutation();

-- Seed policy version 1 so Task 5-P1 (a later PR) has a real, deterministic
-- assisted-operator policy to reference from day one — additive, does not
-- activate publication (task5_settings.phase stays 0 until an admin raises it).
insert into verification_policies (version, mode, rules, effective_from, created_by)
values (
  1,
  'assisted_operator',
  '{"requires_normal_risk": true, "requires_current_deterministic_policy": true, "auto_publish": false}'::jsonb,
  now(),
  null
)
on conflict (version) do nothing;

-- =============================================================================
-- 7. task5_settings — single-row DB SSOT for the Task 5 phase
-- =============================================================================

create table task5_settings (
  id boolean primary key default true check (id),
  phase integer not null default 0 check (phase between 0 and 4),
  draft_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table task5_settings is 'Single-row DB SSOT for the Task 5 automation phase. Row absence is handled fail-closed by application code (phase 0, draft disabled, publication denied) — this is not itself an invariant the DB can enforce, since the row missing IS the failure state being guarded against.';

insert into task5_settings (id, phase, draft_enabled, updated_by)
values (true, 0, false, null)
on conflict (id) do nothing;

create or replace function set_task5_phase(p_phase integer, p_reason text, p_admin_user_id uuid default null, p_admin_user_hash text default null)
returns task5_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.task5_settings;
  result_row public.task5_settings;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'set_task5_phase: reason is required';
  end if;
  if p_phase < 0 or p_phase > 4 then
    raise exception 'set_task5_phase: phase must be between 0 and 4';
  end if;

  select * into current_row from public.task5_settings where id = true for update;
  if not found then
    raise exception 'set_task5_phase: task5_settings row is missing; cannot transition phase';
  end if;

  if p_phase > current_row.phase + 1 then
    raise exception 'set_task5_phase: phase may only increase by at most 1 per call (current %, requested %)', current_row.phase, p_phase;
  end if;
  -- Downgrades (p_phase < current_row.phase) are allowed immediately.
  -- Same-phase calls (p_phase = current_row.phase) are idempotent.

  update public.task5_settings
  set phase = p_phase,
      updated_at = now(),
      updated_by = p_admin_user_id
  where id = true
  returning * into result_row;

  -- admin_audit_events on this project currently only has (id, action, metadata,
  -- created_at) -- the admin_user_id/admin_user_hash/target_id columns that
  -- schema-v3.sql documents and migration 20260629_admin_roles_and_audit.sql
  -- would add have never actually been applied to this database (a pre-existing,
  -- much wider migration-drift gap discovered while writing this function --
  -- flagged separately, not fixed here). Insert only into columns confirmed to
  -- exist; carry the admin identity fields inside metadata instead so no
  -- information is lost, and this function keeps working once the drift is
  -- eventually corrected (a future catch-up migration can backfill these out of
  -- metadata into the real columns).
  insert into public.admin_audit_events (action, metadata)
  values (
    'task5.phase_changed',
    jsonb_build_object(
      'target_id', 'task5_settings',
      'admin_user_id', p_admin_user_id,
      'admin_user_hash', coalesce(p_admin_user_hash, 'unknown-admin'),
      'previous_phase', current_row.phase,
      'new_phase', p_phase,
      'reason', p_reason
    )
  );

  return result_row;
end;
$$;

comment on function set_task5_phase is 'Sole writer of task5_settings.phase. Service-role only (called from an admin-gated Next.js API route, matching the app''s ADMIN_SECRET-based admin auth model, not Supabase Auth JWT roles). Enforces +1-max upgrade, unrestricted downgrade, idempotent same-phase, mandatory reason, and audits into admin_audit_events in the same transaction.';

revoke all on task5_settings from anon, authenticated;
grant select on task5_settings to anon, authenticated;
revoke all on function set_task5_phase(integer, text, uuid, text) from public;
grant execute on function set_task5_phase(integer, text, uuid, text) to service_role;

-- =============================================================================
-- 8. Additive columns on claims — publication boundary fields
-- =============================================================================

alter table claims
  add column content_origin content_origin_type not null default 'legacy_manual',
  add column current_claim_version_id uuid references claim_versions(id),
  add column published_claim_version_id uuid references claim_versions(id),
  add column publication_mode publication_mode_type not null default 'manual_legacy',
  add column publication_state claim_publication_state not null default 'active',
  add column published_at timestamptz,
  add column freshness_profile text,
  add column valid_from timestamptz,
  add column valid_until timestamptz;

comment on column claims.content_origin is 'legacy_manual for all pre-Task-5 claims (backfilled below) and any claim created through the existing admin flow going forward; task5_ai only for claims created through the new Task 5-B2 pipeline.';
comment on column claims.publication_state is 'Task 5-F overlay (active/quarantined/withdrawn). Independent of claims.status (citation_status classification) — quarantining a claim does NOT reclassify its citation_status; it only affects public surface presentation, enforced by Task 5-F RPCs (a later PR).';

create index claims_content_origin_idx on claims (content_origin);
create index claims_publication_state_idx on claims (publication_state);

-- =============================================================================
-- 9. Backfill — additive only, no existing ID/slug/URL/citation_status changes
-- =============================================================================

-- Every existing claim becomes version 1 of its own text, with
-- content_origin='legacy_manual' and publication_mode='manual_legacy'.
-- current_claim_version_id AND published_claim_version_id both point at this
-- version 1 row, unconditionally: version 1's text is by construction
-- identical to the claim's existing claim_text, so "the published text" and
-- "the current text" are the same string for every legacy claim. Public
-- visibility remains governed entirely by documents.status (RLS) and
-- citation_status (lib/citation-status.ts) exactly as before — this pointer
-- does not grant, imply, or change any claim's citation status. published_at
-- is left NULL for the backfill: we do not know the real historical
-- publish time for legacy claims and will not fabricate one.
do $$
declare
  claim_row record;
  new_version_id uuid;
begin
  for claim_row in select id, claim_text from claims where current_claim_version_id is null loop
    insert into claim_versions (claim_id, version, text, text_hash, created_by)
    values (claim_row.id, 1, claim_row.claim_text, encode(digest(claim_row.claim_text, 'sha256'), 'hex'), null)
    returning id into new_version_id;

    update claims
    set current_claim_version_id = new_version_id,
        published_claim_version_id = new_version_id
    where id = claim_row.id;
  end loop;
end;
$$;

-- =============================================================================
-- 10. Enforce — task5_ai publication/text-edit boundary (defense-in-depth trigger)
-- =============================================================================

-- Blocks direct writes to status/publication_state/claim_text/claim_value for
-- task5_ai-origin claims unless the session has explicitly opted in via
-- set_config('task5.allow_publication_write','on', true) — a flag ONLY a
-- future SECURITY DEFINER publication RPC (Task 5-P1, a later PR) will ever
-- set. No such RPC exists yet in this PR, so today this trigger unconditionally
-- rejects any direct UPDATE of these columns on a task5_ai claim. Because no
-- task5_ai claims exist yet (content_origin defaults to legacy_manual and the
-- backfill only ever writes legacy_manual), this has zero effect on the
-- existing admin flow today; it is tested with a synthetic task5_ai row in a
-- rolled-back transaction.
create or replace function task5_guard_ai_claim_write() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if OLD.content_origin = 'task5_ai' and (
    NEW.status is distinct from OLD.status
    or NEW.publication_state is distinct from OLD.publication_state
    or NEW.claim_text is distinct from OLD.claim_text
    or NEW.claim_value is distinct from OLD.claim_value
  ) then
    if coalesce(current_setting('task5.allow_publication_write', true), 'off') <> 'on' then
      raise exception 'task5_ai claims cannot be directly updated (status/publication_state/claim_text/claim_value); use the assisted publication RPC';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger claims_guard_task5_ai_write
before update on claims
for each row execute function task5_guard_ai_claim_write();

-- =============================================================================
-- 11. Minimal GRANT for new tables (public-read where the app needs it; no
--     public write anywhere — all Task 5 writers are service-role RPCs/routes
--     added in later PRs)
-- =============================================================================

revoke all on claim_versions, risk_assessments, source_snapshots, claim_evidence, verification_policies from anon, authenticated;
grant select on claim_versions to anon, authenticated;
grant select on risk_assessments to anon, authenticated;
grant select on claim_evidence to anon, authenticated;
grant select on verification_policies to anon, authenticated;
-- source_snapshots is intentionally NOT granted to anon/authenticated: full
-- normalized_text must stay server-only per Book V section 4.3. A future PR
-- can add a narrow view exposing only non-text columns if a public need arises.

alter table claim_versions enable row level security;
alter table risk_assessments enable row level security;
alter table source_snapshots enable row level security;
alter table claim_evidence enable row level security;
alter table verification_policies enable row level security;
alter table task5_settings enable row level security;

create policy claim_versions_public_select on claim_versions for select to anon
  using (exists (
    select 1 from claims c join documents d on d.id = c.document_id
    where (c.current_claim_version_id = claim_versions.id or c.published_claim_version_id = claim_versions.id)
      and d.status in ('published', 'verified')
  ));

create policy risk_assessments_public_select on risk_assessments for select to anon
  using (exists (
    select 1 from claims c
    join documents d on d.id = c.document_id
    where c.published_claim_version_id = risk_assessments.claim_version_id
      and d.status in ('published', 'verified')
  ));

create policy claim_evidence_public_select on claim_evidence for select to anon
  using (exists (
    select 1 from claims c
    join documents d on d.id = c.document_id
    where c.published_claim_version_id = claim_evidence.claim_version_id
      and d.status in ('published', 'verified')
  ));

create policy verification_policies_public_select on verification_policies for select to anon using (true);

create policy task5_settings_public_select on task5_settings for select to anon using (true);
