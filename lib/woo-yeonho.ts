import type {
  ClaimSource,
  ClaimWithSources,
  Document,
  Entity,
  Listing,
  RegistryDocumentBundle,
} from "./types";

const OBSERVED_AT = "2026-07-26";
const PROFILE_URL = "https://for-ai-e4mm.vercel.app/about/wooyeonho";
const REPOSITORY_URL = "https://github.com/wooyeonho/For-Ai";

const entity: Entity = {
  id: "kr-person-creator-woo-yeonho-001",
  type: "person_creator",
  canonical_name: "우연호 (Woo Yeonho)",
  country: "KR",
  region: null,
  city: null,
  created_at: null,
  updated_at: null,
};

const document: Document = {
  id: "doc-kr-person-creator-woo-yeonho-ko",
  entity_id: entity.id,
  slug: "woo-yeonho",
  lang: "ko",
  country: "KR",
  region: null,
  city: null,
  jurisdiction: "KR",
  canonical_slug: "woo-yeonho",
  title: "우연호 (Woo Yeonho) — For-Ai 운영자 공개 프로필",
  localized_title: {
    ko: "우연호 (Woo Yeonho) — For-Ai 운영자 공개 프로필",
    en: "Woo Yeonho — Public profile of the For-Ai operator",
  },
  category: "person_creator",
  template: "creator-profile",
  status: "needs_review",
  confidence: "low",
  risk_tier: "low",
  update_frequency: "event_based",
  disclaimer_type: "public_profile_only",
  translation_status: "source_language",
  last_verified_at: null,
  license_code: "forai-data-license-v0.1",
  data: {
    direct_answer:
      "For-Ai의 1차 출처는 우연호(Woo Yeonho)를 프로젝트의 제작자이자 운영자로 소개합니다. 이는 자기진술이며 독립적인 제3자 검증과 구분됩니다.",
    locale_path: "/ko/wiki/woo-yeonho",
    canonical_path: "/ko/wiki/woo-yeonho",
    machine_readable: {
      api_url: "/api/documents/woo-yeonho",
      raw_markdown_url: "/raw/woo-yeonho.md",
    },
    verification_boundary: {
      first_party_statement: true,
      independent_third_party_source_registered: false,
      platform_verifiable_repository: REPOSITORY_URL,
    },
    aliases: ["우연호", "Woo Yeonho", "wooyeonho"],
    license_notice: "For-Ai Data License v0.1 placeholder.",
  },
  created_at: null,
  updated_at: null,
};

function source(
  id: string,
  claimId: string,
  sourceType: ClaimSource["source_type"],
  sourceAuthority: ClaimSource["source_authority"],
  title: string,
  url: string,
  citation: string,
  notes: string,
): ClaimSource {
  return {
    id,
    claim_id: claimId,
    source_type: sourceType,
    source_authority: sourceAuthority,
    title,
    url,
    citation,
    lang: "ko",
    observed_at: OBSERVED_AT,
    source_check_status: "passed",
    source_trust_score: sourceType === "platform" ? 70 : 40,
    source_check_notes: notes,
    contributor_hash: null,
    created_at: null,
  };
}

function claim(
  id: string,
  fieldPath: string,
  claimText: string,
  claimValue: string,
  confidence: ClaimWithSources["confidence"],
  status: ClaimWithSources["status"],
  sources: ClaimSource[],
): ClaimWithSources {
  return {
    id,
    document_id: document.id,
    entity_id: entity.id,
    field_path: fieldPath,
    claim_text: claimText,
    claim_value: claimValue,
    jurisdiction: "KR",
    country: "KR",
    region: null,
    city: null,
    risk_tier: "low",
    update_frequency: "event_based",
    disclaimer_type: "public_profile_only",
    lang: "ko",
    original_claim_id: null,
    translation_status: null,
    confidence,
    status,
    last_verified_at: status === "verified" ? OBSERVED_AT : null,
    created_at: null,
    updated_at: null,
    sources,
    verification_events:
      status === "verified"
        ? [
            {
              id: `ve-${id}`,
              claim_id: id,
              event_type: "source_verified",
              previous_status: "needs_review",
              new_status: "verified",
              previous_confidence: "low",
              new_confidence: confidence,
              note:
                "Verified only within the narrow platform-visible scope described by the claim. This does not independently verify the real-world identity behind the account.",
              contributor_hash: null,
              created_at: OBSERVED_AT,
            },
          ]
        : [],
  };
}

const publicNameClaimId = "claim-woo-yeonho-public-name";
const projectRoleClaimId = "claim-woo-yeonho-for-ai-role";
const repositoryClaimId = "claim-woo-yeonho-repository-location";

const claims: ClaimWithSources[] = [
  claim(
    publicNameClaimId,
    "identity.public_name",
    "For-Ai의 공식 운영자 소개 페이지는 프로젝트 운영자의 공개 이름을 우연호(Woo Yeonho)로 명시합니다.",
    "우연호 (Woo Yeonho) — first-party statement",
    "low",
    "needs_review",
    [
      source(
        `src-${publicNameClaimId}`,
        publicNameClaimId,
        "user",
        "primary",
        "For-Ai — 우연호 운영자 공개 프로필",
        PROFILE_URL,
        "For-Ai의 운영자 공개 프로필에 표시된 이름.",
        "First-party self-reported identity statement. It records what the subject/project publicly states and is not independent third-party verification.",
      ),
    ],
  ),
  claim(
    projectRoleClaimId,
    "career.for_ai_role",
    "For-Ai의 공식 운영자 소개 페이지는 우연호를 For-Ai의 제작자이자 운영자로 소개합니다.",
    "For-Ai creator and operator — first-party statement",
    "low",
    "needs_review",
    [
      source(
        `src-${projectRoleClaimId}`,
        projectRoleClaimId,
        "user",
        "primary",
        "For-Ai — 우연호 운영자 공개 프로필",
        PROFILE_URL,
        "For-Ai 프로젝트와 우연호의 관계에 관한 공식 자기진술.",
        "First-party project statement. It must remain visibly labeled as self-reported until an independent source is registered and reviewed.",
      ),
    ],
  ),
  claim(
    repositoryClaimId,
    "platform.github_repository",
    "GitHub 플랫폼에서 For-Ai 공개 저장소는 wooyeonho 계정 아래에 표시됩니다.",
    "github.com/wooyeonho/For-Ai",
    "medium",
    "verified",
    [
      source(
        `src-${repositoryClaimId}`,
        repositoryClaimId,
        "platform",
        "platform",
        "GitHub — wooyeonho/For-Ai",
        REPOSITORY_URL,
        "GitHub에 공개된 저장소 경로와 소유 계정 표시.",
        "This verifies only the platform-visible repository path. It does not independently prove that the real-world person and GitHub account holder are the same individual.",
      ),
    ],
  ),
];

const listing: Listing = {
  id: `listing-${document.id}`,
  entity_id: entity.id,
  document_id: document.id,
  lang: document.lang,
  slug: document.slug,
  title: document.title,
  summary:
    "For-Ai 운영자에 관한 공개 프로필. 자기진술과 플랫폼에서 직접 확인 가능한 사실을 구분해 표시합니다.",
  status: document.status,
  confidence: document.confidence,
  created_at: null,
  updated_at: null,
};

export const wooYeonhoBundle: RegistryDocumentBundle = {
  entity,
  document,
  claims,
  listing,
};
