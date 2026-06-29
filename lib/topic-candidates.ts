// topic-candidates.ts
// ALL candidates: claim_value="확인 필요", confidence="low", status="needs_review"
// Only source-backed verification can promote to verified.

export type CandidateStatus = "new"|"triaged"|"generated"|"rejected"|"promoted";
export type CandidateSource = "ai_generated"|"user_suggested"|"admin_created"|"correction_report"|"hallucination_report";
export type RiskTier = "low"|"medium"|"high"|"forbidden";
export type RequiredSourceType = "official"|"law"|"platform"|"document"|"news";
export type UpdateFrequency = "static"|"event_based"|"realtime"|"short_ttl";
export type CommercePolicyFieldPath =
  | "return.window_days"
  | "refund.method"
  | "refund.processing_time"
  | "cancellation.deadline"
  | "shipping.return_cost"
  | "exceptions"
  | "official_policy_url";

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
  country: string;
  jurisdiction: string;
  title: string;
  slug: string;
  category: string;
  subcategory: string|null;
  risk_tier: RiskTier;
  template?: string;
  update_frequency?: UpdateFrequency;
  freshness_ttl_days?: number;
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
  commerce_policy:{ label: "Commerce policy", subcategories: ["returns","refunds","cancellations","shipping","exceptions"], risk_tier: "low" },
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
  // Global / diverse categories
  person_athlete:     { label: "스포츠 선수",    subcategories: ["소속팀","포지션","국적","데뷔","기록","수상"],         risk_tier: "low" },
  person_entertainer: { label: "연예인/아티스트", subcategories: ["소속사","데뷔","앨범","드라마","수상","국적"],         risk_tier: "low" },
  person_public:      { label: "공인",            subcategories: ["직책","경력","소속","임기"],                          risk_tier: "medium" },
  law_statute:        { label: "법령/조항",        subcategories: ["조문번호","시행일","관할","제재","개정"],              risk_tier: "high" },
  law_case:           { label: "판례",             subcategories: ["사건번호","판결요지","법원","선고일"],                 risk_tier: "high" },
  product_food:       { label: "식품/음료",        subcategories: ["칼로리","알레르기","원재료","가격","용량"],            risk_tier: "low" },
  product_pharma:     { label: "의약품",           subcategories: ["성분","용량","복약법","부작용","허가번호"],            risk_tier: "high" },
  product_tech:       { label: "전자제품",         subcategories: ["스펙","가격","출시일","보증","AS"],                   risk_tier: "low" },
  place_attraction:   { label: "관광지/시설",      subcategories: ["운영시간","입장료","주소","주의사항"],                 risk_tier: "low" },
  place_country:      { label: "국가정보",         subcategories: ["수도","통화","비자","공휴일","언어"],                  risk_tier: "low" },
  sports_record:      { label: "스포츠 기록",      subcategories: ["기록","규칙","리그","팀","역대수상"],                  risk_tier: "low" },
  entertainment_work: { label: "작품/콘텐츠",      subcategories: ["출연진","감독","개봉일","수상","플랫폼"],              risk_tier: "low" },
  science_ref:        { label: "과학/단위",        subcategories: ["값","단위","정의","공식"],                            risk_tier: "low" },
};

export const TAXONOMY_KEYS = Object.keys(TAXONOMY);

export type ClaimTemplateStub = { field_path: string; question: string; required_source_type: RequiredSourceType };
export type CommercePolicyClaimTemplateStub = ClaimTemplateStub & { field_path: CommercePolicyFieldPath };

export const COMMERCE_POLICY_FRESHNESS_TTL_DAYS = 30;

export const COMMERCE_POLICY_TEMPLATE: {
  template: "commerce_policy";
  category: "commerce";
  required_context: ["country", "jurisdiction"];
  freshness_ttl_days: number;
  update_frequency: "short_ttl";
  claims: CommercePolicyClaimTemplateStub[];
} = {
  template: "commerce_policy",
  category: "commerce",
  required_context: ["country", "jurisdiction"],
  freshness_ttl_days: COMMERCE_POLICY_FRESHNESS_TTL_DAYS,
  update_frequency: "short_ttl",
  claims: [
    { field_path: "return.window_days", question: "반품 가능 기간은 며칠인가?", required_source_type: "platform" },
    { field_path: "refund.method", question: "환불 방식은 무엇인가?", required_source_type: "platform" },
    { field_path: "refund.processing_time", question: "환불 처리 시간은 얼마나 걸리는가?", required_source_type: "platform" },
    { field_path: "cancellation.deadline", question: "주문/예약 취소 마감 시점은 언제인가?", required_source_type: "platform" },
    { field_path: "shipping.return_cost", question: "반품 배송비는 누가 부담하는가?", required_source_type: "platform" },
    { field_path: "exceptions", question: "반품/환불/취소 예외 조건은 무엇인가?", required_source_type: "platform" },
    { field_path: "official_policy_url", question: "공식 정책 URL은 무엇인가?", required_source_type: "platform" },
  ],
};

