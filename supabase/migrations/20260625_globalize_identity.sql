-- Globalization foundation: country-scoped document identity and claim jurisdiction.

alter table documents add column if not exists country text;

update documents d
set country = e.country
from entities e
where d.entity_id = e.id
  and (d.country is null or length(d.country) = 0);

alter table documents
  alter column country set not null;

alter table documents
  add constraint documents_country_required check (length(country) > 0);

drop index if exists documents_lang_slug_key;
create unique index if not exists documents_country_lang_slug_key on documents (country, lang, slug);

alter table claims add column if not exists jurisdiction text;
