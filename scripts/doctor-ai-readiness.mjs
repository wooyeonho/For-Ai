#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const checks = [];

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function add(name, pass, detail = "") {
  checks.push({ name, pass, detail });
}

function contains(path, snippets) {
  const text = read(path);
  return snippets.every((snippet) => text.includes(snippet));
}

const sourceFiles = [
  "app/layout.tsx",
  "app/page.tsx",
  "app/not-found.tsx",
  "app/ko/wiki/[slug]/page.tsx",
  "app/llms.txt/route.ts",
  "app/robots.ts",
  "app/sitemap.ts",
  "lib/render.ts",
  "lib/urls.ts",
  "scripts/smoke-test-routes.mjs",
  "scripts/check-mojibake.mjs",
];
const sourceText = sourceFiles.filter(existsSync).map(read).join("\n");

add("no mojibake markers in core source", !/[\u00e2\u0080\ufffd]|(?:[\u00ec\u00ed\u00ea\u00eb][\u0080-\u00ff])/u.test(sourceText));
add("no stale /api/document singular path in core source", !sourceText.includes("/api/document/"));
add("llms.txt route exists with citation policy", existsSync(join(root, "app/llms.txt/route.ts")) && contains("app/llms.txt/route.ts", ["Citation policy", "확인 필요", "content-type"]));
add("sitemap includes llms.txt", contains("app/sitemap.ts", ["/llms.txt"]));
add("robots declares sitemap and host", contains("app/robots.ts", ["sitemap", "host"]));
add("raw markdown includes citation guidance", contains("lib/render.ts", ["Citation guidance", "확인 필요"]));
add("wiki page has JSON-LD Dataset and metadata", contains("app/ko/wiki/[slug]/page.tsx", ["buildDocumentJsonLd", "buildDocumentMetadata", "application/ld+json"]));
add("layout has Korean lang, title template, header, and footer", contains("app/layout.tsx", ["lang=\"ko\"", "template", "SiteHeader", "SiteFooter"]));
add("public pages have SEO metadata baseline", contains("app/layout.tsx", ["description", "openGraph", "metadataBase"]));
add("custom 404 exists", existsSync(join(root, "app/not-found.tsx")) && contains("app/not-found.tsx", ["문서를 찾을 수 없습니다"]));
add("gitignore excludes build artifacts", existsSync(join(root, ".gitignore")) && contains(".gitignore", [".next/", "node_modules/"]));
add("no oversized committed build artifact directories", !existsSync(join(root, ".next/cache")) || !sourceText.includes(".next/cache"));

const passed = checks.filter((check) => check.pass).length;
const score = Math.round((passed / checks.length) * 100);

for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
}

console.log(`\nDoctor score: ${score}/100 (${passed}/${checks.length})`);

if (passed !== checks.length) {
  process.exit(1);
}
