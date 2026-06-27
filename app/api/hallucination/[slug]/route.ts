import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase-server';
import { makeContributorHash, extractIp } from '@/lib/contributor-hash';
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

  const aiService = body.ai_service?.trim();
  if (!aiService) {
    return NextResponse.json({ error: 'ai_service is required' }, { status: 400 });
  }

  // Resolve document + entity from slug (static seed data)
  const doc = getDocumentBySlug(slug);
  const documentId = doc?.id ?? null;
  const entityId = doc?.entity_id ?? null;

  // Generate contributor hash — never store raw IP
  const ip = extractIp(request);
  const contributorHash = makeContributorHash(ip);

  if (isSupabaseConfigured()) {
    try {
      const supabase = createServerClient();
      const { error } = await supabase.from('hallucination_reports').insert({
        document_id: documentId,
        entity_id: entityId,
        ai_service: aiService,
        prompt: body.prompt ?? null,
        ai_answer: body.ai_answer ?? null,
        expected_correction: body.expected_correction ?? null,
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
    // Supabase not configured — stub mode (logs only)
    console.log('[hallucination] STUB mode — not persisted. slug:', slug, 'ai_service:', aiService);
  }

  return NextResponse.json({ success: true, slug });
}
