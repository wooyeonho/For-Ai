#!/usr/bin/env node
/**
 * For-Ai CI guard rails.
 *
 * Usage:
 *   node scripts/ci-guards.mjs <guard>
 *
 * Guards:
 *   route      - fail if a stale `/api/document` (singular) path appears in app/ or lib/.
 *   mojibake   - fail if UTF-8-as-Latin-1 mojibake appears in app/ or lib/.
 *   api-docs   - fail if API docs GET/POST endpoints drift from public app/api routes.
 *   artifacts  - fail if build/dependency output or oversized generated dumps are committed.
 *   claims     - fail if any verified-claims file violates the trust rules (delegates to verified-claims.mjs validate).
 *   surfaces   - fail if citation surfaces drift from the normalized claim-level contract.
 *   schema-types - fail if schema-v3.sql enum/check values diverge from TypeScript unions.
 *   diff-size  - fail if a PR changes an unexpected number of files (full-repo-rewrite guard).
 *   db-privileges - fail if the production least-privilege contract disappears from schema-v3.sql.
 *   secrets    - fail if Supabase service-role secrets leak into client or non-route mutation code.
 *   no-stub-storage - fail if public production routes can return stub storage responses.
 *   all        - run route + api-docs + mojibake + artifacts + claims + secrets + no-stub-storage + surfaces + schema-types + db-privileges (and diff-size when a base SHA is available).
 *
 * Exit code 0 = pass, 1 = a guard failed, 2 = usage/internal error.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, relative, sep } from "node:path";

// --- configuration ---------------------------------------------------------

const SCAN_ROOTS = ["app", "lib"];
const API_DOCS_PAGE = "app/api-docs/page.tsx";
const API_ROUTES_ROOT = "app/api";
const DOC_CHECK_METHODS = new Set(["GET", "POST"]);
const PROTECTED_API_PREFIXES = ["/api/admin/"];
const PROTECTED_API_ENDPOINTS = new Set([
  "GET /api/business/alerts",
  "POST /api/business/alerts",
  "GET /api/business/corrections",
  "GET /api/keys",
  "POST /api/keys",
  "GET /api/webhooks",
  "POST /api/webhooks",
]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".md", ".json"]);
const API_ROUTE_RE = /^app\/api\/.+\/route\.(ts|tsx|js|jsx|mjs)$/;
const SERVER_SECRET_MODULES = new Set([
  "@/lib/supabase-server",
  "../../../../lib/supabase-server",
  "../../../lib/supabase-server",
  "../../lib/supabase-server",
  "../lib/supabase-server",
  "./supabase-server",
  "@/lib/admin-api",
]);
const SERVICE_ROLE_FACTORY_FILES = new Set(["lib/supabase-server.ts"]);
const SERVICE_ROLE_ACCESS_FILES = new Set(["lib/supabase-server.ts"]);
const SERVER_SECRET_HELPER_FILES = new Set(["lib/supabase-server.ts", "lib/admin-api.ts", "lib/rate-limit-store.ts"]);
// Read-only data helpers for server components: allowed to import the server
// client factory, but any insert/update/upsert/delete inside them still fails.
const READ_ONLY_SERVICE_HELPER_FILES = new Set([
  "lib/contributor-receipt.ts",
  "lib/leaderboard-data.ts",
  "lib/sponsored-placements.ts",
]);
const MUTATION_METHOD_RE = /\.(insert|update|upsert|delete)\s*\(/;
const SERVICE_ROLE_NAME_RE = /\b(SUPABASE_SERVICE_ROLE_KEY|serviceKey|serviceRoleKey|createServiceRoleClient|createServerClient|supabaseAdmin)\b/;


// Legitimate non-ASCII characters in the U+0080-U+00FF range. Everything else
// in that range is treated as mojibake. Add here only after a conscious review.
//   U+00B7 MIDDLE DOT  (·)  used as a separator in headings/admin labels
//   U+00D7 MULTIPLICATION SIGN (×) used in seed-data dimensions
//   U+00A9 COPYRIGHT SIGN (©) used in the site footer
//   U+00A3 POUND SIGN (£) and U+00A5 YEN SIGN (¥) used in lib/check/similarity.ts's CURRENCY_SYMBOLS
const MOJIBAKE_ALLOWLIST = new Set(["·", "×", "©", "\u00a3", "\u00a5", "ñ", "é", "á", "í", "ó", "ú", "ü", "Ñ", "É", "Á", "Í", "Ó", "Ú", "Ü", "¡", "¿", "Î", "î", "ê", "û", "ô", "\u00e2", "ë", "ï", "ç", "à", "è", "ù"]);

// A full-repo-rewrite PR touches most of the tree. The repo currently tracks
// ~67 files, so a legitimate scoped change stays well under this limit. Override
// for an intentional large change by putting [large-diff-ok] in the HEAD commit
// message.
const MAX_CHANGED_FILES = 40;
const LARGE_DIFF_OVERRIDE = "[large-diff-ok]";

// Generated data dumps must not be committed wholesale (keep small samples only).
const DUMP_EXTENSIONS = new Set([".jsonl", ".ndjson", ".csv"]);
const DUMP_MAX_LINES = 2000;
const DUMP_MAX_BYTES = 1_000_000;

// Paths whose deletion is a strong signal of an accidental rewrite.
const CORE_PREFIXES = ["app/", "lib/", "scripts/"];
const CORE_FILES = ["schema-v3.sql", "AGENTS.md", "package.json"];

// --- helpers ---------------------------------------------------------------

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (SOURCE_EXTENSIONS.has(extname(entry.name))) out.push(p);
  }
  return out;
}

function sourceFiles() {
  return SCAN_ROOTS.flatMap((root) => walk(root));
}


function normalizePath(file) {
  return file.replace(/\\/g, "/");
}

function isApiRoute(file) {
  return API_ROUTE_RE.test(normalizePath(file));
}

function isUseClientSource(text) {
  const withoutBom = text.replace(/^\uFEFF/, "").trimStart();
  return /^(?:"use client"|'use client')\s*;/.test(withoutBom);
}

function importedModules(text) {
  const modules = [];
  const importRe = /import(?:\s+type)?(?:[\s\S]*?from\s*)?["']([^"']+)["']/g;
  let match;
  while ((match = importRe.exec(text))) modules.push(match[1]);
  return modules;
}

function linesWith(text, predicate) {
  const hits = [];
  text.split("\n").forEach((line, i) => {
    if (predicate(line)) hits.push(`${i + 1}: ${line.trim()}`);
  });
  return hits;
}

function normalizeApiPath(path) {
  return path
    .replace(/<span[^>]*>\{\s*"\{([^}]+)\}"\s*\}<\/span>/g, "{$1}")
    .replace(/<[^>]+>/g, "")
    .replace(/\{([A-Za-z0-9_ -]+)\}/g, (_, name) => `:${name.trim().replace(/\s+/g, "-")}`)
    .replace(/\[([A-Za-z0-9_ -]+)\]/g, (_, name) => `:${name.trim().replace(/\s+/g, "-")}`)
    .replace(/:[A-Za-z0-9_-]+/g, ":param")
    .replace(/\?.*$/, "")
    .replace(/\/+$/, "");
}

function deriveApiRoutePath(file) {
  const routeDir = relative(API_ROUTES_ROOT, file).split(sep).slice(0, -1);
  return normalizeApiPath(`/api/${routeDir.join("/")}`);
}

function routeMethods(file) {
  const text = readFileSync(file, "utf-8");
  const methods = [];
  const re = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  let match;
  while ((match = re.exec(text))) methods.push(match[1]);
  return methods;
}

function documentedApiEndpoints() {
  const text = readFileSync(API_DOCS_PAGE, "utf-8")
    .replace(/<span[^>]*>\{\s*"\{([^}]+)\}"\s*\}<\/span>/g, "{$1}")
    .replace(/<[^>]+>/g, "");
  const endpoints = new Set();
  const re = /\b(GET|POST)\s+(\/api\/[^\s`"'<)]+)/g;
  let match;
  while ((match = re.exec(text))) {
    const method = match[1];
    const path = normalizeApiPath(match[2]);
    endpoints.add(`${method} ${path}`);
  }
  return endpoints;
}

function actualApiEndpoints() {
  const endpoints = new Set();
  for (const file of walk(API_ROUTES_ROOT)) {
    if (!file.endsWith(`${sep}route.ts`) && !file.endsWith("/route.ts")) continue;
    const path = deriveApiRoutePath(file);
    for (const method of routeMethods(file)) {
      if (DOC_CHECK_METHODS.has(method)) endpoints.add(`${method} ${path}`);
    }
  }
  return endpoints;
}

function isProtectedEndpoint(endpoint) {
  const [, path] = endpoint.split(" ");
  return PROTECTED_API_PREFIXES.some((prefix) => path.startsWith(prefix)) || PROTECTED_API_ENDPOINTS.has(endpoint);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf-8" }).trim();
}

function fail(messages) {
  console.error(messages.join("\n"));
  process.exit(1);
}

// --- guards ----------------------------------------------------------------

function guardRoute() {
  const re = /\/api\/document(?!s)/g;
  const hits = [];
  for (const file of sourceFiles()) {
    const lines = readFileSync(file, "utf-8").split("\n");
    lines.forEach((line, i) => {
      if (re.test(line)) hits.push(`  ${file}:${i + 1}: ${line.trim()}`);
      re.lastIndex = 0;
    });
  }
  if (hits.length) {
    fail([
      `route guard FAILED: stale "/api/document" (singular) path found. Use "/api/documents".`,
      ...hits,
    ]);
  }
  console.log("route guard: ok");
}

function guardApiDocsRoutes() {
  const documented = documentedApiEndpoints();
  const actual = actualApiEndpoints();
  const publicActual = new Set([...actual].filter((endpoint) => !isProtectedEndpoint(endpoint)));

  const docsWithoutRoutes = [...documented]
    .filter((endpoint) => !actual.has(endpoint))
    .sort();
  const publicRoutesWithoutDocs = [...publicActual]
    .filter((endpoint) => !documented.has(endpoint))
    .sort();

  if (docsWithoutRoutes.length || publicRoutesWithoutDocs.length) {
    fail([
      "api-docs route guard FAILED: API docs endpoints must match implemented public routes.",
      ...(docsWithoutRoutes.length
        ? ["", "Documented in app/api-docs/page.tsx but no matching app/api/**/route.ts exists:", ...docsWithoutRoutes.map((e) => `  - ${e}`)]
        : []),
      ...(publicRoutesWithoutDocs.length
        ? ["", "Implemented public app/api/**/route.ts endpoint but missing from app/api-docs/page.tsx:", ...publicRoutesWithoutDocs.map((e) => `  - ${e}`)]
        : []),
    ]);
  }
  console.log("api-docs route guard: ok");
}

