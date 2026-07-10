import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeEvidenceLog({ outDir, segment, questionPack, responses, parsedRows }) {
  await mkdir(outDir, { recursive: true });
  const rowsByResponse = new Map();
  for (const row of parsedRows) {
    const key = responseKey(row);
    if (!rowsByResponse.has(key)) rowsByResponse.set(key, []);
    rowsByResponse.get(key).push(row);
  }
  const lines = responses.map((response) => {
    const key = responseKey(response);
    return JSON.stringify({
      ...response,
      parsed_entities: rowsByResponse.get(key) || [],
    });
  });
  await writeFile(path.join(outDir, "fa-e1-evidence-log.jsonl"), `${lines.join("\n")}\n`);
  await writeAuditCsv({ outDir, segment, questionPack, responses, parsedRows });
}

async function writeAuditCsv({ outDir, segment, questionPack, responses, parsedRows }) {
  const responseByKey = new Map(responses.map((response) => [responseKey(response), response]));
  const questionByNo = new Map(questionPack.questions.map((question) => [question.no, question]));
  const headers = [
    "segment_id",
    "entity_id",
    "entity_name",
    "question_no",
    "question_type",
    "run_no",
    "provider",
    "measured_at",
    "mentioned",
    "matched_alias",
    "first_index",
    "mention_rank",
    "cited",
    "via_domain",
    "matched_source_field",
    "matched_source_url",
    "answer_excerpt",
    "review_status",
    "review_note",
  ];
  const lines = [headers.join(",")];
  for (const row of parsedRows) {
    const response = responseByKey.get(responseKey(row));
    const question = questionByNo.get(row.question_no);
    const auditRow = {
      segment_id: segment.segment_id,
      entity_id: row.entity_id,
      entity_name: row.entity_name,
      question_no: row.question_no,
      question_type: question?.type || "",
      run_no: row.run_no,
      provider: row.provider,
      measured_at: row.measured_at,
      mentioned: row.mentioned,
      matched_alias: row.matched_alias || "",
      first_index: row.first_index ?? "",
      mention_rank: row.mention_rank ?? "",
      cited: row.cited,
      via_domain: row.via_domain || "",
      matched_source_field: row.matched_source_field || "",
      matched_source_url: row.matched_source_url || "",
      answer_excerpt: answerExcerpt(response?.answer_text || "", row.first_index),
      review_status: "pending",
      review_note: "",
    };
    lines.push(headers.map((header) => csvCell(auditRow[header])).join(","));
  }
  await writeFile(path.join(outDir, "fa-e1-audit.csv"), `${lines.join("\n")}\n`);
}

function responseKey(row) {
  return `${row.question_no}:${row.run_no}:${row.provider}`;
}

function answerExcerpt(answer, firstIndex) {
  if (!answer) return "";
  if (typeof firstIndex !== "number") return answer.slice(0, 160);
  const start = Math.max(0, firstIndex - 80);
  const end = Math.min(answer.length, firstIndex + 80);
  return answer.slice(start, end);
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
