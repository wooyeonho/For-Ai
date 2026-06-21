import type { ClaimWithSources, Entity, Listing, RegistryDocumentBundle, Document } from "./types";

// ---------------------------------------------------------------------------
// Helper: build a standard claim stub (확인 필요 / low / needs_review)
// ---------------------------------------------------------------------------
function claimStub(
  id: string,
  docId: string,
  entityId: string,
  fieldPath: string,
  text: string,
): ClaimWithSources {
  return {
    id,
    document_id: docId,
    entity_id: entityId,
    field_path: fieldPath,
    claim_text: text,
    claim_value: "확인 필요",
    confidence: "low",
    status: "needs_review",
    last_verified_at: null,
    created_at: null,
    updated_at: null,
    sources: [],
    verification_events: [],
  };
}

// ---------------------------------------------------------------------------
// Helper: build a listing from entity + document
// ---------------------------------------------------------------------------
function makeListing(entity: Entity, d: Document, summary: string): Listing {
  return {
    id: `listing-${d.id}`,
    entity_id: entity.id,
    document_id: d.id,
    lang: d.lang,
    slug: d.slug,
    title: d.title,
    summary,
    status: d.status,
    confidence: d.confidence,
    created_at: null,
    updated_at: null,
  };
}

// ---------------------------------------------------------------------------
// Helper: build a document
// ---------------------------------------------------------------------------
function makeDoc(
  id: string,
  entity: Entity,
  slug: string,
  title: string,
  category: string,
  template: string,
): Document {
  return {
    id,
    entity_id: entity.id,
    slug,
    lang: "ko",
    title,
    category,
    template,
    status: "ai_draft",
    confidence: "low",
    last_verified_at: null,
    license_code: "gyeol-data-license-v0.1",
    data: {
      direct_answer: "확인 필요",
      locale_path: `/ko/wiki/${slug}`,
      canonical_path: `/ko/wiki/${slug}`,
      machine_readable: {
        api_url: `/api/documents/${slug}`,
        raw_markdown_url: `/raw/${slug}.md`,
      },
      license_notice:
        "GYEOL Data License v0.1 placeholder. 외부 데이터 라이선스 고지는 추후 구체화됩니다.",
    },
    created_at: null,
    updated_at: null,
  };
}

// ---------------------------------------------------------------------------
// Helper: build a full bundle
// ---------------------------------------------------------------------------
function bundle(
  entity: Entity,
  docId: string,
  slug: string,
  title: string,
  category: string,
  template: string,
  claims: Array<{ id: string; fieldPath: string; text: string }>,
): RegistryDocumentBundle {
  const d = makeDoc(docId, entity, slug, title, category, template);
  return {
    entity,
    document: d,
    claims: claims.map((c) => claimStub(c.id, d.id, entity.id, c.fieldPath, c.text)),
    listing: makeListing(entity, d, "확인 필요"),
  };
}

// ===========================================================================
// 1. 명동 라루체 주차 (기존 MVP 시드)
// ===========================================================================
export const laluceEntity: Entity = {
  id: "kr-weddinghall-laluce-001",
  type: "weddinghall",
  canonical_name: "명동 라루체",
  country: "KR",
  region: "서울특별시",
  city: "중구",
  created_at: null,
  updated_at: null,
};

const b01 = bundle(laluceEntity, "doc-kr-weddinghall-laluce-parking-ko", "myungdong-laluce-parking", "명동 라루체 주차 정보", "weddinghall", "parking", [
  { id: "claim-parking-availability", fieldPath: "parking.availability", text: "명동 라루체의 하객 주차 가능 여부는 확인이 필요합니다." },
  { id: "claim-parking-free-minutes", fieldPath: "parking.free_parking_minutes", text: "명동 라루체의 무료 주차 지원 시간은 확인이 필요합니다." },
  { id: "claim-parking-congestion", fieldPath: "parking.congestion", text: "명동 라루체 주변 주차 혼잡도는 확인이 필요합니다." },
]);

