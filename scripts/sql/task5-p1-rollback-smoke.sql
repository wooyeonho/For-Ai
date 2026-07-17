-- Production-safe Task 5-P1 behavior drill.
-- Every synthetic row and the temporary phase change are rolled back.

begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'f1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'task5-p1-rollback-smoke.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.admin_users (user_id, role, active, display_name)
values ('f1000000-0000-4000-8000-000000000001', 'editor', true, 'rollback smoke');

insert into public.entities (id, type, canonical_name, country)
values ('__task5_p1_smoke_entity__', 'service', 'Task 5 P1 rollback smoke', 'US');
insert into public.documents (
  id, entity_id, slug, lang, country, title, category, template, status, confidence
) values (
  '__task5_p1_smoke_doc__', '__task5_p1_smoke_entity__', '__task5-p1-rollback-smoke__',
  'en', 'US', 'Task 5 P1 rollback smoke', 'test', 'general', 'ai_draft', 'low'
);
insert into public.claims (
  id, document_id, entity_id, field_path, claim_text, claim_value,
  status, confidence, content_origin, publication_mode, publication_state
) values (
  '__task5_p1_smoke_claim__', '__task5_p1_smoke_doc__', '__task5_p1_smoke_entity__',
  'answer', 'What is the smoke value?', '1500 won',
  'needs_review', 'low', 'task5_ai', 'assisted_operator', 'active'
);
insert into public.claim_versions (id, claim_id, version, text, text_hash)
values (
  'f1000000-0000-4000-8000-000000000002', '__task5_p1_smoke_claim__', 1, '1500 won',
  encode(sha256(convert_to('1500 won','UTF8')),'hex')
);
update public.claims
set current_claim_version_id = 'f1000000-0000-4000-8000-000000000002'
where id = '__task5_p1_smoke_claim__';

insert into public.source_snapshots (
  id, canonical_url, final_url, retrieved_at, http_status, content_type,
  content_hash, normalized_text_hash, normalized_text, storage_path
) values (
  'f1000000-0000-4000-8000-000000000003',
  'https://example.com/task5-p1-smoke', 'https://example.com/task5-p1-smoke',
  now(), 200, 'text/html',
  encode(sha256(convert_to('Authoritative fare 😀 is 1500 won today.','UTF8')),'hex'),
  encode(sha256(convert_to('Authoritative fare 😀 is 1500 won today.','UTF8')),'hex'),
  'Authoritative fare 😀 is 1500 won today.', null
);
insert into public.claim_evidence (
  claim_version_id, source_snapshot_id, quote_start, quote_end,
  quote_hash, context_hash, relation, is_required
) values (
  'f1000000-0000-4000-8000-000000000002',
  'f1000000-0000-4000-8000-000000000003',
  14, 33,
  encode(sha256(convert_to('fare 😀 is 1500 won','UTF8')),'hex'),
  encode(sha256(convert_to('Authoritative fare 😀 is 1500 won today.','UTF8')),'hex'),
  'supports', true
);
insert into public.risk_assessments (
  claim_version_id, deterministic_result, model_result, final_result,
  deterministic_policy_version, model_id, prompt_version
) values (
  'f1000000-0000-4000-8000-000000000002',
  'normal', 'normal', 'normal', 'task5-risk-keywords-v1', 'smoke-model', 'risk-v1'
);

