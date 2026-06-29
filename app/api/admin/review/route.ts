import { logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { NextResponse } from "next/server";
import { documentPageUrl } from "../../../../lib/urls";

type SupabaseAdminClient = NonNullable<ReturnType<typeof supabaseAdmin>>;

type OptionalCount = number | null;

const HIGH_RISK_CATEGORY_KEYS = [
  "finance",
  "banking",
  "insurance",
  "healthcare",
  "medical",
  "medicine",
  "legal",
  "law",
  "realtime",
];

async function countRows(
  sb: SupabaseAdminClient,
  table: string,
  filters: Record<string, string> = {},
): Promise<number> {
  let query = sb.from(table).select("id", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function optionalCountRows(
  sb: SupabaseAdminClient,
  table: string,
  filters: Record<string, string> = {},
): Promise<OptionalCount> {
  try {
    return await countRows(sb, table, filters);
  } catch (error) {
    console.warn(`[admin-dashboard] optional count skipped for ${table}`, error instanceof Error ? error.message : error);
    return null;
  }
}

async function countStaleVerifiedClaims(sb: SupabaseAdminClient): Promise<number> {
  const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await sb
    .from("claims")
    .select("id", { count: "exact", head: true })
    .eq("status", "verified")
    .or(`last_verified_at.is.null,last_verified_at.lt.${cutoff}`);
  if (error) throw error;
  return count ?? 0;
}

async function countApiAbuseWarnings(sb: SupabaseAdminClient): Promise<OptionalCount> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const { count, error } = await sb
      .from("api_usage_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .gte("status_code", 429);
    if (error) throw error;
    return count ?? 0;
  } catch (error) {
    console.warn("[admin-dashboard] api abuse count skipped", error instanceof Error ? error.message : error);
    return null;
  }
}

async function getRecentAdminActions(sb: SupabaseAdminClient) {
  try {
    const { data, error } = await sb
      .from("admin_audit_events")
      .select("id, action, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    console.warn("[admin-dashboard] recent admin actions skipped", error instanceof Error ? error.message : error);
    return [];
  }
}

function sumOptional(...values: OptionalCount[]): OptionalCount {
  if (values.every((value) => value == null)) return null;
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function publicDocumentLink(doc: { slug?: string | null; lang?: string | null }) {
  if (!doc.slug) return null;
  return documentPageUrl(doc.slug, doc.lang ?? DEFAULT_LOCALE);
}

function verifyClaimLink(slug?: string | null) {
  return slug ? `/admin/verify-claim?slug=${encodeURIComponent(slug)}` : "/admin/verify-claim";
}

function isHighRiskCategory(category?: string | null, riskTier?: string | null) {
  const normalized = String(category ?? "").toLowerCase();
  return riskTier === "high" || riskTier === "forbidden" || HIGH_RISK_CATEGORY_KEYS.some((key) => normalized.includes(key));
}

export async function GET(request: Request) {
  const adminError = requireAdmin(request, "admin.review.read");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  try {
    const [
      pendingCommunityPosts,
      candidatesNew,
      candidatesApproved,
      documentsPublished,
      claimSources,
      claimsNeedsReview,
      claimsVerified,
      documentsVerified,
      staleClaims,
      newHallucinationReports,
      sourceCheckFailures,
      pendingBusinessProfiles,
      pendingBusinessCorrections,
      apiAbuseWarnings,
      recentAdminActions,
    ] = await Promise.all([
      countRows(sb, "community_posts", { status: "pending" }),
      countRows(sb, "topic_candidates", { status: "new" }),
      countRows(sb, "topic_candidates", { status: "approved" }),
      countRows(sb, "documents", { status: "published" }),
      countRows(sb, "claim_sources"),
      countRows(sb, "claims", { status: "needs_review" }),
      countRows(sb, "claims", { status: "verified" }),
      countRows(sb, "documents", { status: "verified" }),
      countStaleVerifiedClaims(sb),
      optionalCountRows(sb, "hallucination_reports", { status: "new" }),
      optionalCountRows(sb, "claim_sources", { source_type: "unknown" }),
      optionalCountRows(sb, "verified_business_profiles", { status: "pending" }),
      optionalCountRows(sb, "business_corrections", { status: "new" }),
      countApiAbuseWarnings(sb),
      getRecentAdminActions(sb),
    ]);

    const { data: communityPosts, error: communityPostsError } = await sb
      .from("community_posts")
      .select("id, author_type, author_name, content, status, document_id, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10);
    if (communityPostsError) throw communityPostsError;

    const { data: priorityClaims, error: claimsError } = await sb
      .from("claims")
      .select("id, document_id, entity_id, field_path, claim_text, claim_value, confidence, status, updated_at, documents(slug, lang, title, status, category)")
      .eq("status", "needs_review")
      .order("updated_at", { ascending: true })
      .limit(10);
    if (claimsError) throw claimsError;

    const { data: newCandidates, error: newCandidatesError } = await sb
      .from("topic_candidates")
      .select("id, title, slug, lang, category, risk_tier, status, created_at")
      .eq("status", "new")
      .order("created_at", { ascending: true })
      .limit(10);
    if (newCandidatesError) throw newCandidatesError;

    const { data: approvedCandidates, error: candidatesError } = await sb
      .from("topic_candidates")
      .select("id, title, slug, lang, category, risk_tier, status, created_at, reviewed_at")
      .eq("status", "approved")
      .order("reviewed_at", { ascending: true, nullsFirst: false })
      .limit(10);
    if (candidatesError) throw candidatesError;

    const { data: promotedCandidates, error: promotedError } = await sb
      .from("topic_candidates")
      .select("id, title, slug, lang, category, risk_tier, status, promoted_at")
      .eq("status", "promoted")
      .order("promoted_at", { ascending: false, nullsFirst: false })
      .limit(10);
    if (promotedError) throw promotedError;

    const { data: verifiedDocuments, error: docsError } = await sb
      .from("documents")
      .select("id, title, slug, lang, status, category, last_verified_at")
      .eq("status", "verified")
      .order("last_verified_at", { ascending: false, nullsFirst: false })
      .limit(10);
    if (docsError) throw docsError;

    const { data: highRiskCandidates, error: highRiskCandidatesError } = await sb
      .from("topic_candidates")
      .select("id, title, slug, lang, category, risk_tier, status, created_at")
      .in("status", ["new", "reviewing", "approved"])
      .or(`risk_tier.in.(high,forbidden),${HIGH_RISK_CATEGORY_KEYS.map((key) => `category.ilike.%${key}%`).join(",")}`)
      .order("created_at", { ascending: true })
      .limit(10);
    if (highRiskCandidatesError) throw highRiskCandidatesError;

    const highRiskDocuments = (priorityClaims ?? [])
      .map((claim) => {
        const doc = Array.isArray(claim.documents) ? claim.documents[0] : claim.documents;
        return doc && isHighRiskCategory(doc.category) ? { ...doc, claim_id: claim.id, field_path: claim.field_path } : null;
      })
      .filter(Boolean);

    // Citation pickup: which documents AI/users actually engage with.
    const { data: statsRows, error: statsError } = await sb
      .from("document_stats")
      .select("document_id, view_count, ai_citation_count, human_view_count, bot_view_count, ai_crawler_view_count, api_cite_count, citation_copy_count, report_submission_count")
      .order("ai_citation_count", { ascending: false })
      .limit(200);
    if (statsError) throw statsError;
    const stats = statsRows ?? [];
    const totalViews = stats.reduce((sum, r) => sum + Number(r.view_count ?? 0), 0);
    const totalCitations = stats.reduce((sum, r) => sum + Number(r.ai_citation_count ?? 0), 0);
    const totalHumanViews = stats.reduce((sum, r) => sum + Number(r.human_view_count ?? 0), 0);
    const totalBotViews = stats.reduce((sum, r) => sum + Number(r.bot_view_count ?? 0), 0);
    const totalAiCrawlerViews = stats.reduce((sum, r) => sum + Number(r.ai_crawler_view_count ?? 0), 0);
    const totalApiCiteCalls = stats.reduce((sum, r) => sum + Number(r.api_cite_count ?? 0), 0);
    const totalCitationCopyClicks = stats.reduce((sum, r) => sum + Number(r.citation_copy_count ?? 0), 0);
    const totalReportSubmissions = stats.reduce((sum, r) => sum + Number(r.report_submission_count ?? 0), 0);
    const topStats = stats
      .filter((r) =>
        Number(r.view_count ?? 0) +
        Number(r.ai_citation_count ?? 0) +
        Number(r.api_cite_count ?? 0) +
        Number(r.citation_copy_count ?? 0) +
        Number(r.report_submission_count ?? 0) > 0
      )
      .sort((a, b) =>
        (Number(b.ai_citation_count ?? 0) + Number(b.view_count ?? 0) + Number(b.report_submission_count ?? 0)) -
        (Number(a.ai_citation_count ?? 0) + Number(a.view_count ?? 0) + Number(a.report_submission_count ?? 0))
      )
      .slice(0, 10);
    const topIds = topStats.map((r) => r.document_id);
    const titleById = new Map<string, { title?: string | null; slug?: string | null; lang?: string | null }>();
    if (topIds.length > 0) {
      const { data: topDocs, error: topDocsError } = await sb
        .from("documents")
        .select("id, title, slug, lang")
        .in("id", topIds);
      if (topDocsError) throw topDocsError;
      for (const d of topDocs ?? []) titleById.set(d.id, d);
    }
    const topCited = topStats.map((r) => {
      const doc = titleById.get(r.document_id);
      return {
        document_id: r.document_id,
        title: doc?.title ?? r.document_id,
        view_count: Number(r.view_count ?? 0),
        ai_citation_count: Number(r.ai_citation_count ?? 0),
        human_view_count: Number(r.human_view_count ?? 0),
        bot_view_count: Number(r.bot_view_count ?? 0),
        ai_crawler_view_count: Number(r.ai_crawler_view_count ?? 0),
        api_cite_count: Number(r.api_cite_count ?? 0),
        citation_copy_count: Number(r.citation_copy_count ?? 0),
        report_submission_count: Number(r.report_submission_count ?? 0),
        public_url: doc ? publicDocumentLink(doc) : null,
      };
    });

    const firstPriorityClaim = priorityClaims?.[0];
    const firstPriorityDoc = firstPriorityClaim
      ? (Array.isArray(firstPriorityClaim.documents) ? firstPriorityClaim.documents[0] : firstPriorityClaim.documents)
      : null;

    const priorityOrdering = [
      { rank: 1, key: "pending_community_posts", label: "Pending community posts", count: pendingCommunityPosts, href: "/admin/posts?status=pending", reason: "공개 제출물은 스팸/오류 노출을 막기 위해 먼저 승인 또는 숨김 처리합니다." },
      { rank: 2, key: "high_risk", label: "High-risk finance/healthcare/legal/realtime", count: (highRiskCandidates?.length ?? 0) + highRiskDocuments.length, href: "/admin/candidates?status=new", reason: "금융·의료·법률·실시간성 항목은 잘못 인용될 때 피해가 커서 우선 검토합니다." },
      { rank: 3, key: "needs_review_claims", label: "Needs_review claims", count: claimsNeedsReview, href: verifyClaimLink(firstPriorityDoc?.slug), reason: "claim source를 추가하고 verified로 승격해야 AI 인용 가능성이 생깁니다." },
      { rank: 4, key: "approved_candidates", label: "Approved topic candidates", count: candidatesApproved, href: "/admin/candidates?status=approved", reason: "이미 승인된 후보를 문서로 promoted하여 검증 큐에 올립니다." },
      { rank: 5, key: "new_candidates", label: "New topic candidates", count: candidatesNew, href: "/admin/candidates?status=new", reason: "신규 후보를 reviewing/approved/rejected로 분류합니다." },
    ];

    await logAdminAuditEvent(sb, request, "admin.review.read", {
      pending_community_posts: pendingCommunityPosts,
      candidates_new: candidatesNew,
      candidates_approved: candidatesApproved,
      claims_needs_review: claimsNeedsReview,
      claims_verified: claimsVerified,
      documents_verified: documentsVerified,
      priority_claims_count: priorityClaims?.length ?? 0,
      new_candidates_count: newCandidates?.length ?? 0,
      approved_candidates_count: approvedCandidates?.length ?? 0,
      promoted_candidates_count: promotedCandidates?.length ?? 0,
      verified_documents_count: verifiedDocuments?.length ?? 0,
      high_risk_count: (highRiskCandidates?.length ?? 0) + highRiskDocuments.length,
      top_cited_count: topCited.length,
      stale_claims: staleClaims,
      new_hallucination_reports: newHallucinationReports,
      source_check_failures: sourceCheckFailures,
      business_verification_requests: sumOptional(pendingBusinessProfiles, pendingBusinessCorrections),
      api_abuse_warnings: apiAbuseWarnings,
    });

    return NextResponse.json({
      counts: {
        pending_community_posts: pendingCommunityPosts,
        candidates_new: candidatesNew,
        candidates_approved: candidatesApproved,
        documents_published: documentsPublished,
        claim_sources: claimSources,
        claims_needs_review: claimsNeedsReview,
        claims_verified: claimsVerified,
        documents_verified: documentsVerified,
      },
      priority_ordering: priorityOrdering,
      community_posts: { pending: communityPosts ?? [] },
      priorities: {
        needs_review_claims: (priorityClaims ?? []).map((claim) => {
          const doc = Array.isArray(claim.documents) ? claim.documents[0] : claim.documents;
          return { ...claim, document_url: publicDocumentLink(doc ?? {}), verify_url: verifyClaimLink(doc?.slug) };
        }),
        new_candidates: newCandidates ?? [],
        approved_candidates: approvedCandidates ?? [],
      },
      promoted_documents: (promotedCandidates ?? []).map((candidate) => ({
        ...candidate,
        public_url: publicDocumentLink(candidate),
        verify_url: verifyClaimLink(candidate.slug),
      })),
      verified_documents: (verifiedDocuments ?? []).map((doc) => ({
        ...doc,
        public_url: publicDocumentLink(doc),
        verify_url: verifyClaimLink(doc.slug),
      })),
      high_risk: {
        categories: ["finance", "healthcare", "legal", "realtime"],
        candidates: highRiskCandidates ?? [],
        documents: highRiskDocuments,
      },
      engagement: {
        total_views: totalViews,
        total_citations: totalCitations,
        total_human_views: totalHumanViews,
        total_bot_views: totalBotViews,
        total_ai_crawler_views: totalAiCrawlerViews,
        total_api_cite_calls: totalApiCiteCalls,
        total_citation_copy_clicks: totalCitationCopyClicks,
        total_report_submissions: totalReportSubmissions,
        monetization_boundary: "Analytics may inform business products, but sponsored content and verified fact integrity remain separate.",
        top_cited: topCited,
      },
      dashboard: {
        counts: {
          pending_claim_reviews: claimsNeedsReview,
          new_topic_suggestions: candidatesNew,
          new_hallucination_reports: newHallucinationReports,
          stale_claims: staleClaims,
          source_check_failures: sourceCheckFailures,
          business_verification_requests: sumOptional(pendingBusinessProfiles, pendingBusinessCorrections),
          api_abuse_warnings: apiAbuseWarnings,
        },
        recent_admin_actions: recentAdminActions,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "admin review query failed";
    await logAdminAuditEvent(sb, request, "admin.review.read_failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
