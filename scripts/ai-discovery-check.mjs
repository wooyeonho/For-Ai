#!/usr/bin/env node

/**
 * GYEOL AI discovery endpoint checker.
 *
 * Checks whether static verified and Supabase-promoted document slugs expose the
 * core claim-level facts AI/search crawlers need across public discovery routes.
 *
 * Usage:
 *   node scripts/ai-discovery-check.mjs --static myungdong-laluce-parking --promoted promoted-slug
 *   node scripts/ai-discovery-check.mjs --static a,b --promoted c,d --base http://localhost:3000
 *   node scripts/ai-discovery-check.mjs --slugs a,b
 *
 * BASE_URL defaults to http://localhost:3000. Slug lists may be comma-separated
 * or repeated: --static a --static b.
 */

const DEFAULT_BASE_URL = "http://localhost:3000";
const UNKNOWN_TEXT = "확인 필요";
const ENDPOINTS = [
  (slug) => `/ko/wiki/${slug}`,
  (slug) => `/api/documents/${slug}`,
  (slug) => `/raw/${slug}.md`,
  (slug) => `/diagnostics/${slug}`,
];

function usage() {
  return `Usage: node scripts/ai-discovery-check.mjs [--base URL] [--static slug[,slug...]] [--promoted slug[,slug...]] [--slugs slug[,slug...]]\n\nOptions:\n  --base URL       Base URL to check (default: ${DEFAULT_BASE_URL})\n  --static LIST    Static verified document slugs\n  --promoted LIST  Supabase promoted document slugs\n  --slugs LIST     Additional slugs to check\n  --help           Show this help\n`;
}

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.BASE_URL || DEFAULT_BASE_URL,
    staticSlugs: [],
    promotedSlugs: [],
    extraSlugs: [],
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }

    const [key, inlineValue] = arg.split("=", 2);
    const value = inlineValue ?? argv[++i];
    if (!value) throw new Error(`Missing value for ${arg}`);

    if (key === "--base" || key === "--base-url") args.baseUrl = value;
    else if (key === "--static" || key === "--static-slugs") args.staticSlugs.push(...splitSlugs(value));
    else if (key === "--promoted" || key === "--promoted-slugs") args.promotedSlugs.push(...splitSlugs(value));
    else if (key === "--slugs") args.extraSlugs.push(...splitSlugs(value));
    else throw new Error(`Unknown option: ${arg}`);
  }

  args.baseUrl = args.baseUrl.replace(/\/+$/, "");
  return args;
}

function splitSlugs(value) {
  return value.split(",").map((slug) => slug.trim()).filter(Boolean);
}

function uniqueRows(staticSlugs, promotedSlugs, extraSlugs) {
  const rows = [];
  const seen = new Set();
  for (const [kind, slugs] of [["static", staticSlugs], ["promoted", promotedSlugs], ["slug", extraSlugs]]) {
    for (const slug of slugs) {
      const key = `${kind}:${slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ kind, slug });
    }
  }
  return rows;
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function validateJson(payload) {
  const document = payload?.document ?? {};
  const entity = payload?.entity ?? {};
  const claims = Array.isArray(payload?.claims) ? payload.claims : [];
  const verifiedClaims = claims.filter((claim) => claim?.status === "verified");
  const needsReviewClaims = claims.filter((claim) => claim?.status === "needs_review");

  return {
    title: hasText(document.title),
    entityId: hasText(document.entity_id) || hasText(entity.id),
    claim: claims.length > 0,
    confidence: hasText(document.confidence) && claims.every((claim) => hasText(claim?.confidence)),
    status: hasText(document.status) && claims.every((claim) => hasText(claim?.status)),
    sourcesCount: claims.every((claim) => Array.isArray(claim?.sources)),
    verifiedSourceUrl: verifiedClaims.every((claim) => claim.sources?.some((source) => hasUrl(source?.url))),
    needsReviewUnknown: needsReviewClaims.every((claim) => claim?.claim_value === UNKNOWN_TEXT || String(claim?.claim_text ?? "").includes(UNKNOWN_TEXT)),
    detail: `${claims.length} claims`,
  };
}

function validateText(text) {
  const hasVerified = /\bverified\b/.test(text);
  const hasNeedsReview = /\bneeds_review\b/.test(text);
  return {
    title: /<h1[^>]*>[^<]+<\/h1>/i.test(text) || /^#\s+\S+/m.test(text) || /"title"\s*:/.test(text),
    entityId: /entity_id/i.test(text),
    claim: /claim/i.test(text) || /확인 필요 항목/.test(text),
    confidence: /confidence/i.test(text),
    status: /status|state|verification status/i.test(text),
    sourcesCount: /sources?\s*[:(]\s*\d+|sources attached|source counts|"sources"\s*:/i.test(text),
    verifiedSourceUrl: !hasVerified || /https?:\/\//i.test(text),
    needsReviewUnknown: !hasNeedsReview || text.includes(UNKNOWN_TEXT),
    detail: `${text.length} bytes`,
  };
}

function summarize(checks) {
  const failed = Object.entries(checks)
    .filter(([key, value]) => key !== "detail" && !value)
    .map(([key]) => key);
  return { ok: failed.length === 0, failed };
}

async function checkEndpoint(baseUrl, kind, slug, route) {
  const url = `${baseUrl}${route}`;
  try {
    const res = await fetch(url, { redirect: "follow" });
    const contentType = res.headers.get("content-type") ?? "";
    const body = await res.text();
    let checks;

    if (res.ok && contentType.includes("application/json")) {
      checks = validateJson(JSON.parse(body));
    } else {
      checks = validateText(body);
    }

    const result = summarize(checks);
    if (!res.ok) result.failed.unshift(`http_${res.status}`);

    return {
      kind,
      slug,
      route,
      status: res.status,
      ok: res.ok && result.ok,
      failed: result.failed,
      detail: checks.detail,
    };
  } catch (error) {
    return { kind, slug, route, status: "ERR", ok: false, failed: [error.message], detail: "fetch failed" };
  }
}

function printTable(results) {
  const headers = ["Result", "Kind", "Slug", "Endpoint", "HTTP", "Detail", "Failed checks"];
  const rows = results.map((row) => [
    row.ok ? "PASS" : "FAIL",
    row.kind,
    row.slug,
    row.route,
    String(row.status),
    row.detail,
    row.failed.length ? row.failed.join(", ") : "-",
  ]);
  const widths = headers.map((header, i) => Math.max(header.length, ...rows.map((row) => row[i].length)));
  const line = (cells) => `| ${cells.map((cell, i) => cell.padEnd(widths[i])).join(" | ")} |`;

  console.log(line(headers));
  console.log(line(widths.map((width) => "-".repeat(width))));
  for (const row of rows) console.log(line(row));
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(usage());
  process.exit(0);
}

const slugRows = uniqueRows(args.staticSlugs, args.promotedSlugs, args.extraSlugs);
if (slugRows.length === 0) {
  console.error("No slugs provided.\n");
  console.error(usage());
  process.exit(1);
}

const results = [];
for (const { kind, slug } of slugRows) {
  for (const endpoint of ENDPOINTS) {
    const route = endpoint(slug);
    results.push(await checkEndpoint(args.baseUrl, kind, slug, route));
  }
}

printTable(results);
const passed = results.filter((row) => row.ok).length;
console.log(`\n${passed}/${results.length} endpoint checks passed`);
process.exit(passed === results.length ? 0 : 1);
