import type { SupabaseClient } from '@supabase/supabase-js';
import { makeContributorHashForRequest } from '@/lib/contributor-hash';
import {
  awardPoints,
  checkAndAwardBadges,
  isOfficialDomain,
  extractDomain,
  POINT_VALUES,
} from '@/lib/gamification';
import { invalidPublicSourceUrl, parsePublicSourceUrl } from '@/lib/source-contributions';
import { rateLimited } from '@/lib/rate-limit';
import { err, ok, type Result } from '@/lib/result';

const DAILY_PER_CLAIM_LIMIT = 20;
const DAY_MS = 86_400_000;

export async function suggestSourceService(sb: SupabaseClient, request: Request, body: Record<string, unknown>): Promise<Result<Record<string, unknown>>> {

  const claimId = String(body.claim_id ?? '').trim();
  const rawUrl = String(body.url ?? '').trim();
  const parsedUrl = rawUrl ? parsePublicSourceUrl(rawUrl) : null;
  const url = parsedUrl?.ok ? parsedUrl.url : null;
  const title = String(body.title ?? '').trim() || null;
  const citation = String(body.citation ?? '').trim() || null;
  const sourceType = String(body.source_type ?? 'web').trim();
  const country = String(body.country ?? '').trim() || null;

  if (!claimId) {
    return err('claim_id is required', 400);
  }
  if (parsedUrl && !parsedUrl.ok) {
    const invalidUrl = invalidPublicSourceUrl();
    return err(invalidUrl.error, invalidUrl.status, { code: invalidUrl.code });
  }
  if (!url && !citation && !title) {
    return err('At least one of url, title, or citation is required', 400);
  }

  const allowedTypes = new Set(['official', 'platform', 'review', 'document', 'web', 'other']);
  if (!allowedTypes.has(sourceType)) {
    return err('Invalid source_type', 400);
  }

  let contributorHash: string;
  try {
    contributorHash = makeContributorHashForRequest(request);
  } catch (error) {
    console.error('[source-suggest] salt missing:', error);
    return err('Server configuration error', 500);
  }


  // Verify claim exists
  const { data: claim, error: claimErr } = await sb
    .from('claims')
    .select('id, entity_id, document_id')
    .eq('id', claimId)
    .single();

  if (claimErr || !claim) {
    return err('Claim not found', 404);
  }

  const domain = url ? extractDomain(url) : null;
  const official = url ? isOfficialDomain(url) : false;

  // Rate-limit: max 20 suggestions per contributor per day per claim.
  // The in-memory guard runs first and increments synchronously, so concurrent
  // requests from one client cannot slip past the cap in the window between the
  // DB count and the insert (the original check-then-act TOCTOU that let macro
  // scripts farm points). The DB count below remains as a cross-instance
  // best-effort backstop.
  if (rateLimited('source-suggest', `${contributorHash}:${claimId}`, DAILY_PER_CLAIM_LIMIT, DAY_MS)) {
    return err('Daily suggestion limit reached for this claim', 429);
  }

  const oneDayAgo = new Date(Date.now() - DAY_MS).toISOString();
  const { count: recentCount } = await sb
    .from('source_suggestions')
    .select('id', { count: 'exact', head: true })
    .eq('contributor_hash', contributorHash)
    .eq('claim_id', claimId)
    .gte('created_at', oneDayAgo);

  if ((recentCount ?? 0) >= DAILY_PER_CLAIM_LIMIT) {
    return err('Daily suggestion limit reached for this claim', 429);
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
    return err('Failed to save suggestion', 500);
  }

  // Award base points
  let pointsAwarded = POINT_VALUES.source_submitted;
  await awardPoints(sb, contributorHash, 'source_submitted', POINT_VALUES.source_submitted, {
    referenceId: suggestion.id,
    referenceType: 'source_suggestion',
    metadata: { claim_id: claimId, country },
  });

  // Bonus for official domain
  if (official) {
    await awardPoints(sb, contributorHash, 'official_source_bonus', POINT_VALUES.official_source_bonus, {
      referenceId: suggestion.id,
      referenceType: 'source_suggestion',
      metadata: { domain, claim_id: claimId, country },
    });
    pointsAwarded += POINT_VALUES.official_source_bonus;
  }

  // Check and award any newly earned badges
  const newBadges = await checkAndAwardBadges(sb, contributorHash);

  return ok({
    success: true,
    suggestion_id: suggestion.id,
    points_awarded: pointsAwarded,
    is_official_source: official,
    new_badges: newBadges,
  });
}
