-- Add jurisdiction/country to candidate intake so approved candidates can be
-- promoted into the global entity -> document -> claims registry without
-- requiring ad-hoc DB edits in production.
alter table topic_candidates
  add column if not exists country text;

update topic_candidates
set country = case
  when lang = 'ko' then 'KR'
  when lang = 'hi' then 'IN'
  when lang = 'ar' then 'SA'
  when lang = 'es' then 'ES'
  when lang = 'ja' then 'JP'
  when lang = 'zh' then 'CN'
  when lang = 'en' then 'US'
  else 'global'
end
where country is null or length(country) = 0;

alter table topic_candidates
  alter column country set default 'global',
  alter column country set not null;

create index if not exists topic_candidates_country_idx on topic_candidates(country);