export const CLAIM_TEMPLATES: Partial<Record<string, ClaimTemplateStub[]>> = {
  commerce_policy: COMMERCE_POLICY_TEMPLATE.claims,
  person_athlete: [
    { field_path: "bio.full_name",        question: "선수 본명은?",      required_source_type: "official" },
    { field_path: "bio.date_of_birth",    question: "생년월일은?",       required_source_type: "official" },
    { field_path: "bio.nationality",      question: "국적은?",           required_source_type: "official" },
    { field_path: "career.current_team",  question: "현재 소속팀은?",    required_source_type: "official" },
    { field_path: "career.position",      question: "포지션은?",         required_source_type: "official" },
    { field_path: "career.debut_year",    question: "데뷔 연도는?",      required_source_type: "official" },
    { field_path: "stats.notable_record", question: "대표 기록/수상은?", required_source_type: "official" },
  ],
  person_entertainer: [
    { field_path: "bio.full_name",        question: "본명은?",           required_source_type: "official" },
    { field_path: "bio.date_of_birth",    question: "생년월일은?",       required_source_type: "official" },
    { field_path: "career.agency",        question: "소속사는?",         required_source_type: "official" },
    { field_path: "career.debut_date",    question: "데뷔일은?",         required_source_type: "official" },
    { field_path: "career.notable_works", question: "대표작은?",         required_source_type: "official" },
  ],
  law_statute: [
    { field_path: "law.article_number",   question: "조문 번호는?",      required_source_type: "law" },
    { field_path: "law.enforcement_date", question: "시행일은?",         required_source_type: "law" },
    { field_path: "law.jurisdiction",     question: "관할은?",           required_source_type: "law" },
    { field_path: "law.penalty",          question: "위반 시 제재는?",   required_source_type: "law" },
  ],
  product_food: [
    { field_path: "nutrition.calories_kcal", question: "칼로리는?",       required_source_type: "official" },
    { field_path: "nutrition.allergens",     question: "알레르기 성분은?", required_source_type: "official" },
    { field_path: "product.origin_country",  question: "원산지는?",       required_source_type: "official" },
    { field_path: "product.standard_price",  question: "소비자가격은?",   required_source_type: "platform" },
  ],
  place_attraction: [
    { field_path: "hours.weekday",   question: "평일 운영시간은?", required_source_type: "official" },
    { field_path: "hours.weekend",   question: "주말 운영시간은?", required_source_type: "official" },
    { field_path: "fee.adult_entry", question: "성인 입장료는?",  required_source_type: "official" },
    { field_path: "info.address",    question: "주소는?",         required_source_type: "official" },
  ],
  person_public: [
    { field_path: "bio.current_title",   question: "현재 직함/직책은?",   required_source_type: "official" },
    { field_path: "bio.organization",    question: "소속 기관은?",         required_source_type: "official" },
    { field_path: "career.term_start",   question: "임기/취임 시작일은?",  required_source_type: "official" },
    { field_path: "career.term_end",     question: "임기 종료 예정일은?",  required_source_type: "official" },
    { field_path: "bio.nationality",     question: "국적은?",              required_source_type: "official" },
  ],
  law_case: [
    { field_path: "case.case_number",    question: "사건번호는?",           required_source_type: "law" },
    { field_path: "case.court",          question: "판결 법원은?",          required_source_type: "law" },
    { field_path: "case.judgment_date",  question: "선고일은?",             required_source_type: "law" },
    { field_path: "case.ruling",         question: "판결 결과(주문)는?",    required_source_type: "law" },
    { field_path: "case.summary",        question: "판결 요지는?",          required_source_type: "document" },
  ],
  product_pharma: [
    { field_path: "drug.active_ingredient",  question: "주성분(성분명)은?",       required_source_type: "official" },
    { field_path: "drug.dosage_adult",       question: "성인 1회 복용량은?",      required_source_type: "official" },
    { field_path: "drug.administration",     question: "복용/투여 방법은?",       required_source_type: "official" },
    { field_path: "drug.contraindications",  question: "복용 금기 사항은?",       required_source_type: "official" },
    { field_path: "drug.approval_number",    question: "식약처 허가번호는?",      required_source_type: "official" },
    { field_path: "drug.side_effects",       question: "주요 부작용은?",          required_source_type: "official" },
  ],
  product_tech: [
    { field_path: "spec.model_name",      question: "정식 모델명은?",       required_source_type: "official" },
    { field_path: "spec.release_date",    question: "출시일은?",            required_source_type: "official" },
    { field_path: "spec.key_spec",        question: "주요 사양은?",         required_source_type: "official" },
    { field_path: "product.retail_price", question: "출시 정가는?",         required_source_type: "official" },
    { field_path: "product.warranty",     question: "제조사 보증 기간은?",  required_source_type: "official" },
  ],
  place_country: [
    { field_path: "geo.capital",          question: "수도는?",                      required_source_type: "official" },
    { field_path: "geo.currency",         question: "공식 통화(코드)는?",           required_source_type: "official" },
    { field_path: "geo.official_language",question: "공식 언어는?",                 required_source_type: "official" },
    { field_path: "visa.korea_required",  question: "한국인 입국 시 비자 필요 여부?", required_source_type: "official" },
    { field_path: "geo.population",       question: "최근 인구는?",                 required_source_type: "official" },
  ],
  sports_record: [
    { field_path: "record.holder",        question: "기록 보유자는?",               required_source_type: "official" },
    { field_path: "record.value",         question: "기록 수치/내용은?",            required_source_type: "official" },
    { field_path: "record.date_set",      question: "기록 달성일은?",               required_source_type: "official" },
    { field_path: "record.competition",   question: "기록 달성 대회/경기는?",       required_source_type: "official" },
  ],
  entertainment_work: [
    { field_path: "work.director",        question: "감독/연출자는?",       required_source_type: "official" },
    { field_path: "work.release_date",    question: "개봉/공개일은?",       required_source_type: "official" },
    { field_path: "work.main_cast",       question: "주연 출연진은?",       required_source_type: "official" },
    { field_path: "work.platform",        question: "방영/스트리밍 플랫폼은?", required_source_type: "platform" },
    { field_path: "work.genre",           question: "장르는?",              required_source_type: "official" },
  ],
  science_ref: [
    { field_path: "constant.symbol",      question: "표준 기호(표기)는?",   required_source_type: "document" },
    { field_path: "constant.value",       question: "값(수치)은?",          required_source_type: "document" },
    { field_path: "constant.unit",        question: "단위는?",              required_source_type: "document" },
    { field_path: "constant.definition",  question: "정의는?",              required_source_type: "document" },
  ],
};

