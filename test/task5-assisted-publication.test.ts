import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildTask5EvidenceExcerpt,
  isTask5AssistedReviewAction,
  publicTask5ModelProvenance,
  rankTask5DuplicateCandidates,
  task5PhaseAllowsAssistedPublication,
  task5PublicationEmergencyDisabled,
  task5ReviewActionForRpc,
} from "../lib/task5-assisted-publication";

test("assisted publication is enabled only by a valid DB phase >= 1", () => {
  assert.equal(task5PhaseAllowsAssistedPublication(0), false);
  assert.equal(task5PhaseAllowsAssistedPublication(1), true);
  assert.equal(task5PhaseAllowsAssistedPublication(4), true);
  assert.equal(task5PhaseAllowsAssistedPublication(5), false);
  assert.equal(task5PhaseAllowsAssistedPublication("1"), false);
});

test("emergency flag is deny-only", () => {
  assert.equal(task5PublicationEmergencyDisabled("1"), true);
  assert.equal(task5PublicationEmergencyDisabled("0"), false);
  assert.equal(task5PublicationEmergencyDisabled(undefined), false);
});

test("review actions map to the append-only database vocabulary", () => {
  assert.equal(isTask5AssistedReviewAction("publish"), false);
  assert.equal(isTask5AssistedReviewAction("refetch"), true);
  assert.equal(task5ReviewActionForRpc("reject"), "rejected");
  assert.equal(task5ReviewActionForRpc("escalate"), "escalated");
  assert.equal(task5ReviewActionForRpc("refetch"), "refetch_requested");
  assert.equal(task5ReviewActionForRpc("hold"), "held");
});

test("evidence excerpts preserve JavaScript UTF-16 offsets", () => {
  const canonical = "Official fare 😀 is 1500 won today.";
  const quote = "fare 😀 is 1500 won";
  const start = canonical.indexOf(quote);
  const excerpt = buildTask5EvidenceExcerpt(canonical, start, start + quote.length, 4);
  assert.equal(excerpt?.quote, quote);
  assert.equal(excerpt?.context, canonical.slice(start - 4, start + quote.length + 4));
  assert.equal(buildTask5EvidenceExcerpt(canonical, -1, 2), null);
  assert.equal(buildTask5EvidenceExcerpt(canonical, 5, canonical.length + 1), null);
});

test("public model provenance excludes provider request IDs and malformed rows", () => {
  assert.deepEqual(publicTask5ModelProvenance([
    {
      stage: "structuring",
      provider: "gpt",
      model_id: "model-1",
      prompt_version: "prompt-v1",
      provider_request_id: "private-request-id",
    },
    { stage: "risk", provider: "gpt", model_id: "", prompt_version: "v1" },
  ]), [{ stage: "structuring", provider: "gpt", model_id: "model-1", prompt_version: "prompt-v1" }]);
});

test("duplicate ranking is deterministic and ignores unrelated claims", () => {
  const ranked = rankTask5DuplicateCandidates({
    claim_text: "What is the official metro fare?",
    claim_value: "The adult card fare is 1500 won.",
  }, [
    { id: "b", document_slug: "metro-fare", claim_text: "Official metro adult fare", claim_value: "1500 won card fare" },
    { id: "a", document_slug: "museum-hours", claim_text: "Museum opening hours", claim_value: "9 to 5" },
  ]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]?.id, "b");
  assert.ok((ranked[0]?.score ?? 0) >= 0.2);
});

test("P1 migration keeps publication service-only, human-gated, and transaction-bound", () => {
  const sql = readFileSync("supabase/migrations/20260717074727_task5_p1_operator_assisted_publication.sql", "utf8");
  assert.match(sql, /create or replace function public\.publish_assisted_claim/i);
  assert.match(sql, /settings_row\.phase < 1/i);
  assert.match(sql, /active designated editor required/i);
  assert.match(sql, /latest current-policy risk assessment must be fully normal/i);
  assert.match(sql, /task5_utf16_slice/i);
  assert.match(sql, /duplicate review acknowledgement required/i);
  assert.match(sql, /insert into public\.notification_outbox/i);
  assert.match(sql, /revoke all on function public\.publish_assisted_claim[\s\S]+from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /grant execute on function public\.publish_assisted_claim[\s\S]+to (anon|authenticated)/i);
});

test("P1 production smoke is rollback-only and checks idempotent publication", () => {
  const sql = readFileSync("scripts/sql/task5-p1-rollback-smoke.sql", "utf8");
  assert.match(sql, /^begin;/im);
  assert.match(sql, /phase 0 publication was not blocked/i);
  assert.match(sql, /replay_changed/i);
  assert.match(sql, /utf16_quote/i);
  assert.match(sql, /rollback;\s*$/i);
  assert.doesNotMatch(sql, /commit;/i);
});
