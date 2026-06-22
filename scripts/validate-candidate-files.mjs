#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const candidateJsonlDirs = ["data/question-candidates", "data/topic-candidates"];
const jsonFiles = ["data/verified-seed-set.json"];
const forbiddenTextPatterns = ["�", "ì", "í", "ë", "ê", "Ã", "Â"];

const readJsonl = (path) => readFileSync(path, "utf8")
  .split("\n")
  .filter((line) => line.trim().length > 0)
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${path}:${index + 1} is not valid JSON: ${error.message}`);
    }
  });

const walkJsonl = (dir) => {
  try {
    return readdirSync(dir)
      .map((name) => join(dir, name))
      .filter((path) => statSync(path).isFile() && path.endsWith(".jsonl"));
  } catch {
    return [];
  }
};

const assertNoMojibake = (path, text) => {
  const found = forbiddenTextPatterns.find((pattern) => text.includes(pattern));
  if (found) {
    throw new Error(`${path} contains possible mojibake marker: ${found}`);
  }
};

const assertCandidateClaims = (path, row, rowIndex) => {
  if (!Array.isArray(row.claims) || row.claims.length === 0) {
    throw new Error(`${path}:${rowIndex + 1} must include at least one claim`);
  }
  for (const [claimIndex, claim] of row.claims.entries()) {
    if (claim.claim_value !== "확인 필요") {
      throw new Error(`${path}:${rowIndex + 1}:claim ${claimIndex + 1} must keep claim_value 확인 필요`);
    }
    if (claim.confidence !== "low") {
      throw new Error(`${path}:${rowIndex + 1}:claim ${claimIndex + 1} must keep confidence low`);
    }
    if (claim.status !== "needs_review") {
      throw new Error(`${path}:${rowIndex + 1}:claim ${claimIndex + 1} must keep status needs_review`);
    }
    if (!Array.isArray(claim.sources) || claim.sources.length !== 0) {
      throw new Error(`${path}:${rowIndex + 1}:claim ${claimIndex + 1} must keep sources empty`);
    }
  }
};

const validateJsonlCandidates = (path) => {
  const text = readFileSync(path, "utf8");
  assertNoMojibake(path, text);
  const rows = readJsonl(path);
  if (rows.length === 0) {
    throw new Error(`${path} must not be empty`);
  }
  rows.forEach((row, rowIndex) => {
    if (row.status === "verified" || row.visibility === "verified_document") {
      throw new Error(`${path}:${rowIndex + 1} must not contain verified candidates`);
    }
    if (row.visibility && row.visibility !== "internal_candidate") {
      throw new Error(`${path}:${rowIndex + 1} visibility must remain internal_candidate for generated question candidates`);
    }
    if (row.slug && /[^a-zA-Z0-9_-]/.test(row.slug)) {
      throw new Error(`${path}:${rowIndex + 1} slug must be stable ASCII`);
    }
    assertCandidateClaims(path, row, rowIndex);
  });
  return rows.length;
};

const validateVerifiedSeedSet = (path) => {
  const text = readFileSync(path, "utf8");
  assertNoMojibake(path, text);
  const data = JSON.parse(text);
  if (!Array.isArray(data.items) || data.items.length !== 50) {
    throw new Error(`${path} must contain exactly 50 seed items`);
  }
  data.items.forEach((item, itemIndex) => {
    if (item.status !== "verification_candidate") {
      throw new Error(`${path}:item ${itemIndex + 1} must remain verification_candidate`);
    }
    if (!Array.isArray(item.claims) || item.claims.length === 0) {
      throw new Error(`${path}:item ${itemIndex + 1} must include claims`);
    }
    item.claims.forEach((claim, claimIndex) => {
      if (claim.placeholder_value !== "확인 필요") {
        throw new Error(`${path}:item ${itemIndex + 1}:claim ${claimIndex + 1} must keep placeholder_value 확인 필요`);
      }
      if (claim.confidence !== "low") {
        throw new Error(`${path}:item ${itemIndex + 1}:claim ${claimIndex + 1} must keep confidence low`);
      }
      if (claim.status !== "needs_review") {
        throw new Error(`${path}:item ${itemIndex + 1}:claim ${claimIndex + 1} must keep status needs_review`);
      }
    });
  });
  return data.items.length;
};

let checked = 0;
for (const dir of candidateJsonlDirs) {
  for (const path of walkJsonl(dir)) {
    const rows = validateJsonlCandidates(path);
    checked += 1;
    console.log(`validated ${path}: ${rows} rows`);
  }
}

for (const path of jsonFiles) {
  const rows = validateVerifiedSeedSet(path);
  checked += 1;
  console.log(`validated ${path}: ${rows} items`);
}

if (checked === 0) {
  throw new Error("No candidate files were validated");
}

console.log(`candidate validation passed for ${checked} files`);
