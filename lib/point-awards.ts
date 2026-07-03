import { SupabaseClient } from '@supabase/supabase-js';

export const POINT_VALUES = {
  topic_submitted: 2,
  topic_accepted: 20,
  source_submitted: 5,
  official_source_bonus: 5,       // legacy submission-time event; not leaderboard-eligible
  official_source_accepted_bonus: 5, // stacked only after admin accepts an official source
  source_accepted: 30,
  source_used_in_verified_claim: 100,
  hallucination_reported: 5,
  hallucination_accepted: 50,
  new_country_contribution: 50,   // first contribution to a previously untouched country
  stale_claim_fixed: 80,
} as const;

export async function awardPoints(
  sb: SupabaseClient,
  contributorHash: string,
  eventType: string,
  points: number,
  opts?: {
    referenceId?: string;
    referenceType?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<boolean> {
  const event = {
    contributor_hash: contributorHash,
    event_type: eventType,
    points,
    reference_id: opts?.referenceId ?? null,
    reference_type: opts?.referenceType ?? null,
    metadata: opts?.metadata ?? {},
  };

  // Award rows that are tied to a reviewed/submitted object must be idempotent.
  // The database migration adds a matching partial unique index so concurrent
  // retries cannot mint the same reward more than once.
  const query = opts?.referenceId && opts?.referenceType
    ? sb
        .from('contributor_point_events')
        .upsert(event, {
          onConflict: 'contributor_hash,event_type,reference_type,reference_id',
          ignoreDuplicates: true,
        })
        .select('id')
        .maybeSingle()
    : sb.from('contributor_point_events').insert(event).select('id').maybeSingle();

  const { data, error } = await query;
  if (error) throw new Error(`point award failed: ${error.message}`);
  return Boolean(data);
}
