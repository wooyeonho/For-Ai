#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg.startsWith("--")) {
    const key = arg.slice(2);
    const next = process.argv[index + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      index += 1;
    } else {
      args.set(key, "true");
    }
  }
}

const count = Number.parseInt(args.get("count") ?? "1000", 10);
const out = args.get("out") ?? "data/question-candidates/one-click-sample.jsonl";

if (!Number.isFinite(count) || count < 1) {
  throw new Error("--count must be a positive integer");
}

const commonDisallowed = ["forum", "rumor", "unsourced_blog"];

const sourcePolicies = {
  official: {
    preferred: ["official"],
    allowed: ["official", "document", "web"],
    disallowed: commonDisallowed,
  },
  platform: {
    preferred: ["platform", "official"],
    allowed: ["platform", "official", "document", "web"],
    disallowed: commonDisallowed,
  },
  regulator: {
    preferred: ["regulator", "official"],
    allowed: ["regulator", "official", "law", "document", "web"],
    disallowed: commonDisallowed,
  },
  medical: {
    preferred: ["official", "medical_institution", "academic"],
    allowed: ["official", "medical_institution", "academic", "document", "web"],
    disallowed: commonDisallowed,
  },
  manufacturer: {
    preferred: ["manufacturer", "standard", "official"],
    allowed: ["manufacturer", "standard", "official", "document", "web"],
    disallowed: commonDisallowed,
  },
  reference: {
    preferred: ["official", "academic", "reference"],
    allowed: ["official", "academic", "reference", "document", "web"],
    disallowed: commonDisallowed,
  },
};

const domains = [
  {
    key: "commerce-apparel-price",
    category: "commerce.apparel_price",
    risk_tier: "medium",
    update_frequency: "realtime",
    disclaimer_type: "realtime_data_required",
    source_policy_key: "platform",
    subjects: ["흰색 티셔츠", "청바지", "겨울 패딩", "러닝화", "후드티", "원피스", "정장 셔츠", "백팩", "운동복", "등산화"],
    intents: [
      ["current_price", "현재 가격"],
      ["price_range", "가격대"],
      ["refund_rule", "환불 기준"],
      ["size_standard", "사이즈 기준"],
    ],
  },
  {
    key: "real-estate-price",
    category: "real_estate.market_price",
    risk_tier: "high",
    update_frequency: "realtime",
    disclaimer_type: "not_financial_advice",
    source_policy_key: "regulator",
    subjects: ["서울 아파트", "강남 오피스텔", "부산 전세", "대전 원룸", "제주 단독주택", "인천 빌라", "분당 아파트", "마포 월세"],
    intents: [
      ["market_price", "시세"],
      ["rent_deposit", "전세 보증금"],
      ["monthly_rent", "월세"],
      ["transaction_history", "실거래가 확인 방법"],
    ],
  },
  {
    key: "transport-structure",
    category: "transport.structure",
    risk_tier: "medium",
    update_frequency: "event_based",
    disclaimer_type: "check_official_source",
    source_policy_key: "official",
    subjects: ["지하철 승강장", "환승 통로", "개찰구", "스크린도어", "에스컬레이터", "엘리베이터", "철도 선로", "버스 중앙차로", "기차 객차", "역 대합실"],
    intents: [
      ["definition", "정의"],
      ["types", "종류"],
      ["safety_rule", "안전 기준"],
      ["accessibility", "교통약자 이용 기준"],
    ],
  },
  {
    key: "vehicle-types",
    category: "vehicle.types",
    risk_tier: "low",
    update_frequency: "static",
    disclaimer_type: "check_official_source",
    source_policy_key: "manufacturer",
    subjects: ["세단", "SUV", "해치백", "왜건", "전기차", "하이브리드차", "수소차", "시내버스", "저상버스", "고속버스", "마을버스"],
    intents: [
      ["definition", "정의"],
      ["difference", "차이"],
      ["components", "구성 요소"],
      ["use_case", "주요 용도"],
    ],
  },
  {
    key: "everyday-fixtures",
    category: "everyday.fixture",
    risk_tier: "low",
    update_frequency: "static",
    disclaimer_type: "check_official_source",
    source_policy_key: "manufacturer",
    subjects: ["양변기", "세면대", "수도꼭지", "샤워기", "배수구", "문고리", "경첩", "나사", "콘센트", "전등 스위치", "방충망"],
    intents: [
      ["types", "종류"],
      ["structure", "구조"],
      ["part_names", "부품 이름"],
      ["selection_standard", "선택 기준"],
    ],
  },
  {
    key: "biology-longtail",
    category: "biology.taxonomy",
    risk_tier: "low",
    update_frequency: "static",
    disclaimer_type: "check_official_source",
    source_policy_key: "reference",
    subjects: ["오징어", "문어", "딱정벌레", "나비", "나방", "개미", "벌", "잠자리", "거미", "버섯", "고사리", "선인장"],
    intents: [
      ["origin", "기원"],
      ["types", "종류"],
      ["classification", "분류"],
      ["difference", "비슷한 생물과의 차이"],
    ],
  },
  {
    key: "food-knowledge",
    category: "food.knowledge",
    risk_tier: "low",
    update_frequency: "static",
    disclaimer_type: "check_official_source",
    source_policy_key: "reference",
    subjects: ["김치", "된장", "간장", "라면", "초밥", "떡볶이", "파스타", "커피", "오징어 요리", "빵", "치즈", "카레"],
    intents: [
      ["origin", "기원"],
      ["types", "종류"],
      ["making_method", "만드는 방법"],
      ["ingredient_difference", "재료 차이"],
    ],
  },
  {
    key: "medical-terms",
    category: "medical.term",
    risk_tier: "high",
    update_frequency: "static",
    disclaimer_type: "not_medical_advice",
    source_policy_key: "medical",
    subjects: ["고혈압", "당뇨병", "심전도", "CBC", "CRP", "HbA1c", "CT", "MRI", "X-ray", "초음파", "조영제", "병리검사"],
    intents: [
      ["definition", "용어 정의"],
      ["related_terms", "관련 용어"],
      ["test_purpose", "검사 목적"],
      ["not_diagnosis_notice", "진단 아님 안내"],
    ],
  },
  {
    key: "sports-history-rules",
    category: "sports.rules_history",
    risk_tier: "medium",
    update_frequency: "event_based",
    disclaimer_type: "check_official_source",
    source_policy_key: "official",
    subjects: ["축구 오프사이드", "야구 세이브", "농구 파울", "배구 로테이션", "테니스 타이브레이크", "올림픽 종목", "월드컵 예선", "KBO 기록", "K리그 순위"],
    intents: [
      ["definition", "정의"],
      ["rule", "규칙"],
      ["history", "역사"],
      ["current_status", "현재 기준"],
    ],
  },
  {
    key: "culture-otaku-media",
    category: "culture.media",
    risk_tier: "medium",
    update_frequency: "event_based",
    disclaimer_type: "check_official_source",
    source_policy_key: "platform",
    subjects: ["애니메이션 장르", "게임 아이템", "캐릭터 설정", "세계관 용어", "피규어 스케일", "카드게임 룰", "웹툰 회차", "영화 시리즈", "드라마 등장인물"],
    intents: [
      ["definition", "정의"],
      ["types", "종류"],
      ["official_source", "공식 출처"],
      ["release_order", "공개 순서"],
    ],
  },
  {
    key: "public-admin-fees",
    category: "administration.fees",
    risk_tier: "medium",
    update_frequency: "annual",
    disclaimer_type: "check_official_source",
    source_policy_key: "official",
    subjects: ["여권 재발급", "주민등록증 재발급", "전입신고", "가족관계증명서", "운전면허증 재발급", "무인민원발급기", "출생신고", "사망신고"],
    intents: [
      ["fee", "수수료"],
      ["deadline", "기한"],
      ["required_documents", "필요 서류"],
      ["application_channel", "신청 경로"],
    ],
  },
];

