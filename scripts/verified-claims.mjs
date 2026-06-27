#!/usr/bin/env node

/**
 * verified-claims.mjs — file-based verified-claim production tooling.
 *
 * Makes the manual workflow (fetch official source -> fill claim -> verified
 * claims JSON) repeatable and safe. Four subcommands:
 *
 *   status              Show backlog vs citation-ready progress.
 *   scaffold <seed>     Generate a fillable verified-claims/<slug>.json skeleton
 *                       from a seed topic in data/verified-seed-set.json.
 *   apply <json-file>   Scaffold + fill claims from a pre-built JSON payload,
 *                       auto-wire into lib/verified-claims.ts, and validate.
 *                       Designed for AI-agent batch workflows.
 *   validate            Enforce For-Ai trust rules across every verified-claims
 *                       file. Exits non-zero on any violation (CI-ready).
 *
 * Trust rules enforced by `validate` (see AGENTS.md):
 *   - No fake facts: a claim_value of "확인 필요" can never be verified or above
 *     low confidence.
 *   - Verified requires proof: status "verified" needs a non-placeholder value,
 *     confidence medium/high, at least one source, and a verification_event.
 *   - Placeholders stay honest: status "needs_review" stays "확인 필요" / low.
 *   - Every data file must be wired into lib/verified-claims.ts (and vice
 *     versa), so filling a file actually reaches the live site.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const ROOT = process.cwd();
const CLAIMS_DIR = join(ROOT, "data", "verified-claims");
const SEED_PATH = join(ROOT, "data", "verified-seed-set.json");
const LOADER_PATH = join(ROOT, "lib", "verified-claims.ts");

const PLACEHOLDER = "확인 필요";
const VALID_STATUS = new Set(["verified", "needs_review"]);
const VALID_CONFIDENCE = new Set(["low", "medium", "high"]);
const VERIFIED_CONFIDENCE = new Set(["medium", "high"]);
const VALID_SOURCE_TYPE = new Set([
  "official", "law", "platform", "review", "user",
  "phone", "photo", "document", "web", "other", "unknown",
]);
const REQUIRED_TOP_FIELDS = [
  "entity_id", "slug", "type", "name", "lang", "country",
  "jurisdiction", "risk_tier", "update_frequency", "disclaimer_type", "claims",
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function listClaimFiles() {
  if (!existsSync(CLAIMS_DIR)) return [];
  return readdirSync(CLAIMS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => join(CLAIMS_DIR, f));
}

function isCitationReady(claim) {
  return claim.status === "verified" && claim.claim_value !== PLACEHOLDER;
}

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

function validateFile(path, errors, slugs, entityIds) {
  const rel = path.replace(`${ROOT}/`, "");
  let file;
  try {
    file = readJson(path);
  } catch (e) {
    errors.push(`${rel}: invalid JSON — ${e.message}`);
    return;
  }

  for (const field of REQUIRED_TOP_FIELDS) {
    if (file[field] === undefined || file[field] === null || file[field] === "") {
      errors.push(`${rel}: missing required top-level field "${field}"`);
    }
  }

  if (file.slug) {
    if (slugs.has(file.slug)) errors.push(`${rel}: duplicate slug "${file.slug}"`);
    slugs.add(file.slug);
  }
  if (file.entity_id) {
    if (entityIds.has(file.entity_id)) errors.push(`${rel}: duplicate entity_id "${file.entity_id}"`);
    entityIds.add(file.entity_id);
  }

  if (!Array.isArray(file.claims) || file.claims.length === 0) {
    errors.push(`${rel}: claims must be a non-empty array`);
    return;
  }

  const seenClaimIds = new Set();
  for (const [i, c] of file.claims.entries()) {
    const where = `${rel} claim[${i}] (${c.claim_id ?? "no-id"})`;

    if (!c.claim_id) errors.push(`${where}: missing claim_id`);
    else if (seenClaimIds.has(c.claim_id)) errors.push(`${where}: duplicate claim_id`);
    else seenClaimIds.add(c.claim_id);

    if (!c.field_path) errors.push(`${where}: missing field_path`);
    if (!c.claim_text) errors.push(`${where}: missing claim_text`);
    if (c.claim_value === undefined || c.claim_value === "") errors.push(`${where}: missing claim_value`);

    if (!VALID_STATUS.has(c.status)) errors.push(`${where}: invalid status "${c.status}"`);
    if (!VALID_CONFIDENCE.has(c.confidence)) errors.push(`${where}: invalid confidence "${c.confidence}"`);

    // No fake facts: a placeholder value can never be verified or above low.
    if (c.claim_value === PLACEHOLDER) {
      if (c.status === "verified") errors.push(`${where}: placeholder value marked verified (no fake facts)`);
      if (c.confidence !== "low") errors.push(`${where}: placeholder value must stay confidence:low`);
    }

    if (c.status === "verified") {
      if (c.claim_value === PLACEHOLDER) {
        errors.push(`${where}: verified claim must have a real value, not "${PLACEHOLDER}"`);
      }
      if (!VERIFIED_CONFIDENCE.has(c.confidence)) {
        errors.push(`${where}: verified claim must be confidence medium/high (got "${c.confidence}")`);
      }
      const sources = Array.isArray(c.sources) ? c.sources : [];
      if (sources.length === 0) {
        errors.push(`${where}: verified claim must have at least one source`);
      }
      for (const [j, s] of sources.entries()) {
        if (!VALID_SOURCE_TYPE.has(s.source_type)) errors.push(`${where} source[${j}]: invalid source_type "${s.source_type}"`);
        if (!s.url && !s.title) errors.push(`${where} source[${j}]: needs a url or title`);
        if (!s.observed_at) errors.push(`${where} source[${j}]: needs observed_at`);
      }
      const ve = c.verification_event;
      if (!ve) errors.push(`${where}: verified claim must have a verification_event`);
      else {
        if (!ve.verified_at) errors.push(`${where}: verification_event needs verified_at`);
        if (!ve.note) errors.push(`${where}: verification_event needs a note`);
      }
    } else {
      // needs_review placeholders must stay honest.
      if (c.claim_value !== PLACEHOLDER) {
        errors.push(`${where}: needs_review claim should keep value "${PLACEHOLDER}" until verified (got "${c.claim_value}")`);
      }
      if (c.confidence !== "low") {
        errors.push(`${where}: needs_review claim must be confidence:low`);
      }
    }
  }
}

function checkLoaderWiring(files, errors) {
  if (!existsSync(LOADER_PATH)) {
    errors.push(`lib/verified-claims.ts not found — cannot check wiring`);
    return;
  }
  const loader = readFileSync(LOADER_PATH, "utf8");
  const importedBasenames = [...loader.matchAll(/data\/verified-claims\/([\w.-]+\.json)/g)].map((m) => m[1]);
  const importedSet = new Set(importedBasenames);
  for (const path of files) {
    const b = basename(path);
    if (!importedSet.has(b)) {
      errors.push(`data/verified-claims/${b}: not imported in lib/verified-claims.ts — claims will NOT reach the live site`);
    }
  }
  for (const b of importedSet) {
    if (!existsSync(join(CLAIMS_DIR, b))) {
      errors.push(`lib/verified-claims.ts imports data/verified-claims/${b} which does not exist`);
    }
  }
}

function cmdValidate() {
  const files = listClaimFiles();
  const errors = [];
  const slugs = new Set();
  const entityIds = new Set();
  for (const path of files) validateFile(path, errors, slugs, entityIds);
  checkLoaderWiring(files, errors);

  if (errors.length > 0) {
    console.error(`verified-claims validate: ${errors.length} violation(s)\n`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  let ready = 0;
  let total = 0;
  for (const path of files) {
    const f = readJson(path);
    for (const c of f.claims) {
      total++;
      if (isCitationReady(c)) ready++;
    }
  }
  console.log(`verified-claims validate: ok — ${files.length} files, ${total} claims, ${ready} citation-ready`);
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

function cmdStatus() {
  const files = listClaimFiles();
  const byCountry = {};
  let totalClaims = 0;
  let ready = 0;
  const inProgress = [];
  for (const path of files) {
    const f = readJson(path);
    const country = f.country ?? "?";
    byCountry[country] = byCountry[country] ?? { files: 0, ready: 0 };
    byCountry[country].files++;
    let fileReady = 0;
    for (const c of f.claims) {
      totalClaims++;
      if (isCitationReady(c)) { ready++; fileReady++; byCountry[country].ready++; }
    }
    if (fileReady < f.claims.length) {
      inProgress.push(`${f.slug} (${fileReady}/${f.claims.length} ready, ${f.country})`);
    }
  }

  const seedSlugs = new Set();
  let seedTopics = 0;
  let seedClaims = 0;
  if (existsSync(SEED_PATH)) {
    const seed = readJson(SEED_PATH);
    seedTopics = seed.length;
    for (const t of seed) {
      seedSlugs.add(t.slug);
      seedClaims += (t.claims ?? []).length;
    }
  }
  const startedSlugs = new Set(files.map((p) => readJson(p).slug));
  const notStarted = [...seedSlugs].filter((s) => !startedSlugs.has(s));

  console.log("=== For-Ai verified-claims status ===\n");
  console.log(`citation-ready claims : ${ready} / ${totalClaims} across ${files.length} files`);
  console.log(`seed backlog          : ${seedTopics} topics / ${seedClaims} placeholder claims`);
  console.log(`\nby country:`);
  for (const [c, v] of Object.entries(byCountry).sort()) {
    console.log(`  ${c.padEnd(4)} ${v.files} files, ${v.ready} citation-ready claims`);
  }
  if (inProgress.length > 0) {
    console.log(`\nin progress (files with placeholders left):`);
    for (const s of inProgress) console.log(`  - ${s}`);
  }
  if (notStarted.length > 0) {
    console.log(`\nbacklog not started (seed topics with no verified-claims file): ${notStarted.length}`);
    for (const s of notStarted.slice(0, 20)) console.log(`  - ${s}`);
    if (notStarted.length > 20) console.log(`  ... and ${notStarted.length - 20} more`);
    console.log(`\nscaffold the next one with:  npm run claims:scaffold -- <seed-slug>`);
  }
}

// ---------------------------------------------------------------------------
// scaffold
// ---------------------------------------------------------------------------

function slugToEntityId(country, type, slug) {
  const c = (country ?? "xx").toLowerCase();
  const domain = (type ?? "topic").split(".")[0];
  return `${c}-${domain}-${slug}-001`;
}

function cmdScaffold(args) {
  const seedSlug = args[0];
  if (!seedSlug) {
    console.error("usage: npm run claims:scaffold -- <seed-slug> [--country XX] [--lang ko|en] [--force]");
    process.exit(1);
  }
  const opts = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--force") opts.force = true;
    else if (args[i].startsWith("--")) { opts[args[i].slice(2)] = args[i + 1]; i++; }
  }

  if (!existsSync(SEED_PATH)) {
    console.error(`seed file not found: ${SEED_PATH}`);
    process.exit(1);
  }
  const seed = readJson(SEED_PATH);
  const topic = seed.find((t) => t.slug === seedSlug);
  if (!topic) {
    console.error(`seed topic "${seedSlug}" not found in verified-seed-set.json`);
    process.exit(1);
  }

  const country = opts.country ?? topic.country ?? "XX";
  const lang = opts.lang ?? topic.lang ?? (country === "KR" ? "ko" : "en");
  const type = topic.category ?? "topic.unknown";
  const entityId = topic.entity_id ?? slugToEntityId(country, type, seedSlug);

  const claims = (topic.claims ?? []).map((c) => ({
    claim_id: `${seedSlug}-${String(c.field_path ?? "field").replace(/\./g, "-")}`,
    field_path: c.field_path ?? "unknown.field",
    claim_text: c.question ?? c.claim_text ?? c.field_path ?? "",
    claim_value: PLACEHOLDER,
    confidence: "low",
    status: "needs_review",
    last_verified_at: null,
    sources: [],
    verification_event: null,
  }));

  const out = {
    entity_id: entityId,
    slug: seedSlug,
    type,
    name: topic.title ?? seedSlug,
    lang,
    country,
    jurisdiction: opts.jurisdiction ?? country,
    risk_tier: topic.risk_tier ?? "low",
    update_frequency: topic.update_frequency ?? "event_based",
    disclaimer_type: topic.disclaimer_type ?? "check_official_source",
    last_verified_at: null,
    claims,
  };

  const outPath = join(CLAIMS_DIR, `${seedSlug}.json`);
  if (existsSync(outPath) && !opts.force) {
    console.error(`refusing to overwrite existing ${outPath} (use --force)`);
    process.exit(1);
  }
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");

  console.log(`scaffolded ${outPath} with ${claims.length} placeholder claim(s).\n`);
  console.log("Next steps:");
  console.log("  1. Fetch the OFFICIAL source and fill each claim_value (never guess).");
  console.log("  2. For verified claims: set status:verified, confidence:medium|high,");
  console.log("     add sources[] (source_type/title/url/observed_at/note) and a verification_event.");
  console.log("  3. Wire it into lib/verified-claims.ts — add an import and append to verifiedFiles:");
  const camel = seedSlug.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase()).replace(/[^a-zA-Z0-9]/g, "");
  console.log(`       import ${camel} from "../data/verified-claims/${seedSlug}.json";`);
  console.log(`       // then add: ${camel} as unknown as VerifiedClaimFile,`);
  console.log("  4. Run: npm run claims:validate");
}

// ---------------------------------------------------------------------------
// apply — one-shot: scaffold + fill + wire + validate
// ---------------------------------------------------------------------------

function slugToCamelCase(slug) {
  return slug.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase()).replace(/[^a-zA-Z0-9]/g, "");
}

function wireLoaderImport(slug) {
  if (!existsSync(LOADER_PATH)) {
    console.error(`lib/verified-claims.ts not found — cannot auto-wire`);
    return false;
  }
  const loader = readFileSync(LOADER_PATH, "utf8");
  const jsonFile = `${slug}.json`;

  if (loader.includes(`verified-claims/${jsonFile}`)) {
    return true; // already wired
  }

  const camel = slugToCamelCase(slug);
  const importLine = `import ${camel} from "../data/verified-claims/${jsonFile}";`;
  const arrayEntry = `  ${camel} as unknown as VerifiedClaimFile,`;

  // Insert import after the last existing import from verified-claims
  const importRegex = /^import .+ from "\.\.\/(data\/verified-claims\/[\w.-]+\.json)";$/gm;
  let lastImportEnd = 0;
  let match;
  while ((match = importRegex.exec(loader)) !== null) {
    lastImportEnd = match.index + match[0].length;
  }
  if (lastImportEnd === 0) {
    console.error(`Could not find existing verified-claims imports in lib/verified-claims.ts`);
    return false;
  }

  let updated = loader.slice(0, lastImportEnd) + "\n" + importLine + loader.slice(lastImportEnd);

  // Insert into verifiedFiles array — before the closing ];
  const arrayCloseRegex = /^(const verifiedFiles[^;]*\[\n(?:.*\n)*?)(\];)/m;
  const arrayMatch = arrayCloseRegex.exec(updated);
  if (arrayMatch) {
    const insertPos = arrayMatch.index + arrayMatch[1].length;
    updated = updated.slice(0, insertPos) + arrayEntry + "\n" + updated.slice(insertPos);
  } else {
    // Fallback: find the last entry in the array and insert after it
    const lastEntryRegex = /( +\w+ as unknown as VerifiedClaimFile,\n)/g;
    let lastEntry;
    while ((match = lastEntryRegex.exec(updated)) !== null) {
      lastEntry = match;
    }
    if (lastEntry) {
      const insertPos = lastEntry.index + lastEntry[0].length;
      updated = updated.slice(0, insertPos) + arrayEntry + "\n" + updated.slice(insertPos);
    } else {
      console.error(`Could not find verifiedFiles array in lib/verified-claims.ts`);
      return false;
    }
  }

  writeFileSync(LOADER_PATH, updated, "utf8");
  return true;
}

function cmdApply(args) {
  const inputPath = args[0];
  if (!inputPath) {
    console.error("usage: npm run claims:apply -- <payload.json>");
    console.error("");
    console.error("payload.json format:");
    console.error(JSON.stringify({
      slug: "metro-transfer-time-limit",
      name: "Optional display name override",
      country: "KR",
      lang: "ko",
      last_verified_at: "2026-06-28",
      claims: [{
        field_path: "transfer.time_limit_minutes",
        claim_value: "30분",
        confidence: "high",
        claim_text: "Optional override for claim question text",
        sources: [{
          source_type: "official",
          title: "Source page title",
          url: "https://example.gov/page",
          observed_at: "2026-06-28",
          note: "How the value was confirmed"
        }],
        verification_event: {
          note: "Verification context"
        }
      }]
    }, null, 2));
    process.exit(1);
  }

  let payload;
  try {
    payload = readJson(inputPath);
  } catch (e) {
    console.error(`Failed to read payload: ${e.message}`);
    process.exit(1);
  }

  const slug = payload.slug;
  if (!slug) {
    console.error("payload must have a 'slug' field");
    process.exit(1);
  }
  if (!Array.isArray(payload.claims) || payload.claims.length === 0) {
    console.error("payload must have a non-empty 'claims' array");
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const verifiedAt = payload.last_verified_at ?? today;

  // Look up seed topic for metadata defaults
  let seedTopic = null;
  if (existsSync(SEED_PATH)) {
    const seeds = readJson(SEED_PATH);
    seedTopic = seeds.find((t) => t.slug === slug);
  }

  const country = payload.country ?? seedTopic?.country ?? "XX";
  const lang = payload.lang ?? seedTopic?.lang ?? (country === "KR" ? "ko" : "en");
  const type = payload.type ?? seedTopic?.category ?? "topic.unknown";
  const entityId = payload.entity_id ?? seedTopic?.entity_id ?? slugToEntityId(country, type, slug);
  const name = payload.name ?? seedTopic?.title ?? slug;
  const riskTier = payload.risk_tier ?? seedTopic?.risk_tier ?? "low";
  const updateFrequency = payload.update_frequency ?? seedTopic?.update_frequency ?? "event_based";
  const disclaimerType = payload.disclaimer_type ?? seedTopic?.disclaimer_type ?? "check_official_source";

  // Build seed claim lookup for merging (match by field_path)
  const seedClaimMap = new Map();
  if (seedTopic?.claims) {
    for (const sc of seedTopic.claims) {
      seedClaimMap.set(sc.field_path, sc);
    }
  }

  // Build claims array
  const filledClaims = payload.claims.map((pc) => {
    const seedClaim = seedClaimMap.get(pc.field_path);
    const claimId = pc.claim_id ?? `${slug}-${String(pc.field_path ?? "field").replace(/\./g, "-")}`;
    const claimText = pc.claim_text ?? seedClaim?.question ?? seedClaim?.claim_text ?? pc.field_path;
    const confidence = pc.confidence ?? "high";
    const status = pc.claim_value && pc.claim_value !== PLACEHOLDER ? "verified" : "needs_review";
    const claimVerifiedAt = pc.last_verified_at ?? verifiedAt;

    const sources = (pc.sources ?? []).map((s) => ({
      source_type: s.source_type ?? "official",
      title: s.title ?? "",
      url: s.url ?? "",
      observed_at: s.observed_at ?? claimVerifiedAt,
      note: s.note ?? "",
    }));

    const verificationEvent = status === "verified" && sources.length > 0
      ? {
          event_type: "source_verified",
          actor: pc.verification_event?.actor ?? "ai-source-fetch",
          verified_at: claimVerifiedAt,
          note: pc.verification_event?.note ?? `공식 출처에서 직접 확인. ${claimVerifiedAt} 기준. 최종 사람 승인 대기.`,
        }
      : null;

    return {
      claim_id: claimId,
      field_path: pc.field_path,
      claim_text: claimText,
      claim_value: pc.claim_value ?? PLACEHOLDER,
      confidence: status === "verified" ? confidence : "low",
      status,
      last_verified_at: status === "verified" ? claimVerifiedAt : null,
      sources,
      verification_event: verificationEvent,
    };
  });

  const outFile = {
    entity_id: entityId,
    slug,
    type,
    name,
    lang,
    country,
    jurisdiction: payload.jurisdiction ?? country,
    risk_tier: riskTier,
    update_frequency: updateFrequency,
    disclaimer_type: disclaimerType,
    last_verified_at: filledClaims.some((c) => c.status === "verified") ? verifiedAt : null,
    claims: filledClaims,
  };

  // Write the file
  const outPath = join(CLAIMS_DIR, `${slug}.json`);
  const isNew = !existsSync(outPath);
  writeFileSync(outPath, `${JSON.stringify(outFile, null, 2)}\n`, "utf8");
  console.log(`${isNew ? "created" : "updated"} ${outPath}`);
  console.log(`  claims: ${filledClaims.length}, verified: ${filledClaims.filter((c) => c.status === "verified").length}`);

  // Auto-wire into loader
  const wired = wireLoaderImport(slug);
  if (wired) {
    console.log(`  wired into lib/verified-claims.ts`);
  } else {
    console.error(`  ⚠ could not auto-wire — manual wiring needed`);
  }

  // Run validate
  console.log("\nrunning validate...\n");
  try {
    cmdValidate();
  } catch {
    // cmdValidate calls process.exit on failure, which is fine
  }
}

// ---------------------------------------------------------------------------

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "validate": return cmdValidate();
    case "status": return cmdStatus();
    case "scaffold": return cmdScaffold(rest);
    case "apply": return cmdApply(rest);
    default:
      console.error("usage: node scripts/verified-claims.mjs <status|scaffold|apply|validate>");
      process.exit(1);
  }
}

main();
