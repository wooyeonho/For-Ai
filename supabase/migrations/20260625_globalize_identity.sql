-- Globalize document identity and add claim-level jurisdiction.
--
-- Previously a document's identity was unique by (lang, slug), so the same topic
-- in the same language could not coexist across countries (e.g. a KR and a US
-- "passport-fee" in English would collide). Documents now carry a country, and
-- identity is unique by (country, lang, slug) — letting the registry hold the
-- same topic per country worldwide. Claims gain an optional jurisdiction for
-- facts that differ by country/region (e.g. tax rates).
--
-- DEPLOY TOGETHER WITH THE APP CODE: the new code writes documents.country and
-- reads claims.jurisdiction. Idempotent (IF [NOT] EXISTS) so it is safe to re-run.

-- 1. documents.country — backfilled from the owning entity.
alter table documents add column if not exists country text not null default '';
update documents d
  set country = e.country
  from entities e
  where d.entity_id = e.id and (d.country is null or d.country = '');

-- 2. Replace (lang, slug) uniqueness with country-namespaced identity.
drop index if exists documents_lang_slug_key;
create unique index if not exists documents_country_lang_slug_key
  on documents (country, lang, slug);

-- 3. claims.jurisdiction — optional ISO jurisdiction (e.g. "KR", "US-CA", "EU").
alter table claims add column if not exists jurisdiction text;
