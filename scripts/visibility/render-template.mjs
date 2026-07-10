import { readFile } from "node:fs/promises";
import path from "node:path";
import { metricPercent } from "./score-entities.mjs";
export { metricPercent };

export const LABELS = {
  ko: {
    reportTitle: "For AI 노출검사 결과지",
    briefTitle: "For AI 예비분석 1장",
    profileTitle: "For AI 구조화 엔티티 프로필",
    statsTitle: "For AI 세그먼트 통계 리포트",
    questionPackTitle: "For AI 질문팩 명세서",
    form: "FORM",
    entity: "엔티티",
    category: "카테고리",
    region: "지역",
    inspectionDate: "검사일",
    questionPack: "질문팩",
    measurementProvider: "측정채널",
    specimenId: "표본 ID",
    referenceScope: "참고범위",
    summaryMetrics: "요약 지표",
    direct_mention_rate: "직접 언급률",
    source_citation_rate: "출처 인용률",
    competitor_first_rate: "경쟁 선노출률",
    criteria_connection_rate: "선택기준 연결률",
    information_accuracy: "정보 정확도",
    recommendation: "추천형",
    problem: "문제해결형",
    trigger: "상황형",
    questionBreakdown: "질문 유형별 결과",
    citedDomains: "인용 출처 도메인",
    interpretation: "해석",
    improvement: "개선 우선순위",
    disclaimer: "고지",
    reinspect: "재검사일",
    sampleStamp: "예시",
    locked: "잠금 섹션: 질문별 전문과 경쟁 출처 분석은 상세 리포트에서 제공합니다.",
    cta: "상세 리포트 요청하기",
    noRanking: "공개 순위표가 아니며 낮은 점수 엔티티의 실명을 공개하지 않습니다.",
    metric: "지표",
    bottom25: "하위 25%",
    median: "중앙값",
    top25: "상위 25%",
    value: "값",
    entitySnapshot: "엔티티 요약",
    inspectionMetadata: "검사 정보",
    scoreSummary: "점수 요약",
    segmentComparison: "세그먼트 비교",
    sourceSnapshot: "출처 도메인 스냅샷",
    sampleQuestions: "샘플 질문 3개",
    lockedReport: "FA-R1 상세 리포트에서 제공되는 내용",
    paidCta: "FA-R1 상세 리포트 요청",
    currentState: "현재 상태",
    mainGap: "주요 격차",
    likelyPath: "개선 가능 경로",
    mentioned: "언급",
    notMentioned: "미언급",
    cited: "인용",
    notCited: "미인용",
    questionNo: "번호",
    questionType: "유형",
    question: "질문",
    result: "결과",
    lockedTranscripts: "질문별 AI 응답 전문",
    lockedCompetitors: "경쟁 엔티티 출처 분석",
    lockedEvidence: "증거 발췌와 매칭 근거",
    lockedCriteria: "선택기준별 정보 격차",
    lockedReinspection: "재검사 계획",
    immediatelyVerifiable: "즉시 확인 가능",
    observation2To6Weeks: "2–6주 관찰",
    longTermObservation: "장기 관찰",
    normalizeFacts: "주요 공개 프로필의 엔티티 정보를 동일하게 정리합니다.",
    addCriteriaFaq: "선택기준별 페이지 또는 FAQ 블록을 추가하고 변화를 관찰합니다.",
    repeatInspection: "같은 질문팩으로 FA-VIS 검사를 반복합니다.",
    evidenceNotice: "증거 고지",
    evidenceNoticeText: "본 결과는 저장된 질문, 응답 원문, 출처 도메인, 엔티티 매칭 로그로 추적할 수 있습니다.",
    topNotice: "상단 고지",
    profileNotice: "이 프로필은 AI가 읽기 쉬운 엔티티 정보 샘플입니다. 출처로 검증된 사실 기록이 아닙니다.",
    basicEntityInfo: "기본 엔티티 정보",
    name: "이름",
    representative: "대표자",
    address: "주소",
    homepage: "홈페이지",
    aiReadableSummary: "AI-readable 요약",
    servicesCriteria: "서비스 / 선택기준 표",
    criteria: "선택기준",
    status: "상태",
    needsSourceCoverage: "출처 기반 프로필 보강 필요",
    faq: "FAQ",
    faqText: "FAQ 블록은 세그먼트 선택기준에 대해 출처 기반이며 크롤 가능한 문장으로 답해야 합니다.",
    structuredDataPreview: "구조화 데이터 미리보기",
    observationStatus: "관찰 상태",
    needsVerification: "예시 / 확인 필요",
    segmentTitle: "세그먼트 제목",
    sampleSize: "샘플 크기",
    sourceDistribution: "출처 도메인 분포",
    platform: "플랫폼",
    observation: "관찰값",
    sampleObservation: "예시",
    segmentMetadata: "세그먼트 메타데이터",
    questionTypes: "질문 유형",
    questionList: "질문 목록",
    repetitionCount: "반복 측정 수",
    versionHistory: "버전 이력",
    initialSample: "초기 FA-Q1 예시",
    mockRunCount: "mock 실행 수: 1",
  },
  en: {
    reportTitle: "For AI Visibility Inspection Report",
    briefTitle: "For AI Preliminary Visibility Brief",
    profileTitle: "For AI Structured Entity Profile",
    statsTitle: "For AI Segment Statistics Report",
    questionPackTitle: "For AI Question Pack Manifest",
    form: "FORM",
    entity: "Entity",
    category: "Category",
    region: "Region",
    inspectionDate: "Inspection Date",
    questionPack: "Question Pack",
    measurementProvider: "Measurement Provider",
    specimenId: "Specimen ID",
    referenceScope: "Reference Scope",
    summaryMetrics: "Summary Metrics",
    direct_mention_rate: "Direct Mention Rate",
    source_citation_rate: "Source Citation Rate",
    competitor_first_rate: "Competitor First Rate",
    criteria_connection_rate: "Criteria Connection Rate",
    information_accuracy: "Information Accuracy",
    recommendation: "Recommendation",
    problem: "Problem",
    trigger: "Trigger",
    questionBreakdown: "Question-Type Breakdown",
    citedDomains: "Cited Source Domains",
    interpretation: "Interpretation",
    improvement: "Improvement Priorities",
    disclaimer: "Disclaimer",
    reinspect: "Re-inspection Date",
    sampleStamp: "Sample",
    locked: "Locked section: full question transcripts and competitor source analysis are available in the detailed report.",
    cta: "Request detailed report",
    noRanking: "This is not a public ranking, and low-scoring entity names are not disclosed publicly.",
    metric: "Metric",
    bottom25: "Bottom 25%",
    median: "Median",
    top25: "Top 25%",
    value: "Value",
    entitySnapshot: "Entity Snapshot",
    inspectionMetadata: "Inspection Metadata",
    scoreSummary: "Score Summary",
    segmentComparison: "Segment Comparison",
    sourceSnapshot: "Source Domain Snapshot",
    sampleQuestions: "Three Sample Questions",
    lockedReport: "Available in the FA-R1 Detailed Report",
    paidCta: "Request FA-R1 Detailed Report",
    currentState: "Current State",
    mainGap: "Main Gap",
    likelyPath: "Likely Improvement Path",
    mentioned: "Mentioned",
    notMentioned: "Not mentioned",
    cited: "Cited",
    notCited: "Not cited",
    questionNo: "No",
    questionType: "Type",
    question: "Question",
    result: "Result",
    lockedTranscripts: "Full AI answer transcripts by question",
    lockedCompetitors: "Competitor source analysis",
    lockedEvidence: "Evidence excerpts and matching rationale",
    lockedCriteria: "Criteria-specific information gaps",
    lockedReinspection: "Re-inspection plan",
    immediatelyVerifiable: "Immediately verifiable",
    observation2To6Weeks: "2–6 week observation",
    longTermObservation: "Long-term observation",
    normalizeFacts: "Normalize entity facts across primary public profiles.",
    addCriteriaFaq: "Add criteria-specific pages or FAQ blocks and observe changes.",
    repeatInspection: "Repeat FA-VIS inspection on the same question pack.",
    evidenceNotice: "Evidence Notice",
    evidenceNoticeText: "This result can be traced to stored questions, answer text, cited domains, and entity matching logs.",
    topNotice: "Top Notice",
    profileNotice: "This profile is a structured sample for AI-readable entity facts. It is not a verified factual claim record.",
    basicEntityInfo: "Basic Entity Information",
    name: "Name",
    representative: "Representative",
    address: "Address",
    homepage: "Homepage",
    aiReadableSummary: "AI-readable Summary",
    servicesCriteria: "Services / Criteria Table",
    criteria: "Criteria",
    status: "Status",
    needsSourceCoverage: "Needs source-backed profile coverage",
    faq: "FAQ",
    faqText: "FAQ blocks should answer segment criteria in source-backed, crawlable language.",
    structuredDataPreview: "Structured Data Preview",
    observationStatus: "Observation Status",
    needsVerification: "sample / needs verification",
    segmentTitle: "Segment Title",
    sampleSize: "Sample Size",
    sourceDistribution: "Source Domain Distribution",
    platform: "Platform",
    observation: "Observation",
    sampleObservation: "sample",
    segmentMetadata: "Segment Metadata",
    questionTypes: "Question Types",
    questionList: "Question List",
    repetitionCount: "Repetition Count",
    versionHistory: "Version History",
    initialSample: "initial FA-Q1 sample",
    mockRunCount: "mock run count: 1",
  },
};

