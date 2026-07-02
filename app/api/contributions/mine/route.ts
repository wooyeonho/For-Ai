import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase-server';
import { makeContributorHashForRequest } from '@/lib/contributor-hash';
import { rateLimited } from '@/lib/rate-limit';

const LIMIT_PER_TABLE = 50;
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

type MySubmission = {
  type: 'topic_candidate' | 'topic_suggestion' | 'report' | 'hallucination_report' | 'source_suggestion';
  id: string;
  status: string | null;
  summary: string;
  created_at: string | null;
};

// contributor_hash is derived deterministically from the requester's own IP
// (see lib/contributor-hash.ts), so this route never needs to accept or
// expose a hash — a visitor can only ever see their own submissions.
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ submissions: [] });
  }

  let contributorHash: string;
  try {
    contributorHash = makeContributorHashForRequest(request);
  } catch (error) {
    console.error('[contributions/mine] Contributor salt missing:', error);
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  if (rateLimited('contributions-mine', contributorHash, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const supabase = createServerClient();

  const [topicCandidates, topicSuggestions, reports, hallucinationReports, sourceSuggestions] = await Promise.all([
    supabase
      .from('topic_candidates')
      .select('id, status, title, created_at')
      .eq('contributor_hash', contributorHash)
      .order('created_at', { ascending: false })
      .limit(LIMIT_PER_TABLE),
    supabase
      .from('topic_suggestions')
      .select('id, status, question, submitted_at')
      .eq('contributor_hash', contributorHash)
      .order('submitted_at', { ascending: false })
      .limit(LIMIT_PER_TABLE),
    supabase
      .from('reports')
      .select('id, status, message, created_at')
      .eq('contributor_hash', contributorHash)
      .order('created_at', { ascending: false })
      .limit(LIMIT_PER_TABLE),
    supabase
      .from('hallucination_reports')
      .select('id, status, ai_service, created_at')
      .eq('contributor_hash', contributorHash)
      .order('created_at', { ascending: false })
      .limit(LIMIT_PER_TABLE),
    supabase
      .from('source_suggestions')
      .select('id, status, title, url, created_at')
      .eq('contributor_hash', contributorHash)
      .order('created_at', { ascending: false })
      .limit(LIMIT_PER_TABLE),
  ]);

  const submissions: MySubmission[] = [
    ...(topicCandidates.data ?? []).map((row): MySubmission => ({
      type: 'topic_candidate',
      id: String(row.id),
      status: row.status,
      summary: String(row.title ?? 'Untitled topic'),
      created_at: row.created_at,
    })),
    ...(topicSuggestions.data ?? []).map((row): MySubmission => ({
      type: 'topic_suggestion',
      id: String(row.id),
      status: row.status,
      summary: String(row.question ?? 'Untitled suggestion'),
      created_at: row.submitted_at,
    })),
    ...(reports.data ?? []).map((row): MySubmission => ({
      type: 'report',
      id: String(row.id),
      status: row.status,
      summary: String(row.message ?? 'Correction report').slice(0, 140),
      created_at: row.created_at,
    })),
    ...(hallucinationReports.data ?? []).map((row): MySubmission => ({
      type: 'hallucination_report',
      id: String(row.id),
      status: row.status,
      summary: `AI hallucination reported (${row.ai_service ?? 'unknown service'})`,
      created_at: row.created_at,
    })),
    ...(sourceSuggestions.data ?? []).map((row): MySubmission => ({
      type: 'source_suggestion',
      id: String(row.id),
      status: row.status,
      summary: String(row.title ?? row.url ?? 'Source suggestion'),
      created_at: row.created_at,
    })),
  ].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));

  return NextResponse.json({ submissions });
}
