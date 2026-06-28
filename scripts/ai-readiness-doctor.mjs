#!/usr/bin/env node
/**
 * For-Ai AI-readiness doctor ("LazyCodex"-style P0 loop, self-hosted).
 *
 * Runs a set of world-class P0 standards checks against the repository and
 * prints a scored report. Exit code 0 when every P0 check passes, 1 otherwise.
 *
 * Usage:
 *   node scripts/ai-readiness-doctor.mjs            # static checks (fast)
 *   node scripts/ai-readiness-doctor.mjs --with-build   # also run lint + build
 *
 * This script has no external dependencies and is safe for CI, Claude, Codex,
 * and Devin to run identically.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const WITH_BUILD = process.argv.includes("--with-build");

const SCAN_ROOTS = ["app", "lib"];
const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".md"]);
// Legitimate non-ASCII chars in U+0080-U+00FF (mirror of ci-guards allowlist).
// Includes i18n characters for multilingual support (Spanish accents, etc.)
const MOJIBAKE_ALLOWLIST = new Set(["·", "×", "©", "ñ", "é", "á", "í", "ó", "ú", "ü", "Ñ", "É", "Á", "Í", "Ó", "Ú", "Ü", "¡", "¿", "Î", "î", "ê", "û", "ô", "â", "ë", "ï", "ç", "à", "è", "ù"]);
const DUMP_EXT = new Set([".jsonl", ".ndjson", ".csv"]);
const DUMP_MAX_LINES = 2000;
const DUMP_MAX_BYTES = 1_000_000;

// Public, user-facing pages that must expose a title for SEO/AI legibility.
const TITLED_PAGES = [
  "app/page.tsx",
  "app/suggest-topic/page.tsx",
  "app/report/[slug]/page.tsx",
  "app/hallucination/[slug]/page.tsx",
  "app/diagnostics/[slug]/page.tsx",
  "app/[locale]/wiki/[slug]/page.tsx",
];

// --- helpers ---------------------------------------------------------------

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (SOURCE_EXT.has(extname(e.name))) out.push(p);
  }
  return out;
}

function sourceFiles() {
  return SCAN_ROOTS.flatMap((r) => walk(r));
}

function read(file) {
  try {
    return readFileSync(file, "utf-8");
  } catch {
    return "";
  }
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf-8" }).trim();
}

// --- checks ----------------------------------------------------------------
// Each check returns { ok: boolean, detail: string }.

const checks = [];
const check = (id, title, fn) => checks.push({ id, title, fn });

check("encoding", "No mojibake / broken encoding in app/ or lib/", () => {
  const hits = [];
  for (const f of sourceFiles()) {
    read(f)
      .split("\n")
      .forEach((line, i) => {
        for (const ch of line) {
          const c = ch.codePointAt(0);
          if (c >= 0x80 && c <= 0xff && !MOJIBAKE_ALLOWLIST.has(ch)) {
            hits.push(`${f}:${i + 1}`);
            break;
          }
        }
      });
  }
  return { ok: hits.length === 0, detail: hits.length ? hits.slice(0, 5).join(", ") : "clean" };
});

check("routes", "No stale /api/document (singular) paths", () => {
  const re = /\/api\/document(?!s)/;
  const hits = sourceFiles().filter((f) => re.test(read(f)));
  return { ok: hits.length === 0, detail: hits.length ? hits.join(", ") : "ok" };
});

check("llms-txt", "/llms.txt route exists with a citation policy", () => {
  const file = "app/llms.txt/route.ts";
  if (!existsSync(file)) return { ok: false, detail: "missing app/llms.txt/route.ts" };
  const src = read(file);
  const ok = /citation policy/i.test(src) && /확인 필요/.test(src);
  return { ok, detail: ok ? "present" : "missing citation policy / 확인 필요 guidance" };
});

check("sitemap-llms", "sitemap includes /llms.txt", () => {
  const ok = /\/llms\.txt/.test(read("app/sitemap.ts"));
  return { ok, detail: ok ? "ok" : "add /llms.txt to app/sitemap.ts" };
});

check("robots-host", "robots exposes sitemap and host", () => {
  const src = read("app/robots.ts");
  const ok = /sitemap/i.test(src) && /host/i.test(src);
  return { ok, detail: ok ? "ok" : "robots must declare sitemap and host" };
});

check("md-citation", "Raw Markdown includes citation guidance", () => {
  const src = read("lib/render.ts");
  const ok = /citation guidance/i.test(src) || /## Citation/i.test(src);
  return { ok, detail: ok ? "ok" : "add a Citation guidance section to renderDocumentMarkdown" };
});

check("jsonld", "Document pages emit JSON-LD Dataset + metadata", () => {
  const src = read("app/[locale]/wiki/[slug]/page.tsx");
  const ok =
    /buildDocumentJsonLd/.test(src) &&
    /application\/ld\+json/.test(src) &&
    /generateMetadata/.test(src);
  return { ok, detail: ok ? "ok" : "wiki page must render JSON-LD and generateMetadata" };
});

check("layout", "Layout sets html lang, title template, header + footer", () => {
  const src = read("app/layout.tsx");
  const ok =
    /(<html\s+lang=|lang=\{DEFAULT_LOCALE\})/.test(src) &&
    /template:/.test(src) &&
    /SiteHeader/.test(src) &&
    /SiteFooter/.test(src);
  return { ok, detail: ok ? "ok" : "layout missing lang/template/header/footer" };
});

check("page-titles", "Public pages expose a title (metadata)", () => {
  const missing = TITLED_PAGES.filter((f) => {
    const src = read(f);
    return !(/export const metadata/.test(src) || /generateMetadata/.test(src));
  });
  return { ok: missing.length === 0, detail: missing.length ? missing.join(", ") : "all titled" };
});

check("not-found", "Custom 404 page exists", () => {
  const ok = existsSync("app/not-found.tsx");
  return { ok, detail: ok ? "ok" : "add app/not-found.tsx" };
});

check("gitignore", ".next/ and node_modules/ are ignored", () => {
  const src = read(".gitignore");
  const ok = /\.next/.test(src) && /node_modules/.test(src);
  return { ok, detail: ok ? "ok" : ".gitignore must cover .next/ and node_modules/" };
});

check("artifacts", "No build output or oversized dumps committed", () => {
  let tracked = [];
  try {
    tracked = git(["ls-files"]).split("\n").filter(Boolean);
  } catch {
    return { ok: true, detail: "not a git checkout; skipped" };
  }
  const hits = [];
  for (const f of tracked) {
    if (f.includes(".next/") || f.includes("node_modules/")) hits.push(f);
    if (DUMP_EXT.has(extname(f))) {
      let bytes = 0;
      let count = 0;
      try {
        bytes = statSync(f).size;
        count = read(f).split("\n").filter(Boolean).length;
      } catch {
        /* ignore */
      }
      if (bytes > DUMP_MAX_BYTES || count > DUMP_MAX_LINES) hits.push(`${f} (oversized)`);
    }
  }
  return { ok: hits.length === 0, detail: hits.length ? hits.slice(0, 5).join(", ") : "ok" };
});

