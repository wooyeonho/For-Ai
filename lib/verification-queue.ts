import seedSet from "../data/verified-seed-set.json";
import { verifiedBundles } from "./verified-claims";

const PLACEHOLDER = "확인 필요";

export interface QueueProgress {
  totalFiles: number;
  totalClaims: number;
  citationReady: number;
  readyPercent: number;
  byCountry: { country: string; files: number; ready: number }[];
  seedTopics: number;
  seedClaims: number;
}

export interface InProgressFile {
  slug: string;
  country: string;
  ready: number;
  total: number;
  remaining: string[];
}

export interface QueueClaim {
  documentSlug: string;
  country: string;
  domain: string;
  fieldPath: string;
  status: string;
  confidence: string;
  sourcePresent: boolean;
  stale: boolean;
}

export interface BacklogTopic {
  slug: string;
  title: string;
  category: string;
  riskTier: string;
  whyPeopleAskAi: string | null;
  claimCount: number;
  requiredSourceTypes: string[];
}

interface SeedClaim {
  field_path?: string;
  question?: string;
  placeholder_value?: string;
  required_source_type?: string;
}
interface SeedTopic {
  title?: string;
  slug: string;
  category?: string;
  risk_tier?: string;
  why_people_ask_ai?: string;
  claims?: SeedClaim[];
}

const seed = seedSet as unknown as SeedTopic[];

function isReady(claim: { status: string; claim_value: string }): boolean {
  return claim.status === "verified" && claim.claim_value !== PLACEHOLDER;
}

export function getVerificationQueue(): {
  progress: QueueProgress;
  inProgress: InProgressFile[];
  backlog: BacklogTopic[];
  claims: QueueClaim[];
} {
  const byCountryMap = new Map<string, { files: number; ready: number }>();
  const inProgress: InProgressFile[] = [];
  let totalClaims = 0;
  let citationReady = 0;
  const claims: QueueClaim[] = [];

  for (const bundle of verifiedBundles) {
    const country = bundle.entity.country ?? "?";
    const entry = byCountryMap.get(country) ?? { files: 0, ready: 0 };
    entry.files += 1;

    const remaining: string[] = [];
    let ready = 0;
    for (const claim of bundle.claims) {
      totalClaims += 1;
      const sourcePresent = Array.isArray(claim.sources) && claim.sources.length > 0;
      const lastVerifiedAt = claim.last_verified_at;
      const stale = Boolean(lastVerifiedAt) && Date.now() - new Date(lastVerifiedAt ?? "").getTime() > 180 * 24 * 60 * 60 * 1000;
      claims.push({
        documentSlug: bundle.document.slug,
        country,
        domain: bundle.document.category,
        fieldPath: claim.field_path,
        status: claim.status,
        confidence: claim.confidence,
        sourcePresent,
        stale,
      });
      if (isReady(claim)) {
        ready += 1;
        citationReady += 1;
        entry.ready += 1;
      } else {
        remaining.push(claim.field_path);
      }
    }
    byCountryMap.set(country, entry);

    if (remaining.length > 0) {
      inProgress.push({
        slug: bundle.document.slug,
        country,
        ready,
        total: bundle.claims.length,
        remaining,
      });
    }
  }

  const startedSlugs = new Set(verifiedBundles.map((b) => b.document.slug));
  const seedClaims = seed.reduce((sum, t) => sum + (t.claims?.length ?? 0), 0);

  const backlog: BacklogTopic[] = seed
    .filter((t) => !startedSlugs.has(t.slug))
    .map((t) => ({
      slug: t.slug,
      title: t.title ?? t.slug,
      category: t.category ?? "",
      riskTier: t.risk_tier ?? "",
      whyPeopleAskAi: t.why_people_ask_ai ?? null,
      claimCount: t.claims?.length ?? 0,
      requiredSourceTypes: [
        ...new Set((t.claims ?? []).map((c) => c.required_source_type).filter((s): s is string => Boolean(s))),
      ],
    }));

  const progress: QueueProgress = {
    totalFiles: verifiedBundles.length,
    totalClaims,
    citationReady,
    readyPercent: totalClaims ? Math.round((citationReady / totalClaims) * 100) : 0,
    byCountry: [...byCountryMap.entries()]
      .map(([country, v]) => ({ country, ...v }))
      .sort((a, b) => a.country.localeCompare(b.country)),
    seedTopics: seed.length,
    seedClaims,
  };

  return { progress, inProgress, backlog, claims };
}
