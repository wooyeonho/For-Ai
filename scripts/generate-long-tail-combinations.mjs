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

const count = Number.parseInt(args.get("count") ?? "120", 10);
const out = args.get("out") ?? "data/topic-candidates/long-tail-combination-sample.jsonl";

const commonDisallowed = ["forum", "rumor", "unsourced_blog"];


const transportFareFieldPaths = [
  ["fare.base", "기본요금"],
  ["fare.airport", "공항 요금"],
  ["fare.daily_cap", "일일 상한 요금"],
  ["fare.card_required", "교통카드 필수 여부"],
  ["transfer.rule", "환승 규칙"],
  ["payment.contactless", "비접촉 결제 지원"],
  ["children.discount", "어린이 할인"],
  ["last_updated_by_operator", "운영기관 최종 갱신일"],
];

const domains = [
  {
    prefix: "medical-term",
    type: "medical.term",
    risk_tier: "high",
    update_frequency: "static",
    disclaimer_type: "not_medical_advice",
    country: "global",
    jurisdiction: "global",
    source_policy: {
      preferred: ["official", "document"],
      allowed: ["official", "document", "web"],
      disallowed: commonDisallowed,
    },
    subjects: ["고혈압 의학용어", "당뇨병 의학용어", "심전도 용어", "염증 수치 용어", "간수치 용어", "혈압 용어"],
    facets: [
      ["definition", "정의"],
      ["related_terms", "관련 용어"],
      ["common_context", "일반적으로 쓰이는 맥락"],
    ],
  },
  {
    prefix: "clinical-pathology",
    type: "clinical_pathology.lab",
    risk_tier: "high",
    update_frequency: "static",
    disclaimer_type: "not_medical_advice",
    country: "global",
    jurisdiction: "global",
    source_policy: {
      preferred: ["official", "document"],
      allowed: ["official", "document", "web"],
      disallowed: commonDisallowed,
    },
    subjects: ["CBC 혈액검사", "소변검사", "간기능 검사", "CRP 검사", "HbA1c 검사", "혈액응고 검사"],
    facets: [
      ["items", "주요 항목"],
      ["purpose", "검사 목적"],
      ["sample_type", "검체 종류"],
    ],
  },
  {
    prefix: "radiology",
    type: "radiology.imaging",
    risk_tier: "high",
    update_frequency: "static",
    disclaimer_type: "not_medical_advice",
    country: "global",
    jurisdiction: "global",
    source_policy: {
      preferred: ["official", "document"],
      allowed: ["official", "document", "web"],
      disallowed: commonDisallowed,
    },
    subjects: ["CT 검사", "MRI 검사", "X-ray 검사", "초음파 검사", "PET-CT 검사", "조영제"],
    facets: [
      ["modality", "검사 방식"],
      ["difference", "다른 검사와의 차이"],
      ["terminology", "관련 용어"],
    ],
  },
  {
    prefix: "vehicle",
    type: "vehicle.car",
    risk_tier: "low",
    update_frequency: "static",
    disclaimer_type: "check_official_source",
    country: "global",
    jurisdiction: "global",
    source_policy: {
      preferred: ["official", "document"],
      allowed: ["official", "document", "web"],
      disallowed: commonDisallowed,
    },
    subjects: ["자동차 차체 종류", "SUV와 세단", "하이브리드 자동차", "전기차 충전 방식", "가솔린 엔진", "디젤 엔진"],
    facets: [
      ["types", "종류"],
      ["difference", "차이"],
      ["components", "구성 요소"],
    ],
  },
  {
    prefix: "transport-fare",
    type: "transport.fare",
    risk_tier: "medium",
    update_frequency: "event_based",
    disclaimer_type: "check_official_source",
    country: "KR",
    jurisdiction: "KR",
    source_policy: {
      preferred: ["official"],
      allowed: ["official", "document", "platform", "web"],
      disallowed: commonDisallowed,
      note: "Transport fare claims should prioritize the official transport agency/operator source for each claim.",
    },
    subjects: ["시내버스 요금", "마을버스 요금", "광역버스 요금", "지하철 요금", "공항철도 요금", "공항버스 요금"],
    facets: transportFareFieldPaths,
  },
  {
    prefix: "rail",
    type: "rail.train",
    risk_tier: "medium",
    update_frequency: "event_based",
    disclaimer_type: "check_official_source",
    country: "KR",
    jurisdiction: "KR",
    source_policy: {
      preferred: ["official", "platform"],
      allowed: ["official", "platform", "document", "web"],
      disallowed: commonDisallowed,
    },
    subjects: ["기차 종류", "KTX", "ITX", "무궁화호", "광역전철", "공항철도"],
    facets: [
      ["types", "종류"],
      ["difference", "차이"],
      ["route_context", "운행 맥락"],
    ],
  },
  {
    prefix: "subway",
    type: "transport.structure",
    risk_tier: "low",
    update_frequency: "event_based",
    disclaimer_type: "check_official_source",
    country: "KR",
    jurisdiction: "KR",
    source_policy: {
      preferred: ["official", "platform"],
      allowed: ["official", "platform", "document", "web"],
      disallowed: commonDisallowed,
    },
    subjects: ["지하철역 구조", "승강장 종류", "환승통로", "스크린도어", "개찰구", "역명 체계"],
    facets: [
      ["components", "구성 요소"],
      ["types", "종류"],
      ["safety_context", "안전 관련 맥락"],
    ],
  },
  {
    prefix: "plumbing",
    type: "plumbing.fixture",
    risk_tier: "low",
    update_frequency: "static",
    disclaimer_type: "check_official_source",
    country: "global",
    jurisdiction: "global",
    source_policy: {
      preferred: ["official", "document"],
      allowed: ["official", "document", "web"],
      disallowed: commonDisallowed,
    },
    subjects: ["양변기 종류", "세면대 종류", "수도꼭지 종류", "샤워기 종류", "배수구 트랩", "비데 종류"],
    facets: [
      ["type_categories", "종류"],
      ["components", "구성 요소"],
      ["installation_context", "설치 맥락"],
    ],
  },
  {
    prefix: "biology-insect",
    type: "biology.insect",
    risk_tier: "low",
    update_frequency: "static",
    disclaimer_type: "check_official_source",
    country: "global",
    jurisdiction: "global",
    source_policy: {
      preferred: ["official", "document"],
      allowed: ["official", "document", "web"],
      disallowed: commonDisallowed,
    },
    subjects: ["곤충의 종류", "딱정벌레", "나비와 나방", "개미", "벌", "잠자리"],
    facets: [
      ["classification", "분류 체계"],
      ["identification_features", "식별 특징"],
      ["habitat_context", "서식 맥락"],
    ],
  },
  {
    prefix: "hardware",
    type: "hardware.standard",
    risk_tier: "low",
    update_frequency: "static",
    disclaimer_type: "check_official_source",
    country: "global",
    jurisdiction: "global",
    source_policy: {
      preferred: ["official", "document"],
      allowed: ["official", "document", "web"],
      disallowed: commonDisallowed,
    },
    subjects: ["나사 규격", "볼트 종류", "너트 종류", "드라이버 비트", "렌치 종류", "못 종류"],
    facets: [
      ["types", "종류"],
      ["size_standard", "규격"],
      ["use_context", "사용 맥락"],
    ],
  },
  {
    prefix: "electricity",
    type: "electricity.fixture",
    risk_tier: "medium",
    update_frequency: "static",
    disclaimer_type: "check_official_source",
    country: "global",
    jurisdiction: "global",
    source_policy: {
      preferred: ["official", "document"],
      allowed: ["official", "document", "web"],
      disallowed: commonDisallowed,
    },
    subjects: ["전구 소켓", "콘센트 종류", "플러그 종류", "멀티탭", "차단기", "전선 규격"],
    facets: [
      ["types", "종류"],
      ["size_standard", "규격"],
      ["safety_context", "안전 관련 맥락"],
    ],
  },
  {
    prefix: "otaku",
    type: "otaku.media",
    risk_tier: "low",
    update_frequency: "event_based",
    disclaimer_type: "check_official_source",
    country: "global",
    jurisdiction: "global",
    source_policy: {
      preferred: ["official", "platform"],
      allowed: ["official", "platform", "document", "web"],
      disallowed: commonDisallowed,
    },
    subjects: ["애니 시청 순서", "만화 연재 순서", "게임 아이템 분류", "캐릭터 속성", "성우 출연작", "피규어 라인업"],
    facets: [
      ["order", "순서"],
      ["type_categories", "분류"],
      ["official_context", "공식 맥락"],
    ],
  },
];

