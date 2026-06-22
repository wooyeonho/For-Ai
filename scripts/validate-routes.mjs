#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "app/page.tsx",
  "app/goal/page.tsx",
  "app/suggest-topic/page.tsx",
  "app/ko/wiki/[slug]/page.tsx",
  "app/api/documents/[slug]/route.ts",
  "app/raw/[...path]/route.ts",
  "app/report/[slug]/page.tsx",
  "app/hallucination/[slug]/page.tsx",
  "app/diagnostics/[slug]/page.tsx",
  "app/admin/review/page.tsx",
  "app/admin/new-entity/page.tsx",
  "app/admin/new-document/page.tsx",
  "app/admin/import/page.tsx",
  "app/sitemap.ts",
  "app/robots.ts",
];

const requiredHomeLinks = [
  "/goal",
  "/suggest-topic",
  "/diagnostics/",
  "/api/documents/",
  "/raw/",
  "/report/",
  "/hallucination/",
];

const requiredGoalPhrases = [
  "internal_candidate",
  "확인 필요 / low / needs_review",
  "source-backed verification",
  "entities -> documents -> claims -> claim_sources -> verification_events",
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    throw new Error(`missing required route file: ${file}`);
  }
}

const home = readFileSync("app/page.tsx", "utf8");
for (const link of requiredHomeLinks) {
  if (!home.includes(link)) {
    throw new Error(`home page is missing route link marker: ${link}`);
  }
}

const goal = readFileSync("app/goal/page.tsx", "utf8");
for (const phrase of requiredGoalPhrases) {
  if (!goal.includes(phrase)) {
    throw new Error(`/goal page is missing safety phrase: ${phrase}`);
  }
}

const sitemap = readFileSync("app/sitemap.ts", "utf8");
if (!sitemap.includes('absoluteUrl("/goal")')) {
  throw new Error("sitemap must include /goal");
}

console.log(`route validation passed for ${requiredFiles.length} route files`);
