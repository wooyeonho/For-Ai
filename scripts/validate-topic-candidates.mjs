#!/usr/bin/env node

/**
 * GYEOL topic candidate JSONL validator.
 *
 * Usage:
 *   node scripts/validate-topic-candidates.mjs <path-to-jsonl>
 *
 * Validates every line against POST_MVP_TOPIC_CATALOG.md rules.
 * Exits 0 if all lines pass, 1 on first failure.
 */

import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/validate-topic-candidates.mjs <file.jsonl>");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Allowed enum values
// ---------------------------------------------------------------------------
const RISK_TIERS = new Set(["low", "medium", "high", "restricted"]);

const UPDATE_FREQUENCIES = new Set([
  "static", "annual", "quarterly", "monthly",
  "weekly", "daily", "realtime", "event_based", "unknown",
]);

const DISCLAIMER_TYPES = new Set([
  "none", "check_official_source", "not_medical_advice",
  "not_genetic_or_medical_advice",
  "not_legal_advice", "not_financial_advice", "personal_case_depends",
  "realtime_data_required", "public_profile_only",
]);

// ---------------------------------------------------------------------------
// Required fields
// ---------------------------------------------------------------------------
const ENTITY_REQUIRED = [
  "entity_id", "type", "name", "slug", "lang", "country",
  "jurisdiction", "risk_tier", "update_frequency", "disclaimer_type",
  "source_policy", "claims",
];

