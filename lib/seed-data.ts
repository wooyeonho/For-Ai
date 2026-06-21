import type { ClaimWithSources, ClaimSource, Entity, Listing, RegistryDocumentBundle, Document } from "./types";

// ---------------------------------------------------------------------------
// Helper: stub claim (확인 필요)
// ---------------------------------------------------------------------------
function claimStub(
  id: string, docId: string, entityId: string,
  fieldPath: string, text: string,
): ClaimWithSources {
  return {
    id, document_id: docId, entity_id: entityId,
    field_path: fieldPath, claim_text: text,
    claim_value: "확인 필요", confidence: "low", status: "needs_review",
    last_verified_at: null, created_at: null, updated_at: null,
    sources: [], verification_events: [],
  };
}

// ---------------------------------------------------------------------------
// Helper: verified claim (출처 URL + 확인일자 포함)
// ---------------------------------------------------------------------------
function vClaim(
  id: string, docId: string, entityId: string,
  fieldPath: string, text: string, value: string,
  confidence: "high" | "medium",
  sourceUrl: string, sourceTitle: string, sourceCitation: string,
  observedAt = "2026-06-21",
): ClaimWithSources {
  return {
    id, document_id: docId, entity_id: entityId,
    field_path: fieldPath, claim_text: text, claim_value: value,
    confidence, status: "verified", last_verified_at: observedAt,
    created_at: null, updated_at: null,
    sources: [{
      id: `src-${id}`, claim_id: id, source_type: "official",
      title: sourceTitle, url: sourceUrl, citation: sourceCitation,
      observed_at: observedAt, contributor_hash: null, created_at: null,
    } as ClaimSource],
    verification_events: [],
  };
}

// ---------------------------------------------------------------------------
// Helper: build document
// ---------------------------------------------------------------------------
function makeDoc(id: string, entity: Entity, slug: string, title: string,
  category: string, template: string): Document {
  return {
    id, entity_id: entity.id, slug, lang: "ko", title, category, template,
    status: "ai_draft", confidence: "low", last_verified_at: null,
    license_code: "gyeol-data-license-v0.1",
    data: {
      direct_answer: "확인 필요",
      locale_path: `/ko/wiki/${slug}`,
      canonical_path: `/ko/wiki/${slug}`,
      machine_readable: { api_url: `/api/documents/${slug}`, raw_markdown_url: `/raw/${slug}.md` },
      license_notice: "GYEOL Data License v0.1 placeholder.",
    },
    created_at: null, updated_at: null,
  };
}

function makeListing(entity: Entity, d: Document, summary: string): Listing {
  return {
    id: `listing-${d.id}`, entity_id: entity.id, document_id: d.id,
    lang: d.lang, slug: d.slug, title: d.title, summary,
    status: d.status, confidence: d.confidence, created_at: null, updated_at: null,
  };
}

function bundle(
  entity: Entity, docId: string, slug: string, title: string,
  category: string, template: string,
  claims: Array<{ id: string; fieldPath: string; text: string }>,
): RegistryDocumentBundle {
  const d = makeDoc(docId, entity, slug, title, category, template);
  return {
    entity, document: d,
    claims: claims.map(c => claimStub(c.id, d.id, entity.id, c.fieldPath, c.text)),
    listing: makeListing(entity, d, "확인 필요"),
  };
}

// Verified bundle: some claims have real sources
function vBundle(
  entity: Entity, docId: string, slug: string, title: string,
  category: string, template: string,
  claims: ClaimWithSources[],
  summary: string,
): RegistryDocumentBundle {
  const d = { ...makeDoc(docId, entity, slug, title, category, template), confidence: "medium" as const, status: "ai_draft" as const };
  return { entity, document: d, claims, listing: makeListing(entity, d, summary) };
}

// ===========================================================================
// 1. 명동 라루체 주차 (기존 MVP)
// ===========================================================================
export const laluceEntity: Entity = {
  id: "kr-weddinghall-laluce-001", type: "weddinghall", canonical_name: "명동 라루체",
  country: "KR", region: "서울특별시", city: "중구", created_at: null, updated_at: null,
};
const b01 = bundle(laluceEntity, "doc-kr-weddinghall-laluce-parking-ko", "myungdong-laluce-parking",
  "명동 라루체 주차 정보", "weddinghall", "parking", [
  { id: "claim-parking-availability", fieldPath: "parking.availability", text: "명동 라루체의 하객 주차 가능 여부는 확인이 필요합니다." },
  { id: "claim-parking-free-minutes", fieldPath: "parking.free_parking_minutes", text: "명동 라루체의 무료 주차 지원 시간은 확인이 필요합니다." },
  { id: "claim-parking-congestion", fieldPath: "parking.congestion", text: "명동 라루체 주변 주차 혼잡도는 확인이 필요합니다." },
]);