function guardMojibake() {
  const hits = [];
  for (const file of sourceFiles()) {
    const lines = readFileSync(file, "utf-8").split("\n");
    lines.forEach((line, i) => {
      for (const ch of line) {
        const code = ch.codePointAt(0);
        if (code >= 0x80 && code <= 0xff && !MOJIBAKE_ALLOWLIST.has(ch)) {
          hits.push(`  ${file}:${i + 1}: U+${code.toString(16).toUpperCase().padStart(4, "0")} in: ${line.trim()}`);
          break;
        }
      }
    });
  }
  if (hits.length) {
    fail([
      `mojibake guard FAILED: broken-encoding characters found in app/ or lib/.`,
      // The mojibake example below is written with \u escapes so this file's
      // own source never contains raw mojibake bytes (check:mojibake self-match).
      `(Korean text must be real UTF-8, e.g. "확인 필요", not "\u00ed\u00ec\u00b8 \u00ed\u00ec".)`,
      ...hits,
    ]);
  }
  console.log("mojibake guard: ok");
}

function guardArtifacts() {
  const tracked = git(["ls-files"]).split("\n").filter(Boolean);
  const hits = [];

  for (const file of tracked) {
    if (file.startsWith(".next/") || file.includes("/.next/")) {
      hits.push(`  build output committed: ${file}`);
    }
    if (file.startsWith("node_modules/") || file.includes("/node_modules/")) {
      hits.push(`  dependencies committed: ${file}`);
    }
    if (DUMP_EXTENSIONS.has(extname(file))) {
      let bytes = 0;
      let lineCount = 0;
      try {
        bytes = statSync(file).size;
        lineCount = readFileSync(file, "utf-8").split("\n").filter(Boolean).length;
      } catch {
        /* ignore unreadable */
      }
      if (bytes > DUMP_MAX_BYTES || lineCount > DUMP_MAX_LINES) {
        hits.push(
          `  oversized generated dump: ${file} (${bytes} bytes, ${lineCount} lines; ` +
            `limit ${DUMP_MAX_BYTES} bytes / ${DUMP_MAX_LINES} lines). ` +
            `Keep only a small sample in git; store full sets in the DB/object storage.`,
        );
      }
    }
  }

  if (hits.length) {
    fail([`artifact guard FAILED:`, ...hits]);
  }
  console.log("artifact guard: ok");
}

