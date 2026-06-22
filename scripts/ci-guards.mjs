#!/usr/bin/env node
/**
 * GYEOL CI guard rails.
 *
 * Usage:
 *   node scripts/ci-guards.mjs <guard>
 *
 * Guards:
 *   route      - fail if a stale `/api/document` (singular) path appears in app/ or lib/.
 *   mojibake   - fail if UTF-8-as-Latin-1 mojibake appears in app/ or lib/.
 *   artifacts  - fail if build/dependency output or oversized generated dumps are committed.
 *   diff-size  - fail if a PR changes an unexpected number of files (full-repo-rewrite guard).
 *   all        - run route + mojibake + artifacts (and diff-size when a base SHA is available).
 *
 * Exit code 0 = pass, 1 = a guard failed, 2 = usage/internal error.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// --- configuration ---------------------------------------------------------

const SCAN_ROOTS = ["app", "lib"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".md", ".json"]);

// Legitimate non-ASCII characters in the U+0080-U+00FF range. Everything else
// in that range is treated as mojibake. Add here only after a conscious review.
//   U+00B7 MIDDLE DOT  (·)  used as a separator in headings/admin labels
//   U+00D7 MULTIPLICATION SIGN (×) used in seed-data dimensions
const MOJIBAKE_ALLOWLIST = new Set(["·", "×"]);

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
      `(Korean text must be real UTF-8, e.g. "확인 필요", not "íì¸ íì".)`,
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

  const headMsg = git(["log", "-1", "--format=%B", "HEAD"]);
  const overridden = headMsg.includes(LARGE_DIFF_OVERRIDE);

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

// --- main ------------------------------------------------------------------

const guard = process.argv[2];
const guards = {
  route: guardRoute,
  mojibake: guardMojibake,
  artifacts: guardArtifacts,
  "diff-size": guardDiffSize,
  all() {
    guardRoute();
    guardMojibake();
    guardArtifacts();
    guardDiffSize();
  },
};

if (!guard || !guards[guard]) {
  console.error(`Usage: node scripts/ci-guards.mjs <route|mojibake|artifacts|diff-size|all>`);
  process.exit(2);
}

guards[guard]();