const slugify = (value) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const englishHints = new Map([
  ["고혈압 의학용어", "hypertension-term"],
  ["당뇨병 의학용어", "diabetes-term"],
  ["심전도 용어", "ecg-terms"],
  ["염증 수치 용어", "inflammation-marker-terms"],
  ["간수치 용어", "liver-enzyme-terms"],
  ["혈압 용어", "blood-pressure-terms"],
  ["CBC 혈액검사", "cbc-blood-test"],
  ["소변검사", "urinalysis"],
  ["간기능 검사", "liver-function-test"],
  ["CRP 검사", "crp-test"],
  ["HbA1c 검사", "hba1c-test"],
  ["혈액응고 검사", "coagulation-test"],
  ["CT 검사", "ct-scan"],
  ["MRI 검사", "mri-scan"],
  ["X-ray 검사", "x-ray"],
  ["초음파 검사", "ultrasound"],
  ["PET-CT 검사", "pet-ct"],
  ["조영제", "contrast-agent"],
  ["자동차 차체 종류", "car-body-types"],
  ["SUV와 세단", "suv-sedan"],
  ["하이브리드 자동차", "hybrid-car"],
  ["전기차 충전 방식", "ev-charging-methods"],
  ["가솔린 엔진", "gasoline-engine"],
  ["디젤 엔진", "diesel-engine"],
  ["버스 종류", "bus-types"],
  ["저상버스", "low-floor-bus"],
  ["광역버스", "metropolitan-bus"],
  ["시내버스", "city-bus"],
  ["마을버스", "village-bus"],
  ["공항버스", "airport-bus"],
  ["시내버스 요금", "city-bus-fare"],
  ["마을버스 요금", "village-bus-fare"],
  ["광역버스 요금", "metropolitan-bus-fare"],
  ["지하철 요금", "subway-fare"],
  ["공항철도 요금", "airport-rail-fare"],
  ["공항버스 요금", "airport-bus-fare"],
  ["기차 종류", "train-types"],
  ["KTX", "ktx"],
  ["ITX", "itx"],
  ["무궁화호", "mugunghwa-train"],
  ["광역전철", "metropolitan-rail"],
  ["공항철도", "airport-rail"],
  ["지하철역 구조", "subway-station-structure"],
  ["승강장 종류", "platform-types"],
  ["환승통로", "transfer-passage"],
  ["스크린도어", "platform-screen-door"],
  ["개찰구", "ticket-gate"],
  ["역명 체계", "station-name-system"],
  ["양변기 종류", "toilet-types"],
  ["세면대 종류", "sink-types"],
  ["수도꼭지 종류", "faucet-types"],
  ["샤워기 종류", "showerhead-types"],
  ["배수구 트랩", "drain-trap"],
  ["비데 종류", "bidet-types"],
  ["곤충의 종류", "insect-types"],
  ["딱정벌레", "beetle"],
  ["나비와 나방", "butterfly-moth"],
  ["개미", "ant"],
  ["벌", "bee-wasp"],
  ["잠자리", "dragonfly"],
  ["나사 규격", "screw-size"],
  ["볼트 종류", "bolt-types"],
  ["너트 종류", "nut-types"],
  ["드라이버 비트", "driver-bit"],
  ["렌치 종류", "wrench-types"],
  ["못 종류", "nail-types"],
  ["전구 소켓", "light-bulb-socket"],
  ["콘센트 종류", "outlet-types"],
  ["플러그 종류", "plug-types"],
  ["멀티탭", "power-strip"],
  ["차단기", "circuit-breaker"],
  ["전선 규격", "wire-standard"],
  ["애니 시청 순서", "anime-watch-order"],
  ["만화 연재 순서", "manga-serialization-order"],
  ["게임 아이템 분류", "game-item-categories"],
  ["캐릭터 속성", "character-attributes"],
  ["성우 출연작", "voice-actor-roles"],
  ["피규어 라인업", "figure-lineup"],
]);

