-- Task 5-E defense in depth for immutable inspection history and private queues.
-- Runs immediately after 20260717153000_task5_e_freshness.sql.

create trigger evidence_freshness_checks_immutable_update
before update on public.evidence_freshness_checks
for each row execute function public.task5_reject_mutation();

create trigger evidence_freshness_checks_immutable_delete
before delete on public.evidence_freshness_checks
for each row execute function public.task5_reject_mutation();

revoke all on table public.evidence_freshness_state
  from public, anon, authenticated;
revoke all on table public.evidence_freshness_checks
  from public, anon, authenticated;
revoke all on table public.freshness_review_cards
  from public, anon, authenticated;

-- Supabase projects may carry explicit default EXECUTE grants for anon and
-- authenticated in addition to PostgreSQL PUBLIC. Revoke every browser role
-- explicitly; revoking PUBLIC alone is not sufficient in that configuration.
revoke all on function public.task5_seed_evidence_freshness_state()
  from public, anon, authenticated;
revoke all on function public.lease_evidence_freshness(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.complete_evidence_freshness(
  text, uuid, public.evidence_freshness_result, text, text, integer, text, jsonb
) from public, anon, authenticated;

grant execute on function public.lease_evidence_freshness(text, integer, integer)
  to service_role;
grant execute on function public.complete_evidence_freshness(
  text, uuid, public.evidence_freshness_result, text, text, integer, text, jsonb
) to service_role;

comment on table public.evidence_freshness_checks is
  'Append-only Task 5-E inspection history. UPDATE and DELETE are rejected by trigger; freshness results never automatically change claim verification or publication state.';
comment on table public.freshness_review_cards is
  'Private operator recheck queue. A card is an investigation input only and never automatically downgrades a claim.';

-- A claim can be withdrawn, quarantined, or republished at a new claim version
-- after a worker leases its evidence but before the network fetch completes.
-- Preserve the append-only inspection history, but re-check publication
-- eligibility at completion time so stale/superseded evidence cannot create or
-- refresh an operator review card for a claim version that is no longer active.
create or replace function public.complete_evidence_freshness(
  p_worker_id text,
  p_claim_evidence_id uuid,
  p_result public.evidence_freshness_result,
  p_final_url text default null,
  p_current_normalized_text_hash text default null,
  p_http_status integer default null,
  p_error_code text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  state public.evidence_freshness_state;
  evidence public.claim_evidence;
  version public.claim_versions;
  claim public.claims;
  snapshot public.source_snapshots;
  temporary boolean;
  successful_fetch boolean;
  eligible_for_review boolean;
  next_failures integer;
  should_open_card boolean;
  healthy_alternatives integer;
  next_due timestamptz;
begin
  select * into state from public.evidence_freshness_state
  where claim_evidence_id = p_claim_evidence_id for update;
  if not found then raise exception 'complete_evidence_freshness: state not found'; end if;
  if state.worker_id <> trim(coalesce(p_worker_id, '')) or state.lock_expires_at <= now() then
    raise exception 'complete_evidence_freshness: active worker lease required';
  end if;

  select * into evidence from public.claim_evidence where id = p_claim_evidence_id;
  select * into version from public.claim_versions where id = evidence.claim_version_id;
  select * into claim from public.claims where id = version.claim_id;
  select * into snapshot from public.source_snapshots where id = evidence.source_snapshot_id;

  temporary := p_result in ('temporarily_unavailable', 'blocked', 'fetch_error');
  successful_fetch := p_result in ('healthy', 'redirected', 'content_changed', 'evidence_missing');
  eligible_for_review := claim.publication_state = 'active'
    and claim.published_claim_version_id = evidence.claim_version_id;
  next_failures := case when temporary then state.consecutive_temporary_failures + 1 else 0 end;
  should_open_card := eligible_for_review and (
    p_result in ('content_changed', 'evidence_missing', 'not_found')
    or (temporary and next_failures >= 3)
  );

  next_due := case
    when temporary then now() + make_interval(hours => case
      when next_failures <= 1 then 6
      when next_failures = 2 then 12
      when next_failures = 3 then 24
      when next_failures = 4 then 48
      when next_failures = 5 then 96
      else 168
    end)
    when p_result = 'healthy' then now() + interval '30 days'
    when p_result = 'redirected' then now() + interval '14 days'
    else now() + interval '7 days'
  end;

  insert into public.evidence_freshness_checks (
    claim_evidence_id, result, attempted_at, checked_at, canonical_url, final_url,
    previous_normalized_text_hash, current_normalized_text_hash, http_status, error_code, metadata
  ) values (
    evidence.id, p_result, now(), case when successful_fetch then now() else null end,
    snapshot.canonical_url, p_final_url, snapshot.normalized_text_hash,
    p_current_normalized_text_hash, p_http_status, p_error_code, coalesce(p_metadata, '{}'::jsonb)
  );

  update public.evidence_freshness_state
  set latest_result = p_result,
      last_attempt_at = now(),
      last_checked_at = case when successful_fetch then now() else last_checked_at end,
      consecutive_temporary_failures = next_failures,
      next_check_at = next_due,
      worker_id = null,
      locked_at = null,
      lock_expires_at = null,
      updated_at = now()
  where claim_evidence_id = evidence.id;

  if should_open_card then
    select count(*)::integer into healthy_alternatives
    from public.claim_evidence other_evidence
    join public.evidence_freshness_state other_state on other_state.claim_evidence_id = other_evidence.id
    where other_evidence.claim_version_id = evidence.claim_version_id
      and other_evidence.id <> evidence.id
      and other_state.latest_result in ('healthy', 'redirected');

    insert into public.freshness_review_cards (
      claim_evidence_id, claim_id, trigger_result, priority, valid_until,
      other_healthy_evidence_count, first_opened_at, last_triggered_at, updated_at
    ) values (
      evidence.id, version.claim_id, p_result,
      case when claim.valid_until is not null and claim.valid_until <= now() then 900 else 500 end,
      claim.valid_until, healthy_alternatives, now(), now(), now()
    )
    on conflict (claim_evidence_id) where status = 'open'
    do update set
      trigger_result = excluded.trigger_result,
      priority = greatest(public.freshness_review_cards.priority, excluded.priority),
      valid_until = excluded.valid_until,
      other_healthy_evidence_count = excluded.other_healthy_evidence_count,
      last_triggered_at = now(),
      updated_at = now();
  end if;

  return jsonb_build_object(
    'result', p_result,
    'review_eligible', eligible_for_review,
    'review_card_opened', should_open_card,
    'consecutive_temporary_failures', next_failures,
    'next_check_at', next_due
  );
end;
$$;

-- CREATE OR REPLACE preserves existing ACLs, but explicitly repeat the browser
-- revocation here as defense in depth against future migration/default-privilege drift.
revoke all on function public.complete_evidence_freshness(
  text, uuid, public.evidence_freshness_result, text, text, integer, text, jsonb
) from public, anon, authenticated;
grant execute on function public.complete_evidence_freshness(
  text, uuid, public.evidence_freshness_result, text, text, integer, text, jsonb
) to service_role;
