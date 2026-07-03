import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '../../../../lib/supabase-server';
import { makeContributorHashForRequest } from '../../../../lib/contributor-hash';
import { resolveDocumentMetadataBySlug } from '../../../../lib/document-resolver';
import { buildPublicTopicCandidate } from '../../../../lib/topic-candidates';
import {
  REPORT_MESSAGE_MAX_LENGTH,
  contributorSubmissionRateLimited,
  hasHoneypotValue,
  inspectSubmissionText,
} from '../../../../lib/submission-limits';
import { recordDocumentAnalyticsEvent } from '@/lib/analytics';
import { invalidPublicSourceUrl, normalizeSourceUrl, parsePublicSourceUrl } from '@/lib/source-contributions';
import { awardPoints, extractDomain, POINT_VALUES } from '@/lib/gamification';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (hasHoneypotValue(body)) {
    return NextResponse.json({ error: 'submission rejected', code: 'HONEYPOT_FILLED' }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: 'message is required', code: 'MESSAGE_REQUIRED' }, { status: 400 });
  }

  if (message.length > REPORT_MESSAGE_MAX_LENGTH) {
    return NextResponse.json(
      {
        error: `message must be ${REPORT_MESSAGE_MAX_LENGTH} characters or fewer`,
        code: 'MESSAGE_TOO_LONG',
        max_length: REPORT_MESSAGE_MAX_LENGTH,
      },
      { status: 400 }
    );
  }

  // Resolve document + entity from static seed data, then Supabase fallback.
  const resolvedDocument = await resolveDocumentMetadataBySlug(slug);
  const documentId = resolvedDocument.documentId;
  const entityId = resolvedDocument.entityId;

  // Generate contributor hash — never store raw IP
  let contributorHash: string;
  try {
    contributorHash = makeContributorHashForRequest(request);
  } catch (error) {
    console.error('[report] Contributor salt missing:', error);
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  let responsePayload: Record<string, unknown> = { success: true, slug };

  if (isSupabaseConfigured()) {
    try {
      const supabase = createServerClient();
      const limit = await contributorSubmissionRateLimited(contributorHash);
      if (limit) {
        return NextResponse.json(
          { error: 'submission rate limit exceeded', code: `RATE_LIMIT_${limit.toUpperCase()}` },
          { status: 429 }
        );
      }

      const sourceUrl = typeof body.source_url === 'string' ? body.source_url.trim() : '';
      const sourceTitle = typeof body.source_title === 'string' ? body.source_title.trim() : '';
      const citation = typeof body.citation === 'string' ? body.citation.trim() : '';
      const claimId = typeof body.claim_id === 'string' && body.claim_id.trim() ? body.claim_id.trim() : null;
      const parsedSourceUrl = sourceUrl ? parsePublicSourceUrl(sourceUrl) : null;
      if (parsedSourceUrl && !parsedSourceUrl.ok) {
        const invalidUrl = invalidPublicSourceUrl();
        return NextResponse.json({ error: invalidUrl.error, code: invalidUrl.code }, { status: invalidUrl.status });
      }
      const publicSourceUrl = parsedSourceUrl?.ok ? parsedSourceUrl.url : '';
      const normalizedUrl = normalizeSourceUrl(publicSourceUrl);
      const spamCheck = inspectSubmissionText([message, publicSourceUrl, sourceTitle, citation]);
      const { error } = await supabase.from('reports').insert({
        document_id: documentId,
        entity_id: entityId,
        report_type: body.report_type ?? 'correction',
        message,
        contributor_hash: contributorHash,
        status: spamCheck.status,
      });

      let pointsAwarded = 0;
      let sourceSuggestionId: string | null = null;
      if (!error && (publicSourceUrl || sourceTitle || citation)) {
        const { data: suggestion, error: suggestionError } = await supabase.from('source_suggestions').insert({
          claim_id: claimId,
          contributor_hash: contributorHash,
          source_type: body.report_type === 'source_candidate' ? 'official' : 'web',
          url: publicSourceUrl || null,
          title: sourceTitle || null,
          citation: citation || null,
          domain: normalizedUrl ? extractDomain(normalizedUrl) : null,
          status: spamCheck.status === 'spam_suspected' ? 'spam' : 'pending',
        }).select('id').single();
        if (suggestionError) throw new Error(`source suggestion insert failed: ${suggestionError.message}`);
        sourceSuggestionId = suggestion.id;

        if (spamCheck.status !== 'spam_suspected') {
          pointsAwarded = POINT_VALUES.source_submitted;
          await awardPoints(supabase, contributorHash, 'source_submitted', pointsAwarded, {
            referenceId: sourceSuggestionId ?? undefined,
            referenceType: 'source_suggestion',
          });
        }
      }

      if (!error) {
        const { error: topicCandidateError } = await supabase.from('topic_candidates').insert(buildPublicTopicCandidate({
          kind: 'correction_report',
          title: `Correction report: ${resolvedDocument.title}`,
          slugSeed: `correction-${slug}`,
          lang: resolvedDocument.lang,
          category: resolvedDocument.category,
          reason: message,
          aiContext: `Public correction report for document_id=${documentId ?? 'unknown'}, entity_id=${entityId ?? 'unknown'}, report_type=${body.report_type ?? 'correction'}, source_suggestion_id=${sourceSuggestionId ?? 'none'}`,
          sourceUrls: [publicSourceUrl || null],
          contributorHash,
          claimQuestion: `Which claim on ${resolvedDocument.title} needs correction?`,
        }));
        if (topicCandidateError) console.warn('[report] topic_candidates insert skipped:', topicCandidateError.message);
      }


      if (error) {
        console.error('[report] Supabase insert error:', error.message);
        return NextResponse.json(
          { error: 'Failed to save candidate report' },
          { status: 500 }
        );
      }
      await recordDocumentAnalyticsEvent(supabase, request, slug, 'report_submission');
      responsePayload = { success: true, slug, points_awarded: pointsAwarded, source_suggestion_id: sourceSuggestionId };
    } catch (err) {
      console.error('[report] Unexpected error:', err);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
  } else {
    console.error('[report] candidate storage not configured — NOT persisted');
    return NextResponse.json(
      { error: 'submission_storage_unavailable', persisted: false },
      { status: 503 }
    );
  }

  return NextResponse.json(responsePayload);
}
