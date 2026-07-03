import { SupabaseClient } from '@supabase/supabase-js';

export type ReceiptStatus = 'pending' | 'accepted' | 'rejected' | 'verified-linked';
export type ReceiptItem = {
  id: string;
  type: 'source_suggestion' | 'topic_suggestion' | 'community_post' | 'contribution_event';
  title: string;
  detail: string | null;
  status: ReceiptStatus;
  points: number;
  created_at: string;
  related_id?: string | null;
};

const VERIFIED_EVENT_TYPES = new Set(['source_used_in_verified_claim', 'claim_verified_from_contribution', 'source_linked_verified_claim']);
const ACCEPTED_EVENT_TYPES = new Set(['source_accepted', 'source_admin_accepted', 'topic_accepted', 'hallucination_report_accepted', 'hallucination_accepted']);
const REJECTED_EVENT_TYPES = new Set(['source_spam_rejected', 'rejected', 'spam']);

function mapStatus(status?: string | null): ReceiptStatus {
  if (!status) return 'pending';
  if (['published', 'accepted', 'approved'].includes(status)) return 'accepted';
  if (['hidden', 'deleted', 'spam', 'rejected', 'duplicate', 'spam_suspected'].includes(status)) return 'rejected';
  if (['verified-linked', 'verified_linked', 'linked_verified', 'verified'].includes(status)) return 'verified-linked';
  return 'pending';
}

function eventStatus(eventType?: string | null, submissionStatus?: string | null): ReceiptStatus {
  if (eventType && VERIFIED_EVENT_TYPES.has(eventType)) return 'verified-linked';
  if (eventType && ACCEPTED_EVENT_TYPES.has(eventType)) return 'accepted';
  if (eventType && REJECTED_EVENT_TYPES.has(eventType)) return 'rejected';
  return mapStatus(submissionStatus);
}

async function safeSelect<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    console.warn('[contributor-receipt] optional query failed:', error.message);
    return [];
  }
  return data ?? [];
}

export async function getContributorReceipt(sb: SupabaseClient, contributorHash: string) {
  const [sourceSuggestions, topicSuggestions, communityPosts, pointEvents, contributionEvents] = await Promise.all([
    safeSelect(sb.from('source_suggestions').select('id, claim_id, title, url, domain, status, created_at').eq('contributor_hash', contributorHash).order('created_at', { ascending: false }).limit(100)),
    safeSelect(sb.from('topic_suggestions').select('id, question, country, category, status, submitted_at, reviewed_at').eq('contributor_hash', contributorHash).order('submitted_at', { ascending: false }).limit(100)),
    safeSelect(sb.from('community_posts').select('id, document_id, claim_id, content, status, created_at').eq('contributor_hash', contributorHash).order('created_at', { ascending: false }).limit(100)),
    safeSelect(sb.from('contributor_point_events').select('event_type, points, reference_id, reference_type, created_at').eq('contributor_hash', contributorHash).order('created_at', { ascending: false }).limit(500)),
    safeSelect(sb.from('contribution_events').select('id, event_type, points_delta, claim_id, source_candidate_id, metadata, created_at').eq('contributor_hash', contributorHash).order('created_at', { ascending: false }).limit(100)),
  ]);

  const pointsByRef = new Map<string, number>();
  for (const event of pointEvents as Array<{ points?: number; reference_id?: string | null }>) {
    if (!event.reference_id) continue;
    pointsByRef.set(event.reference_id, (pointsByRef.get(event.reference_id) ?? 0) + (event.points ?? 0));
  }
  for (const event of contributionEvents as Array<{ points_delta?: number; source_candidate_id?: string | null }>) {
    if (!event.source_candidate_id) continue;
    pointsByRef.set(event.source_candidate_id, (pointsByRef.get(event.source_candidate_id) ?? 0) + (event.points_delta ?? 0));
  }

  const items: ReceiptItem[] = [];
  for (const s of sourceSuggestions as Array<{ id: string; claim_id: string; title?: string | null; url?: string | null; domain?: string | null; status?: string | null; created_at: string }>) {
    const verifiedLinked = (pointEvents as Array<{ event_type: string; reference_id?: string | null }>).some((e) => e.reference_id === s.id && VERIFIED_EVENT_TYPES.has(e.event_type));
    items.push({ id: s.id, type: 'source_suggestion', title: s.title || s.domain || s.url || 'Source suggestion', detail: s.claim_id ? `claim: ${s.claim_id}` : null, status: verifiedLinked ? 'verified-linked' : mapStatus(s.status), points: pointsByRef.get(s.id) ?? 0, created_at: s.created_at, related_id: s.claim_id });
  }
  for (const t of topicSuggestions as Array<{ id: string; question: string; country?: string | null; category?: string | null; status?: string | null; submitted_at: string }>) {
    items.push({ id: t.id, type: 'topic_suggestion', title: t.question, detail: [t.country, t.category].filter(Boolean).join(' · ') || null, status: mapStatus(t.status), points: pointsByRef.get(t.id) ?? 0, created_at: t.submitted_at, related_id: null });
  }
  for (const p of communityPosts as Array<{ id: string; document_id?: string | null; claim_id?: string | null; content: string; status?: string | null; created_at: string }>) {
    items.push({ id: p.id, type: 'community_post', title: p.content.slice(0, 90), detail: p.claim_id ? `claim: ${p.claim_id}` : p.document_id ? `document: ${p.document_id}` : null, status: mapStatus(p.status), points: pointsByRef.get(p.id) ?? 0, created_at: p.created_at, related_id: p.claim_id ?? p.document_id ?? null });
  }
  for (const e of contributionEvents as Array<{ id: string; event_type: string; points_delta?: number; claim_id?: string | null; source_candidate_id?: string | null; created_at: string }>) {
    if (e.source_candidate_id && items.some((item) => item.id === e.source_candidate_id)) continue;
    items.push({ id: e.id, type: 'contribution_event', title: e.event_type.replace(/_/g, ' '), detail: e.claim_id ? `claim: ${e.claim_id}` : e.source_candidate_id ? `source candidate: ${e.source_candidate_id}` : null, status: eventStatus(e.event_type, null), points: e.points_delta ?? 0, created_at: e.created_at, related_id: e.source_candidate_id ?? e.claim_id ?? null });
  }

  items.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const totals = items.reduce((acc, item) => {
    acc.points += item.points;
    acc[item.status] += 1;
    return acc;
  }, { points: 0, pending: 0, accepted: 0, rejected: 0, 'verified-linked': 0 } as Record<ReceiptStatus | 'points', number>);

  return { contributor_hash: contributorHash, totals, items, privacy: { raw_ip_stored: false, message: 'For-Ai never stores or exposes raw IP addresses for public submissions. This receipt is keyed only by contributor_hash.' } };
}
