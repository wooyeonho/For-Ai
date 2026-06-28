import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase-server';
import { makeContributorHashForRequest } from '@/lib/contributor-hash';
import { getDocumentBySlug } from '@/lib/data';

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

  const aiService = String(body.ai_service ?? '').trim();
  if (!aiService) {
    return NextResponse.json({ error: 'ai_service is required' }, { status: 400 });
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

  const prompt = String(body.prompt ?? '').trim() || null;
  const aiAnswer = String(body.ai_answer ?? '').trim() || null;
  const expectedCorrection = String(body.expected_correction ?? '').trim() || null;
  let storage: 'db' | 'stub' = 'stub';

  if (!aiAnswer) {
    return NextResponse.json({ error: 'ai_answer is required' }, { status: 400 });
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = createServerClient();
      const { error } = await supabase.from('hallucination_reports').insert({
        document_id: documentId,
        entity_id: entityId,
        ai_service: aiService,
        prompt,
        ai_answer: aiAnswer,
        expected_correction: expectedCorrection,
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

      storage = 'db';
    } catch (err) {
      console.error('[hallucination] Unexpected error:', err);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
  } else {
    // Supabase not configured — stub mode (logs only)
    console.log('[hallucination] STUB mode — not persisted. slug:', slug, 'ai_service:', aiService);
  }

  return NextResponse.json({ accepted: true, success: true, slug, status: 'new', storage, raw_ip_stored: false });
}