const candidates = [];
for (const domain of domains) {
  for (const subject of domain.subjects) {
    const subjectSlug = englishHints.get(subject) ?? slugify(subject);
    for (const [facetPath, facetName] of domain.facets) {
      candidates.push({ domain, subject, subjectSlug, facetPath, facetName });
    }
  }
}

const targetCount = Number.isFinite(count) && count > 0 ? count : 120;
const selected = Array.from({ length: targetCount }, (_, index) => ({ ...candidates[index % candidates.length], expansionRound: Math.floor(index / candidates.length) }));
const seenIds = new Set();
const seenSlugs = new Set();

const lines = selected.map(({ domain, subject, subjectSlug, facetPath, facetName, expansionRound }, index) => {
  const ordinal = String(index + 1).padStart(3, "0");
  const facetSlug = slugify(facetPath);
  const expansionSuffix = expansionRound > 0 ? `-variant-${String(expansionRound + 1).padStart(3, "0")}` : "";
  const entity_id = `${domain.prefix}-${subjectSlug}-${facetSlug}${expansionSuffix}-${ordinal}`;
  const slug = `${subjectSlug}-${facetSlug}${expansionSuffix}`;

  if (seenIds.has(entity_id) || seenSlugs.has(slug)) {
    throw new Error(`Duplicate generated candidate: ${entity_id} / ${slug}`);
  }

  seenIds.add(entity_id);
  seenSlugs.add(slug);

  return JSON.stringify({
    entity_id,
    type: domain.type,
    name: `${subject} ${facetName}${expansionRound > 0 ? ` 후보 ${expansionRound + 1}` : ""}`,
    slug,
    lang: "ko",
    country: domain.country,
    jurisdiction: domain.jurisdiction,
    risk_tier: domain.risk_tier,
    update_frequency: domain.update_frequency,
    disclaimer_type: domain.disclaimer_type,
    source_policy: domain.source_policy,
    claims: [
      {
        field_path: domain.type === "transport.fare" || facetPath.includes(".") ? facetPath : `${domain.type}.${facetPath}`,
        claim_text: `${subject}: ${facetName} 정보는 확인이 필요합니다${expansionRound > 0 ? ` (확장 후보 ${expansionRound + 1})` : ""}.`,
        claim_value: "확인 필요",
        confidence: "low",
        status: "needs_review",
        sources: domain.type === "transport.fare" ? [{ source_type: "official", title: "확인 필요: 공식 교통기관/운영기관 요금 안내", url: null, observed_at: null }] : [],
      },
    ],
  });
});

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${lines.join("\n")}\n`);
console.log(`Wrote ${lines.length} long-tail candidate combinations to ${out}`);
