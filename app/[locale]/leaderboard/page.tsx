import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SUPPORTED_LOCALES, isValidLocale } from "../../../lib/i18n";
import { createServiceRoleClient, isServiceRoleConfigured } from "../../../lib/supabase-server";

export const revalidate = 300;

type LeaderboardParams = { locale: string };
type ContributionMetric =
  | "accepted_sources"
  | "verified_claims"
  | "stale_fixes"
  | "accepted_hallucinations"
  | "country_coverage"
  | "category_contributions";

type ContributorScore = {
  contributorHash: string;
  acceptedSources: number;
  verifiedClaims: number;
  staleFixes: number;
  acceptedHallucinations: number;
  countryCoverage: number;
  categoryContributions: number;
  rejectedOrSpam: number;
  duplicateUrlOverflow: number;
  score: number;
  countries: string[];
  categories: string[];
};

type ClaimRelation = {
  document_id?: string | null;
  documents?: {
    country?: string | null;
    category?: string | null;
  } | null;
};

type SourceRow = {
  id?: string | null;
  claim_id?: string | null;
  url?: string | null;
  citation?: string | null;
  source_check_status?: string | null;
  contributor_hash?: string | null;
  claims?: ClaimRelation | null;
};

type VerificationRow = {
  id?: string | null;
  claim_id?: string | null;
  event_type?: string | null;
  new_status?: string | null;
  previous_status?: string | null;
  previous_confidence?: string | null;
  new_confidence?: string | null;
  note?: string | null;
  contributor_hash?: string | null;
  claims?: ClaimRelation | null;
};

type HallucinationRow = {
  id?: string | null;
  status?: string | null;
  contributor_hash?: string | null;
  claims?: ClaimRelation | null;
  documents?: {
    country?: string | null;
    category?: string | null;
  } | null;
};

type SubmissionModerationRow = {
  status?: string | null;
  contributor_hash?: string | null;
};

const WEIGHTS: Record<ContributionMetric, number> = {
  accepted_sources: 5,
  verified_claims: 8,
  stale_fixes: 10,
  accepted_hallucinations: 6,
  country_coverage: 3,
  category_contributions: 2,
};

const DUPLICATE_URL_FREE_LIMIT = 2;
const REJECTED_OR_SPAM_PENALTY = 6;

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<LeaderboardParams> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return { title: "Leaderboard not found" };

  return {
    title: "Contributor leaderboard | For-Ai",
    description:
      "For-Ai contributor leaderboard design based on accepted sources, verified claim work, stale claim fixes, accepted hallucination reports, and coverage breadth — never raw submission volume.",
    alternates: {
      languages: Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, `/${l}/leaderboard`])),
    },
  };
}