function guardClaims() {
  try {
    const out = execFileSync("node", ["scripts/verified-claims.mjs", "validate"], { encoding: "utf-8" });
    process.stdout.write(`${out.trim()}\n`);
    console.log("claims guard: ok");
  } catch (e) {
    const detail = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim();
    fail([`claims guard FAILED: verified-claims trust rules violated.`, detail]);
  }
}

function guardSurfaces() {
  try {
    const out = execFileSync("node", ["scripts/check-citation-surfaces.mjs"], { encoding: "utf-8" });
    process.stdout.write(`${out.trim()}\n`);
  } catch (e) {
    const detail = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim();
    fail([`citation surfaces guard FAILED:`, detail]);
  }
}

function guardSchemaTypes() {
  try {
    const out = execFileSync("node", ["scripts/check-schema-types.mjs"], { encoding: "utf-8" });
    process.stdout.write(`${out.trim()}\n`);
  } catch (e) {
    const detail = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim();
    fail([`schema-types guard FAILED: schema-v3.sql and TypeScript unions diverged.`, detail]);
  }
}

function guardDatabasePrivileges() {
  const schema = readFileSync("schema-v3.sql", "utf-8");
  const required = [
    {
      label: "internal rate-limit RPC must exclude browser roles",
      pattern: /revoke execute on function public\.increment_rate_limit\(text, text, integer, bigint\)[\s\S]*?from public, anon, authenticated;/i,
    },
    {
      label: "Task 5 phase RPC must exclude browser roles",
      pattern: /revoke execute on function public\.set_task5_phase\(integer, text, uuid, text\)[\s\S]*?from public, anon, authenticated;/i,
    },
    {
      label: "Task 5-A promotion helper must exclude browser roles",
      pattern: /revoke execute on function (?:public\.)?wanted_claim_maybe_promote\(uuid, date, boolean\)[\s\S]*?from public, anon, authenticated;/i,
    },
    {
      label: "Task 5-A normalization helpers must exclude browser roles",
      pattern: /revoke execute on function (?:public\.)?wanted_claim_normalize_v1\(text\)[\s\S]*?from public, anon, authenticated;[\s\S]*?revoke execute on function (?:public\.)?wanted_claim_normalized_hash\(text, integer\)[\s\S]*?from public, anon, authenticated;/i,
    },
    {
      label: "browser roles must never receive TRUNCATE",
      pattern: /revoke truncate on all tables in schema public from anon, authenticated;/i,
    },
    {
      label: "future functions must require explicit browser-role grants",
      pattern: /alter default privileges for role postgres in schema public[\s\S]*?revoke execute on functions from public, anon, authenticated;/i,
    },
  ];
  const missing = required
    .filter(({ pattern }) => !pattern.test(schema))
    .map(({ label }) => "  - " + label);
  if (missing.length) {
    fail([
      "database privilege guard FAILED: schema-v3.sql lost required least-privilege rules.",
      ...missing,
    ]);
  }
  console.log("database privilege guard: ok");
}

