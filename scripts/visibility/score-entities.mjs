import { METRIC_KEYS } from "./load-segment.mjs";

export function scoreEntities({ segment, questionPack, entities, parsedRows }) {
  const questionByNo = new Map(questionPack.questions.map((question) => [question.no, question]));
  const rowsByEntity = new Map(entities.map((entity) => [entity.id, []]));
  for (const row of parsedRows) rowsByEntity.get(row.entity_id)?.push(row);

  return entities.map((entity) => {
    const rows = rowsByEntity.get(entity.id) || [];
    const recommendation = rows.filter((row) => questionByNo.get(row.question_no)?.type === "recommendation");
    const problemTrigger = rows.filter((row) => ["problem", "trigger"].includes(questionByNo.get(row.question_no)?.type));
    const criteriaRows = rows.filter((row) => {
      const question = questionByNo.get(row.question_no)?.text || "";
      return segment.criteria_keywords.some((keyword) => question.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()));
    });
    const mentionedRows = rows.filter((row) => row.mentioned);
    const score = {
      entity_id: entity.id,
      entity_name: entity.name,
      grade: entity.grade,
      direct_mention_rate: rate(recommendation.filter((row) => row.mentioned).length, recommendation.length),
      source_citation_rate: rate(problemTrigger.filter((row) => row.cited).length, problemTrigger.length),
      competitor_first_rate: rate(rows.filter((row) => row.mention_rank && row.mention_rank > 1).length, rows.length),
      criteria_connection_rate: rate(criteriaRows.filter((row) => row.mentioned || row.cited).length, criteriaRows.length),
      information_accuracy: "sample",
      mentioned_count: mentionedRows.length,
      cited_count: rows.filter((row) => row.cited).length,
      total_measurements: rows.length,
    };
    for (const key of METRIC_KEYS) {
      if (!(key in score)) throw new Error(`Missing metric ${key}`);
    }
    return score;
  });
}

export function metricPercent(value) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : value;
}

function rate(numerator, denominator) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(4));
}
