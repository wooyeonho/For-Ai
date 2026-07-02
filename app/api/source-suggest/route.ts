import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '../../../lib/supabase-server';
import { makeContributorHashForRequest } from '../../../lib/contributor-hash';
import {
  awardPoints,
  checkAndAwardBadges,
  isOfficialDomain,
  extractDomain,
  POINT_VALUES,
} from '../../../lib/gamification';
import { invalidPublicSourceUrl, parsePublicSourceUrl } from '../../../lib/source-contributions';
import { persistentRateLimited } from '../../../lib/rate-limit-store';

const DAILY_PER_CLAIM_LIMIT = 20;
const DAY_MS = 86_400_000;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const claimId = String(body.claim_id ?? '').trim();
  const rawUrl = String(body.url ?? '').trim();
  const parsedUrl = rawUrl ? parsePublicSourceUrl(rawUrl) : null;
  const url = parsedUrl?.ok ? parsedUrl.url : null;
  const title = String(body.title ?? '').trim() || null;
  const citation = String(body.citation ?? '').trim() || null;
  const sourceType = String(body.source_type ?? 'web').trim();
  const country = String(body.country ?? '').trim() || null;

  if (!claimId) {
    return NextResponse.json({ error: 'claim_id is required' }, { status: 400 });
  }
  if (parsedUrl && !parsedUrl.ok) {
    const invalidUrl = invalidPublicSourceUrl();
    return NextResponse.json({ error: invalidUrl.error, code: invalidUrl.code }, { status: invalidUrl.status });
  }
  if (!url && !citation && !title) {
    return NextResponse.json({ error: 'At least one of url, title, or citation is required' }, { status: 400 });
  }

  const allowedTypes = new Set(['official', 'platform', 'review', 'document', 'web', 'other']);
  if (!allowedTypes.has(sourceType)) {
    return NextResponse.json({ error: 'Invalid source_type' }, { status: 400 });
  }

  let contributorHash: string;
  try {
    contributorHash = makeContributorHashForRequest(request);
  } catch (err) {
    console.error('[source-suggest] salt missing:', err);
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'submission_storage_unavailable' }, { status: 503 });
  }

  const sb = createServerClient();

  // Verify claim exists
  const { data: claim, error: claimErr } = await sb
    .from('claims')
    .select('id, entity_id, document_id')
    .eq('id', claimId)
    .single();

  if (claimErr || !claim) {
    return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
  }

  const domain = url ? extractDomain(url) : null;
  const official = url ? isOfficialDomain(url) : false;

  // Rate-limit: max 20 suggestions per contributor per day per claim. The
  // persistent (Postgres-backed) limiter increments atomically in a single
  // round-trip, so concurrent requests from one client — even across
  // serverless instances — cannot slip past the cap in the window between the
  // DB count and the insert (the check-then-act TOCTOU that let macro scripts
  // farm points). The DB count below remains as a defense-in-depth backstop.
  if ((await persistentRateLimited('source-suggest', `${contributorHash}:${claimId}`, DAILY_PER_CLAIM_LIMIT, DAY_MS)).limited) {
    return NextResponse.json({ error: 'Daily suggestion limit reached for this claim' }, { status: 429 });
  }

  const oneDayAgo = new Date(Date.now() - DAY_MS).toISOString();
  const { count: recentCount } = await sb
    .from('source_suggestions')
    .select('id', { count: 'exact', head: true })
    .eq('contributor_hash', contributorHash)
    .eq('claim_id', claimId)
    .gte('created_at', oneDayAgo);

  if ((recentCount ?? 0) >= DAILY_PER_CLAIM_LIMIT) {
    return NextResponse.json({ error: 'Daily suggestion limit reached for this claim' }, { status: 429 });
  }

  // Insert suggestion
  const { data: suggestion, error: insertErr } = await sb
    .from('source_suggestions')
    .insert({
      claim_id: claimId,
      contributor_hash: contributorHash,
      source_type: official ? 'official' : sourceType,
      url,
      title,
      citation,
      domain,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertErr || !suggestion) {
    console.error('[source-suggest] insert error:', insertErr?.message);
    return NextResponse.json({ error: 'Failed to save suggestion' }, { status: 500 });
  }

  // Award base points idempotently per saved suggestion.
  let pointsAwarded = 0;
  const baseAwarded = await awardPoints(sb, contributorHash, 'source_submitted', POINT_VALUES.source_submitted, {
    referenceId: suggestion.id,
    referenceType: 'source_suggestion',
    metadata: { claim_id: claimId, country },
  });
  if (baseAwarded) pointsAwarded += POINT_VALUES.source_submitted;

  // Bonus for official domain
  if (official) {
    const bonusAwarded = await awardPoints(sb, contributorHash, 'official_source_bonus', POINT_VALUES.official_source_bonus, {
      referenceId: suggestion.id,
      referenceType: 'source_suggestion',
      metadata: { domain, claim_id: claimId, country },
    });
    if (bonusAwarded) pointsAwarded += POINT_VALUES.official_source_bonus;
  }

  // Check and award any newly earned badges
  const newBadges = await checkAndAwardBadges(sb, contributorHash);

  return NextResponse.json({
    success: true,
    suggestion_id: suggestion.id,
    points_awarded: pointsAwarded,
    is_official_source: official,
    new_badges: newBadges,
  });
}
