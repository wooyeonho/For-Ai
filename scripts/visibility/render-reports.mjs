import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  domainList,
  escapeHtml,
  labelsFor,
  metricCards,
  metricPercent,
  questionRows,
  referenceRows,
  renderTemplate,
  sourcePlatformRows,
} from "./render-template.mjs";

export async function renderReports({ outDir, segment, questionPack, entities, parsedRows, scores, referenceRange, responses }) {
  await mkdir(outDir, { recursive: true });
  const style = await styleBlock();
  const labels = labelsFor(segment.locale);
  const questionPackLabel = `${questionPack.id} (${questionPack.version})`;
  const provider = segment.measurement_providers.join(", ");
  const inspectionDate = responses[0]?.measured_at?.slice(0, 10) || "sample";
  const allDomains = [...new Set(responses.flatMap((response) => response.cited_domains || []))];
  const responseByQuestion = new Map(responses.map((response) => [response.question_no, response]));

  await mkdir(path.join(outDir, "fa-r1-reports"), { recursive: true });
  await mkdir(path.join(outDir, "fa-d1-briefs"), { recursive: true });
  await mkdir(path.join(outDir, "fa-p1-profiles"), { recursive: true });

  const scoreByEntity = new Map(scores.map((score) => [score.entity_id, score]));
  const rowsByEntity = groupRowsByEntity(parsedRows || []);
  for (const entity of entities) {
    const score = scoreByEntity.get(entity.id);
    const entityRows = rowsByEntity.get(entity.id) || [];
    await writeFile(path.join(outDir, "fa-r1-reports", `${entity.id}-report.html`), await renderStandard({
      templateName: "fa-r1-report.html",
      title: labels.reportTitle,
      formId: "FORM FA-R1",
      labels,
      lang: segment.language,
      style,
      segment,
      entity,
      specimenId: `${segment.segment_id}:${entity.id}:FA-R1`,
      body: r1Body({ labels, segment, questionPack, questionPackLabel, provider, inspectionDate, score, referenceRange, allDomains, entityRows }),
    }));
    await writeFile(path.join(outDir, "fa-d1-briefs", `${entity.id}-brief.html`), await renderStandard({
      templateName: "fa-d1-brief.html",
      title: labels.briefTitle,
      formId: "FORM FA-D1",
      labels,
      lang: segment.language,
      style,
      segment,
      entity,
      specimenId: `${segment.segment_id}:${entity.id}:FA-D1`,
      body: d1Body({ labels, segment, questionPack, questionPackLabel, provider, inspectionDate, score, referenceRange, allDomains, entityRows, responseByQuestion }),
    }));
    await writeFile(path.join(outDir, "fa-p1-profiles", `${entity.id}-profile.html`), await renderStandard({
      templateName: "fa-p1-profile.html",
      title: labels.profileTitle,
      formId: "FORM FA-P1",
      labels,
      lang: segment.language,
      style,
      segment,
      entity,
      specimenId: `${segment.segment_id}:${entity.id}:FA-P1`,
      body: p1Body({ labels, segment, entity }),
    }));
  }

  await writeFile(path.join(outDir, "fa-s1-segment-stats.html"), await renderStandard({
    templateName: "fa-s1-segment-stats.html",
    title: labels.statsTitle,
    formId: "FORM FA-S1",
    labels,
    lang: segment.language,
    style,
    segment,
    entity: { name: segment.segment_id },
    specimenId: `${segment.segment_id}:FA-S1`,
    body: s1Body({ labels, segment, entities, questionPack, referenceRange, allDomains }),
  }));

  await writeFile(path.join(outDir, "fa-q1-question-pack.html"), await renderStandard({
    templateName: "fa-q1-question-pack.html",
    title: labels.questionPackTitle,
    formId: "FORM FA-Q1",
    labels,
    lang: segment.language,
    style,
    segment,
    entity: { name: questionPack.id },
    specimenId: `${questionPack.id}:FA-Q1`,
    body: q1Body({ labels, segment, questionPack, provider }),
  }));
}

async function styleBlock() {
  const { readFile } = await import("node:fs/promises");
  return readFile(path.join(process.cwd(), "templates", "visibility", "base-style.html"), "utf8");
}

async function renderStandard(context) {
  return renderTemplate(context.templateName, context);
}