export default async function LeaderboardPage({ params }: { params: Promise<LeaderboardParams> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const leaderboard = await getLeaderboard();
  const hasLiveData = isServiceRoleConfigured();

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Contributor trust leaderboard</p>
        <h1>For-Ai leaderboard</h1>
        <p style={{ maxWidth: 780 }}>
          This leaderboard rewards accepted, source-backed, claim-level work. It intentionally excludes raw submission count so spam, repeated URLs, and noisy public intake cannot outrank verified contributions.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span className="badge badge-verified">accepted sources × {WEIGHTS.accepted_sources}</span>
          <span className="badge badge-verified">verified claims × {WEIGHTS.verified_claims}</span>
          <span className="badge badge-warning">stale fixes × {WEIGHTS.stale_fixes}</span>
          <span className="badge">country coverage × {WEIGHTS.country_coverage}</span>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="leaderboard-ranking">
        <p className="eyebrow">Ranked by accepted impact, not volume</p>
        <h2 id="leaderboard-ranking">Current ranking</h2>
        {!hasLiveData ? (
          <p className="stat-note">
            Live contributor rows require the server-side Supabase service role. The public page still renders the scoring policy statically without exposing edits, reports, hallucination_reports, or raw contributor hashes.
          </p>
        ) : leaderboard.length === 0 ? (
          <p className="stat-note">No accepted contributor activity is eligible for ranking yet.</p>
        ) : (
          <ol className="registry-index">
            {leaderboard.map((entry, index) => (
              <li key={entry.contributorHash} className="registry-row">
                <div className="registry-row-main">
                  <strong className="registry-row-title">#{index + 1} {displayContributor(entry.contributorHash)}</strong>
                  <span className="registry-row-entity">
                    {entry.countries.length} countries · {entry.categories.length} categories · abuse-adjusted score {entry.score}
                  </span>
                  <span className="meta-label">
                    accepted sources {entry.acceptedSources}, verified claims {entry.verifiedClaims}, stale fixes {entry.staleFixes}, accepted hallucination reports {entry.acceptedHallucinations}
                  </span>
                </div>
                <div className="registry-row-meta">
                  <span className="badge badge-verified">{entry.score} pts</span>
                  {entry.rejectedOrSpam > 0 ? <span className="badge badge-warning">moderation penalties {entry.rejectedOrSpam}</span> : null}
                  {entry.duplicateUrlOverflow > 0 ? <span className="badge badge-warning">duplicate URL cap {entry.duplicateUrlOverflow}</span> : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="registry-panel" aria-labelledby="leaderboard-rules">
        <p className="eyebrow">Scoring design</p>
        <h2 id="leaderboard-rules">Leaderboard criteria</h2>
        <ul className="link-list">
          <li><strong>Accepted sources:</strong> claim_sources that pass review or are attached to a verified claim. Repeated identical URLs from the same contributor are capped after {DUPLICATE_URL_FREE_LIMIT} credits.</li>
          <li><strong>Verified claim contributions:</strong> contributor_hash values on verification_events that move claims to verified or record human review of a verified claim.</li>
          <li><strong>Stale claim fixes:</strong> high-value verification_events that restore stale or low-confidence facts to current verified claims.</li>
          <li><strong>Hallucination reports accepted:</strong> only moderated hallucination_reports with status accepted are counted.</li>
          <li><strong>Country coverage:</strong> unique countries touched by eligible accepted contributions.</li>
          <li><strong>Category-specific contributions:</strong> unique registry categories touched by eligible accepted contributions.</li>
        </ul>
      </section>

      <section className="registry-panel" aria-labelledby="spam-controls" style={{ background: "#fffbeb", borderInlineStart: "3px solid #f59e0b" }}>
        <p className="eyebrow">Abuse resistance</p>
        <h2 id="spam-controls">Spam prevention rules</h2>
        <ul className="link-list">
          <li>Raw submission count is never part of the score.</li>
          <li>Rejected or spam submissions are excluded and subtract {REJECTED_OR_SPAM_PENALTY} points each when visible to server-side moderation queries.</li>
          <li>Identical URL submissions by the same contributor_hash receive limited credit to prevent repeated-source farming.</li>
          <li>Abuse detection uses contributor_hash only. Raw IP addresses are not stored or displayed.</li>
          <li>Public output shows pseudonymous contributor labels, not full hashes or private submission rows.</li>
        </ul>
      </section>

      <section className="registry-panel" aria-labelledby="reward-rules">
        <h2 id="reward-rules">Reward rules</h2>
        <ul>
          <li>Source submitted: 1 point, pending review.</li>
          <li>Source accepted: 5 points after admin acceptance.</li>
          <li>Claim verified from contribution: 20 points after admin verification approval.</li>
          <li>Hallucination report accepted: 10 points after admin acceptance.</li>
        </ul>
        <p><Link href={`/${locale}/quests`}>View country quests and badge progress</Link></p>
      </section>

      <nav className="registry-panel" aria-labelledby="leaderboard-actions">
        <h2 id="leaderboard-actions">Contribute source-backed facts</h2>
        <p>Submit missing facts without logging in. They remain Needs verification until a traceable source and human approval are recorded.</p>
        <Link className="btn btn-primary" href={`/suggest-topic?lang=${encodeURIComponent(locale)}`}>Submit a missing fact</Link>
      </nav>
    </article>
  );
}

async function getLeaderboard(): Promise<ContributorScore[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];

  const [sourcesResult, eventsResult, hallucinationsResult, editsResult, reportsResult] = await Promise.all([
    sb.from("claim_sources").select("id,claim_id,url,citation,source_check_status,contributor_hash,claims(document_id,documents(country,category))").not("contributor_hash", "is", null).limit(2000),
    sb.from("verification_events").select("id,claim_id,event_type,previous_status,new_status,previous_confidence,new_confidence,note,contributor_hash,claims(document_id,documents(country,category))").not("contributor_hash", "is", null).limit(2000),
    sb.from("hallucination_reports").select("id,status,contributor_hash,claims(document_id,documents(country,category)),documents(country,category)").eq("status", "accepted").not("contributor_hash", "is", null).limit(1000),
    sb.from("edits").select("status,contributor_hash").in("status", ["rejected", "spam"]).not("contributor_hash", "is", null).limit(1000),
    sb.from("reports").select("status,contributor_hash").in("status", ["rejected", "spam"]).not("contributor_hash", "is", null).limit(1000),
  ]);

  const contributors = new Map<string, MutableContributorScore>();
  const urlCredits = new Map<string, number>();

  for (const row of rows<SourceRow>(sourcesResult.data)) {
    const hash = normalizedHash(row.contributor_hash);
    if (!hash || !isAcceptedSource(row)) continue;
    const contributor = getMutableContributor(contributors, hash);
    const urlKey = normalizedUrl(row.url ?? row.citation);
    if (urlKey) {
      const compoundKey = `${hash}:${urlKey}`;
      const count = urlCredits.get(compoundKey) ?? 0;
      urlCredits.set(compoundKey, count + 1);
      if (count >= DUPLICATE_URL_FREE_LIMIT) {
        contributor.duplicateUrlOverflow += 1;
        continue;
      }
    }
    contributor.acceptedSources += 1;
    addCoverage(contributor, row.claims?.documents);
  }

  for (const row of rows<VerificationRow>(eventsResult.data)) {
    const hash = normalizedHash(row.contributor_hash);
    if (!hash) continue;
    const contributor = getMutableContributor(contributors, hash);
    if (isVerifiedClaimEvent(row)) contributor.verifiedClaims += 1;
    if (isStaleFixEvent(row)) contributor.staleFixes += 1;
    addCoverage(contributor, row.claims?.documents);
  }

  for (const row of rows<HallucinationRow>(hallucinationsResult.data)) {
    const hash = normalizedHash(row.contributor_hash);
    if (!hash || row.status !== "accepted") continue;
    const contributor = getMutableContributor(contributors, hash);
    contributor.acceptedHallucinations += 1;
    addCoverage(contributor, row.claims?.documents ?? row.documents);
  }

  for (const row of [...rows<SubmissionModerationRow>(editsResult.data), ...rows<SubmissionModerationRow>(reportsResult.data)]) {
    const hash = normalizedHash(row.contributor_hash);
    if (!hash || (row.status !== "rejected" && row.status !== "spam")) continue;
    getMutableContributor(contributors, hash).rejectedOrSpam += 1;
  }

  return [...contributors.values()]
    .map(finalizeContributor)
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.verifiedClaims - a.verifiedClaims || b.acceptedSources - a.acceptedSources)
    .slice(0, 50);
}

type MutableContributorScore = Omit<ContributorScore, "countries" | "categories" | "countryCoverage" | "categoryContributions" | "score"> & {
  countries: Set<string>;
  categories: Set<string>;
};

function getMutableContributor(contributors: Map<string, MutableContributorScore>, hash: string): MutableContributorScore {
  const existing = contributors.get(hash);
  if (existing) return existing;
  const created: MutableContributorScore = {
    contributorHash: hash,
    acceptedSources: 0,
    verifiedClaims: 0,
    staleFixes: 0,
    acceptedHallucinations: 0,
    rejectedOrSpam: 0,
    duplicateUrlOverflow: 0,
    countries: new Set<string>(),
    categories: new Set<string>(),
  };
  contributors.set(hash, created);
  return created;
}

function finalizeContributor(entry: MutableContributorScore): ContributorScore {
  const countryCoverage = entry.countries.size;
  const categoryContributions = entry.categories.size;
  const score = Math.max(0,
    entry.acceptedSources * WEIGHTS.accepted_sources +
    entry.verifiedClaims * WEIGHTS.verified_claims +
    entry.staleFixes * WEIGHTS.stale_fixes +
    entry.acceptedHallucinations * WEIGHTS.accepted_hallucinations +
    countryCoverage * WEIGHTS.country_coverage +
    categoryContributions * WEIGHTS.category_contributions -
    entry.rejectedOrSpam * REJECTED_OR_SPAM_PENALTY,
  );

  return {
    ...entry,
    countries: [...entry.countries].sort(),
    categories: [...entry.categories].sort(),
    countryCoverage,
    categoryContributions,
    score,
  };
}

function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? data as T[] : [];
}

function normalizedHash(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function displayContributor(hash: string): string {
  return `contributor-${hash.slice(0, 8)}`;
}

function normalizedUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.trim().toLowerCase() || null;
  }
}

function isAcceptedSource(row: SourceRow): boolean {
  return row.source_check_status === "passed" || Boolean(row.claim_id);
}

function isVerifiedClaimEvent(row: VerificationRow): boolean {
  return row.new_status === "verified" || (row.event_type === "reviewed" && row.new_confidence === "high");
}

function isStaleFixEvent(row: VerificationRow): boolean {
  const note = row.note?.toLowerCase() ?? "";
  return row.event_type === "reviewed" && row.new_status === "verified" && (
    row.previous_status === "unknown" ||
    row.previous_status === "disputed" ||
    row.previous_confidence === "low" ||
    note.includes("stale") ||
    note.includes("outdated") ||
    note.includes("freshness")
  );
}

function addCoverage(contributor: MutableContributorScore, document: { country?: string | null; category?: string | null } | null | undefined) {
  const country = document?.country?.trim();
  const category = document?.category?.trim();
  if (country) contributor.countries.add(country.toUpperCase());
  if (category) contributor.categories.add(category);
}
