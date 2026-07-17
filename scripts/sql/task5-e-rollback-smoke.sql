-- Task 5-E rollback-only database smoke.
-- Run only after both Task 5-E migrations are installed on a non-production
-- Supabase branch. Every synthetic row is removed by the final ROLLBACK.

begin;

do $$
declare
  v_entity_id text := 'task5-e-smoke-entity';
  v_document_id text := 'task5-e-smoke-document';
  v_claim_id text := 'task5-e-smoke-claim';
  v_version_id uuid := '00000000-0000-0000-0000-00000000e001';
  v_snapshot_primary uuid := '00000000-0000-0000-0000-00000000e101';
  v_snapshot_alternative uuid := '00000000-0000-0000-0000-00000000e102';
  v_snapshot_definitive uuid := '00000000-0000-0000-0000-00000000e103';
  v_evidence_primary uuid := '00000000-0000-0000-0000-00000000e201';
  v_evidence_alternative uuid := '00000000-0000-0000-0000-00000000e202';
  v_evidence_definitive uuid := '00000000-0000-0000-0000-00000000e203';
  v_quote text := 'The verified statement remains available.';
  v_claim_status public.claim_status;
  v_claim_confidence public.confidence_level;
  v_publication_state public.claim_publication_state;
  v_card_count integer;
  v_failure_count integer;
  v_alternative_count integer;
  v_history_immutable boolean := false;
  v_leased uuid;
