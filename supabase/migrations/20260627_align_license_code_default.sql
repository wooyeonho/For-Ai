-- Align documents.license_code default with the application code.
--
-- The codebase (lib/verified-claims, lib/admin-stubs, lib/seed-data,
-- lib/supabase-documents fallback, and all i18n license labels) uses the
-- identifier 'forai-data-license-v0.1'. The DB column default had drifted to
-- a legacy 'gyeol-data-license-v0.1' value, and a branding cleanup briefly
-- introduced a third spelling ('for-ai-data-license-v0.1') in schema-v3.sql.
-- This standardizes everything on 'forai-data-license-v0.1'.
--
-- Existing rows: there are no documents yet, and every application insert
-- path sets license_code explicitly, so this only affects future inserts that
-- omit the column. Backfill kept for safety/idempotency.

alter table documents alter column license_code set default 'forai-data-license-v0.1';

update documents
set license_code = 'forai-data-license-v0.1'
where license_code in ('gyeol-data-license-v0.1', 'for-ai-data-license-v0.1');
