-- Bible v7 Task 5-F: public issue reporting, operator-controlled publication
-- state, and a public-safe correction ledger. This migration deliberately has
-- no report -> quarantine trigger: reports only enter a human review queue.

alter type public.submission_status add value if not exists 'spam_suspected';

alter table public.reports
  add column if not exists claim_id text references public.claims(id) on delete set null,
  add column if not exists claim_version_id uuid references public.claim_versions(id) on delete set null,
  add column if not exists reported_document_slug text,
  add column if not exists reported_claim_id text,
  add column if not exists reported_claim_version text,
  add column if not exists issue_category text,
  add column if not exists severity text not null default 'medium',
  add column if not exists reporter_contact text,
  add column if not exists contact_consent boolean not null default false,
  add column if not exists private_contact_expires_at timestamptz,
  add column if not exists review_due_at timestamptz;

alter table public.reports
  add constraint reports_issue_category_check check (
    issue_category is null or issue_category in (
      'incorrect', 'outdated', 'unsupported', 'harmful',
      'privacy', 'legal', 'right_of_reply', 'other'
    )
  ),
  add constraint reports_severity_check check (severity in ('low', 'medium', 'high', 'critical')),
  add constraint reports_reporter_contact_length_check check (
    reporter_contact is null or length(reporter_contact) between 3 and 254
  ),
  add constraint reports_contact_consent_check check (
    reporter_contact is null or contact_consent = true
  ),
  add constraint reports_claim_binding_check check (
    (reported_document_slug is null and reported_claim_id is null and reported_claim_version is null)
    or
    (reported_document_slug is not null and reported_claim_id is not null and reported_claim_version is not null)
  );

create index if not exists reports_claim_id_idx on public.reports (claim_id);
create index if not exists reports_claim_version_id_idx on public.reports (claim_version_id);
create index if not exists reports_reported_claim_idx
  on public.reports (reported_document_slug, reported_claim_id);
create index if not exists reports_review_queue_idx
  on public.reports (severity desc, review_due_at asc, created_at asc)
  where status in ('new', 'reviewing');
create index if not exists reports_private_contact_expiry_idx
  on public.reports (private_contact_expires_at)
  where reporter_contact is not null;