const CLAIM_REQUIRED = [
  "field_path", "claim_text", "claim_value", "confidence", "status", "sources",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fail(line, reason) {
  console.error(`FAIL line ${line}: ${reason}`);
  process.exit(1);
}

function validateSourcePolicy(sp, line) {
  if (typeof sp !== "object" || sp === null) {
    fail(line, "source_policy must be an object");
  }
  if (!Array.isArray(sp.preferred) || sp.preferred.length === 0) {
    fail(line, "source_policy.preferred must be a non-empty array");
  }
  if (!Array.isArray(sp.allowed) || sp.allowed.length === 0) {
    fail(line, "source_policy.allowed must be a non-empty array");
  }
  if (!Array.isArray(sp.disallowed)) {
    fail(line, "source_policy.disallowed must be an array");
  }
}

function validateClaim(claim, line, claimIdx) {
  const prefix = `claim[${claimIdx}]`;
  for (const f of CLAIM_REQUIRED) {
    if (claim[f] === undefined || claim[f] === null) {
      fail(line, `${prefix} missing required field: ${f}`);
    }
  }

  if (claim.claim_value !== "확인 필요") {
    fail(line, `${prefix} claim_value must be "확인 필요", got "${claim.claim_value}"`);
  }
  if (claim.confidence !== "low") {
    fail(line, `${prefix} confidence must be "low", got "${claim.confidence}"`);
  }
  if (claim.status !== "needs_review") {
    fail(line, `${prefix} status must be "needs_review", got "${claim.status}"`);
  }
  if (!Array.isArray(claim.sources) || claim.sources.length !== 0) {
    fail(line, `${prefix} sources must be an empty array`);
  }

  if (typeof claim.field_path !== "string" || claim.field_path.length === 0) {
    fail(line, `${prefix} field_path must be a non-empty string`);
  }
  if (typeof claim.claim_text !== "string" || claim.claim_text.length === 0) {
    fail(line, `${prefix} claim_text must be a non-empty string`);
  }
}

// ---------------------------------------------------------------------------
// Safety rules by type
// ---------------------------------------------------------------------------
function validateSafetyRules(entry, line) {
  const type = entry.type;
  const disclaimer = entry.disclaimer_type;

  if (type.startsWith("finance.markets")) {
    if (disclaimer !== "not_financial_advice") {
      fail(line, `type "${type}" requires disclaimer_type "not_financial_advice", got "${disclaimer}"`);
    }
  }

  if (type.startsWith("legal.")) {
    if (disclaimer !== "not_legal_advice") {
      fail(line, `type "${type}" requires disclaimer_type "not_legal_advice", got "${disclaimer}"`);
    }
  }

  const medicalPrefixes = ["health.", "medical.", "clinical_pathology.", "radiology."];
  if (medicalPrefixes.some((p) => type.startsWith(p))) {
    if (disclaimer !== "not_medical_advice" && disclaimer !== "check_official_source") {
      fail(line, `type "${type}" requires disclaimer_type "not_medical_advice" or "check_official_source", got "${disclaimer}"`);
    }
  }


  const genomicsPrefixes = ["genomics."];
  if (genomicsPrefixes.some((p) => type.startsWith(p))) {
    if (disclaimer !== "not_genetic_or_medical_advice") {
      fail(line, `type "${type}" requires disclaimer_type "not_genetic_or_medical_advice", got "${disclaimer}"`);
    }
    for (let i = 0; i < entry.claims.length; i++) {
      const text = (entry.claims[i].claim_text + " " + entry.claims[i].field_path).toLowerCase();
      const banned = [
        "personal_dna", "raw_genotype", "vcf", "individual_risk",
        "diagnosis", "treatment", "therapy_recommendation", "identifiable_genetic_data",
      ];
      for (const word of banned) {
        if (text.includes(word)) {
          fail(line, `claim[${i}] genomics topics must not include "${word}" topics`);
        }
      }
    }
  }

  if (type === "public_profile.people") {
    if (disclaimer !== "public_profile_only") {
      fail(line, `type "public_profile.people" requires disclaimer_type "public_profile_only", got "${disclaimer}"`);
    }
    for (let i = 0; i < entry.claims.length; i++) {
      const text = (entry.claims[i].claim_text + " " + entry.claims[i].field_path).toLowerCase();
      const banned = ["private", "rumor", "scandal", "religion", "political_affiliation", "medical_history", "family_detail"];
      for (const word of banned) {
        if (text.includes(word)) {
          fail(line, `claim[${i}] public_profile.people must not include "${word}" topics`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const content = readFileSync(file, "utf-8").trim();
const lines = content.split("\n");

const seenEntityIds = new Set();
const seenSlugs = new Set();

let passed = 0;

for (let i = 0; i < lines.length; i++) {
  const lineNum = i + 1;
  const raw = lines[i].trim();
  if (raw.length === 0) continue;

  let entry;
  try {
    entry = JSON.parse(raw);
  } catch (e) {
    fail(lineNum, `invalid JSON: ${e.message}`);
  }

  // Required entity fields
  for (const f of ENTITY_REQUIRED) {
    if (entry[f] === undefined || entry[f] === null) {
      fail(lineNum, `missing required field: ${f}`);
    }
  }

  // Enum validation
  if (!RISK_TIERS.has(entry.risk_tier)) {
    fail(lineNum, `invalid risk_tier: "${entry.risk_tier}"`);
  }
  if (!UPDATE_FREQUENCIES.has(entry.update_frequency)) {
    fail(lineNum, `invalid update_frequency: "${entry.update_frequency}"`);
  }
  if (!DISCLAIMER_TYPES.has(entry.disclaimer_type)) {
    fail(lineNum, `invalid disclaimer_type: "${entry.disclaimer_type}"`);
  }

  // String field validation
  if (typeof entry.entity_id !== "string" || entry.entity_id.length === 0) {
    fail(lineNum, "entity_id must be a non-empty string");
  }
  if (typeof entry.type !== "string" || entry.type.length === 0) {
    fail(lineNum, "type must be a non-empty string");
  }
  if (typeof entry.slug !== "string" || entry.slug.length === 0) {
    fail(lineNum, "slug must be a non-empty string");
  }
  if (typeof entry.lang !== "string" || entry.lang.length === 0) {
    fail(lineNum, "lang must be a non-empty string");
  }
  if (typeof entry.country !== "string" || entry.country.length === 0) {
    fail(lineNum, "country must be a non-empty string");
  }

  // Uniqueness checks
  if (seenEntityIds.has(entry.entity_id)) {
    fail(lineNum, `duplicate entity_id: "${entry.entity_id}"`);
  }
  seenEntityIds.add(entry.entity_id);

  if (seenSlugs.has(entry.slug)) {
    fail(lineNum, `duplicate slug: "${entry.slug}"`);
  }
  seenSlugs.add(entry.slug);

  // Source policy
  validateSourcePolicy(entry.source_policy, lineNum);

  // Claims
  if (!Array.isArray(entry.claims) || entry.claims.length === 0) {
    fail(lineNum, "claims must be a non-empty array");
  }
  for (let j = 0; j < entry.claims.length; j++) {
    validateClaim(entry.claims[j], lineNum, j);
  }

  // Safety rules
  validateSafetyRules(entry, lineNum);

  passed++;
}

console.log(`\n${passed}/${lines.length} topic candidates validated successfully.`);
process.exit(0);
