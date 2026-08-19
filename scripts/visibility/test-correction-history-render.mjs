#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderReports } from "./render-reports.mjs";

const segment = {
  segment_id: "correction-history-regression",
  locale: "ko-KR",
  language: "ko",
  country: "KR",
  category: "tax_accountant",
  category_label: "세무사",
  entity_label: "세무사",
  entity_type: "ProfessionalService",
  region: "서울",
  reference_scope_label: "회귀 테스트 표본",
  measurement_providers: ["fixture"],
  criteria_keywords: ["기장"],
  question_types: ["recommendation"],
  metrics: ["direct_mention_rate"],
};
const questionPack = { id: "Q-REG", version: "1", questions: [{ no: 1, type: "recommendation", text: "테스트 질문" }] };
const entities = [{ id: "entity-safe", name: "테스트 세무사", representative: "", address: "", homepage: "" }];
const parsedRows = [{ entity_id: "entity-safe", question_no: 1, mentioned: false, cited: false }];
const scores = [{ entity_id: "entity-safe", entity_name: "테스트 세무사", direct_mention_rate: 0 }];
const referenceRange = { direct_mention_rate: { bottom25: 0, median: 0, top25: 0 } };
const responses = [{ question_no: 1, measured_at: "2026-08-19T08:45:00+09:00", cited_domains: [] }];
const forbidden = ["SECRET_SUPERSEDED_COPY", "reviewer@example.com", "private-source-revision"];

async function renderCase(history) {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "for-ai-history-"));
  await renderReports({ outDir, segment, questionPack, entities, parsedRows, scores, referenceRange, responses, evidenceHistoryByEntity: { "entity-safe": history } });
  const report = await readFile(path.join(outDir, "fa-r1-reports", "entity-safe-report.html"), "utf8");
  const brief = await readFile(path.join(outDir, "fa-d1-briefs", "entity-safe-brief.html"), "utf8");
  return `${report}\n${brief}`;
}

const valid = await renderCase({
  count: 2,
  scope: "provenance_keys_only",
  supersededContentIncluded: false,
  supersededContent: forbidden[0],
  reviewer: forbidden[1],
  sourceRevision: forbidden[2],
});
assert.match(valid, /data-evidence-history="provenance_keys_only"/);
assert.match(valid, /2개의 선행 정정 기록/);
for (const secret of forbidden) assert.equal(valid.includes(secret), false, `valid history leaked ${secret}`);

const malformedCases = [
  { count: -1, scope: "provenance_keys_only", supersededContentIncluded: false },
  { count: 2, scope: "full_history", supersededContentIncluded: false },
  { count: 2, scope: "provenance_keys_only", supersededContentIncluded: true, supersededContent: forbidden[0] },
  { count: "2", scope: "provenance_keys_only", supersededContentIncluded: false },
  { count: Number.NaN, scope: "provenance_keys_only", supersededContentIncluded: false },
  { count: Number.POSITIVE_INFINITY, scope: "provenance_keys_only", supersededContentIncluded: false },
  { count: 1.5, scope: "provenance_keys_only", supersededContentIncluded: false },
];
for (const malformed of malformedCases) {
  const html = await renderCase(malformed);
  assert.equal(html.includes('data-evidence-history="provenance_keys_only"'), false, "malformed history must fail closed");
  for (const secret of forbidden) assert.equal(html.includes(secret), false, `malformed history leaked ${secret}`);
}

console.log("PASS correction-history render regression: valid bounded disclosure renders; malformed/private/superseded data fail closed");
