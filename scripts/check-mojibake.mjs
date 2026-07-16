#!/usr/bin/env node

/**
 * Fails when common UTF-8-as-Latin-1 mojibake markers are present in source text.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([".git", ".next", "node_modules", "out", "dist", "build"]);
const EXTENSIONS = new Set([
  ".css",
  ".json",
  ".jsonl",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
]);
const MOJIBAKE_PATTERN = new RegExp("[\u00e2\u0080\ufffd]|(?:[\u00ec\u00ed\u00ea\u00eb][\u0080-\u00ff])", "u");
const INTENTIONAL_EXAMPLE_PATTERNS = [
  /MOJIBAKE_(?:PATTERN|ALLOWLIST)/,
  /not "íì¸ íì"/,
  /의도적으로 mojibake 예시/,
];

function isIntentionalExample(line) {
  return INTENTIONAL_EXAMPLE_PATTERNS.some((pattern) => pattern.test(line));
}

function hasTrackedExtension(path) {
  return [...EXTENSIONS].some((extension) => path.endsWith(extension));
}

function walk(dir) {
  const findings = [];

  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;

    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      findings.push(...walk(path));
      continue;
    }

    if (!hasTrackedExtension(path)) continue;

    const text = readFileSync(path, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      if (MOJIBAKE_PATTERN.test(line) && !isIntentionalExample(line)) {
        findings.push(`${path.replace(`${ROOT}/`, "")}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  return findings;
}

const findings = walk(ROOT);

if (findings.length > 0) {
  console.error("Potential mojibake detected:");
  console.error(findings.join("\n"));
  process.exit(1);
}

console.log("No mojibake markers detected.");
