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
import { invalidPublicSourceUrl, normalizeSourceUrl, parsePublicSourceUrl, pointEventForSubmission } from '@/lib/source-contributions';
import { recordContributionEvent } from '@/lib/contributions';

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
      const fieldPath = typeof body.field_path === 'string' && body.field_path.trim() ? body.field_path.trim() : null;
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
      let sourceCandidateId: string | null = null;
      if (!error && (publicSourceUrl || sourceTitle || citation)) {
        const { data: contributor, error: contributorError } = await supabase
          .from('contributors')
          .upsert({ contributor_hash: contributorHash, updated_at: new Date().toISOString() }, { onConflict: 'contributor_hash' })
          .select('id,total_points')
          .single();
        if (contributorError) throw new Error(`contributor upsert failed: ${contributorError.message}`);

        const { data: duplicate } = normalizedUrl
          ? await supabase
              .from('source_candidates')
              .select('id')
              .eq('normalized_url', normalizedUrl)
              .neq('status', 'spam')
              .limit(1)
              .maybeSingle()
          : { data: null } as { data: null };
        const isDuplicate = Boolean(duplicate?.id);
        const pointEvent = spamCheck.status === 'spam_suspected'
          ? { eventType: 'source_spam_rejected', points: 0 }
          : pointEventForSubmission(isDuplicate);
        pointsAwarded = pointEvent.points;

        const { data: candidate, error: sourceError } = await supabase.from('source_candidates').insert({
          document_id: documentId,
          entity_id: entityId,
          claim_id: claimId,
          field_path: fieldPath,
          title: sourceTitle || null,
          url: publicSourceUrl || null,
          normalized_url: normalizedUrl,
          citation: citation || null,
          source_type: body.report_type === 'source_candidate' ? 'official' : 'unknown',
          source_authority: body.report_type === 'source_candidate' ? 'official' : 'unknown',
          message,
          contributor_hash: contributorHash,
          contributor_id: contributor.id,
          duplicate_of: duplicate?.id ?? null,
          status: spamCheck.status,
          review_status: spamCheck.status === 'spam_suspected' ? 'spam' : 'pending',
          points_awarded: pointsAwarded,
        }).select('id').single();
        if (sourceError) throw new Error(`source candidate insert failed: ${sourceError.message}`);
        sourceCandidateId = candidate.id;

        const { data: event, error: eventError } = await supabase.from('contribution_events').insert({
          contributor_id: contributor.id,
          contributor_hash: contributorHash,
          source_candidate_id: sourceCandidateId,
          claim_id: claimId,
          event_type: pointEvent.eventType,
          points_delta: pointsAwarded,
          metadata: { duplicate: isDuplicate, spam_status: spamCheck.status, points_do_not_determine_truth: true },
        }).select('id').single();
        if (eventError) throw new Error(`contribution event insert failed: ${eventError.message}`);

        if (pointsAwarded > 0) {
          const { error: pointsError } = await supabase.from('contributor_points').insert({
            contributor_id: contributor.id,
            contributor_hash: contributorHash,
            contribution_event_id: event.id,
            points: pointsAwarded,
            reason: pointEvent.eventType,
          });
          if (pointsError) throw new Error(`contributor points insert failed: ${pointsError.message}`);
          await supabase.from('contributors').update({
            total_points: Number(contributor.total_points ?? 0) + pointsAwarded,
            updated_at: new Date().toISOString(),
          }).eq('id', contributor.id);
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
          aiContext: `Public correction report for document_id=${documentId ?? 'unknown'}, entity_id=${entityId ?? 'unknown'}, report_type=${body.report_type ?? 'correction'}, source_candidate_id=${sourceCandidateId ?? 'none'}`,
          sourceUrls: [publicSourceUrl || null],
          contributorHash,
          claimQuestion: `Which claim on ${resolvedDocument.title} needs correction?`,
        }));
        if (topicCandidateError) console.warn('[report] topic_candidates insert skipped:', topicCandidateError.message);
      }


      if (!error && publicSourceUrl) {
        await recordContributionEvent(supabase, {
          contributor_hash: contributorHash,
          event_type: 'source_submitted',
          country: resolvedDocument.country,
          source_type: 'web',
          claim_id: body.claim_id?.trim() || null,
          document_id: documentId,
        });
      }

      if (error) {
        console.error('[report] Supabase insert error:', error.message);
        return NextResponse.json(
          { error: 'Failed to save candidate report' },
          { status: 500 }
        );
      }
      await recordDocumentAnalyticsEvent(supabase, request, slug, 'report_submission');
      responsePayload = { success: true, slug, points_awarded: pointsAwarded, source_candidate_id: sourceCandidateId };
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
