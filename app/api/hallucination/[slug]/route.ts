import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase-server';
import { makeContributorHashForRequest } from '@/lib/contributor-hash';
import { getDocumentBySlug } from '@/lib/data';
import { HALLUCINATION_FIELD_MAX_LENGTHS, type HallucinationFieldName } from '@/lib/submission-limits';

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
        status: 'new',
      });

      if (error) {
        console.error('[hallucination] Supabase insert error:', error.message);
        return NextResponse.json(
          { error: 'Failed to save hallucination report' },
          { status: 500 }
        );
      }
    } catch (err) {
      console.error('[hallucination] Unexpected error:', err);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
  } else {
    console.error('[hallucination] storage not configured — NOT persisted');
    return NextResponse.json(
      { error: 'submission_storage_unavailable', persisted: false },
      { status: 503 }
    );
  }

  return NextResponse.json({ success: true, slug });
}