if (WITH_BUILD) {
  check("lint", "npm run lint passes", () => {
    try {
      execFileSync("npm", ["run", "lint"], { stdio: "pipe" });
      return { ok: true, detail: "ok" };
    } catch {
      return { ok: false, detail: "lint failed" };
    }
  });
  check("build", "npm run build passes", () => {
    try {
      execFileSync("npm", ["run", "build"], { stdio: "pipe" });
      return { ok: true, detail: "ok" };
    } catch {
      return { ok: false, detail: "build failed" };
    }
  });
}

// --- run -------------------------------------------------------------------

console.log("For-Ai AI-readiness doctor\n");
let passed = 0;
const failures = [];
for (const c of checks) {
  let result;
  try {
    result = c.fn();
  } catch (e) {
    result = { ok: false, detail: `error: ${e.message}` };
  }
  const mark = result.ok ? "✓" : "✗";
  console.log(`  ${mark} ${c.title}${result.ok ? "" : `  — ${result.detail}`}`);
  if (result.ok) passed += 1;
  else failures.push(c.id);
}

const score = Math.round((passed / checks.length) * 100);
console.log(`\nScore: ${score}/100 (${passed}/${checks.length} checks passed)`);
if (failures.length) {
  console.log(`Failing P0 checks: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("All P0 standards met. ✅");
