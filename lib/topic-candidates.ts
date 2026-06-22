// topic-candidates.ts
// ALL candidates: claim_value="확인 필요", confidence="low", status="needs_review"
// Only source-backed verification can promote to verified.

export type CandidateStatus = "new"|"reviewing"|"approved"|"rejected"|"promoted"|"spam";
export type CandidateSource = "ai_generated"|"user_suggested"|"admin_created";
export type RiskTier = "low"|"medium"|"high"|"forbidden";
export type RequiredSourceType = "official"|"law"|"platform"|"document"|"news";

export interface ClaimStub {
  field_path: string;
  question: string;
  placeholder_value: "확인 필요";
  required_source_type: RequiredSourceType;
}

export interface SourceHint {
  url: string;
  title: string;
  hint_type: "official"|"news"|"wiki";
}

export interface TopicCandidate {
  id: string;
  status: CandidateStatus;
  source: CandidateSource;
  lang: string;
  title: string;
  slug: string;
  category: string;
  subcategory: string|null;
  risk_tier: RiskTier;
  why_people_ask_ai: string|null;
  why_ai_gets_wrong: string|null;
  claims: ClaimStub[];
  source_hints: SourceHint[];
  contributor_hash: string|null;
  generation_model: string|null;
  created_at: string|null;
  reviewed_at: string|null;
  promoted_at: string|null;
}

export const TAXONOMY: Record<string, { label: string; subcategories: string[]; risk_tier: RiskTier }> = {
  metro:         { label: "지하철", subcategories: ["요금","환승","노선","시설","역사구조"], risk_tier: "low" },
  rail:          { label: "기차/KTX", subcategories: ["요금","환불","예약","차종","노선"], risk_tier: "low" },
  bus:           { label: "버스", subcategories: ["고속버스","시외버스","시내버스","요금","차종"], risk_tier: "low" },
  taxi:          { label: "택시", subcategories: ["요금","할증","종류","앱택시"], risk_tier: "low" },
  expressway:    { label: "고속도로", subcategories: ["통행료","하이패스","휴게소","노선"], risk_tier: "low" },
  aviation:      { label: "항공/공항", subcategories: ["수하물","수수료","체크인","면세","공항시설"], risk_tier: "low" },
  car:           { label: "자동차", subcategories: ["차종분류","보험","세금","전기차","정비"], risk_tier: "low" },
  tax:           { label: "세금", subcategories: ["소득세","부가세","자동차세","재산세","취득세"], risk_tier: "medium" },
  banking:       { label: "은행/금융", subcategories: ["송금수수료","환전","금리","해외송금"], risk_tier: "medium" },
  insurance:     { label: "보험/연금", subcategories: ["건강보험","국민연금","4대보험","실손"], risk_tier: "medium" },
  housing:       { label: "부동산/주거", subcategories: ["전세","월세","중개수수료","전입신고","층간소음"], risk_tier: "medium" },
  card:          { label: "카드/페이", subcategories: ["해외결제수수료","환불","포인트","한도"], risk_tier: "low" },
  government:    { label: "행정서류", subcategories: ["여권","주민증","인감","발급비용","신고기한"], risk_tier: "low" },
  labor:         { label: "노동/고용", subcategories: ["최저임금","실업급여","퇴직금","연차","육아휴직"], risk_tier: "medium" },
  education:     { label: "교육", subcategories: ["수능","등록금","장학금","편입","학점은행"], risk_tier: "low" },
  medical:       { label: "의료/진료비", subcategories: ["진료비","응급실","검진","본인부담률"], risk_tier: "high" },
  medicine_terms:{ label: "의학용어", subcategories: ["혈액검사","영상검사CT/MRI","병리검사","증상용어"], risk_tier: "high" },
  ecommerce:     { label: "쇼핑/환불", subcategories: ["반품기한","청약철회","환불절차","배송비"], risk_tier: "low" },
  delivery_food: { label: "음식배달", subcategories: ["최소주문금액","취소정책","수수료"], risk_tier: "low" },
  telecom:       { label: "통신", subcategories: ["요금제","번호이동","해지위약금","알뜰폰"], risk_tier: "low" },
  home_goods:    { label: "생활용품/설비", subcategories: ["변기종류","수도꼭지","콘센트타입","배관구조","전기설비"], risk_tier: "low" },
  tools:         { label: "공구/DIY", subcategories: ["나사종류","드릴비트","측정공구","전동공구"], risk_tier: "low" },
  appliances:    { label: "가전제품", subcategories: ["세탁기","냉장고","에어컨","TV스펙"], risk_tier: "low" },
  food:          { label: "음식/요리", subcategories: ["음식기원","재료설명","조리용어","영양성분"], risk_tier: "low" },
  biology:       { label: "생물", subcategories: ["곤충분류","식물분류","동물분류","미생물"], risk_tier: "low" },
  sports:        { label: "스포츠", subcategories: ["규칙","용어","종목별","기록"], risk_tier: "low" },
  history:       { label: "역사", subcategories: ["한국사","세계사","사건","연도","인물"], risk_tier: "low" },
  culture:       { label: "문화/예술", subcategories: ["영화","음악","미술","건축"], risk_tier: "low" },
  anime:         { label: "애니/만화", subcategories: ["작품설정","용어","장르분류","캐릭터"], risk_tier: "low" },
  games:         { label: "게임", subcategories: ["게임용어","규칙","아이템","장르"], risk_tier: "low" },
  science:       { label: "과학", subcategories: ["물리개념","화학","천문학","지구과학"], risk_tier: "low" },
  tech:          { label: "IT/기술", subcategories: ["용어","프로토콜","하드웨어","소프트웨어"], risk_tier: "low" },
  law_terms:     { label: "법률용어", subcategories: ["민법용어","형법용어","행정법","계약"], risk_tier: "high" },
};

export const TAXONOMY_KEYS = Object.keys(TAXONOMY);

export const RISK_DISCLAIMER: Record<RiskTier, string|null> = {
  low: null,
  medium: "이 정보는 참고용이며, 최신 공식 안내를 반드시 확인하세요.",
  high: "이 정보는 교육 목적의 개요이며, 의료·법률 조언이 아닙니다. 전문가와 상담하세요.",
  forbidden: null,
};
