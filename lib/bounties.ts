export type BountyStatus = "open" | "reviewing" | "awarded" | "closed";
export type SponsorType = "none" | "community" | "business" | "institution" | "platform" | "government" | "other";

export type ClaimBounty = {
  bounty_id: string;
  claim_id?: string;
  topic_candidate_id?: string;
  title: string;
  description: string;
  country: string;
  category: string;
  reward_points: number;
  sponsor_type: SponsorType;
  sponsor_label?: string;
  status: BountyStatus;
  created_at: string;
  expires_at?: string;
  source_candidate_examples: string[];
};

export const CLAIM_BOUNTY_POLICY = {
  sponsorVerificationIndependence:
    "A bounty sponsor can fund or request source discovery, but verified status is decided only by independent review of sources and verification events.",
  sponsoredDisclosure:
    "Sponsored bounties must show sponsor_type and sponsor_label wherever the bounty is listed or opened.",
  contributorLimit:
    "Contributors submit source candidates only; they cannot create verified claim status or verification_events directly.",
} as const;

export const SAMPLE_CLAIM_BOUNTIES: ClaimBounty[] = [
  {
    bounty_id: "source-passport-fee-2026",
    claim_id: "claim-passport-reissue-fee-current",
    title: "Find the current official passport reissue fee source",
    description:
      "Submit an official source candidate that states the latest passport reissue fee and any effective-date notes. Keep the claim Needs verification until a verifier reviews the source.",
    country: "KR",
    category: "government-fees",
    reward_points: 120,
    sponsor_type: "none",
    status: "open",
    created_at: "2026-06-29T00:00:00Z",
    expires_at: "2026-07-29T00:00:00Z",
    source_candidate_examples: ["Official ministry fee page", "Government service portal page", "Published fee notice with effective date"],
  },
  {
    bounty_id: "source-transit-fare-us-nyc",
    topic_candidate_id: "4fd31d9a-7f6e-4d21-b1a5-3f2a6a5f0c11",
    title: "Source candidates for NYC transit fare changes",
    description:
      "Collect primary or regulator-backed sources for a topic candidate about transit fare rules. Submitted evidence is reviewed before any claim is created or verified.",
    country: "US",
    category: "transport",
    reward_points: 200,
    sponsor_type: "institution",
    sponsor_label: "Transit Accuracy Fund",
    status: "reviewing",
    created_at: "2026-06-20T00:00:00Z",
    expires_at: "2026-07-20T00:00:00Z",
    source_candidate_examples: ["Agency fare page", "Board-approved tariff", "Official public notice"],
  },
  {
    bounty_id: "source-saas-plan-limits",
    claim_id: "claim-saas-plan-limit-current",
    title: "Verify current SaaS plan limit wording",
    description:
      "Find source candidates for plan-limit language. Business sponsorship must be displayed, and the sponsor cannot approve its own claim as verified.",
    country: "global",
    category: "saas-pricing",
    reward_points: 80,
    sponsor_type: "business",
    sponsor_label: "Example SaaS vendor",
    status: "open",
    created_at: "2026-06-25T00:00:00Z",
    expires_at: "2026-07-25T00:00:00Z",
    source_candidate_examples: ["Public pricing page", "Terms of service", "Official changelog"],
  },
];

export function getBountyById(id: string): ClaimBounty | undefined {
  return SAMPLE_CLAIM_BOUNTIES.find((bounty) => bounty.bounty_id === id);
}

export function isSponsoredBounty(bounty: Pick<ClaimBounty, "sponsor_type">): boolean {
  return bounty.sponsor_type !== "none";
}
