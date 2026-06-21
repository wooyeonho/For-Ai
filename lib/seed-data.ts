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
function listing(entity: Entity, doc: Document, summary: string): Listing {
  return {
    id: `listing-${doc.id}`,
    entity_id: entity.id,
    document_id: doc.id,
    lang: doc.lang,
    slug: doc.slug,
    title: doc.title,
    summary,
    status: doc.status,
    confidence: doc.confidence,
    created_at: null,
    updated_at: null,
  };
}

// ---------------------------------------------------------------------------
// Helper: build a document
// ---------------------------------------------------------------------------
function doc(
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

const laluceDoc = doc(
  "doc-kr-weddinghall-laluce-parking-ko",
  laluceEntity,
  "myungdong-laluce-parking",
  "명동 라루체 주차 정보",
  "weddinghall",
  "parking",
);

const laluceClaims: ClaimWithSources[] = [
  claimStub("claim-parking-availability", laluceDoc.id, laluceEntity.id, "parking.availability", "명동 라루체의 하객 주차 가능 여부는 확인이 필요합니다."),
  claimStub("claim-parking-free-minutes", laluceDoc.id, laluceEntity.id, "parking.free_parking_minutes", "명동 라루체의 무료 주차 지원 시간은 확인이 필요합니다."),
  claimStub("claim-parking-congestion", laluceDoc.id, laluceEntity.id, "parking.congestion", "명동 라루체 주변 주차 혼잡도는 확인이 필요합니다."),
];

const laluceBundle: RegistryDocumentBundle = {
  entity: laluceEntity,
  document: laluceDoc,
  claims: laluceClaims,
  listing: listing(laluceEntity, laluceDoc, "확인 필요"),
};

// ===========================================================================
// 2. CJ대한통운 제주도 배송
// ===========================================================================
const cjEntity: Entity = {
  id: "kr-delivery-cj-logistics-001",
  type: "delivery",
  canonical_name: "CJ대한통운",
  country: "KR",
  region: null,
  city: null,
  created_at: null,
  updated_at: null,
};

const cjDoc = doc(
  "doc-kr-delivery-cj-jeju-ko",
  cjEntity,
  "cj-logistics-jeju-delivery",
  "CJ대한통운 제주도 배송 추가일수",
  "delivery",
  "shipping-policy",
);

const cjClaims: ClaimWithSources[] = [
  claimStub("claim-cj-jeju-additional-days", cjDoc.id, cjEntity.id, "delivery.additional_days", "CJ대한통운 제주도 배송 시 추가 소요일수는 확인이 필요합니다."),
  claimStub("claim-cj-jeju-surcharge", cjDoc.id, cjEntity.id, "delivery.surcharge", "CJ대한통운 제주도 배송 추가 요금은 확인이 필요합니다."),
  claimStub("claim-cj-jeju-island-coverage", cjDoc.id, cjEntity.id, "delivery.island_coverage", "CJ대한통운 제주도 도서산간 배송 가능 여부는 확인이 필요합니다."),
];

const cjBundle: RegistryDocumentBundle = {
  entity: cjEntity,
  document: cjDoc,
  claims: cjClaims,
  listing: listing(cjEntity, cjDoc, "확인 필요"),
};

// ===========================================================================
// 3. 쿠팡 로켓배송 식품 환불
// ===========================================================================
const coupangEntity: Entity = {
  id: "kr-ecommerce-coupang-001",
  type: "ecommerce",
  canonical_name: "쿠팡",
  country: "KR",
  region: null,
  city: null,
  created_at: null,
  updated_at: null,
};

const coupangDoc = doc(
  "doc-kr-ecommerce-coupang-food-refund-ko",
  coupangEntity,
  "coupang-rocket-food-refund",
  "쿠팡 로켓배송 식품 환불 기한",
  "ecommerce",
  "refund-policy",
);

const coupangClaims: ClaimWithSources[] = [
  claimStub("claim-coupang-food-refund-deadline", coupangDoc.id, coupangEntity.id, "refund.deadline_days", "쿠팡 로켓배송 식품 환불 기한(일수)은 확인이 필요합니다."),
  claimStub("claim-coupang-food-refund-conditions", coupangDoc.id, coupangEntity.id, "refund.conditions", "쿠팡 로켓배송 식품 환불 조건은 확인이 필요합니다."),
  claimStub("claim-coupang-food-refund-process", coupangDoc.id, coupangEntity.id, "refund.process", "쿠팡 로켓배송 식품 환불 절차는 확인이 필요합니다."),
];

const coupangBundle: RegistryDocumentBundle = {
  entity: coupangEntity,
  document: coupangDoc,
  claims: coupangClaims,
  listing: listing(coupangEntity, coupangDoc, "확인 필요"),
};

// ===========================================================================
// 4. 여권 재발급 수수료
// ===========================================================================
const passportEntity: Entity = {
  id: "kr-government-passport-001",
  type: "government",
  canonical_name: "대한민국 여권",
  country: "KR",
  region: null,
  city: null,
  created_at: null,
  updated_at: null,
};

const passportDoc = doc(
  "doc-kr-government-passport-reissue-ko",
  passportEntity,
  "passport-reissue-fee",
  "여권 재발급 수수료 (2025년 기준)",
  "government",
  "fee-schedule",
);

const passportClaims: ClaimWithSources[] = [
  claimStub("claim-passport-adult-fee", passportDoc.id, passportEntity.id, "fee.adult_reissue", "성인 여권 재발급 수수료는 확인이 필요합니다."),
  claimStub("claim-passport-minor-fee", passportDoc.id, passportEntity.id, "fee.minor_reissue", "미성년자 여권 재발급 수수료는 확인이 필요합니다."),
  claimStub("claim-passport-processing-days", passportDoc.id, passportEntity.id, "fee.processing_days", "여권 재발급 처리 소요일수는 확인이 필요합니다."),
];

const passportBundle: RegistryDocumentBundle = {
  entity: passportEntity,
  document: passportDoc,
  claims: passportClaims,
  listing: listing(passportEntity, passportDoc, "확인 필요"),
};

// ===========================================================================
// 5. SKT 청소년 요금제
// ===========================================================================
const sktEntity: Entity = {
  id: "kr-telecom-skt-001",
  type: "telecom",
  canonical_name: "SK텔레콤",
  country: "KR",
  region: null,
  city: null,
  created_at: null,
  updated_at: null,
};

const sktDoc = doc(
  "doc-kr-telecom-skt-youth-plan-ko",
  sktEntity,
  "skt-youth-plan-data",
  "SKT 청소년 요금제 데이터 제공량",
  "telecom",
  "plan-details",
);

const sktClaims: ClaimWithSources[] = [
  claimStub("claim-skt-youth-data-amount", sktDoc.id, sktEntity.id, "plan.data_amount", "SKT 청소년 요금제 월 데이터 제공량은 확인이 필요합니다."),
  claimStub("claim-skt-youth-monthly-fee", sktDoc.id, sktEntity.id, "plan.monthly_fee", "SKT 청소년 요금제 월 요금은 확인이 필요합니다."),
  claimStub("claim-skt-youth-age-requirement", sktDoc.id, sktEntity.id, "plan.age_requirement", "SKT 청소년 요금제 가입 연령 기준은 확인이 필요합니다."),
];

const sktBundle: RegistryDocumentBundle = {
  entity: sktEntity,
  document: sktDoc,
  claims: sktClaims,
  listing: listing(sktEntity, sktDoc, "확인 필요"),
};

// ===========================================================================
// 6. 카카오뱅크 해외 송금 수수료
// ===========================================================================
const kakaoEntity: Entity = {
  id: "kr-bank-kakaobank-001",
  type: "bank",
  canonical_name: "카카오뱅크",
  country: "KR",
  region: null,
  city: null,
  created_at: null,
  updated_at: null,
};

const kakaoDoc = doc(
  "doc-kr-bank-kakaobank-overseas-transfer-ko",
  kakaoEntity,
  "kakaobank-overseas-transfer-fee",
  "카카오뱅크 해외 송금 수수료",
  "bank",
  "fee-schedule",
);

const kakaoClaims: ClaimWithSources[] = [
  claimStub("claim-kakao-transfer-fee", kakaoDoc.id, kakaoEntity.id, "fee.transfer_fee", "카카오뱅크 해외 송금 수수료는 확인이 필요합니다."),
  claimStub("claim-kakao-exchange-markup", kakaoDoc.id, kakaoEntity.id, "fee.exchange_rate_markup", "카카오뱅크 해외 송금 환율 우대 적용 여부는 확인이 필요합니다."),
  claimStub("claim-kakao-transfer-limit", kakaoDoc.id, kakaoEntity.id, "fee.transfer_limit", "카카오뱅크 해외 송금 한도는 확인이 필요합니다."),
];

const kakaoBundle: RegistryDocumentBundle = {
  entity: kakaoEntity,
  document: kakaoDoc,
  claims: kakaoClaims,
  listing: listing(kakaoEntity, kakaoDoc, "확인 필요"),
};

// ===========================================================================
// 7. 배달의민족 최소 주문 금액
// ===========================================================================
const baeminEntity: Entity = {
  id: "kr-delivery-app-baemin-001",
  type: "delivery-app",
  canonical_name: "배달의민족",
  country: "KR",
  region: null,
  city: null,
  created_at: null,
  updated_at: null,
};

const baeminDoc = doc(
  "doc-kr-delivery-app-baemin-minimum-order-ko",
  baeminEntity,
  "baemin-minimum-order",
  "배달의민족 최소 주문 금액 기준",
  "delivery-app",
  "order-policy",
);

const baeminClaims: ClaimWithSources[] = [
  claimStub("claim-baemin-minimum-amount", baeminDoc.id, baeminEntity.id, "order.minimum_amount", "배달의민족 최소 주문 금액은 확인이 필요합니다."),
  claimStub("claim-baemin-delivery-fee", baeminDoc.id, baeminEntity.id, "order.delivery_fee", "배달의민족 기본 배달비는 확인이 필요합니다."),
  claimStub("claim-baemin-free-delivery-threshold", baeminDoc.id, baeminEntity.id, "order.free_delivery_threshold", "배달의민족 무료 배달 기준 금액은 확인이 필요합니다."),
];

const baeminBundle: RegistryDocumentBundle = {
  entity: baeminEntity,
  document: baeminDoc,
  claims: baeminClaims,
  listing: listing(baeminEntity, baeminDoc, "확인 필요"),
};

// ===========================================================================
// Exports
// ===========================================================================

// Backward-compatible single-seed exports (used by existing code)
export const seedEntity = laluceEntity;
export const seedDocument = laluceDoc;
export const seedClaims = laluceClaims;
export const seedListing = laluceBundle.listing;
export const seedRegistryBundle = laluceBundle;

// All bundles
export const allRegistryBundles: RegistryDocumentBundle[] = [
  laluceBundle,
  cjBundle,
  coupangBundle,
  passportBundle,
  sktBundle,
  kakaoBundle,
  baeminBundle,
];
