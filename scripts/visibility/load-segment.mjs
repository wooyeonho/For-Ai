import { readFile } from "node:fs/promises";
import path from "node:path";

export const STANDARD = "FA-VIS";
export const STANDARD_VERSION = "1.0";
export const QUESTION_TYPES = ["recommendation", "problem", "trigger"];
export const METRIC_KEYS = [
  "direct_mention_rate",
  "source_citation_rate",
  "competitor_first_rate",
  "criteria_connection_rate",
  "information_accuracy",
];

export function segmentDir(segmentId) {
  return path.join(process.cwd(), "data", "visibility", "segments", segmentId);
}

export async function loadJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function loadSegment(segmentId) {
  const dir = segmentDir(segmentId);
  const segment = await loadJson(path.join(dir, "segment.json"));
  validateSegment(segment, segmentId);
  const questionPack = await loadJson(path.join(dir, "question-pack-v1.json"));
  validateQuestionPack(questionPack, segment);
  const entities = parseCsv(await readFile(path.join(dir, "entities.csv"), "utf8"));
  const responses = parseJsonl(await readFile(path.join(dir, "mock-responses.jsonl"), "utf8"));
  return { dir, segment, questionPack, entities, responses };
}

function validateSegment(segment, expectedId) {
  const required = [
    "standard", "standard_version", "segment_id", "country", "language", "locale", "region",
    "entity_type", "category", "category_label", "customer_label", "entity_label", "inspection_title",
    "hero_question", "reference_scope_label", "question_types", "criteria_keywords", "source_platforms",
    "measurement_providers", "metrics", "disclaimer",
  ];
  for (const key of required) {
    if (segment[key] === undefined) throw new Error(`segment.json missing ${key}`);
  }
  if (segment.segment_id !== expectedId) throw new Error(`segment_id mismatch: ${segment.segment_id} !== ${expectedId}`);
  if (segment.standard !== STANDARD || segment.standard_version !== STANDARD_VERSION) {
    throw new Error(`Unsupported standard ${segment.standard} ${segment.standard_version}`);
  }
  assertSameSet(segment.question_types, QUESTION_TYPES, "question_types");
  assertSameSet(segment.metrics, METRIC_KEYS, "metrics");
}

function validateQuestionPack(questionPack, segment) {
  if (questionPack.standard !== STANDARD || questionPack.form !== "FA-Q1") throw new Error("question-pack-v1.json must be FA-Q1");
  if (questionPack.segment_id !== segment.segment_id) throw new Error("question pack segment_id mismatch");
  for (const question of questionPack.questions) {
    if (!QUESTION_TYPES.includes(question.type)) throw new Error(`Invalid question type: ${question.type}`);
  }
}

function assertSameSet(actual, expected, label) {
  const a = [...actual].sort().join("|");
  const e = [...expected].sort().join("|");
  if (a !== e) throw new Error(`${label} must be ${expected.join(", ")}`);
}

export function parseJsonl(input) {
  return input.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

export function parseCsv(input) {
  const [headerLine, ...lines] = input.trim().split(/\r?\n/);
  const headers = splitCsvLine(headerLine);
  return lines.filter(Boolean).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function splitCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}
