import { NextResponse } from 'next/server';
import { logAdminAuditEvent, requireAdmin, supabaseAdmin } from '@/lib/admin-api';
import {
  awardPoints,
  checkAndAwardBadges,
  POINT_VALUES,
} from '@/lib/gamification';

// GET: list pending source suggestions
export async function GET(request: Request) {
  const adminError = await requireAdmin(request, 'source_suggestions.read');
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'pending';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);

  const { data, error } = await sb
    .from('source_suggestions')
    .select('*, claims(id, field_path, claim_text, document_id, entity_id)')
    .eq('status', status)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, 'admin.source_suggestions.list', { status, count: data?.length ?? 0 });

  return NextResponse.json({ suggestions: data ?? [] });
}

// PATCH: accept or reject a suggestion, trigger point awards
export async function PATCH(request: Request) {
  const adminError = await requireAdmin(request, 'source_suggestions.review');
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 });

  const body = await request.json();
  const id = String(body.id ?? '').trim();
  const action = String(body.action ?? '').trim(); // 'accept' | 'reject' | 'duplicate' | 'spam'
  const promoteToClaimSource = Boolean(body.promote_to_claim_source); // if true, also insert into claim_sources

  const allowedActions = new Set(['accept', 'reject', 'duplicate', 'spam']);
  if (!id || !allowedActions.has(action)) {
    return NextResponse.json({ error: 'id and valid action are required' }, { status: 400 });
  }

  // Fetch the suggestion
  const { data: suggestion, error: fetchErr } = await sb
    .from('source_suggestions')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !suggestion) {
    return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
  }

  if (suggestion.status !== 'pending') {
    return NextResponse.json({ error: 'Suggestion is not pending' }, { status: 409 });
  }

  const newStatus = action === 'accept' ? 'accepted' : action === 'duplicate' ? 'duplicate' : action === 'spam' ? 'spam' : 'rejected';

  // Update status
  const { error: updateErr } = await sb
    .from('source_suggestions')
    .update({ status: newStatus, reviewed_at: new Date().toISOString() })
    .eq('id', id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  let claimSourceId: string | null = null;

  if (action === 'accept') {
    // Award acceptance points
    await awardPoints(sb, suggestion.contributor_hash, 'source_accepted', POINT_VALUES.source_accepted, {
      referenceId: id,
      referenceType: 'source_suggestion',
    });

    // Optionally promote to official claim_source
    if (promoteToClaimSource && suggestion.claim_id) {
      const sourceId = `src-${suggestion.claim_id}-${Date.now()}`;
      const { error: srcErr } = await sb.from('claim_sources').insert({
        id: sourceId,
        claim_id: suggestion.claim_id,
        source_type: suggestion.source_type,
        title: suggestion.title,
        url: suggestion.url,
        citation: suggestion.citation,
        contributor_hash: suggestion.contributor_hash,
        observed_at: new Date().toISOString(),
      });
      if (!srcErr) claimSourceId = sourceId;
    }

    await checkAndAwardBadges(sb, suggestion.contributor_hash);
  }

  await logAdminAuditEvent(sb, request, 'admin.source_suggestions.review', {
    suggestion_id: id,
    action,
    contributor_hash: suggestion.contributor_hash,
    promote_to_claim_source: promoteToClaimSource,
    claim_source_id: claimSourceId,
  });

  return NextResponse.json({ success: true, status: newStatus, claim_source_id: claimSourceId });
}
