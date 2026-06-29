import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase-server';
import { makeContributorHashForRequest } from '@/lib/contributor-hash';
import { getDocumentBySlug } from '@/lib/data';
import { buildPublicTopicCandidate } from '@/lib/topic-candidates';
import {
  HALLUCINATION_FIELD_MAX_LENGTHS,
  contributorSubmissionRateLimited,
  hasHoneypotValue,
  inspectSubmissionText,
  type HallucinationFieldName,
} from '@/lib/submission-limits';
import { awardPoints, POINT_VALUES } from '@/lib/gamification';

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

  const aiService = body.ai_service?.trim();
  if (!aiService) {
    return NextResponse.json({ error: 'ai_service is required', code: 'AI_SERVICE_REQUIRED' }, { status: 400 });
  }

  const normalizedBody: Record<HallucinationFieldName, string> = {
    ai_service: aiService,
    prompt: body.prompt?.trim() ?? '',
    ai_answer: body.ai_answer?.trim() ?? '',
    expected_correction: body.expected_correction?.trim() ?? '',
  };

  for (const field of Object.keys(HALLUCINATION_FIELD_MAX_LENGTHS) as HallucinationFieldName[]) {
    const maxLength = HALLUCINATION_FIELD_MAX_LENGTHS[field];
    if (normalizedBody[field].length > maxLength) {
      return NextResponse.json(
        {
          error: `${field} must be ${maxLength} characters or fewer`,
          code: `${field.toUpperCase()}_TOO_LONG`,
          field,
          max_length: maxLength,
        },
        { status: 400 }
      );
    }
  }

  // Resolve document + entity from slug (static seed data)
  const doc = getDocumentBySlug(slug);
  const documentId = doc?.id ?? null;
  const entityId = doc?.entity_id ?? null;

  // Generate contributor hash — never store raw IP
  let contributorHash: string;
  try {
    contributorHash = makeContributorHashForRequest(request);
  } catch (error) {
    console.error('[hallucination] Contributor salt missing:', error);
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = createServerClient();
      const limit = contributorSubmissionRateLimited(contributorHash);
      if (limit) {
        return NextResponse.json(
          { error: 'submission rate limit exceeded', code: `RATE_LIMIT_${limit.toUpperCase()}` },
          { status: 429 }
        );
      }

      const spamCheck = inspectSubmissionText([
        aiService,
        normalizedBody.prompt,
        normalizedBody.ai_answer,
        normalizedBody.expected_correction,
      ]);
      const { error } = await supabase.from('hallucination_reports').insert({
        document_id: documentId,
        entity_id: entityId,
        ai_service: aiService,
        prompt: normalizedBody.prompt || null,
        ai_answer: normalizedBody.ai_answer || null,
        expected_correction: normalizedBody.expected_correction || null,
        claim_id: body.claim_id?.trim() || null,
        wrong_answer_type: body.wrong_answer_type?.trim() || null,
        correction_prompt: body.correction_prompt?.trim() || null,
        share_card: body.share_card && typeof body.share_card === 'object' ? body.share_card : {},
        contributor_hash: contributorHash,
        status: spamCheck.status,
      });
      if (!error) {
        await supabase.from('topic_candidates').insert(buildPublicTopicCandidate({
          kind: 'hallucination_report',
          title: `AI hallucination report: ${doc?.title ?? slug}`,
          slugSeed: `hallucination-${slug}`,
          lang: doc?.lang ?? 'en',
          category: doc?.category ?? 'hallucination_report',
          reason: normalizedBody.expected_correction || normalizedBody.ai_answer || `AI hallucination reported from ${aiService}`,
          aiContext: `AI service: ${aiService}\nPrompt: ${normalizedBody.prompt || '(not provided)'}\nAI answer: ${normalizedBody.ai_answer || '(not provided)'}\nDocument: ${documentId ?? 'unknown'} / Entity: ${entityId ?? 'unknown'}`,
          sourceUrls: [typeof body.source_url === 'string' ? body.source_url : null],
          contributorHash,
          claimQuestion: normalizedBody.expected_correction || `Which claim on ${doc?.title ?? slug} did ${aiService} answer incorrectly?`,
        })).catch((err: unknown) => console.warn('[hallucination] topic_candidates insert skipped:', err));
      }

      if (error) {
        console.error('[hallucination] Supabase insert error:', error.message);
        return NextResponse.json(
          { error: 'Failed to save hallucination candidate' },
          { status: 500 }
        );
      }

      // Award points for reporting a hallucination
      await awardPoints(supabase, contributorHash, 'hallucination_reported', POINT_VALUES.hallucination_reported, {
        referenceType: 'hallucination_report',
        metadata: { slug, ai_service: aiService },
      });
    } catch (err) {
      console.error('[hallucination] Unexpected error:', err);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
  } else {
    console.error('[hallucination] candidate storage not configured — NOT persisted');
    return NextResponse.json(
      { error: 'submission_storage_unavailable', persisted: false },
      { status: 503 }
    );
  }

  return NextResponse.json({ success: true, slug });
}
