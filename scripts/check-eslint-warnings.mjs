#!/usr/bin/env node
/**
 * Keeps the current ESLint warning baseline explicit while blocking regressions.
 *
 * This is intentionally a ceiling, not a target. When warnings are fixed,
 * lower BASELINE_WARNING_COUNT and update docs/quality/ESLINT_WARNING_BASELINE.md.
 */
import { spawnSync } from "node:child_process";

const BASELINE_WARNING_COUNT = 39;

const result = spawnSync("npx", ["eslint", ".", "--format", "json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

let reports;
try {
  reports = JSON.parse(result.stdout || "[]");
} catch (error) {
  process.stderr.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  console.error(`Unable to parse ESLint JSON output: ${error.message}`);
  process.exit(2);
}

const errors = reports.flatMap((report) =>
  report.messages
    .filter((message) => message.severity === 2)
    .map((message) => `${report.filePath}:${message.line}:${message.column} ${message.ruleId ?? "unknown"} ${message.message}`),
);
const warnings = reports.flatMap((report) =>
  report.messages
    .filter((message) => message.severity === 1)
    .map((message) => `${report.filePath}:${message.line}:${message.column} ${message.ruleId ?? "unknown"} ${message.message}`),
);

if (errors.length > 0 || result.status > 1) {
  console.error("ESLint errors detected:");
  console.error(errors.join("\n") || result.stderr || "eslint exited unexpectedly");
  process.exit(1);
}

if (warnings.length > BASELINE_WARNING_COUNT) {
  console.error(`ESLint warning baseline exceeded: ${warnings.length} warnings (baseline ${BASELINE_WARNING_COUNT}).`);
  console.error("Fix the new warnings, or intentionally update the documented baseline after reducing/triaging debt.");
  console.error(warnings.join("\n"));
  process.exit(1);
}

if (warnings.length < BASELINE_WARNING_COUNT) {
  console.warn(`ESLint warnings improved: ${warnings.length} warnings (baseline ${BASELINE_WARNING_COUNT}). Please lower the baseline and update docs/quality/ESLINT_WARNING_BASELINE.md.`);
} else {
  console.log(`ESLint warning baseline unchanged: ${warnings.length}/${BASELINE_WARNING_COUNT}.`);
}
