#!/usr/bin/env node
/**
 * Compare schema-v3.sql enum/check values with TypeScript union types.
 *
 * schema-v3.sql is the source of truth. When a database enum/check changes,
 * update the corresponding TypeScript union in lib/types.ts in the same PR.
 */
import { readFileSync } from "node:fs";

const SCHEMA_FILE = "schema-v3.sql";
const TYPES_FILE = "lib/types.ts";

const CHECKS = [
  { label: "claim status", schemaKind: "enum", schemaName: "claim_status", tsName: "ClaimStatus" },
  { label: "confidence level", schemaKind: "enum", schemaName: "confidence_level", tsName: "Confidence" },
  { label: "source type", schemaKind: "enum", schemaName: "source_type", tsName: "SourceType" },
  { label: "verification event type", schemaKind: "enum", schemaName: "verification_event_type", tsName: "VerificationEventType" },
  // Keep these explicit so CI documents the current source-of-truth state:
  // schema-v3.sql currently requires non-empty language/country text and allows
  // free-form claim jurisdictions. There is no closed enum/check list to mirror.
  { label: "locale/language", schemaKind: "none", schemaName: "documents.lang/listings.lang", tsName: null },
  { label: "country/jurisdiction", schemaKind: "none", schemaName: "entities.country/documents.country/claims.jurisdiction", tsName: null },
];

function quotedValues(input) {
  const values = [];
  for (const match of input.matchAll(/'((?:''|[^'])*)'/g)) {
    values.push(match[1].replaceAll("''", "'"));
  }
  for (const match of input.matchAll(/"((?:\\"|[^"])*)"/g)) {
    values.push(match[1].replaceAll('\\"', '"'));
  }
  return values;
}

function extractSchemaEnums(sql) {
  const enums = new Map();
  const re = /create\s+type\s+([a-zA-Z_][\w]*)\s+as\s+enum\s*\(([^;]+?)\)\s*;/gis;
  for (const match of sql.matchAll(re)) {
    enums.set(match[1], quotedValues(match[2]));
  }
  return enums;
}

function extractCheckConstraints(sql) {
  const checks = new Map();
  const re = /(?:constraint\s+([a-zA-Z_][\w]*)\s+)?check\s*\(([^;]*?\bin\s*\([^)]*'[^)]*\)[^;]*?)\)/gis;
  for (const match of sql.matchAll(re)) {
    const key = match[1] ?? `check:${checks.size + 1}`;
    checks.set(key, quotedValues(match[2]));
  }
  return checks;
}

function extractTsUnions(ts) {
  const unions = new Map();
  const re = /export\s+type\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]*?);/g;
  for (const match of ts.matchAll(re)) {
    const values = quotedValues(match[2]);
    if (values.length > 0) unions.set(match[1], values);
  }
  return unions;
}

function sorted(values) {
  return [...new Set(values)].sort();
}

function diff(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

const sql = readFileSync(SCHEMA_FILE, "utf-8");
const ts = readFileSync(TYPES_FILE, "utf-8");
const schemaEnums = extractSchemaEnums(sql);
const schemaChecks = extractCheckConstraints(sql);
const tsUnions = extractTsUnions(ts);

const failures = [];
const notes = [];

for (const check of CHECKS) {
  if (check.schemaKind === "none") {
    notes.push(`${check.label}: skipped (${check.schemaName} has no closed enum/check list in schema-v3.sql)`);
    continue;
  }

  const schemaValues = check.schemaKind === "enum"
    ? schemaEnums.get(check.schemaName)
    : schemaChecks.get(check.schemaName);
  const tsValues = tsUnions.get(check.tsName);

  if (!schemaValues) {
    failures.push(`${check.label}: schema values not found for ${check.schemaName}`);
    continue;
  }
  if (!tsValues) {
    failures.push(`${check.label}: TypeScript union not found for ${check.tsName}`);
    continue;
  }

  const schemaSorted = sorted(schemaValues);
  const tsSorted = sorted(tsValues);
  const missingInTs = diff(schemaSorted, tsSorted);
  const missingInSchema = diff(tsSorted, schemaSorted);

  if (missingInTs.length || missingInSchema.length) {
    failures.push([
      `${check.label}: ${check.schemaName} != ${check.tsName}`,
      missingInTs.length ? `  schema-only: ${missingInTs.join(", ")}` : null,
      missingInSchema.length ? `  TypeScript-only: ${missingInSchema.join(", ")}` : null,
    ].filter(Boolean).join("\n"));
  } else {
    notes.push(`${check.label}: ok (${schemaSorted.join(", ")})`);
  }
}

if (failures.length) {
  console.error("schema/type guard FAILED: schema-v3.sql and TypeScript union types diverged.");
  console.error("schema-v3.sql is the source of truth; update lib/types.ts or the schema intentionally.");
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("schema/type guard: ok");
for (const note of notes) console.log(`  ${note}`);
