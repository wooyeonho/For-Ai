#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadSegment, METRIC_KEYS } from "./load-segment.mjs";
import { addMentionRanks, parseResponseForEntities } from "./parse-response.mjs";
import { scoreEntities } from "./score-entities.mjs";
import { buildReferenceRange } from "./build-reference-range.mjs";
import { writeEvidenceLog } from "./write-evidence-log.mjs";
import { renderReports } from "./render-reports.mjs";

const FORBIDDEN = [
  "상위노출 보장",
  "1위 보장",
  "추천 보장",
  "전수 측정",
  "guaranteed ranking",
  "guaranteed AI visibility",
];

async function main() {
  const segmentId = getArg("--segment");
  if (!segmentId) throw new Error("Usage: npm run visibility:batch -- --segment <segment_id>");
  const loaded = await loadSegment(segmentId);
  const outDir = path.join(process.cwd(), "out", "visibility", segmentId);
  await mkdir(outDir, { recursive: true });

  const parsedRows = addMentionRanks(loaded.responses.flatMap((response) => parseResponseForEntities(response, loaded.entities)));
  const scores = scoreEntities({ ...loaded, parsedRows });
  const referenceRange = buildReferenceRange(scores, METRIC_KEYS);

  await writeEvidenceLog({ outDir, segment: loaded.segment, questionPack: loaded.questionPack, responses: loaded.responses, parsedRows });
  await writeCsv(path.join(outDir, "entity-scores.csv"), scores);
  await renderReports({ outDir, ...loaded, parsedRows, scores, referenceRange, responses: loaded.responses });
  await assertNoForbidden(outDir);

  console.log(`FA-VIS v1 mock batch complete: ${segmentId}`);
  console.log(`Output: ${path.relative(process.cwd(), outDir)}`);
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function writeCsv(filePath, rows) {
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))];
  await writeFile(filePath, `${lines.join("\n")}\n`);
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function assertNoForbidden(outDir) {
  const { readdir, readFile } = await import("node:fs/promises");
  const files = await walk(outDir, readdir);
  for (const file of files) {
    if (!/\.(html|csv|jsonl)$/.test(file)) continue;
    const content = await readFile(file, "utf8");
    const found = FORBIDDEN.find((phrase) => content.toLocaleLowerCase().includes(phrase.toLocaleLowerCase()));
    if (found) throw new Error(`Forbidden phrase "${found}" found in ${file}`);
  }
}

async function walk(dir, readdir) {
  const { stat } = await import("node:fs/promises");
  const entries = await readdir(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    if ((await stat(fullPath)).isDirectory()) files.push(...await walk(fullPath, readdir));
    else files.push(fullPath);
  }
  return files;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