create or replace function public.task5_route_report_severity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.issue_category is not null then
    new.severity := case new.issue_category
      when 'harmful' then 'critical'
      when 'privacy' then 'high'
      when 'legal' then 'high'
      when 'right_of_reply' then 'high'
      when 'incorrect' then 'medium'
      when 'outdated' then 'medium'
      when 'unsupported' then 'medium'
      else 'low'
    end;

    new.review_due_at := case new.severity
      when 'critical' then now() + interval '4 hours'
      when 'high' then now() + interval '24 hours'
      when 'medium' then now() + interval '3 days'
      else now() + interval '7 days'
    end;
  end if;

  if new.reporter_contact is null then
    new.contact_consent := false;
    new.private_contact_expires_at := null;
  else
    new.private_contact_expires_at := coalesce(
      new.private_contact_expires_at,
      now() + interval '90 days'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists reports_task5_severity_route on public.reports;
create trigger reports_task5_severity_route
before insert or update of issue_category, reporter_contact on public.reports
for each row execute function public.task5_route_report_severity();

-- All public report writes now pass through the rate-limited server route.
-- This closes the old direct Data API insert path, which could not enforce
-- body size or bind claim/version identifiers server-side.
drop policy if exists reports_public_insert_only on public.reports;
revoke all on table public.reports from anon, authenticated;
grant select, insert, update, delete on table public.reports to service_role;

-- Evidence attached to a static-registry report cannot satisfy the legacy
-- source_suggestions.claim_id NOT NULL rule because no DB claim row exists.
-- Preserve the existing DB-claim path while allowing a service-mediated
-- suggestion to bind to its private report instead.
alter table public.source_suggestions
  alter column claim_id drop not null,
  add column if not exists report_id uuid references public.reports(id) on delete set null,
  add constraint source_suggestions_claim_or_report_check check (
    claim_id is not null or report_id is not null
  ),
  add constraint source_suggestions_report_id_unique unique (report_id);

create index if not exists source_suggestions_report_id_idx
  on public.source_suggestions (report_id) where report_id is not null;

drop policy if exists source_suggestions_public_insert on public.source_suggestions;
create policy source_suggestions_public_insert
  on public.source_suggestions for insert to anon
  with check (status = 'pending' and claim_id is not null and report_id is null);

create table public.claim_correction_events (
  id uuid primary key default gen_random_uuid(),
  claim_id text not null,
  document_slug text not null,
  claim_version_ref text not null,
  db_claim_id text references public.claims(id) on delete set null,
  claim_version_id uuid references public.claim_versions(id) on delete set null,
  related_report_id uuid references public.reports(id) on delete set null,
  event_type text not null check (event_type in ('quarantined', 'restored', 'withdrawn')),
  previous_publication_state public.claim_publication_state not null,
  new_publication_state public.claim_publication_state not null,
  public_reason text not null check (length(trim(public_reason)) between 3 and 2000),
  idempotency_key text not null check (length(idempotency_key) between 8 and 128),
  created_at timestamptz not null default now(),
  unique (claim_id, idempotency_key)
);

comment on table public.claim_correction_events is
  'Task 5-F correction/publication-state ledger. Reporter contact and operator identity never appear here; public APIs select an explicit safe column list.';
comment on column public.claim_correction_events.public_reason is
  'Public-safe operator explanation. Do not include reporter contact, personal data, secrets, or private legal correspondence.';

create index claim_correction_events_claim_created_idx
  on public.claim_correction_events (claim_id, created_at desc, id desc);
create index claim_correction_events_slug_created_idx
  on public.claim_correction_events (document_slug, created_at desc, id desc);
create index claim_correction_events_report_idx
  on public.claim_correction_events (related_report_id)
  where related_report_id is not null;

alter table public.claim_correction_events enable row level security;
revoke all on table public.claim_correction_events from anon, authenticated;
grant select, insert on table public.claim_correction_events to service_role;

-- Brownfield bridge for the static-first registry. Production currently has
-- legacy public bundles in code while the canonical DB registry is empty.
-- A public report binds a static claim to a server-computed version hash;
-- operator RPCs can then apply the same publication-state overlay without
-- mutating or deleting the static source bundle. Once a claim exists in the
-- DB, claims.publication_state remains the canonical path.
create table public.legacy_claim_publication_overrides (
  claim_id text primary key,
  document_slug text not null,
  claim_version_ref text not null,
  publication_state public.claim_publication_state not null default 'active',
  updated_at timestamptz not null default now()
);

create index legacy_claim_publication_overrides_slug_idx
  on public.legacy_claim_publication_overrides (document_slug);
alter table public.legacy_claim_publication_overrides enable row level security;
revoke all on table public.legacy_claim_publication_overrides from anon, authenticated;
grant select, insert, update on table public.legacy_claim_publication_overrides to service_role;

-- publication_state is now an RPC-only overlay for every claim, including
-- legacy_manual claims. citation status is intentionally left untouched.
create or replace function public.task5_guard_publication_state_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.publication_state is distinct from old.publication_state
     and coalesce(current_setting('task5.allow_publication_state_write', true), 'off') <> 'on' then
    raise exception 'publication_state is RPC-controlled; use quarantine_claim, restore_quarantined_claim, or withdraw_claim';
  end if;
  return new;
end;
$$;

drop trigger if exists claims_guard_publication_state_write on public.claims;
create trigger claims_guard_publication_state_write
before update of publication_state on public.claims
for each row execute function public.task5_guard_publication_state_write();

create or replace function public.task5_apply_claim_publication_action(
  p_claim_id text,
  p_action text,
  p_public_reason text,
  p_admin_user_id uuid,
  p_admin_user_hash text,
  p_idempotency_key text,
  p_report_id uuid default null,
  p_document_slug text default null,
  p_claim_version_ref text default null
)
returns table (
  result_claim_id text,
  result_document_id text,
  previous_state public.claim_publication_state,
  publication_state public.claim_publication_state,
  correction_event_id uuid,
  changed boolean
)
language plpgsql
set search_path = ''
as $$
declare
  v_claim public.claims%rowtype;
  v_document_status public.document_status;
  v_document_slug text;
  v_claim_version_ref text;
  v_is_db_claim boolean := false;
  v_current_state public.claim_publication_state;
  v_role public.admin_role;
  v_admin_hash text;
  v_target_state public.claim_publication_state;
  v_event_type text;
  v_existing_event public.claim_correction_events%rowtype;
  v_event_id uuid;
begin
  if p_action not in ('quarantine', 'restore', 'withdraw') then
    raise exception 'unsupported publication action';
  end if;
  if p_public_reason is null or length(trim(p_public_reason)) < 3 or length(trim(p_public_reason)) > 2000 then
    raise exception 'public reason must be between 3 and 2000 characters';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 8 or length(p_idempotency_key) > 128 then
    raise exception 'idempotency key must be between 8 and 128 characters';
  end if;

  if p_admin_user_id is not null then
    select au.role into v_role
    from public.admin_users au
    where au.user_id = p_admin_user_id and au.active = true;
    if not found then raise exception 'active operator identity required'; end if;
    v_admin_hash := encode(sha256(convert_to('supabase:' || p_admin_user_id::text, 'UTF8')), 'hex');
  else
    -- Break-glass callers are already restricted by the app's production
    -- ALLOW_BREAK_GLASS_ADMIN gate and by service_role-only EXECUTE below.
    if p_admin_user_hash is null or p_admin_user_hash !~ '^[0-9a-fA-F]{64}$' then
      raise exception 'valid break-glass operator hash required';
    end if;
    v_role := 'admin';
    v_admin_hash := lower(p_admin_user_hash);
  end if;

  if p_action in ('quarantine', 'restore') and v_role not in ('moderator', 'admin') then
    raise exception 'moderator role required';
  end if;
  if p_action = 'withdraw' and v_role <> 'admin' then
    raise exception 'admin role required';
  end if;

  select c.* into v_claim
  from public.claims c
  where c.id = p_claim_id
  for update;
  if found then
    v_is_db_claim := true;
    select d.status, d.slug into v_document_status, v_document_slug
    from public.documents d
    where d.id = v_claim.document_id;
    v_current_state := v_claim.publication_state;
    v_claim_version_ref := coalesce(
      v_claim.published_claim_version_id::text,
      v_claim.current_claim_version_id::text
    );
    if v_document_status not in ('published', 'verified') and v_claim.published_at is null then
      raise exception 'only published claims can change publication state';
    end if;
    if p_report_id is not null and not exists (
      select 1 from public.reports r
      where r.id = p_report_id
        and r.reported_document_slug = v_document_slug
        and r.reported_claim_id = p_claim_id
        and r.reported_claim_version = v_claim_version_ref
    ) then
      raise exception 'report is not bound to this claim version';
    end if;
  else
    -- Static legacy claims must arrive through a server-bound report. This
    -- prevents the privileged RPC from inventing arbitrary public claim keys.
    if p_report_id is null or p_document_slug is null or p_claim_version_ref is null then
      raise exception 'a bound report, document slug, and version are required for a static legacy claim';
    end if;
    if not exists (
      select 1 from public.reports r
      where r.id = p_report_id
        and r.reported_document_slug = p_document_slug
        and r.reported_claim_id = p_claim_id
        and r.reported_claim_version = p_claim_version_ref
    ) then
      raise exception 'report is not bound to this static claim version';
    end if;
    v_document_slug := p_document_slug;
    v_claim_version_ref := p_claim_version_ref;
    insert into public.legacy_claim_publication_overrides (
      claim_id, document_slug, claim_version_ref, publication_state
    ) values (
      p_claim_id, v_document_slug, v_claim_version_ref, 'active'
    ) on conflict (claim_id) do nothing;
    select o.publication_state into v_current_state
    from public.legacy_claim_publication_overrides o
    where o.claim_id = p_claim_id
    for update;
  end if;

  select e.* into v_existing_event
  from public.claim_correction_events e
  where e.claim_id = p_claim_id and e.idempotency_key = p_idempotency_key;
  if found then
    if v_existing_event.event_type <> (
      case p_action
        when 'quarantine' then 'quarantined'
        when 'restore' then 'restored'
        else 'withdrawn'
      end
    ) then
      raise exception 'idempotency key was already used for another action';
    end if;
    return query select p_claim_id, case when v_is_db_claim then v_claim.document_id else null::text end,
      v_existing_event.previous_publication_state,
      v_current_state,
      v_existing_event.id,
      false;
    return;
  end if;

  v_target_state := case p_action
    when 'quarantine' then 'quarantined'::public.claim_publication_state
    when 'restore' then 'active'::public.claim_publication_state
    else 'withdrawn'::public.claim_publication_state
  end;
  v_event_type := case p_action when 'quarantine' then 'quarantined' when 'restore' then 'restored' else 'withdrawn' end;

  if p_action = 'quarantine' and v_current_state = 'withdrawn' then
    raise exception 'withdrawn claims cannot be quarantined';
  end if;
  if p_action = 'restore' and v_current_state = 'withdrawn' then
    raise exception 'withdrawn claims cannot be restored';
  end if;
  if v_current_state = v_target_state then
    return query select p_claim_id, case when v_is_db_claim then v_claim.document_id else null::text end,
      v_current_state, v_current_state, null::uuid, false;
    return;
  end if;

  if v_is_db_claim then
    perform set_config('task5.allow_publication_state_write', 'on', true);
    perform set_config('task5.allow_publication_write', 'on', true);
    update public.claims
    set publication_state = v_target_state, updated_at = now()
    where id = v_claim.id;
  else
    update public.legacy_claim_publication_overrides
    set publication_state = v_target_state,
        document_slug = v_document_slug,
        claim_version_ref = v_claim_version_ref,
        updated_at = now()
    where claim_id = p_claim_id;
  end if;

  insert into public.claim_correction_events (
    claim_id, document_slug, claim_version_ref, db_claim_id,
    claim_version_id, related_report_id, event_type,
    previous_publication_state, new_publication_state,
    public_reason, idempotency_key
  ) values (
    p_claim_id,
    v_document_slug,
    v_claim_version_ref,
    case when v_is_db_claim then v_claim.id else null end,
    case when v_is_db_claim then coalesce(v_claim.published_claim_version_id, v_claim.current_claim_version_id) else null end,
    p_report_id,
    v_event_type,
    v_current_state,
    v_target_state,
    trim(p_public_reason),
    p_idempotency_key
  ) returning id into v_event_id;

  if p_report_id is not null then
    update public.reports set status = 'accepted' where id = p_report_id;
  end if;

  insert into public.admin_audit_events (
    admin_user_id, admin_user_hash, action, target_id, metadata
  ) values (
    p_admin_user_id,
    v_admin_hash,
    'task5.claim_' || v_event_type,
    p_claim_id,
    jsonb_build_object(
      'document_id', case when v_is_db_claim then v_claim.document_id else null end,
      'document_slug', v_document_slug,
      'claim_version_ref', v_claim_version_ref,
      'previous_publication_state', v_current_state,
      'new_publication_state', v_target_state,
      'correction_event_id', v_event_id,
      'related_report_id', p_report_id,
      'operator_role', v_role,
      'identity_mode', case when p_admin_user_id is null then 'break_glass' else 'supabase' end
    )
  );

  return query select p_claim_id, case when v_is_db_claim then v_claim.document_id else null::text end, v_current_state,
    v_target_state, v_event_id, true;
end;
$$;

create or replace function public.quarantine_claim(
  p_claim_id text,
  p_public_reason text,
  p_admin_user_id uuid,
  p_admin_user_hash text,
  p_idempotency_key text,
  p_report_id uuid default null,
  p_document_slug text default null,
  p_claim_version_ref text default null
)
returns table (
  result_claim_id text,
  result_document_id text,
  previous_state public.claim_publication_state,
  publication_state public.claim_publication_state,
  correction_event_id uuid,
  changed boolean
)
language sql
security definer
set search_path = ''
as $$
  select * from public.task5_apply_claim_publication_action(
    p_claim_id, 'quarantine', p_public_reason, p_admin_user_id,
    p_admin_user_hash, p_idempotency_key, p_report_id,
    p_document_slug, p_claim_version_ref
  );
$$;

create or replace function public.restore_quarantined_claim(
  p_claim_id text,
  p_public_reason text,
  p_admin_user_id uuid,
  p_admin_user_hash text,
  p_idempotency_key text,
  p_report_id uuid default null,
  p_document_slug text default null,
  p_claim_version_ref text default null
)
returns table (
  result_claim_id text,
  result_document_id text,
  previous_state public.claim_publication_state,
  publication_state public.claim_publication_state,
  correction_event_id uuid,
  changed boolean
)
language sql
security definer
set search_path = ''
as $$
  select * from public.task5_apply_claim_publication_action(
    p_claim_id, 'restore', p_public_reason, p_admin_user_id,
    p_admin_user_hash, p_idempotency_key, p_report_id,
    p_document_slug, p_claim_version_ref
  );
$$;

create or replace function public.withdraw_claim(
  p_claim_id text,
  p_public_reason text,
  p_admin_user_id uuid,
  p_admin_user_hash text,
  p_idempotency_key text,
  p_report_id uuid default null,
  p_document_slug text default null,
  p_claim_version_ref text default null
)
returns table (
  result_claim_id text,
  result_document_id text,
  previous_state public.claim_publication_state,
  publication_state public.claim_publication_state,
  correction_event_id uuid,
  changed boolean
)
language sql
security definer
set search_path = ''
as $$
  select * from public.task5_apply_claim_publication_action(
    p_claim_id, 'withdraw', p_public_reason, p_admin_user_id,
    p_admin_user_hash, p_idempotency_key, p_report_id,
    p_document_slug, p_claim_version_ref
  );
$$;

create or replace function public.cleanup_expired_report_contacts()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  update public.reports
  set reporter_contact = null,
      contact_consent = false,
      private_contact_expires_at = null
  where reporter_contact is not null
    and private_contact_expires_at <= now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.task5_route_report_severity() from public, anon, authenticated, service_role;
revoke all on function public.task5_guard_publication_state_write() from public, anon, authenticated, service_role;
revoke all on function public.task5_apply_claim_publication_action(text,text,text,uuid,text,text,uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function public.quarantine_claim(text,text,uuid,text,text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.restore_quarantined_claim(text,text,uuid,text,text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.withdraw_claim(text,text,uuid,text,text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.cleanup_expired_report_contacts() from public, anon, authenticated;

grant execute on function public.quarantine_claim(text,text,uuid,text,text,uuid,text,text) to service_role;
grant execute on function public.restore_quarantined_claim(text,text,uuid,text,text,uuid,text,text) to service_role;
grant execute on function public.withdraw_claim(text,text,uuid,text,text,uuid,text,text) to service_role;
grant execute on function public.cleanup_expired_report_contacts() to service_role;

comment on function public.quarantine_claim(text,text,uuid,text,text,uuid,text,text) is
  'Task 5-F operator-only RPC. Quarantines a published claim without changing its citation_status classification.';
comment on function public.restore_quarantined_claim(text,text,uuid,text,text,uuid,text,text) is
  'Task 5-F operator-only RPC. Restores a quarantined published claim and records a public-safe correction event.';
comment on function public.withdraw_claim(text,text,uuid,text,text,uuid,text,text) is
  'Task 5-F admin-only RPC. Withdraws a published claim without deleting its public correction history.';
comment on function public.cleanup_expired_report_contacts() is
  'Task 5-F service-only retention job. Removes private reporter contact data after its retention deadline.';
