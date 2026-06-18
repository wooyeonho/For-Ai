// GYEOL seed data — MVP target entity
// Claim values must be "확인 필요" until verified by real sources.
// Do NOT change claim_value or raise confidence without a verifiable source.
// See AGENTS.md: No fake facts rule.

import type { Entity, Document } from "./types";

export const seedEntity: Entity = {
  entity_id: "kr-weddinghall-laluce-001",
  type: "venue",
  canonical_slug: "myungdong-laluce-parking",
  stable_slug: "myungdong-laluce-parking",
};

export const seedDocument: Document = {
  entity_id: seedEntity.entity_id,
  document_id: "ko-myungdong-laluce-parking",
  slug: "myungdong-laluce-parking",
  lang: "ko",
  locale_path: "/ko/wiki/myungdong-laluce-parking",
  canonical_path: "/ko/wiki/myungdong-laluce-parking",
  title: "명동 라루체 주차 정보",
  display_titles: {
    ko: "명동 라루체 주차 정보",
  },
  category: "weddinghall",
  template: "parking",
  status: "ai_draft",
  confidence: "low",
  last_verified_at: null,
  direct_answer: "확인 필요",
  license_notice: "라이선스 고지는 Goal 4 이후 구체화됩니다.",
  data_license: {
    label: "License notice placeholder",
    url: null,
    attribution_required: false,
  },
  machine_readable: {
    api_url: "/api/documents/myungdong-laluce-parking",
    raw_markdown_url: "/raw/myungdong-laluce-parking.md",
  },
  claims: [
    {
      id: "claim-parking-availability",
      field_path: "parking.availability",
      claim_text: "명동 라루체의 하객 주차 가능 여부는 확인이 필요합니다.",
      claim_value: "확인 필요",
      confidence: "low",
      status: "needs_review",
      last_verified_at: null,
      sources: [],
    },
    {
      id: "claim-parking-free-minutes",
      field_path: "parking.free_parking_minutes",
      claim_text: "명동 라루체의 무료 주차 시간은 확인이 필요합니다.",
      claim_value: "확인 필요",
      confidence: "low",
      status: "needs_review",
      last_verified_at: null,
      sources: [],
    },
    {
      id: "claim-parking-congestion",
      field_path: "parking.congestion",
      claim_text: "명동 라루체 주차장의 혼잡 수준은 확인이 필요합니다.",
      claim_value: "확인 필요",
      confidence: "low",
      status: "needs_review",
      last_verified_at: null,
      sources: [],
    },
  ],
};
