import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  severityForReportCategory,
} from "../lib/task5-corrections";
import { claimVersionReference, readBoundedJsonObject } from "../lib/task5-report-server";

test("report categories route deterministically without changing claim state", () => {
  assert.equal(severityForReportCategory("harmful"), "critical");
  assert.equal(severityForReportCategory("right_of_reply"), "high");
  assert.equal(severityForReportCategory("incorrect"), "medium");
  assert.equal(severityForReportCategory("other"), "low");
});

test("bounded report JSON rejects oversized bodies before parsing", async () => {
  const tooLarge = await readBoundedJsonObject(new Request("https://example.test/report", {
    method: "POST",
    headers: { "content-length": "20000" },
    body: "{}",
  }));
  assert.deepEqual(tooLarge, { ok: false, error: "body_too_large" });

  const valid = await readBoundedJsonObject(new Request("https://example.test/report", {
    method: "POST",
    body: JSON.stringify({ message: "specific correction" }),
  }));
  assert.equal(valid.ok, true);
});

test("static claim version references are deterministic and content-bound", () => {
  const base = {
    id: "claim-static-1",
    claim_text: "The fee is documented.",
    claim_value: "$10",
    updated_at: null,
    current_claim_version_id: null,
    published_claim_version_id: null,
  };
  const first = claimVersionReference(base);
  assert.match(first, /^static-sha256:[0-9a-f]{64}$/);
  assert.equal(claimVersionReference(base), first);
  assert.notEqual(claimVersionReference({ ...base, claim_value: "$11" }), first);
  assert.equal(claimVersionReference({ ...base, current_claim_version_id: "db-version" }), "db-version");
});

test("Task 5-F migration has RPC-only state changes and no automatic report quarantine", () => {
  const sql = readFileSync("supabase/migrations/20260717064831_task5_f_report_quarantine_correction.sql", "utf8");
  const permissionsSql = readFileSync("supabase/migrations/20260717065104_task5_f_source_suggestions_permissions.sql", "utf8");
  const indexesSql = readFileSync("supabase/migrations/20260717065346_task5_f_fk_indexes.sql", "utf8");
  assert.match(sql, /create or replace function public\.quarantine_claim/i);
  assert.match(sql, /create or replace function public\.restore_quarantined_claim/i);
  assert.match(sql, /create or replace function public\.withdraw_claim/i);
  assert.match(sql, /revoke all on function public\.quarantine_claim[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /reports_claim_binding_check/i);
  assert.match(sql, /source_suggestions_claim_or_report_check/i);
  assert.match(sql, /report is not bound to this claim version/i);
  assert.doesNotMatch(sql, /select c, d\.status, d\.slug into/i);
  assert.match(sql, /legacy_claim_publication_overrides/i);
  assert.match(sql, /create or replace function public\.cleanup_expired_report_contacts\(\)/i);
  assert.match(sql, /grant execute on function public\.cleanup_expired_report_contacts\(\) to service_role/i);
  assert.doesNotMatch(sql, /after insert[\s\S]{0,200}on public\.reports[\s\S]{0,300}publication_state/i);
  assert.match(permissionsSql, /revoke all on table public\.source_suggestions from anon, authenticated/i);
  assert.doesNotMatch(permissionsSql, /create policy/i);
  assert.match(indexesSql, /claim_correction_events_claim_version_id_idx/i);
  assert.match(indexesSql, /reports_document_id_idx/i);
});

test("static publication overlays fail closed on production lookup failure", () => {
  const source = readFileSync("lib/registry-publication.ts", "utf8");
  assert.match(source, /process\.env\.NODE_ENV === "production"/);
  assert.match(source, /publication_state: "quarantined"/);
  assert.match(source, /if \(error\)[\s\S]+return failClosedLegacyPublication\(bundle\)/);
});

test("same-origin Supabase Bearer admin requests use explicit-token CSRF protection", () => {
  const source = readFileSync("lib/admin-api.ts", "utf8");
  assert.match(source, /if \(!sameOriginOk\(request\)\) return false;[\s\S]+if \(\/\^Bearer/);
  assert.match(source, /supabaseAuthContext\(request\)[\s\S]+csrfValid\(request\)/);
});
