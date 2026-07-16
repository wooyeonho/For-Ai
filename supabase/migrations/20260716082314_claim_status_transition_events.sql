-- Task 4: DB-stage LAG over the full verification_events stream, so that
-- "previous status" reflects every event for a claim (not just the ones a
-- caller happens to have requested), and the requested status filter is
-- applied strictly AFTER transition detection (Bible v7 Book IV §9.1).
--
-- get_claim_status_transition_events returns one row per REAL status
-- transition (new_status differs from the immediately preceding status-
-- bearing event for that claim), newest first, with (created_at, event_id)
-- keyset pagination so same-timestamp events still get a stable order.
create or replace function public.get_claim_status_transition_events(
  p_statuses public.claim_status[] default null,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_event_id uuid default null
)
returns table (
  event_id uuid,
  claim_id text,
  event_type public.verification_event_type,
  previous_status public.claim_status,
  new_status public.claim_status,
  note text,
  occurred_at timestamptz,
  slug text,
  title text,
  lang text,
  entity_id text,
  field_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  with status_events as (
    select
      ve.id,
      ve.claim_id,
      ve.event_type,
      ve.new_status,
      ve.note,
      ve.created_at
    from public.verification_events ve
    where ve.new_status is not null
  ),
  lagged as (
    select
      se.*,
      lag(se.new_status) over (
        partition by se.claim_id
        order by se.created_at, se.id
      ) as computed_previous_status
    from status_events se
  ),
  transitions as (
    -- Real transitions only: the first status-bearing event for a claim
    -- (computed_previous_status is null) always counts; later events count
    -- only when the status actually changed.
    select *
    from lagged
    where computed_previous_status is null
       or computed_previous_status is distinct from new_status
  )
  select
    t.id as event_id,
    t.claim_id,
    t.event_type,
    t.computed_previous_status as previous_status,
    t.new_status,
    t.note,
    t.created_at as occurred_at,
    d.slug,
    d.title,
    d.lang,
    d.entity_id,
    c.field_path
  from transitions t
  join public.claims c on c.id = t.claim_id
  join public.documents d on d.id = c.document_id
  where (p_statuses is null or t.new_status = any(p_statuses))
    and (
      p_before_created_at is null
      or (t.created_at, t.id) < (p_before_created_at, p_before_event_id)
    )
  order by t.created_at desc, t.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 300));
$$;

comment on function public.get_claim_status_transition_events is
  'Task 4 changelog/RSS source: LAG(status) computed over the full verification_events stream per claim before any transition or status filter is applied. Read-only, SECURITY DEFINER only to present a minimal column projection over claims/documents/verification_events (all already public-SELECT via RLS) — never mutates.';

-- Public discovery surface: same audience as the existing anon SELECT
-- policies on claims/documents/verification_events (RSS feed, changelog
-- page/API are unauthenticated public routes).
grant execute on function public.get_claim_status_transition_events(
  public.claim_status[], integer, timestamptz, uuid
) to anon, authenticated;