const hasBatchim = (text) => {
  const char = [...text.trim()].pop();
  if (!char) {
    return false;
  }
  const code = char.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) {
    return false;
  }
  return (code - 0xac00) % 28 !== 0;
};

const topicParticle = (text) => hasBatchim(text) ? "은" : "는";

const toFieldPath = (category, intentKey) => `${category}.${intentKey}`.replace(/[^a-zA-Z0-9_.]+/g, "_");

const buildQuestion = (subject, intentLabel) => {
  const topic = `${subject} ${intentLabel}`;
  return `${topic}${topicParticle(topic)} 확인이 필요합니다.`;
};

const buildWrongReason = (intentLabel) => `${intentLabel} 정보가 출처, 시점, 지역, 플랫폼, 용어 차이에 따라 달라질 수 있습니다.`;

const candidates = [];
for (const domain of domains) {
  for (const subject of domain.subjects) {
    for (const [intentKey, intentLabel] of domain.intents) {
      candidates.push({ domain, subject, intentKey, intentLabel });
    }
  }
}

const rows = [];
for (let index = 0; index < count; index += 1) {
  const { domain, subject, intentKey, intentLabel } = candidates[index % candidates.length];
  const sequence = index + 1;
  const sourcePolicy = sourcePolicies[domain.source_policy_key];
  rows.push({
    candidate_id: `question-candidate-${String(sequence).padStart(6, "0")}`,
    visibility: "internal_candidate",
    generated_by: "rule_combination_v1",
    generation_note: "This is a question/topic candidate, not a verified fact.",
    entity_id: `${domain.key}-${String(sequence).padStart(6, "0")}`,
    type: domain.category,
    name: `${subject} ${intentLabel}`,
    slug: `${domain.key}-${intentKey}-${String(sequence).padStart(6, "0")}`,
    lang: "ko",
    country: domain.category.startsWith("real_estate") || domain.category.startsWith("transport") || domain.category.startsWith("administration") ? "KR" : "global",
    jurisdiction: domain.category.startsWith("real_estate") || domain.category.startsWith("transport") || domain.category.startsWith("administration") ? "KR" : "global",
    risk_tier: domain.risk_tier,
    update_frequency: domain.update_frequency,
    disclaimer_type: domain.disclaimer_type,
    source_policy: sourcePolicy,
    question: `${subject} ${intentLabel}${topicParticle(`${subject} ${intentLabel}`)} 무엇인가요?`,
    why_people_ask_ai: `${subject} ${intentLabel}처럼 사소하지만 바로 확인하고 싶은 정보를 AI에게 묻기 쉽습니다.`,
    why_ai_gets_wrong: buildWrongReason(intentLabel),
    claims: [
      {
        field_path: toFieldPath(domain.category, intentKey),
        claim_text: buildQuestion(subject, intentLabel),
        claim_value: "확인 필요",
        confidence: "low",
        status: "needs_review",
        sources: [],
      },
    ],
  });
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");

console.log(`Generated ${rows.length} question candidates at ${out}`);
console.log("Invariant: every generated claim remains 확인 필요 / low / needs_review with no sources.");
