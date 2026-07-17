-- Production-safe Task 5-D behavior drill. Every synthetic row is rolled back.

begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'd1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'task5-d-rollback-smoke.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.admin_users (user_id, role, active, display_name)
values ('d1000000-0000-4000-8000-000000000001', 'editor', true, 'Task 5-D rollback smoke');
insert into public.contributors (id, contributor_hash, account_id)
values (
  'd1000000-0000-4000-8000-000000000002', repeat('d', 64),
  'd1000000-0000-4000-8000-000000000001'
);

insert into public.entities (id, type, canonical_name, country)
values ('__task5_d_smoke_entity__', 'service', 'Task 5-D rollback smoke', 'US');
insert into public.documents (
  id, entity_id, slug, lang, country, title, category, template, status, confidence
) values (
  '__task5_d_smoke_doc__', '__task5_d_smoke_entity__', '__task5-d-rollback-smoke__',
  'en', 'US', 'Task 5-D rollback smoke', 'test', 'general', 'ai_draft', 'low'
);
insert into public.claims (
  id, document_id, entity_id, field_path, claim_text, claim_value,
  status, confidence, content_origin, publication_mode, publication_state
) values (
  '__task5_d_smoke_claim__', '__task5_d_smoke_doc__', '__task5_d_smoke_entity__',
  'answer', 'Does Task 5-D deliver once?', 'yes',
  'needs_review', 'low', 'task5_ai', 'assisted_operator', 'active'
);
insert into public.claim_versions (id, claim_id, version, text, text_hash)
values (
  'd1000000-0000-4000-8000-000000000003', '__task5_d_smoke_claim__', 1, 'yes',
  encode(sha256(convert_to('yes', 'UTF8')), 'hex')
);

insert into public.assisted_review_events (
  id, claim_id, claim_version_id, action, reason, admin_user_id,
  admin_user_hash, idempotency_key
) values (
  'd1000000-0000-4000-8000-000000000004',
  '__task5_d_smoke_claim__', 'd1000000-0000-4000-8000-000000000003',
  'held', 'Task 5-D rollback smoke hold',
  'd1000000-0000-4000-8000-000000000001', repeat('e', 64),
  '__task5_d_smoke_review_one__'
);

-- The same event/recipient receives another reason without another row.
insert into public.notification_outbox (event_id, recipient_id, reasons)
values (
  'd1000000-0000-4000-8000-000000000004',
  'd1000000-0000-4000-8000-000000000002',
  array['wanted_claim_published']::text[]
)
on conflict on constraint notification_outbox_event_id_recipient_id_key
do update set reasons = public.task5_merge_notification_reasons(
  public.notification_outbox.reasons,
  excluded.reasons
);

create temporary table task5_d_first_lease on commit drop as
select * from public.lease_notification_outbox('__task5_d_smoke_worker__', 1, 120, 5);
create temporary table task5_d_first_delivery on commit drop as
select public.complete_notification_outbox(
  (select id from task5_d_first_lease), '__task5_d_smoke_worker__'
) as result;
create temporary table task5_d_replay on commit drop as
select public.complete_notification_outbox(
  (select id from task5_d_first_lease), '__task5_d_smoke_worker__'
) as result;

-- A separate event exhausts a one-attempt budget and must enter the DLQ.
insert into public.assisted_review_events (
  id, claim_id, claim_version_id, action, reason, admin_user_id,
  admin_user_hash, idempotency_key
) values (
  'd1000000-0000-4000-8000-000000000005',
  '__task5_d_smoke_claim__', 'd1000000-0000-4000-8000-000000000003',
  'escalated', 'Task 5-D rollback smoke escalation',
  'd1000000-0000-4000-8000-000000000001', repeat('e', 64),
  '__task5_d_smoke_review_two__'
);
create temporary table task5_d_dead_lease on commit drop as
select * from public.lease_notification_outbox('__task5_d_dead_worker__', 1, 120, 1);
create temporary table task5_d_dead_result on commit drop as
select public.fail_notification_outbox(
  (select id from task5_d_dead_lease), '__task5_d_dead_worker__',
  'synthetic_failure', 1
) as result;

-- Exercise the same grants and RLS policy used by the browser inbox.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
update public.notifications
set read_at = now()
where event_id = 'd1000000-0000-4000-8000-000000000004';
reset role;

select jsonb_build_object(
  'outbox_rows_for_first_event', (
    select count(*) from public.notification_outbox
    where event_id = 'd1000000-0000-4000-8000-000000000004'
  ),
  'aggregated_reasons', (
    select reasons from public.notifications
    where event_id = 'd1000000-0000-4000-8000-000000000004'
  ),
  'delivered_rows', (
    select count(*) from public.notification_outbox
    where event_id = 'd1000000-0000-4000-8000-000000000004' and status = 'delivered'
  ),
  'notification_rows', (
    select count(*) from public.notifications
    where event_id = 'd1000000-0000-4000-8000-000000000004'
  ),
  'read_at_set_through_authenticated_rls', (
    select read_at is not null from public.notifications
    where event_id = 'd1000000-0000-4000-8000-000000000004'
  ),
  'first_changed', (select (result->>'changed')::boolean from task5_d_first_delivery),
  'replay_changed', (select (result->>'changed')::boolean from task5_d_replay),
  'dead', (select (result->>'dead')::boolean from task5_d_dead_result),
  'dead_letters', (
    select count(*) from public.notification_dead_letters
    where event_id = 'd1000000-0000-4000-8000-000000000005'
  )
) as smoke_result;

rollback;
