import { NextResponse } from "next/server";
import { createServiceRoleClient } from "../../../../lib/supabase-server";
import { makeContributorHashForRequest } from "../../../../lib/contributor-hash";
import { resolveDocumentMetadataBySlug } from "../../../../lib/document-resolver";
import { buildPublicTopicCandidate } from "../../../../lib/topic-candidates";
import { REPORT_MESSAGE_MAX_LENGTH } from "../../../../lib/submission-constants";
import {
  contributorSubmissionRateLimited,
  hasHoneypotValue,
  inspectSubmissionText,
} from "../../../../lib/submission-guard";
import { recordDocumentAnalyticsEvent } from "@/lib/analytics";
import { invalidPublicSourceUrl, normalizeSourceUrl, parsePublicSourceUrl } from "@/lib/source-contributions";
import { awardPoints, extractDomain, POINT_VALUES } from "@/lib/gamification";
import { loadRegistryBundleWithPublicationState } from "@/lib/registry-publication";
import {
  isReportIssueCategory,
  REPORT_CONTACT_MAX_LENGTH,
  severityForReportCategory,
  type ReportIssueCategory,
} from "@/lib/task5-corrections";
import { claimVersionReference, readBoundedJsonObject } from "@/lib/task5-report-server";

const REPORT_TYPES = new Set(["correction", "source_candidate", "notify", "right_of_reply"]);

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const parsedBody = await readBoundedJsonObject(request);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: parsedBody.error },
      { status: parsedBody.error === "body_too_large" ? 413 : 400 },
    );
  }
  const body = parsedBody.body;

  if (hasHoneypotValue(body)) {
    return NextResponse.json({ error: "submission rejected", code: "HONEYPOT_FILLED" }, { status: 400 });
  }

  const message = cleanString(body.message);
  if (!message) {
    return NextResponse.json({ error: "message is required", code: "MESSAGE_REQUIRED" }, { status: 400 });
  }
  if (message.length > REPORT_MESSAGE_MAX_LENGTH) {
    return NextResponse.json(
      { error: `message must be ${REPORT_MESSAGE_MAX_LENGTH} characters or fewer`, code: "MESSAGE_TOO_LONG" },
      { status: 400 },
    );
  }

  const requestedType = cleanString(body.report_type) || "correction";
  if (!REPORT_TYPES.has(requestedType)) {
    return NextResponse.json({ error: "invalid_report_type" }, { status: 400 });
  }
  const defaultCategory: ReportIssueCategory = requestedType === "right_of_reply" ? "right_of_reply" : requestedType === "correction" ? "incorrect" : "other";
  const issueCategory = isReportIssueCategory(body.issue_category) ? body.issue_category : defaultCategory;
  const selectedClaimId = cleanString(body.claim_id);
  const requiresClaimBinding = requestedType === "correction" || requestedType === "right_of_reply";
  if (requiresClaimBinding && !selectedClaimId) {
    return NextResponse.json({ error: "claim_id_required" }, { status: 400 });
  }

  const reporterContact = cleanString(body.reporter_contact);
  const contactConsent = body.contact_consent === true;
  if (reporterContact && (reporterContact.length < 3 || reporterContact.length > REPORT_CONTACT_MAX_LENGTH)) {
    return NextResponse.json({ error: "invalid_reporter_contact" }, { status: 400 });
  }
  if (reporterContact && !contactConsent) {
    return NextResponse.json({ error: "contact_consent_required" }, { status: 400 });
  }

  const resolvedDocument = await resolveDocumentMetadataBySlug(slug);
  const bundle = await loadRegistryBundleWithPublicationState(slug);
  if (!bundle) return NextResponse.json({ error: "document_not_found" }, { status: 404 });
  const resolvedClaim = selectedClaimId
    ? bundle.claims.find((claim) => claim.id === selectedClaimId) ?? null
    : null;
  if (selectedClaimId && !resolvedClaim) {
    return NextResponse.json({ error: "claim_not_found_in_document" }, { status: 400 });
  }

  let contributorHash: string;
  try {
    contributorHash = makeContributorHashForRequest(request);
  } catch (error) {
    console.error("[report] Contributor salt missing:", error);
    return NextResponse.json({ error: "server_configuration_error" }, { status: 500 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "submission_storage_unavailable", persisted: false }, { status: 503 });
  }

  const limit = await contributorSubmissionRateLimited(contributorHash);
  if (limit) {
    return NextResponse.json(
      { error: "submission rate limit exceeded", code: `RATE_LIMIT_${limit.toUpperCase()}` },
      { status: 429 },
    );
  }

  const sourceUrl = cleanString(body.source_url);
  const sourceTitle = cleanString(body.source_title);
  const citation = cleanString(body.citation);
  const parsedSourceUrl = sourceUrl ? parsePublicSourceUrl(sourceUrl) : null;
  if (parsedSourceUrl && !parsedSourceUrl.ok) {
    const invalidUrl = invalidPublicSourceUrl();
    return NextResponse.json({ error: invalidUrl.error, code: invalidUrl.code }, { status: invalidUrl.status });
  }
  const publicSourceUrl = parsedSourceUrl?.ok ? parsedSourceUrl.url : "";
  const normalizedUrl = normalizeSourceUrl(publicSourceUrl);
  const spamCheck = inspectSubmissionText([message, publicSourceUrl, sourceTitle, citation]);

  try {
    const { data: dbClaim, error: dbClaimError } = selectedClaimId
      ? await supabase
        .from("claims")
        .select("id,document_id,entity_id,current_claim_version_id,published_claim_version_id")
        .eq("id", selectedClaimId)
        .maybeSingle()
      : { data: null, error: null };
    if (dbClaimError) throw new Error(`claim binding lookup failed: ${dbClaimError.message}`);

    const versionRef = resolvedClaim
      ? claimVersionReference({
        ...resolvedClaim,
        current_claim_version_id: dbClaim?.current_claim_version_id ?? resolvedClaim.current_claim_version_id,
        published_claim_version_id: dbClaim?.published_claim_version_id ?? resolvedClaim.published_claim_version_id,
      })
      : null;
    const dbVersionId = dbClaim?.published_claim_version_id ?? dbClaim?.current_claim_version_id ?? null;

    const { data: insertedReport, error: reportError } = await supabase
      .from("reports")
      .insert({
        document_id: dbClaim?.document_id ?? null,
        entity_id: dbClaim?.entity_id ?? null,
        claim_id: dbClaim?.id ?? null,
        claim_version_id: dbVersionId,
        reported_document_slug: resolvedClaim ? bundle.document.slug : null,
        reported_claim_id: resolvedClaim?.id ?? null,
        reported_claim_version: versionRef,
        report_type: requestedType,
        issue_category: issueCategory,
        severity: severityForReportCategory(issueCategory),
        message,
        reporter_contact: reporterContact || null,
        contact_consent: reporterContact ? contactConsent : false,
        contributor_hash: contributorHash,
        status: spamCheck.status,
      })
      .select("id,severity,review_due_at")
      .single();
    if (reportError || !insertedReport) {
      throw new Error(`report insert failed: ${reportError?.message ?? "missing inserted report"}`);
    }

    let pointsAwarded = 0;
    let sourceSuggestionId: string | null = null;
    let sourceSuggestionSaved: boolean | null = null;
    if (publicSourceUrl || sourceTitle || citation) {
      sourceSuggestionSaved = true;
      const { data: suggestion, error: suggestionError } = await supabase.from("source_suggestions").insert({
        claim_id: dbClaim?.id ?? null,
        report_id: insertedReport.id,
        contributor_hash: contributorHash,
        source_type: requestedType === "source_candidate" ? "official" : "web",
        url: publicSourceUrl || null,
        title: sourceTitle || null,
        citation: citation || null,
        domain: normalizedUrl ? extractDomain(normalizedUrl) : null,
        status: spamCheck.status === "spam_suspected" ? "spam" : "pending",
      }).select("id").single();
      if (suggestionError || !suggestion) {
        sourceSuggestionSaved = false;
        console.error("[report] source suggestion insert failed after report persisted:", suggestionError?.message ?? "missing row");
      } else {
        sourceSuggestionId = suggestion.id;
        if (spamCheck.status !== "spam_suspected") {
          try {
            const awarded = await awardPoints(supabase, contributorHash, "source_submitted", POINT_VALUES.source_submitted, {
              referenceId: suggestion.id,
              referenceType: "source_suggestion",
            });
            if (awarded) pointsAwarded = POINT_VALUES.source_submitted;
          } catch (awardError) {
            console.error("[report] point award failed after report persisted:", awardError instanceof Error ? awardError.message : "unknown_error");
          }
        }
      }
    }

    const { error: topicCandidateError } = await supabase.from("topic_candidates").insert(buildPublicTopicCandidate({
      kind: "correction_report",
      title: `Correction report: ${resolvedDocument.title}`,
      slugSeed: `correction-${slug}`,
      lang: resolvedDocument.lang,
      category: resolvedDocument.category,
      reason: message,
      aiContext: `Public correction report for slug=${bundle.document.slug}, report_id=${insertedReport.id}, issue_category=${issueCategory}`,
      sourceUrls: [publicSourceUrl || null],
      contributorHash,
      claimQuestion: resolvedClaim?.claim_text ?? `Which claim on ${resolvedDocument.title} needs correction?`,
    }));
    if (topicCandidateError) console.warn("[report] topic_candidates insert skipped:", topicCandidateError.message);

    await recordDocumentAnalyticsEvent(supabase, request, slug, "report_submission").catch((analyticsError) => {
      console.error("[report] analytics failed after report persisted:", analyticsError instanceof Error ? analyticsError.message : "unknown_error");
    });
    return NextResponse.json({
      success: true,
      slug,
      report_id: insertedReport.id,
      severity: insertedReport.severity,
      review_due_at: insertedReport.review_due_at,
      points_awarded: pointsAwarded,
      source_suggestion_id: sourceSuggestionId,
      source_suggestion_saved: sourceSuggestionSaved,
      auto_quarantined: false,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[report] persistence failed", error instanceof Error ? error.message : "unknown_error");
    return NextResponse.json({ error: "submission_failed" }, { status: 500 });
  }
}