export function labelsFor(locale) {
  return LABELS[String(locale || "").startsWith("ko") ? "ko" : "en"];
}

export async function renderTemplate(templateName, context) {
  const template = await readFile(path.join(process.cwd(), "templates", "visibility", templateName), "utf8");
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => String(resolve(context, key) ?? ""));
}

export function metricCards(segment, score) {
  const labels = labelsFor(segment.locale);
  return segment.metrics.map((key) => `
    <div class="metric-card">
      <span>${escapeHtml(labels[key])}</span>
      <strong>${escapeHtml(metricPercent(score[key]))}</strong>
    </div>`).join("");
}

export function questionRows(segment, questionPack) {
  const labels = labelsFor(segment.locale);
  return questionPack.questions.map((question) => `
    <tr><td>${question.no}</td><td>${escapeHtml(labels[question.type])}</td><td>${escapeHtml(question.text)}</td></tr>`).join("");
}

export function referenceRows(segment, referenceRange) {
  const labels = labelsFor(segment.locale);
  return segment.metrics.filter((key) => typeof referenceRange[key]?.median === "number").map((key) => `
    <tr><td>${escapeHtml(labels[key])}</td><td>${metricPercent(referenceRange[key].bottom25)}</td><td>${metricPercent(referenceRange[key].median)}</td><td>${metricPercent(referenceRange[key].top25)}</td></tr>`).join("");
}

export function domainList(domains) {
  return domains.map((domain) => `<li>${escapeHtml(domain)}</li>`).join("");
}

export function sourcePlatformRows(segment) {
  const labels = labelsFor(segment.locale);
  return segment.source_platforms.map((platform) => `<tr><td>${escapeHtml(platform)}</td><td>${escapeHtml(labels.sampleObservation)}</td></tr>`).join("");
}

export function escapeHtml(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function resolve(object, key) {
  return key.split(".").reduce((value, part) => value?.[part], object);
}
