import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '../../../../lib/supabase-server';
import { makeContributorHash, extractIp } from '../../../../lib/contributor-hash';
import { getDocumentBySlug } from '../../../../lib/data';

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

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  // Resolve document + entity from slug (static seed data)
  const doc = getDocumentBySlug(slug);
  const documentId = doc?.id ?? null;
  const entityId = doc?.entity_id ?? null;

  // Generate contributor hash — never store raw IP
  const ip = extractIp(request);
  const contributorHash = makeContributorHash(
    ip,
    process.env.CONTRIBUTOR_SALT ?? ''
  );

  if (isSupabaseConfigured()) {
    try {
      const supabase = createServerClient();
      const { error } = await supabase.from('reports').insert({
        document_id: documentId,
        entity_id: entityId,
        report_type: body.report_type ?? 'correction',
        message,
        contributor_hash: contributorHash,
        status: 'new',
      });

      if (error) {
        console.error('[report] Supabase insert error:', error.message);
        return NextResponse.json(
          { error: 'Failed to save report' },
          { status: 500 }
        );
      }
    } catch (err) {
      console.error('[report] Unexpected error:', err);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
  } else {
    // Supabase not configured — stub mode (logs only)
    console.log('[report] STUB mode — not persisted. slug:', slug, 'message:', message.slice(0, 80));
  }

  return NextResponse.json({ success: true, slug });
}