export const RISK_DISCLAIMER: Record<RiskTier, string|null> = {
  low: null,
  medium: "이 정보는 참고용이며, 최신 공식 안내를 반드시 확인하세요.",
  high: "이 정보는 교육 목적의 개요이며, 의료·법률 조언이 아닙니다. 전문가와 상담하세요.",
  forbidden: null,
};


export type PublicCandidateIntakeKind = "topic_suggestion" | "correction_report" | "hallucination_report";

export interface PublicCandidateIntakeInput {
  kind: PublicCandidateIntakeKind;
  title: string;
  slugSeed?: string | null;
  lang?: string | null;
  category: string;
  reason: string;
  aiContext?: string | null;
  sourceUrls?: (string | null | undefined)[];
  contributorHash: string;
  claimQuestion?: string | null;
}

export function slugifyCandidateSeed(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || `candidate-${Date.now().toString(36)}`;
}

export function buildPublicTopicCandidate(input: PublicCandidateIntakeInput) {
  const sourceUrls = [...new Set(input.sourceUrls?.map((url) => String(url ?? "").trim()).filter(Boolean) ?? [])];
  const title = input.title.trim();
  const slugBase = slugifyCandidateSeed(input.slugSeed || title);
  const suffix = Date.now().toString(36);
  return {
    source: input.kind === "topic_suggestion" ? "user_suggested" : input.kind,
    status: "new" as CandidateStatus,
    lang: (input.lang?.trim() || "en").slice(0, 5),
    title,
    slug: `${slugBase}-${suffix}`.slice(0, 96),
    category: input.category.trim(),
    risk_tier: "medium" as RiskTier,
    why_people_ask_ai: input.reason.trim(),
    why_ai_gets_wrong: input.aiContext?.trim() || null,
    claims: [{
      field_path: "claim.main",
      question: input.claimQuestion?.trim() || title,
      placeholder_value: "확인 필요" as const,
      required_source_type: sourceUrls.length > 0 ? "official" as const : "document" as const,
    }],
    source_hints: sourceUrls.map((url) => ({ url, title: "Submitter source candidate", hint_type: "official" as const })),
    contributor_hash: input.contributorHash,
  };
}