function guardDiffSize() {
  const base = process.env.BASE_SHA;
  if (!base) {
    console.log("diff-size guard: skipped (no BASE_SHA in environment)");
    return;
  }

  let range;
  try {
    const mergeBase = git(["merge-base", base, "HEAD"]);
    range = `${mergeBase}..HEAD`;
  } catch {
    range = `${base}..HEAD`;
  }

  const changes = git(["diff", "--name-status", range]).split("\n").filter(Boolean);
  const changedFiles = changes.map((l) => l.split("\t").pop());
  const deletions = changes
    .filter((l) => l.startsWith("D"))
    .map((l) => l.split("\t").pop());

  const coreDeletions = deletions.filter(
    (f) => CORE_PREFIXES.some((p) => f.startsWith(p)) || CORE_FILES.includes(f),
  );

  // In GitHub Actions PR context, HEAD is a merge commit whose message won't
  // contain the override flag. Check all commits in the range instead.
  const allMsgs = git(["log", "--format=%B", range]);
  const overridden = allMsgs.includes(LARGE_DIFF_OVERRIDE);

  console.log(`diff-size guard: ${changedFiles.length} files changed in ${range}`);

  const problems = [];
  if (coreDeletions.length) {
    problems.push(
      `  ${coreDeletions.length} core file(s) deleted (possible rewrite):`,
      ...coreDeletions.map((f) => `    - ${f}`),
    );
  }
  if (changedFiles.length > MAX_CHANGED_FILES) {
    problems.push(
      `  ${changedFiles.length} files changed exceeds limit ${MAX_CHANGED_FILES}.`,
    );
  }

  if (problems.length) {
    if (overridden) {
      console.log("diff-size guard: limits exceeded but overridden via " + LARGE_DIFF_OVERRIDE);
      console.log(problems.join("\n"));
      return;
    }
    fail([
      `diff-size guard FAILED (full-repo-rewrite protection):`,
      ...problems,
      `If this large change is intentional, add "${LARGE_DIFF_OVERRIDE}" to the latest commit message.`,
    ]);
  }
  console.log("diff-size guard: ok");
}


