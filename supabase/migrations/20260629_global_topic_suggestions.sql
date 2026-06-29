-- Extend private topic suggestion intake for global public submissions.
-- Public suggestions remain write-only and feed topic_candidates for admin review.
alter table topic_suggestions
  add column if not exists country text,
  add column if not exists city_region text,
  add column if not exists language text not null default 'en',
  add column if not exists contact_email text;

create index if not exists topic_suggestions_status_submitted_idx
  on topic_suggestions(status, submitted_at desc);