function d1Body({ labels, segment, questionPack, questionPackLabel, provider, inspectionDate, score, referenceRange, allDomains, entityRows }) {
  return `
<section><h2>${labels.entitySnapshot}</h2><table><tr><th>${labels.entity}</th><td>${escapeHtml(score.entity_name)}</td></tr><tr><th>${labels.category}</th><td>${escapeHtml(segment.category_label)}</td></tr><tr><th>${labels.region}</th><td>${escapeHtml(segment.region)}</td></tr></table></section>
<section><h2>${labels.inspectionMetadata}</h2><table><tr><th>${labels.inspectionDate}</th><td>${inspectionDate}</td></tr><tr><th>${labels.questionPack}</th><td>${escapeHtml(questionPackLabel)}</td></tr><tr><th>${labels.measurementProvider}</th><td>${escapeHtml(provider)}</td></tr></table></section>
<section><h2>${labels.scoreSummary}</h2><div class="metrics">${metricCards(segment, score)}</div></section>
<section><h2>${labels.segmentComparison}</h2><table><tr><th>${labels.metric}</th><th>${labels.value}</th><th>${labels.median}</th><th>${labels.top25}</th></tr>${comparisonRows({ labels, segment, score, referenceRange })}</table></section>
<section><h2>${labels.sourceSnapshot}</h2><ul>${domainList(allDomains)}</ul></section>
<section><h2>${labels.sampleQuestions}</h2><table><tr><th>${labels.questionNo}</th><th>${labels.questionType}</th><th>${labels.question}</th><th>${labels.result}</th></tr>${sampleQuestionRows({ labels, segment, questionPack, entityRows })}</table></section>
<section><h2>${labels.interpretation}</h2>${interpretationBlocks({ labels, segment, score })}</section>
<section><h2>${labels.lockedReport}</h2><ul><li>${labels.lockedTranscripts}</li><li>${labels.lockedCompetitors}</li><li>${labels.lockedEvidence}</li><li>${labels.lockedCriteria}</li><li>${labels.lockedReinspection}</li></ul><p class="notice">${labels.locked}</p><a class="cta" href="#">${labels.paidCta}</a></section>
<section><p class="notice">${labels.noRanking}</p></section>`;
}

function r1Body({ labels, segment, questionPack, questionPackLabel, provider, inspectionDate, score, referenceRange, allDomains, entityRows }) {
  return `
<section><h2>${labels.summaryMetrics}</h2><div class="metrics">${metricCards(segment, score)}</div></section>
<section><h2>${labels.referenceScope}</h2><p>${escapeHtml(segment.reference_scope_label)}</p><table><tr><th>${labels.metric}</th><th>${labels.bottom25}</th><th>${labels.median}</th><th>${labels.top25}</th></tr>${referenceRows(segment, referenceRange)}</table></section>
<section><h2>${labels.questionBreakdown}</h2><table><tr><th>${labels.questionPack}</th><td>${escapeHtml(questionPackLabel)}</td></tr><tr><th>${labels.measurementProvider}</th><td>${escapeHtml(provider)}</td></tr><tr><th>${labels.inspectionDate}</th><td>${inspectionDate}</td></tr></table><table><tr><th>${labels.questionNo}</th><th>${labels.questionType}</th><th>${labels.question}</th><th>${labels.result}</th></tr>${sampleQuestionRows({ labels, segment, questionPack, entityRows, limit: questionPack.questions.length })}</table></section>
<section><h2>${labels.citedDomains}</h2><ul>${domainList(allDomains)}</ul></section>
<section><h2>${labels.evidenceNotice}</h2><p>${labels.evidenceNoticeText}</p></section>
<section><h2>${labels.interpretation}</h2>${interpretationBlocks({ labels, segment, score })}</section>
<section><h2>${labels.improvement}</h2><ul><li><strong>${labels.immediatelyVerifiable}:</strong> ${labels.normalizeFacts}</li><li><strong>${labels.observation2To6Weeks}:</strong> ${labels.addCriteriaFaq}</li><li><strong>${labels.longTermObservation}:</strong> ${labels.repeatInspection}</li></ul></section>
<section><h2>${labels.reinspect}</h2><p class="mono">+30 days after profile updates</p></section>`;
}

function p1Body({ labels, segment, entity }) {
  const criteria = segment.criteria_keywords.map((keyword) => `<tr><td>${escapeHtml(keyword)}</td><td>${labels.needsSourceCoverage}</td></tr>`).join("");
  return `
<section><h2>${labels.topNotice}</h2><p>${labels.profileNotice}</p></section>
<section><h2>${labels.basicEntityInfo}</h2><table><tr><th>${labels.name}</th><td>${escapeHtml(entity.name)}</td></tr><tr><th>${labels.representative}</th><td>${escapeHtml(entity.representative)}</td></tr><tr><th>${labels.address}</th><td>${escapeHtml(entity.address)}</td></tr><tr><th>${labels.homepage}</th><td>${escapeHtml(entity.homepage)}</td></tr></table></section>
<section><h2>${labels.aiReadableSummary}</h2><p>${escapeHtml(entity.name)} · ${escapeHtml(segment.entity_label)} · ${escapeHtml(segment.region)} · FA-VIS v1</p></section>
<section><h2>${labels.servicesCriteria}</h2><table><tr><th>${labels.criteria}</th><th>${labels.status}</th></tr>${criteria}</table></section>
<section><h2>${labels.faq}</h2><p>${labels.faqText}</p></section>
<section><h2>${labels.structuredDataPreview}</h2><pre class="mono">{"@type":"${escapeHtml(segment.entity_type)}","name":"${escapeHtml(entity.name)}"}</pre></section>
<section><h2>${labels.observationStatus}</h2><p>${labels.needsVerification}</p></section>`;
}