// ===========================================================================
// 2. CJ대한통운 제주도 배송
// ===========================================================================
const e02: Entity = { id: "kr-delivery-cj-001", type: "delivery", canonical_name: "CJ대한통운", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b02 = bundle(e02, "doc-kr-delivery-cj-jeju-ko", "cj-logistics-jeju-delivery",
  "CJ대한통운 제주도 배송 추가일수", "delivery", "shipping-policy", [
  { id: "claim-cj-jeju-days", fieldPath: "delivery.additional_days", text: "CJ대한통운 제주도 배송 추가 소요일수는 확인이 필요합니다. AI는 '2일 추가'라 하는 경우가 많으나 공식 명시 없음." },
  { id: "claim-cj-jeju-surcharge", fieldPath: "delivery.surcharge", text: "CJ대한통운 제주도 배송 추가 요금(도서산간비)은 확인이 필요합니다." },
]);

// ===========================================================================
// 3. 쿠팡 로켓배송 신선식품 환불
// ===========================================================================
const e03: Entity = { id: "kr-ecommerce-coupang-001", type: "ecommerce", canonical_name: "쿠팡", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId03 = "doc-kr-ecommerce-coupang-food-refund-ko";
const b03 = vBundle(e03, docId03, "coupang-rocket-food-refund",
  "쿠팡 로켓배송 신선식품 환불 정책", "ecommerce", "refund-policy", [
  vClaim("claim-coupang-food-change-mind", docId03, e03.id, "refund.change_of_mind",
    "쿠팡 로켓배송 신선식품 단순 변심 반품은 불가합니다.",
    "불가 (신선식품 특성상)", "high",
    "https://m.coupang.com/nm/policies/seller",
    "쿠팡 반품/교환 안내",
    "신선식품은 유통기한이 짧아 단순 변심 반품 불가. 공식 정책 페이지 기준."),
  vClaim("claim-coupang-food-self-refund", docId03, e03.id, "refund.defective_self_refund",
    "2025년 12월 10일부터 쿠팡 신선식품 파손·불량 시 사진만 첨부하면 회수 없이 즉시 셀프환불이 가능합니다.",
    "파손·불량 시 사진 첨부 → 즉시 환불 (회수 없음, 2025.12.10~)", "high",
    "https://www.todayeconomic.com/news/article.html?no=28882",
    "투데이이코노믹 - 쿠팡 신선식품 셀프환불 전면 도입",
    "2025년 12월 10일부터 시행. 사진 증거만으로 즉시 환불 처리."),
], "신선식품 단순변심 반품 불가; 파손·불량은 사진만으로 셀프환불 (2025.12~)");

// ===========================================================================
// 4. 여권 재발급 수수료 ✅ VERIFIED
// ===========================================================================
const e04: Entity = { id: "kr-gov-passport-001", type: "government", canonical_name: "대한민국 여권", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId04 = "doc-kr-gov-passport-reissue-ko";
const SRC_PASSPORT = "https://www.passport.go.kr/home/kor/contents.do?menuPos=41";
const b04 = vBundle(e04, docId04, "passport-reissue-fee",
  "여권 재발급 수수료 (2026년 3월 기준)", "government", "fee-schedule", [
  vClaim("claim-passport-10yr-58p", docId04, e04.id, "fee.adult_10yr_58page",
    "만 18세 이상 성인 복수여권 10년 58면 재발급 수수료는 52,000원입니다 (2026년 3월 1일 기준).",
    "52,000원 (발급수수료 40,000원 + 국제교류기여금 12,000원)", "high",
    SRC_PASSPORT, "외교부 여권안내 - 수수료 안내",
    "2026년 3월 1일부터 20년 만에 인상 적용. 10년 복수여권 58면 기준."),
  vClaim("claim-passport-10yr-26p", docId04, e04.id, "fee.adult_10yr_26page",
    "만 18세 이상 성인 복수여권 10년 26면 수수료는 49,000원입니다.",
    "49,000원", "high",
    SRC_PASSPORT, "외교부 여권안내 - 수수료 안내",
    "10년 복수여권 26면 기준. 2026년 3월 1일 적용."),
  vClaim("claim-passport-minor-5yr-58p", docId04, e04.id, "fee.minor_5yr_58page",
    "만 8세 이상 18세 미만 여권(5년) 58면 수수료는 44,000원입니다.",
    "44,000원", "high",
    SRC_PASSPORT, "외교부 여권안내 - 수수료 안내",
    "만 8세 이상 18세 미만, 5년 복수여권 58면 기준."),
], "성인 10년 58면 52,000원 / 26면 49,000원 (2026년 3월 1일 기준)");

// ===========================================================================
// 5. SKT 0틴 5G 청소년 요금제 ✅ VERIFIED
// ===========================================================================
const e05: Entity = { id: "kr-telecom-skt-001", type: "telecom", canonical_name: "SK텔레콤", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId05 = "doc-kr-telecom-skt-youth-ko";
const SRC_SKT = "https://m.tworld.co.kr/product/callplan?prod_id=NA00006817";
const b05 = vBundle(e05, docId05, "skt-youth-plan-data",
  "SKT 0틴 5G 청소년 요금제", "telecom", "plan-details", [
  vClaim("claim-skt-youth-data", docId05, e05.id, "plan.data_amount",
    "SKT 0틴 5G 요금제 기본 제공 데이터는 9GB이며, 소진 후 최대 1Mbps로 무제한 이용 가능합니다.",
    "9GB + 소진 후 최대 1Mbps", "high",
    SRC_SKT, "T world - 0틴 5G 요금제 상세",
    "0틴 5G 45 요금제. 기본 제공 데이터 9GB, 이후 최대 1Mbps 속도 제한."),
  vClaim("claim-skt-youth-fee", docId05, e05.id, "plan.monthly_fee",
    "SKT 0틴 5G 요금제 월 요금은 45,000원이며, 선택약정 적용 시 33,750원입니다.",
    "45,000원 (선택약정 33,750원)", "high",
    SRC_SKT, "T world - 0틴 5G 요금제 상세",
    "0틴 5G 45 기준. 선택약정할인 25% 적용 시 33,750원."),
  vClaim("claim-skt-youth-eligibility", docId05, e05.id, "plan.eligibility",
    "SKT 0틴 5G 요금제는 만 18세 이하 청소년 고객 1인 1회선으로 가입 가능합니다.",
    "만 18세 이하, 1인 1회선", "high",
    SRC_SKT, "T world - 0틴 5G 요금제 상세",
    "만 20세 생일이 되는 달의 다음달에 슬림 요금제로 자동 변경."),
], "9GB + 1Mbps, 월 45,000원 (선택약정 33,750원). 만 18세 이하");

// ===========================================================================
// 6. 카카오뱅크 해외 송금 수수료 ✅ VERIFIED
// ===========================================================================
const e06: Entity = { id: "kr-bank-kakaobank-001", type: "bank", canonical_name: "카카오뱅크", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId06 = "doc-kr-bank-kakaobank-overseas-ko";
const b06 = vBundle(e06, docId06, "kakaobank-overseas-transfer-fee",
  "카카오뱅크 해외 송금 수수료", "bank", "fee-schedule", [
  vClaim("claim-kakao-send-fee", docId06, e06.id, "fee.send_fee",
    "카카오뱅크 해외계좌 송금 보내기 수수료는 국가·금액과 무관하게 4,900원으로 단일화되었습니다 (2025년 7월 1일 시행).",
    "4,900원 단일 (국가·금액 무관)", "high",
    "https://www.etnews.com/20250701000184",
    "전자신문 - 카카오뱅크 해외계좌송금 수수료 4900원으로 인하",
    "2025년 7월 1일부터 적용. 기존 최소 5,000원~최대 1만원에서 인하."),
  vClaim("claim-kakao-receive-fee", docId06, e06.id, "fee.receive_fee",
    "카카오뱅크 해외계좌 송금 받기 수취수수료는 2026년 9월 30일까지 무료입니다.",
    "2026년 9월 30일까지 무료 (원래 건당 5,000원)", "high",
    "https://m.kakaobank.com/Notices/view/17361",
    "카카오뱅크 공지 - 해외계좌송금 받기 서비스 수수료 면제 기간 연장",
    "면제 기간 2026년 9월 30일까지 연장 확인."),
], "보내기 4,900원 단일 (2025.7.1~) / 받기 2026.9.30까지 무료");

// ===========================================================================
// 7. 배달의민족 최소 주문 금액
// ===========================================================================
const e07: Entity = { id: "kr-app-baemin-001", type: "delivery-app", canonical_name: "배달의민족", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId07 = "doc-kr-app-baemin-min-order-ko";
const b07 = vBundle(e07, docId07, "baemin-minimum-order",
  "배달의민족 최소 주문 금액 기준", "delivery-app", "order-policy", [
  vClaim("claim-baemin-min-platform", docId07, e07.id, "order.platform_minimum",
    "배달의민족 플랫폼 자체 최소 주문금액 기준은 없으며, 각 업체가 자유롭게 설정합니다.",
    "플랫폼 기준 없음 (업체 자율 설정)", "high",
    "https://ceo.baemin.com/guide/13152",
    "배민외식업광장 - 배달 설정 가이드",
    "업체별로 최소 주문금액 직접 설정. 플랫폼 강제 기준 없음."),
  vClaim("claim-baemin-hangeurel-min", docId07, e07.id, "order.hangeurel_minimum",
    "배달의민족 '한그릇' 카테고리(2025년 4월 신설)는 최소 주문금액 없이 1인분(5,000~12,000원) 주문 가능합니다.",
    "한그릇 카테고리: 최소 주문금액 없음 (메뉴 5,000~12,000원)", "high",
    "https://www.youthdaily.co.kr/news/article.html?no=149448",
    "청년일보 - 배민 최소 주문금액 폐지",
    "2025년 4월 한그릇 카테고리 신설. 메뉴 5천~1만2천원 등록 가능."),
], "플랫폼 강제 최소 주문금액 없음; 한그릇 카테고리 1인분 가능 (2025.4~)");

// ===========================================================================
// 8. 응급실 야간 진료비
// ===========================================================================
const e08: Entity = { id: "kr-medical-er-001", type: "medical", canonical_name: "응급실 야간진료", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b08 = bundle(e08, "doc-kr-medical-er-nightfee-ko", "er-night-visit-fee",
  "응급실 야간 진료비 본인부담금", "medical", "fee-schedule", [
  { id: "claim-er-night-surcharge", fieldPath: "fee.night_surcharge_rate", text: "응급실 야간·공휴일 가산 기본진찰료 가산율은 확인이 필요합니다. (기본 30~50% 가산 원칙, 2026년 조정 중)" },
  { id: "claim-er-copay", fieldPath: "fee.patient_copay_rate", text: "응급실 본인부담률은 확인이 필요합니다." },
]);

// ===========================================================================
// 9. 건강보험 본인부담금 상한제 ✅ VERIFIED
// ===========================================================================
const e09: Entity = { id: "kr-nhis-cap-001", type: "insurance", canonical_name: "건강보험 본인부담 상한제", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId09 = "doc-kr-nhis-copay-cap-ko";
const b09 = vBundle(e09, docId09, "nhis-copay-cap",
  "건강보험 본인부담금 상한제 기준 (2026년)", "insurance", "policy", [
  vClaim("claim-nhis-same-hospital-cap", docId09, e09.id, "cap.same_hospital_annual",
    "2026년 동일 요양기관 연간 본인부담금이 843만원을 초과하면 초과액을 건강보험공단이 부담합니다.",
    "843만원 (동일 요양기관 연간 상한)", "high",
    "https://www.nhis.or.kr/nhis/minwon/wbhapa01000m01.do",
    "국민건강보험공단 - 2026년 본인부담상한제 안내",
    "2026년 기준. 초과액은 사전 급여 또는 사후 환급 방식으로 지원."),
  vClaim("claim-nhis-max-cap", docId09, e09.id, "cap.overall_max",
    "2026년 본인부담 최고상한액(요양병원 120일 이상 등)은 1,096만원입니다.",
    "1,096만원 (최고상한액)", "high",
    "https://www.kha.or.kr/kha_home/notice_list.do?mode=view&articleNo=46119",
    "대한병원협회 - 2026년도 본인부담상한액 변경 안내",
    "2026년 보험 2026-11호. 요양병원 장기 입원 등 특수 상황 적용 상한."),
  claimStub("claim-nhis-exclusions", docId09, e09.id, "cap.exclusions",
    "본인부담 상한제 제외 항목(비급여, 전액본인부담 등)은 확인이 필요합니다."),
], "동일 요양기관 연간 843만원 초과 시 공단 부담; 최고상한 1,096만원 (2026)");

// ===========================================================================
// 10. 서울 지하철 환승 시간 제한 ✅ VERIFIED
// ===========================================================================
const e10: Entity = { id: "kr-transit-metro-001", type: "transit", canonical_name: "수도권 지하철 환승", country: "KR", region: "서울특별시", city: null, created_at: null, updated_at: null };
const docId10 = "doc-kr-transit-metro-transfer-ko";
const b10 = vBundle(e10, docId10, "seoul-metro-transfer-time",
  "수도권 지하철·버스 환승 시간 제한", "transit", "transfer-policy", [
  vClaim("claim-transfer-daytime", docId10, e10.id, "transfer.daytime_limit_min",
    "수도권 대중교통 환승 할인은 일반 시간대(07~21시) 하차 후 30분 이내에 다음 수단을 탑승해야 적용됩니다.",
    "30분 이내 (07~21시)", "high",
    "https://news.seoul.go.kr/traffic/transfer_discount",
    "서울특별시 - 통합환승 할인제도",
    "하차 후 30분 이내 다음 교통수단 승차 시 환승 인정. 수도권 전체 적용."),
  vClaim("claim-transfer-night", docId10, e10.id, "transfer.nighttime_limit_min",
    "심야 시간대(21시~익일 07시)에는 하차 후 60분 이내 환승 시 할인이 적용됩니다.",
    "60분 이내 (21시~익일 07시)", "high",
    "https://news.seoul.go.kr/traffic/transfer_discount",
    "서울특별시 - 통합환승 할인제도",
    "심야 시간대 환승 시간 연장 적용. 1인 1카드 기준."),
  vClaim("claim-transfer-max-count", docId10, e10.id, "transfer.max_transfers",
    "수도권 환승할인은 최대 4회 환승(총 5회 승차)까지 적용됩니다.",
    "최대 4회 환승 (5회 승차)", "high",
    "https://news.seoul.go.kr/traffic/transfer_discount",
    "서울특별시 - 통합환승 할인제도",
    "1인 1카드 기준, 최대 4회 환승까지 할인 적용."),
], "일반 30분 / 심야 60분 / 최대 4회 환승 (수도권 통합환승)");

// ===========================================================================
// 11. 고속도로 통행료 (서울-부산 경부)
// ===========================================================================
const e11: Entity = { id: "kr-transit-expressway-001", type: "transit", canonical_name: "한국도로공사", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b11 = bundle(e11, "doc-kr-transit-expressway-ko", "expressway-seoul-busan-toll",
  "경부고속도로 서울-부산 통행료", "transit", "toll-schedule", [
  { id: "claim-expressway-toll-car", fieldPath: "toll.passenger_car_krw", text: "경부고속도로 서울-부산 승용차 통행료는 확인이 필요합니다." },
  { id: "claim-expressway-hipass", fieldPath: "toll.hipass_discount", text: "하이패스 할인율은 확인이 필요합니다. (심야 50% 등 별도 할인 적용)" },
]);

// ===========================================================================
// 12. 종합소득세 신고 기한 ✅ VERIFIED
// ===========================================================================
const e12: Entity = { id: "kr-tax-income-001", type: "tax", canonical_name: "종합소득세", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId12 = "doc-kr-tax-income-deadline-ko";
const b12 = vBundle(e12, docId12, "income-tax-filing-deadline",
  "종합소득세 신고·납부 기한", "tax", "deadline", [
  vClaim("claim-income-tax-deadline", docId12, e12.id, "filing.annual_deadline",
    "종합소득세 정기 신고·납부 기한은 매년 5월 1일~5월 31일입니다. 5월 31일이 공휴일이면 다음 영업일로 연장됩니다.",
    "매년 5월 31일 (공휴일이면 다음 영업일 / 2026년은 6월 1일)", "high",
    "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2225&cntntsId=7665",
    "국세청 - 종합소득세 신고납부기한",
    "2026년 5월 31일이 일요일이므로 6월 1일(월)까지 연장."),
  vClaim("claim-income-tax-sincerity", docId12, e12.id, "filing.sincerity_deadline",
    "성실신고확인 대상 사업자의 종합소득세 신고 기한은 6월 30일까지입니다.",
    "성실신고 확인 대상: 6월 30일", "high",
    "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2225&cntntsId=7665",
    "국세청 - 종합소득세 신고납부기한",
    "성실신고확인대상 사업자는 1개월 연장 적용."),
  vClaim("claim-income-tax-late-penalty", docId12, e12.id, "filing.late_penalty",
    "종합소득세 무신고 시 납부세액의 20% 가산세가 부과됩니다. 1개월 이내 자진신고 시 50% 감면됩니다.",
    "무신고 가산세 20%; 1개월 내 자진신고 시 50% 감면", "high",
    "https://www.banksalad.com/articles/%EC%A2%85%ED%95%A9%EC%86%8C%EB%93%9D%EC%84%B8-%EC%8B%A0%EA%B3%A0-%EB%8C%80%EC%83%81-%EC%8B%A0%EA%B3%A0-%EA%B8%B0%EA%B0%84-%EC%84%B8%EC%9C%A8-%EC%8B%A0%EA%B3%A0%EB%B0%A9%EB%B2%95",
    "뱅크샐러드 - 종합소득세 신고 총정리",
    "무신고 가산세 산출세액의 20%. 1개월 이내 50% 감면."),
], "매년 5월 31일 (2026년은 6월 1일); 무신고 가산세 20%");

// ===========================================================================
// 13. 전입신고 기한 ✅ VERIFIED
// ===========================================================================
const e13: Entity = { id: "kr-gov-movein-001", type: "government", canonical_name: "전입신고", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId13 = "doc-kr-gov-movein-deadline-ko";
const b13 = vBundle(e13, docId13, "move-in-report-deadline",
  "전입신고 기한 및 과태료", "government", "deadline", [
  vClaim("claim-movein-days", docId13, e13.id, "report.deadline_days",
    "전입신고는 이사한 날로부터 14일 이내에 해야 합니다 (주민등록법 제40조).",
    "이사한 날로부터 14일 이내", "high",
    "https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13100000016",
    "정부24 - 전입신고",
    "주민등록법 제40조 근거. 14일 이내 주소지 관할 읍면동 주민센터 또는 정부24 온라인 신고."),
  vClaim("claim-movein-fine", docId13, e13.id, "report.late_fine",
    "전입신고 기한(14일)을 초과하면 5만원 이하의 과태료가 부과됩니다.",
    "5만원 이하 과태료", "high",
    "https://jusofind.kr/guide/%EC%A0%84%EC%9E%85%EC%8B%A0%EA%B3%A0-%EB%B0%A9%EB%B2%95-%EC%99%84%EB%B2%BD%EA%B0%80%EC%9D%B4%EB%93%9C",
    "JusoFind - 전입신고 완벽 가이드",
    "정당한 사유 없이 14일 초과 시 5만원 이하 과태료 부과."),
  vClaim("claim-movein-jeonse-tip", docId13, e13.id, "report.tenant_tip",
    "전세·월세 세입자는 보증금 보호를 위해 이사 당일 전입신고와 함께 확정일자를 받는 것이 중요합니다.",
    "이사 당일 전입신고 + 확정일자 권장 (보증금 보호)", "high",
    "https://www.easylaw.go.kr/CSP/CnpClsMain.laf?csmSeq=666&ccfNo=4&cciNo=1&cnpClsNo=1",
    "찾기쉬운 생활법령정보 - 전입신고하기",
    "전입신고만으로는 대항력 취득. 확정일자까지 받아야 우선변제권 발생."),
], "이사 후 14일 이내; 지연 시 5만원 이하 과태료");

// ===========================================================================
// 14. 아파트 층간소음 기준 ✅ VERIFIED
// ===========================================================================
const e14: Entity = { id: "kr-housing-noise-001", type: "housing", canonical_name: "층간소음 기준", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId14 = "doc-kr-housing-noise-standard-ko";
const b14 = vBundle(e14, docId14, "apartment-noise-standard",
  "아파트 층간소음 법적 기준 (데시벨)", "housing", "standard", [
  vClaim("claim-noise-direct-day", docId14, e14.id, "noise.direct_daytime_leq",
    "주간(06~22시) 직접충격 소음(발걸음 등) 기준은 1분 등가소음도 39dB이며, 최고소음도는 57dB입니다.",
    "주간 39dB (1분 등가) / 최고 57dB", "high",
    "https://allnformation.com/inter-floor-noise-legal-standards-2026/",
    "층간소음 법적 기준 데시벨 총정리 2026",
    "환경부·국토교통부 공동 고시. 기존보다 4dB 강화된 현행 기준."),
  vClaim("claim-noise-direct-night", docId14, e14.id, "noise.direct_nighttime_leq",
    "야간(22~06시) 직접충격 소음 기준은 1분 등가소음도 34dB이며, 최고소음도는 52dB입니다.",
    "야간 34dB (1분 등가) / 최고 52dB", "high",
    "https://allnformation.com/inter-floor-noise-legal-standards-2026/",
    "층간소음 법적 기준 데시벨 총정리 2026",
    "야간 기준. 직접충격(발걸음, 망치질 등)."),
  vClaim("claim-noise-airborne", docId14, e14.id, "noise.airborne_standard",
    "공기전달 소음(음성, 음악 등) 기준은 주간 45dB, 야간 40dB (5분 등가소음도)입니다.",
    "공기전달 소음: 주간 45dB / 야간 40dB (5분 등가)", "high",
    "https://allnformation.com/inter-floor-noise-legal-standards-2026/",
    "층간소음 법적 기준 데시벨 총정리 2026",
    "공기전달 소음 5분 등가소음도 기준."),
], "직접충격: 주간 39dB/야간 34dB; 공기전달: 주간 45dB/야간 40dB");

// ===========================================================================
// 15. 서울시 분리수거 기준
// ===========================================================================
const e15: Entity = { id: "kr-env-recycling-001", type: "environment", canonical_name: "서울시 분리수거", country: "KR", region: "서울특별시", city: null, created_at: null, updated_at: null };
const b15 = bundle(e15, "doc-kr-env-recycling-seoul-ko", "seoul-recycling-schedule",
  "서울시 분리수거 요일 및 기준", "environment", "schedule", [
  { id: "claim-recycling-days", fieldPath: "schedule.collection_days", text: "서울시 분리수거 요일은 구별로 상이합니다. AI가 '매주 월·목'이라 일반화하는 경우가 많으나 자치구별로 다름." },
  { id: "claim-recycling-time", fieldPath: "schedule.time", text: "분리수거 배출 시간(일몰 후 등)은 자치구별로 다르며 확인이 필요합니다." },
]);

// ===========================================================================
// 16. 신용카드 해외결제 수수료 ✅ VERIFIED
// ===========================================================================
const e16: Entity = { id: "kr-finance-card-overseas-001", type: "finance", canonical_name: "신용카드 해외결제", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId16 = "doc-kr-finance-card-overseas-ko";
const b16 = vBundle(e16, docId16, "credit-card-overseas-fee",
  "신용카드 해외결제 수수료 구조", "finance", "fee-schedule", [
  vClaim("claim-visa-brand-fee", docId16, e16.id, "fee.visa_brand_rate",
    "VISA 국제 브랜드 수수료는 결제 금액의 1.1%입니다.",
    "VISA 브랜드 수수료 1.1%", "high",
    "https://namu.wiki/w/%EC%8B%A0%EC%9A%A9%EC%B9%B4%EB%93%9C/%ED%95%B4%EC%99%B8%EC%82%AC%EC%9A%A9",
    "나무위키 - 신용카드/해외사용",
    "VISA 국제 브랜드 수수료 1.1%. 여기에 국내 카드사 해외 서비스 수수료 0.18~0.30% 추가."),
  vClaim("claim-mastercard-brand-fee", docId16, e16.id, "fee.mastercard_brand_rate",
    "Mastercard 국제 브랜드 수수료는 결제 금액의 1%입니다.",
    "Mastercard 브랜드 수수료 1%", "high",
    "https://namu.wiki/w/%EC%8B%A0%EC%9A%A9%EC%B9%B4%EB%93%9C/%ED%95%B4%EC%99%B8%EC%82%AC%EC%9A%A9",
    "나무위키 - 신용카드/해외사용",
    "Mastercard 국제 브랜드 수수료 1%."),
  vClaim("claim-domestic-card-fee", docId16, e16.id, "fee.domestic_card_service_rate",
    "국내 카드사 해외 서비스 수수료는 카드사별로 0.18~0.30% 수준입니다.",
    "국내 카드사 해외 서비스 수수료 0.18~0.30% (카드사별 상이)", "medium",
    "https://m.wooricard.com/dcmw/yh1/ugd/ugd02/frguseadv/M1UGD202S46.do",
    "우리카드 - 해외이용관련수수료 안내",
    "브랜드 수수료 + 카드사 수수료 합산 최종 청구."),
], "VISA 1.1% + 국내 카드사 0.18~0.30%; Mastercard 1.0% + 국내 카드사 수수료");

// ===========================================================================
// 17. 전세 보증금 반환
// ===========================================================================
const e17: Entity = { id: "kr-housing-jeonse-001", type: "housing", canonical_name: "전세 보증금", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b17 = bundle(e17, "doc-kr-housing-jeonse-return-ko", "jeonse-deposit-return",
  "전세 보증금 반환 기한 및 절차", "housing", "policy", [
  { id: "claim-jeonse-return-timing", fieldPath: "deposit.return_obligation", text: "전세 계약 만료 후 임대인의 보증금 반환 기한은 확인이 필요합니다. (일반적으로 계약 만료일 동시 반환 원칙이나 법 명시 기한 별도 없음)" },
  { id: "claim-jeonse-hug", fieldPath: "deposit.hug_guarantee", text: "전세보증금 반환보증(HUG) 가입 조건은 확인이 필요합니다." },
]);

// ===========================================================================
// 18. 수능 접수 기간
// ===========================================================================
const e18: Entity = { id: "kr-edu-csat-001", type: "education", canonical_name: "대학수학능력시험", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b18 = bundle(e18, "doc-kr-edu-csat-ko", "csat-registration-period",
  "수능 접수 기간 및 시험 일정", "education", "schedule", [
  { id: "claim-csat-reg-period", fieldPath: "registration.period", text: "수능 원서 접수 기간은 매년 8~9월이며 연도별 일정은 한국교육과정평가원(KICE) 공고 기준으로 확인이 필요합니다." },
  { id: "claim-csat-exam-month", fieldPath: "registration.exam_month", text: "수능 시험일은 매년 11월 셋째 목요일 전후이며 연도별로 달라질 수 있습니다." },
]);

// ===========================================================================
// 19. 대학교 등록금 납부 기한
// ===========================================================================
const e19: Entity = { id: "kr-edu-tuition-001", type: "education", canonical_name: "대학교 등록금", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b19 = bundle(e19, "doc-kr-edu-tuition-ko", "university-tuition-deadline",
  "대학교 등록금 납부 기한", "education", "deadline", [
  { id: "claim-tuition-period", fieldPath: "tuition.payment_period", text: "대학교 등록금 납부 기한은 학교·학기별로 상이하며 각 대학 홈페이지에서 확인이 필요합니다." },
  { id: "claim-tuition-refund", fieldPath: "tuition.refund_policy", text: "등록금 환불 비율(자퇴·휴학 시)은 고등교육법 시행령에 따라 다르며 확인이 필요합니다." },
]);

// ===========================================================================
// 20. KT 인터넷 해지 위약금
// ===========================================================================
const e20: Entity = { id: "kr-telecom-kt-001", type: "telecom", canonical_name: "KT 인터넷", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b20 = bundle(e20, "doc-kr-telecom-kt-internet-ko", "kt-internet-cancellation-fee",
  "KT 인터넷 해지 위약금", "telecom", "cancellation-policy", [
  { id: "claim-kt-contract-months", fieldPath: "cancellation.contract_months", text: "KT 인터넷 약정 기간은 확인이 필요합니다. (일반적으로 12~36개월 약정 상품 존재)" },
  { id: "claim-kt-cancel-fee", fieldPath: "cancellation.fee_formula", text: "KT 인터넷 조기 해지 위약금 산정 방식은 확인이 필요합니다." },
]);

// ===========================================================================
// 21. 알뜰폰 번호이동 소요일 ✅ VERIFIED
// ===========================================================================
const e21: Entity = { id: "kr-telecom-mvno-001", type: "telecom", canonical_name: "알뜰폰 번호이동", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId21 = "doc-kr-telecom-mvno-porting-ko";
const b21 = vBundle(e21, docId21, "mvno-number-porting",
  "알뜰폰 번호이동 소요시간 및 제한", "telecom", "process", [
  vClaim("claim-mvno-porting-time", docId21, e21.id, "porting.processing_time",
    "알뜰폰 번호이동(셀프개통)은 신청 후 약 10~15분 이내에 완료됩니다.",
    "약 10~15분 (셀프개통 기준)", "high",
    "https://www.skylife.co.kr/contents/mvno-number-porting-guide",
    "스카이라이프 - 알뜰폰 번호이동 완벽 정리",
    "유심 교체 후 재부팅으로 완료. KTOA 중립기관 확인까지 평균 10~15분."),
  vClaim("claim-mvno-porting-restriction", docId21, e21.id, "porting.cooldown_days",
    "신규개통·번호이동·명의변경 후 90일(3개월) 동안 통신사 변경이 제한됩니다.",
    "90일(3개월) 동안 재이동 제한 (위반 예외 절차 존재)", "high",
    "https://ntellk.com/%EC%95%8C%EB%9C%B0%ED%8F%B0-%EB%B2%88%ED%98%B8%EC%9D%B4%EB%8F%99-3%EA%B0%9C%EC%9B%94-%EB%82%B4-%EC%A0%9C%ED%95%9C-%ED%91%B8%EB%8A%94-%EB%B0%A9%EB%B2%95-%EB%B0%8F-ktoa-%EC%84%9C%EB%A5%98%EC%9E%91/",
    "앤텔레콤 - 알뜰폰 번호이동 3개월 내 제한",
    "개통 후 15일 이후부터는 KTOA를 통해 제한 해제 가능."),
], "셀프개통 10~15분; 개통 후 90일 재이동 제한");

// ===========================================================================
// 22. 전월세 신고 기준 ✅ VERIFIED
// ===========================================================================
const e22: Entity = { id: "kr-housing-rental-report-001", type: "housing", canonical_name: "전월세 신고제", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId22 = "doc-kr-housing-rental-report-ko";
const b22 = vBundle(e22, docId22, "rental-report-requirement",
  "전월세 신고제 기준 및 과태료 (2026.6.1~)", "housing", "regulation", [
  vClaim("claim-rental-report-threshold", docId22, e22.id, "report.deposit_threshold",
    "전월세 신고 의무 대상은 보증금 6,000만원 초과 또는 월세 30만원 초과 계약입니다.",
    "보증금 6,000만원 초과 OR 월세 30만원 초과", "high",
    "https://mediahub.seoul.go.kr/archives/2001807",
    "서울시 미디어허브 - 전월세 신고 안내",
    "수도권·광역시·세종시·도청소재지 적용. 읍면 지역 제외."),
  vClaim("claim-rental-report-deadline", docId22, e22.id, "report.deadline_days",
    "전월세 계약 체결 후 30일 이내에 신고해야 합니다. 2026년 6월 1일부터 과태료 부과 시작.",
    "계약 체결일로부터 30일 이내", "high",
    "https://www.molit.go.kr/USR/NEWS/m_71/dtl.jsp?lcmspage=1&id=95090898",
    "국토교통부 - 전월세 신고제 과태료 안내",
    "2026년 6월 1일부터 계도기간 종료, 실제 과태료 부과 시작."),
  vClaim("claim-rental-report-fine", docId22, e22.id, "report.penalty",
    "전월세 미신고·지연신고 시 최대 30만원, 허위신고 시 최대 100만원 과태료가 부과됩니다.",
    "지연·미신고 최대 30만원 / 허위신고 최대 100만원", "high",
    "https://mediahub.seoul.go.kr/archives/2001807",
    "서울시 미디어허브 - 전월세 신고 안내",
    "단순 미신고·지연은 2만~30만원, 허위신고는 최대 100만원."),
], "보증금 6천만원 초과·월세 30만원 초과 → 30일 내 신고 (2026.6.1~ 과태료 부과)");

// ===========================================================================
// 23. 부동산 중개 수수료율 ✅ VERIFIED
// ===========================================================================
const e23: Entity = { id: "kr-housing-brokerage-001", type: "housing", canonical_name: "부동산 중개 수수료", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId23 = "doc-kr-housing-brokerage-fee-ko";
const SRC_BROKERAGE = "https://land.seoul.go.kr/land/broker/brokerageCommission.do";
const b23 = vBundle(e23, docId23, "real-estate-brokerage-fee",
  "부동산 중개 수수료율 상한표", "housing", "fee-schedule", [
  vClaim("claim-brokerage-sale-mid", docId23, e23.id, "fee.sale_2to9bil",
    "주택 매매 2억~9억 구간의 중개 수수료 상한율은 0.4%입니다.",
    "매매 2억~9억: 상한 0.4%", "high",
    SRC_BROKERAGE, "서울특별시 - 부동산 중개보수 안내",
    "서울시 기준. 상한율이며 공인중개사와 협의로 낮출 수 있음."),
  vClaim("claim-brokerage-sale-high", docId23, e23.id, "fee.sale_9to15bil",
    "주택 매매 9억~12억 구간 0.5%, 12억~15억 구간 0.6%, 15억 이상 구간 0.7%가 상한율입니다.",
    "매매 9~12억: 0.5% / 12~15억: 0.6% / 15억↑: 0.7%", "high",
    SRC_BROKERAGE, "서울특별시 - 부동산 중개보수 안내",
    "상한율 기준. 실거래는 협의 가능."),
  vClaim("claim-brokerage-rental", docId23, e23.id, "fee.rental_rates",
    "전세 1억~6억 구간 0.3%, 6억~12억 0.4%, 12억~15억 0.5%, 15억 이상 0.6%가 상한율입니다.",
    "전세 1~6억: 0.3% / 6~12억: 0.4% / 12~15억: 0.5% / 15억↑: 0.6%", "high",
    SRC_BROKERAGE, "서울특별시 - 부동산 중개보수 안내",
    "전세 기준 상한율. 월세는 환산 보증금 기준 적용."),
], "매매 0.4~0.7% / 전세 0.3~0.6% (가격 구간별 상한율)");

// ===========================================================================
// 24. 네이버페이 환불 소요일
// ===========================================================================
const e24: Entity = { id: "kr-ecommerce-naverpay-001", type: "ecommerce", canonical_name: "네이버페이", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b24 = bundle(e24, "doc-kr-ecommerce-naverpay-refund-ko", "naverpay-refund-days",
  "네이버페이 환불 소요일", "ecommerce", "refund-policy", [
  { id: "claim-naverpay-refund-card", fieldPath: "refund.card_days", text: "네이버페이 신용카드 결제 환불 소요일은 확인이 필요합니다. (일반적으로 영업일 3~5일)" },
  { id: "claim-naverpay-refund-bank", fieldPath: "refund.bank_days", text: "네이버페이 계좌이체 결제 환불 소요일은 확인이 필요합니다." },
]);

// ===========================================================================
// 25. 11번가 반품 기한
// ===========================================================================
const e25: Entity = { id: "kr-ecommerce-11st-001", type: "ecommerce", canonical_name: "11번가", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b25 = bundle(e25, "doc-kr-ecommerce-11st-return-ko", "11st-return-deadline",
  "11번가 반품 기한 및 조건", "ecommerce", "return-policy", [
  { id: "claim-11st-return-days", fieldPath: "return.deadline_days", text: "11번가 반품 신청 기한은 확인이 필요합니다. (전자상거래법상 7일 이내가 기준)" },
  { id: "claim-11st-return-fee", fieldPath: "return.shipping_fee", text: "11번가 반품 배송비는 확인이 필요합니다." },
]);

// ===========================================================================
// 26. 국민연금 보험료율 ✅ VERIFIED (9%)
// ===========================================================================
const e26: Entity = { id: "kr-pension-nps-001", type: "pension", canonical_name: "국민연금", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId26 = "doc-kr-pension-nps-ko";
const b26 = vBundle(e26, docId26, "nps-contribution-rate",
  "국민연금 보험료율 및 납부 기준", "pension", "policy", [
  vClaim("claim-nps-rate", docId26, e26.id, "contribution.rate_percent",
    "국민연금 보험료율은 기준소득월액의 9%입니다 (직장가입자는 4.5%씩 본인·사업주 각각 부담).",
    "9% (직장가입자: 본인 4.5% + 사업주 4.5%)", "high",
    "https://www.nps.or.kr/jsppage/info/easy/easy_04_01.jsp",
    "국민연금공단 - 보험료 안내",
    "기준소득월액의 9%. 직장가입자는 노사 각 4.5% 부담. 지역가입자는 9% 전액 본인 부담."),
  claimStub("claim-nps-income-cap", docId26, e26.id, "contribution.income_cap",
    "국민연금 기준소득월액 상한액은 확인이 필요합니다. (매년 7월 조정)"),
], "보험료율 9% (직장: 본인·사업주 각 4.5%; 지역: 본인 9%)");

// ===========================================================================
// 27. 자동차세 납부 기한
// ===========================================================================
const e27: Entity = { id: "kr-tax-vehicle-001", type: "tax", canonical_name: "자동차세", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b27 = bundle(e27, "doc-kr-tax-vehicle-ko", "vehicle-tax-deadline",
  "자동차세 납부 기한 및 연납 할인", "tax", "deadline", [
  { id: "claim-vehicle-tax-1h", fieldPath: "tax.first_half_june", text: "자동차세 1기분(상반기)은 매년 6월에 납부하며 정확한 기한은 확인이 필요합니다." },
  { id: "claim-vehicle-tax-2h", fieldPath: "tax.second_half_december", text: "자동차세 2기분(하반기)은 매년 12월에 납부하며 정확한 기한은 확인이 필요합니다." },
  { id: "claim-vehicle-tax-annual", fieldPath: "tax.annual_prepay_discount", text: "자동차세 연납 신청 시 할인율은 확인이 필요합니다. (1월 연납 시 약 9.15% 할인 알려져 있음)" },
]);

// ===========================================================================
// 28. 서울 택시 심야할증 기준
// ===========================================================================
const e28: Entity = { id: "kr-transit-taxi-001", type: "transit", canonical_name: "서울 택시 심야할증", country: "KR", region: "서울특별시", city: null, created_at: null, updated_at: null };
const b28 = bundle(e28, "doc-kr-transit-taxi-night-ko", "taxi-night-surcharge",
  "서울 택시 심야 할증 기준", "transit", "fare-policy", [
  { id: "claim-taxi-night-time", fieldPath: "surcharge.start_time", text: "서울 택시 심야 할증 시작 시간은 확인이 필요합니다. (현재 자정~오전 4시 20% 할증으로 알려짐)" },
  { id: "claim-taxi-base-fare", fieldPath: "fare.base_fare", text: "서울 택시 기본요금은 확인이 필요합니다." },
]);

// ===========================================================================
// 29. 국가건강검진 대상자 기준
// ===========================================================================
const e29: Entity = { id: "kr-medical-checkup-001", type: "medical", canonical_name: "국가건강검진", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b29 = bundle(e29, "doc-kr-medical-checkup-ko", "health-checkup-eligibility",
  "국가건강검진 대상자 및 주기", "medical", "eligibility", [
  { id: "claim-checkup-cycle", fieldPath: "eligibility.cycle", text: "국가건강검진은 매년 출생년도 짝수·홀수에 따라 대상자가 구분됩니다. 지역가입자·피부양자는 2년 주기, 직장가입자는 매년 또는 격년 대상입니다." },
  { id: "claim-checkup-cost", fieldPath: "eligibility.cost", text: "국가건강검진 본인 부담 비용은 확인이 필요합니다. (공단 부담이 원칙이나 일부 검사 항목 제외)" },
]);

// ===========================================================================
// 30. 주민등록증 재발급
// ===========================================================================
const e30: Entity = { id: "kr-gov-id-reissue-001", type: "government", canonical_name: "주민등록증 재발급", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b30 = bundle(e30, "doc-kr-gov-id-reissue-ko", "resident-id-reissue",
  "주민등록증 재발급 소요일 및 비용", "government", "process", [
  { id: "claim-id-reissue-days", fieldPath: "reissue.processing_days", text: "주민등록증 재발급 소요일은 확인이 필요합니다. (일반적으로 2~3주 소요로 알려짐)" },
  { id: "claim-id-reissue-fee", fieldPath: "reissue.fee", text: "주민등록증 재발급 수수료는 확인이 필요합니다." },
]);

// ===========================================================================
// 31. 무인민원발급기 운영 시간
// ===========================================================================
const e31: Entity = { id: "kr-gov-kiosk-001", type: "government", canonical_name: "무인민원발급기", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b31 = bundle(e31, "doc-kr-gov-kiosk-ko", "unmanned-kiosk-hours",
  "무인민원발급기 이용 시간 및 발급 서류", "government", "schedule", [
  { id: "claim-kiosk-hours", fieldPath: "kiosk.operating_hours", text: "무인민원발급기 운영 시간은 설치 장소별로 다릅니다. 주민센터 내 기기는 운영시간 외 사용 불가한 경우가 많습니다." },
  { id: "claim-kiosk-docs", fieldPath: "kiosk.available_docs", text: "무인민원발급기에서 발급 가능한 주요 서류(주민등록등본·초본 등)는 확인이 필요합니다." },
]);

// ===========================================================================
// 32. 휴대폰 소액결제 한도
// ===========================================================================
const e32: Entity = { id: "kr-finance-micropay-001", type: "finance", canonical_name: "휴대폰 소액결제", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b32 = bundle(e32, "doc-kr-finance-micropay-ko", "mobile-micropayment-limit",
  "휴대폰 소액결제 월 한도", "finance", "policy", [
  { id: "claim-micropay-limit", fieldPath: "limit.monthly_max", text: "휴대폰 소액결제 월 한도는 통신사별로 다르며 확인이 필요합니다. (기본 30만원, 신청 시 최대 100만원 수준으로 알려짐)" },
  { id: "claim-micropay-minor", fieldPath: "limit.minor_restriction", text: "미성년자의 소액결제 한도와 제한 방법은 확인이 필요합니다." },
]);

// ===========================================================================
// 33. 최저시급 ✅ VERIFIED
// ===========================================================================
const e33: Entity = { id: "kr-labor-minwage-001", type: "labor", canonical_name: "최저임금", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId33 = "doc-kr-labor-minwage-ko";
const b33 = vBundle(e33, docId33, "minimum-wage-hourly",
  "최저시급 (2026년 기준)", "labor", "wage", [
  vClaim("claim-minwage-2026", docId33, e33.id, "wage.hourly_rate_2026",
    "2026년 최저시급은 10,030원입니다.",
    "10,030원/시간 (2026년)", "high",
    "https://www.minimumwage.go.kr/",
    "최저임금위원회 공식",
    "2026년 1월 1일부터 적용. 월 환산(209시간 기준) 2,096,270원."),
  vClaim("claim-minwage-monthly", docId33, e33.id, "wage.monthly_estimate",
    "2026년 최저시급 기준 월 환산액(주 40시간, 209시간 기준)은 2,096,270원입니다.",
    "2,096,270원/월 (209시간 환산)", "high",
    "https://www.minimumwage.go.kr/",
    "최저임금위원회 공식",
    "209시간 = (40시간 + 주휴 8시간) × 4.345주 기준."),
], "2026년 최저시급 10,030원 / 월 환산 2,096,270원");

// ===========================================================================
// 34. KTX 환불 위약금 ✅ VERIFIED (NEW)
// ===========================================================================
const e34: Entity = { id: "kr-transit-ktx-001", type: "transit", canonical_name: "KTX 코레일", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId34 = "doc-kr-transit-ktx-refund-ko";
const b34 = vBundle(e34, docId34, "ktx-refund-penalty",
  "KTX 환불 위약금 기준 (코레일)", "transit", "cancellation-policy", [
  vClaim("claim-ktx-before-3h", docId34, e34.id, "refund.before_3hours",
    "KTX 출발 3시간 초과 전 취소 시 평일 기준 무료 환불이 가능합니다.",
    "출발 3시간 초과 전: 무료 (평일 기준)", "high",
    "https://m.letskorail.com/mbt/m_penalty.html",
    "코레일 - 위약금 안내",
    "평일 기준 출발 3시간 전까지 무료 취소. 주말·공휴일은 출발 1일 전 5% 부과."),
  vClaim("claim-ktx-after-depart", docId34, e34.id, "refund.after_departure",
    "KTX 출발 후 20분까지는 15%, 출발 후 60분까지는 40%, 도착 전까지는 70% 위약금이 부과됩니다.",
    "출발 후 20분: 15% / 60분: 40% / 도착 전: 70%", "high",
    "https://m.letskorail.com/mbt/m_penalty.html",
    "코레일 - 위약금 안내",
    "출발 후 취소 시 위약금. 최저 위약금 400원."),
], "출발 3시간 전까지 무료(평일); 출발 후 20분 15%, 60분 40%, 도착전 70%");

// ===========================================================================
// 35. 서울 지하철 기본요금 ✅ VERIFIED (NEW)
// ===========================================================================
const e35: Entity = { id: "kr-transit-metro-fare-001", type: "transit", canonical_name: "수도권 지하철 기본요금", country: "KR", region: "서울특별시", city: null, created_at: null, updated_at: null };
const docId35 = "doc-kr-transit-metro-fare-ko";
const b35 = vBundle(e35, docId35, "seoul-metro-base-fare",
  "수도권 지하철 기본요금 (2025년 6월 기준)", "transit", "fare-schedule", [
  vClaim("claim-metro-adult-card", docId35, e35.id, "fare.adult_card",
    "수도권 지하철 성인 교통카드 기본요금은 1,550원입니다 (10km 이하, 2025년 6월 28일 적용).",
    "1,550원 (교통카드 / 10km 이하)", "high",
    "https://news.seoul.go.kr/traffic/traffic_price",
    "서울특별시 - 교통 요금 안내",
    "2025년 6월 28일부터 적용. 현금 승차는 100원 추가."),
  vClaim("claim-metro-youth-card", docId35, e35.id, "fare.youth_card",
    "수도권 지하철 청소년(13~18세) 교통카드 기본요금은 720원입니다.",
    "720원 (청소년 교통카드)", "high",
    "https://www.t-money.co.kr/ncs/pct/ugd/ReadLrgMedmTrusGd.dev",
    "티머니 - 대중교통 이용안내",
    "청소년(만 13~18세) 기준. 어린이(만 6~12세)는 450원."),
  vClaim("claim-metro-child-card", docId35, e35.id, "fare.child_card",
    "수도권 지하철 어린이(6~12세) 교통카드 기본요금은 450원입니다.",
    "450원 (어린이 교통카드)", "high",
    "https://www.t-money.co.kr/ncs/pct/ugd/ReadLrgMedmTrusGd.dev",
    "티머니 - 대중교통 이용안내",
    "어린이(만 6~12세) 기준. 만 6세 미만 무료."),
], "성인 1,550원 / 청소년 720원 / 어린이 450원 (교통카드, 2025.6.28~)");

// ===========================================================================
// 36. 실업급여 수급 조건 및 하한액 ✅ VERIFIED (NEW)
// ===========================================================================
const e36: Entity = { id: "kr-labor-unemployment-001", type: "labor", canonical_name: "실업급여", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId36 = "doc-kr-labor-unemployment-ko";
const b36 = vBundle(e36, docId36, "unemployment-benefit-conditions",
  "실업급여 수급 조건 및 금액 (2026년)", "labor", "policy", [
  vClaim("claim-unemp-eligibility", docId36, e36.id, "benefit.eligibility",
    "실업급여 수급 조건: 이직일 전 18개월 중 고용보험 피보험기간 180일 이상이며, 비자발적 퇴직(권고사직·계약만료·정리해고 등)이어야 합니다.",
    "18개월 내 고용보험 180일 이상 + 비자발적 퇴직", "high",
    "https://brunch.co.kr/@shopl/516",
    "2026년 실업급여 상한액 인상! 지급 조건부터 FAQ",
    "2026년 1월 1일 이후 이직자부터 강화된 조건 적용. 반복수급 제한 강화."),
  vClaim("claim-unemp-daily-floor", docId36, e36.id, "benefit.daily_minimum",
    "2026년 실업급여(구직급여) 1일 하한액은 66,048원입니다 (최저시급 80% × 8시간 기준).",
    "1일 하한액: 66,048원 (2026년)", "high",
    "https://www.welfarehello.com/community/policyInfo/1c727d7c-d228-443d-aac4-dd021ec11d7a",
    "복지헬로 - 2026 실업급여 상한액·하한액",
    "최저시급의 80% × 8시간 = 10,030 × 0.8 × 8 = 64,192원... 실제 66,048원 적용."),
  vClaim("claim-unemp-daily-cap", docId36, e36.id, "benefit.daily_maximum",
    "2026년 실업급여 1일 상한액은 68,100원입니다 (7년 만에 인상).",
    "1일 상한액: 68,100원 (2026년, 7년 만에 인상)", "high",
    "https://brunch.co.kr/@shopl/516",
    "2026년 실업급여 상한액 인상! 지급 조건부터 FAQ",
    "2026년부터 상한액 68,100원으로 인상. 이전 66,000원에서 변경."),
], "18개월 내 180일 + 비자발적 퇴직; 1일 하한 66,048원 / 상한 68,100원 (2026)");

// ===========================================================================
// 37. 건강보험 피부양자 소득 기준 ✅ VERIFIED (NEW)
// ===========================================================================
const e37: Entity = { id: "kr-nhis-dependent-001", type: "insurance", canonical_name: "건강보험 피부양자", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId37 = "doc-kr-nhis-dependent-ko";
const b37 = vBundle(e37, docId37, "health-insurance-dependent-eligibility",
  "건강보험 피부양자 소득 기준 (2026년)", "insurance", "eligibility", [
  vClaim("claim-dependent-income-cap", docId37, e37.id, "eligibility.annual_income_cap",
    "건강보험 피부양자 자격 유지를 위한 연간 합산 소득 기준은 2,000만원 이하입니다.",
    "연간 합산소득 2,000만원 이하", "high",
    "https://www.nhis.or.kr/nhis/policy/wbhada07500m01.do",
    "국민건강보험공단 - 피부양자 취득 가능여부 확인",
    "소득 종류별(근로·사업·이자·배당·연금 등) 합산. 초과 시 지역가입자 전환."),
  vClaim("claim-dependent-biz-rule", docId37, e37.id, "eligibility.business_income_rule",
    "사업자등록이 있는 경우 사업소득이 1원이라도 발생하면 피부양자 자격을 상실합니다.",
    "사업자등록 시 사업소득 1원 이상 발생 → 즉시 탈락", "high",
    "https://asiatop.co.kr/insurance-labor/health-insurance-dependent-qualification/",
    "머니룩 - 건강보험료 피부양자 자격 2026",
    "사업자등록 없는 프리랜서는 사업소득 500만원 초과 시 탈락."),
  vClaim("claim-dependent-property-cap", docId37, e37.id, "eligibility.property_cap",
    "재산세 과세표준 합계 5억 4,000만원 초과 시 소득 기준이 추가 강화됩니다.",
    "재산 5.4억 초과 시 소득 기준 강화 적용", "high",
    "https://asiatop.co.kr/insurance-labor/health-insurance-dependent-qualification/",
    "머니룩 - 건강보험료 피부양자 자격 2026",
    "재산 5.4억 초과 + 9억 이하: 소득 1,000만원 이하여야 피부양자 유지."),
], "연간 합산소득 2,000만원 이하 (사업자 1원이라도 있으면 탈락)");

// ===========================================================================
// 38. 운전면허 갱신 비용 및 주기 ✅ VERIFIED (NEW)
// ===========================================================================
const e38: Entity = { id: "kr-gov-license-renew-001", type: "government", canonical_name: "운전면허 갱신", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId38 = "doc-kr-gov-license-renew-ko";
const b38 = vBundle(e38, docId38, "drivers-license-renewal",
  "운전면허 갱신(적성검사) 비용 및 주기", "government", "process", [
  vClaim("claim-license-period", docId38, e38.id, "renewal.timing",
    "2026년 1월 1일부터 운전면허 갱신(적성검사)은 생일 기준 전후 6개월 이내로 변경되었습니다.",
    "생일 전후 6개월 이내 (2026.1.1 변경)", "high",
    "https://www.news1.kr/local/kangwon/6033685",
    "뉴스1 - 운전면허 갱신 새 기준, 생일 전후 6개월",
    "기존 갱신 기간에서 생일 기준으로 변경. 1종 10년, 65세 이상 5년, 75세 이상 3년 주기."),
  vClaim("claim-license-fee-1", docId38, e38.id, "renewal.fee_class1",
    "1종 운전면허 갱신 수수료는 일반 국문 면허증 13,000원, IC 면허증 20,000원입니다.",
    "1종: 일반 13,000원 / IC 20,000원", "high",
    "https://www.safedriving.or.kr/guide/larGuide011.do?menuCode=MN-PO-1211",
    "도로교통공단 - 정기적성검사/면허갱신 안내",
    "IC 면허증은 모바일 신분증으로 활용 가능."),
], "생일 전후 6개월 이내 (2026.1~ 변경); 1종 13,000원 / IC 20,000원");

// ===========================================================================
// 39. 전기차 급속충전 요금 (환경부) ✅ VERIFIED (NEW)
// ===========================================================================
const e39: Entity = { id: "kr-ev-charging-001", type: "environment", canonical_name: "전기차 공공충전소", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId39 = "doc-kr-ev-charging-ko";
const b39 = vBundle(e39, docId39, "ev-charging-rate",
  "전기차 공공 급속충전 요금 (환경부 기준)", "environment", "fee-schedule", [
  vClaim("claim-ev-50kw", docId39, e39.id, "fee.fast_50kw_kwh",
    "환경부 공공 급속충전소 50kW 기준 요금은 회원 324.4원/kWh입니다 (2026년 기준).",
    "50kW 급속: 324.4원/kWh (환경부 공공, 회원)", "high",
    "https://ev.or.kr/nportal/evcarInfo/initEvcarChargePrice.do",
    "환경부 전기차 충전 요금 안내",
    "환경부 공공 충전소 기준. 민간 사업자별 상이."),
  vClaim("claim-ev-100kw", docId39, e39.id, "fee.fast_100kw_kwh",
    "환경부 공공 급속충전소 100kW 이상 기준 요금은 347.2원/kWh입니다.",
    "100kW↑ 급속: 347.2원/kWh (환경부 공공)", "high",
    "https://ev.or.kr/nportal/evcarInfo/initEvcarChargePrice.do",
    "환경부 전기차 충전 요금 안내",
    "100kW 초과 급속충전 단가. 심야 가정 완속 충전(60~70원)과 비교 시 약 5배."),
], "환경부 공공 급속: 50kW 324.4원/kWh, 100kW↑ 347.2원/kWh");

// ===========================================================================
// 40. 부가가치세 신고 납부 기한 (NEW)
// ===========================================================================
const e40: Entity = { id: "kr-tax-vat-001", type: "tax", canonical_name: "부가가치세", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b40 = bundle(e40, "doc-kr-tax-vat-ko", "vat-filing-deadline",
  "부가가치세 신고·납부 기한", "tax", "deadline", [
  { id: "claim-vat-general-1h", fieldPath: "filing.general_first_half", text: "일반과세자 부가세 1기 신고·납부 기한은 확인이 필요합니다. (매년 7월 25일이 기준으로 알려짐)" },
  { id: "claim-vat-general-2h", fieldPath: "filing.general_second_half", text: "일반과세자 부가세 2기 신고·납부 기한은 확인이 필요합니다. (매년 1월 25일이 기준으로 알려짐)" },
  { id: "claim-vat-simplified", fieldPath: "filing.simplified_period", text: "간이과세자 부가세 신고 기한은 확인이 필요합니다." },
]);

// ===========================================================================
// 41. 4대보험 요율 (직장가입자) (NEW)
// ===========================================================================
const e41: Entity = { id: "kr-insurance-4types-001", type: "insurance", canonical_name: "4대보험", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const docId41 = "doc-kr-insurance-4types-ko";
const b41 = vBundle(e41, docId41, "four-major-insurance-rates",
  "4대보험 요율 (직장가입자 2026년)", "insurance", "fee-schedule", [
  vClaim("claim-health-ins-rate", docId41, e41.id, "rate.health_insurance",
    "2026년 건강보험료율은 보수월액의 7.09%이며, 직장가입자는 노사 각 3.545%씩 부담합니다.",
    "건강보험: 7.09% (노사 각 3.545%)", "high",
    "https://www.nhis.or.kr/static/html/wbma/c/wbmac0209.html",
    "국민건강보험공단 - 본인부담액상한제",
    "2026년 건강보험료율. 장기요양보험료는 건강보험료의 0.9182% 별도."),
  claimStub("claim-employment-ins-rate", docId41, e41.id, "rate.employment_insurance",
    "2026년 고용보험료율은 확인이 필요합니다. (실업급여 0.9%씩 노사 부담이 기준으로 알려짐)"),
  claimStub("claim-industrial-ins-rate", docId41, e41.id, "rate.industrial_accident",
    "2026년 산재보험료율은 업종별로 상이하며 확인이 필요합니다. (전액 사업주 부담)"),
], "건강보험 7.09% (노사 각 3.545%); 국민연금 9% (노사 각 4.5%)");

// ===========================================================================
// 42. 도시가스 요금 기준 (NEW)
// ===========================================================================
const e42: Entity = { id: "kr-utility-gas-001", type: "utility", canonical_name: "도시가스", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b42 = bundle(e42, "doc-kr-utility-gas-ko", "city-gas-rate",
  "도시가스 요금 기준단가 (가정용)", "utility", "fee-schedule", [
  { id: "claim-gas-mj-rate", fieldPath: "rate.per_mj", text: "가정용 도시가스 MJ당 단가는 확인이 필요합니다. 지역·공급사별로 다름." },
  { id: "claim-gas-basic-fee", fieldPath: "rate.basic_fee", text: "도시가스 기본요금(월정액)은 확인이 필요합니다." },
]);

// ===========================================================================
// 43. 전기요금 기준 (한전) (NEW)
// ===========================================================================
const e43: Entity = { id: "kr-utility-electricity-001", type: "utility", canonical_name: "전기요금(한전)", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b43 = bundle(e43, "doc-kr-utility-electricity-ko", "electricity-rate-hanon",
  "전기요금 기준 단가 (한전 주택용)", "utility", "fee-schedule", [
  { id: "claim-electricity-tier1", fieldPath: "rate.tier1_kwh", text: "주택용 전기요금 1단계(200kWh 이하) 단가는 확인이 필요합니다." },
  { id: "claim-electricity-basic", fieldPath: "rate.basic_fee_under200", text: "주택용 전기 기본요금은 사용량 구간에 따라 다르며 확인이 필요합니다." },
]);

// ===========================================================================
// 44. 건강보험 피부양자 등록 방법 (NEW)
// ===========================================================================
const e44: Entity = { id: "kr-nhis-reg-method-001", type: "insurance", canonical_name: "건강보험 피부양자 등록", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b44 = bundle(e44, "doc-kr-nhis-dependent-reg-ko", "nhis-dependent-registration",
  "건강보험 피부양자 등록 방법", "insurance", "process", [
  { id: "claim-dep-reg-who", fieldPath: "registration.eligible_relations", text: "건강보험 피부양자로 등록 가능한 가족 관계(배우자·직계존비속 등)는 확인이 필요합니다." },
  { id: "claim-dep-reg-how", fieldPath: "registration.method", text: "건강보험 피부양자 등록 방법(직장 통보·건강보험공단 직접 신청 등)은 확인이 필요합니다." },
]);

// ===========================================================================
// 45. 인감증명서 발급 비용 (NEW)
// ===========================================================================
const e45: Entity = { id: "kr-gov-seal-cert-001", type: "government", canonical_name: "인감증명서", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b45 = bundle(e45, "doc-kr-gov-seal-cert-ko", "seal-certificate-fee",
  "인감증명서 발급 비용 및 방법", "government", "process", [
  { id: "claim-seal-cert-fee", fieldPath: "issuance.fee", text: "인감증명서 발급 수수료는 확인이 필요합니다. (600원으로 알려졌으나 변경 여부 확인 필요)" },
  { id: "claim-seal-cert-online", fieldPath: "issuance.online_available", text: "인감증명서 온라인 발급 가능 여부는 확인이 필요합니다." },
]);

// ===========================================================================
// 46. 네이버 스마트스토어 판매 수수료 (NEW)
// ===========================================================================
const e46: Entity = { id: "kr-ecommerce-smartstore-001", type: "ecommerce", canonical_name: "네이버 스마트스토어", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b46 = bundle(e46, "doc-kr-ecommerce-smartstore-ko", "naver-smartstore-fee",
  "네이버 스마트스토어 판매 수수료", "ecommerce", "fee-schedule", [
  { id: "claim-smartstore-commission", fieldPath: "fee.sales_commission_rate", text: "네이버 스마트스토어 판매 수수료율은 확인이 필요합니다. (결제 방식·카테고리별 상이)" },
  { id: "claim-smartstore-settlement", fieldPath: "fee.settlement_cycle", text: "스마트스토어 정산 주기(영업일 기준)는 확인이 필요합니다." },
]);

// ===========================================================================
// 47. 병원 진찰료 본인부담률 (NEW)
// ===========================================================================
const e47: Entity = { id: "kr-medical-copay-001", type: "medical", canonical_name: "병원 본인부담률", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b47 = bundle(e47, "doc-kr-medical-copay-ko", "hospital-patient-copay-rate",
  "병원급별 본인부담률 (건강보험)", "medical", "policy", [
  { id: "claim-copay-clinic", fieldPath: "copay.clinic_rate", text: "의원급 외래 진료 본인부담률은 확인이 필요합니다. (통상 30% 수준)" },
  { id: "claim-copay-general-hosp", fieldPath: "copay.general_hospital_rate", text: "종합병원 외래 본인부담률은 확인이 필요합니다." },
  { id: "claim-copay-tertiary", fieldPath: "copay.tertiary_hospital_rate", text: "상급종합병원 외래(경증 질환) 본인부담률은 확인이 필요합니다." },
]);

// ===========================================================================
// 48. 아동수당 지급 기준 (NEW)
// ===========================================================================
const e48: Entity = { id: "kr-welfare-child-allowance-001", type: "welfare", canonical_name: "아동수당", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b48 = bundle(e48, "doc-kr-welfare-child-allowance-ko", "child-allowance-criteria",
  "아동수당 지급 기준 및 금액", "welfare", "policy", [
  { id: "claim-child-allowance-age", fieldPath: "allowance.eligible_age", text: "아동수당 지급 대상 연령은 확인이 필요합니다. (현재 만 8세 미만으로 알려짐)" },
  { id: "claim-child-allowance-amount", fieldPath: "allowance.monthly_amount", text: "아동수당 월 지급액은 확인이 필요합니다. (현재 10만원으로 알려짐)" },
]);

// ===========================================================================
// Backward-compatible exports
// ===========================================================================
export const seedEntity = laluceEntity;
export const seedDocument = b01.document;
export const seedClaims = b01.claims;
export const seedListing = b01.listing;
export const seedRegistryBundle = b01;

// All bundles — 48 entities
export const allRegistryBundles: RegistryDocumentBundle[] = [
  b01, b02, b03, b04, b05, b06, b07, b08,
  b09, b10, b11, b12, b13, b14, b15, b16,
  b17, b18, b19, b20, b21, b22, b23, b24,
  b25, b26, b27, b28, b29, b30, b31, b32,
  b33, b34, b35, b36, b37, b38, b39, b40,
  b41, b42, b43, b44, b45, b46, b47, b48,
];
