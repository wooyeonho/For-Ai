#!/usr/bin/env node
// Convert the curated verified-seed-set.json (priority civic/government topics)
// into topic-candidate documents for the verification pipeline.
//
// IMPORTANT: this asserts NO facts. Every claim is emitted as "확인 필요"
// (needs_review / low confidence). It only pre-loads the admin verify queue with
// the curated seed topics so a human can attach official sources and promote
// each claim to verified. This connects the previously-unused seed set to the
// pipeline; it does not bypass human verification.
//
// Usage:
//   node scripts/seed-to-candidates.mjs [--seed <path>] [--out <path>]
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

const UNKNOWN = "확인 필요";
const GENERATED_DOCUMENT_STATUS = "needs_review";
const GENERATED_CONFIDENCE = "low";
const GENERATED_CLAIM_STATUS = "needs_review";
const CITATION_READY_BEFORE_APPROVAL = false;

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg.startsWith("--")) {
    const key = arg.slice(2);
    const next = process.argv[index + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      index += 1;
    } else {
      args.set(key, "true");
    }
  }
}

const seedPath = args.get("seed") ?? "data/verified-seed-set.json";
const out = args.get("out") ?? "data/topic-candidates/seed-civic.jsonl";

const seed = JSON.parse(readFileSync(seedPath, "utf8"));
if (!Array.isArray(seed)) throw new Error(`${seedPath} must be a JSON array`);

function entityId(slug) {
  return `seed-${slug}-001`.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 120);
}

function disclaimerForTopic(topic) {
  const type = String(topic.category ?? topic.type ?? "");
  if (type.startsWith("finance.markets")) return "not_financial_advice";
  if (type.startsWith("legal.")) return "not_legal_advice";
  if (["health.", "medical.", "clinical_pathology.", "radiology."].some((prefix) => type.startsWith(prefix))) {
    return "not_medical_advice";
  }
  if (type.startsWith("genomics.")) return "not_genetic_or_medical_advice";
  if (type === "public_profile.people") return "public_profile_only";
  return topic.disclaimer_type ?? "check_official_source";
}

function sourcePolicy(requiredType) {
  const preferred = requiredType && requiredType !== "official"
    ? [requiredType, "official"]
    : ["official"];
  return {
    preferred,
    allowed: [...new Set([...preferred, "document", "web"])],
    disallowed: ["forum", "rumor", "unsourced_blog"],
  };
}

const lines = seed.map((topic) => {
  const claims = (topic.claims ?? []).map((claim) => ({
    field_path: claim.field_path,
    claim_text: claim.question ?? claim.claim_text ?? `${topic.title}: 확인이 필요합니다.`,
    claim_value: UNKNOWN,
    confidence: GENERATED_CONFIDENCE,
    status: GENERATED_CLAIM_STATUS,
    required_source_type: claim.required_source_type ?? "official",
  }));

  const doc = {
    entity_id: entityId(topic.slug),
    type: topic.category ?? "general",
    name: topic.title,
    slug: topic.slug,
    lang: topic.lang ?? "ko",
    country: topic.country ?? "KR",
    jurisdiction: topic.jurisdiction ?? "KR",
    risk_tier: topic.risk_tier ?? "medium",
    update_frequency: topic.update_frequency ?? "event_based",
    disclaimer_type: disclaimerForTopic(topic),
    status: GENERATED_DOCUMENT_STATUS,
    confidence: GENERATED_CONFIDENCE,
    citation_ready: CITATION_READY_BEFORE_APPROVAL,
    source_policy: sourcePolicy(claims[0]?.required_source_type),
    candidate_source_hints: [],
    why_people_ask_ai: topic.why_people_ask_ai ?? null,
    why_ai_gets_wrong: topic.why_ai_gets_wrong ?? null,
    claims,
  };
  return JSON.stringify(doc);
});

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join("\n") + "\n", "utf8");

const claimCount = seed.reduce((sum, t) => sum + (t.claims?.length ?? 0), 0);
console.log(`Wrote ${lines.length} seed candidate documents (${claimCount} claims, all "확인 필요" / low / needs_review / citation_ready=false) → ${out}`);
console.log("Next: import via /admin/import, then attach official sources in /admin/verify-claim to promote to verified.");