// ===========================================================================
// 2. CJ대한통운 제주도 배송
// ===========================================================================
const e02: Entity = { id: "kr-delivery-cj-logistics-001", type: "delivery", canonical_name: "CJ대한통운", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b02 = bundle(e02, "doc-kr-delivery-cj-jeju-ko", "cj-logistics-jeju-delivery", "CJ대한통운 제주도 배송 추가일수", "delivery", "shipping-policy", [
  { id: "claim-cj-jeju-additional-days", fieldPath: "delivery.additional_days", text: "CJ대한통운 제주도 배송 시 추가 소요일수는 확인이 필요합니다." },
  { id: "claim-cj-jeju-surcharge", fieldPath: "delivery.surcharge", text: "CJ대한통운 제주도 배송 추가 요금은 확인이 필요합니다." },
  { id: "claim-cj-jeju-island-coverage", fieldPath: "delivery.island_coverage", text: "CJ대한통운 제주도 도서산간 배송 가능 여부는 확인이 필요합니다." },
]);

// ===========================================================================
// 3. 쿠팡 로켓배송 식품 환불
// ===========================================================================
const e03: Entity = { id: "kr-ecommerce-coupang-001", type: "ecommerce", canonical_name: "쿠팡", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b03 = bundle(e03, "doc-kr-ecommerce-coupang-food-refund-ko", "coupang-rocket-food-refund", "쿠팡 로켓배송 식품 환불 기한", "ecommerce", "refund-policy", [
  { id: "claim-coupang-food-refund-deadline", fieldPath: "refund.deadline_days", text: "쿠팡 로켓배송 식품 환불 기한(일수)은 확인이 필요합니다." },
  { id: "claim-coupang-food-refund-conditions", fieldPath: "refund.conditions", text: "쿠팡 로켓배송 식품 환불 조건은 확인이 필요합니다." },
  { id: "claim-coupang-food-refund-process", fieldPath: "refund.process", text: "쿠팡 로켓배송 식품 환불 절차는 확인이 필요합니다." },
]);

// ===========================================================================
// 4. 여권 재발급 수수료
// ===========================================================================
const e04: Entity = { id: "kr-government-passport-001", type: "government", canonical_name: "대한민국 여권", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b04 = bundle(e04, "doc-kr-government-passport-reissue-ko", "passport-reissue-fee", "여권 재발급 수수료 (2025년 기준)", "government", "fee-schedule", [
  { id: "claim-passport-adult-fee", fieldPath: "fee.adult_reissue", text: "성인 여권 재발급 수수료는 확인이 필요합니다." },
  { id: "claim-passport-minor-fee", fieldPath: "fee.minor_reissue", text: "미성년자 여권 재발급 수수료는 확인이 필요합니다." },
  { id: "claim-passport-processing-days", fieldPath: "fee.processing_days", text: "여권 재발급 처리 소요일수는 확인이 필요합니다." },
]);

// ===========================================================================
// 5. SKT 청소년 요금제
// ===========================================================================
const e05: Entity = { id: "kr-telecom-skt-001", type: "telecom", canonical_name: "SK텔레콤", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b05 = bundle(e05, "doc-kr-telecom-skt-youth-plan-ko", "skt-youth-plan-data", "SKT 청소년 요금제 데이터 제공량", "telecom", "plan-details", [
  { id: "claim-skt-youth-data-amount", fieldPath: "plan.data_amount", text: "SKT 청소년 요금제 월 데이터 제공량은 확인이 필요합니다." },
  { id: "claim-skt-youth-monthly-fee", fieldPath: "plan.monthly_fee", text: "SKT 청소년 요금제 월 요금은 확인이 필요합니다." },
  { id: "claim-skt-youth-age-requirement", fieldPath: "plan.age_requirement", text: "SKT 청소년 요금제 가입 연령 기준은 확인이 필요합니다." },
]);

// ===========================================================================
// 6. 카카오뱅크 해외 송금
// ===========================================================================
const e06: Entity = { id: "kr-bank-kakaobank-001", type: "bank", canonical_name: "카카오뱅크", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b06 = bundle(e06, "doc-kr-bank-kakaobank-overseas-transfer-ko", "kakaobank-overseas-transfer-fee", "카카오뱅크 해외 송금 수수료", "bank", "fee-schedule", [
  { id: "claim-kakao-transfer-fee", fieldPath: "fee.transfer_fee", text: "카카오뱅크 해외 송금 수수료는 확인이 필요합니다." },
  { id: "claim-kakao-exchange-markup", fieldPath: "fee.exchange_rate_markup", text: "카카오뱅크 해외 송금 환율 우대 적용 여부는 확인이 필요합니다." },
  { id: "claim-kakao-transfer-limit", fieldPath: "fee.transfer_limit", text: "카카오뱅크 해외 송금 한도는 확인이 필요합니다." },
]);

// ===========================================================================
// 7. 배달의민족 최소 주문
// ===========================================================================
const e07: Entity = { id: "kr-delivery-app-baemin-001", type: "delivery-app", canonical_name: "배달의민족", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b07 = bundle(e07, "doc-kr-delivery-app-baemin-minimum-order-ko", "baemin-minimum-order", "배달의민족 최소 주문 금액 기준", "delivery-app", "order-policy", [
  { id: "claim-baemin-minimum-amount", fieldPath: "order.minimum_amount", text: "배달의민족 최소 주문 금액은 확인이 필요합니다." },
  { id: "claim-baemin-delivery-fee", fieldPath: "order.delivery_fee", text: "배달의민족 기본 배달비는 확인이 필요합니다." },
  { id: "claim-baemin-free-delivery-threshold", fieldPath: "order.free_delivery_threshold", text: "배달의민족 무료 배달 기준 금액은 확인이 필요합니다." },
]);

// ===========================================================================
// 8. 응급실 야간 진료비
// ===========================================================================
const e08: Entity = { id: "kr-medical-er-nightfee-001", type: "medical", canonical_name: "응급실 야간 진료", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b08 = bundle(e08, "doc-kr-medical-er-nightfee-ko", "er-night-visit-fee", "응급실 야간 진료비 본인부담금", "medical", "fee-schedule", [
  { id: "claim-er-night-surcharge", fieldPath: "fee.night_surcharge", text: "응급실 야간(22시 이후) 가산료는 확인이 필요합니다." },
  { id: "claim-er-holiday-surcharge", fieldPath: "fee.holiday_surcharge", text: "응급실 공휴일 가산료는 확인이 필요합니다." },
  { id: "claim-er-copay-rate", fieldPath: "fee.copay_rate", text: "응급실 본인부담률은 확인이 필요합니다." },
]);

// ===========================================================================
// 9. 건강보험 본인부담금 상한제
// ===========================================================================
const e09: Entity = { id: "kr-insurance-nhis-cap-001", type: "insurance", canonical_name: "국민건강보험", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b09 = bundle(e09, "doc-kr-insurance-nhis-copay-cap-ko", "nhis-copay-cap", "건강보험 본인부담금 상한제 기준", "insurance", "policy", [
  { id: "claim-nhis-cap-income-tier", fieldPath: "cap.income_tier_thresholds", text: "소득분위별 본인부담 상한액은 확인이 필요합니다." },
  { id: "claim-nhis-cap-refund-period", fieldPath: "cap.refund_period", text: "본인부담 상한제 환급 시기는 확인이 필요합니다." },
  { id: "claim-nhis-cap-exclusions", fieldPath: "cap.exclusions", text: "본인부담 상한제 제외 항목은 확인이 필요합니다." },
]);

// ===========================================================================
// 10. 서울 지하철 환승 시간 제한
// ===========================================================================
const e10: Entity = { id: "kr-transit-seoul-metro-001", type: "transit", canonical_name: "서울 지하철", country: "KR", region: "서울특별시", city: null, created_at: null, updated_at: null };
const b10 = bundle(e10, "doc-kr-transit-seoul-metro-transfer-ko", "seoul-metro-transfer-time", "서울 지하철 환승 시간 제한", "transit", "transfer-policy", [
  { id: "claim-metro-transfer-limit-minutes", fieldPath: "transfer.time_limit_minutes", text: "서울 지하철 환승 인정 시간(분)은 확인이 필요합니다." },
  { id: "claim-metro-transfer-bus", fieldPath: "transfer.bus_transfer_included", text: "버스-지하철 환승 할인 적용 여부는 확인이 필요합니다." },
  { id: "claim-metro-transfer-count", fieldPath: "transfer.max_transfers", text: "최대 환승 횟수 제한은 확인이 필요합니다." },
]);

// ===========================================================================
// 11. 고속도로 통행료 (서울-부산)
// ===========================================================================
const e11: Entity = { id: "kr-transit-expressway-001", type: "transit", canonical_name: "한국도로공사", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b11 = bundle(e11, "doc-kr-transit-expressway-seoul-busan-ko", "expressway-seoul-busan-toll", "고속도로 통행료 (서울-부산)", "transit", "toll-schedule", [
  { id: "claim-expressway-toll-car", fieldPath: "toll.passenger_car", text: "서울-부산 경부고속도로 승용차 통행료는 확인이 필요합니다." },
  { id: "claim-expressway-toll-hipass", fieldPath: "toll.hipass_discount", text: "하이패스 할인율은 확인이 필요합니다." },
  { id: "claim-expressway-toll-night", fieldPath: "toll.night_discount", text: "심야 통행료 할인 적용 시간대는 확인이 필요합니다." },
]);

// ===========================================================================
// 12. 종합소득세 신고 기한
// ===========================================================================
const e12: Entity = { id: "kr-tax-income-001", type: "tax", canonical_name: "국세청", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b12 = bundle(e12, "doc-kr-tax-income-deadline-ko", "income-tax-filing-deadline", "종합소득세 신고 기한", "tax", "deadline", [
  { id: "claim-income-tax-deadline", fieldPath: "filing.deadline", text: "종합소득세 정기 신고 마감일은 확인이 필요합니다." },
  { id: "claim-income-tax-late-penalty", fieldPath: "filing.late_penalty_rate", text: "종합소득세 기한 후 신고 가산세율은 확인이 필요합니다." },
  { id: "claim-income-tax-extension", fieldPath: "filing.extension_available", text: "종합소득세 신고 기한 연장 가능 여부는 확인이 필요합니다." },
]);

// ===========================================================================
// 13. 전입신고 기한
// ===========================================================================
const e13: Entity = { id: "kr-government-movein-001", type: "government", canonical_name: "전입신고", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b13 = bundle(e13, "doc-kr-government-movein-deadline-ko", "move-in-report-deadline", "전입신고 기한 및 과태료", "government", "deadline", [
  { id: "claim-movein-deadline-days", fieldPath: "report.deadline_days", text: "전입신고 기한(이사 후 며칠 이내)은 확인이 필요합니다." },
  { id: "claim-movein-fine", fieldPath: "report.late_fine", text: "전입신고 미이행 시 과태료는 확인이 필요합니다." },
  { id: "claim-movein-online", fieldPath: "report.online_available", text: "전입신고 온라인 처리 가능 여부는 확인이 필요합니다." },
]);

// ===========================================================================
// 14. 아파트 층간소음 기준
// ===========================================================================
const e14: Entity = { id: "kr-housing-noise-001", type: "housing", canonical_name: "층간소음", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b14 = bundle(e14, "doc-kr-housing-noise-standard-ko", "apartment-noise-standard", "아파트 층간소음 기준 데시벨", "housing", "standard", [
  { id: "claim-noise-daytime-db", fieldPath: "noise.daytime_limit_db", text: "주간(06~22시) 층간소음 기준(dB)은 확인이 필요합니다." },
  { id: "claim-noise-nighttime-db", fieldPath: "noise.nighttime_limit_db", text: "야간(22~06시) 층간소음 기준(dB)은 확인이 필요합니다." },
  { id: "claim-noise-complaint-channel", fieldPath: "noise.complaint_channel", text: "층간소음 신고 접수처(이웃사이센터 등)는 확인이 필요합니다." },
]);

// ===========================================================================
// 15. 분리수거 요일별 배출 기준 (서울)
// ===========================================================================
const e15: Entity = { id: "kr-environment-recycling-seoul-001", type: "environment", canonical_name: "서울시 분리수거", country: "KR", region: "서울특별시", city: null, created_at: null, updated_at: null };
const b15 = bundle(e15, "doc-kr-environment-recycling-seoul-ko", "seoul-recycling-schedule", "서울시 분리수거 요일별 배출 기준", "environment", "schedule", [
  { id: "claim-recycling-days", fieldPath: "schedule.collection_days", text: "서울시 분리수거 배출 요일은 확인이 필요합니다." },
  { id: "claim-recycling-time", fieldPath: "schedule.collection_time", text: "분리수거 배출 시간(일몰 후~자정 등)은 확인이 필요합니다." },
  { id: "claim-recycling-fine", fieldPath: "schedule.violation_fine", text: "분리수거 위반 시 과태료는 확인이 필요합니다." },
]);

// ===========================================================================
// 16. 신용카드 해외 결제 수수료
// ===========================================================================
const e16: Entity = { id: "kr-finance-card-overseas-001", type: "finance", canonical_name: "신용카드 해외결제", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b16 = bundle(e16, "doc-kr-finance-card-overseas-fee-ko", "credit-card-overseas-fee", "신용카드 해외 결제 수수료 비교", "finance", "fee-schedule", [
  { id: "claim-card-overseas-fee-rate", fieldPath: "fee.overseas_rate", text: "신용카드 해외 결제 수수료율은 확인이 필요합니다." },
  { id: "claim-card-overseas-brand-fee", fieldPath: "fee.brand_fee", text: "해외 브랜드(VISA/Mastercard) 수수료는 확인이 필요합니다." },
  { id: "claim-card-dcc-fee", fieldPath: "fee.dcc_surcharge", text: "DCC(자국 통화 결제) 추가 수수료는 확인이 필요합니다." },
]);

// ===========================================================================
// 17. 전세 보증금 반환 기한
// ===========================================================================
const e17: Entity = { id: "kr-housing-jeonse-return-001", type: "housing", canonical_name: "전세 보증금", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b17 = bundle(e17, "doc-kr-housing-jeonse-return-ko", "jeonse-deposit-return-deadline", "전세 보증금 반환 기한", "housing", "policy", [
  { id: "claim-jeonse-return-deadline", fieldPath: "deposit.return_deadline", text: "전세 보증금 반환 기한(계약 만료 후)은 확인이 필요합니다." },
  { id: "claim-jeonse-hug-guarantee", fieldPath: "deposit.hug_guarantee", text: "전세보증금 반환보증(HUG) 가입 조건은 확인이 필요합니다." },
  { id: "claim-jeonse-legal-action", fieldPath: "deposit.legal_action_period", text: "보증금 미반환 시 법적 조치 가능 시점은 확인이 필요합니다." },
]);

// ===========================================================================
// 18. 수능 접수 기간
// ===========================================================================
const e18: Entity = { id: "kr-education-csat-001", type: "education", canonical_name: "대학수학능력시험", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b18 = bundle(e18, "doc-kr-education-csat-registration-ko", "csat-registration-period", "수능 접수 기간 및 비용", "education", "schedule", [
  { id: "claim-csat-registration-period", fieldPath: "registration.period", text: "수능 접수 기간은 확인이 필요합니다." },
  { id: "claim-csat-fee", fieldPath: "registration.fee", text: "수능 응시료는 확인이 필요합니다." },
  { id: "claim-csat-exam-date", fieldPath: "registration.exam_date", text: "수능 시험일은 확인이 필요합니다." },
]);

// ===========================================================================
// 19. 대학교 등록금 납부 기한
// ===========================================================================
const e19: Entity = { id: "kr-education-tuition-001", type: "education", canonical_name: "대학교 등록금", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b19 = bundle(e19, "doc-kr-education-tuition-deadline-ko", "university-tuition-deadline", "대학교 등록금 납부 기한", "education", "deadline", [
  { id: "claim-tuition-deadline", fieldPath: "tuition.payment_deadline", text: "대학교 등록금 납부 마감일은 확인이 필요합니다." },
  { id: "claim-tuition-installment", fieldPath: "tuition.installment_available", text: "등록금 분납 가능 여부는 확인이 필요합니다." },
  { id: "claim-tuition-refund-policy", fieldPath: "tuition.refund_policy", text: "등록금 환불 기준(휴학/자퇴 시)은 확인이 필요합니다." },
]);

// ===========================================================================
// 20. KT 인터넷 해지 위약금
// ===========================================================================
const e20: Entity = { id: "kr-telecom-kt-internet-001", type: "telecom", canonical_name: "KT 인터넷", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b20 = bundle(e20, "doc-kr-telecom-kt-internet-cancel-ko", "kt-internet-cancellation-fee", "KT 인터넷 해지 위약금", "telecom", "cancellation-policy", [
  { id: "claim-kt-cancel-fee-formula", fieldPath: "cancellation.fee_formula", text: "KT 인터넷 해지 위약금 산정 방식은 확인이 필요합니다." },
  { id: "claim-kt-contract-period", fieldPath: "cancellation.contract_period_months", text: "KT 인터넷 약정 기간(개월)은 확인이 필요합니다." },
  { id: "claim-kt-free-cancel-period", fieldPath: "cancellation.free_cancel_period", text: "KT 인터넷 무위약금 해지 가능 기간은 확인이 필요합니다." },
]);

// ===========================================================================
// 21. 알뜰폰 번호이동 소요일
// ===========================================================================
const e21: Entity = { id: "kr-telecom-mvno-porting-001", type: "telecom", canonical_name: "알뜰폰 번호이동", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b21 = bundle(e21, "doc-kr-telecom-mvno-porting-ko", "mvno-number-porting-days", "알뜰폰 번호이동 소요일수", "telecom", "process", [
  { id: "claim-mvno-porting-days", fieldPath: "porting.business_days", text: "알뜰폰 번호이동 처리 소요일(영업일)은 확인이 필요합니다." },
  { id: "claim-mvno-porting-fee", fieldPath: "porting.fee", text: "알뜰폰 번호이동 수수료는 확인이 필요합니다." },
  { id: "claim-mvno-porting-documents", fieldPath: "porting.required_documents", text: "알뜰폰 번호이동 시 필요 서류는 확인이 필요합니다." },
]);

// ===========================================================================
// 22. 전월세 신고 기준
// ===========================================================================
const e22: Entity = { id: "kr-housing-rental-report-001", type: "housing", canonical_name: "전월세 신고", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b22 = bundle(e22, "doc-kr-housing-rental-report-ko", "rental-report-requirement", "전월세 신고 기준 및 의무", "housing", "regulation", [
  { id: "claim-rental-report-threshold", fieldPath: "report.deposit_threshold", text: "전월세 신고 의무 대상 보증금 기준은 확인이 필요합니다." },
  { id: "claim-rental-report-deadline", fieldPath: "report.deadline_days", text: "전월세 신고 기한(계약 후 며칠)은 확인이 필요합니다." },
  { id: "claim-rental-report-penalty", fieldPath: "report.non_compliance_penalty", text: "전월세 신고 미이행 시 과태료는 확인이 필요합니다." },
]);

// ===========================================================================
// 23. 부동산 중개 수수료율
// ===========================================================================
const e23: Entity = { id: "kr-housing-brokerage-fee-001", type: "housing", canonical_name: "부동산 중개", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b23 = bundle(e23, "doc-kr-housing-brokerage-fee-ko", "real-estate-brokerage-fee", "부동산 중개 수수료율", "housing", "fee-schedule", [
  { id: "claim-brokerage-rate-sale", fieldPath: "fee.sale_rate", text: "매매 중개 수수료 상한율은 확인이 필요합니다." },
  { id: "claim-brokerage-rate-rental", fieldPath: "fee.rental_rate", text: "전세/월세 중개 수수료 상한율은 확인이 필요합니다." },
  { id: "claim-brokerage-vat", fieldPath: "fee.vat_included", text: "중개 수수료 부가세 포함 여부는 확인이 필요합니다." },
]);

// ===========================================================================
// 24. 네이버페이 환불 소요일
// ===========================================================================
const e24: Entity = { id: "kr-ecommerce-naverpay-001", type: "ecommerce", canonical_name: "네이버페이", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b24 = bundle(e24, "doc-kr-ecommerce-naverpay-refund-ko", "naverpay-refund-days", "네이버페이 환불 소요일", "ecommerce", "refund-policy", [
  { id: "claim-naverpay-refund-card-days", fieldPath: "refund.card_days", text: "네이버페이 카드 결제 환불 소요일은 확인이 필요합니다." },
  { id: "claim-naverpay-refund-bank-days", fieldPath: "refund.bank_transfer_days", text: "네이버페이 계좌이체 환불 소요일은 확인이 필요합니다." },
  { id: "claim-naverpay-refund-point", fieldPath: "refund.point_refund", text: "네이버페이 포인트 결제 환불 방식은 확인이 필요합니다." },
]);

// ===========================================================================
// 25. 11번가 반품 기한
// ===========================================================================
const e25: Entity = { id: "kr-ecommerce-11st-001", type: "ecommerce", canonical_name: "11번가", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b25 = bundle(e25, "doc-kr-ecommerce-11st-return-ko", "11st-return-deadline", "11번가 반품 기한 및 조건", "ecommerce", "return-policy", [
  { id: "claim-11st-return-deadline", fieldPath: "return.deadline_days", text: "11번가 반품 신청 기한(수령 후 며칠)은 확인이 필요합니다." },
  { id: "claim-11st-return-shipping-fee", fieldPath: "return.shipping_fee", text: "11번가 반품 배송비 부담 기준은 확인이 필요합니다." },
  { id: "claim-11st-return-refund-days", fieldPath: "return.refund_processing_days", text: "11번가 반품 후 환불 처리 소요일은 확인이 필요합니다." },
]);

// ===========================================================================
// 26. 국민연금 납부액 기준
// ===========================================================================
const e26: Entity = { id: "kr-pension-nps-001", type: "pension", canonical_name: "국민연금", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b26 = bundle(e26, "doc-kr-pension-nps-contribution-ko", "nps-contribution-rate", "국민연금 납부액 및 요율", "pension", "policy", [
  { id: "claim-nps-rate", fieldPath: "contribution.rate_percent", text: "국민연금 보험료율(%)은 확인이 필요합니다." },
  { id: "claim-nps-income-cap", fieldPath: "contribution.income_cap", text: "국민연금 기준소득월액 상한은 확인이 필요합니다." },
  { id: "claim-nps-min-contribution", fieldPath: "contribution.minimum_amount", text: "국민연금 최소 납부액은 확인이 필요합니다." },
]);

// ===========================================================================
// 27. 자동차세 납부 기한
// ===========================================================================
const e27: Entity = { id: "kr-tax-vehicle-001", type: "tax", canonical_name: "자동차세", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b27 = bundle(e27, "doc-kr-tax-vehicle-deadline-ko", "vehicle-tax-deadline", "자동차세 납부 기한 및 할인", "tax", "deadline", [
  { id: "claim-vehicle-tax-period-1", fieldPath: "tax.first_half_deadline", text: "자동차세 1기분(상반기) 납부 기한은 확인이 필요합니다." },
  { id: "claim-vehicle-tax-period-2", fieldPath: "tax.second_half_deadline", text: "자동차세 2기분(하반기) 납부 기한은 확인이 필요합니다." },
  { id: "claim-vehicle-tax-prepay-discount", fieldPath: "tax.annual_prepay_discount", text: "자동차세 연납 할인율은 확인이 필요합니다." },
]);

// ===========================================================================
// 28. 택시 심야 할증 기준
// ===========================================================================
const e28: Entity = { id: "kr-transit-taxi-surcharge-001", type: "transit", canonical_name: "택시 심야할증", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b28 = bundle(e28, "doc-kr-transit-taxi-night-surcharge-ko", "taxi-night-surcharge", "택시 심야 할증 기준 (서울)", "transit", "fare-policy", [
  { id: "claim-taxi-night-start-time", fieldPath: "surcharge.start_time", text: "택시 심야 할증 적용 시작 시간은 확인이 필요합니다." },
  { id: "claim-taxi-night-rate", fieldPath: "surcharge.rate_percent", text: "택시 심야 할증 요금 인상률(%)은 확인이 필요합니다." },
  { id: "claim-taxi-base-fare", fieldPath: "surcharge.base_fare", text: "서울 택시 기본요금은 확인이 필요합니다." },
]);

// ===========================================================================
// 29. 건강검진 대상자 기준
// ===========================================================================
const e29: Entity = { id: "kr-medical-checkup-001", type: "medical", canonical_name: "국가건강검진", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b29 = bundle(e29, "doc-kr-medical-checkup-eligibility-ko", "health-checkup-eligibility", "국가건강검진 대상자 기준", "medical", "eligibility", [
  { id: "claim-checkup-age-cycle", fieldPath: "eligibility.age_cycle", text: "국가건강검진 대상 연령 주기(짝수/홀수년)는 확인이 필요합니다." },
  { id: "claim-checkup-cost", fieldPath: "eligibility.cost", text: "국가건강검진 본인 부담 비용은 확인이 필요합니다." },
  { id: "claim-checkup-items", fieldPath: "eligibility.exam_items", text: "국가건강검진 기본 검사 항목은 확인이 필요합니다." },
]);

// ===========================================================================
// 30. 주민등록증 재발급 소요일
// ===========================================================================
const e30: Entity = { id: "kr-government-id-reissue-001", type: "government", canonical_name: "주민등록증 재발급", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b30 = bundle(e30, "doc-kr-government-id-reissue-ko", "resident-id-reissue", "주민등록증 재발급 소요일 및 비용", "government", "process", [
  { id: "claim-id-reissue-days", fieldPath: "reissue.processing_days", text: "주민등록증 재발급 소요일은 확인이 필요합니다." },
  { id: "claim-id-reissue-fee", fieldPath: "reissue.fee", text: "주민등록증 재발급 수수료는 확인이 필요합니다." },
  { id: "claim-id-reissue-documents", fieldPath: "reissue.required_documents", text: "주민등록증 재발급 시 필요 서류는 확인이 필요합니다." },
]);

// ===========================================================================
// 31. 무인민원발급기 이용 시간
// ===========================================================================
const e31: Entity = { id: "kr-government-kiosk-001", type: "government", canonical_name: "무인민원발급기", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b31 = bundle(e31, "doc-kr-government-kiosk-hours-ko", "unmanned-kiosk-hours", "무인민원발급기 이용 시간 및 발급 서류", "government", "schedule", [
  { id: "claim-kiosk-operating-hours", fieldPath: "kiosk.operating_hours", text: "무인민원발급기 운영 시간은 확인이 필요합니다." },
  { id: "claim-kiosk-available-documents", fieldPath: "kiosk.available_documents", text: "무인민원발급기에서 발급 가능한 서류 목록은 확인이 필요합니다." },
  { id: "claim-kiosk-fee", fieldPath: "kiosk.issuance_fee", text: "무인민원발급기 서류 발급 수수료는 확인이 필요합니다." },
]);

// ===========================================================================
// 32. 소액결제 한도
// ===========================================================================
const e32: Entity = { id: "kr-finance-micropayment-001", type: "finance", canonical_name: "휴대폰 소액결제", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b32 = bundle(e32, "doc-kr-finance-micropayment-limit-ko", "mobile-micropayment-limit", "휴대폰 소액결제 월 한도", "finance", "policy", [
  { id: "claim-micropay-monthly-limit", fieldPath: "limit.monthly_max", text: "휴대폰 소액결제 월 최대 한도는 확인이 필요합니다." },
  { id: "claim-micropay-age-limit", fieldPath: "limit.minor_restriction", text: "미성년자 소액결제 한도 제한은 확인이 필요합니다." },
  { id: "claim-micropay-block-method", fieldPath: "limit.how_to_block", text: "소액결제 차단 방법은 확인이 필요합니다." },
]);

// ===========================================================================
// 33. 최저시급
// ===========================================================================
const e33: Entity = { id: "kr-labor-minimum-wage-001", type: "labor", canonical_name: "최저임금위원회", country: "KR", region: null, city: null, created_at: null, updated_at: null };
const b33 = bundle(e33, "doc-kr-labor-minimum-wage-ko", "minimum-wage-hourly", "최저시급 (2025년 기준)", "labor", "wage", [
  { id: "claim-minimum-wage-hourly", fieldPath: "wage.hourly_rate", text: "2025년 최저시급은 확인이 필요합니다." },
  { id: "claim-minimum-wage-monthly", fieldPath: "wage.monthly_estimate", text: "최저시급 기준 월 환산액(209시간)은 확인이 필요합니다." },
  { id: "claim-minimum-wage-effective-date", fieldPath: "wage.effective_date", text: "2025년 최저시급 적용 시작일은 확인이 필요합니다." },
]);

// ===========================================================================
// Exports
// ===========================================================================

// Backward-compatible single-seed exports
export const seedEntity = laluceEntity;
export const seedDocument = b01.document;
export const seedClaims = b01.claims;
export const seedListing = b01.listing;
export const seedRegistryBundle = b01;

// All bundles
export const allRegistryBundles: RegistryDocumentBundle[] = [
  b01, b02, b03, b04, b05, b06, b07,
  b08, b09, b10, b11, b12, b13, b14,
  b15, b16, b17, b18, b19, b20, b21,
  b22, b23, b24, b25, b26, b27, b28,
  b29, b30, b31, b32, b33,
];
