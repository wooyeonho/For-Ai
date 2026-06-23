#!/usr/bin/env node

/**
 * GYEOL AI discovery endpoint checker.
 *
 * Usage:
 *   node scripts/ai-discovery-check.mjs --static-verified slug-a,slug-b --supabase-promoted slug-c
 *   node scripts/ai-discovery-check.mjs --base-url http://localhost:3000 --static-verified-file ./slugs.txt
 *
 * Slug inputs accept comma-separated values or text/JSON files. Text files may use
 * commas, whitespace, or new lines. JSON files may be an array of slugs or an
 * object with `slugs`, `staticVerified`, `static_verified`, `supabasePromoted`,
 * or `supabase_promoted` arrays.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_BASE_URL = "http://localhost:3000";
const ENDPOINTS = [
  (slug) => `/ko/wiki/${slug}`,
  (slug) => `/api/documents/${slug}`,
  (slug) => `/raw/${slug}.md`,
  (slug) => `/diagnostics/${slug}`,
];

const CHECKS = [
  "title",
  "entity_id",
  "claim",
  "confidence",
  "status",
  "sources count",
  "verified source URL",
  "needs_review 확인 필요",
];

function printHelp() {
  console.log(`GYEOL AI discovery check\n\nUsage:\n  node scripts/ai-discovery-check.mjs [options]\n\nOptions:\n  --base-url <url>                 Base URL to check (default: ${DEFAULT_BASE_URL})\n  --static-verified <slugs>        Comma/space-separated static verified slugs\n  --static-verified-file <file>    File containing static verified slugs\n  --supabase-promoted <slugs>      Comma/space-separated Supabase promoted slugs\n  --supabase-promoted-file <file>  File containing Supabase promoted slugs\n  --help                           Show this help\n\nEnvironment fallbacks:\n  BASE_URL, STATIC_VERIFIED_SLUGS, SUPABASE_PROMOTED_SLUGS\n`);
}

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.BASE_URL || DEFAULT_BASE_URL,
    staticVerified: parseSlugList(process.env.STATIC_VERIFIED_SLUGS || ""),
    supabasePromoted: parseSlugList(process.env.SUPABASE_PROMOTED_SLUGS || ""),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--base-url") {
      args.baseUrl = readValue(argv, ++i, arg);
    } else if (arg === "--static-verified") {
      args.staticVerified.push(...parseSlugList(readValue(argv, ++i, arg)));
    } else if (arg === "--static-verified-file") {
      args.staticVerified.push(...readSlugFile(readValue(argv, ++i, arg), "static"));
    } else if (arg === "--supabase-promoted") {
      args.supabasePromoted.push(...parseSlugList(readValue(argv, ++i, arg)));
    } else if (arg === "--supabase-promoted-file") {
      args.supabasePromoted.push(...readSlugFile(readValue(argv, ++i, arg), "supabase"));
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  args.baseUrl = args.baseUrl.replace(/\/+$/, "");
  args.staticVerified = unique(args.staticVerified);
  args.supabasePromoted = unique(args.supabasePromoted);
  return args;
}

function readValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

function parseSlugList(value) {
  return String(value || "")
    .split(/[\s,]+/)
    .map((slug) => slug.trim())
    .filter(Boolean);
}

function readSlugFile(filePath, kind) {
  const absolute = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(absolute, "utf8");
  if (filePath.endsWith(".json")) {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
    const keys = kind === "static"
      ? ["staticVerified", "static_verified", "slugs"]
      : ["supabasePromoted", "supabase_promoted", "slugs"];
    for (const key of keys) {
      if (Array.isArray(parsed[key])) return parsed[key].map(String);
    }
    throw new Error(`${filePath} does not contain a supported slug array`);
  }
  return parseSlugList(raw);
}

function unique(values) {
  return [...new Set(values)];
}

function hasUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function checkJson(payload) {
  const claims = Array.isArray(payload?.claims) ? payload.claims : [];
  return {
    title: Boolean(payload?.document?.title),
    entity_id: Boolean(payload?.entity?.id || payload?.document?.entity_id),
    claim: claims.length > 0,
    confidence: Boolean(payload?.document?.confidence) && claims.every((claim) => Boolean(claim.confidence)),
    status: Boolean(payload?.document?.status) && claims.every((claim) => Boolean(claim.status)),
    "sources count": claims.every((claim) => Array.isArray(claim.sources)),
    "verified source URL": claims
      .filter((claim) => claim.status === "verified")
      .every((claim) => Array.isArray(claim.sources) && claim.sources.some((source) => hasUrl(source.url))),
    "needs_review 확인 필요": claims
      .filter((claim) => claim.status === "needs_review")
      .every((claim) => String(claim.claim_value ?? "").includes("확인 필요") || String(claim.claim_text ?? "").includes("확인 필요")),
  };
}

function checkText(text) {
  const hasVerified = /\bverified\b/i.test(text);
  const hasNeedsReview = /\bneeds_review\b/i.test(text);
  return {
    title: /<h1[\s>]/i.test(text) || /^#\s+\S+/m.test(text) || /"title"\s*:/i.test(text),
    entity_id: /entity_id/i.test(text),
    claim: /claim/i.test(text) || /확인 필요 항목/.test(text),
    confidence: /confidence|신뢰도/i.test(text),
    status: /status|state|verification status/i.test(text),
    "sources count": /sources\s*:\s*\d+|sources attached|source_count|출처/i.test(text),
    "verified source URL": !hasVerified || /https?:\/\//i.test(text),
    "needs_review 확인 필요": !hasNeedsReview || text.includes("확인 필요"),
  };
}

async function checkEndpoint(baseUrl, slug, group, route) {
  const endpoint = route(slug);
  const url = `${baseUrl}${endpoint}`;
  const result = { group, slug, endpoint, http: "FAIL", checks: Object.fromEntries(CHECKS.map((check) => [check, false])) };

  try {
    const res = await fetch(url, { redirect: "follow" });
    result.http = res.status === 200 ? "PASS" : `FAIL ${res.status}`;
    const contentType = res.headers.get("content-type") || "";
    const body = await res.text();
    if (res.status === 200) {
      result.checks = contentType.includes("application/json") ? checkJson(JSON.parse(body)) : checkText(body);
    }
  } catch (err) {
    result.http = `FAIL ${err.message}`;
  }

  return result;
}

function mark(pass) {
  return pass ? "PASS" : "FAIL";
}

function printTable(results) {
  const headers = ["group", "slug", "endpoint", "http", ...CHECKS];
  const rows = results.map((result) => [
    result.group,
    result.slug,
    result.endpoint,
    result.http,
    ...CHECKS.map((check) => mark(Boolean(result.checks[check]))),
  ]);
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => String(row[index]).length)));
  const line = (row) => row.map((cell, index) => String(cell).padEnd(widths[index])).join(" | ");
  console.log(line(headers));
  console.log(widths.map((width) => "-".repeat(width)).join("-|-"));
  rows.forEach((row) => console.log(line(row)));
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const slugGroups = [
  ...args.staticVerified.map((slug) => ({ group: "static verified", slug })),
  ...args.supabasePromoted.map((slug) => ({ group: "supabase promoted", slug })),
];

if (slugGroups.length === 0) {
  console.error("No slugs provided. Use --static-verified and/or --supabase-promoted.");
  printHelp();
  process.exit(1);
}

const results = [];
for (const { group, slug } of slugGroups) {
  for (const route of ENDPOINTS) {
    results.push(await checkEndpoint(args.baseUrl, slug, group, route));
  }
}

printTable(results);
const failures = results.filter((result) => result.http !== "PASS" || CHECKS.some((check) => !result.checks[check])).length;
console.log(`\n${results.length - failures}/${results.length} endpoints passed all checks`);
process.exit(failures > 0 ? 1 : 0);
