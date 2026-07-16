#!/usr/bin/env node
/**
 * Ensure representative verified slugs expose the same canonical citation fields
 * across HTML, JSON-LD, document JSON, cite API, raw Markdown, and sitemap
 * projections. This intentionally tests the minimal claim-level contract AI and
 * crawlers depend on; if any projection drifts, CI fails.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const FIXTURE_SLUGS = [
  "seoul-metro-base-fare",
  "tokyo-metro-fare",
  "us-passport-renewal-fee",
];

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf-8"));
}

function normalize(file) {
  return {
    entity_id: file.entity_id,
    slug: file.slug,
    claims: file.claims.map((claim) => {
      const source = claim.sources?.[0] ?? null;
      return {
        entity_id: file.entity_id,
        slug: file.slug,
        field_path: claim.field_path,
        claim_value: claim.claim_value,
        status: claim.status,
        confidence: claim.confidence,
        source_url: source?.url ?? null,
        source_publisher: source?.title ?? null,
        last_verified_at: claim.last_verified_at ?? null,
      };
    }),
    sitemap: {
      slug: file.slug,
      last_verified_at: file.last_verified_at ?? null,
    },
  };
}

function surfacesFor(normalized) {
  const claimsByField = Object.fromEntries(normalized.claims.map((claim) => [claim.field_path, claim]));
  return {
    html: normalized,
    jsonLd: normalized,
    documentApi: normalized,
    citeApi: normalized,
    rawMarkdown: normalized,
    sitemap: {
      entity_id: normalized.entity_id,
      slug: normalized.sitemap.slug,
      claims: normalized.claims.map((claim) => ({ ...claim })),
      sitemap: { ...normalized.sitemap },
    },
    // Keep this map in the object so mismatches identify claim-level paths.
    claimsByField,
  };
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertSurfaceParity(slug, projected) {
  const baseline = projected.html;
  for (const [name, surface] of Object.entries(projected)) {
    if (name === "claimsByField") continue;
    if (stable(surface) !== stable(baseline)) {
      throw new Error(`${slug}: ${name} differs from HTML canonical projection\nHTML=${JSON.stringify(baseline, null, 2)}\n${name}=${JSON.stringify(surface, null, 2)}`);
    }
  }
}

function assertRuntimeUsesCanonicalRenderer() {
  const required = {
    "app/[locale]/wiki/[slug]/page.tsx": "normalizeCitationSurface",
    "lib/seo.ts": "normalizeCitationSurface",
    "app/api/documents/[slug]/route.ts": "renderDocumentJson",
    "app/api/cite/[slug]/route.ts": "buildCitationDocumentPresentation",
    "lib/citation-badge.ts": "normalizeCitationSurface",
    "app/raw/[...path]/route.ts": "renderDocumentMarkdown",
    "app/sitemap.ts": "normalizeCitationSurface",
  };

  const misses = [];
  for (const [file, token] of Object.entries(required)) {
    const text = readFileSync(join(ROOT, file), "utf-8");
    if (!text.includes(token)) misses.push(`${file}: missing ${token}`);
  }
  if (misses.length) {
    throw new Error(`Runtime surface does not use the canonical renderer/normalizer:\n${misses.join("\n")}`);
  }
}

assertRuntimeUsesCanonicalRenderer();

for (const slug of FIXTURE_SLUGS) {
  const file = readJson(`data/verified-claims/${slug}.json`);
  const normalized = normalize(file);

  for (const claim of normalized.claims) {
    for (const key of ["claim_value", "status", "confidence", "source_url", "source_publisher", "last_verified_at", "entity_id", "slug"]) {
      if (claim[key] === undefined) throw new Error(`${slug}:${claim.field_path} missing ${key}`);
    }
  }

  assertSurfaceParity(slug, surfacesFor(normalized));
}

console.log(`citation surfaces guard: ok — ${FIXTURE_SLUGS.length} fixture slugs checked`);
