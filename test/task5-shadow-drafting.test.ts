import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  combineRiskResults,
  deterministicDraftRisk,
  parseModelRisk,
  parseStructuredShadowDraft,
  runTask5ShadowDraftBatch,
  task5EmergencyDisabled,
  validTask5CronSecret,
} from "../lib/task5-shadow-drafting";

test("risk combination is fail-closed", () => {
  assert.equal(combineRiskResults("normal", "normal"), "normal");
  assert.equal(combineRiskResults("normal", "unknown"), "unknown");
  assert.equal(combineRiskResults("unknown", "high"), "high");
  assert.equal(deterministicDraftRisk("Was this person convicted?", "No"), "high");
  assert.equal(parseModelRisk('{"risk":"normal"}'), "normal");
  assert.equal(parseModelRisk("not-json"), "unknown");
});

test("structured drafts reject model-generated URL fields", () => {
  assert.deepEqual(parseStructuredShadowDraft('{"answer":"42","quote":"The value is 42."}'), {
    answer: "42",
    quote: "The value is 42.",
  });
  assert.throws(() => parseStructuredShadowDraft('{"answer":"42","quote":"The value is 42.","source_url":"https://example.com"}'));
});

test("cron secret validation is constant-shape and emergency disable is deny-only", () => {
  const secret = "x".repeat(32);
  assert.equal(validTask5CronSecret(secret, secret), true);
  assert.equal(validTask5CronSecret("wrong", secret), false);
  assert.equal(validTask5CronSecret(null, secret), false);
  assert.equal(task5EmergencyDisabled("1"), true);
  assert.equal(task5EmergencyDisabled("0"), false);
});

function enabledClient(
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>,
  phase = 0,
): SupabaseClient {
  const lease = {
    run_id: "run-1",
    attempt_id: "attempt-1",
    wanted_claim_id: "wanted-1",
    locale: "en",
    normalized_text: "What is the value?",
    attempt_number: 1,
    lease_expires_at: "2026-07-17T01:00:00.000Z",
  };
  const client = {
    from(table: string) {
      if (table === "task5_settings") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { phase, draft_enabled: true }, error: null }) }) }) };
      }
      if (table === "draft_attempts") {
        return { update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      if (name === "lease_task5_wanted_claims") return { data: [lease], error: null };
      if (name === "reserve_task5_budget") return { data: true, error: null };
      if (name === "reconcile_task5_budget") return { data: false, error: null };
      if (name === "complete_task5_shadow_draft") return { data: "task5-wanted-1", error: null };
      return { data: null, error: null };
    },
  };
  return client as unknown as SupabaseClient;
}

test("shadow batch uses provider citations only, verifies quote offsets, and completes no publication action", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let generation = 0;
  const result = await runTask5ShadowDraftBatch(enabledClient(calls), {
    workerId: "worker-1",
    dependencies: {
      now: () => new Date("2026-07-17T00:00:00.000Z"),
      uuid: () => "correlation-1",
      async generate(provider) {
        generation += 1;
        if (generation === 1) return { provider, model: "search-model", content: "grounded", citations: ["https://example.com/source"] };
        if (generation === 2) return { provider, model: "draft-model", content: '{"answer":"42","quote":"The value is 42."}' };
        return { provider, model: "risk-model", content: '{"risk":"normal"}' };
      },
      async fetchAndStore(_client, url) {
        assert.equal(url, "https://example.com/source");
        return { id: "snapshot-1", normalized_text: "Header. The value is 42. Footer.", storage_path: null };
      },
    },
  });

  assert.deepEqual(result, { enabled: true, runId: "run-1", leased: 1, completed: 1, failed: 0, errors: [] });
  const complete = calls.find((call) => call.name === "complete_task5_shadow_draft");
  assert.ok(complete);
  assert.equal(complete.args.p_source_snapshot_id, "snapshot-1");
  assert.equal(complete.args.p_quote_start, 8);
  assert.equal(complete.args.p_quote_end, 24);
  assert.equal(complete.args.p_model_result, "normal");
  assert.equal(calls.some((call) => /publish/i.test(call.name)), false);
  assert.equal(calls.filter((call) => call.name === "reserve_task5_budget").length, 3);
  assert.equal(calls.filter((call) => call.name === "record_task5_model_call").length, 3);
});

test("shadow drafting remains available in Phase 1 for the assisted-publication pipeline", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let generation = 0;
  const result = await runTask5ShadowDraftBatch(enabledClient(calls, 1), {
    workerId: "worker-phase-1",
    dependencies: {
      uuid: () => "correlation-phase-1",
      async generate(provider) {
        generation += 1;
        if (generation === 1) {
          return { provider, model: "search-model", content: "grounded", citations: ["https://example.com/source"] };
        }
        if (generation === 2) {
          return { provider, model: "draft-model", content: '{"answer":"42","quote":"The value is 42."}' };
        }
        return { provider, model: "risk-model", content: '{"risk":"normal"}' };
      },
      async fetchAndStore() {
        return { id: "snapshot-1", normalized_text: "The value is 42.", storage_path: null };
      },
    },
  });

  assert.equal(result.enabled, true);
  assert.equal(result.completed, 1);
  assert.equal(calls.some((call) => call.name === "lease_task5_wanted_claims"), true);
});

test("classifier provider failure stores unknown risk instead of failing open", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let generation = 0;
  const result = await runTask5ShadowDraftBatch(enabledClient(calls), {
    workerId: "worker-1",
    dependencies: {
      uuid: () => "correlation-2",
      async generate(provider) {
        generation += 1;
        if (generation === 1) return { provider, model: "search-model", content: "grounded", citations: ["https://example.com/source"] };
        if (generation === 2) return { provider, model: "draft-model", content: '{"answer":"42","quote":"The value is 42."}' };
        return { provider, model: "risk-model", content: "", error: "unavailable" };
      },
      async fetchAndStore() {
        return { id: "snapshot-1", normalized_text: "The value is 42.", storage_path: null };
      },
    },
  });
  assert.equal(result.completed, 1);
  const complete = calls.find((call) => call.name === "complete_task5_shadow_draft");
  assert.equal(complete?.args.p_model_result, "unknown");
});

test("B2 migration has SKIP LOCKED, idempotent cost events, private grants, and no publication writer", () => {
  const sql = readFileSync("supabase/migrations/20260716225254_task5_b2_shadow_drafting.sql", "utf8");
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /task5_cost_events[\s\S]+usage_key text primary key/i);
  assert.match(sql, /revoke all[\s\S]+from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /published_claim_id\s*=/i);
  assert.doesNotMatch(sql, /publication_state\s*=\s*'active'/i);
  assert.match(sql, /alter column draft_claim_id type text/i);
  assert.match(sql, /wanted_claims_draft_claim_id_fkey/i);
});
