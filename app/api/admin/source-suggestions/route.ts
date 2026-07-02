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
  const claimId = searchParams.get('claim_id')?.trim();

  let query = sb
    .from('source_candidates')
    .select('*, claims(id, field_path, claim_text, document_id, entity_id)')
    .eq('review_status', status)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (claimId) query = query.eq('claim_id', claimId);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, 'admin.source_suggestions.list', { status, claim_id: claimId ?? null, count: data?.length ?? 0 });

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

  // Fetch the canonical source candidate
  const { data: suggestion, error: fetchErr } = await sb
    .from('source_candidates')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !suggestion) {
    return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
  }

  if (suggestion.review_status !== 'pending') {
    return NextResponse.json({ error: 'Suggestion is not pending' }, { status: 409 });
  }

  const newReviewStatus = action === 'accept' ? 'accepted' : action === 'spam' ? 'spam' : 'rejected';
  const newSubmissionStatus = action === 'accept' ? 'accepted' : action === 'spam' ? 'spam' : 'rejected';

  // Update review status. Review status records moderation only; it does not
  // verify a claim unless an admin separately promotes the source into claim_sources.
  const { error: updateErr } = await sb
    .from('source_candidates')
    .update({ status: newSubmissionStatus, review_status: newReviewStatus, reviewed_at: new Date().toISOString() })
    .eq('id', id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  let claimSourceId: string | null = null;

  if (action === 'accept' && suggestion.contributor_hash) {
    // Award acceptance points
    await awardPoints(sb, suggestion.contributor_hash, 'source_accepted', POINT_VALUES.source_accepted, {
      referenceId: id,
      referenceType: 'source_candidate',
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
      if (srcErr) return NextResponse.json({ error: 'claim_sources insert failed', detail: srcErr.message }, { status: 500 });
      claimSourceId = sourceId;
      await sb.from('source_candidates').update({ linked_claim_source_id: sourceId }).eq('id', id);
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

  return NextResponse.json({ success: true, status: newReviewStatus, claim_source_id: claimSourceId });
}
