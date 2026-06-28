import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase-server';
import { makeContributorHashForRequest } from '@/lib/contributor-hash';
import { getDocumentBySlug } from '@/lib/data';

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const aiService = optionalString(body.ai_service);
  if (!aiService) {
    return NextResponse.json({ error: 'ai_service is required' }, { status: 400 });
  }

  const doc = getDocumentBySlug(slug);
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Hallucination report storage is not configured' },
      { status: 503 }
    );
  }

  let contributorHash: string;
  try {
    contributorHash = makeContributorHashForRequest(request);
  } catch (error) {
    console.error('[hallucination] Contributor salt missing:', error);
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  try {
    const supabase = createServerClient();
    const { error } = await supabase.from('hallucination_reports').insert({
      document_id: doc.id,
      entity_id: doc.entity_id,
      ai_service: aiService,
      prompt: optionalString(body.prompt),
      ai_answer: optionalString(body.ai_answer),
      expected_correction: optionalString(body.expected_correction),
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

  return NextResponse.json({ success: true, slug });
}