function s1Body({ labels, segment, entities, questionPack, referenceRange, allDomains }) {
  return `
<section><h2>${labels.segmentTitle}</h2><p>${escapeHtml(segment.segment_id)}</p></section>
<section><h2>${labels.sampleSize}</h2><p class="mono">${entities.length} ${labels.entity} · ${questionPack.questions.length} ${labels.question}</p></section>
<section><h2>${labels.median} / ${labels.top25} / ${labels.bottom25}</h2><table><tr><th>${labels.metric}</th><th>${labels.bottom25}</th><th>${labels.median}</th><th>${labels.top25}</th></tr>${referenceRows(segment, referenceRange)}</table></section>
<section><h2>${labels.sourceDistribution}</h2><ul>${domainList(allDomains)}</ul><table><tr><th>${labels.platform}</th><th>${labels.observation}</th></tr>${sourcePlatformRows(segment)}</table></section>
<section><p class="notice">${labels.noRanking}</p></section>`;
}

function q1Body({ labels, segment, questionPack, provider }) {
  return `
<section><h2>${labels.segmentMetadata}</h2><table><tr><th>segment_id</th><td>${escapeHtml(segment.segment_id)}</td></tr><tr><th>country</th><td>${escapeHtml(segment.country)}</td></tr><tr><th>locale</th><td>${escapeHtml(segment.locale)}</td></tr><tr><th>category</th><td>${escapeHtml(segment.category)}</td></tr></table></section>
<section><h2>${labels.questionTypes}</h2><p>${segment.question_types.map((type) => labels[type]).join(", ")}</p></section>
<section><h2>${labels.questionList}</h2><table><tr><th>${labels.questionNo}</th><th>${labels.questionType}</th><th>${labels.question}</th></tr>${questionRows(segment, questionPack)}</table></section>
<section><h2>${labels.repetitionCount}</h2><p class="mono">${labels.mockRunCount}</p></section>
<section><h2>${labels.measurementProvider}</h2><p>${escapeHtml(provider)}</p></section>
<section><h2>${labels.versionHistory}</h2><p class="mono">${escapeHtml(questionPack.version)}: ${labels.initialSample}</p></section>`;
}

function comparisonRows({ labels, segment, score, referenceRange }) {
  return segment.metrics.filter((key) => typeof referenceRange[key]?.median === "number").map((key) => `
    <tr><td>${labels[key]}</td><td>${metricPercent(score[key])}</td><td>${metricPercent(referenceRange[key].median)}</td><td>${metricPercent(referenceRange[key].top25)}</td></tr>`).join("");
}

function sampleQuestionRows({ labels, segment, questionPack, entityRows, limit = 3 }) {
  const rowsByQuestion = new Map(entityRows.map((row) => [row.question_no, row]));
  return questionPack.questions.slice(0, limit).map((question) => {
    const row = rowsByQuestion.get(question.no);
    const result = [row?.mentioned ? labels.mentioned : labels.notMentioned, row?.cited ? labels.cited : labels.notCited].join(" / ");
    return `<tr><td>${question.no}</td><td>${labels[question.type]}</td><td>${escapeHtml(question.text)}</td><td>${result}</td></tr>`;
  }).join("");
}

function interpretationBlocks({ labels, segment, score }) {
  return `<h3>${labels.currentState}</h3><p>${currentState(labels, score)}</p><h3>${labels.mainGap}</h3><p>${mainGap(labels, score)}</p><h3>${labels.likelyPath}</h3><p>${likelyPath(segment)}</p>`;
}

function currentState(labels, score) {
  return labels.currentState === "현재 상태"
    ? `현재 예시 직접 언급률은 ${Math.round(score.direct_mention_rate * 100)}%입니다.`
    : `Current sample direct mention rate is ${Math.round(score.direct_mention_rate * 100)}%.`;
}
function mainGap(labels, score) {
  if (labels.currentState === "현재 상태") {
    return score.direct_mention_rate === 0 ? "추천형 질문에서 직접 발견되는 근거가 부족합니다." : "일부 질문에서는 보이지만 선택기준과 출처 보강이 필요합니다.";
  }
  return score.direct_mention_rate === 0 ? "The main gap is direct entity discovery in recommendation contexts." : "The entity is visible in some contexts but still needs criteria/source reinforcement.";
}
function likelyPath(segment) {
  return `FA-VIS: ${segment.source_platforms.slice(0, 3).join(", ")} · ${segment.criteria_keywords.slice(0, 3).join(", ")}`;
}

function groupRowsByEntity(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.entity_id)) grouped.set(row.entity_id, []);
    grouped.get(row.entity_id).push(row);
  }
  return grouped;
}
