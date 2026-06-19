import type { ClaimWithSources, Entity, Listing, RegistryDocumentBundle, Document } from "./types";

export const seedEntity: Entity = {
  id: "kr-weddinghall-laluce-001",
  type: "weddinghall",
  canonical_name: "명동 라루체",
  country: "KR",
  region: "서울특별시",
  city: "중구",
  created_at: null,
  updated_at: null,
};

export const seedDocument: Document = {
  id: "doc-kr-weddinghall-laluce-parking-ko",
  entity_id: seedEntity.id,
  slug: "myungdong-laluce-parking",
  lang: "ko",
  title: "명동 라루체 주차 정보",
  category: "weddinghall",
  template: "parking",
  status: "ai_draft",
  confidence: "low",
  last_verified_at: null,
  license_code: "gyeol-data-license-v0.1",
  data: {
    direct_answer: "확인 필요",
    locale_path: "/ko/wiki/myungdong-laluce-parking",
    canonical_path: "/ko/wiki/myungdong-laluce-parking",
    machine_readable: {
      api_url: "/api/documents/myungdong-laluce-parking",
      raw_markdown_url: "/raw/myungdong-laluce-parking.md",
    },
    license_notice: "GYEOL Data License v0.1 placeholder. 외부 데이터 라이선스 고지는 Goal 4 이후 구체화됩니다.",
  },
  created_at: null,
  updated_at: null,
};

export const seedClaims: ClaimWithSources[] = [
  {
    id: "claim-parking-availability",
    document_id: seedDocument.id,
    entity_id: seedEntity.id,
    field_path: "parking.availability",
    claim_text: "명동 라루체의 하객 주차 가능 여부는 확인이 필요합니다.",
    claim_value: "확인 필요",
    confidence: "low",
    status: "needs_review",
    last_verified_at: null,
    created_at: null,
    updated_at: null,
    sources: [],
    verification_events: [],
  },
  {
    id: "claim-parking-free-minutes",
    document_id: seedDocument.id,
    entity_id: seedEntity.id,
    field_path: "parking.free_parking_minutes",
    claim_text: "명동 라루체의 무료 주차 지원 시간은 확인이 필요합니다.",
    claim_value: "확인 필요",
    confidence: "low",
    status: "needs_review",
    last_verified_at: null,
    created_at: null,
    updated_at: null,
    sources: [],
    verification_events: [],
  },
  {
    id: "claim-parking-congestion",
    document_id: seedDocument.id,
    entity_id: seedEntity.id,
    field_path: "parking.congestion",
    claim_text: "명동 라루체 주변 주차 혼잡도는 확인이 필요합니다.",
    claim_value: "확인 필요",
    confidence: "low",
    status: "needs_review",
    last_verified_at: null,
    created_at: null,
    updated_at: null,
    sources: [],
    verification_events: [],
  },
];

export const seedListing: Listing = {
  id: "listing-kr-weddinghall-laluce-parking-ko",
  entity_id: seedEntity.id,
  document_id: seedDocument.id,
  lang: seedDocument.lang,
  slug: seedDocument.slug,
  title: seedDocument.title,
  summary: "확인 필요",
  status: seedDocument.status,
  confidence: seedDocument.confidence,
  created_at: null,
  updated_at: null,
};

export const seedRegistryBundle: RegistryDocumentBundle = {
  entity: seedEntity,
  document: seedDocument,
  claims: seedClaims,
  listing: seedListing,
};