insert into public.contributors (id, contributor_hash)
values ('f1000000-0000-4000-8000-000000000004', repeat('b',64));
insert into public.wanted_claims (
  id, locale, normalization_version, normalized_text, normalized_hash,
  status, draft_claim_id, last_demand_at
) values (
  'f1000000-0000-4000-8000-000000000005', 'en', 1,
  'task 5 p1 rollback smoke wanted', repeat('c',64),
  'drafted', '__task5_p1_smoke_claim__', now()
);
insert into public.wanted_claim_suggesters (wanted_claim_id, contributor_id)
values (
  'f1000000-0000-4000-8000-000000000005',
  'f1000000-0000-4000-8000-000000000004'
);
insert into public.task5_runs (
  id, run_type, scheduled_for, state, leased_count, success_count,
  failure_count, correlation_id, completed_at
) values (
  'f1000000-0000-4000-8000-000000000006',
  'shadow_draft', now(), 'completed', 1, 1, 0, '__task5_p1_rollback_smoke__', now()
);
insert into public.draft_attempts (
  id, wanted_claim_id, run_id, worker_id, prompt_version, risk_prompt_version,
  idempotency_key, state, attempt_number, lease_expires_at, provider, model_id,
  model_provenance, source_snapshot_id, claim_id, completed_at
) values (
  'f1000000-0000-4000-8000-000000000007',
  'f1000000-0000-4000-8000-000000000005',
  'f1000000-0000-4000-8000-000000000006',
  'rollback-smoke', 'draft-v1', 'risk-v1', '__task5_p1_attempt_smoke__',
  'completed', 1, now() + interval '10 minutes', 'test', 'smoke-model',
  '[{"stage":"structuring","provider":"test","model_id":"smoke-model","prompt_version":"draft-v1"}]'::jsonb,
  'f1000000-0000-4000-8000-000000000003',
  '__task5_p1_smoke_claim__', now()
);

do $$
declare
  blocked boolean := false;
begin
  begin
    perform * from public.publish_assisted_claim(
      '__task5_p1_smoke_claim__',
      'f1000000-0000-4000-8000-000000000002',
      (select version from public.verification_policies
       where mode='assisted_operator' and effective_from <= now()
       order by effective_from desc, version desc limit 1),
      true, 'rollback smoke human review',
      'f1000000-0000-4000-8000-000000000001',
      repeat('a',64), '__task5_p1_publish_smoke__'
    );
  exception when others then
    if sqlerrm like '%Phase 1 is not enabled%' then
      blocked := true;
    else
      raise;
    end if;
  end;
  if not blocked then
    raise exception 'phase 0 publication was not blocked';
  end if;
end;
$$;

select * from public.set_task5_phase(
  1, 'transaction-rolled-back Task 5 P1 smoke',
  'f1000000-0000-4000-8000-000000000001', repeat('a',64)
);

create temporary table task5_p1_smoke_result on commit drop as
select * from public.publish_assisted_claim(
  '__task5_p1_smoke_claim__',
  'f1000000-0000-4000-8000-000000000002',
  (select version from public.verification_policies
   where mode='assisted_operator' and effective_from <= now()
   order by effective_from desc, version desc limit 1),
  true, 'rollback smoke human review',
  'f1000000-0000-4000-8000-000000000001',
  repeat('a',64), '__task5_p1_publish_smoke__'
);
create temporary table task5_p1_smoke_replay on commit drop as
select * from public.publish_assisted_claim(
  '__task5_p1_smoke_claim__',
  'f1000000-0000-4000-8000-000000000002',
  (select version from public.verification_policies
   where mode='assisted_operator' and effective_from <= now()
   order by effective_from desc, version desc limit 1),
  true, 'rollback smoke human review',
  'f1000000-0000-4000-8000-000000000001',
  repeat('a',64), '__task5_p1_publish_smoke__'
);

select jsonb_build_object(
  'phase0_blocked', true,
  'first_changed', (select changed from task5_p1_smoke_result),
  'replay_changed', (select changed from task5_p1_smoke_replay),
  'claim_status', (select status from public.claims where id='__task5_p1_smoke_claim__'),
  'claim_mode', (select publication_mode from public.claims where id='__task5_p1_smoke_claim__'),
  'document_status', (select status from public.documents where id='__task5_p1_smoke_doc__'),
  'wanted_status', (select status from public.wanted_claims where id='f1000000-0000-4000-8000-000000000005'),
  'review_events', (select count(*) from public.assisted_review_events where claim_id='__task5_p1_smoke_claim__'),
  'outbox_rows', (select count(*) from public.notification_outbox where event_id in (
    select id from public.assisted_review_events where claim_id='__task5_p1_smoke_claim__'
  )),
  'verification_events', (select count(*) from public.verification_events where claim_id='__task5_p1_smoke_claim__'),
  'source_rows', (select count(*) from public.claim_sources where claim_id='__task5_p1_smoke_claim__'),
  'utf16_quote', public.task5_utf16_slice('Authoritative fare 😀 is 1500 won today.',14,33)
) as smoke_result;

rollback;
