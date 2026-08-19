import { readFile } from 'node:fs/promises';
import process from 'node:process';

const basePath = new URL('../supabase/migrations/20260717153000_task5_e_freshness.sql', import.meta.url);
const hardeningPath = new URL('../supabase/migrations/20260717153100_task5_e_freshness_hardening.sql', import.meta.url);
const aclSmokePath = new URL('./sql/task5-e-worker-acl-smoke.sql', import.meta.url);

const [base, hardening, aclSmoke] = await Promise.all([
  readFile(basePath, 'utf8'),
  readFile(hardeningPath, 'utf8'),
  readFile(aclSmokePath, 'utf8'),
]);

const failures = [];
const requireMatch = (text, pattern, label) => {
  if (!pattern.test(text)) failures.push(label);
};

// Worker tables must remain private to browser roles.
for (const table of [
  'evidence_freshness_state',
  'evidence_freshness_checks',
  'freshness_review_cards',
]) {
  requireMatch(base, new RegExp(`revoke\\s+all\\s+on\\s+public\\.${table}\\s+from\\s+anon,\\s*authenticated`, 'i'), `${table}: browser table revoke missing`);
  requireMatch(base, new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'), `${table}: RLS enable missing`);
}

// Supabase projects can carry explicit role EXECUTE grants in addition to PUBLIC.
// The hardening migration must revoke all three browser/default principals.
for (const fn of [
  'task5_seed_evidence_freshness_state',
  'lease_evidence_freshness',
  'complete_evidence_freshness',
]) {
  requireMatch(
    hardening,
    new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${fn}[\\s\\S]*?from\\s+public,\\s*anon,\\s*authenticated`, 'i'),
    `${fn}: explicit public/anon/authenticated EXECUTE revoke missing`,
  );
}

requireMatch(hardening, /grant\s+execute\s+on\s+function\s+public\.lease_evidence_freshness[\s\S]*?to\s+service_role/i, 'lease_evidence_freshness: service_role grant missing');
requireMatch(hardening, /grant\s+execute\s+on\s+function\s+public\.complete_evidence_freshness[\s\S]*?to\s+service_role/i, 'complete_evidence_freshness: service_role grant missing');

// Publication can change between lease and completion; card generation must re-check it.
requireMatch(hardening, /eligible_for_review\s*:=\s*claim\.publication_state\s*=\s*'active'[\s\S]*?claim\.published_claim_version_id\s*=\s*evidence\.claim_version_id/i, 'completion-time publication eligibility guard missing');
requireMatch(hardening, /should_open_card\s*:=\s*eligible_for_review\s+and/i, 'review-card gate is not bound to publication eligibility');

// Inspection history must be append-only.
requireMatch(hardening, /evidence_freshness_checks_immutable_update/i, 'immutable UPDATE trigger missing');
requireMatch(hardening, /evidence_freshness_checks_immutable_delete/i, 'immutable DELETE trigger missing');

// Keep a runnable DB-level ACL smoke beside the migration source.
for (const fn of [
  'task5_seed_evidence_freshness_state',
  'lease_evidence_freshness',
  'complete_evidence_freshness',
]) {
  requireMatch(aclSmoke, new RegExp(fn, 'i'), `ACL smoke does not cover ${fn}`);
}
requireMatch(aclSmoke, /service_role/i, 'ACL smoke does not verify service_role access');

if (failures.length > 0) {
  console.error('Task 5-E DB security guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Task 5-E DB security source guard passed.');