function guardSecrets() {
  const hits = [];

  for (const rawFile of sourceFiles()) {
    const file = normalizePath(rawFile);
    const text = readFileSync(rawFile, "utf-8");
    const client = isUseClientSource(text);
    const modules = importedModules(text);

    const badPublicEnvHits = linesWith(text, (line) => /NEXT_PUBLIC_[A-Z0-9_]*SERVICE_ROLE[A-Z0-9_]*/.test(line));
    hits.push(...badPublicEnvHits.map((h) => `  ${file}:${h} (service-role env vars must never be NEXT_PUBLIC_*)`));

    if (client) {
      const serviceEnvHits = linesWith(text, (line) => /SUPABASE_SERVICE_ROLE_KEY/.test(line));
      hits.push(...serviceEnvHits.map((h) => `  ${file}:${h} (client component references SUPABASE_SERVICE_ROLE_KEY)`));

      const forbiddenImports = modules.filter((m) => SERVER_SECRET_MODULES.has(m));
      hits.push(...forbiddenImports.map((m) => `  ${file}: imports server-secret module ${m} from a "use client" file`));
    }

    if (!SERVICE_ROLE_ACCESS_FILES.has(file)) {
      const serviceEnvHits = linesWith(text, (line) => /process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(line));
      hits.push(...serviceEnvHits.map((h) => `  ${file}:${h} (read SUPABASE_SERVICE_ROLE_KEY only in lib/supabase-server.ts)`));
    }

    if (!SERVICE_ROLE_FACTORY_FILES.has(file)) {
      const factoryHits = linesWith(text, (line) => /createClient\s*\([^\n]*(SUPABASE_SERVICE_ROLE_KEY|serviceKey|serviceRoleKey)/.test(line));
      hits.push(...factoryHits.map((h) => `  ${file}:${h} (service-role clients may only be created in lib/supabase-server.ts)`));
    }

    const importsServiceRole = modules.some((m) => SERVER_SECRET_MODULES.has(m));
    if (!isApiRoute(file) && !SERVER_SECRET_HELPER_FILES.has(file) && importsServiceRole) {
      const mutationHits = linesWith(text, (line) => MUTATION_METHOD_RE.test(line));
      if (READ_ONLY_SERVICE_HELPER_FILES.has(file)) {
        hits.push(...mutationHits.map((h) => `  ${file}:${h} (read-only service helper must not mutate; move writes into app/api/**/route.ts)`));
      } else {
        if (mutationHits.length) {
          hits.push(...mutationHits.map((h) => `  ${file}:${h} (mutation-capable service-role helpers are only allowed in app/api/**/route.ts)`));
        }
        if (SERVICE_ROLE_NAME_RE.test(text)) {
          hits.push(`  ${file}: imports mutation-capable service-role helper outside app/api/**/route.ts`);
        }
      }
    }
  }

  if (hits.length) {
    fail([
      `secret exposure guard FAILED: Supabase service-role usage must stay server-only and route-scoped.`,
      ...hits,
    ]);
  }
  console.log("secret exposure guard: ok");
}

function guardNoStubStorage() {
  const hits = [];
  for (const rawFile of walk(API_ROUTES_ROOT)) {
    const file = normalizePath(rawFile);
    if (!isApiRoute(file)) continue;
    const publicRoute = !file.startsWith("app/api/admin/");
    if (!publicRoute) continue;

    const text = readFileSync(rawFile, "utf-8");
    const modules = importedModules(text);
    const importsStubStorage = modules.some((m) =>
      /(^|\/)admin-stubs$|(^|\/)submission-stubs$|(^|\/)topic-suggestion-stubs$/.test(m),
    );
    const hasInlineStubStorage = /storage\s*:\s*["']stub["']|storage\s*:\s*DataSourceKind\.Stub/.test(text);

    if (importsStubStorage || hasInlineStubStorage) {
      const flagGuarded = /FORAI_ENABLE_STUB_STORAGE|isStubStorageFeatureEnabled|assertPublicProductionDataSource/.test(text);
      if (!flagGuarded) {
        hits.push(`  ${file}: public route references stub storage without an explicit feature-flag guard`);
      }
    }
  }

  if (hits.length) {
    fail([
      `no-stub-storage guard FAILED: public production routes must not return non-durable stub storage responses.`,
      `Remove the stub path or guard it with FORAI_ENABLE_STUB_STORAGE via lib/data-source.ts.`,
      ...hits,
    ]);
  }
  console.log("no-stub-storage guard: ok");
}

// --- main ------------------------------------------------------------------

const guard = process.argv[2];
const guards = {
  route: guardRoute,
  mojibake: guardMojibake,
  "api-docs": guardApiDocsRoutes,
  artifacts: guardArtifacts,
  claims: guardClaims,
  secrets: guardSecrets,
  surfaces: guardSurfaces,
  "schema-types": guardSchemaTypes,
  "db-privileges": guardDatabasePrivileges,
  "diff-size": guardDiffSize,
  "no-stub-storage": guardNoStubStorage,
  all() {
    guardRoute();
    guardApiDocsRoutes();
    guardMojibake();
    guardArtifacts();
    guardClaims();
    guardSecrets();
    guardNoStubStorage();
    guardSurfaces();
    guardSchemaTypes();
    guardDatabasePrivileges();
    guardDiffSize();
  },
};

if (!guard || !guards[guard]) {
  console.error("Usage: node scripts/ci-guards.mjs <route|api-docs|mojibake|artifacts|claims|secrets|no-stub-storage|surfaces|schema-types|db-privileges|diff-size|all>");
  process.exit(2);
}

guards[guard]();