begin
  insert into public.entities (id, type, canonical_name, country)
  values (v_entity_id, 'smoke', 'Task 5-E smoke entity', 'KR');

  insert into public.documents (
    id, entity_id, slug, lang, country, title, category, template,
    status, confidence
  ) values (
    v_document_id, v_entity_id, 'task5-e-smoke', 'en', 'KR',
    'Task 5-E smoke document', 'smoke', 'fact', 'verified', 'high'
  );

  insert into public.claims (
    id, document_id, entity_id, field_path, claim_text, claim_value,
    jurisdiction, confidence, status, content_origin, publication_mode,
    publication_state, valid_until
  ) values (
    v_claim_id, v_document_id, v_entity_id, 'smoke.value',
    'Task 5-E smoke claim', 'available', 'KR', 'high', 'verified',
    'legacy_manual', 'manual_legacy', 'active', now() - interval '1 day'
  );

  insert into public.claim_versions (id, claim_id, version, text, text_hash)
  values (
    v_version_id, v_claim_id, 1, 'Task 5-E smoke claim',
    encode(digest('Task 5-E smoke claim', 'sha256'), 'hex')
  );

  update public.claims
  set current_claim_version_id = v_version_id,
      published_claim_version_id = v_version_id,
      published_at = now()
  where id = v_claim_id;

  insert into public.source_snapshots (
    id, canonical_url, final_url, retrieved_at, http_status, content_type,
    content_hash, normalized_text_hash, normalized_text
  ) values
  (
    v_snapshot_primary,
    'https://example.com/task5-e-primary',
    'https://example.com/task5-e-primary',
    now(), 200, 'text/html',
    encode(digest(v_quote, 'sha256'), 'hex'),
    encode(digest(v_quote, 'sha256'), 'hex'),
    v_quote
  ),
  (
    v_snapshot_alternative,
    'https://example.com/task5-e-alternative',
    'https://example.com/task5-e-alternative',
    now(), 200, 'text/html',
    encode(digest(v_quote, 'sha256'), 'hex'),
    encode(digest(v_quote, 'sha256'), 'hex'),
    v_quote
  ),
  (
    v_snapshot_definitive,
    'https://example.com/task5-e-definitive',
    'https://example.com/task5-e-definitive',
    now(), 200, 'text/html',
    encode(digest(v_quote, 'sha256'), 'hex'),
    encode(digest(v_quote, 'sha256'), 'hex'),
    v_quote
  );

  insert into public.claim_evidence (
    id, claim_version_id, source_snapshot_id, quote_start, quote_end,
    quote_hash, relation, is_required
  ) values
  (
    v_evidence_primary, v_version_id, v_snapshot_primary, 0, length(v_quote),
    encode(digest(v_quote, 'sha256'), 'hex'), 'supports', true
  ),
  (
    v_evidence_alternative, v_version_id, v_snapshot_alternative, 0, length(v_quote),
    encode(digest(v_quote, 'sha256'), 'hex'), 'supports', true
  ),
  (
    v_evidence_definitive, v_version_id, v_snapshot_definitive, 0, length(v_quote),
    encode(digest(v_quote, 'sha256'), 'hex'), 'supports', true
  );

  select status, confidence, publication_state
  into v_claim_status, v_claim_confidence, v_publication_state
  from public.claims where id = v_claim_id;

  -- Mark the alternative evidence healthy first. Keep the other rows out of the
  -- lease queue temporarily so the selected row is deterministic.
  update public.evidence_freshness_state
  set next_check_at = case
    when claim_evidence_id = v_evidence_alternative then now()
    else now() + interval '1 day'
  end
  where claim_evidence_id in (
    v_evidence_primary, v_evidence_alternative, v_evidence_definitive
  );

  select claim_evidence_id into v_leased
  from public.lease_evidence_freshness('smoke-alt', 1, 120);
  if v_leased is distinct from v_evidence_alternative then
    raise exception 'Task 5-E smoke: alternative evidence lease mismatch';
  end if;

  perform public.complete_evidence_freshness(
    'smoke-alt', v_evidence_alternative, 'healthy',
    'https://example.com/task5-e-alternative',
    encode(digest(v_quote, 'sha256'), 'hex'), 200, null,
    '{"smoke":true}'::jsonb
  );

  -- Primary evidence: first two temporary failures must not open a card.
  for v_failure_count in 1..3 loop
    update public.evidence_freshness_state
    set next_check_at = now()
    where claim_evidence_id = v_evidence_primary;

    select claim_evidence_id into v_leased
    from public.lease_evidence_freshness('smoke-primary', 1, 120);
    if v_leased is distinct from v_evidence_primary then
      raise exception 'Task 5-E smoke: primary evidence lease mismatch on attempt %', v_failure_count;
    end if;

    perform public.complete_evidence_freshness(
      'smoke-primary', v_evidence_primary, 'temporarily_unavailable',
      null, null, 503, 'smoke_timeout',
      jsonb_build_object('smoke', true, 'attempt', v_failure_count)
    );

    select count(*) into v_card_count
    from public.freshness_review_cards
    where claim_evidence_id = v_evidence_primary and status = 'open';

    if v_failure_count < 3 and v_card_count <> 0 then
      raise exception 'Task 5-E smoke: card opened before third temporary failure';
    end if;
    if v_failure_count = 3 and v_card_count <> 1 then
      raise exception 'Task 5-E smoke: third temporary failure did not open exactly one card';
    end if;
  end loop;

  select consecutive_temporary_failures into v_failure_count
  from public.evidence_freshness_state
  where claim_evidence_id = v_evidence_primary;
  if v_failure_count <> 3 then
    raise exception 'Task 5-E smoke: temporary failure counter expected 3, got %', v_failure_count;
  end if;

  select other_healthy_evidence_count into v_alternative_count
  from public.freshness_review_cards
  where claim_evidence_id = v_evidence_primary and status = 'open';
  if v_alternative_count <> 1 then
    raise exception 'Task 5-E smoke: expected one healthy alternative, got %', v_alternative_count;
  end if;

  -- A definitive not-found result opens a card on the first attempt.
  update public.evidence_freshness_state
  set next_check_at = now()
  where claim_evidence_id = v_evidence_definitive;

  select claim_evidence_id into v_leased
  from public.lease_evidence_freshness('smoke-definitive', 1, 120);
  if v_leased is distinct from v_evidence_definitive then
    raise exception 'Task 5-E smoke: definitive evidence lease mismatch';
  end if;

  perform public.complete_evidence_freshness(
    'smoke-definitive', v_evidence_definitive, 'not_found',
    null, null, 404, 'http_not_found', '{"smoke":true}'::jsonb
  );

  select count(*) into v_card_count
  from public.freshness_review_cards
  where claim_evidence_id = v_evidence_definitive and status = 'open';
  if v_card_count <> 1 then
    raise exception 'Task 5-E smoke: definitive result did not open exactly one card';
  end if;

  -- Freshness inspection must never mutate claim verification/publication state.
  if exists (
    select 1 from public.claims
    where id = v_claim_id
      and (
        status is distinct from v_claim_status
        or confidence is distinct from v_claim_confidence
        or publication_state is distinct from v_publication_state
      )
  ) then
    raise exception 'Task 5-E smoke: claim state changed automatically';
  end if;

  -- History must be append-only.
  begin
    update public.evidence_freshness_checks
    set metadata = metadata || '{"illegal_update":true}'::jsonb
    where claim_evidence_id = v_evidence_primary;
  exception when others then
    v_history_immutable := true;
  end;
  if not v_history_immutable then
    raise exception 'Task 5-E smoke: history UPDATE was not rejected';
  end if;

  v_history_immutable := false;
  begin
    delete from public.evidence_freshness_checks
    where claim_evidence_id = v_evidence_primary;
  exception when others then
    v_history_immutable := true;
  end;
  if not v_history_immutable then
    raise exception 'Task 5-E smoke: history DELETE was not rejected';
  end if;

  -- Browser roles must not reach private tables or worker RPCs.
  if has_table_privilege('anon', 'public.evidence_freshness_state', 'SELECT')
     or has_table_privilege('authenticated', 'public.evidence_freshness_state', 'SELECT')
     or has_table_privilege('anon', 'public.evidence_freshness_checks', 'SELECT')
     or has_table_privilege('authenticated', 'public.evidence_freshness_checks', 'SELECT')
     or has_table_privilege('anon', 'public.freshness_review_cards', 'SELECT')
     or has_table_privilege('authenticated', 'public.freshness_review_cards', 'SELECT') then
    raise exception 'Task 5-E smoke: browser table privilege present';
  end if;

  if has_function_privilege(
       'anon',
       'public.lease_evidence_freshness(text,integer,integer)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.lease_evidence_freshness(text,integer,integer)',
       'EXECUTE'
     ) then
    raise exception 'Task 5-E smoke: browser lease RPC privilege present';
  end if;

  raise notice 'Task 5-E rollback smoke passed: threshold, immediate card, healthy alternative, claim immutability, append-only history, and private privileges.';
end;
$$;

rollback;
